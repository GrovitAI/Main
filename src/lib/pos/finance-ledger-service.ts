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
  CashCount,
  CashCountInput,
  CatalogItem,
  CatalogItemInput,
  CatalogItemPatch,
  CounterpartySuggestion,
  DuesSummaryRow,
  EntryFieldChange,
  EntryRevision,
  EntryTemplate,
  EntryTemplateInput,
  FinanceAccount,
  FinanceEntry,
  FinanceEntryInput,
  FinanceRules,
  FreeTextParticular,
  InterAccountPosition,
  LedgerAccountSummary,
  LedgerFilters,
  LedgerPage,
  ReceiptFile,
  ServiceResult,
  SettleEntryInput,
  StatementSubject,
} from './finance-types';
import { addDays, fromPaise, toPaise } from './finance-utils';

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
  'id, account_id, paid_from_account_id, counterparty_account_id, source_type, source_id, kind, status, amount_paise, mode, transfer_from, transfer_to, transaction_date, due_date, entered_at, entered_by, ' +
  'category_id, subcategory_id, particular_id, particulars, counterparty, reference_no, notes, receipt_path, settles_entry_id, settled_paise, ' +
  'settled_at, void_reason, voided_at, updated_at, version, entered_staff:staff!finance_entries_entered_by_fkey(name)';

function toSourceType(value: unknown): FinanceEntry['source_type'] {
  return value === 'purchase' || value === 'dispatch' || value === 'cash_count' ? value : null;
}

function mapEntry(row: Record<string, unknown>): FinanceEntry {
  const paise = toNumber(row.amount_paise);
  const kind = toText(row.kind, 'expense') as FinanceEntry['kind'];
  const mode = toStringOrNull(row.mode) as FinanceEntry['mode'];
  return {
    id: toText(row.id),
    account_id: toText(row.account_id),
    paid_from_account_id: toStringOrNull(row.paid_from_account_id),
    counterparty_account_id: toStringOrNull(row.counterparty_account_id),
    source_type: toSourceType(row.source_type),
    source_id: toStringOrNull(row.source_id),
    kind,
    status: toText(row.status, 'recorded') as FinanceEntry['status'],
    amount: fromPaise(paise),
    amount_paise: paise,
    mode,
    transfer_from: toStringOrNull(row.transfer_from) as FinanceEntry['transfer_from'],
    transfer_to: toStringOrNull(row.transfer_to) as FinanceEntry['transfer_to'],
    transaction_date: toText(row.transaction_date),
    due_date: toStringOrNull(row.due_date),
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
    receipt_path: toStringOrNull(row.receipt_path),
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
    system_key: toStringOrNull(row.system_key),
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

/** Makes a value match literally in an ILIKE pattern: no wildcards of its own. */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
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
      .eq('tenant_id', tenant_id);
    // What is still owed is owed whatever period the screen is looking at, so
    // the list of open dues is not cut to the date range.
    if (filters.status !== 'open') q = q.gte('transaction_date', filters.startDate).lte('transaction_date', filters.endDate);

    if (filters.accountId) q = q.eq('account_id', filters.accountId);
    if (filters.kind) q = q.eq('kind', filters.kind);
    if (filters.mode) q = q.eq('mode', filters.mode);
    if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
    if (filters.subcategoryId) q = q.eq('subcategory_id', filters.subcategoryId);
    if (filters.particularId) q = q.eq('particular_id', filters.particularId);
    // The whole name, any case: "tangedco" finds "TANGEDCO" but not "TANGEDCO Chennai".
    if (filters.counterparty) q = q.ilike('counterparty', escapeLike(filters.counterparty.trim()));
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
    // Entries without a due date go last whichever way the dates run.
    q = filters.sort === 'due_date' ? q.order(sortColumn, { ascending, nullsFirst: false }) : q.order(sortColumn, { ascending });
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
    due_date: input.kind === 'payable' || input.kind === 'receivable' ? input.due_date : null,
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

// ─── The bill behind an entry ─────────────────────────────────────────────────

const RECEIPT_BUCKET = 'finance-receipts';
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Uploads a photo or PDF of a bill and ties it to the entry. The file goes to
 * a private bucket under <tenant>/<entry>/; the database checks that the
 * caller keeps the entry's books before the entry points at it.
 */
export async function attachEntryReceipt(entryId: string, picked: ReceiptFile): Promise<ServiceResult<FinanceEntry>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!currentStaffId()) return { data: null, error: 'Sign in again to attach a bill.' };
    if (picked.size !== null && picked.size > RECEIPT_MAX_BYTES) return { data: null, error: 'Keep the file under 5 MB.' };
    const safeName = picked.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-60) || 'bill';
    const path = `${tenant_id}/${entryId}/${Date.now()}-${safeName}`;
    // A browser hands over the file itself; the app reads its copy of the pick.
    const body: Blob | ArrayBuffer = picked.file ? picked.file : await fetch(picked.uri).then((res) => res.arrayBuffer());
    const upload = await supabase.storage
      .from(RECEIPT_BUCKET)
      .upload(path, body, { contentType: picked.mimeType ?? 'application/octet-stream', upsert: false });
    if (upload.error) return { data: null, error: 'Unable to upload the bill. Use a photo or a PDF under 5 MB.' };
    const { error } = await supabase.rpc('finance_set_entry_receipt', { p_entry_id: entryId, p_receipt_path: path });
    if (error) return { data: null, error: explain(error, 'Unable to attach the bill.') };
    return fetchLedgerEntry(entryId);
  } catch {
    return { data: null, error: 'Unable to attach the bill.' };
  }
}

