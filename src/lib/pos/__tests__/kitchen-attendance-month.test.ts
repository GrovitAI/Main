import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { fetchKitchenAttendanceMonth } from '@/lib/pos/kitchen-attendance-service';
import { attendanceMonthCounts } from '@/lib/pos/kitchen-attendance-utils';
import type { KitchenAttendance, KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: jest.fn() }));
const calls: { table: string; method: string; args: unknown[] }[] = [];
let responses: { data: unknown; error: unknown }[];
const person: KitchenStaffMember = { id: 'person', name: 'Asha', job_title: 'Cook', is_active: true, created_at: '2024-01-01' };
const mark: KitchenAttendance = { id: 'mark', roster_id: 'person', attendance_date: '2024-02-01', status: 'present', note: '', updated_at: '2024-02-01T04:00:00Z', updated_by_name: 'Manager' };
function query(table: string): Record<string, unknown> {
  const response = responses.shift();
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'gte', 'lt', 'lte', 'range']) chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve);
  return chain;
}
beforeEach(() => {
  jest.clearAllMocks(); calls.length = 0;
  responses = [{ data: [person], error: null }, { data: [mark], error: null }];
  (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant', branch_id: 'pos' });
  (kitchenBranch as jest.Mock).mockReturnValue({ id: 'kitchen' });
  (supabase.from as jest.Mock).mockImplementation(query);
  jest.useFakeTimers().setSystemTime(new Date('2026-10-10T10:00:00Z'));
});
afterEach(() => jest.useRealTimers());

test('month range includes leap day, uses an exclusive next month and scopes both reads', async () => {
  const result = await fetchKitchenAttendanceMonth('2024-02');
  expect(result.data?.attendance).toEqual([mark]);
  for (const table of ['kitchen_staff_roster', 'kitchen_attendance']) {
    expect(calls).toContainEqual({ table, method: 'eq', args: ['tenant_id', 'tenant'] });
    expect(calls).toContainEqual({ table, method: 'eq', args: ['branch_id', 'kitchen'] });
  }
  expect(calls).toContainEqual({ table: 'kitchen_attendance', method: 'gte', args: ['attendance_date', '2024-02-01'] });
  expect(calls).toContainEqual({ table: 'kitchen_attendance', method: 'lt', args: ['attendance_date', '2024-03-01'] });
  expect(calls).toContainEqual({ table: 'kitchen_attendance', method: 'lte', args: ['attendance_date', '2026-10-10'] });
  expect(supabase.from).toHaveBeenCalledTimes(2);
});
test('a full page fetches all remaining days with stable ordering and scope on every page', async () => {
  responses[1] = { data: Array.from({ length: 1000 }, (_, i) => ({ ...mark, id: String(i) })), error: null };
  responses.push({ data: [{ ...mark, id: 'last' }], error: null });
  expect((await fetchKitchenAttendanceMonth('2025-12')).data?.attendance).toHaveLength(1001);
  expect(calls.filter(call => call.method === 'range').map(call => call.args)).toEqual([[0, 999], [1000, 1999]]);
  expect(calls.filter(call => call.table === 'kitchen_attendance' && call.method === 'eq' && call.args[0] === 'branch_id')).toHaveLength(2);
  expect(calls.filter(call => call.table === 'kitchen_attendance' && call.method === 'order').map(call => call.args)).toEqual([['attendance_date'], ['id'], ['attendance_date'], ['id']]);
  expect(calls).toContainEqual({ table: 'kitchen_attendance', method: 'lt', args: ['attendance_date', '2026-01-01'] });
});
test('a failed later page never presents partial month totals or private errors', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  responses[1] = { data: Array.from({ length: 1000 }, () => mark), error: null };
  responses.push({ data: null, error: { code: 'PRIVATE', message: 'secret-detail' } });
  const result = await fetchKitchenAttendanceMonth('2024-02');
  expect(result.data).toBeNull(); expect(result.error).not.toContain('secret-detail');
  expect(result.error).toContain('complete month'); log.mockRestore();
});
test('invalid and future months make no database requests', async () => {
  for (const month of ['2026-00', '2026-13', '2026-1', '2026-10-01', '2026-11', '9999-12']) expect((await fetchKitchenAttendanceMonth(month)).data).toBeNull();
  expect(supabase.from).not.toHaveBeenCalled();
});
test('an oversized roster refuses incomplete totals', async () => {
  responses[0] = { data: Array.from({ length: 1000 }, () => person), error: null };
  expect((await fetchKitchenAttendanceMonth('2024-02')).data).toBeNull();
});
test('calendar totals count leap days and leave future days out of unmarked', () => {
  expect(attendanceMonthCounts(person, [mark], '2024-02', '2026-10-10')).toEqual({ present: 1, absent: 0, half_day: 0, leave: 0, unmarked: 28 });
  expect(attendanceMonthCounts(person, [{ ...mark, attendance_date: '2026-10-01', status: 'half_day' }], '2026-10', '2026-10-10')).toEqual({ present: 0, absent: 0, half_day: 1, leave: 0, unmarked: 9 });
});
test('archived staff count only recorded days, including explicitly cleared marks', () => {
  const attendance = [mark, { ...mark, id: 'clear', attendance_date: '2024-02-02', status: 'unmarked' as const }, { ...mark, id: 'elsewhere', roster_id: 'other', status: 'absent' as const }];
  expect(attendanceMonthCounts({ ...person, is_active: false }, attendance, '2024-02', '2026-10-10')).toEqual({ present: 1, absent: 0, half_day: 0, leave: 0, unmarked: 1 });
});
