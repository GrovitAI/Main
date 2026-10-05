/**
 * Central Kitchen — Supabase service layer.
 *
 * Every function is try/catch, returns ServiceResult<T>, scopes by the
 * kitchen's tenant and branch, and never leaks a raw Supabase error. Entries
 * are posted through kitchen_post_entry so the entry, its lines, its matches
 * and the stock change in one transaction; lists are plain reads and writes
 * under row level security (supabase/migrations/20261004000100_central_kitchen.sql).
 */
import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import { useSessionStore } from './use-session-store';
import { fromPaise, toPaise } from './finance-utils';
import { DEFAULT_KITCHEN_CATEGORIES, describeKitchenError } from './kitchen-utils';
import type {
  KitchenAllocation,
  KitchenCategory,
  KitchenEntry,
  KitchenEntryFilter,
  KitchenEntryLine,
  KitchenEntryType,
  KitchenItem,
  KitchenItemInput,
  KitchenMode,
  KitchenOpenDocument,
  KitchenParty,
  KitchenPartyBalance,
  KitchenPartyInput,
  KitchenPartyKind,
  KitchenUnit,
  PostEntryInput,
  ServiceResult,
} from './kitchen-types';

// ─── Internal helpers ─────────────────────────────────────────────────────────

type PgError = { code?: string; message?: string; details?: string } | null;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

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

function explain(error: PgError | unknown, fallback: string): string {
  const e = isRecord(error) ? error : null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  console.error('[kitchen-service]', code || 'UNKNOWN', message);
  if (code === 'PGRST202' || code === '42883') return 'The kitchen update is not on this database yet.';
  if (code === '42P01') return 'The kitchen tables are not on this database yet.';
  return describeKitchenError(`${code} ${message}`, fallback);
}

/**
 * The branch whose books these are: the kitchen login's own branch, or, for
 * the owner or an admin opening the kitchen from the full app, the branch
 * marked as the central kitchen (their own branch when there is none).
 */
export function kitchenBranch(): { id: string; name: string } {
  const session = useSessionStore.getState().session;
  const { branch_id } = getTenantContext();
  if (session && session.role !== 'kitchen') {
    const kitchen = session.accessibleBranches.find((b) => b.branch_type === 'CENTRAL_KITCHEN' || b.branch_type === 'WAREHOUSE');
    if (kitchen) return { id: kitchen.id, name: kitchen.name };
  }
  return { id: branch_id, name: session?.branchName ?? 'Central Kitchen' };
}

function scope(): { tenant_id: string; branch_id: string } {
  const { tenant_id } = getTenantContext();
  return { tenant_id, branch_id: kitchenBranch().id };
}

function actorName(): string {
  return useSessionStore.getState().session?.displayName?.trim() || 'Staff';
}

const ITEM_COLUMNS = 'id, name, unit, sell_price_paise, stock, is_active, updated_at';
const PARTY_COLUMNS = 'id, kind, name, phone, is_active, opening_paise';
const ENTRY_COLUMNS =
  'id, type, entry_date, party_id, item_id, qty, from_qty, amount_paise, paid, mode, category, note, created_by, created_at, voided_at, void_reason, replaces_id, lines:kitchen_entry_lines(id, item_id, qty, price_paise, line_paise)';

const UNITS: readonly KitchenUnit[] = ['kg', 'L', 'pcs'];
const TYPES: readonly KitchenEntryType[] = ['sent', 'received', 'bought', 'paid', 'spent', 'made', 'count'];
const MODES: readonly KitchenMode[] = ['cash', 'upi', 'bank'];

