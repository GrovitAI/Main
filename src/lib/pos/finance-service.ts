/**
 * Finance module — Supabase service layer.
 *
 * Follows settlement-service.ts: every function is try/catch, returns
 * ServiceResult<T>, never leaks raw Supabase errors, and scopes every query by
 * tenant_id and branch_id from tenant-context.ts.
 *
 * Schema tolerance: the proposed migration
 * (supabase/migrations/20260907010000_finance_module.sql) may not be applied
 * yet. detectFinanceSchema() probes what exists and the read paths fall back
 * to client-side aggregation over base columns, so the module works today and
 * simply gets faster/more complete once the migration runs.
 */
import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import { useSessionStore } from './use-session-store';
import { getBusinessDayBounds, getBusinessDate, DEFAULT_BUSINESS_DAY_CONFIG } from './reporting-utils';
import type {
  CategorySpend,
  DayCloseComputation,
  DayClosure,
  DayClosureInput,
  FinanceDailyPoint,
  FinanceFilters,
  FinanceSchemaStatus,
  FinanceSummary,
  LedgerEntry,
  PaymentSplitEntry,
  ServiceResult,
} from './finance-types';
import {
  addDays,
  buildDailySeries,
  computeCashVariance,
  computeExpectedCash,
  emptyFinanceSummary,
  fromPaise,
  toPaise,
} from './finance-utils';

// ─── Internal helpers ─────────────────────────────────────────────────────────

type PgError = { code?: string; message?: string } | null;

