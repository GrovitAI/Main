import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { acceptQrOrder, addQrTables, declineQrOrder, explainQr, fetchQrPending, fetchQrSettings, parseQrPending, parseQrSettings, QR_NEEDS_UPDATE, QR_NOT_ALLOWED, setQrEnabled, updateQrTable } from '@/lib/pos/qr-orders-service';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));
const rpc = supabase.rpc as unknown as jest.Mock;
const scope = { p_tenant_id: 'tenant', p_branch_id: 'branch' };

beforeEach(() => {
  rpc.mockReset();
  (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant', branch_id: 'branch' });
});

describe('parsing', () => {
  it('reads settings and drops tables without an id, name and code', () => {
    expect(parseQrSettings({ enabled: true, tables: [{ id: 't1', label: '4', code: 'abc', is_active: false }, { id: 't2', label: '5' }, null] }))
      .toEqual({ enabled: true, tables: [{ id: 't1', label: '4', code: 'abc', is_active: false }] });
    expect(parseQrSettings(undefined)).toEqual({ enabled: false, tables: [] });
  });

  it('reads waiting orders with their lines and total', () => {
    const parsed = parseQrPending({ enabled: true, orders: [{ id: 'o1', table: '4', customer_name: ' ', note: 'less sweet', total: '463.5', created_at: '2026-11-23T05:00:00Z', items: [{ product_id: 'p', name: 'Lassi', price: '99.5', qty: 2 }, 'bad'] }, { table: 'no id' }] });
    expect(parsed.enabled).toBe(true);
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0]).toMatchObject({ id: 'o1', table: '4', customer_name: null, note: 'less sweet', total: 463.5 });
    expect(parsed.orders[0]?.items).toEqual([{ product_id: 'p', name: 'Lassi', price: 99.5, qty: 2 }]);
  });
});

describe('explainQr', () => {
  it('says what went wrong in plain words and never shows a raw error', () => {
    expect(explainQr({ message: 'QR_FORBIDDEN', code: '42501' }, true)).toBe(QR_NOT_ALLOWED);
    expect(explainQr({ code: 'PGRST202' }, false)).toBe(QR_NEEDS_UPDATE);
    expect(explainQr({ message: 'QR_DECIDED' }, true)).toBe('That order was already answered.');
    expect(explainQr({ message: 'QR_EXPIRED' }, true)).toBe('That order is too old. Ask the customer to order again.');
    expect(explainQr({ message: 'QR_DUPLICATE' }, true)).toBe('A table with that name already exists.');
    expect(explainQr({ message: 'relation "x" does not exist' }, false)).toBe('Unable to load table orders. Please retry.');
    expect(explainQr(new Error('boom'), true)).toBe('Unable to confirm the save. Refresh before trying again.');
  });
});

describe('calls', () => {
  it('scope every call by tenant and branch', async () => {
    rpc.mockResolvedValue({ data: { enabled: false, tables: [] }, error: null });
    await fetchQrSettings();
    expect(rpc).toHaveBeenLastCalledWith('qr_settings_get', scope);
    rpc.mockResolvedValue({ data: { enabled: true, orders: [] }, error: null });
    await fetchQrPending();
    expect(rpc).toHaveBeenLastCalledWith('qr_pending', scope);
    rpc.mockResolvedValue({ data: true, error: null });
    await setQrEnabled(true);
    expect(rpc).toHaveBeenLastCalledWith('qr_set_enabled', { ...scope, p_enabled: true });
    rpc.mockResolvedValue({ data: 2, error: null });
    await addQrTables(['5', '6']);
    expect(rpc).toHaveBeenLastCalledWith('qr_add_tables', { ...scope, p_labels: ['5', '6'] });
    rpc.mockResolvedValue({ data: true, error: null });
    await updateQrTable('t1', { label: 'Terrace', newCode: true });
    expect(rpc).toHaveBeenLastCalledWith('qr_update_table', { ...scope, p_id: 't1', p_label: 'Terrace', p_active: null, p_new_code: true });
    await declineQrOrder('o1', '  Sold out ');
    expect(rpc).toHaveBeenLastCalledWith('qr_decline', { ...scope, p_order_id: 'o1', p_reason: 'Sold out' });
  });

  it('accepting returns the open order the items joined', async () => {
    rpc.mockResolvedValue({ data: { open_order_id: 'oo1', table: '4', merged: true }, error: null });
    expect(await acceptQrOrder('o1')).toEqual({ data: { open_order_id: 'oo1', table: '4' }, error: null });
    expect(rpc).toHaveBeenLastCalledWith('qr_accept', { ...scope, p_order_id: 'o1' });
  });

  it('answers with words when the database refuses or the call fails, and never throws', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'QR_DECIDED' } });
    expect(await acceptQrOrder('o1')).toEqual({ data: null, error: 'That order was already answered.' });
    rpc.mockRejectedValue(new Error('network'));
    expect(await fetchQrPending()).toEqual({ data: null, error: 'Unable to load table orders. Please retry.' });
    rpc.mockResolvedValue({ data: 'weird', error: null });
    expect((await acceptQrOrder('o1')).data).toBeNull();
  });
});

// Task 335: the owner sets up each outlet on its own.
describe('another outlet', () => {
  it('sends the named outlet instead of the signed-in one, and the signed-in one when none is named', async () => {
    rpc.mockResolvedValue({ data: { enabled: false, tables: [] }, error: null });
    await fetchQrSettings('other-branch');
    expect(rpc).toHaveBeenLastCalledWith('qr_settings_get', { p_tenant_id: 'tenant', p_branch_id: 'other-branch' });
    rpc.mockResolvedValue({ data: true, error: null });
    await setQrEnabled(false, 'other-branch');
    expect(rpc).toHaveBeenLastCalledWith('qr_set_enabled', { p_tenant_id: 'tenant', p_branch_id: 'other-branch', p_enabled: false });
    rpc.mockResolvedValue({ data: 3, error: null });
    await addQrTables(['1', '2', '3'], 'other-branch');
    expect(rpc).toHaveBeenLastCalledWith('qr_add_tables', { p_tenant_id: 'tenant', p_branch_id: 'other-branch', p_labels: ['1', '2', '3'] });
    rpc.mockResolvedValue({ data: true, error: null });
    await updateQrTable('t1', { active: false }, 'other-branch');
    expect(rpc).toHaveBeenLastCalledWith('qr_update_table', { p_tenant_id: 'tenant', p_branch_id: 'other-branch', p_id: 't1', p_label: null, p_active: false, p_new_code: null });
    await updateQrTable('t1', { active: true });
    expect(rpc).toHaveBeenLastCalledWith('qr_update_table', expect.objectContaining({ p_branch_id: 'branch' }));
  });
});
