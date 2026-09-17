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
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpenseListFilters,
  ExpensePage,
  FinanceDailyPoint,
  FinanceFilters,
  FinanceSchemaStatus,
  FinanceSummary,
  LedgerEntry,
  PaymentSplitEntry,
  ServiceResult,
} from './finance-types';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  addDays,
  buildDailySeries,
  computeCashVariance,
  computeExpectedCash,
  emptyFinanceSummary,
  fromPaise,
  isExpensePaymentMethod,
  toPaise,
} from './finance-utils';

// ─── Internal helpers ─────────────────────────────────────────────────────────

type PgError = { code?: string; message?: string } | null;

const isMissingColumn = (e: PgError): boolean => e?.code === '42703' || e?.code === 'PGRST204';
const isMissingTable = (e: PgError): boolean => e?.code === 'PGRST205' || e?.code === '42P01';
const isMissingFunction = (e: PgError): boolean => e?.code === 'PGRST202' || e?.code === '42883';
const isUniqueViolation = (e: PgError): boolean => e?.code === '23505';

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

/** Escapes a free-text search term for use inside a PostgREST `or()` filter. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%,()"'\\]/g, ' ').trim();
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
    const [expensesExtended, categoriesTable, dayClosuresTable, refundsExtended, rpcProbe] = await Promise.all([
      probeColumn('expenses', 'status'),
      probeColumn('expense_categories', 'id'),
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
      expensesExtended,
      categoriesTable,
      dayClosuresTable,
      refundsExtended,
      summaryRpc: !rpcProbe.error,
    };
  } catch {
    // A probe that failed (no session yet, network down) must NOT be cached:
    // caching it would pin the module in degraded mode for the whole app run.
    return {
      expensesExtended: false,
      categoriesTable: false,
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

// ─── Expense mapping ──────────────────────────────────────────────────────────

const EXPENSE_BASE_COLUMNS = 'id, tenant_id, branch_id, amount, category, description, date, created_by, created_at';
const EXPENSE_EXT_COLUMNS = `${EXPENSE_BASE_COLUMNS}, amount_paise, payment_method, payee, reference_no, notes, receipt_url, status, void_reason, voided_at, updated_at`;

function mapExpense(row: Record<string, unknown>): Expense {
  const amount = toNumber(row.amount);
  const paymentRaw = toText(row.payment_method, 'cash').toLowerCase();
  const statusRaw = toText(row.status, 'recorded');
  return {
    id: toText(row.id),
    tenant_id: toText(row.tenant_id),
    branch_id: toText(row.branch_id),
    amount,
    amount_paise: row.amount_paise === undefined || row.amount_paise === null ? toPaise(amount) : toNumber(row.amount_paise),
    category: toText(row.category, 'Uncategorised') || 'Uncategorised',
    description: toStringOrNull(row.description),
    expense_date: toText(row.date).slice(0, 10),
    payment_method: isExpensePaymentMethod(paymentRaw) ? paymentRaw : 'other',
    payee: toStringOrNull(row.payee),
    reference_no: toStringOrNull(row.reference_no),
    notes: toStringOrNull(row.notes),
    receipt_url: toStringOrNull(row.receipt_url),
    status: statusRaw === 'void' ? 'void' : 'recorded',
    void_reason: toStringOrNull(row.void_reason),
    voided_at: toStringOrNull(row.voided_at),
    created_by: toStringOrNull(row.created_by),
    created_at: toText(row.created_at),
    updated_at: toStringOrNull(row.updated_at),
  };
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

async function fetchExpensesInRange(scope: Scope, startDate: string, endDate: string, extended: boolean): Promise<{ expenses: Expense[]; error: PgError }> {
  const columns = extended ? EXPENSE_EXT_COLUMNS : EXPENSE_BASE_COLUMNS;
  const { rows, error } = await fetchAllRows(async (from, to) => {
    let q = supabase
      .from('expenses')
      .select(columns)
      .eq('tenant_id', scope.tenant_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .range(from, to);
    if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
    if (extended) q = q.eq('status', 'recorded');
    const res = await q;
    return { data: res.data, error: res.error };
  });
  return { expenses: rows.map(mapExpense), error };
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

  const [{ settlements, error: settlementsError }, { expenses, error: expensesError }, purchases, refundsResult] = await Promise.all([
    fetchSettlementsForBills(scope, paidBills.map((b) => b.id)),
    fetchExpensesInRange(scope, filters.startDate, filters.endDate, schema.expensesExtended),
    fetchPurchasesInRange(scope, filters.startDate, filters.endDate),
    schema.refundsExtended ? fetchRefundsInRange(scope, startTs, endTs) : Promise.resolve({ refunds: [] as RefundLite[], error: null as PgError }),
  ]);
  if (settlementsError) return { data: null, error: 'Unable to load settlements for the finance summary.' };
  if (expensesError) return { data: null, error: 'Unable to load expenses.' };
  if (purchases.error) return { data: null, error: 'Unable to load purchase spend.' };
  if (refundsResult.error) return { data: null, error: 'Unable to load refunds.' };

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
  let cashOutPaise = 0;
  for (const e of expenses) {
    const paise = toPaise(e.amount);
    expensesPaise += paise;
    if (e.payment_method === 'cash') cashOutPaise += paise;
    const entry = categoryMap.get(e.category) ?? { paise: 0, count: 0 };
    entry.paise += paise;
    entry.count += 1;
    categoryMap.set(e.category, entry);
  }
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
    expenses.map((e) => ({ expense_date: e.expense_date, amount: e.amount, status: e.status })),
    filters.startDate,
    filters.endDate,
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

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function fetchExpenses(filters: ExpenseListFilters): Promise<ServiceResult<ExpensePage>> {
  try {
    const scope = resolveScope(filters.branchId);
    const schema = await detectFinanceSchema();
    const pageSize = Math.max(1, Math.min(200, filters.pageSize));
    const page = Math.max(0, filters.page);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const run = async (extended: boolean) => {
      let q = supabase
        .from('expenses')
        .select(extended ? EXPENSE_EXT_COLUMNS : EXPENSE_BASE_COLUMNS, { count: 'exact' })
        .eq('tenant_id', scope.tenant_id)
        .gte('date', filters.startDate)
        .lte('date', filters.endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
      if (filters.category) q = q.eq('category', filters.category);
      if (extended) {
        if (!filters.includeVoid) q = q.eq('status', 'recorded');
        if (filters.paymentMethod) q = q.eq('payment_method', filters.paymentMethod);
      }
      const term = sanitizeSearch(filters.search);
      if (term.length > 0) {
        const like = `%${term}%`;
        const clauses = [`description.ilike.${like}`, `category.ilike.${like}`];
        if (extended) clauses.push(`payee.ilike.${like}`, `reference_no.ilike.${like}`);
        q = q.or(clauses.join(','));
      }
      return q;
    };

    let res = await run(schema.expensesExtended);
    if (res.error && schema.expensesExtended && isMissingColumn(res.error)) {
      schemaCache = { ...schema, expensesExtended: false };
      res = await run(false);
    }
    if (res.error) return { data: null, error: 'Unable to load expenses.' };

    return {
      data: { rows: asRecords(res.data).map(mapExpense), total: res.count ?? 0, page, pageSize },
      error: null,
    };
  } catch {
    return { data: null, error: 'Unable to load expenses.' };
  }
}

function buildExpensePayload(input: ExpenseInput, extended: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    amount: input.amount,
    category: input.category,
    description: input.description,
    date: input.expense_date,
  };
  if (!extended) return base;
  return {
    ...base,
    amount_paise: toPaise(input.amount),
    payment_method: input.payment_method,
    payee: input.payee,
    reference_no: input.reference_no,
    notes: input.notes,
  };
}

/** Creates an expense for the caller's branch (owners/admins may pass a branch). */
export async function createExpense(input: ExpenseInput, branchId?: string | null): Promise<ServiceResult<Expense>> {
  try {
    const scope = resolveScope(branchId);
    const schema = await detectFinanceSchema();
    const identity = {
      tenant_id: scope.tenant_id,
      branch_id: scope.writeBranchId,
      created_by: currentStaffId(),
    };

    const run = async (extended: boolean) =>
      supabase
        .from('expenses')
        .insert({ ...identity, ...buildExpensePayload(input, extended), ...(extended ? { status: 'recorded' } : {}) })
        .select(extended ? EXPENSE_EXT_COLUMNS : EXPENSE_BASE_COLUMNS)
        .single();

    let res = await run(schema.expensesExtended);
    if (res.error && schema.expensesExtended && isMissingColumn(res.error)) {
      schemaCache = { ...schema, expensesExtended: false };
      res = await run(false);
    }
    if (res.error || !isRecord(res.data)) return { data: null, error: 'Unable to save the expense.' };
    return { data: mapExpense(res.data), error: null };
  } catch {
    return { data: null, error: 'Unable to save the expense.' };
  }
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<ServiceResult<Expense>> {
  try {
    const scope = resolveScope(null);
    const schema = await detectFinanceSchema();

    const run = async (extended: boolean) => {
      let q = supabase
        .from('expenses')
        .update(buildExpensePayload(input, extended))
        .eq('id', id)
        .eq('tenant_id', scope.tenant_id);
      if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
      if (extended) q = q.eq('status', 'recorded');
      return q.select(extended ? EXPENSE_EXT_COLUMNS : EXPENSE_BASE_COLUMNS).maybeSingle();
    };

    let res = await run(schema.expensesExtended);
    if (res.error && schema.expensesExtended && isMissingColumn(res.error)) {
      schemaCache = { ...schema, expensesExtended: false };
      res = await run(false);
    }
    if (res.error) return { data: null, error: 'Unable to update the expense.' };
    if (!isRecord(res.data)) return { data: null, error: 'This expense can no longer be edited.' };
    return { data: mapExpense(res.data), error: null };
  } catch {
    return { data: null, error: 'Unable to update the expense.' };
  }
}

/** Soft-void: expenses are never deleted so the audit trail survives. */
export async function voidExpense(id: string, reason: string): Promise<ServiceResult<Expense>> {
  try {
    const scope = resolveScope(null);
    const schema = await detectFinanceSchema();
    if (!schema.expensesExtended) {
      return { data: null, error: 'Voiding expenses needs the finance schema migration to be applied first.' };
    }
    const trimmed = reason.trim();
    if (trimmed.length === 0) return { data: null, error: 'A reason is required to void an expense.' };

    let q = supabase
      .from('expenses')
      .update({
        status: 'void',
        void_reason: trimmed,
        voided_at: new Date().toISOString(),
        voided_by: currentStaffId(),
      })
      .eq('id', id)
      .eq('tenant_id', scope.tenant_id)
      .eq('status', 'recorded');
    if (scope.branch_id) q = q.eq('branch_id', scope.branch_id);
    const { data, error } = await q.select(EXPENSE_EXT_COLUMNS).maybeSingle();
    if (error) return { data: null, error: 'Unable to void the expense.' };
    if (!isRecord(data)) return { data: null, error: 'This expense was already voided.' };
    return { data: mapExpense(data), error: null };
  } catch {
    return { data: null, error: 'Unable to void the expense.' };
  }
}

// ─── Expense categories ───────────────────────────────────────────────────────

function defaultCategories(tenantId: string): ExpenseCategory[] {
  return DEFAULT_EXPENSE_CATEGORIES.map((name, index) => ({
    id: `default:${name}`,
    tenant_id: tenantId,
    name,
    sort_order: (index + 1) * 10,
    is_active: true,
  }));
}

export async function fetchExpenseCategories(): Promise<ServiceResult<ExpenseCategory[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const schema = await detectFinanceSchema();
    if (!schema.categoriesTable) return { data: defaultCategories(tenant_id), error: null };

    const { data, error } = await supabase
      .from('expense_categories')
      .select('id, tenant_id, name, sort_order, is_active')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      if (isMissingTable(error)) {
        schemaCache = { ...schema, categoriesTable: false };
        return { data: defaultCategories(tenant_id), error: null };
      }
      return { data: null, error: 'Unable to load expense categories.' };
    }
    const rows = asRecords(data).map((r) => ({
      id: toText(r.id),
      tenant_id: toText(r.tenant_id),
      name: toText(r.name),
      sort_order: toNumber(r.sort_order),
      is_active: r.is_active !== false,
    }));
    return { data: rows.length > 0 ? rows : defaultCategories(tenant_id), error: null };
  } catch {
    return { data: null, error: 'Unable to load expense categories.' };
  }
}