const isMissingTable = (e: PgError): boolean => e?.code === 'PGRST205' || e?.code === '42P01';
const isMissingFunction = (e: PgError): boolean => e?.code === 'PGRST202' || e?.code === '42883';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function currentStaffId(): string | null {
  return useSessionStore.getState().session?.staffId ?? null;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Scope = {
  tenant_id: string;
  /** null = every branch (the owner's "All branches"). */
  branch_id: string | null;
  /** Branch new rows are written to. */
  writeBranchId: string;
  isOwnerOrAdmin: boolean;
};

/**
 * Everyone but the owner is pinned to their own branch regardless of what the
 * UI asks for; the owner may pick a branch or see all. An admin keeps the
 * owner-level permissions inside their branch (isOwnerOrAdmin) but not the
 * view across branches.
 */
function resolveScope(requestedBranchId: string | null | undefined): Scope {
  const ctx = getTenantContext();
  if (ctx.canViewAllBranches) {
    return {
      tenant_id: ctx.tenant_id,
      branch_id: requestedBranchId ?? null,
      writeBranchId: requestedBranchId ?? ctx.branch_id,
      isOwnerOrAdmin: true,
    };
  }
  return {
    tenant_id: ctx.tenant_id,
    branch_id: ctx.branch_id,
    writeBranchId: ctx.branch_id,
    isOwnerOrAdmin: ctx.isOwnerOrAdmin,
  };
}

type PageFetcher = (from: number, to: number) => Promise<{ data: unknown; error: PgError }>;

const PAGE_SIZE = 1000;
const MAX_FALLBACK_ROWS = 20000;

/** Pages through PostgREST results (1,000-row cap) until exhausted. */
async function fetchAllRows(fetcher: PageFetcher): Promise<{ rows: Record<string, unknown>[]; error: PgError }> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  while (from < MAX_FALLBACK_ROWS) {
    const { data, error } = await fetcher(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    const batch = asRecords(data);
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { rows, error: null };
}

// ─── Schema detection ─────────────────────────────────────────────────────────

let schemaCache: FinanceSchemaStatus | null = null;

async function probeColumn(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column, { head: true, count: 'exact' }).limit(1);
  return !error;
}

export async function detectFinanceSchema(force = false): Promise<FinanceSchemaStatus> {
  if (schemaCache && !force) return schemaCache;
  try {
    const { tenant_id } = getTenantContext();
    const probeTs = new Date(0).toISOString();
    const [dayClosuresTable, refundsExtended, rpcProbe] = await Promise.all([
      probeColumn('finance_day_closures', 'id'),
      probeColumn('refunds', 'amount'),
      supabase.rpc('get_finance_summary', {
        p_tenant_id: tenant_id,
        p_branch_id: null,
        p_start_ts: probeTs,
        p_end_ts: probeTs,
        p_start_date: '1970-01-01',
        p_end_date: '1970-01-01',
      }),
    ]);
    schemaCache = {
      dayClosuresTable,
      refundsExtended,
      summaryRpc: !rpcProbe.error,
    };
  } catch {
    // A probe that failed (no session yet, network down) must NOT be cached:
    // caching it would pin the module in degraded mode for the whole app run.
    return {
      dayClosuresTable: false,
      refundsExtended: false,
      summaryRpc: false,
    };
  }
  return schemaCache;
}

export function getCachedFinanceSchema(): FinanceSchemaStatus | null {
  return schemaCache;
}

// ─── Overview (summary + daily series) ────────────────────────────────────────

export type FinanceOverview = {
  summary: FinanceSummary;
  series: FinanceDailyPoint[];
  /** true when computed client-side because the RPCs are not installed. */
  degraded: boolean;
};

function mapSummary(raw: unknown): FinanceSummary {
  const base = emptyFinanceSummary();
  if (!isRecord(raw)) return base;
  const paymentSplit: PaymentSplitEntry[] = asRecords(raw.paymentSplit).map((p) => ({
    payment_type: toText(p.payment_type, 'other').toLowerCase(),
    total: toNumber(p.total),
    count: toNumber(p.count),
  }));
  const expensesByCategory: CategorySpend[] = asRecords(raw.expensesByCategory).map((c) => ({
    category: toText(c.category, 'Uncategorised') || 'Uncategorised',
    total: toNumber(c.total),
    count: toNumber(c.count),
  }));
  return {
    grossSales: toNumber(raw.grossSales),
    billCount: toNumber(raw.billCount),
    collectedRevenue: toNumber(raw.collectedRevenue),
    pendingCollections: toNumber(raw.pendingCollections),
    taxCollected: toNumber(raw.taxCollected),
    discountsGiven: toNumber(raw.discountsGiven),
    complimentaryValue: toNumber(raw.complimentaryValue),
    refundsTotal: toNumber(raw.refundsTotal),
    refundsCount: toNumber(raw.refundsCount),
    expensesTotal: toNumber(raw.expensesTotal),
    expensesCount: toNumber(raw.expensesCount),
    otherIncome: toNumber(raw.otherIncome),
    otherIncomeCount: toNumber(raw.otherIncomeCount),
    suppliesFromKitchen: toNumber(raw.suppliesFromKitchen),
    purchasesTotal: toNumber(raw.purchasesTotal),
    purchasesCount: toNumber(raw.purchasesCount),
    cashIn: toNumber(raw.cashIn),
    cashOut: toNumber(raw.cashOut),
    paymentSplit,
    expensesByCategory,
  };
}

function mapSeries(raw: unknown): FinanceDailyPoint[] {
  return asRecords(raw).map((p) => ({
    date: toText(p.date).slice(0, 10),
    revenue: toNumber(p.revenue),
    orders: toNumber(p.orders),
    expenses: toNumber(p.expenses),
    net: toNumber(p.net),
  }));
}

async function fetchOverviewViaRpc(scope: Scope, filters: FinanceFilters, startTs: string, endTs: string): Promise<ServiceResult<FinanceOverview>> {
  const params = {
    p_tenant_id: scope.tenant_id,
    p_branch_id: scope.branch_id,
    p_start_ts: startTs,
    p_end_ts: endTs,
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
  };
  const [summaryRes, seriesRes] = await Promise.all([
    supabase.rpc('get_finance_summary', params),
    supabase.rpc('get_finance_daily_series', { ...params, p_timezone: DEFAULT_BUSINESS_DAY_CONFIG.timezone }),
  ]);
  if (summaryRes.error) {
    if (isMissingFunction(summaryRes.error)) return { data: null, error: 'RPC_MISSING' };
    return { data: null, error: 'Unable to load the finance summary.' };
  }
  if (seriesRes.error) {
    if (isMissingFunction(seriesRes.error)) return { data: null, error: 'RPC_MISSING' };
    return { data: null, error: 'Unable to load the daily finance trend.' };
  }
  return {
    data: { summary: mapSummary(summaryRes.data), series: mapSeries(seriesRes.data), degraded: false },
    error: null,
  };
}

type BillLite = {
  id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  is_comp: boolean;
  settled_at: string | null;
  created_at: string;
};

async function fetchBillsInRange(scope: Scope, startTs: string, endTs: string): Promise<{ bills: BillLite[]; error: PgError }> {
  const { rows, error } = await fetchAllRows(async (from, to) => {
    let q = supabase
      .from('bills')
      .select('id, status, payment_status, total_amount, subtotal, tax_amount, discount_amount, discount_type, discount_value, settled_at, created_at')
      .eq('tenant_id', scope.tenant_id)
      .or(
        `and(status.eq.paid,settled_at.gte.${startTs},settled_at.lt.${endTs}),and(status.neq.paid,created_at.gte.${startTs},created_at.lt.${endTs})`,
      )
      .order('created_at', { ascending: true })
      .range(from, to);
    if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
    const res = await q;
    return { data: res.data, error: res.error };
  });
  const bills: BillLite[] = rows.map((r) => {
    const status = toText(r.status);
    return {
      id: toText(r.id),
      status,
      payment_status: toText(r.payment_status),
      total_amount: toNumber(r.total_amount),
      subtotal: toNumber(r.subtotal),
      tax_amount: toNumber(r.tax_amount),
      discount_amount: toNumber(r.discount_amount),
      is_comp: status === 'paid' && toText(r.discount_type) === 'percent' && toNumber(r.discount_value) === 100,
      settled_at: toStringOrNull(r.settled_at),
      created_at: toText(r.created_at),
    };
  });
  return { bills, error };
}

type SettlementLite = { bill_id: string; payment_type: string; amount: number; created_at: string };

async function fetchSettlementsForBills(scope: Scope, billIds: readonly string[]): Promise<{ settlements: SettlementLite[]; error: PgError }> {
  const settlements: SettlementLite[] = [];
  for (const ids of chunk(billIds, 200)) {
    let q = supabase
      .from('settlements')
      .select('bill_id, payment_type, amount, created_at')
      .eq('tenant_id', scope.tenant_id)
      .in('bill_id', ids);
    if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
    const { data, error } = await q;
    if (error) return { settlements, error };
    for (const r of asRecords(data)) {
      settlements.push({
        bill_id: toText(r.bill_id),
        payment_type: toText(r.payment_type, 'other').toLowerCase(),
        amount: toNumber(r.amount),
        created_at: toText(r.created_at),
      });
    }
  }
  return { settlements, error: null };
}

// ─── Ledger money (finance_entries) ──────────────────────────────────────────
// The Overview, the Cash Book and Day Close read the same rows the Ledger tab
// shows, so the three can never disagree about what was spent.

/** One recorded income or expense entry, placed against the branch accounts in view. */
type LedgerMoney = {
  id: string;
  kind: 'income' | 'expense';
  amount: number;
  /** 'cash' | 'bank' | 'offset' */
  mode: string;
  /** YYYY-MM-DD transaction date. */
  date: string;
  particulars: string;
  counterparty: string | null;
  reference_no: string | null;
  entered_at: string;
  category: string;
  /** A built-in category (Opening Balance, Partners): never profit or loss. */
  system: boolean;
  /** The Opening Balance category: seeds a balance, moves nothing. */
  opening: boolean;
  /** The entry is for one of the accounts in view: that branch's cost or income. */
  forScope: boolean;
  /** The money left or reached one of the accounts in view. */
  movedInScope: boolean;
  /** With one of our own accounts on the other side: internal when every branch is in view. */
  internal: boolean;
};

/** The finance accounts of the branch in view, or of every branch. */
async function fetchScopeAccountIds(scope: Scope): Promise<{ ids: string[]; error: PgError }> {
  let q = supabase.from('finance_accounts').select('id').eq('tenant_id', scope.tenant_id).eq('kind', 'branch');
  if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
  const { data, error } = await q;
  if (error) return { ids: [], error };
  return { ids: asRecords(data).map((r) => toText(r.id)).filter((id) => id.length > 0), error: null };
}

async function fetchLedgerMoneyInRange(scope: Scope, startDate: string, endDate: string): Promise<{ rows: LedgerMoney[]; accountIds: string[]; error: PgError }> {
  const accounts = await fetchScopeAccountIds(scope);
  if (accounts.error) {
    // A database from before the ledger has no accounts: nothing was recorded.
    if (isMissingTable(accounts.error)) return { rows: [], accountIds: [], error: null };
    return { rows: [], accountIds: [], error: accounts.error };
  }
  if (accounts.ids.length === 0) return { rows: [], accountIds: [], error: null };
  const inScope = new Set(accounts.ids);
  const idList = accounts.ids.join(',');

  const catalogRes = await supabase
    .from('finance_catalog')
    .select('id, name, is_system, system_key')
    .eq('tenant_id', scope.tenant_id)
    .eq('level', 'category');
  if (catalogRes.error) return { rows: [], accountIds: accounts.ids, error: catalogRes.error };
  const categories = new Map<string, { name: string; system: boolean; opening: boolean }>();
  for (const c of asRecords(catalogRes.data)) {
    const name = toText(c.name).trim();
    categories.set(toText(c.id), {
      name: name || 'Uncategorised',
      system: c.is_system === true,
      opening: toText(c.system_key) === 'opening_balance' || (c.is_system === true && name.toLowerCase() === 'opening balance'),
    });
  }

  const { rows, error } = await fetchAllRows(async (from, to) => {
    const res = await supabase
      .from('finance_entries')
      .select('id, account_id, paid_from_account_id, counterparty_account_id, kind, mode, amount_paise, transaction_date, particulars, counterparty, reference_no, entered_at, category_id')
      .eq('tenant_id', scope.tenant_id)
      .eq('status', 'recorded')
      .in('kind', ['income', 'expense'])
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .or(`account_id.in.(${idList}),paid_from_account_id.in.(${idList})`)
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);
    return { data: res.data, error: res.error };
  });
  if (error) return { rows: [], accountIds: accounts.ids, error };

  const money: LedgerMoney[] = rows.map((r) => {
    const accountId = toText(r.account_id);
    const payingId = toStringOrNull(r.paid_from_account_id) ?? accountId;
    const category = categories.get(toText(r.category_id));
    return {
      id: toText(r.id),
      kind: toText(r.kind) === 'income' ? 'income' : 'expense',
      amount: fromPaise(toNumber(r.amount_paise)),
      mode: toText(r.mode, 'cash').toLowerCase(),
      date: toText(r.transaction_date).slice(0, 10),
      particulars: toText(r.particulars),
      counterparty: toStringOrNull(r.counterparty),
      reference_no: toStringOrNull(r.reference_no),
      entered_at: toText(r.entered_at),
      category: category?.name ?? 'Uncategorised',
      system: category?.system ?? false,
      opening: category?.opening ?? false,
      forScope: inScope.has(accountId),
      movedInScope: inScope.has(payingId),
      internal: toStringOrNull(r.counterparty_account_id) !== null,
    };
  });
  return { rows: money, accountIds: accounts.ids, error: null };
}

