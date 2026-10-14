import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { fetchKitchenItems, saveKitchenItem, postKitchenEntry } from '@/lib/pos/kitchen-service';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('@/lib/pos/use-session-store', () => ({ useSessionStore: { getState: () => ({ session: { role: 'kitchen', displayName: 'Chef', branchName: 'Kitchen' } }) } }));

const calls: [string, unknown[]][] = [];
let result: { data: unknown; error: unknown };
function query(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'insert', 'update', 'single']) {
    chain[method] = (...args: unknown[]) => { calls.push([method, args]); return chain; };
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}
const row = { id: 'stock-item', name: 'Sauce', unit: 'kg', item_kind: 'finished_good', sell_price_paise: null, stock: '2.500', is_active: true, updated_at: '' };
beforeEach(() => {
  jest.clearAllMocks(); calls.length = 0;
  result = { data: row, error: null };
  (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant', branch_id: 'kitchen' });
  (supabase.from as jest.Mock).mockImplementation(query);
});
test('an unpriced finished good keeps its explicit kind and scoped read', async () => {
  result.data = [row, { ...row, id: 'milk', item_kind: 'raw_material', sell_price_paise: 5000 }];
  const res = await fetchKitchenItems();
  expect(res.data?.map(i => i.item_kind)).toEqual(['finished_good', 'raw_material']);
  expect(res.data?.[0]?.stock).toBe(2.5);
  expect(calls).toContainEqual(['eq', ['tenant_id', 'tenant']]);
  expect(calls).toContainEqual(['eq', ['branch_id', 'kitchen']]);
});
test('new unpriced finished goods persist kind, opening quantity and scope', async () => {
  await saveKitchenItem({ name: 'Sauce', unit: 'kg', item_kind: 'finished_good', sell_price: null, opening_stock: 2.5 });
  expect(calls).toContainEqual(['insert', [{ name: 'Sauce', unit: 'kg', item_kind: 'finished_good', sell_price_paise: null, tenant_id: 'tenant', branch_id: 'kitchen', stock: 2.5 }]]);
});
test('a price-only legacy edit never changes the persisted item kind or stock', async () => {
  await saveKitchenItem({ name: 'Sauce', unit: 'kg', sell_price: 50, opening_stock: 999 }, 'stock-item');
  expect(calls).toContainEqual(['update', [{ name: 'Sauce', unit: 'kg', sell_price_paise: 5000 }]]);
  expect(calls).toContainEqual(['eq', ['tenant_id', 'tenant']]);
  expect(calls).toContainEqual(['eq', ['branch_id', 'kitchen']]);
});
test('batch rejection is sanitized and reports no successful write', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { code: '22023', message: 'KITCHEN_FINISHED_GOODS_ONLY private-detail' } });
  expect(await postKitchenEntry({ type: 'made', item_id: 'milk', qty: 5 })).toEqual({ data: null, error: 'Batches can only be recorded for finished goods.' });
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_post_entry', { p: expect.objectContaining({ branch_id: 'kitchen', type: 'made', item_id: 'milk', qty: 5 }) });
  jest.restoreAllMocks();
});
test('a finished good keeps its cost per unit in paise, and an edit without a cost leaves it alone', async () => {
  result.data = { ...row, cost_price_paise: 4850 };
  const saved = await saveKitchenItem({ name: 'Sauce', unit: 'kg', sell_price: 75, cost_price: 48.5 }, 'stock-item');
  expect(calls).toContainEqual(['update', [{ name: 'Sauce', unit: 'kg', sell_price_paise: 7500, cost_price_paise: 4850 }]]);
  expect(saved.data?.cost_price).toBe(48.5);
  calls.length = 0;
  await saveKitchenItem({ name: 'Sauce', unit: 'kg', sell_price: 75 }, 'stock-item');
  expect(calls).toContainEqual(['update', [{ name: 'Sauce', unit: 'kg', sell_price_paise: 7500 }]]);
});
test('items still load from a database without the cost column, without costs', async () => {
  const responses = [{ data: null, error: { code: '42703', message: 'column kitchen_items.cost_price_paise does not exist' } }, { data: [row], error: null }];
  (supabase.from as jest.Mock).mockImplementation(() => { const chain = query(); chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(responses.shift()).then(resolve); return chain; });
  const res = await fetchKitchenItems();
  expect(res.error).toBeNull();
  expect(res.data?.[0]?.cost_price).toBeNull();
  expect(calls.filter(([method]) => method === 'select').map(([, args]) => String(args[0]).includes('cost_price_paise'))).toEqual([true, false]);
});