function mapItem(row: Record<string, unknown>): KitchenItem {
  const unit = UNITS.find((u) => u === row.unit) ?? 'pcs';
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    unit,
    sell_price: row.sell_price_paise === null || row.sell_price_paise === undefined ? null : fromPaise(toNumber(row.sell_price_paise)),
    stock: toNumber(row.stock),
    is_active: row.is_active !== false,
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapParty(row: Record<string, unknown>): KitchenParty {
  return {
    id: String(row.id),
    kind: row.kind === 'vendor' ? 'vendor' : 'branch',
    name: String(row.name ?? ''),
    phone: toStringOrNull(row.phone),
    is_active: row.is_active !== false,
    opening: fromPaise(toNumber(row.opening_paise)),
  };
}

function mapLine(row: unknown): KitchenEntryLine | null {
  if (!isRecord(row)) return null;
  return {
    id: String(row.id),
    item_id: String(row.item_id),
    qty: toNumber(row.qty),
    price: fromPaise(toNumber(row.price_paise)),
    line_total: fromPaise(toNumber(row.line_paise)),
  };
}

function mapEntry(row: Record<string, unknown>): KitchenEntry {
  const type = TYPES.find((t) => t === row.type) ?? 'spent';
  const mode = MODES.find((m) => m === row.mode) ?? null;
  const lines = Array.isArray(row.lines) ? row.lines.map(mapLine).filter((l): l is KitchenEntryLine => l !== null) : [];
  return {
    id: String(row.id),
    type,
    entry_date: String(row.entry_date ?? ''),
    party_id: toStringOrNull(row.party_id),
    item_id: toStringOrNull(row.item_id),
    qty: row.qty === null || row.qty === undefined ? null : toNumber(row.qty),
    from_qty: row.from_qty === null || row.from_qty === undefined ? null : toNumber(row.from_qty),
    amount: fromPaise(toNumber(row.amount_paise)),
    paid: row.paid !== false,
    mode,
    category: toStringOrNull(row.category),
    note: toStringOrNull(row.note),
    created_by: String(row.created_by ?? 'Staff'),
    created_at: String(row.created_at ?? ''),
    voided_at: toStringOrNull(row.voided_at),
    void_reason: toStringOrNull(row.void_reason),
    replaces_id: toStringOrNull(row.replaces_id),
    lines,
  };
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function fetchKitchenItems(includeInactive = false): Promise<ServiceResult<KitchenItem[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    let query = supabase.from('kitchen_items').select(ITEM_COLUMNS).eq('tenant_id', tenant_id).eq('branch_id', branch_id).order('name');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) return { data: null, error: explain(error, 'Unable to load the items.') };
    return { data: (data ?? []).filter(isRecord).map(mapItem), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the items.') };
  }
}

/** Creates an item, or changes its name, unit or price. Stock moves only through entries. */
export async function saveKitchenItem(input: KitchenItemInput, id?: string): Promise<ServiceResult<KitchenItem>> {
  try {
    const { tenant_id, branch_id } = scope();
    const name = input.name.trim();
    if (!name) return { data: null, error: 'Give the item a name.' };
    const fields = {
      name,
      unit: input.unit,
      sell_price_paise: input.sell_price === null ? null : toPaise(input.sell_price),
    };
    const query = id
      ? supabase.from('kitchen_items').update(fields).eq('id', id).eq('tenant_id', tenant_id).eq('branch_id', branch_id)
      : supabase.from('kitchen_items').insert({ ...fields, tenant_id, branch_id, stock: input.opening_stock ?? 0 });
    const { data, error } = await query.select(ITEM_COLUMNS).single();
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the item.') };
    return { data: mapItem(data), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to save the item.') };
  }
}

export async function setKitchenItemActive(id: string, isActive: boolean): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = scope();
    const { data, error } = await supabase
      .from('kitchen_items')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('id');
    if (error) return { data: false, error: explain(error, 'Unable to change the item.') };
    return { data: (data ?? []).length > 0, error: null };
  } catch (err) {
    return { data: false, error: explain(err, 'Unable to change the item.') };
  }
}

// ─── Branches and vendors ────────────────────────────────────────────────────

export async function fetchKitchenParties(kind?: KitchenPartyKind, includeInactive = false): Promise<ServiceResult<KitchenParty[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    let query = supabase.from('kitchen_parties').select(PARTY_COLUMNS).eq('tenant_id', tenant_id).eq('branch_id', branch_id).order('name');
    if (kind) query = query.eq('kind', kind);
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) return { data: null, error: explain(error, 'Unable to load the list.') };
    return { data: (data ?? []).filter(isRecord).map(mapParty), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the list.') };
  }
}