/** Goods billed to the branch in view by another of our accounts, in rupees. */
async function fetchSuppliesFromKitchen(scope: Scope, accountIds: readonly string[], startDate: string, endDate: string): Promise<{ total: number; error: PgError }> {
  if (!scope.branch_id || accountIds.length === 0) return { total: 0, error: null };
  const { rows, error } = await fetchAllRows(async (from, to) => {
    const res = await supabase
      .from('finance_entries')
      .select('amount_paise')
      .eq('tenant_id', scope.tenant_id)
      .eq('kind', 'receivable')
      .in('status', ['open', 'settled'])
      .in('counterparty_account_id', [...accountIds])
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('id', { ascending: true })
      .range(from, to);
    return { data: res.data, error: res.error };
  });
  if (error) return { total: 0, error };
  let paise = 0;
  for (const r of rows) paise += toNumber(r.amount_paise);
  return { total: fromPaise(paise), error: null };
}

type RefundLite = { amount: number; refund_method: string; created_at: string; bill_id: string | null; reason: string | null; id: string };

async function fetchRefundsInRange(scope: Scope, startTs: string, endTs: string): Promise<{ refunds: RefundLite[]; error: PgError }> {
  const { rows, error } = await fetchAllRows(async (from, to) => {
    let q = supabase
      .from('refunds')
      .select('id, bill_id, amount, refund_method, reason, status, created_at')
      .eq('tenant_id', scope.tenant_id)
      .eq('status', 'completed')
      .gte('created_at', startTs)
      .lt('created_at', endTs)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
    const res = await q;
    return { data: res.data, error: res.error };
  });
  return {
    refunds: rows.map((r) => ({
      id: toText(r.id),
      bill_id: toStringOrNull(r.bill_id),
      amount: toNumber(r.amount),
      refund_method: toText(r.refund_method, 'cash').toLowerCase(),
      reason: toStringOrNull(r.reason),
      created_at: toText(r.created_at),
    })),
    error,
  };
}

