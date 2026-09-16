/**
 * Finance ledger — Supabase service layer.
 *
 * Same shape as finance-service.ts: every function is try/catch, returns
 * ServiceResult<T>, scopes by tenant_id from tenant-context.ts and never
 * leaks a raw Supabase error. Who may read or change a row is decided by the
 * database policies (see supabase/migrations/20260915000100_finance_ledger.sql);
 * this layer only asks and reports.
 */
import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import { useSessionStore } from './use-session-store';
import type {
  AccountBalance,
  CatalogItem,
  CatalogItemInput,
  CatalogItemPatch,
  EntryFieldChange,
  EntryRevision,
  FinanceAccount,
  FinanceEntry,
  FinanceEntryInput,
  FinanceRules,
  FreeTextParticular,
  InterAccountPosition,
  LedgerAccountSummary,
  LedgerFilters,
  LedgerPage,
  ServiceResult,
  SettleEntryInput,
} from './finance-types';
import { fromPaise, toPaise } from './finance-utils';

// ─── Internal helpers ─────────────────────────────────────────────────────────

type PgError = { code?: string; message?: string } | null;

/** The database refused on a rule (RLS or a trigger raising 42501). */
const isForbidden = (e: PgError): boolean => e?.code === '42501' || e?.code === 'PGRST301';

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

/** PostgREST embeds a to-one join as an object or a one-element array. */
function embeddedName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return isRecord(row) ? toStringOrNull(row.name) : null;
}

function currentStaffId(): string | null {
  return useSessionStore.getState().session?.staffId ?? null;
}

/** Turns a refusal into the sentence the user should read; anything else into the fallback. */
function explain(error: PgError, fallback: string): string {
  if (!error) return fallback;
  if (isForbidden(error) && error.message) {
    // Trigger messages are written for people; RLS refusals are not.
    if (!/row-level security|policy/i.test(error.message)) return error.message;
    return 'You are not allowed to do that.';
  }
  if (error.code === '23514' && error.message) return error.message;
  if (error.code === '23505') return 'That name is already in use here.';
  return fallback;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

const ENTRY_COLUMNS =
  'id, account_id, paid_from_account_id, kind, status, amount_paise, mode, transfer_from, transfer_to, transaction_date, entered_at, entered_by, ' +
  'category_id, subcategory_id, particular_id, particulars, counterparty, reference_no, notes, settles_entry_id, settled_paise, ' +
  'settled_at, void_reason, voided_at, updated_at, version, entered_staff:staff!finance_entries_entered_by_fkey(name)';

function mapEntry(row: Record<string, unknown>): FinanceEntry {
  const paise = toNumber(row.amount_paise);
  const kind = toText(row.kind, 'expense') as FinanceEntry['kind'];
  const mode = toStringOrNull(row.mode) as FinanceEntry['mode'];
  return {
    id: toText(row.id),
    account_id: toText(row.account_id),
    paid_from_account_id: toStringOrNull(row.paid_from_account_id),
    kind,
    status: toText(row.status, 'recorded') as FinanceEntry['status'],
    amount: fromPaise(paise),
    amount_paise: paise,
    mode,
    transfer_from: toStringOrNull(row.transfer_from) as FinanceEntry['transfer_from'],
    transfer_to: toStringOrNull(row.transfer_to) as FinanceEntry['transfer_to'],
    transaction_date: toText(row.transaction_date),
    entered_at: toText(row.entered_at),
    entered_by: toText(row.entered_by),
    entered_by_name: embeddedName(row.entered_staff),
    category_id: toStringOrNull(row.category_id),
    subcategory_id: toStringOrNull(row.subcategory_id),
    particular_id: toStringOrNull(row.particular_id),
    particulars: toText(row.particulars),
    counterparty: toStringOrNull(row.counterparty),
    reference_no: toStringOrNull(row.reference_no),
    notes: toStringOrNull(row.notes),
    settles_entry_id: toStringOrNull(row.settles_entry_id),
    settled: fromPaise(toNumber(row.settled_paise)),
    settled_at: toStringOrNull(row.settled_at),
    void_reason: toStringOrNull(row.void_reason),
    voided_at: toStringOrNull(row.voided_at),
    updated_at: toText(row.updated_at),
    version: toNumber(row.version) || 1,
  };
}

function mapAccount(row: Record<string, unknown>): FinanceAccount {
  return {
    id: toText(row.id),
    tenant_id: toText(row.tenant_id),
    kind: toText(row.kind, 'branch') as FinanceAccount['kind'],
    branch_id: toStringOrNull(row.branch_id),
    staff_id: toStringOrNull(row.staff_id),
    name: toText(row.name),
    opening_cash: fromPaise(toNumber(row.opening_cash_paise)),
    opening_bank: fromPaise(toNumber(row.opening_bank_paise)),
    counts_in_partner_profit: row.counts_in_partner_profit === true,
    sort_order: toNumber(row.sort_order),
    is_active: row.is_active !== false,
  };
}

function mapCatalog(row: Record<string, unknown>): CatalogItem {
  return {
    id: toText(row.id),
    level: toText(row.level, 'category') as CatalogItem['level'],
    parent_id: toStringOrNull(row.parent_id),
    name: toText(row.name),
    default_kind: toStringOrNull(row.default_kind) as CatalogItem['default_kind'],
    sort_order: toNumber(row.sort_order),
    is_system: row.is_system === true,
    is_active: row.is_active !== false,
  };
}

function mapRules(row: Record<string, unknown>): FinanceRules {
  return {
    tenant_id: toText(row.tenant_id),
    clerk_sees_balances: row.clerk_sees_balances === true,
    clerk_sees_partner_entries: row.clerk_sees_partner_entries === true,
    clerk_edits_after_day_end: row.clerk_edits_after_day_end === true,
    clerk_can_void: row.clerk_can_void === true,
    clerk_can_transfer: row.clerk_can_transfer === true,
    day_end_time: toText(row.day_end_time, '00:00').slice(0, 5),
  };
}

function mapRevision(row: Record<string, unknown>): EntryRevision {
  const raw = isRecord(row.changes) ? row.changes : {};
  const changes: Record<string, EntryFieldChange> = {};
  for (const [field, change] of Object.entries(raw)) {
    if (isRecord(change)) changes[field] = { from: change.from ?? null, to: change.to ?? null };
  }
  return {
    id: toText(row.id),
    entry_id: toText(row.entry_id),
    action: toText(row.action, 'update') as EntryRevision['action'],
    changed_by: toStringOrNull(row.changed_by),
    changed_by_name: embeddedName(row.changed_staff),
    changed_at: toText(row.changed_at),
    changes,
  };
}

// ─── Accounts, catalog, rules ─────────────────────────────────────────────────

export async function fetchFinanceAccounts(): Promise<ServiceResult<FinanceAccount[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_accounts')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('sort_order')
      .order('name');
    if (error) return { data: null, error: 'Unable to load the finance accounts.' };
    return { data: asRecords(data).map(mapAccount), error: null };
  } catch {
    return { data: null, error: 'Unable to load the finance accounts.' };
  }
}

