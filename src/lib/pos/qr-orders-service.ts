/**
 * Tasks 332-333: table ordering, staff side. A manager switches a branch's table ordering on and lists
 * its tables; the till lists the orders customers have sent and accepts or declines them. Every call
 * goes through a database function that checks the signed-in role and the branch, and each is scoped
 * by tenant and branch. Never throws; a failure comes back as plain words.
 */
import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import type { QrSettings, QrTable } from '@/lib/pos/qr-table-utils';

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string };
export type QrOrderLine = { product_id: string; name: string; price: number; qty: number };
export type QrPendingOrder = { id: string; table: string; customer_name: string | null; note: string | null; items: QrOrderLine[]; total: number; created_at: string };
export type QrPending = { enabled: boolean; orders: QrPendingOrder[] };

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export function parseQrSettings(v: unknown): QrSettings {
  const r = record(v) ? v : {};
  const tables = (Array.isArray(r.tables) ? r.tables : []).filter(record)
    .filter((t) => typeof t.id === 'string' && typeof t.label === 'string' && typeof t.code === 'string')
    .map((t): QrTable => ({ id: str(t.id), label: str(t.label), code: str(t.code), is_active: t.is_active !== false }));
  return { enabled: r.enabled === true, tables };
}

export function parseQrPending(v: unknown): QrPending {
  const r = record(v) ? v : {};
  const orders = (Array.isArray(r.orders) ? r.orders : []).filter(record).filter((o) => typeof o.id === 'string').map((o): QrPendingOrder => ({
    id: str(o.id), table: str(o.table), customer_name: text(o.customer_name), note: text(o.note), total: num(o.total), created_at: str(o.created_at),
    items: (Array.isArray(o.items) ? o.items : []).filter(record).map((l): QrOrderLine => ({ product_id: str(l.product_id), name: str(l.name), price: num(l.price), qty: num(l.qty) })),
  }));
  return { enabled: r.enabled === true, orders };
}

/** The tenant, and the branch: the signed-in one, or (for the owner setting up another outlet) the one named. The database checks the login may use it. */
function scope(branchId?: string): { p_tenant_id: string; p_branch_id: string } {
  const { tenant_id, branch_id } = getTenantContext();
  return { p_tenant_id: tenant_id, p_branch_id: branchId ?? branch_id };
}

/** Said when this login may not work with table orders, or the database has no table ordering yet; asking again would not help. */
export const QR_NOT_ALLOWED = 'This login cannot do that.';
export const QR_NEEDS_UPDATE = 'Table ordering needs the latest database update.';

/** What went wrong, in words for the person at the till. */
export function explainQr(error: unknown, write: boolean): string {
  const message = record(error) && typeof error.message === 'string' ? error.message : '';
  const code = record(error) ? error.code : undefined;
  if (code === 'PGRST202' || code === '42P01') return QR_NEEDS_UPDATE;
  if (message.includes('QR_FORBIDDEN') || code === '42501') return QR_NOT_ALLOWED;
  if (message.includes('QR_DECIDED')) return 'That order was already answered.';
  if (message.includes('QR_EXPIRED')) return 'That order is too old. Ask the customer to order again.';
  if (message.includes('QR_DUPLICATE')) return 'A table with that name already exists.';
  if (message.includes('QR_INVALID')) return 'Check the table names. A branch can have up to 100.';
  return write ? 'Unable to confirm the save. Refresh before trying again.' : 'Unable to load table orders. Please retry.';
}

async function run<T>(write: boolean, call: () => PromiseLike<{ data: unknown; error: unknown }>, read: (data: unknown) => T | null): Promise<ServiceResult<T>> {
  try {
    const { data, error } = await call();
    if (error) return { data: null, error: explainQr(error, write) };
    const value = read(data);
    return value === null ? { data: null, error: explainQr(null, write) } : { data: value, error: null };
  } catch (err) {
    return { data: null, error: explainQr(err, write) };
  }
}

export const fetchQrSettings = (branchId?: string): Promise<ServiceResult<QrSettings>> => run(false, () => supabase.rpc('qr_settings_get', scope(branchId)), parseQrSettings);

export const setQrEnabled = (enabled: boolean, branchId?: string): Promise<ServiceResult<boolean>> =>
  run(true, () => supabase.rpc('qr_set_enabled', { ...scope(branchId), p_enabled: enabled }), (d) => (d === true || d === false ? d : null));

export const addQrTables = (labels: string[], branchId?: string): Promise<ServiceResult<number>> =>
  run(true, () => supabase.rpc('qr_add_tables', { ...scope(branchId), p_labels: labels }), (d) => (typeof d === 'number' ? d : null));

export const updateQrTable = (id: string, change: { label?: string; active?: boolean; newCode?: boolean }, branchId?: string): Promise<ServiceResult<boolean>> =>
  run(true, () => supabase.rpc('qr_update_table', { ...scope(branchId), p_id: id, p_label: change.label ?? null, p_active: change.active ?? null, p_new_code: change.newCode ?? null }), (d) => (d === true ? true : null));

export const fetchQrPending = (): Promise<ServiceResult<QrPending>> => run(false, () => supabase.rpc('qr_pending', scope()), parseQrPending);

/** Puts a waiting order's items on the table's open order (new, or the one already open); returns that order. */
export const acceptQrOrder = (id: string): Promise<ServiceResult<{ open_order_id: string; table: string }>> =>
  run(true, () => supabase.rpc('qr_accept', { ...scope(), p_order_id: id }), (d) => (record(d) && typeof d.open_order_id === 'string' ? { open_order_id: d.open_order_id, table: str(d.table) } : null));

export const declineQrOrder = (id: string, reason: string): Promise<ServiceResult<boolean>> =>
  run(true, () => supabase.rpc('qr_decline', { ...scope(), p_order_id: id, p_reason: reason.trim() || null }), (d) => (d === true ? true : null));