/** A link to an attached bill that works for five minutes. */
export async function fetchReceiptUrl(path: string): Promise<ServiceResult<string>> {
  try {
    const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return { data: null, error: 'Unable to open the bill.' };
    return { data: data.signedUrl, error: null };
  } catch {
    return { data: null, error: 'Unable to open the bill.' };
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

// ─── Regulars (entry templates) ───────────────────────────────────────────────

const TEMPLATE_COLUMNS =
  'id, account_id, paid_from_account_id, kind, amount_paise, mode, category_id, subcategory_id, particular_id, particulars, counterparty, due_day, sort_order, is_active, last_recorded_on';

function mapTemplate(row: Record<string, unknown>): EntryTemplate {
  const kind = toText(row.kind, 'expense');
  const mode = toStringOrNull(row.mode);
  const dueDay = row.due_day === null || row.due_day === undefined ? null : toNumber(row.due_day);
  return {
    id: toText(row.id),
    account_id: toText(row.account_id),
    paid_from_account_id: toStringOrNull(row.paid_from_account_id),
    kind: kind === 'income' || kind === 'payable' || kind === 'receivable' ? kind : 'expense',
    amount: fromPaise(toNumber(row.amount_paise)),
    mode: mode === 'cash' || mode === 'bank' ? mode : null,
    category_id: toStringOrNull(row.category_id),
    subcategory_id: toStringOrNull(row.subcategory_id),
    particular_id: toStringOrNull(row.particular_id),
    particulars: toText(row.particulars),
    counterparty: toStringOrNull(row.counterparty),
    due_day: dueDay !== null && dueDay >= 1 && dueDay <= 31 ? dueDay : null,
    sort_order: toNumber(row.sort_order),
    is_active: row.is_active !== false,
    last_recorded_on: toStringOrNull(row.last_recorded_on),
  };
}

/** The saved entries the caller may record from, in the owner's order. */
export async function fetchEntryTemplates(): Promise<ServiceResult<EntryTemplate[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_entry_templates')
      .select(TEMPLATE_COLUMNS)
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('sort_order')
      .order('particulars');
    if (error) return { data: null, error: 'Unable to load the regulars.' };
    return { data: asRecords(data).map(mapTemplate), error: null };
  } catch {
    return { data: null, error: 'Unable to load the regulars.' };
  }
}

export async function createEntryTemplate(input: EntryTemplateInput): Promise<ServiceResult<EntryTemplate>> {
  try {
    const { tenant_id } = getTenantContext();
    const staffId = currentStaffId();
    if (!staffId) return { data: null, error: 'Sign in again to save a regular.' };
    const isDue = input.kind === 'payable' || input.kind === 'receivable';
    const { data, error } = await supabase
      .from('finance_entry_templates')
      .insert({
        tenant_id,
        created_by: staffId,
        account_id: input.account_id,
        paid_from_account_id: isDue ? null : input.paid_from_account_id,
        kind: input.kind,
        amount_paise: toPaise(input.amount),
        mode: input.mode,
        category_id: input.category_id,
        subcategory_id: input.subcategory_id,
        particular_id: input.particular_id,
        particulars: input.particulars.trim(),
        counterparty: input.counterparty,
        due_day: isDue ? input.due_day : null,
      })
      .select(TEMPLATE_COLUMNS)
      .single();
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the regular.') };
    return { data: mapTemplate(data), error: null };
  } catch {
    return { data: null, error: 'Unable to save the regular.' };
  }
}

/** Changes the usual amount, switches a template off, or notes when it was last recorded. */
export async function updateEntryTemplate(
  id: string,
  patch: Partial<Pick<EntryTemplate, 'amount' | 'is_active' | 'last_recorded_on'>>,
): Promise<ServiceResult<EntryTemplate>> {
  try {
    const { tenant_id } = getTenantContext();
    const payload: Record<string, unknown> = {};
    if (patch.amount !== undefined) payload.amount_paise = toPaise(patch.amount);
    if (patch.is_active !== undefined) payload.is_active = patch.is_active;
    if (patch.last_recorded_on !== undefined) payload.last_recorded_on = patch.last_recorded_on;
    const { data, error } = await supabase
      .from('finance_entry_templates')
      .update(payload)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select(TEMPLATE_COLUMNS)
      .maybeSingle();
    if (error) return { data: null, error: explain(error, 'Unable to update the regular.') };
    if (!isRecord(data)) return { data: null, error: 'This regular cannot be changed by you.' };
    return { data: mapTemplate(data), error: null };
  } catch {
    return { data: null, error: 'Unable to update the regular.' };
  }
}

// ─── Accounts: opening balances ───────────────────────────────────────────────

/**
 * Sets what an account held in cash and at the bank on the day the ledger
 * starts. The balances are these plus everything recorded since. The owner's
 * alone: the database refuses anyone else.
 */
export async function updateAccountOpening(id: string, openingCash: number, openingBank: number): Promise<ServiceResult<FinanceAccount>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_accounts')
      .update({ opening_cash_paise: toPaise(openingCash), opening_bank_paise: toPaise(openingBank) })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select('*')
      .maybeSingle();
    if (error) return { data: null, error: explain(error, 'Unable to save the opening balance.') };
    if (!isRecord(data)) return { data: null, error: 'Only the owner can set an opening balance.' };
    return { data: mapAccount(data), error: null };
  } catch {
    return { data: null, error: 'Unable to save the opening balance.' };
  }
}