export async function fetchFinanceCatalog(): Promise<ServiceResult<CatalogItem[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_catalog')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('sort_order')
      .order('name');
    if (error) return { data: null, error: 'Unable to load the categories.' };
    return { data: asRecords(data).map(mapCatalog), error: null };
  } catch {
    return { data: null, error: 'Unable to load the categories.' };
  }
}

export async function createCatalogItem(input: CatalogItemInput): Promise<ServiceResult<CatalogItem>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_catalog')
      .insert({
        tenant_id,
        level: input.level,
        parent_id: input.parent_id,
        name: input.name.trim(),
        default_kind: input.default_kind,
        sort_order: input.sort_order,
      })
      .select('*')
      .single();
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to add to the catalog.') };
    return { data: mapCatalog(data), error: null };
  } catch {
    return { data: null, error: 'Unable to add to the catalog.' };
  }
}

export async function updateCatalogItem(id: string, patch: CatalogItemPatch): Promise<ServiceResult<CatalogItem>> {
  try {
    const { tenant_id } = getTenantContext();
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.default_kind !== undefined) payload.default_kind = patch.default_kind;
    if (patch.is_active !== undefined) payload.is_active = patch.is_active;
    if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;
    const { data, error } = await supabase
      .from('finance_catalog')
      .update(payload)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('is_system', false)
      .select('*')
      .maybeSingle();
    if (error) return { data: null, error: explain(error, 'Unable to update the catalog.') };
    // Zero rows back: a built-in item, or not the owner.
    if (!isRecord(data)) return { data: null, error: 'This item cannot be changed.' };
    return { data: mapCatalog(data), error: null };
  } catch {
    return { data: null, error: 'Unable to update the catalog.' };
  }
}

