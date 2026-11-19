-- Task 326: a Stock staff preset for kitchen logins that only record usage and stock: Give to
-- kitchen, Create batches and Count stock. The permissions themselves already exist; this only lets
-- the preset be saved under its own name. Editing their entries needs a manager (no fix.own), and
-- the day lock applies as for everyone. No figures change.

ALTER TABLE public.kitchen_staff_access DROP CONSTRAINT IF EXISTS kitchen_staff_access_preset_check;
ALTER TABLE public.kitchen_staff_access ADD CONSTRAINT kitchen_staff_access_preset_check
  CHECK (preset IN ('manager', 'clerk', 'storekeeper', 'accounts', 'stock', 'custom'));

-- As in 20261012140000_kitchen_access.sql, with 'stock' among the presets.
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
  IF NOT FOUND OR p_preset IS NULL OR p_preset NOT IN ('manager', 'clerk', 'storekeeper', 'accounts', 'stock', 'custom')
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