export async function saveKitchenParty(input: KitchenPartyInput, id?: string): Promise<ServiceResult<KitchenParty>> {
  try {
    const { tenant_id, branch_id } = scope();
    const name = input.name.trim();
    if (!name) return { data: null, error: 'Type a name first.' };
    const fields: Record<string, unknown> = { name, phone: input.phone?.trim() || null };
    if (input.opening !== undefined) fields.opening_paise = toPaise(input.opening);
    const query = id
      ? supabase.from('kitchen_parties').update(fields).eq('id', id).eq('tenant_id', tenant_id).eq('branch_id', branch_id)
      : supabase.from('kitchen_parties').insert({ ...fields, kind: input.kind, tenant_id, branch_id });
    const { data, error } = await query.select(PARTY_COLUMNS).single();
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the name.') };
    return { data: mapParty(data), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to save the name.') };
  }
}

export async function setKitchenPartyActive(id: string, isActive: boolean): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = scope();
    const { data, error } = await supabase
      .from('kitchen_parties')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('id');
    if (error) return { data: false, error: explain(error, 'Unable to change the list.') };
    return { data: (data ?? []).length > 0, error: null };
  } catch (err) {
    return { data: false, error: explain(err, 'Unable to change the list.') };
  }
}

/** Every branch's and vendor's give-and-take, from the database view. */
export async function fetchKitchenBalances(): Promise<ServiceResult<KitchenPartyBalance[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    const { data, error } = await supabase
      .from('kitchen_party_balances')
      .select('party_id, kind, name, phone, is_active, balance_paise, opening_paise, last_entry_date')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('name');
    if (error) return { data: null, error: explain(error, 'Unable to load the balances.') };
    const rows = (data ?? []).filter(isRecord).map((row): KitchenPartyBalance => ({
      party_id: String(row.party_id),
      kind: row.kind === 'vendor' ? 'vendor' : 'branch',
      name: String(row.name ?? ''),
      phone: toStringOrNull(row.phone),
      is_active: row.is_active !== false,
      balance: fromPaise(toNumber(row.balance_paise)),
      opening: fromPaise(toNumber(row.opening_paise)),
      last_entry_date: toStringOrNull(row.last_entry_date),
    }));
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the balances.') };
  }
}

/**
 * The pay-later buys (vendor) or sends (branch) that money can still be
 * matched against. While a payment is being edited, pass its id: what it
 * already covers counts as open again, so the form can offer it back.
 */
export async function fetchKitchenOpenDocuments(partyId: string, reopenPaymentId?: string): Promise<ServiceResult<KitchenOpenDocument[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    const reopen = new Map<string, number>();
    if (reopenPaymentId) {
      const allocations = await fetchKitchenAllocations(reopenPaymentId);
      if (allocations.error) return { data: null, error: allocations.error };
      for (const a of allocations.data ?? []) reopen.set(a.covers_id, a.amount);
    }
    const query = supabase
      .from('kitchen_open_documents')
      .select('entry_id, party_id, type, entry_date, amount_paise, covered_paise, open_paise')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .eq('party_id', partyId);
    const { data, error } = await (reopenPaymentId ? query : query.gt('open_paise', 0)).order('entry_date', { ascending: true });
    if (error) return { data: null, error: explain(error, 'Unable to load what is open.') };
    const rows = (data ?? [])
      .filter(isRecord)
      .map((row): KitchenOpenDocument => {
        const id = String(row.entry_id);
        const reopened = reopen.get(id) ?? 0;
        return {
          entry_id: id,
          party_id: String(row.party_id),
          type: row.type === 'sent' ? 'sent' : 'bought',
          entry_date: String(row.entry_date ?? ''),
          amount: fromPaise(toNumber(row.amount_paise)),
          covered: Math.max(0, fromPaise(toNumber(row.covered_paise)) - reopened),
          open: fromPaise(toNumber(row.open_paise)) + reopened,
          reopened,
        };
      })
      .filter((d) => d.open > 0);
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load what is open.') };
  }
}

/** What one payment is set against: the buys or sends it covers, with how much of each. */
export async function fetchKitchenAllocations(paymentId: string): Promise<ServiceResult<KitchenAllocation[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    const { data, error } = await supabase
      .from('kitchen_allocations')
      .select('payment_id, covers_id, amount_paise')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .eq('payment_id', paymentId);
    if (error) return { data: null, error: explain(error, 'Unable to load the matches.') };
    const rows = (data ?? []).filter(isRecord).map((row): KitchenAllocation => ({
      payment_id: String(row.payment_id),
      covers_id: String(row.covers_id),
      amount: fromPaise(toNumber(row.amount_paise)),
    }));
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the matches.') };
  }
}

