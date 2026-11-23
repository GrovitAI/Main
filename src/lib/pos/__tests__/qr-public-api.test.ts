import { failureFor, handleMenu, handleOrder, handleStatus, readLines, type PublicDb } from '@/lib/server/qr-public';
import type { ApiRequest, ApiResponse } from '@/lib/server/api-auth';

const CODE = '0123456789abcdef0123';
const PRODUCT = '11111111-2222-3333-4444-555555555555';
const ORDER = '99999999-2222-3333-4444-555555555555';

type Reply = { status: number; body: unknown };
function reply(): { res: ApiResponse; out: Reply } {
  const out: Reply = { status: 0, body: null };
  const res: ApiResponse = {
    statusCode: 0,
    setHeader: () => undefined,
    end(body?: string) { out.status = this.statusCode; out.body = body ? JSON.parse(body) : null; },
  };
  return { res, out };
}

type Call = { fn: string; args: Record<string, unknown> };
/** A database that records its calls and answers each function from `answers` (rate limits allowed unless said). */
function database(answers: Record<string, { data?: unknown; error?: { message: string; code?: string; details?: string } }>, limited = false): { db: PublicDb; calls: Call[] } {
  const calls: Call[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'check_rate_limit') return { data: !limited, error: null };
      const a = answers[fn];
      return { data: a?.data ?? null, error: a?.error ?? null };
    },
  } as unknown as PublicDb;
  return { db, calls };
}
const get = (query: Record<string, string>): ApiRequest => ({ method: 'GET', headers: {}, query });
const post = (body: unknown): ApiRequest => ({ method: 'POST', headers: {}, body });
const rpcCalls = (calls: Call[]) => calls.filter((c) => c.fn !== 'check_rate_limit');

describe('readLines', () => {
  it('takes 1 to 30 lines of a product id and a quantity of 1 to 20', () => {
    expect(readLines([{ product_id: PRODUCT, qty: 2 }])).toEqual([{ product_id: PRODUCT, qty: 2 }]);
    expect(readLines([])).toBeNull();
    expect(readLines('x')).toBeNull();
    expect(readLines(Array.from({ length: 31 }, () => ({ product_id: PRODUCT, qty: 1 })))).toBeNull();
    expect(readLines([{ product_id: PRODUCT, qty: 0 }])).toBeNull();
    expect(readLines([{ product_id: PRODUCT, qty: 21 }])).toBeNull();
    expect(readLines([{ product_id: PRODUCT, qty: 1.5 }])).toBeNull();
    expect(readLines([{ product_id: 'nope', qty: 1 }])).toBeNull();
    expect(readLines([null])).toBeNull();
  });

  it('keeps only the id and quantity, so a price sent along is ignored', () => {
    expect(readLines([{ product_id: PRODUCT, qty: 1, price: 1, name: 'Free' }])).toEqual([{ product_id: PRODUCT, qty: 1 }]);
  });
});

describe('failureFor', () => {
  it('says what the page can show and nothing raw', () => {
    expect(failureFor('QR_CLOSED')).toEqual({ status: 404, error: 'closed' });
    expect(failureFor('QR_BUSY')).toEqual({ status: 429, error: 'busy' });
    expect(failureFor('QR_ITEM_GONE')).toEqual({ status: 409, error: 'item_gone' });
    expect(failureFor('QR_INVALID')).toEqual({ status: 400, error: 'invalid' });
    expect(failureFor('relation "qr_orders" does not exist')).toEqual({ status: 500, error: 'unavailable' });
  });
});