// ─── Statements ───────────────────────────────────────────────────────────────

/** How many entries a statement reads at most; older ones are reported as cut off. */
export const STATEMENT_MAX_ROWS = 500;

/**
 * The entries a statement is built from, oldest first: everything with one
 * vendor or customer by name, or everything between two of our own accounts.
 * Row level security decides what the caller may read; buildStatement() in
 * finance-statement-utils.ts does the arithmetic.
 */
export async function fetchStatementEntries(subject: StatementSubject): Promise<ServiceResult<{ entries: FinanceEntry[]; truncated: boolean }>> {
  try {
    const { tenant_id } = getTenantContext();
    let q = supabase.from('finance_entries').select(ENTRY_COLUMNS).eq('tenant_id', tenant_id).neq('status', 'void');
    if (subject.type === 'name') {
      const name = subject.name.trim();
      if (name.length === 0) return { data: { entries: [], truncated: false }, error: null };
      q = q.ilike('counterparty', escapeLike(name)).is('counterparty_account_id', null);
    } else {
      const { accountId: other, homeAccountId: home } = subject;
      q = q.or(
        [
          `and(account_id.eq.${home},counterparty_account_id.eq.${other})`,
          `and(account_id.eq.${other},counterparty_account_id.eq.${home})`,
          `and(account_id.eq.${home},paid_from_account_id.eq.${other})`,
          `and(account_id.eq.${other},paid_from_account_id.eq.${home})`,
        ].join(','),
      );
    }
    // The newest rows are kept when there are more than the limit.
    const { data, error } = await q
      .order('transaction_date', { ascending: false })
      .order('entered_at', { ascending: false })
      .range(0, STATEMENT_MAX_ROWS);
    if (error) return { data: null, error: 'Unable to load the statement.' };
    const rows = asRecords(data).map(mapEntry);
    const truncated = rows.length > STATEMENT_MAX_ROWS;
    return { data: { entries: truncated ? rows.slice(0, STATEMENT_MAX_ROWS) : rows, truncated }, error: null };
  } catch {
    return { data: null, error: 'Unable to load the statement.' };
  }
}