async function fetchPurchasesInRange(scope: Scope, startDate: string, endDate: string): Promise<{ total: number; count: number; error: PgError }> {
  const { rows, error } = await fetchAllRows(async (from, to) => {
    let q = supabase
      .from('inventory_purchase_headers')
      .select('grand_total, status')
      .eq('tenant_id', scope.tenant_id)
      .gte('purchase_date', startDate)
      .lt('purchase_date', addDays(endDate, 1))
      .range(from, to);
    if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
    const res = await q;
    return { data: res.data, error: res.error };
  });
  if (error) {
    // Purchases are optional context for finance; a missing inventory module must not block the screen.
    if (isMissingTable(error)) return { total: 0, count: 0, error: null };
    return { total: 0, count: 0, error };
  }
  const live = rows.filter((r) => toText(r.status) !== 'cancelled');
  let paise = 0;
  for (const r of live) paise += toPaise(toNumber(r.grand_total));
  return { total: fromPaise(paise), count: live.length, error: null };
}

async function fetchOverviewFallback(scope: Scope, filters: FinanceFilters, startTs: string, endTs: string, schema: FinanceSchemaStatus): Promise<ServiceResult<FinanceOverview>> {
  const { bills, error: billsError } = await fetchBillsInRange(scope, startTs, endTs);
  if (billsError) return { data: null, error: 'Unable to load bills for the finance summary.' };

  const paidBills = bills.filter((b) => b.status === 'paid' && !b.is_comp);
  const settledAtByBill = new Map(paidBills.map((b) => [b.id, b.settled_at ?? b.created_at]));

  const [{ settlements, error: settlementsError }, ledgerMoney, purchases, refundsResult] = await Promise.all([
    fetchSettlementsForBills(scope, paidBills.map((b) => b.id)),
    fetchLedgerMoneyInRange(scope, filters.startDate, filters.endDate),
    fetchPurchasesInRange(scope, filters.startDate, filters.endDate),
    schema.refundsExtended ? fetchRefundsInRange(scope, startTs, endTs) : Promise.resolve({ refunds: [] as RefundLite[], error: null as PgError }),
  ]);
  if (settlementsError) return { data: null, error: 'Unable to load settlements for the finance summary.' };
  if (ledgerMoney.error) return { data: null, error: 'Unable to load expenses.' };
  if (purchases.error) return { data: null, error: 'Unable to load purchase spend.' };
  if (refundsResult.error) return { data: null, error: 'Unable to load refunds.' };
  const supplies = await fetchSuppliesFromKitchen(scope, ledgerMoney.accountIds, filters.startDate, filters.endDate);
  if (supplies.error) return { data: null, error: 'Unable to load the supplies billed by the kitchen.' };

  // With every branch in view, income from one of our own accounts is internal.
  const allBranches = scope.branch_id === null;
  const expenses = ledgerMoney.rows.filter((r) => r.kind === 'expense' && r.forScope && !r.system);
  const otherIncome = ledgerMoney.rows.filter((r) => r.kind === 'income' && r.forScope && !r.system && !(allBranches && r.internal));
  const cashMoves = ledgerMoney.rows.filter((r) => r.mode === 'cash' && r.movedInScope && !r.opening);

  const summary = emptyFinanceSummary();
  let grossPaise = 0;
  let taxPaise = 0;
  let discountPaise = 0;
  let compPaise = 0;
  let pendingPaise = 0;
  for (const b of bills) {
    if (b.status === 'paid' && !b.is_comp) {
      grossPaise += toPaise(b.total_amount);
      taxPaise += toPaise(b.tax_amount);
      discountPaise += toPaise(b.discount_amount);
      summary.billCount += 1;
    }
    if (b.is_comp) compPaise += toPaise(b.subtotal);
    if (b.status !== 'cancelled' && b.payment_status === 'unpaid') pendingPaise += toPaise(b.total_amount);
  }
  summary.grossSales = fromPaise(grossPaise);
  summary.taxCollected = fromPaise(taxPaise);
  summary.discountsGiven = fromPaise(discountPaise);
  summary.complimentaryValue = fromPaise(compPaise);
  summary.pendingCollections = fromPaise(pendingPaise);

  const splitMap = new Map<string, { paise: number; count: number }>();
  let collectedPaise = 0;
  let cashInPaise = 0;
  for (const s of settlements) {
    const entry = splitMap.get(s.payment_type) ?? { paise: 0, count: 0 };
    const paise = toPaise(s.amount);
    entry.paise += paise;
    entry.count += 1;
    splitMap.set(s.payment_type, entry);
    collectedPaise += paise;
    if (s.payment_type === 'cash') cashInPaise += paise;
  }
  summary.collectedRevenue = fromPaise(collectedPaise);
  summary.cashIn = fromPaise(cashInPaise);
  summary.paymentSplit = [...splitMap.entries()]
    .filter(([, v]) => v.paise > 0)
    .map(([payment_type, v]) => ({ payment_type, total: fromPaise(v.paise), count: v.count }))
    .sort((a, b) => b.total - a.total);

  const categoryMap = new Map<string, { paise: number; count: number }>();
  let expensesPaise = 0;
  for (const e of expenses) {
    const paise = toPaise(e.amount);
    expensesPaise += paise;
    const entry = categoryMap.get(e.category) ?? { paise: 0, count: 0 };
    entry.paise += paise;
    entry.count += 1;
    categoryMap.set(e.category, entry);
  }
  let cashOutPaise = 0;
  let cashIncomePaise = 0;
  for (const m of cashMoves) {
    if (m.kind === 'expense') cashOutPaise += toPaise(m.amount);
    else if (!(allBranches && m.internal)) cashIncomePaise += toPaise(m.amount);
  }
  let otherIncomePaise = 0;
  for (const i of otherIncome) otherIncomePaise += toPaise(i.amount);
  summary.cashIn = fromPaise(cashInPaise + cashIncomePaise);
  summary.otherIncome = fromPaise(otherIncomePaise);
  summary.otherIncomeCount = otherIncome.length;
  summary.suppliesFromKitchen = supplies.total;
  summary.expensesTotal = fromPaise(expensesPaise);
  summary.expensesCount = expenses.length;
  summary.expensesByCategory = [...categoryMap.entries()]
    .map(([category, v]) => ({ category, total: fromPaise(v.paise), count: v.count }))
    .sort((a, b) => b.total - a.total);

  let refundPaise = 0;
  let cashRefundPaise = 0;
  for (const r of refundsResult.refunds) {
    refundPaise += toPaise(r.amount);
    if (r.refund_method === 'cash') cashRefundPaise += toPaise(r.amount);
  }
  summary.refundsTotal = fromPaise(refundPaise);
  summary.refundsCount = refundsResult.refunds.length;
  summary.cashOut = fromPaise(cashOutPaise + cashRefundPaise);

  summary.purchasesTotal = purchases.total;
  summary.purchasesCount = purchases.count;

  const series = buildDailySeries(
    settlements.map((s) => ({
      bill_id: s.bill_id,
      payment_type: s.payment_type,
      amount: s.amount,
      occurred_at: settledAtByBill.get(s.bill_id) ?? s.created_at,
    })),
    expenses.map((e) => ({ expense_date: e.date, amount: e.amount, status: 'recorded' })),
    filters.startDate,
    filters.endDate,
    otherIncome.map((i) => ({ income_date: i.date, amount: i.amount })),
  );

  return { data: { summary, series, degraded: true }, error: null };
}

