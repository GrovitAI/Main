import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { fetchKitchenAttendance, markKitchenAttendance, markKitchenAttendanceGroup, saveKitchenStaff } from '@/lib/pos/kitchen-attendance-service';
import { attendanceCounts, attendanceStaff, shiftAttendanceDate } from '@/lib/pos/kitchen-attendance-utils';
import type { KitchenAttendance, KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: jest.fn() }));
const calls: [string, unknown[]][] = [];
let result: { data: unknown; error: unknown };
function query(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'upsert', 'single']) chain[method] = (...args: unknown[]) => { calls.push([method, args]); return chain; };
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}
const person: KitchenStaffMember = { id: 'person', name: 'Asha', job_title: 'Cook', is_active: true, created_at: '2026-10-01' };
const day: KitchenAttendance = { id: 'day', roster_id: 'person', attendance_date: '2026-10-01', status: 'present', note: '', updated_at: '2026-10-01T05:00:00Z', updated_by_name: 'Manager' };
beforeEach(() => {
  jest.clearAllMocks(); calls.length = 0; result = { data: day, error: null };
  (getTenantContext as jest.Mock).mockReturnValue({ tenant_id: 'tenant', branch_id: 'pos' });
  (kitchenBranch as jest.Mock).mockReturnValue({ id: 'kitchen' });
  (supabase.from as jest.Mock).mockImplementation(query);
});
test('daily reads use the kitchen scope and exactly the requested day', async () => {
  result.data = [];
  expect((await fetchKitchenAttendance('2026-10-01')).data).toEqual({ staff: [], attendance: [] });
  expect(calls.filter(([method, args]) => method === 'eq' && args[0] === 'tenant_id')).toHaveLength(2);
  expect(calls.filter(([method, args]) => method === 'eq' && args[0] === 'branch_id' && args[1] === 'kitchen')).toHaveLength(2);
  expect(calls).toContainEqual(['eq', ['attendance_date', '2026-10-01']]);
});
test('one person/day upsert includes scope and never supplies an actor or timestamp', async () => {
  expect((await markKitchenAttendance({ roster_id: 'person', date: '2026-10-01', status: 'half_day', note: '  Morning shift  ' })).error).toBeNull();
  expect(calls).toContainEqual(['upsert', [{ tenant_id: 'tenant', branch_id: 'kitchen', roster_id: 'person', attendance_date: '2026-10-01', status: 'half_day', note: 'Morning shift' }, { onConflict: 'tenant_id,branch_id,roster_id,attendance_date' }]]);
});
test('invalid/future dates and oversized notes fail before database access', async () => {
  for (const date of ['2026-02-30', '9999-01-01']) expect((await markKitchenAttendance({ roster_id: 'person', date, status: 'present', note: '' })).data).toBeNull();
  expect((await markKitchenAttendance({ roster_id: 'person', date: '2026-10-01', status: 'present', note: 'x'.repeat(201) })).data).toBeNull();
  expect(supabase.from).not.toHaveBeenCalled();
});
test('failed write returns safe error and no successful mark', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  result = { data: null, error: { code: 'PRIVATE', message: 'secret-details' } };
  const response = await markKitchenAttendance({ roster_id: 'person', date: '2026-10-01', status: 'present', note: '' });
  expect(response.data).toBeNull(); expect(response.error).not.toContain('secret-details'); log.mockRestore();
});
test('archive uses a scoped update and never deletes staff or attendance', async () => {
  result.data = { ...person, is_active: false };
  await saveKitchenStaff({ name: ' Asha ', job_title: ' Cook ', is_active: false }, 'person');
  expect(calls).toContainEqual(['update', [{ name: 'Asha', job_title: 'Cook', is_active: false }]]);
  expect(calls).toContainEqual(['eq', ['tenant_id', 'tenant']]); expect(calls).toContainEqual(['eq', ['branch_id', 'kitchen']]);
  expect(calls).toContainEqual(['eq', ['id', 'person']]);
});
test('archived people remain visible on recorded days and counts distinguish unmarked', () => {
  const archived = { ...person, id: 'old', is_active: false };
  const staff = [person, archived, { ...person, id: 'off', is_active: false }];
  const attendance = [{ ...day, roster_id: 'old', status: 'leave' as const }];
  expect(attendanceStaff(staff, attendance).map(row => row.id)).toEqual(['person', 'old']);
  expect(attendanceCounts(staff, attendance)).toEqual({ present: 0, absent: 0, half_day: 0, leave: 1, unmarked: 1 });
});
test('date navigation handles leap days and year boundaries', () => {
  expect(shiftAttendanceDate('2024-03-01', -1)).toBe('2024-02-29');
  expect(shiftAttendanceDate('2026-01-01', -1)).toBe('2025-12-31');
});