/** Writes new sort orders for a set of siblings. Nothing else about them changes. */
export async function reorderCatalogItems(orders: readonly { id: string; sort_order: number }[]): Promise<ServiceResult<void>> {
  try {
    const { tenant_id } = getTenantContext();
    const results = await Promise.all(
      orders.map((o) => supabase.from('finance_catalog').update({ sort_order: o.sort_order }).eq('id', o.id).eq('tenant_id', tenant_id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { data: null, error: explain(failed.error, 'Unable to reorder the catalog.') };
    return { data: undefined, error: null };
  } catch {
    return { data: null, error: 'Unable to reorder the catalog.' };
  }
}

/**
 * Particulars typed as free text into entries under a category (and
 * sub-category, when given) that are not catalog items yet, most used first.
 * What the owner promotes into the catalog from the Catalog screen.
 */
export async function fetchFreeTextParticulars(categoryId: string, subcategoryId: string | null): Promise<ServiceResult<FreeTextParticular[]>> {
  try {
    const { tenant_id } = getTenantContext();
    let q = supabase
      .from('finance_entries')
      .select('particulars')
      .eq('tenant_id', tenant_id)
      .eq('category_id', categoryId)
      .is('particular_id', null)
      .neq('status', 'void')
      .order('entered_at', { ascending: false })
      .limit(300);
    if (subcategoryId) q = q.eq('subcategory_id', subcategoryId);
    else q = q.is('subcategory_id', null);
    const { data, error } = await q;
    if (error) return { data: null, error: 'Unable to load recent particulars.' };
    const counts = new Map<string, FreeTextParticular>();
    for (const row of asRecords(data)) {
      const name = toText(row.particulars).trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { name, count: 1 });
    }
    const list = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 20);
    return { data: list, error: null };
  } catch {
    return { data: null, error: 'Unable to load recent particulars.' };
  }
}

export async function fetchFinanceRules(): Promise<ServiceResult<FinanceRules>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase.from('finance_rules').select('*').eq('tenant_id', tenant_id).maybeSingle();
    if (error) return { data: null, error: 'Unable to load the finance rules.' };
    if (!isRecord(data)) {
      // No row yet: the defaults, which are also what the database assumes.
      return {
        data: {
          tenant_id,
          clerk_sees_balances: false,
          clerk_sees_partner_entries: false,
          clerk_edits_after_day_end: false,
          clerk_can_void: false,
          clerk_can_transfer: false,
          day_end_time: '00:00',
        },
        error: null,
      };
    }
    return { data: mapRules(data), error: null };
  } catch {
    return { data: null, error: 'Unable to load the finance rules.' };
  }
}

export async function updateFinanceRules(patch: Partial<Omit<FinanceRules, 'tenant_id'>>): Promise<ServiceResult<FinanceRules>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_rules')
      .upsert({ tenant_id, ...patch, updated_by: currentStaffId() }, { onConflict: 'tenant_id' })
      .select('*')
      .single();
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the finance rules.') };
    return { data: mapRules(data), error: null };
  } catch {
    return { data: null, error: 'Unable to save the finance rules.' };
  }
}

// ─── Entries ──────────────────────────────────────────────────────────────────

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%,()\\]/g, ' ').trim().slice(0, 80);
}

export type FetchLedgerOptions = {
  /**
   * Count the matching rows. An exact count costs a scan of every match, so
   * the store asks for it only when the filters change, not on every page.
   */
  withCount?: boolean;
};

export async function fetchLedgerEntries(filters: LedgerFilters, options: FetchLedgerOptions = {}): Promise<ServiceResult<LedgerPage>> {
  try {
    const { tenant_id } = getTenantContext();
    const pageSize = Math.max(1, Math.min(200, filters.pageSize));
    const page = Math.max(0, filters.page);
    const from = page * pageSize;

    let q = supabase
      .from('finance_entries')
      .select(ENTRY_COLUMNS, options.withCount ? { count: 'exact' } : undefined)
      .eq('tenant_id', tenant_id)
      .gte('transaction_date', filters.startDate)
      .lte('transaction_date', filters.endDate);

    if (filters.accountId) q = q.eq('account_id', filters.accountId);
    if (filters.kind) q = q.eq('kind', filters.kind);
    if (filters.mode) q = q.eq('mode', filters.mode);
    if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
    if (filters.subcategoryId) q = q.eq('subcategory_id', filters.subcategoryId);
    if (filters.particularId) q = q.eq('particular_id', filters.particularId);
    if (filters.enteredBy) q = q.eq('entered_by', filters.enteredBy);
    switch (filters.status) {
      case 'active':
        q = q.neq('status', 'void');
        break;
      case 'all':
        break;
      default:
        q = q.eq('status', filters.status);
    }
    const term = sanitizeSearch(filters.search);
    if (term.length > 0) {
      const like = `%${term}%`;
      q = q.or(`particulars.ilike.${like},counterparty.ilike.${like},reference_no.ilike.${like},notes.ilike.${like}`);
    }

    const ascending = filters.sortDir === 'asc';
    const sortColumn = filters.sort === 'amount' ? 'amount_paise' : filters.sort;
    q = q.order(sortColumn, { ascending });
    if (filters.sort !== 'entered_at') q = q.order('entered_at', { ascending: false });
    q = q.range(from, from + pageSize - 1);

    const { data, error, count } = await q;
    if (error) return { data: null, error: 'Unable to load the ledger.' };
    return { data: { rows: asRecords(data).map(mapEntry), total: options.withCount ? count ?? 0 : null, page, pageSize }, error: null };
  } catch {
    return { data: null, error: 'Unable to load the ledger.' };
  }
}