/**
 * KPIs + daily trend for the Overview tab. Uses the finance RPCs when they are
 * installed; otherwise aggregates client-side with paging (accurate, slower).
 */
export async function fetchFinanceOverview(filters: FinanceFilters): Promise<ServiceResult<FinanceOverview>> {
  try {
    const scope = resolveScope(filters.branchId);
    const schema = await detectFinanceSchema();
    const { startTimestamp, endTimestamp } = getBusinessDayBounds('custom', filters.startDate, filters.endDate);

    if (schema.summaryRpc) {
      const viaRpc = await fetchOverviewViaRpc(scope, filters, startTimestamp, endTimestamp);
      if (viaRpc.error !== 'RPC_MISSING') return viaRpc;
      schemaCache = { ...schema, summaryRpc: false };
    }
    return await fetchOverviewFallback(scope, filters, startTimestamp, endTimestamp, schemaCache ?? schema);
  } catch {
    return { data: null, error: 'Unable to load the finance overview.' };
  }
}

// ─── Cash book / ledger ───────────────────────────────────────────────────────

const LEDGER_SETTLEMENT_LIMIT = 1000;

/**
 * Chronological money movements in range: settlements (in), the ledger's
 * income (in) and expenses (out) that moved cash or bank in the accounts in
 * view, and completed refunds (out). Zero-amount settlements (complimentary
 * bills), offsets and opening balances are omitted because they move no money.
 */
