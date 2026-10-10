-- Cover the standalone branch foreign keys; scoped daily reads keep their own indexes.
CREATE INDEX IF NOT EXISTS kitchen_staff_roster_branch_idx ON public.kitchen_staff_roster(branch_id);
CREATE INDEX IF NOT EXISTS kitchen_attendance_branch_idx ON public.kitchen_attendance(branch_id);