export async function createExpenseCategory(name: string): Promise<ServiceResult<ExpenseCategory>> {
  try {
    const { tenant_id } = getTenantContext();
    const schema = await detectFinanceSchema();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 60) {
      return { data: null, error: 'Enter a category name up to 60 characters.' };
    }
    if (!schema.categoriesTable) {
      return { data: null, error: 'Custom categories need the finance schema migration to be applied first.' };
    }
    const { data, error } = await supabase
      .from('expense_categories')
      .insert({ tenant_id, name: trimmed, sort_order: 1000 })
      .select('id, tenant_id, name, sort_order, is_active')
      .single();
    if (error) {
      if (isUniqueViolation(error)) return { data: null, error: 'A category with this name already exists.' };
      return { data: null, error: 'Unable to create the category.' };
    }
    if (!isRecord(data)) return { data: null, error: 'Unable to create the category.' };
    return {
      data: {
        id: toText(data.id),
        tenant_id: toText(data.tenant_id),
        name: toText(data.name),
        sort_order: toNumber(data.sort_order),
        is_active: data.is_active !== false,
      },
      error: null,
    };
  } catch {
    return { data: null, error: 'Unable to create the category.' };
  }
}

// ─── Cash book / ledger ───────────────────────────────────────────────────────

const LEDGER_SETTLEMENT_LIMIT = 1000;

