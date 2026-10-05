import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { fetchAnalyticsDashboard } from '@/lib/analytics/analytics-service';
import { fetchAnalyticsTransactions } from '@/lib/pos/analytics-export-service';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));


type Row = Record<string, unknown>;
type Query = { table: string; calls: [string, unknown[]][]; from: number; to: number; ids: string[] };
const queries: Query[] = [];
let bills: Row[];
let items: Row[];
let fail: ((query: Query) => boolean) | undefined;
const filters = { startDate: '2026-09-21', endDate: '2026-10-05' };

function makeQuery(table: string): Record<string, unknown> {
  const recorded: Query = { table, calls: [], from: 0, to: 999, ids: [] };
  queries.push(recorded);
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'or', 'order', 'in', 'range']) {
    query[method] = (...args: unknown[]) => {
      recorded.calls.push([method, args]);
      if (method === 'range') [recorded.from, recorded.to] = args as [number, number];
      if (method === 'in') recorded.ids = args[1] as string[];
      return query;
    };
  }
  query.then = (resolve: (value: unknown) => unknown) => {
    const rows = table === 'bills' ? bills : items.filter((item) => recorded.ids.includes(String(item.bill_id)));
    return Promise.resolve(fail?.(recorded)
      ? { data: null, error: { message: 'private database error' } }
      : { data: rows.slice(recorded.from, recorded.to + 1), error: null }).then(resolve);
  };
  return query;
}

function bill(id: string): Row {
  return { id, invoice_number: id, created_at: '2026-10-01T12:00:00Z', subtotal: '100', tax_amount: '5', discount_amount: '0', total_amount: '105', status: 'paid', branches: { name: 'Home' } };
}

beforeEach(() => {
  jest.clearAllMocks();
  queries.length = 0;
  bills = [bill('bill-1')];
  items = [{ bill_id: 'bill-1', qty: 2, item_name: 'Dessert' }];
  fail = undefined;
  (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant-1', branch_id: 'branch-1', canViewAllBranches: false });
  (supabase.from as jest.Mock).mockImplementation(makeQuery);
});

test('dashboard loads only four aggregate RPCs without CSV detail reads', async () => {
  (supabase.rpc as jest.Mock).mockImplementation((name: string) => Promise.resolve({ error: null, data:
    name === 'get_analytics_summary' ? { totalSales: 105, totalOrders: 1 } :
    name === 'get_analytics_sales_trend' ? { salesByDay: [{ label: '1 Oct', sales: 105, orders: 1 }], salesByHour: [] } : [],
  }));
  const result = await fetchAnalyticsDashboard(filters);
  expect(result.error).toBeNull();
  expect(result.data?.kpis.totalSales).toBe(105);
  expect(result.data?.salesByDay).toHaveLength(1);
  expect(result.data?.rawTransactions).toEqual([]);
  expect(supabase.rpc).toHaveBeenCalledTimes(4);
  expect(supabase.from).not.toHaveBeenCalled();
});

test('export preserves values and scopes parent bills and items to the staff branch', async () => {
  const result = await fetchAnalyticsTransactions({ ...filters, branchId: 'another-branch' });
  expect(result.error).toBeNull();
  expect(result.data?.[0]).toMatchObject({ items_summary: '2x Dessert', subtotal: 100, total_amount: 105, branch_name: 'Home' });
  expect(queries[0]?.calls).toContainEqual(['eq', ['tenant_id', 'tenant-1']]);
  expect(queries[0]?.calls).toContainEqual(['eq', ['branch_id', 'branch-1']]);
  expect(queries[1]?.calls).toContainEqual(['eq', ['bills.tenant_id', 'tenant-1']]);
  expect(queries[1]?.calls).toContainEqual(['eq', ['bills.branch_id', 'branch-1']]);
});

test('owner may export a selected branch or all branches, as in the dashboard', async () => {
  (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant-1', branch_id: 'branch-1', canViewAllBranches: true });
  await fetchAnalyticsTransactions({ ...filters, branchId: 'selected-branch' });
  expect(queries[0]?.calls).toContainEqual(['eq', ['branch_id', 'selected-branch']]);
  expect(queries[1]?.calls).toContainEqual(['eq', ['bills.branch_id', 'selected-branch']]);
  queries.length = 0;
  await fetchAnalyticsTransactions(filters);
  expect(queries.every((q) => q.calls.some(([method, args]) => method === 'eq' && args[0] === (q.table === 'bills' ? 'tenant_id' : 'bills.tenant_id')))).toBe(true);
  expect(queries.some((q) => q.calls.some(([method, args]) => method === 'eq' && String(args[0]).endsWith('branch_id')))).toBe(false);
});

test('exports beyond the 1,000-bill page without losing bill items', async () => {
  bills = Array.from({ length: 1201 }, (_, i) => bill(`bill-${i}`));
  items = bills.map((row) => ({ bill_id: row.id, qty: 1, item_name: 'Dessert' }));
  const result = await fetchAnalyticsTransactions(filters);
  expect(result.data).toHaveLength(1201);
  expect(result.data?.every((row) => row.items_summary === '1x Dessert')).toBe(true);
  expect(queries.filter((q) => q.table === 'bills')).toHaveLength(2);
});

test('also paginates a large item chunk', async () => {
  items = Array.from({ length: 1050 }, () => ({ bill_id: 'bill-1', qty: 1, item_name: 'Dessert' }));
  const result = await fetchAnalyticsTransactions(filters);
  expect(result.data?.[0]?.items_summary.split(', ')).toHaveLength(1050);
  expect(queries.filter((q) => q.table === 'bill_items')).toHaveLength(2);
});

test('failed later bill pages reject the whole export without leaking raw errors', async () => {
  bills = Array.from({ length: 1001 }, (_, i) => bill(`bill-${i}`));
  fail = (q) => q.table === 'bills' && q.from === 1000;
  const result = await fetchAnalyticsTransactions(filters);
  expect(result.data).toBeNull();
  expect(result.error).toMatch(/retry/i);
  expect(result.error).not.toContain('private');
  expect(queries.some((q) => q.table === 'bill_items')).toBe(false);
});

test('failed item reads do not produce an incomplete CSV', async () => {
  fail = (q) => q.table === 'bill_items';
  expect((await fetchAnalyticsTransactions(filters)).data).toBeNull();
});

test('empty exports skip all item requests', async () => {
  bills = [];
  expect(await fetchAnalyticsTransactions(filters)).toEqual({ data: [], error: null });
  expect(queries).toHaveLength(1);
});

test('missing session is a sanitized export error', async () => {
  (getTenantContext as jest.Mock).mockImplementation(() => { throw new Error('private session detail'); });
  const result = await fetchAnalyticsTransactions(filters);
  expect(result.data).toBeNull();
  expect(result.error).not.toContain('private');
  expect(supabase.from).not.toHaveBeenCalled();
});