export async function fetchLedger(filters: FinanceFilters): Promise<ServiceResult<LedgerEntry[]>> {
  try {
    const scope = resolveScope(filters.branchId);
    const schema = await detectFinanceSchema();
    const { startTimestamp, endTimestamp } = getBusinessDayBounds('custom', filters.startDate, filters.endDate);

    let settlementsQuery = supabase
      .from('settlements')
      .select('id, bill_id, payment_type, amount, reference_no, created_at')
      .eq('tenant_id', scope.tenant_id)
      .gte('created_at', startTimestamp)
      .lt('created_at', endTimestamp)
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .limit(LEDGER_SETTLEMENT_LIMIT);
    if (scope.branch_id) settlementsQuery = settlementsQuery.eq('branch_id', scope.branch_id);

    const [settlementsRes, ledgerMoney, refundsResult] = await Promise.all([
      settlementsQuery,
      fetchLedgerMoneyInRange(scope, filters.startDate, filters.endDate),
      schema.refundsExtended ? fetchRefundsInRange(scope, startTimestamp, endTimestamp) : Promise.resolve({ refunds: [] as RefundLite[], error: null as PgError }),
    ]);
    if (settlementsRes.error) return { data: null, error: 'Unable to load settlements for the cash book.' };
    if (ledgerMoney.error) return { data: null, error: 'Unable to load the ledger for the cash book.' };
    if (refundsResult.error) return { data: null, error: 'Unable to load refunds for the cash book.' };

    const settlementRows = asRecords(settlementsRes.data);
    const billIds = [...new Set(settlementRows.map((r) => toText(r.bill_id)).filter((id) => id.length > 0))];
    const invoiceByBill = new Map<string, string | null>();
    for (const ids of chunk(billIds, 200)) {
      const { data, error } = await supabase
        .from('bills')
        .select('id, invoice_number')
        .eq('tenant_id', scope.tenant_id)
        .in('id', ids);
      if (error) return { data: null, error: 'Unable to load bill references for the cash book.' };
      for (const b of asRecords(data)) invoiceByBill.set(toText(b.id), toStringOrNull(b.invoice_number));
    }

    const entries: LedgerEntry[] = [];
    for (const r of settlementRows) {
      const createdAt = toText(r.created_at);
      const billId = toText(r.bill_id);
      const invoice = invoiceByBill.get(billId) ?? null;
      entries.push({
        id: `sale:${toText(r.id)}`,
        kind: 'sale',
        occurred_at: createdAt,
        business_date: businessDateOf(createdAt),
        title: invoice ? `Invoice ${invoice}` : 'Sale',
        subtitle: 'Bill settlement',
        payment_method: toText(r.payment_type, 'other').toLowerCase(),
        amount: toNumber(r.amount),
        direction: 'in',
        reference: toStringOrNull(r.reference_no),
      });
    }
    for (const m of ledgerMoney.rows) {
      // Only what moved cash or bank in the accounts in view.
      if (!m.movedInScope || m.opening || m.mode === 'offset') continue;
      entries.push({
        id: `ledger:${m.id}`,
        kind: m.kind,
        occurred_at: m.entered_at,
        business_date: m.date,
        title: m.particulars || m.category,
        subtitle: [m.category, m.counterparty].filter(Boolean).join(' · ') || null,
        payment_method: m.mode,
        amount: m.amount,
        direction: m.kind === 'income' ? 'in' : 'out',
        reference: m.reference_no,
      });
    }
    for (const rf of refundsResult.refunds) {
      entries.push({
        id: `refund:${rf.id}`,
        kind: 'refund',
        occurred_at: rf.created_at,
        business_date: businessDateOf(rf.created_at),
        title: 'Refund',
        subtitle: rf.reason,
        payment_method: rf.refund_method,
        amount: rf.amount,
        direction: 'out',
        reference: rf.bill_id ? invoiceByBill.get(rf.bill_id) ?? null : null,
      });
    }

    entries.sort((a, b) => {
      if (a.business_date !== b.business_date) return a.business_date < b.business_date ? 1 : -1;
      return a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0;
    });
    return { data: entries, error: null };
  } catch {
    return { data: null, error: 'Unable to load the cash book.' };
  }
}