// ─── Entries ─────────────────────────────────────────────────────────────────

export async function fetchKitchenEntries(filter: KitchenEntryFilter = {}): Promise<ServiceResult<KitchenEntry[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    let query = supabase
      .from('kitchen_entries')
      .select(ENTRY_COLUMNS)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(filter.limit ?? 500);
    if (filter.from) query = query.gte('entry_date', filter.from);
    if (filter.to) query = query.lte('entry_date', filter.to);
    if (filter.party_id) query = query.eq('party_id', filter.party_id);
    if (filter.item_id) query = query.eq('item_id', filter.item_id);
    if (filter.types && filter.types.length > 0) query = query.in('type', filter.types);
    if (!filter.includeVoided) query = query.is('voided_at', null);
    const { data, error } = await query;
    if (error) return { data: null, error: explain(error, 'Unable to load the entries.') };
    return { data: (data ?? []).filter(isRecord).map(mapEntry), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the entries.') };
  }
}

/** Every entry that touched an item: its own made/count rows and the sends and buys it was on. */
export async function fetchKitchenItemEntries(itemId: string, limit = 100): Promise<ServiceResult<KitchenEntry[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    const { data: lineRows, error: lineErr } = await supabase
      .from('kitchen_entry_lines')
      .select('entry_id')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .eq('item_id', itemId)
      .limit(limit);
    if (lineErr) return { data: null, error: explain(lineErr, 'Unable to load the movements.') };
    const ids = (lineRows ?? []).filter(isRecord).map((r) => String(r.entry_id));
    let query = supabase
      .from('kitchen_entries')
      .select(ENTRY_COLUMNS)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    query = ids.length > 0 ? query.or(`item_id.eq.${itemId},id.in.(${ids.join(',')})`) : query.eq('item_id', itemId);
    const { data, error } = await query;
    if (error) return { data: null, error: explain(error, 'Unable to load the movements.') };
    return { data: (data ?? []).filter(isRecord).map(mapEntry), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the movements.') };
  }
}

/** Posts one entry: the row, its lines, its matches and the stock, in one transaction. */
/** The shape kitchen_post_entry and kitchen_edit_entry read: paise, not rupees. */
function entryPayload(input: PostEntryInput): Record<string, unknown> {
  const { branch_id } = scope();
  const payload: Record<string, unknown> = {
    branch_id,
    type: input.type,
    entry_date: input.entry_date ?? null,
    note: input.note ?? null,
    created_by: actorName(),
  };
  switch (input.type) {
    case 'sent':
    case 'bought':
      payload.party_id = input.party_id;
      payload.lines = input.lines.map((l) => ({ item_id: l.item_id, qty: l.qty, price_paise: toPaise(l.price) }));
      if (input.type === 'bought') {
        payload.paid = input.paid;
        payload.mode = input.paid ? input.mode ?? null : null;
      }
      break;
    case 'received':
    case 'paid':
      payload.party_id = input.party_id;
      payload.amount_paise = toPaise(input.amount);
      payload.mode = input.mode;
      if (input.covers && input.covers.length > 0) {
        payload.covers = input.covers.map((c) => ({ entry_id: c.entry_id, amount_paise: toPaise(c.amount) }));
      }
      break;
    case 'spent':
      payload.amount_paise = toPaise(input.amount);
      payload.mode = input.mode;
      payload.category = input.category;
      break;
    case 'made':
    case 'count':
      payload.item_id = input.item_id;
      payload.qty = input.qty;
      break;
  }
  return payload;
}

export async function postKitchenEntry(input: PostEntryInput): Promise<ServiceResult<KitchenEntry>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_post_entry', { p: entryPayload(input) });
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the entry.') };
    return { data: mapEntry({ ...data, lines: [] }), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to save the entry.') };
  }
}

/**
 * Corrects an entry. The database voids the old one with the reason "Edited"
 * and posts this one in its place in a single transaction; payments that
 * covered the old buy or send carry over to the new one as far as its amount
 * allows. The kind of entry cannot change.
 */