// ─── Month-end book ───────────────────────────────────────────────────────────

export type MonthBook = {
  entries: FinanceEntry[];
  openDues: FinanceEntry[];
  /** Cash and bank on the day before the month; null when the caller may not see balances. */
  opening: { cash: number; bank: number } | null;
  closing: { cash: number; bank: number } | null;
};

const MONTH_BOOK_PAGE = 1000;
const MONTH_BOOK_MAX = 10000;

/**
 * Everything the month-end workbook of one account needs: its entries dated
 * in the range (any status, and those it only paid for), what is still open
 * up to the range's end, and the cash and bank balances either side of it.
 */
export async function fetchMonthBook(accountId: string, startDate: string, endDate: string): Promise<ServiceResult<MonthBook>> {
  try {
    const { tenant_id } = getTenantContext();
    const entries: FinanceEntry[] = [];
    for (let from = 0; from < MONTH_BOOK_MAX; from += MONTH_BOOK_PAGE) {
      const { data, error } = await supabase
        .from('finance_entries')
        .select(ENTRY_COLUMNS)
        .eq('tenant_id', tenant_id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .or(`account_id.eq.${accountId},paid_from_account_id.eq.${accountId}`)
        .order('transaction_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + MONTH_BOOK_PAGE - 1);
      if (error) return { data: null, error: 'Unable to load the entries of the month.' };
      const batch = asRecords(data).map(mapEntry);
      entries.push(...batch);
      if (batch.length < MONTH_BOOK_PAGE) break;
    }

    const duesRes = await supabase
      .from('finance_entries')
      .select(ENTRY_COLUMNS)
      .eq('tenant_id', tenant_id)
      .eq('account_id', accountId)
      .eq('status', 'open')
      .in('kind', ['payable', 'receivable'])
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: true })
      .limit(MONTH_BOOK_PAGE);
    if (duesRes.error) return { data: null, error: 'Unable to load what is outstanding.' };

    const [openingRes, closingRes] = await Promise.all([
      fetchAccountBalances([accountId], addDays(startDate, -1)),
      fetchAccountBalances([accountId], endDate),
    ]);
    const balanceOf = (res: ServiceResult<AccountBalance[]>) => {
      const row = res.data?.find((b) => b.account_id === accountId);
      return row ? { cash: row.cash, bank: row.bank } : null;
    };

    return {
      data: { entries, openDues: asRecords(duesRes.data).map(mapEntry), opening: balanceOf(openingRes), closing: balanceOf(closingRes) },
      error: null,
    };
  } catch {
    return { data: null, error: 'Unable to load the month.' };
  }
}

// ─── Cash counts ──────────────────────────────────────────────────────────────

function mapCashCount(row: Record<string, unknown>): CashCount {
  return {
    id: toText(row.id),
    account_id: toText(row.account_id),
    mode: toText(row.mode) === 'bank' ? 'bank' : 'cash',
    counted_on: toText(row.counted_on).slice(0, 10),
    expected: fromPaise(toNumber(row.expected_paise)),
    counted: fromPaise(toNumber(row.counted_paise)),
    difference: fromPaise(toNumber(row.difference_paise)),
    adjustment_entry_id: toStringOrNull(row.adjustment_entry_id),
    note: toStringOrNull(row.note),
    counted_by_name: embeddedName(row.counted_staff),
    created_at: toText(row.created_at),
  };
}

/** The latest counts of an account's cash box and bank balance, newest first. */
export async function fetchCashCounts(accountId: string, limit = 10): Promise<ServiceResult<CashCount[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('finance_cash_counts')
      .select('id, account_id, mode, counted_on, expected_paise, counted_paise, difference_paise, adjustment_entry_id, note, created_at, counted_staff:staff!finance_cash_counts_counted_by_fkey(name)')
      .eq('tenant_id', tenant_id)
      .eq('account_id', accountId)
      .order('counted_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(50, limit)));
    if (error) return { data: null, error: 'Unable to load the earlier counts.' };
    return { data: asRecords(data).map(mapCashCount), error: null };
  } catch {
    return { data: null, error: 'Unable to load the earlier counts.' };
  }
}