function businessDateOf(iso: string): string {
  return getBusinessDate(iso) || iso.slice(0, 10);
}

// ─── Day close ────────────────────────────────────────────────────────────────

function mapClosure(row: Record<string, unknown>): DayClosure {
  const counted = row.counted_cash === null || row.counted_cash === undefined ? null : toNumber(row.counted_cash);
  const variance = row.variance === null || row.variance === undefined ? null : toNumber(row.variance);
  return {
    id: toText(row.id),
    tenant_id: toText(row.tenant_id),
    branch_id: toText(row.branch_id),
    business_date: toText(row.business_date).slice(0, 10),
    opening_cash: toNumber(row.opening_cash),
    cash_sales: toNumber(row.cash_sales),
    cash_refunds: toNumber(row.cash_refunds),
    cash_expenses: toNumber(row.cash_expenses),
    expected_cash: toNumber(row.expected_cash),
    counted_cash: counted,
    variance,
    notes: toStringOrNull(row.notes),
    status: toText(row.status) === 'closed' ? 'closed' : 'open',
    closed_by: toStringOrNull(row.closed_by),
    closed_at: toStringOrNull(row.closed_at),
    created_at: toText(row.created_at),
    updated_at: toText(row.updated_at),
  };
}

const CLOSURE_COLUMNS = 'id, tenant_id, branch_id, business_date, opening_cash, cash_sales, cash_refunds, cash_expenses, expected_cash, counted_cash, variance, notes, status, closed_by, closed_at, created_at, updated_at';

/** Live cash figures for one business date at one branch. */
export async function computeDayClose(businessDate: string, branchId: string | null): Promise<ServiceResult<DayCloseComputation>> {
  try {
    const scope = resolveScope(branchId);
    const branch = scope.branch_id ?? scope.writeBranchId;
    const schema = await detectFinanceSchema();
    const { startTimestamp, endTimestamp } = getBusinessDayBounds('custom', businessDate, businessDate);

    const settlementsPromise = fetchAllRows(async (from, to) => {
      const res = await supabase
        .from('settlements')
        .select('amount, payment_type')
        .eq('tenant_id', scope.tenant_id)
        .eq('branch_id', branch)
        .ilike('payment_type', 'cash')
        .gte('created_at', startTimestamp)
        .lt('created_at', endTimestamp)
        .range(from, to);
      return { data: res.data, error: res.error };
    });

    // Cash that left this branch's account on the day, whatever it was for: a
    // partner's drawing from the till counts, an opening balance does not.
    const expensesPromise = fetchLedgerMoneyInRange({ ...scope, branch_id: branch }, businessDate, businessDate).then((res) => ({
      rows: res.rows.filter((m) => m.kind === 'expense' && m.mode === 'cash' && m.movedInScope && !m.opening),
      error: res.error,
    }));

    const refundsPromise = schema.refundsExtended
      ? fetchAllRows(async (from, to) => {
          const res = await supabase
            .from('refunds')
            .select('amount, refund_method')
            .eq('tenant_id', scope.tenant_id)
            .eq('branch_id', branch)
            .eq('status', 'completed')
            .eq('refund_method', 'cash')
            .gte('created_at', startTimestamp)
            .lt('created_at', endTimestamp)
            .range(from, to);
          return { data: res.data, error: res.error };
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[], error: null as PgError });

    const [settlements, expenses, refunds] = await Promise.all([settlementsPromise, expensesPromise, refundsPromise]);
    if (settlements.error) return { data: null, error: 'Unable to load cash sales for this day.' };
    if (expenses.error) return { data: null, error: 'Unable to load cash expenses for this day.' };
    if (refunds.error) return { data: null, error: 'Unable to load cash refunds for this day.' };

    let salesPaise = 0;
    for (const r of settlements.rows) salesPaise += toPaise(toNumber(r.amount));
    let expensesPaise = 0;
    for (const r of expenses.rows) expensesPaise += toPaise(toNumber(r.amount));
    let refundsPaise = 0;
    for (const r of refunds.rows) refundsPaise += toPaise(toNumber(r.amount));

    return {
      data: {
        business_date: businessDate,
        cashSales: fromPaise(salesPaise),
        cashRefunds: fromPaise(refundsPaise),
        cashExpenses: fromPaise(expensesPaise),
        cashSettlementCount: settlements.rows.length,
        cashExpenseCount: expenses.rows.length,
      },
      error: null,
    };
  } catch {
    return { data: null, error: 'Unable to compute the day close.' };
  }
}

