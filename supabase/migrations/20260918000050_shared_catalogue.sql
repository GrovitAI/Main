-- The menu and the inventory master lists are shared by the whole business —
-- Task 93 (prerequisite; run before 20260918000100_admin_is_branch_scoped.sql).
--
-- Le Leban keeps one menu and one set of inventory masters, and every row of
-- them carries the Kolathur branch id: 41 products, 4 categories, 70 materials,
-- 24 units, the suppliers and the vendor prices. The read policies on those
-- tables are branch-scoped, so the other outlets could only see them through an
-- account the database treated as business-wide. Velachery's cashier logins see
-- an empty menu today; its till works because it is signed in as the Velachery
-- admin. Narrowing the admin role without this migration would empty
-- Velachery's menu mid-service.
--
-- This makes the shared lists what they already are in practice:
--   * SELECT: any signed-in member of the tenant.
--   * INSERT / UPDATE / DELETE: whoever could write them before. That was
--     branch access (plus manager level for the menu), and admins reached every
--     branch. The admin clause is kept explicitly so an admin can still run the
--     shared menu after the role is narrowed; nobody gains a write they lacked.
--
-- No data is changed. Safe to run twice.

CREATE OR REPLACE FUNCTION public.auth_can_write_shared(p_tenant_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.auth_can_access_branch(p_tenant_id, p_branch_id)
      OR (p_tenant_id = public.auth_tenant_id()
          AND coalesce((SELECT role FROM public.auth_staff_row()) = 'admin', false));
$function$;

REVOKE ALL ON FUNCTION public.auth_can_write_shared(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_write_shared(uuid, uuid) TO authenticated;

DO $$
DECLARE
  r record;
  v_write text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('products', true),
      ('categories', true),
      ('inventory_categories', false),
      ('inventory_materials', false),
      ('inventory_units', false),
      ('inventory_suppliers', false),
      ('inventory_material_vendor_prices', false)
    ) AS t(tbl, needs_manager)
  LOOP
    v_write := 'public.auth_can_write_shared(tenant_id, branch_id)'
      || CASE WHEN r.needs_manager THEN ' AND public.auth_is_manager()' ELSE '' END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_select', r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.auth_tenant_id())', r.tbl || '_select', r.tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_insert', r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', r.tbl || '_insert', r.tbl, v_write);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_update', r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', r.tbl || '_update', r.tbl, v_write, v_write);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_delete', r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', r.tbl || '_delete', r.tbl, v_write);
  END LOOP;
END $$;