/**
 * Chronological money movements in range: settlements (in), recorded expenses
 * (out) and completed refunds (out). Zero-amount settlements (complimentary
 * bills) are omitted because they move no money.
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

    const [settlementsRes, expensesResult, refundsResult] = await Promise.all([
      settlementsQuery,
      fetchExpensesInRange(scope, filters.startDate, filters.endDate, schema.expensesExtended),
      schema.refundsExtended ? fetchRefundsInRange(scope, startTimestamp, endTimestamp) : Promise.resolve({ refunds: [] as RefundLite[], error: null as PgError }),
    ]);
    if (settlementsRes.error) return { data: null, error: 'Unable to load settlements for the cash book.' };
    if (expensesResult.error) return { data: null, error: 'Unable to load expenses for the cash book.' };
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
    for (const e of expensesResult.expenses) {
      entries.push({
        id: `expense:${e.id}`,
        kind: 'expense',
        occurred_at: e.created_at,
        business_date: e.expense_date,
        title: e.category,
        subtitle: e.description ?? e.payee,
        payment_method: e.payment_method,
        amount: e.amount,
        direction: 'out',
        reference: e.reference_no,
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

    const expensesPromise = fetchAllRows(async (from, to) => {
      let q = supabase
        .from('expenses')
        .select(schema.expensesExtended ? 'amount, payment_method, status' : 'amount')
        .eq('tenant_id', scope.tenant_id)
        .eq('branch_id', branch)
        .eq('date', businessDate)
        .range(from, to);
      if (schema.expensesExtended) q = q.eq('status', 'recorded').eq('payment_method', 'cash');
      const res = await q;
      return { data: res.data, error: res.error };
    });

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
