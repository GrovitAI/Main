-- Task 202: per-person kitchen permissions, day locks and a change log.
-- The owner always has every permission and alone manages permissions and
-- locks, and alone may change a locked day (with a reason, which is logged).
-- An admin counts as a kitchen manager: every permission, no management.
-- A kitchen login without a saved row also has every permission, so the
-- kitchen works exactly as before until the owner restricts someone.
-- This file adds the tables and helpers; 20261012140100 enforces them.
-- Idempotent: safe to run twice.

-- Who may do what, per kitchen login.
CREATE TABLE IF NOT EXISTS public.kitchen_staff_access (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  staff_id uuid NOT NULL REFERENCES public.staff(id),
  preset text NOT NULL CHECK (preset IN ('manager', 'clerk', 'storekeeper', 'accounts', 'custom')),
  permissions text[] NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, staff_id)
);
CREATE INDEX IF NOT EXISTS kitchen_staff_access_branch_idx ON public.kitchen_staff_access(branch_id);
CREATE INDEX IF NOT EXISTS kitchen_staff_access_staff_idx ON public.kitchen_staff_access(staff_id);

-- How the kitchen's days lock: automatically after a grace hour, and/or up to a date.
CREATE TABLE IF NOT EXISTS public.kitchen_lock_settings (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  auto_lock boolean NOT NULL DEFAULT false,
  open_until_hour smallint NOT NULL DEFAULT 11 CHECK (open_until_hour BETWEEN 0 AND 23),
  lock_through date,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id)
);
CREATE INDEX IF NOT EXISTS kitchen_lock_settings_branch_idx ON public.kitchen_lock_settings(branch_id);

-- Who changed what: edits, voids, locked-day changes, permission and lock changes.
CREATE TABLE IF NOT EXISTS public.kitchen_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_name text NOT NULL,
  action text NOT NULL,
  subject text NOT NULL,
  subject_id uuid,
  on_date date,
  reason text CHECK (reason IS NULL OR length(reason) <= 200),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS kitchen_audit_log_scope_idx ON public.kitchen_audit_log(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kitchen_audit_log_branch_idx ON public.kitchen_audit_log(branch_id);

-- Access and lock rows are read and written only through the functions below.
ALTER TABLE public.kitchen_staff_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_lock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_staff_access, public.kitchen_lock_settings, public.kitchen_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_staff_access, public.kitchen_lock_settings, public.kitchen_audit_log TO service_role;

-- Every permission a kitchen login can hold. Managing permissions, locks and
-- changing locked days are the owner's alone and are not in this list.
CREATE OR REPLACE FUNCTION public.kitchen_all_permissions()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY[
    'entries.send', 'entries.receive', 'entries.buy', 'entries.pay', 'entries.spend', 'entries.batch', 'entries.count', 'entries.backdate',
    'fix.own', 'fix.any',
    'invoices.create', 'invoices.receive', 'invoices.cancel',
    'money.view', 'money.move', 'money.opening',
    'setup.items', 'setup.parties', 'setup.categories', 'setup.roster',
    'attendance.mark', 'reports.view', 'reports.export', 'amounts.view', 'audit.view'
  ]::text[];
$$;

-- The caller's staff row, chosen as auth_staff_row chooses it.
CREATE OR REPLACE FUNCTION public.kitchen_staff_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id FROM public.staff s
   WHERE s.auth_user_id = auth.uid() AND s.status = 'active' AND s.deleted_at IS NULL
   ORDER BY s.created_at ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_actor_name()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT nullif(btrim(s.name), '') FROM public.staff s WHERE s.id = public.kitchen_staff_id()), 'Staff');
$$;