export async function fetchLedgerEntry(id: string): Promise<ServiceResult<FinanceEntry>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase.from('finance_entries').select(ENTRY_COLUMNS).eq('tenant_id', tenant_id).eq('id', id).maybeSingle();
    if (error) return { data: null, error: 'Unable to load the entry.' };
    if (!isRecord(data)) return { data: null, error: 'That entry is not available to you.' };
    return { data: mapEntry(data), error: null };
  } catch {
    return { data: null, error: 'Unable to load the entry.' };
  }
}

function entryPayload(input: FinanceEntryInput): Record<string, unknown> {
  return {
    account_id: input.account_id,
    paid_from_account_id: input.paid_from_account_id,
    kind: input.kind,
    amount_paise: toPaise(input.amount),
    mode: input.mode,
    transfer_from: input.transfer_from,
    transfer_to: input.transfer_to,
    transaction_date: input.transaction_date,
    category_id: input.category_id,
    subcategory_id: input.subcategory_id,
    particular_id: input.particular_id,
    particulars: input.particulars,
    counterparty: input.counterparty,
    reference_no: input.reference_no,
    notes: input.notes,
  };
}

export async function createLedgerEntry(input: FinanceEntryInput): Promise<ServiceResult<FinanceEntry>> {
  try {
    const { tenant_id } = getTenantContext();
    const staffId = currentStaffId();
    if (!staffId) return { data: null, error: 'Sign in again to record an entry.' };
    const { data, error } = await supabase
      .from('finance_entries')
      .insert({ tenant_id, entered_by: staffId, ...entryPayload(input) })
      .select(ENTRY_COLUMNS)
      .single();
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the entry.') };
    return { data: mapEntry(data), error: null };
  } catch {
    return { data: null, error: 'Unable to save the entry.' };
  }
}

export async function updateLedgerEntry(id: string, input: FinanceEntryInput): Promise<ServiceResult<FinanceEntry>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_entries')
      .update(entryPayload(input))
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select(ENTRY_COLUMNS)
      .maybeSingle();
    if (error) return { data: null, error: explain(error, 'Unable to update the entry.') };
    // Zero rows back means the policy refused: the day has ended, or it is not this user's entry.
    if (!isRecord(data)) return { data: null, error: 'This entry can no longer be edited by you.' };
    return { data: mapEntry(data), error: null };
  } catch {
    return { data: null, error: 'Unable to update the entry.' };
  }
}

export async function voidLedgerEntry(id: string, reason: string): Promise<ServiceResult<FinanceEntry>> {
  try {
    const { tenant_id } = getTenantContext();
    const trimmed = reason.trim();
    if (trimmed.length === 0) return { data: null, error: 'Give a reason for voiding this entry.' };
    const { data, error } = await supabase
      .from('finance_entries')
      .update({ status: 'void', void_reason: trimmed })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select(ENTRY_COLUMNS)
      .maybeSingle();
    if (error) return { data: null, error: explain(error, 'Unable to void the entry.') };
    if (!isRecord(data)) return { data: null, error: 'This entry cannot be voided by you.' };
    return { data: mapEntry(data), error: null };
  } catch {
    return { data: null, error: 'Unable to void the entry.' };
  }
}

export async function fetchEntryRevisions(entryId: string): Promise<ServiceResult<EntryRevision[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_entry_revisions')
      .select('id, entry_id, action, changed_by, changed_at, changes, changed_staff:staff!finance_entry_revisions_changed_by_fkey(name)')
      .eq('tenant_id', tenant_id)
      .eq('entry_id', entryId)
      .order('changed_at', { ascending: true });
    if (error) return { data: null, error: 'Unable to load the edit history.' };
    return { data: asRecords(data).map(mapRevision), error: null };
  } catch {
    return { data: null, error: 'Unable to load the edit history.' };
  }
}

