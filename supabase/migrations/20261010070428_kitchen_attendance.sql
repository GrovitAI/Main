-- Kitchen attendance: independent roster, not Auth accounts or payroll.
CREATE TABLE IF NOT EXISTS public.kitchen_staff_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  job_title text NOT NULL DEFAULT '' CHECK (length(job_title) <= 80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_name text NOT NULL DEFAULT 'Staff',
  UNIQUE (tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS kitchen_staff_roster_scope_idx ON public.kitchen_staff_roster(tenant_id, branch_id, is_active, name);

CREATE TABLE IF NOT EXISTS public.kitchen_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  roster_id uuid NOT NULL,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','half_day','leave','unmarked')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_name text NOT NULL DEFAULT 'Staff',
  CONSTRAINT kitchen_attendance_person_day_key UNIQUE (tenant_id, branch_id, roster_id, attendance_date),
  CONSTRAINT kitchen_attendance_roster_fk FOREIGN KEY (tenant_id, branch_id, roster_id)
    REFERENCES public.kitchen_staff_roster(tenant_id, branch_id, id)
);
CREATE INDEX IF NOT EXISTS kitchen_attendance_day_idx ON public.kitchen_attendance(tenant_id, branch_id, attendance_date);

ALTER TABLE public.kitchen_staff_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_attendance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_staff_roster, public.kitchen_attendance FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_staff_roster, public.kitchen_attendance TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.kitchen_staff_roster, public.kitchen_attendance TO authenticated;

DROP POLICY IF EXISTS kitchen_staff_roster_read ON public.kitchen_staff_roster;
CREATE POLICY kitchen_staff_roster_read ON public.kitchen_staff_roster FOR SELECT TO authenticated
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_staff_roster_add ON public.kitchen_staff_roster;
CREATE POLICY kitchen_staff_roster_add ON public.kitchen_staff_roster FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id) AND EXISTS (
    SELECT 1 FROM public.branches b WHERE b.tenant_id = kitchen_staff_roster.tenant_id AND b.id = kitchen_staff_roster.branch_id));
DROP POLICY IF EXISTS kitchen_staff_roster_edit ON public.kitchen_staff_roster;
CREATE POLICY kitchen_staff_roster_edit ON public.kitchen_staff_roster FOR UPDATE TO authenticated
  USING (public.kitchen_can_use(tenant_id, branch_id))
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_attendance_read ON public.kitchen_attendance;
CREATE POLICY kitchen_attendance_read ON public.kitchen_attendance FOR SELECT TO authenticated
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_attendance_add ON public.kitchen_attendance;
CREATE POLICY kitchen_attendance_add ON public.kitchen_attendance FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_attendance_edit ON public.kitchen_attendance;
CREATE POLICY kitchen_attendance_edit ON public.kitchen_attendance FOR UPDATE TO authenticated
  USING (public.kitchen_can_use(tenant_id, branch_id))
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));

-- Actor/time are server-owned; tenant, branch and attendance identity cannot move.
CREATE OR REPLACE FUNCTION public.kitchen_attendance_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor_name text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.branch_id <> OLD.branch_id THEN
      RAISE EXCEPTION 'KITCHEN_ATTENDANCE_IDENTITY' USING ERRCODE = '22023';
    END IF;
    NEW.created_at := OLD.created_at;
    IF TG_TABLE_NAME = 'kitchen_attendance' THEN
      IF NEW.roster_id <> OLD.roster_id OR NEW.attendance_date <> OLD.attendance_date THEN
        RAISE EXCEPTION 'KITCHEN_ATTENDANCE_IDENTITY' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    NEW.created_at := now();
  END IF;
  IF TG_TABLE_NAME = 'kitchen_attendance' THEN
    IF NEW.attendance_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'KITCHEN_ATTENDANCE_FUTURE' USING ERRCODE = '22023';
    END IF;
    -- A correction to an archived person's existing day is allowed; a new day is not.
    IF NOT EXISTS (SELECT 1 FROM public.kitchen_staff_roster r
      WHERE r.id = NEW.roster_id AND r.tenant_id = NEW.tenant_id AND r.branch_id = NEW.branch_id
      AND (r.is_active OR EXISTS (SELECT 1 FROM public.kitchen_attendance a
        WHERE a.tenant_id = NEW.tenant_id AND a.branch_id = NEW.branch_id
          AND a.roster_id = NEW.roster_id AND a.attendance_date = NEW.attendance_date))) THEN
      RAISE EXCEPTION 'KITCHEN_ATTENDANCE_ARCHIVED' USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT s.name INTO actor_name FROM public.staff s
    WHERE s.auth_user_id = auth.uid() AND s.tenant_id = NEW.tenant_id
      AND s.branch_id = public.auth_branch_id() AND s.status = 'active' AND s.deleted_at IS NULL LIMIT 1;
  NEW.updated_by := auth.uid();
  NEW.updated_by_name := coalesce(nullif(btrim(actor_name), ''), 'Staff');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_attendance_stamp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_attendance_stamp() TO service_role;
DROP TRIGGER IF EXISTS kitchen_staff_roster_stamp ON public.kitchen_staff_roster;
CREATE TRIGGER kitchen_staff_roster_stamp BEFORE INSERT OR UPDATE ON public.kitchen_staff_roster
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_attendance_stamp();
DROP TRIGGER IF EXISTS kitchen_attendance_stamp ON public.kitchen_attendance;
CREATE TRIGGER kitchen_attendance_stamp BEFORE INSERT OR UPDATE ON public.kitchen_attendance
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_attendance_stamp();