export type CashCountResult = {
  count_id: string;
  expected: number;
  counted: number;
  /** counted − expected. */
  difference: number;
  /** The ledger entry that carried the difference, when one was posted. */
  entry_id: string | null;
};

/**
 * Records a count of an account's cash box or bank balance. The database
 * reads what the ledger expects, stores both, and posts the difference when
 * asked, all in one transaction (finance_record_cash_count).
 */
export async function recordCashCount(input: CashCountInput): Promise<ServiceResult<CashCountResult>> {
  try {
    if (!currentStaffId()) return { data: null, error: 'Sign in again to record a count.' };
    const { data, error } = await supabase.rpc('finance_record_cash_count', {
      p_account_id: input.account_id,
      p_mode: input.mode,
      p_counted_paise: toPaise(input.counted),
      p_counted_on: input.counted_on,
      p_note: input.note,
      p_adjust: input.adjust,
    });
    if (error) return { data: null, error: explain(error, 'Unable to record the count.') };
    if (!isRecord(data)) return { data: null, error: 'Unable to record the count.' };
    return {
      data: {
        count_id: toText(data.count_id),
        expected: fromPaise(toNumber(data.expected_paise)),
        counted: fromPaise(toNumber(data.counted_paise)),
        difference: fromPaise(toNumber(data.difference_paise)),
        entry_id: toStringOrNull(data.entry_id),
      },
      error: null,
    };
  } catch {
    return { data: null, error: 'Unable to record the count.' };
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
 * What one account owes another from money already moved between them, in
 * rupees: the most a receivable from that account can be offset by. Zero when
 * nothing is owed, when the debt runs the other way, or when the caller may
 * not see the accounts.
 */
export async function fetchPairPosition(debtorAccountId: string, creditorAccountId: string): Promise<ServiceResult<number>> {
  try {
    const { data, error } = await supabase.rpc('finance_pair_position', { p_debtor: debtorAccountId, p_creditor: creditorAccountId });
    if (error) {
      if (isForbidden(error)) return { data: 0, error: null };
      return { data: null, error: 'Unable to load what is owed between the accounts.' };
    }
    return { data: fromPaise(toNumber(data)), error: null };
  } catch {
    return { data: null, error: 'Unable to load what is owed between the accounts.' };
  }
}

/**
 * What is open, per account and kind, split by how soon it is due. Adds up
 * only the entries the caller may read, so a clerk sees their own dues.
 */
export async function fetchDuesSummary(today: string): Promise<ServiceResult<DuesSummaryRow[]>> {
  try {
    const { data, error } = await supabase.rpc('finance_dues_summary', { p_today: today });
    if (error) {
      if (isForbidden(error)) return { data: [], error: null };
      return { data: null, error: 'Unable to load what is due.' };
    }
    const rows: DuesSummaryRow[] = [];
    for (const row of asRecords(data)) {
      const kind = toText(row.kind);
      const bucket = toText(row.bucket);
      if (kind !== 'payable' && kind !== 'receivable') continue;
      if (bucket !== 'overdue' && bucket !== 'week' && bucket !== 'later' && bucket !== 'undated') continue;
      rows.push({ account_id: toText(row.account_id), kind, bucket, amount: fromPaise(toNumber(row.amount_paise)), entries: toNumber(row.entries) });
    }
    return { data: rows, error: null };
  } catch {
    return { data: null, error: 'Unable to load what is due.' };
  }
}

/**
 * Names to offer in "Paid to / Received from": the ones already in the
 * ledger, the suppliers and the staff, merged so one vendor is one name.
 * A failure is an empty list: the field stays free text.
 */
export async function fetchCounterpartyNames(query: string, limit = 8): Promise<ServiceResult<CounterpartySuggestion[]>> {
  try {
    const { data, error } = await supabase.rpc('finance_counterparty_names', { p_query: query.trim().slice(0, 80), p_limit: limit });
    if (error) return { data: [], error: null };
    const names: CounterpartySuggestion[] = [];
    for (const row of asRecords(data)) {
      const name = toText(row.name).trim();
      if (!name) continue;
      const source = toText(row.source);
      names.push({ name, source: source === 'supplier' || source === 'staff' ? source : 'used', uses: toNumber(row.uses) });
    }
    return { data: names, error: null };
  } catch {
    return { data: [], error: null };
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
