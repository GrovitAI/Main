/**
 * Task 330: the public side of table ordering. A customer scans a table's QR code and the page calls
 * three endpoints (/api/public/menu, /order, /order-status). Nobody is signed in, so these run with
 * the server's service role against three functions that only that role may call. The code in the QR
 * is the only thing that names a table; the tenant, the branch and every price come from the
 * database, never from the request. Each call is also rate limited by address and by table.
 *
 * Node.js only — never import from React Native code.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { applyCors, getClientIp, readJsonBody, readString, sendJson, type ApiRequest, type ApiResponse } from './api-auth';

export const QR_CODE_RE = /^[0-9a-f]{20}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the handlers need from the database: the rpc call, so tests can stand in for it. */
export type PublicDb = Pick<SupabaseClient, 'rpc'>;

/** The server's service-role client, or null when the server is not set up for it. */
export function publicDb(): SupabaseClient | null {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  if (!key || !url) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** True when the call is within the limit. Fails open if the limiter is unavailable, as the staff API does. */
async function within(db: PublicDb, key: string, limit: number, seconds: number): Promise<boolean> {
  const { data, error } = await db.rpc('check_rate_limit', { p_key: key, p_limit: limit, p_window_seconds: seconds });
  if (error) {
    console.error('[public-api] check_rate_limit unavailable:', error.message);
    return true;
  }
  return data !== false;
}

type Failure = { status: number; error: string };

/** The database's error text mapped to what the customer's page can say; nothing raw leaves the server. */
export function failureFor(message: string): Failure {
  if (message.includes('QR_CLOSED')) return { status: 404, error: 'closed' };
  if (message.includes('QR_BUSY')) return { status: 429, error: 'busy' };
  if (message.includes('QR_ITEM_GONE')) return { status: 409, error: 'item_gone' };
  if (message.includes('QR_INVALID')) return { status: 400, error: 'invalid' };
  return { status: 500, error: 'unavailable' };
}

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function query(req: ApiRequest, name: string): string | null {
  const direct = first(req.query?.[name]);
  if (direct) return direct;
  // A bare Node request has no parsed query; read it from the url.
  try {
    return new URL(req.url ?? '', 'http://x').searchParams.get(name);
  } catch {
    return null;
  }
}

const notConfigured = (res: ApiResponse): void => sendJson(res, 503, { error: 'unavailable' });

/** GET /api/public/menu?code=… : the table's menu, or 404 when the code is unknown or ordering is off. */
export async function handleMenu(req: ApiRequest, res: ApiResponse, db: PublicDb | null): Promise<void> {
  if (applyCors(req, res, 'GET')) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'invalid' });
  if (!db) return notConfigured(res);
  const code = query(req, 'code');
  if (!code || !QR_CODE_RE.test(code)) return sendJson(res, 404, { error: 'closed' });
  if (!(await within(db, `qr:menu:${getClientIp(req)}`, 300, 3600)) || !(await within(db, `qr:menu:${code}`, 1500, 3600))) {
    return sendJson(res, 429, { error: 'busy' });
  }
  const { data, error } = await db.rpc('qr_public_menu', { p_code: code });
  if (error) {
    console.error('[public-api] menu failed:', error.code, error.message);
    return sendJson(res, 500, { error: 'unavailable' });
  }
  if (!data) return sendJson(res, 404, { error: 'closed' });
  return sendJson(res, 200, { data });
}

type Line = { product_id: string; qty: number };

/** The lines of a posted order, or null when they are not 1 to 30 lines of an id and a quantity of 1 to 20. */
export function readLines(value: unknown): Line[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;
  const lines: Line[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const row = raw as Record<string, unknown>;
    const id = row.product_id;
    const qty = row.qty;
    if (typeof id !== 'string' || !UUID_RE.test(id) || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 20) return null;
    lines.push({ product_id: id, qty });
  }
  return lines;
}

/** POST /api/public/order {code, key, items, name?, note?} : places the order; 200 with its id. */
export async function handleOrder(req: ApiRequest, res: ApiResponse, db: PublicDb | null): Promise<void> {
  if (applyCors(req, res, 'POST')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'invalid' });
  if (!db) return notConfigured(res);
  const body = readJsonBody(req);
  const code = readString(body.code);
  const key = readString(body.key);
  const lines = readLines(body.items);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!code || !QR_CODE_RE.test(code)) return sendJson(res, 404, { error: 'closed' });
  if (!key || key.length < 12 || key.length > 80 || !lines || name.length > 60 || note.length > 200) return sendJson(res, 400, { error: 'invalid' });
  if (!(await within(db, `qr:order:${getClientIp(req)}`, 30, 3600)) || !(await within(db, `qr:order:${code}`, 60, 3600))) {
    return sendJson(res, 429, { error: 'busy' });
  }
  const { data, error } = await db.rpc('qr_place_order', { p_code: code, p_items: lines, p_customer_name: name || null, p_note: note || null, p_request_key: key });
  if (error) {
    const failure = failureFor(`${error.message} ${error.details ?? ''}`);
    if (failure.status === 500) console.error('[public-api] order failed:', error.code, error.message);
    return sendJson(res, failure.status, { error: failure.error });
  }
  return sendJson(res, 200, { data });
}

/** GET /api/public/order-status?code=…&id=… : pending, accepted, declined (with a reason) or expired. */
export async function handleStatus(req: ApiRequest, res: ApiResponse, db: PublicDb | null): Promise<void> {
  if (applyCors(req, res, 'GET')) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'invalid' });
  if (!db) return notConfigured(res);
  const code = query(req, 'code');
  const id = query(req, 'id');
  if (!code || !QR_CODE_RE.test(code) || !id || !UUID_RE.test(id)) return sendJson(res, 404, { error: 'closed' });
  if (!(await within(db, `qr:status:${getClientIp(req)}`, 900, 3600))) return sendJson(res, 429, { error: 'busy' });
  const { data, error } = await db.rpc('qr_order_status', { p_code: code, p_order_id: id });
  if (error) {
    console.error('[public-api] status failed:', error.code, error.message);
    return sendJson(res, 500, { error: 'unavailable' });
  }
  if (!data) return sendJson(res, 404, { error: 'closed' });
  return sendJson(res, 200, { data });
}
