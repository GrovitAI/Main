/**
 * Task 331: the customer's calls for a table's QR menu: the menu, sending an order, and where it
 * stands. Nobody is signed in, so these go to the one function /api/public/qr with no token; the table's code is the
 * only thing that says which table. Never throws; a failure comes back as a kind the page can word.
 */
import { getApiBaseUrl } from '@/lib/pos/api-client';
import { parseQrMenu, parseQrStatus, type QrMenu, type QrOrderStatus } from '@/lib/pos/qr-menu-utils';

/** closed: no such table or ordering is off · busy: too many orders or requests · item_gone: something left the menu
 *  · invalid: the order was not accepted as sent · offline: no connection · unavailable: anything else. */
export type QrFailure = 'closed' | 'busy' | 'item_gone' | 'invalid' | 'offline' | 'unavailable';
export type QrResult<T> = { data: T; error: null } | { data: null; error: QrFailure };
export type QrPlaced = { id: string; table: string };

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function kindOf(status: number, body: unknown): QrFailure {
  const named = record(body) && typeof body.error === 'string' ? body.error : '';
  if (named === 'closed' || named === 'busy' || named === 'item_gone' || named === 'invalid') return named;
  if (status === 404) return 'closed';
  if (status === 429) return 'busy';
  return 'unavailable';
}

async function call(path: string, init?: { method: 'POST'; body: unknown }): Promise<QrResult<unknown>> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/public/qr${path}`, init
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(init.body) }
      : { method: 'GET', headers: { Accept: 'application/json' } });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) return { data: null, error: kindOf(res.status, body) };
    return record(body) && 'data' in body ? { data: body.data, error: null } : { data: null, error: 'unavailable' };
  } catch {
    return { data: null, error: 'offline' };
  }
}

export async function fetchQrMenu(code: string): Promise<QrResult<QrMenu>> {
  const r = await call(`?kind=menu&code=${encodeURIComponent(code)}`);
  if (r.error) return r;
  const menu = parseQrMenu(r.data);
  return menu ? { data: menu, error: null } : { data: null, error: 'unavailable' };
}

export async function placeQrOrder(input: { code: string; key: string; items: { product_id: string; qty: number }[]; name: string; note: string }): Promise<QrResult<QrPlaced>> {
  const r = await call('', { method: 'POST', body: input });
  if (r.error) return r;
  if (!record(r.data) || typeof r.data.id !== 'string') return { data: null, error: 'unavailable' };
  return { data: { id: r.data.id, table: typeof r.data.table === 'string' ? r.data.table : '' }, error: null };
}

export async function fetchQrOrderStatus(code: string, id: string): Promise<QrResult<QrOrderStatus>> {
  const r = await call(`?kind=status&code=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`);
  if (r.error) return r;
  const status = parseQrStatus(r.data);
  return status ? { data: status, error: null } : { data: null, error: 'unavailable' };
}