-- The owner of the tenant, using this kitchen.
CREATE OR REPLACE FUNCTION public.kitchen_is_owner(p_tenant_id uuid, p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(public.kitchen_can_use(p_tenant_id, p_branch_id) AND public.auth_role() = 'owner', false);
$$;

-- The caller's permissions in this kitchen (none when they cannot use it).
CREATE OR REPLACE FUNCTION public.kitchen_permissions(p_tenant_id uuid, p_branch_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_perms text[];
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.kitchen_can_use(p_tenant_id, p_branch_id), false) THEN
    RETURN ARRAY[]::text[];
  END IF;
  IF public.auth_role() IN ('owner', 'admin') THEN RETURN public.kitchen_all_permissions(); END IF;
  SELECT a.permissions INTO v_perms FROM public.kitchen_staff_access a
   WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id AND a.staff_id = public.kitchen_staff_id();
  RETURN coalesce(v_perms, public.kitchen_all_permissions());
END $$;

CREATE OR REPLACE FUNCTION public.kitchen_can(p_tenant_id uuid, p_branch_id uuid, p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_permission = ANY(public.kitchen_permissions(p_tenant_id, p_branch_id));
$$;

CREATE OR REPLACE FUNCTION public.kitchen_require(p_tenant_id uuid, p_branch_id uuid, p_permission text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.kitchen_can(p_tenant_id, p_branch_id, p_permission) THEN
    RAISE EXCEPTION 'KITCHEN_NOT_ALLOWED' USING ERRCODE = '42501', DETAIL = p_permission;
  END IF;
END $$;

-- The last locked day: the later of the owner's date and the automatic lock.
-- With the automatic lock on, yesterday stays open until the grace hour today.
CREATE OR REPLACE FUNCTION public.kitchen_locked_through(p_tenant_id uuid, p_branch_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT greatest(s.lock_through,
    CASE WHEN s.auto_lock THEN (now() AT TIME ZONE 'Asia/Kolkata')::date - 1
      - CASE WHEN extract(hour FROM now() AT TIME ZONE 'Asia/Kolkata') < s.open_until_hour THEN 1 ELSE 0 END END)
  FROM public.kitchen_lock_settings s WHERE s.tenant_id = p_tenant_id AND s.branch_id = p_branch_id;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_audit(p_tenant_id uuid, p_branch_id uuid, p_action text, p_subject text,
  p_subject_id uuid, p_on_date date, p_reason text, p_details jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.kitchen_audit_log(tenant_id, branch_id, actor_id, actor_name, action, subject, subject_id, on_date, reason, details)
  VALUES (p_tenant_id, p_branch_id, auth.uid(), public.kitchen_actor_name(), p_action, p_subject, p_subject_id, p_on_date,
    left(nullif(btrim(coalesce(p_reason, '')), ''), 200), coalesce(p_details, '{}'::jsonb));
$$;

-- Stops a change to a locked day. The owner may go ahead when a reason was
-- given (kitchen.lock_reason, set by the calling function) or, for attendance,
-- without one; either way the change is logged.
CREATE OR REPLACE FUNCTION public.kitchen_lock_check(p_tenant_id uuid, p_branch_id uuid, p_date date,
  p_subject text, p_subject_id uuid, p_owner_needs_reason boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_locked date; v_reason text;
BEGIN
  IF auth.uid() IS NULL OR p_date IS NULL THEN RETURN; END IF;
  v_locked := public.kitchen_locked_through(p_tenant_id, p_branch_id);
  IF v_locked IS NULL OR p_date > v_locked THEN RETURN; END IF;
  v_reason := nullif(btrim(coalesce(current_setting('kitchen.lock_reason', true), '')), '');
  IF public.kitchen_is_owner(p_tenant_id, p_branch_id) AND (v_reason IS NOT NULL OR NOT p_owner_needs_reason) THEN
    PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'locked_day_change', p_subject, p_subject_id, p_date,
      coalesce(v_reason, 'Owner correction'), jsonb_build_object('locked_through', v_locked));
    RETURN;
  END IF;
  RAISE EXCEPTION 'KITCHEN_DAY_LOCKED' USING ERRCODE = '22023', DETAIL = v_locked::text;
END $$;

-- What the signed-in person may do here, for the app to show and hide.
CREATE OR REPLACE FUNCTION public.kitchen_my_access(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_lock public.kitchen_lock_settings%ROWTYPE; v_preset text;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.kitchen_can_use(p_tenant_id, p_branch_id), false) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_lock FROM public.kitchen_lock_settings WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  SELECT a.preset INTO v_preset FROM public.kitchen_staff_access a
   WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id AND a.staff_id = public.kitchen_staff_id();
  RETURN jsonb_build_object(
    'role', public.auth_role(),
    'is_owner', public.kitchen_is_owner(p_tenant_id, p_branch_id),
    'preset', CASE WHEN public.auth_role() IN ('owner', 'admin') THEN 'manager' ELSE coalesce(v_preset, 'manager') END,
    'permissions', to_jsonb(public.kitchen_permissions(p_tenant_id, p_branch_id)),
    'today', (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'locked_through', public.kitchen_locked_through(p_tenant_id, p_branch_id),
    'auto_lock', coalesce(v_lock.auto_lock, false),
    'open_until_hour', coalesce(v_lock.open_until_hour, 11),
    'lock_through', v_lock.lock_through,
    'lock_updated_by', v_lock.updated_by,
    'lock_updated_at', v_lock.updated_at);
END $$;

-- The kitchen's logins and their permissions. Owner only.
CREATE OR REPLACE FUNCTION public.kitchen_team(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.kitchen_is_owner(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_NOT_ALLOWED' USING ERRCODE = '42501', DETAIL = 'owner';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'staff_id', s.id, 'name', s.name, 'email', s.email, 'last_login_at', s.last_login_at,
      'preset', coalesce(a.preset, 'manager'),
      'permissions', to_jsonb(coalesce(a.permissions, public.kitchen_all_permissions())),
      'updated_by', a.updated_by, 'updated_at', a.updated_at) ORDER BY lower(s.name))
    FROM public.staff s
    LEFT JOIN public.kitchen_staff_access a ON a.staff_id = s.id AND a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id
    WHERE s.tenant_id = p_tenant_id AND s.branch_id = p_branch_id AND s.role = 'kitchen'
      AND s.status = 'active' AND s.deleted_at IS NULL), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.kitchen_set_staff_access(p_tenant_id uuid, p_branch_id uuid, p_staff_id uuid,
  p_preset text, p_permissions text[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before public.kitchen_staff_access%ROWTYPE; v_perms text[]; v_name text;
BEGIN
  IF NOT public.kitchen_is_owner(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_NOT_ALLOWED' USING ERRCODE = '42501', DETAIL = 'owner';
  END IF;
  SELECT s.name INTO v_name FROM public.staff s WHERE s.id = p_staff_id AND s.tenant_id = p_tenant_id
    AND s.branch_id = p_branch_id AND s.role = 'kitchen' AND s.status = 'active' AND s.deleted_at IS NULL;
  IF NOT FOUND OR p_preset IS NULL OR p_preset NOT IN ('manager', 'clerk', 'storekeeper', 'accounts', 'custom')
    OR p_permissions IS NULL OR NOT (p_permissions <@ public.kitchen_all_permissions()) THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), ARRAY[]::text[]) INTO v_perms FROM unnest(p_permissions) x;
  SELECT * INTO v_before FROM public.kitchen_staff_access WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND staff_id = p_staff_id;
  INSERT INTO public.kitchen_staff_access(tenant_id, branch_id, staff_id, preset, permissions, updated_by, updated_at)
  VALUES (p_tenant_id, p_branch_id, p_staff_id, p_preset, v_perms, public.kitchen_actor_name(), now())
  ON CONFLICT (tenant_id, branch_id, staff_id) DO UPDATE SET preset = EXCLUDED.preset, permissions = EXCLUDED.permissions,
    updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'access_changed', 'staff', p_staff_id, NULL, NULL,
    jsonb_build_object('name', v_name, 'preset', p_preset,
      'before', to_jsonb(coalesce(v_before.permissions, public.kitchen_all_permissions())), 'after', to_jsonb(v_perms)));
  RETURN jsonb_build_object('staff_id', p_staff_id, 'preset', p_preset, 'permissions', to_jsonb(v_perms));
END $$;

CREATE OR REPLACE FUNCTION public.kitchen_set_lock(p_tenant_id uuid, p_branch_id uuid, p_auto_lock boolean,
  p_open_until_hour integer, p_lock_through date)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before public.kitchen_lock_settings%ROWTYPE;
BEGIN
  IF NOT public.kitchen_is_owner(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_NOT_ALLOWED' USING ERRCODE = '42501', DETAIL = 'owner';
  END IF;
  IF p_auto_lock IS NULL OR p_open_until_hour IS NULL OR p_open_until_hour NOT BETWEEN 0 AND 23
    OR p_lock_through > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_before FROM public.kitchen_lock_settings WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  INSERT INTO public.kitchen_lock_settings(tenant_id, branch_id, auto_lock, open_until_hour, lock_through, updated_by, updated_at)
  VALUES (p_tenant_id, p_branch_id, p_auto_lock, p_open_until_hour, p_lock_through, public.kitchen_actor_name(), now())
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET auto_lock = EXCLUDED.auto_lock, open_until_hour = EXCLUDED.open_until_hour,
    lock_through = EXCLUDED.lock_through, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'lock_changed', 'lock', NULL, p_lock_through, NULL,
    jsonb_build_object('before', jsonb_build_object('auto_lock', coalesce(v_before.auto_lock, false), 'open_until_hour', coalesce(v_before.open_until_hour, 11), 'lock_through', v_before.lock_through),
      'after', jsonb_build_object('auto_lock', p_auto_lock, 'open_until_hour', p_open_until_hour, 'lock_through', p_lock_through)));
  RETURN public.kitchen_my_access(p_tenant_id, p_branch_id);
END $$;

-- The change log, newest first, for logins with audit.view.
CREATE OR REPLACE FUNCTION public.kitchen_audit_page(p_tenant_id uuid, p_branch_id uuid, p_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'audit.view');
  IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC, l.id) FROM (
      SELECT id, created_at, actor_name, action, subject, subject_id, on_date, reason, details
      FROM public.kitchen_audit_log WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
      ORDER BY created_at DESC, id LIMIT 50 OFFSET p_page * 50) l), '[]'::jsonb);
END $$;

-- Internal helpers stay private; the checks the app and policies use are granted.
REVOKE ALL ON FUNCTION public.kitchen_all_permissions(), public.kitchen_staff_id(), public.kitchen_actor_name(),
  public.kitchen_permissions(uuid, uuid), public.kitchen_locked_through(uuid, uuid),
  public.kitchen_audit(uuid, uuid, text, text, uuid, date, text, jsonb),
  public.kitchen_lock_check(uuid, uuid, date, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_all_permissions(), public.kitchen_staff_id(), public.kitchen_actor_name(),
  public.kitchen_permissions(uuid, uuid), public.kitchen_locked_through(uuid, uuid),
  public.kitchen_audit(uuid, uuid, text, text, uuid, date, text, jsonb),
  public.kitchen_lock_check(uuid, uuid, date, text, uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.kitchen_is_owner(uuid, uuid), public.kitchen_can(uuid, uuid, text), public.kitchen_require(uuid, uuid, text),
  public.kitchen_my_access(uuid, uuid), public.kitchen_team(uuid, uuid),
  public.kitchen_set_staff_access(uuid, uuid, uuid, text, text[]), public.kitchen_set_lock(uuid, uuid, boolean, integer, date),
  public.kitchen_audit_page(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_is_owner(uuid, uuid), public.kitchen_can(uuid, uuid, text), public.kitchen_require(uuid, uuid, text),
  public.kitchen_my_access(uuid, uuid), public.kitchen_team(uuid, uuid),
  public.kitchen_set_staff_access(uuid, uuid, uuid, text, text[]), public.kitchen_set_lock(uuid, uuid, boolean, integer, date),
  public.kitchen_audit_page(uuid, uuid, integer) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