export async function editKitchenEntry(id: string, input: PostEntryInput): Promise<ServiceResult<KitchenEntry>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_edit_entry', { p_entry_id: id, p: entryPayload(input) });
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the changes.') };
    return { data: mapEntry({ ...data, lines: [] }), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to save the changes.') };
  }
}

/** Marks an entry void and puts back any stock it moved. */
export async function voidKitchenEntry(id: string, reason?: string | null): Promise<ServiceResult<KitchenEntry>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_void_entry', { p_entry_id: id, p_reason: reason ?? null });
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to void the entry.') };
    return { data: mapEntry({ ...data, lines: [] }), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to void the entry.') };
  }
}

// ─── Expense categories ──────────────────────────────────────────────────────

const CATEGORY_COLUMNS = 'id, name, sort_order, is_active';

function mapCategory(row: Record<string, unknown>): KitchenCategory {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    sort_order: toNumber(row.sort_order),
    is_active: row.is_active !== false,
  };
}

/**
 * The kitchen's expense categories, in its own order. A kitchen that has
 * none yet gets the usual ones written in, so the Spent screen is never
 * empty on day one; after that the list is whatever the kitchen makes it.
 */
export async function fetchKitchenCategories(includeInactive = false): Promise<ServiceResult<KitchenCategory[]>> {
  try {
    const { tenant_id, branch_id } = scope();
    const base = () => supabase.from('kitchen_categories').select(CATEGORY_COLUMNS).eq('tenant_id', tenant_id).eq('branch_id', branch_id);
    const read = () => (includeInactive ? base() : base().eq('is_active', true)).order('sort_order', { ascending: true }).order('name', { ascending: true });
    const first = await read();
    if (first.error) return { data: null, error: explain(first.error, 'Unable to load the categories.') };
    let rows = first.data ?? [];
    if (rows.length === 0) {
      const { count, error: countError } = await supabase
        .from('kitchen_categories')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);
      if (countError) return { data: null, error: explain(countError, 'Unable to load the categories.') };
      if ((count ?? 0) === 0) {
        const seed = DEFAULT_KITCHEN_CATEGORIES.map((name, i) => ({ tenant_id, branch_id, name, sort_order: (i + 1) * 10 }));
        const { error: seedError } = await supabase.from('kitchen_categories').insert(seed);
        // Another device may have written the same list a moment earlier; either way, read what is there.
        if (seedError && seedError.code !== '23505') return { data: null, error: explain(seedError, 'Unable to set up the categories.') };
        const again = await read();
        if (again.error) return { data: null, error: explain(again.error, 'Unable to load the categories.') };
        rows = again.data ?? [];
      }
    }
    return { data: rows.filter(isRecord).map(mapCategory), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the categories.') };
  }
}

/** Adds a category, or renames one when an id is given. Old entries keep the name they were saved with. */
export async function saveKitchenCategory(name: string, id?: string): Promise<ServiceResult<KitchenCategory>> {
  try {
    const { tenant_id, branch_id } = scope();
    const trimmed = name.trim();
    if (!trimmed) return { data: null, error: 'Give the category a name.' };
    if (trimmed.length > 40) return { data: null, error: 'Keep the category name to 40 letters.' };
    const query = id
      ? supabase.from('kitchen_categories').update({ name: trimmed, is_active: true }).eq('id', id).eq('tenant_id', tenant_id).eq('branch_id', branch_id)
      : supabase.from('kitchen_categories').insert({ tenant_id, branch_id, name: trimmed, sort_order: 100 });
    const { data, error } = await query.select(CATEGORY_COLUMNS).single();
    if (error || !isRecord(data)) return { data: null, error: explain(error, 'Unable to save the category.') };
    return { data: mapCategory(data), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to save the category.') };
  }
}

/** Hides a category from the picker, or brings it back. Entries under it are untouched. */
export async function setKitchenCategoryActive(id: string, isActive: boolean): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = scope();
    const { error } = await supabase.from('kitchen_categories').update({ is_active: isActive }).eq('id', id).eq('tenant_id', tenant_id).eq('branch_id', branch_id);
    if (error) return { data: false, error: explain(error, 'Unable to change the category.') };
    return { data: true, error: null };
  } catch (err) {
    return { data: false, error: explain(err, 'Unable to change the category.') };
  }
}