test('group marking sends one scoped upsert and retains individual notes without a client actor', async () => {
  result.data = [{ ...day, status: 'leave', note: 'Appointment' }, { ...day, id: 'day-2', roster_id: 'person-2', status: 'leave', note: 'Travel' }];
  const response = await markKitchenAttendanceGroup({ date: '2026-10-01', status: 'leave', staff: [
    { roster_id: 'person', note: ' Appointment ' }, { roster_id: 'person-2', note: 'Travel' },
  ] });
  expect(response.data).toHaveLength(2);
  expect(supabase.from).toHaveBeenCalledTimes(1);
  expect(calls).toContainEqual(['upsert', [[
    { tenant_id: 'tenant', branch_id: 'kitchen', roster_id: 'person', attendance_date: '2026-10-01', status: 'leave', note: 'Appointment' },
    { tenant_id: 'tenant', branch_id: 'kitchen', roster_id: 'person-2', attendance_date: '2026-10-01', status: 'leave', note: 'Travel' },
  ], { onConflict: 'tenant_id,branch_id,roster_id,attendance_date' }]]);
  expect(calls).toContainEqual(['eq', ['tenant_id', 'tenant']]);
  expect(calls).toContainEqual(['eq', ['branch_id', 'kitchen']]);
  expect(calls.some(([method]) => method === 'single')).toBe(false);
});

test('group rejects empty, duplicate, oversized and invalid selections before database access', async () => {
  const input = { date: '2026-10-01', status: 'present' as const, staff: [{ roster_id: 'person', note: '' }] };
  for (const staff of [[], [input.staff[0], input.staff[0]], [{ roster_id: '', note: '' }], [{ roster_id: 'person', note: 'x'.repeat(201) }],
    Array.from({ length: 1000 }, (_, index) => ({ roster_id: String(index), note: '' }))]) {
    expect((await markKitchenAttendanceGroup({ ...input, staff })).data).toBeNull();
  }
  for (const date of ['2026-02-30', '9999-01-01']) expect((await markKitchenAttendanceGroup({ ...input, date })).data).toBeNull();
  expect((await markKitchenAttendanceGroup({ ...input, status: 'unmarked' })).data).toBeNull();
  expect(supabase.from).not.toHaveBeenCalled();
});

test.each(['missing', 'duplicate', 'foreign', 'wrong-date', 'wrong-status'])('group does not report an incomplete or mismatched response as success: %s', async mode => {
  const second = { ...day, id: 'day-2', roster_id: 'person-2' };
  result.data = mode === 'missing' ? [day] : mode === 'duplicate' ? [day, day] : mode === 'foreign' ? [day, { ...second, roster_id: 'other' }] :
    mode === 'wrong-date' ? [day, { ...second, attendance_date: '2026-09-30' }] : [day, { ...second, status: 'absent' }];
  const response = await markKitchenAttendanceGroup({ date: '2026-10-01', status: 'present', staff: [{ roster_id: 'person', note: '' }, { roster_id: 'person-2', note: '' }] });
  expect(response.data).toBeNull(); expect(response.error).toContain('Refresh this day');
});

test('group failure hides private details and advises reconciliation before retry', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  result = { data: null, error: { code: 'PRIVATE', message: 'secret-details' } };
  const response = await markKitchenAttendanceGroup({ date: '2026-10-01', status: 'present', staff: [{ roster_id: 'person', note: '' }] });
  expect(response.data).toBeNull(); expect(response.error).not.toContain('secret-details'); expect(response.error).toContain('Refresh this day');
  log.mockRestore();
});
