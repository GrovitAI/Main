import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { fetchKitchenMoney, moveKitchenMoney, parseMoneySummary, setKitchenMoneyOpening, voidKitchenMoneyMove } from '@/lib/pos/kitchen-money-service';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: jest.fn() }));
const scope = { p_tenant_id: 'tenant', p_branch_id: 'kitchen' };
const summary = { has_opening: true, as_of: '2026-10-01', opening_cash_paise: 100000, opening_bank_paise: -5000, opening_updated_by: 'Kitchen manager',
  cash_in_paise: 20000, cash_out_paise: 1000, bank_in_paise: '30000', bank_out_paise: 5000, moved_to_bank_paise: 15000, moved_to_cash_paise: 0,
  cash_paise: 104000, bank_paise: 35000, moves: [{ id: 'm1', move_date: '2026-10-02', from_account: 'cash', to_account: 'bank', amount_paise: 15000, note: null, created_by: 'Staff', created_at: '2026-10-02T05:00:00Z' }] };
beforeEach(() => {
  jest.clearAllMocks(); (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant', branch_id: 'pos' });
  (kitchenBranch as jest.Mock).mockReturnValue({ id: 'kitchen' });
});

test('summary is read for the kitchen branch and keeps negative bank figures', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: summary, error: null });
  const result = await fetchKitchenMoney();
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_money_summary', scope);
  expect(result.data?.cash_paise).toBe(104000); expect(result.data?.opening_bank_paise).toBe(-5000); expect(result.data?.bank_in_paise).toBe(30000);
  expect(result.data?.moves[0].to_account).toBe('bank');
});
test('malformed summaries are rejected rather than shown', () => {
  expect(() => parseMoneySummary({ ...summary, cash_paise: '1.5' })).toThrow();
  expect(() => parseMoneySummary({ ...summary, moves: [{ ...summary.moves[0], from_account: 'upi' }] })).toThrow();
  expect(parseMoneySummary({ ...summary, has_opening: false, as_of: null }).as_of).toBeNull();
});
test('drawings moves come with the summary, without the owner for staff (task 289)', () => {
  const draw = { id: 'd1', draw_date: '2026-10-22', kind: 'in', account: 'cash', amount_paise: 200000, note: null, owner_name: null, created_by: null, created_at: '2026-10-22T05:00:00Z' };
  const parsed = parseMoneySummary({ ...summary, to_drawings_cash_paise: 200000, to_drawings_bank_paise: '-500', drawing_moves: [draw] });
  expect(parsed.drawing_moves[0]).toEqual(draw);
  expect(parsed.to_drawings_bank_paise).toBe(-500);
  expect(parseMoneySummary(summary).drawing_moves).toEqual([]);
  expect(() => parseMoneySummary({ ...summary, drawing_moves: [{ ...draw, kind: 'spend' }] })).toThrow();
});
test('a transfer sends both accounts, exact paise and a stable retry key', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'move', error: null });
  await moveKitchenMoney('2026-10-02', 'bank', 50000, '  ATM  ', 'stable-request-01');
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_move_money', { ...scope, p_move_date: '2026-10-02', p_from: 'bank', p_to: 'cash',
    p_amount_paise: 50000, p_note: 'ATM', p_request_key: 'stable-request-01', p_lock_reason: null });
});
test('invalid transfers and openings never reach the database', async () => {
  for (const amount of [0, -1, 0.5, Infinity]) expect((await moveKitchenMoney('2026-10-02', 'cash', amount, '', 'stable-request-01')).error).toBeTruthy();
  expect((await moveKitchenMoney('9999-01-01', 'cash', 100, '', 'stable-request-01')).error).toBeTruthy();
  expect((await moveKitchenMoney('2026-10-02', 'cash', 100, '', 'short')).error).toBeTruthy();
  expect((await setKitchenMoneyOpening('2026-10-01', -1, 0)).error).toBeTruthy();
  expect((await setKitchenMoneyOpening('2026-02-30', 0, 0)).error).toBeTruthy();
  expect(supabase.rpc).not.toHaveBeenCalled();
});
test('opening balances allow an overdrawn bank and void is scoped', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({ data: '2026-10-01', error: null }).mockResolvedValueOnce({ data: 'm1', error: null });
  expect((await setKitchenMoneyOpening('2026-10-01', 100000, -5000)).data).toBe('2026-10-01');
  expect(supabase.rpc).toHaveBeenCalledWith('kitchen_set_money_opening', { ...scope, p_as_of: '2026-10-01', p_cash_paise: 100000, p_bank_paise: -5000 });
  expect((await voidKitchenMoneyMove('m1')).data).toBe('m1');
  expect(supabase.rpc).toHaveBeenLastCalledWith('kitchen_void_money_move', { ...scope, p_move_id: 'm1', p_lock_reason: null });
});
test('database errors are translated, never shown raw', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'PRIVATE_SQL KITCHEN_MONEY_CHANGED' } });
  const result = await moveKitchenMoney('2026-10-02', 'cash', 100, '', 'stable-request-01');
  expect(result.error).not.toContain('PRIVATE'); expect(result.error).toContain('Refresh');
});
