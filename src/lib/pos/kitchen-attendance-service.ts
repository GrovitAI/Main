import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { kitchenToday, validKitchenDate, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { ATTENDANCE_OPTIONS } from '@/lib/pos/kitchen-attendance-types';
import type { AttendanceStatus, KitchenAttendance, KitchenAttendanceDay, KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';
import type { ServiceResult } from '@/lib/pos/kitchen-types';

const STAFF_COLUMNS = 'id,name,job_title,is_active,created_at';
const DAY_COLUMNS = 'id,roster_id,attendance_date,status,note,updated_at,updated_by_name';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function staffRow(row: Record<string, unknown>): KitchenStaffMember {
  return { id: String(row.id), name: String(row.name ?? ''), job_title: String(row.job_title ?? ''), is_active: row.is_active === true, created_at: String(row.created_at ?? '') };
}
function dayRow(row: Record<string, unknown>): KitchenAttendance {
  const status = ATTENDANCE_OPTIONS.find(option => option.value === row.status)?.value ?? 'unmarked';
  return { id: String(row.id), roster_id: String(row.roster_id), attendance_date: String(row.attendance_date), status, note: String(row.note ?? ''), updated_at: String(row.updated_at ?? ''), updated_by_name: String(row.updated_by_name ?? 'Staff') };
}
function scope(): { tenant_id: string; branch_id: string } {
  return { tenant_id: getTenantContext().tenant_id, branch_id: kitchenBranch().id };
}
function failure(error: unknown, fallback: string): string {
  const code = record(error) ? String(error.code ?? '') : '';
  const message = record(error) ? String(error.message ?? '') : '';
  console.error('[kitchen-attendance]', code || 'UNKNOWN');
  if (code === '42P01' || code === 'PGRST205') return 'Attendance is not set up on this database yet. Apply the kitchen attendance update, then retry.';
  if (message.includes('KITCHEN_ATTENDANCE_FUTURE')) return 'Choose today or an earlier attendance date.';
  if (message.includes('KITCHEN_ATTENDANCE_ARCHIVED')) return 'This staff member is archived. Restore them before marking a new day.';
  if (code === '42501') return 'Your kitchen session cannot make this change. Sign in again and retry.';
  return fallback;
}

export async function fetchKitchenAttendance(date: string): Promise<ServiceResult<KitchenAttendanceDay>> {
  try {
    if (!validKitchenDate(date) || date > kitchenToday()) return { data: null, error: 'Choose today or an earlier attendance date.' };
    const { tenant_id, branch_id } = scope();
    const [staff, day] = await Promise.all([
      supabase.from('kitchen_staff_roster').select(STAFF_COLUMNS).eq('tenant_id', tenant_id).eq('branch_id', branch_id).order('name').limit(1000),
      supabase.from('kitchen_attendance').select(DAY_COLUMNS).eq('tenant_id', tenant_id).eq('branch_id', branch_id).eq('attendance_date', date).limit(1000),
    ]);
    if (staff.error || day.error) return { data: null, error: failure(staff.error ?? day.error, 'Unable to load attendance. Retry to load this day.') };
    if (!Array.isArray(staff.data) || !Array.isArray(day.data)) return { data: null, error: 'Unable to load attendance. Retry to load this day.' };
    if (staff.data.length >= 1000 || day.data.length >= 1000) return { data: null, error: 'This roster needs paging before it can be shown safely. Contact the app administrator.' };
    return { data: { staff: staff.data.filter(record).map(staffRow), attendance: day.data.filter(record).map(dayRow) }, error: null };
  } catch (error) { return { data: null, error: failure(error, 'Unable to load attendance. Retry to load this day.') }; }
}

/** A complete, scoped month; extra pages are requested only when the previous page is full. */
export async function fetchKitchenAttendanceMonth(month: string): Promise<ServiceResult<KitchenAttendanceDay>> {
  try {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) || month > kitchenToday().slice(0, 7)) return { data: null, error: 'Choose this month or an earlier month.' };
    const { tenant_id, branch_id } = scope();
    const staffQuery = supabase.from('kitchen_staff_roster').select(STAFF_COLUMNS).eq('tenant_id', tenant_id).eq('branch_id', branch_id).order('name').limit(1000);
    const page = (offset: number) => supabase.from('kitchen_attendance').select(DAY_COLUMNS)
      .eq('tenant_id', tenant_id).eq('branch_id', branch_id)
      .gte('attendance_date', month + '-01').lt('attendance_date', shiftKitchenMonth(month, 1) + '-01')
      .lte('attendance_date', kitchenToday()).order('attendance_date').order('id').range(offset, offset + 999);
    const [staff, first] = await Promise.all([staffQuery, page(0)]);
    if (staff.error || first.error) return { data: null, error: failure(staff.error ?? first.error, 'Unable to load this month. Retry the month overview.') };
    if (!Array.isArray(staff.data) || !Array.isArray(first.data)) return { data: null, error: 'Unable to load this month. Retry the month overview.' };
    if (staff.data.length >= 1000) return { data: null, error: 'This roster needs paging before it can be shown safely. Contact the app administrator.' };
    const attendance = first.data.filter(record).map(dayRow);
    let count = first.data.length;
    let offset = 1000;
    while (count === 1000) {
      // A 999-person roster has at most 30,969 unique records in a month.
      if (offset > 31000) return { data: null, error: 'This month is too large to show safely. Contact the app administrator.' };
      const next = await page(offset);
      if (next.error || !Array.isArray(next.data)) return { data: null, error: failure(next.error, 'Unable to load the complete month. Retry the month overview.') };
      attendance.push(...next.data.filter(record).map(dayRow));
      count = next.data.length;
      offset += 1000;
    }
    return { data: { staff: staff.data.filter(record).map(staffRow), attendance }, error: null };
  } catch (error) { return { data: null, error: failure(error, 'Unable to load this month. Retry the month overview.') }; }
}