describe('GET /api/public/menu', () => {
  it('answers 404 without asking the database for a code that is not a table code', async () => {
    const { db, calls } = database({});
    const { res, out } = reply();
    await handleMenu(get({ code: 'DROP TABLE' }), res, db);
    expect(out.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('returns the menu for a table', async () => {
    const menu = { branch: 'Kolathur', table: 'T1', categories: [], items: [] };
    const { db, calls } = database({ qr_public_menu: { data: menu } });
    const { res, out } = reply();
    await handleMenu(get({ code: CODE }), res, db);
    expect(out).toEqual({ status: 200, body: { data: menu } });
    expect(rpcCalls(calls)).toEqual([{ fn: 'qr_public_menu', args: { p_code: CODE } }]);
  });

  it('answers 404 when the table is off or unknown', async () => {
    const { db } = database({ qr_public_menu: { data: null } });
    const { res, out } = reply();
    await handleMenu(get({ code: CODE }), res, db);
    expect(out.status).toBe(404);
    expect(out.body).toEqual({ error: 'closed' });
  });

  it('is limited by address and by table, and says unavailable when the server has no key or the database fails', async () => {
    const limited = database({}, true);
    const a = reply();
    await handleMenu(get({ code: CODE }), a.res, limited.db);
    expect(a.out.status).toBe(429);
    expect(rpcCalls(limited.calls)).toHaveLength(0);
    const none = reply();
    await handleMenu(get({ code: CODE }), none.res, null);
    expect(none.out.status).toBe(503);
    const broken = database({ qr_public_menu: { error: { message: 'boom', code: 'XX000' } } });
    const b = reply();
    await handleMenu(get({ code: CODE }), b.res, broken.db);
    expect(b.out).toEqual({ status: 500, body: { error: 'unavailable' } });
  });

  it('refuses other methods', async () => {
    const { res, out } = reply();
    await handleMenu({ method: 'DELETE', headers: {} }, res, database({}).db);
    expect(out.status).toBe(405);
  });
});

describe('POST /api/public/order', () => {
  const good = { code: CODE, key: 'verify-key-0001', items: [{ product_id: PRODUCT, qty: 2 }], name: ' Asha ', note: 'less sweet' };

  it('sends only the code, the lines, the name, the note and the key to the database', async () => {
    const placed = { id: ORDER, status: 'pending', total: 240, table: 'T1' };
    const { db, calls } = database({ qr_place_order: { data: placed } });
    const { res, out } = reply();
    await handleOrder(post({ ...good, tenant_id: 'x', branch_id: 'y', total: 1, items: [{ product_id: PRODUCT, qty: 2, price: 0 }] }), res, db);
    expect(out).toEqual({ status: 200, body: { data: placed } });
    expect(rpcCalls(calls)).toEqual([{ fn: 'qr_place_order', args: { p_code: CODE, p_items: [{ product_id: PRODUCT, qty: 2 }], p_customer_name: 'Asha', p_note: 'less sweet', p_request_key: 'verify-key-0001' } }]);
  });

  it('refuses a body that is not a table code, a key and 1 to 30 valid lines', async () => {
    for (const body of [{ ...good, code: 'x' }, { ...good, key: 'short' }, { ...good, items: [] }, { ...good, items: [{ product_id: PRODUCT, qty: 99 }] }, { ...good, name: 'n'.repeat(61) }, { ...good, note: 'n'.repeat(201) }]) {
      const { db, calls } = database({});
      const { res, out } = reply();
      await handleOrder(post(body), res, db);
      expect([400, 404]).toContain(out.status);
      expect(calls).toHaveLength(0);
    }
  });

  it('maps the database refusals to what the page shows', async () => {
    for (const [message, status, error] of [['QR_BUSY', 429, 'busy'], ['QR_CLOSED', 404, 'closed'], ['QR_ITEM_GONE', 409, 'item_gone'], ['boom', 500, 'unavailable']] as const) {
      const { db } = database({ qr_place_order: { error: { message } } });
      const { res, out } = reply();
      await handleOrder(post(good), res, db);
      expect(out).toEqual({ status, body: { error } });
    }
  });

  it('is limited by address and by table', async () => {
    const { db, calls } = database({}, true);
    const { res, out } = reply();
    await handleOrder(post(good), res, db);
    expect(out.status).toBe(429);
    expect(rpcCalls(calls)).toHaveLength(0);
  });

  it('refuses a GET', async () => {
    const { res, out } = reply();
    await handleOrder(get({}), res, database({}).db);
    expect(out.status).toBe(405);
  });
});

describe('GET /api/public/order-status', () => {
  it('asks for one order of one table', async () => {
    const { db, calls } = database({ qr_order_status: { data: { status: 'declined', reason: 'Sold out' } } });
    const { res, out } = reply();
    await handleStatus(get({ code: CODE, id: ORDER }), res, db);
    expect(out).toEqual({ status: 200, body: { data: { status: 'declined', reason: 'Sold out' } } });
    expect(rpcCalls(calls)).toEqual([{ fn: 'qr_order_status', args: { p_code: CODE, p_order_id: ORDER } }]);
  });

  it('answers 404 for a bad code or id, or an order of another table', async () => {
    const bad = database({});
    const a = reply();
    await handleStatus(get({ code: CODE, id: 'nope' }), a.res, bad.db);
    expect(a.out.status).toBe(404);
    expect(bad.calls).toHaveLength(0);
    const other = database({ qr_order_status: { data: null } });
    const b = reply();
    await handleStatus(get({ code: CODE, id: ORDER }), b.res, other.db);
    expect(b.out.status).toBe(404);
  });
});
