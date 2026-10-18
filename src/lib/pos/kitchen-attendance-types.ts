export const ATTENDANCE_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'half_day', label: 'Half day' },
  { value: 'leave', label: 'Leave' },
] as const;
export type AttendanceStatus = typeof ATTENDANCE_OPTIONS[number]['value'] | 'unmarked';
export type KitchenStaffMember = {
  id: string; name: string; job_title: string; is_active: boolean; created_at: string;
};
export type KitchenAttendance = {
  id: string; roster_id: string; attendance_date: string; status: AttendanceStatus;
  note: string; updated_at: string; updated_by_name: string;
};
export type KitchenAttendanceDay = { staff: KitchenStaffMember[]; attendance: KitchenAttendance[] };
