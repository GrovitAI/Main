import type { AttendanceStatus, KitchenAttendance, KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';
import { kitchenCalendarDays } from '@/lib/pos/kitchen-analytics-utils';
export function shiftAttendanceDate(date: string, by: number): string {
  const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + by); return value.toISOString().slice(0, 10);
}
export function attendanceDateLabel(date: string): string {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
/** Include archived people only when this day's ledger already has their record. */
export function attendanceStaff(staff: readonly KitchenStaffMember[], attendance: readonly KitchenAttendance[]): KitchenStaffMember[] {
  const recorded = new Set(attendance.map(row => row.roster_id));
  return staff.filter(member => member.is_active || recorded.has(member.id));
}
export function attendanceCounts(staff: readonly KitchenStaffMember[], attendance: readonly KitchenAttendance[]): Record<AttendanceStatus, number> {
  const counts = { present: 0, absent: 0, half_day: 0, leave: 0, unmarked: 0 };
  const byStaff = new Map(attendance.map(row => [row.roster_id, row.status]));
  for (const member of attendanceStaff(staff, attendance)) counts[byStaff.get(member.id) ?? 'unmarked']++;
  return counts;
}

export function attendanceMonthCounts(person: KitchenStaffMember, attendance: readonly KitchenAttendance[], month: string, today: string): Record<AttendanceStatus, number> {
  const counts = { present: 0, absent: 0, half_day: 0, leave: 0, unmarked: 0 };
  const records = new Map(attendance.filter(row => row.roster_id === person.id).map(row => [row.attendance_date, row]));
  for (const cell of kitchenCalendarDays(month)) {
    if (!cell.date || cell.date > today) continue;
    const mark = records.get(cell.date);
    if (person.is_active || mark) counts[mark?.status ?? 'unmarked']++;
  }
  return counts;
}