export async function saveKitchenStaff(input: { name: string; job_title: string; is_active?: boolean }, id?: string): Promise<ServiceResult<KitchenStaffMember>> {
  try {
    const name = input.name.trim(), job_title = input.job_title.trim();
    if (!name || name.length > 80 || job_title.length > 80) return { data: null, error: 'Enter a staff name and keep the name and role within 80 characters.' };
    const { tenant_id, branch_id } = scope();
    const fields = { name, job_title, ...(input.is_active === undefined ? {} : { is_active: input.is_active }) };
    const query = id ? supabase.from('kitchen_staff_roster').update(fields).eq('tenant_id', tenant_id).eq('branch_id', branch_id).eq('id', id)
      : supabase.from('kitchen_staff_roster').insert({ ...fields, tenant_id, branch_id });
    const { data, error } = await query.select(STAFF_COLUMNS).single();
    if (error || !record(data)) return { data: null, error: failure(error, 'Unable to save this staff member. Your input is kept; retry.') };
    return { data: staffRow(data), error: null };
  } catch (error) { return { data: null, error: failure(error, 'Unable to save this staff member. Your input is kept; retry.') }; }
}

export async function markKitchenAttendance(input: { roster_id: string; date: string; status: AttendanceStatus; note: string }): Promise<ServiceResult<KitchenAttendance>> {
  try {
    if (!input.roster_id || !validKitchenDate(input.date) || input.date > kitchenToday()) return { data: null, error: 'Choose a staff member and today or an earlier date.' };
    if (!(input.status === 'unmarked' || ATTENDANCE_OPTIONS.some(option => option.value === input.status))) return { data: null, error: 'Choose a valid attendance status.' };
    const note = input.note.trim();
    if (note.length > 200) return { data: null, error: 'Keep the attendance note within 200 characters.' };
    const { tenant_id, branch_id } = scope();
    const { data, error } = await supabase.from('kitchen_attendance').upsert({ tenant_id, branch_id, roster_id: input.roster_id, attendance_date: input.date, status: input.status, note }, { onConflict: 'tenant_id,branch_id,roster_id,attendance_date' })
      .eq('tenant_id', tenant_id).eq('branch_id', branch_id).select(DAY_COLUMNS).single();
    if (error || !record(data)) return { data: null, error: failure(error, 'Attendance was not saved. Your previous mark is unchanged; retry.') };
    return { data: dayRow(data), error: null };
  } catch (error) { return { data: null, error: failure(error, 'Attendance was not saved. Your previous mark is unchanged; retry.') }; }
}