export async function fetchDayClosure(businessDate: string, branchId: string | null): Promise<ServiceResult<DayClosure | null>> {
  try {
    const scope = resolveScope(branchId);
    const branch = scope.branch_id ?? scope.writeBranchId;
    const schema = await detectFinanceSchema();
    if (!schema.dayClosuresTable) return { data: null, error: null };

    const { data, error } = await supabase
      .from('finance_day_closures')
      .select(CLOSURE_COLUMNS)
      .eq('tenant_id', scope.tenant_id)
      .eq('branch_id', branch)
      .eq('business_date', businessDate)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) {
        schemaCache = { ...schema, dayClosuresTable: false };
        return { data: null, error: null };
      }
      return { data: null, error: 'Unable to load the day close record.' };
    }
    return { data: isRecord(data) ? mapClosure(data) : null, error: null };
  } catch {
    return { data: null, error: 'Unable to load the day close record.' };
  }
}

export async function fetchRecentDayClosures(branchId: string | null, limit = 14): Promise<ServiceResult<DayClosure[]>> {
  try {
    const scope = resolveScope(branchId);
    const schema = await detectFinanceSchema();
    if (!schema.dayClosuresTable) return { data: [], error: null };

    let q = supabase
      .from('finance_day_closures')
      .select(CLOSURE_COLUMNS)
      .eq('tenant_id', scope.tenant_id)
      .order('business_date', { ascending: false })
      .limit(Math.max(1, Math.min(60, limit)));
    if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
    const { data, error } = await q;
    if (error) return { data: null, error: 'Unable to load recent day closes.' };
    return { data: asRecords(data).map(mapClosure), error: null };
  } catch {
    return { data: null, error: 'Unable to load recent day closes.' };
  }
}

export type DayCloseAction = 'save' | 'close' | 'reopen';

/**
 * Upserts the (tenant, branch, business_date) row. `close` stamps closed_by /
 * closed_at; `reopen` clears them; `save` keeps the row open as a draft.
 */
export async function saveDayClosure(
  input: DayClosureInput,
  computation: DayCloseComputation,
  action: DayCloseAction,
  branchId: string | null,
): Promise<ServiceResult<DayClosure>> {
  try {
    const scope = resolveScope(branchId);
    const branch = scope.branch_id ?? scope.writeBranchId;
    const schema = await detectFinanceSchema();
    if (!schema.dayClosuresTable) {
      return { data: null, error: 'Day close needs the finance schema migration to be applied first.' };
    }
    if (action === 'close' && input.counted_cash === null) {
      return { data: null, error: 'Enter the counted cash before closing the day.' };
    }

    const expected = computeExpectedCash(input.opening_cash, computation);
    const variance = computeCashVariance(expected, input.counted_cash);
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      tenant_id: scope.tenant_id,
      branch_id: branch,
      business_date: input.business_date,
      opening_cash: input.opening_cash,
      cash_sales: computation.cashSales,
      cash_refunds: computation.cashRefunds,
      cash_expenses: computation.cashExpenses,
      expected_cash: expected,
      counted_cash: input.counted_cash,
      variance,
      notes: input.notes,
      status: action === 'close' ? 'closed' : 'open',
      closed_by: action === 'close' ? currentStaffId() : null,
      closed_at: action === 'close' ? now : null,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('finance_day_closures')
      .upsert(payload, { onConflict: 'tenant_id,branch_id,business_date' })
      .select(CLOSURE_COLUMNS)
      .single();
    if (error || !isRecord(data)) return { data: null, error: 'Unable to save the day close.' };
    return { data: mapClosure(data), error: null };
  } catch {
    return { data: null, error: 'Unable to save the day close.' };
  }
}
