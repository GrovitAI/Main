-- Task 327: salary details. Each kitchen staff member (attendance roster) can have a monthly salary;
-- a month's salary is worked out in the app from attendance, and the month's Salary advance and
-- Salaries payments for that person come off it.
--
--   * kitchen_staff_salary keeps the monthly salary, private: no direct access for the app, only the
--     two functions below, for logins that see money (money.view; setting it also needs setup.roster).
--   * kitchen_salary_month returns, per person, the salary, the attendance counts in the dates, and
--     the advances and salary paid in them (Spent entries naming that person).
--   * Salaries now asks who it was paid to, as Salary advance already does, so payments are per person.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.kitchen_staff_salary (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  roster_id uuid NOT NULL,
  monthly_salary_paise bigint NOT NULL CHECK (monthly_salary_paise >= 0 AND monthly_salary_paise <= 100000000),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, roster_id),
  CONSTRAINT kitchen_staff_salary_roster_fk FOREIGN KEY (tenant_id, branch_id, roster_id)
    REFERENCES public.kitchen_staff_roster(tenant_id, branch_id, id)
);
ALTER TABLE public.kitchen_staff_salary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_staff_salary FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_staff_salary TO service_role;

CREATE OR REPLACE FUNCTION public.kitchen_set_staff_salary(p_tenant_id uuid, p_branch_id uuid, p_roster_id uuid, p_monthly_salary_paise bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text; v_before bigint;
BEGIN
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'money.view');
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'setup.roster');
  SELECT r.name INTO v_name FROM public.kitchen_staff_roster r WHERE r.id = p_roster_id AND r.tenant_id = p_tenant_id AND r.branch_id = p_branch_id;
  IF NOT FOUND OR p_monthly_salary_paise IS NULL OR p_monthly_salary_paise < 0 OR p_monthly_salary_paise > 100000000 THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT s.monthly_salary_paise INTO v_before FROM public.kitchen_staff_salary s
   WHERE s.tenant_id = p_tenant_id AND s.branch_id = p_branch_id AND s.roster_id = p_roster_id;
  INSERT INTO public.kitchen_staff_salary(tenant_id, branch_id, roster_id, monthly_salary_paise, updated_by, updated_at)
  VALUES (p_tenant_id, p_branch_id, p_roster_id, p_monthly_salary_paise, public.kitchen_actor_name(), now())
  ON CONFLICT (tenant_id, branch_id, roster_id) DO UPDATE SET monthly_salary_paise = EXCLUDED.monthly_salary_paise,
    updated_by = EXCLUDED.updated_by, updated_at = now();
  -- The change log is open to logins that do not see money, so it names the person, not the amount.
  PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'salary_changed', 'staff', p_roster_id, NULL, NULL,
    jsonb_build_object('name', v_name, 'first', v_before IS NULL));
  RETURN jsonb_build_object('roster_id', p_roster_id, 'monthly_salary_paise', p_monthly_salary_paise);
END $$;

CREATE OR REPLACE FUNCTION public.kitchen_salary_month(p_tenant_id uuid, p_branch_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'money.view');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 31 THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'staff', coalesce((
      WITH att AS (
        SELECT a.roster_id,
               count(*) FILTER (WHERE a.status = 'present') AS present,
               count(*) FILTER (WHERE a.status = 'half_day') AS half_day,
               count(*) FILTER (WHERE a.status = 'leave') AS leave_days,
               count(*) FILTER (WHERE a.status = 'absent') AS absent
          FROM public.kitchen_attendance a
         WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id AND a.attendance_date BETWEEN p_from AND p_to
         GROUP BY a.roster_id
      ), pay AS (
        SELECT e.roster_id,
               coalesce(sum(e.amount_paise) FILTER (WHERE lower(e.category) LIKE '%advance%'), 0) AS advances_paise,
               coalesce(sum(e.amount_paise) FILTER (WHERE lower(e.category) NOT LIKE '%advance%'), 0) AS paid_paise
          FROM public.kitchen_entries e
         WHERE e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id AND e.type = 'spent' AND e.voided_at IS NULL
           AND e.roster_id IS NOT NULL AND e.entry_date BETWEEN p_from AND p_to
         GROUP BY e.roster_id
      )
      SELECT jsonb_agg(jsonb_build_object(
               'roster_id', r.id, 'name', r.name, 'job_title', r.job_title, 'is_active', r.is_active,
               'monthly_salary_paise', s.monthly_salary_paise,
               'present', coalesce(att.present, 0), 'half_day', coalesce(att.half_day, 0),
               'leave', coalesce(att.leave_days, 0), 'absent', coalesce(att.absent, 0),
               'advances_paise', coalesce(pay.advances_paise, 0), 'paid_paise', coalesce(pay.paid_paise, 0))
             ORDER BY r.name)
        FROM public.kitchen_staff_roster r
        LEFT JOIN att ON att.roster_id = r.id
        LEFT JOIN pay ON pay.roster_id = r.id
        LEFT JOIN public.kitchen_staff_salary s ON s.tenant_id = r.tenant_id AND s.branch_id = r.branch_id AND s.roster_id = r.id
       WHERE r.tenant_id = p_tenant_id AND r.branch_id = p_branch_id
         AND (r.is_active OR att.roster_id IS NOT NULL OR pay.roster_id IS NOT NULL)
    ), '[]'::jsonb),
    -- Salaries paid before they named a person, so the month's total still adds up.
    'unassigned_paid_paise', coalesce((
      SELECT sum(e.amount_paise) FROM public.kitchen_entries e
       WHERE e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id AND e.type = 'spent' AND e.voided_at IS NULL
         AND e.roster_id IS NULL AND lower(btrim(e.category)) IN ('salaries', 'salary') AND e.entry_date BETWEEN p_from AND p_to), 0)
  );
END $$;

REVOKE ALL ON FUNCTION public.kitchen_set_staff_salary(uuid, uuid, uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.kitchen_salary_month(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_set_staff_salary(uuid, uuid, uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kitchen_salary_month(uuid, uuid, date, date) TO authenticated, service_role;

-- Salaries is paid to a person, like Salary advance.
UPDATE public.kitchen_purchase_categories SET asks = 'person'
 WHERE lower(btrim(name)) IN ('salaries', 'salary') AND parent_id IS NULL AND asks IS NULL;
