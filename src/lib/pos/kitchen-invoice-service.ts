import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { kitchenToday, validKitchenDate } from '@/lib/pos/kitchen-analytics-utils';
import { describeAccessError } from '@/lib/pos/kitchen-utils';
import type { ServiceResult, KitchenMode } from '@/lib/pos/kitchen-types';
import type { InvoiceDelivery, InvoiceFilter, InvoiceLine, InvoiceWorkspace, KitchenInvoice } from '@/lib/pos/kitchen-invoice-types';

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => { if (typeof v !== 'string') throw Error('Invalid invoice'); return v; };
const integer = (v: unknown): number => { const n = Number(v); if ((typeof v !== 'number' && (typeof v !== 'string' || !/^\d+$/.test(v))) || !Number.isSafeInteger(n) || n < 0) throw Error('Invalid amount'); return n; };
const rows = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw Error('Invalid rows'); return v; };
const object = (v: unknown): Record<string, unknown> => { if (!record(v)) throw Error('Invalid record'); return v; };
const nullable = (v: unknown): string | null => v === null ? null : text(v);
function line(v: unknown): InvoiceLine {
  const r = object(v); const qty = Number(r.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw Error('Invalid quantity');
  return { id: text(r.id), item_name: text(r.item_name), unit: text(r.unit), qty, price_paise: integer(r.price_paise), line_paise: integer(r.line_paise) };
}
function delivery(v: unknown): InvoiceDelivery {
  const r = object(v); const lines = rows(r.lines).map(line); const amount = integer(r.amount_paise);
  if (!lines.length || lines.reduce((a, l) => a + l.line_paise, 0) !== amount || !validKitchenDate(text(r.entry_date))) throw Error('Invalid delivery');
  return { id: text(r.entry_id ?? r.id), entry_date: text(r.entry_date), amount_paise: amount, lines };
}
export function parseKitchenInvoice(v: unknown): KitchenInvoice {
  const r = object(v); const status = r.status;
  const total = integer(r.total_paise), covered = integer(r.covered_paise), open = integer(r.open_paise);
  if (!['paid', 'to_be_paid', 'cancelled'].includes(text(status)) || covered > total || open !== total - covered
    || !validKitchenDate(text(r.start_date)) || !validKitchenDate(text(r.end_date)) || text(r.start_date) > text(r.end_date)
    || (status !== 'cancelled' && (open === 0) !== (status === 'paid'))) throw Error('Invalid invoice totals');
  const deliveries = r.deliveries === undefined ? [] : rows(r.deliveries).map(delivery);
  if (r.deliveries !== undefined && (!deliveries.length || deliveries.reduce((a, d) => a + d.amount_paise, 0) !== total)) throw Error('Invalid invoice lines');
  return { id: text(r.id), invoice_no: integer(r.invoice_no), party_id: text(r.party_id), party_name: text(r.party_name), kitchen_name: text(r.kitchen_name),
    start_date: text(r.start_date), end_date: text(r.end_date), total_paise: total, covered_paise: covered, open_paise: open,
    status: status as KitchenInvoice['status'], created_at: text(r.created_at), created_by_name: text(r.created_by_name),
    cancelled_at: nullable(r.cancelled_at), cancel_reason: nullable(r.cancel_reason), deliveries };
}
function scope(): { p_tenant_id: string; p_branch_id: string } {
  return { p_tenant_id: getTenantContext().tenant_id, p_branch_id: kitchenBranch().id };
}
function validFilter(f: InvoiceFilter): boolean {
  return validKitchenDate(f.startDate) && validKitchenDate(f.endDate) && f.startDate <= f.endDate && f.endDate <= kitchenToday()
    && Number.isSafeInteger(f.page) && f.page >= 0 && f.page <= 100000 && (!f.candidates || !!f.partyId);
}
function safeError(error: unknown, write = false): string {
  const r = record(error) ? error : null; const code = r?.code; const message = typeof r?.message === 'string' ? r.message : '';
  if (code === 'PGRST202' || code === '42P01') return 'The invoice update is not on this database yet.';
  const access = describeAccessError(message);
  if (access) return access;
  if (message.includes('KITCHEN_INVOICE_CHANGED') || code === '23505') return 'The deliveries or payments changed. Refresh before trying again.';
  if (message.includes('KITCHEN_INVOICE_INVALID')) return 'Check the branch, dates and finished-goods deliveries.';
  return write ? 'Unable to confirm the save. Refresh invoices before trying again.' : 'Unable to load invoices. Please retry.';
}
export async function fetchKitchenInvoices(filter: InvoiceFilter, signal?: AbortSignal): Promise<ServiceResult<InvoiceWorkspace>> {
  try {
    if (!validFilter(filter)) return { data: null, error: 'Choose a branch and valid dates.' };
    const request = supabase.rpc('kitchen_invoice_workspace', { ...scope(), p_start_date: filter.startDate, p_end_date: filter.endDate,
      p_party_id: filter.partyId, p_page: filter.page, p_candidates: filter.candidates });
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) return { data: null, error: safeError(error) };
    const r = object(data);
    return { data: { rows: filter.candidates ? [] : rows(r.rows).map(parseKitchenInvoice), deliveries: filter.candidates ? rows(r.rows).map(delivery) : [],
      total_rows: integer(r.total_rows), branches: rows(r.branches).map(v => { const b = object(v); return { id: text(b.id), label: text(b.label) }; }) }, error: null };
  } catch { return { data: null, error: safeError(null) }; }
}
export async function fetchKitchenInvoice(id: string): Promise<ServiceResult<KitchenInvoice>> {
  try {
    const today = kitchenToday();
    const { data, error } = await supabase.rpc('kitchen_invoice_workspace', { ...scope(), p_start_date: today, p_end_date: today, p_invoice_id: id });
    if (error) return { data: null, error: safeError(error) };
    const r = object(data);
    if (!r.invoice) return { data: null, error: 'Invoice unavailable. Refresh the list.' };
    return { data: parseKitchenInvoice(r.invoice), error: null };
  } catch { return { data: null, error: safeError(null) }; }
}
export async function createKitchenInvoice(filter: InvoiceFilter, entries: readonly InvoiceDelivery[]): Promise<ServiceResult<string>> {
  try {
    if (!validFilter({ ...filter, candidates: true }) || !entries.length || entries.length > 100 || new Set(entries.map(e => e.id)).size !== entries.length
      || entries.some(e => !e.lines.length || e.entry_date < filter.startDate || e.entry_date > filter.endDate)) return { data: null, error: 'Select 1–100 deliveries for this branch and period.' };
    const total = entries.reduce((a, e) => a + e.amount_paise, 0);
    if (!Number.isSafeInteger(total) || total < 0) return { data: null, error: 'Check the delivery amounts.' };
    const { data, error } = await supabase.rpc('kitchen_create_invoice', { ...scope(), p_party_id: filter.partyId, p_start_date: filter.startDate,
      p_end_date: filter.endDate, p_entry_ids: entries.map(e => e.id), p_expected_total_paise: total });
    if (error || typeof data !== 'string') return { data: null, error: safeError(error, true) };
    return { data, error: null };
  } catch { return { data: null, error: safeError(null, true) }; }
}
export async function receiveKitchenInvoicePayment(id: string, amountPaise: number, date: string, mode: KitchenMode, requestKey: string, lockReason: string | null = null): Promise<ServiceResult<string>> {
  try {
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || !validKitchenDate(date) || date > kitchenToday() || !['cash', 'upi', 'bank'].includes(mode) || requestKey.length < 12 || requestKey.length > 80)
      return { data: null, error: 'Enter a valid payment amount, date and mode.' };
    const { data, error } = await supabase.rpc('kitchen_invoice_action', { ...scope(), p_invoice_id: id, p_action: 'receive',
      p_amount_paise: amountPaise, p_date: date, p_mode: mode, p_request_key: requestKey, p_lock_reason: lockReason?.trim() || null });
    if (error || typeof data !== 'string') return { data: null, error: safeError(error, true) };
    return { data, error: null };
  } catch { return { data: null, error: safeError(null, true) }; }
}
export async function cancelKitchenInvoice(id: string, reason: string): Promise<ServiceResult<string>> {
  try {
    if (!reason.trim() || reason.trim().length > 200) return { data: null, error: 'Enter a cancellation reason (up to 200 characters).' };
    const { data, error } = await supabase.rpc('kitchen_invoice_action', { ...scope(), p_invoice_id: id, p_action: 'cancel', p_note: reason.trim() });
    if (error || data !== id) return { data: null, error: safeError(error, true) };
    return { data, error: null };
  } catch { return { data: null, error: safeError(null, true) }; }
}