// ─── Settlement ───────────────────────────────────────────────────────────────

/**
 * Records the payment of an open payable or receivable. The database does the
 * whole thing in one transaction (finance_settle_entry) and returns the new
 * payment entry, which the caller shows as the saved row.
 */
export async function settleLedgerEntry(input: SettleEntryInput): Promise<ServiceResult<FinanceEntry>> {
  try {
    if (!currentStaffId()) return { data: null, error: 'Sign in again to settle an entry.' };
    const { data, error } = await supabase.rpc('finance_settle_entry', {
      p_entry_id: input.entry_id,
      p_amount_paise: toPaise(input.amount),
      p_mode: input.mode,
      p_transaction_date: input.transaction_date,
      p_paid_from_account_id: input.paid_from_account_id,
      p_reference_no: input.reference_no,
      p_notes: input.notes,
    });
    if (error) return { data: null, error: explain(error, 'Unable to settle the entry.') };
    const paymentId = typeof data === 'string' ? data : null;
    if (!paymentId) return { data: null, error: 'Unable to settle the entry.' };
    return fetchLedgerEntry(paymentId);
  } catch {
    return { data: null, error: 'Unable to settle the entry.' };
  }
}

// ─── Balances ─────────────────────────────────────────────────────────────────

/**
 * Cash and bank balance per account. The database refuses when the caller
 * may not see balances; that comes back as an empty list, not an error, so a
 * clerk's screen simply has no balance card.
 */
export async function fetchAccountBalances(accountIds: readonly string[], upto?: string): Promise<ServiceResult<AccountBalance[]>> {
  try {
    const results = await Promise.all(
      accountIds.map(async (account_id) => {
        const { data, error } = await supabase.rpc('finance_balances', { p_account_id: account_id, p_upto: upto ?? null });
        if (error) return { account_id, error };
        const row = Array.isArray(data) ? data[0] : data;
        if (!isRecord(row)) return { account_id, error: { code: 'EMPTY' } };
        return { account_id, cash: fromPaise(toNumber(row.cash_paise)), bank: fromPaise(toNumber(row.bank_paise)) };
      }),
    );
    const balances: AccountBalance[] = [];
    for (const r of results) {
      if ('error' in r) {
        if (isForbidden(r.error ?? null)) continue;
        return { data: null, error: 'Unable to load the balances.' };
      }
      balances.push(r);
    }
    return { data: balances, error: null };
  } catch {
    return { data: null, error: 'Unable to load the balances.' };
  }
}

/**
 * Who owes whom, from everything one account paid for another. Refused for a
 * clerk who may not see balances; that comes back as an empty list.
 */
export async function fetchInterAccountPositions(): Promise<ServiceResult<InterAccountPosition[]>> {
  try {
    const { data, error } = await supabase.rpc('finance_interaccount_positions');
    if (error) {
      if (isForbidden(error)) return { data: [], error: null };
      return { data: null, error: 'Unable to load the positions between accounts.' };
    }
    const positions = asRecords(data).map((row) => ({
      owed_by: toText(row.owed_by),
      owed_to: toText(row.owed_to),
      amount: fromPaise(toNumber(row.amount_paise)),
    }));
    return { data: positions, error: null };
  } catch {
    return { data: null, error: 'Unable to load the positions between accounts.' };
  }
}

/**
 * Ledger income, expenses and what is still open, per account, for the Books
 * card. Refused for a clerk who may not see balances; that is an empty list.
 */
export async function fetchLedgerSummary(startDate: string, endDate: string): Promise<ServiceResult<LedgerAccountSummary[]>> {
  try {
    const { data, error } = await supabase.rpc('finance_ledger_summary', { p_start: startDate, p_end: endDate });
    if (error) {
      if (isForbidden(error)) return { data: [], error: null };
      return { data: null, error: 'Unable to load the ledger summary.' };
    }
    const rows = asRecords(data).map((row) => ({
      account_id: toText(row.account_id),
      income: fromPaise(toNumber(row.income_paise)),
      expenses: fromPaise(toNumber(row.expense_paise)),
      openPayables: fromPaise(toNumber(row.open_payables_paise)),
      openReceivables: fromPaise(toNumber(row.open_receivables_paise)),
    }));
    return { data: rows, error: null };
  } catch {
    return { data: null, error: 'Unable to load the ledger summary.' };
  }
}
