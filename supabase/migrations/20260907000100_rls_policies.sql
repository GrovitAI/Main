-- ============================================================================
-- Migration: Row Level Security for every application table — Task 20 (C1)
--
-- Before this migration, tenant isolation was purely a client-side
-- `.eq('tenant_id', …)` filter on top of the public anon key. Anyone holding
-- the anon key (it ships in the web bundle) could read or modify every
-- tenant's rows. This migration makes PostgreSQL enforce isolation.
--
-- Model
--   * A signed-in user is mapped to exactly one active `staff` row via
--     staff.auth_user_id = auth.uid().
--   * Helper functions (SECURITY DEFINER, so they can read `staff` regardless
--     of RLS) expose the caller's tenant, branch and role.
--   * owner / admin roles see every branch of their tenant.
--     manager / cashier / kitchen see only their own branch.
--   * Tables without tenant columns (line items, KOT items, dispatch rows…)
--     inherit access from their parent row.
--   * The `anon` role gets NO access to application tables or RPCs.
--     Only `authenticated` users pass any policy. The service_role key
--     (server-side only) bypasses RLS as before.
--
-- How to apply: Supabase SQL Editor, run the whole file.
-- Rollback: see the commented block at the very end.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_staff_row()
RETURNS TABLE (tenant_id uuid, branch_id uuid, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.tenant_id, s.branch_id, s.role::text
    FROM public.staff s
   WHERE s.auth_user_id = auth.uid()
     AND s.status = 'active'
     AND s.deleted_at IS NULL
   ORDER BY s.created_at ASC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.auth_staff_row(); $$;

CREATE OR REPLACE FUNCTION public.auth_branch_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT branch_id FROM public.auth_staff_row(); $$;

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.auth_staff_row(); $$;

-- owner/admin may act across every branch of their tenant.
CREATE OR REPLACE FUNCTION public.auth_is_tenant_wide()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce((SELECT role FROM public.auth_staff_row()) IN ('owner', 'admin'), false); $$;

-- owner/admin/manager may administer staff, printers, settings.
CREATE OR REPLACE FUNCTION public.auth_is_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce((SELECT role FROM public.auth_staff_row()) IN ('owner', 'admin', 'manager'), false); $$;

-- Row-scope predicate for tables that carry tenant_id + branch_id.
CREATE OR REPLACE FUNCTION public.auth_can_access_branch(p_tenant_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_tenant_id = public.auth_tenant_id()
     AND (public.auth_is_tenant_wide() OR p_branch_id = public.auth_branch_id());
$$;

REVOKE ALL ON FUNCTION public.auth_staff_row() FROM public, anon;
REVOKE ALL ON FUNCTION public.auth_tenant_id() FROM public, anon;
REVOKE ALL ON FUNCTION public.auth_branch_id() FROM public, anon;
REVOKE ALL ON FUNCTION public.auth_role() FROM public, anon;
REVOKE ALL ON FUNCTION public.auth_is_tenant_wide() FROM public, anon;
REVOKE ALL ON FUNCTION public.auth_is_manager() FROM public, anon;
REVOKE ALL ON FUNCTION public.auth_can_access_branch(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.auth_staff_row() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_branch_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_tenant_wide() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_access_branch(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policy installer. One predicate per table, applied to SELECT / INSERT /
--    UPDATE / DELETE for the `authenticated` role. Existing policies with the
--    same names are replaced so the script is re-runnable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._install_rls(p_table text, p_read text, p_write text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RAISE NOTICE 'Skipping %: table does not exist', p_table;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_select', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_insert', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_update', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_delete', p_table);

  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
                 p_table || '_select', p_table, p_read);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
                 p_table || '_insert', p_table, p_write);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                 p_table || '_update', p_table, p_write, p_write);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
                 p_table || '_delete', p_table, p_write);
END;
$$;

DO $$
DECLARE
  -- Shorthands (kept as text so they can be injected into dynamic SQL).
  tb  constant text := 'public.auth_can_access_branch(tenant_id, branch_id)';
  t   constant text := 'tenant_id = public.auth_tenant_id()';
  mgr constant text := 'public.auth_is_manager()';
  tw  constant text := 'public.auth_is_tenant_wide()';
BEGIN
  -- Tenant root ---------------------------------------------------------------
  PERFORM public._install_rls('tenants',
    'id = public.auth_tenant_id()',
    'id = public.auth_tenant_id() AND ' || tw);
  PERFORM public._install_rls('subscriptions',  t, t || ' AND ' || tw);
  PERFORM public._install_rls('tenant_features', t, t || ' AND ' || tw);

  -- Branches: everyone in the tenant can read; owner/admin write.
  PERFORM public._install_rls('branches', t, t || ' AND ' || tw);

  -- Staff: read within tenant; owner/admin/manager manage.
  PERFORM public._install_rls('staff', t, t || ' AND ' || mgr);

  -- Configuration --------------------------------------------------------------
  PERFORM public._install_rls('pos_settings',  tb, tb || ' AND ' || mgr);
  PERFORM public._install_rls('pos_terminals', tb, tb);
  PERFORM public._install_rls('printers',      tb, tb || ' AND ' || mgr);
  PERFORM public._install_rls('categories',    tb, tb || ' AND ' || mgr);
  PERFORM public._install_rls('products',      tb, tb || ' AND ' || mgr);
  PERFORM public._install_rls('expenses',      tb, tb);

  -- Orders / KOT / Billing -----------------------------------------------------
  PERFORM public._install_rls('open_orders', tb, tb);
  PERFORM public._install_rls('open_order_items',
    'EXISTS (SELECT 1 FROM public.open_orders o WHERE o.id = open_order_id AND public.auth_can_access_branch(o.tenant_id, o.branch_id))',
    'EXISTS (SELECT 1 FROM public.open_orders o WHERE o.id = open_order_id AND public.auth_can_access_branch(o.tenant_id, o.branch_id))');
  PERFORM public._install_rls('kots', tb, tb);
  PERFORM public._install_rls('kot_items',
    'EXISTS (SELECT 1 FROM public.kots k WHERE k.id = kot_id AND public.auth_can_access_branch(k.tenant_id, k.branch_id))',
    'EXISTS (SELECT 1 FROM public.kots k WHERE k.id = kot_id AND public.auth_can_access_branch(k.tenant_id, k.branch_id))');
  PERFORM public._install_rls('bills', tb, tb);
  PERFORM public._install_rls('bill_items',
    'EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND public.auth_can_access_branch(b.tenant_id, b.branch_id))',
    'EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND public.auth_can_access_branch(b.tenant_id, b.branch_id))');
  PERFORM public._install_rls('settlements', tb, tb);

  -- Approval governance --------------------------------------------------------
  PERFORM public._install_rls('branch_approval_settings',         tb, tb || ' AND ' || mgr);
  PERFORM public._install_rls('branch_approval_settings_history', tb, tb || ' AND ' || mgr);
  PERFORM public._install_rls('approval_requests',                tb, tb);
  PERFORM public._install_rls('approval_email_verifications',     tb, tb || ' AND ' || mgr);

  -- Inventory master data ------------------------------------------------------
  PERFORM public._install_rls('inventory_categories',            tb, tb);
  PERFORM public._install_rls('inventory_units',                 tb, tb);
  PERFORM public._install_rls('inventory_suppliers',             tb, tb);
  PERFORM public._install_rls('inventory_materials',             tb, tb);
  PERFORM public._install_rls('inventory_material_stock_levels', tb, tb);
  PERFORM public._install_rls('inventory_material_vendor_prices', tb, tb);
  PERFORM public._install_rls('inventory_purchase_headers',      tb, tb);
  PERFORM public._install_rls('inventory_purchase_items',        tb, tb);
  PERFORM public._install_rls('inventory_stock_ledger',          tb, tb);
  PERFORM public._install_rls('inventory_adjustments',           tb, tb);
  PERFORM public._install_rls('inventory_wastage',               tb, tb);
  PERFORM public._install_rls('inventory_audit_logs',            tb, tb);
  PERFORM public._install_rls('inventory_alerts',                tb, tb);
  PERFORM public._install_rls('inventory_transfer_events',       tb, tb);
  PERFORM public._install_rls('inventory_transfer_variances',    tb, tb);
  PERFORM public._install_rls('inventory_consumption_batches',   tb, tb);
  PERFORM public._install_rls('inventory_consumption_jobs',      tb, tb);

  -- Inter-branch transfers: visible to both ends of the transfer.
  PERFORM public._install_rls('inventory_transfer_requests',
    t || ' AND (' || tw || ' OR requesting_branch_id = public.auth_branch_id() OR supplying_branch_id = public.auth_branch_id())',
    t || ' AND (' || tw || ' OR requesting_branch_id = public.auth_branch_id() OR supplying_branch_id = public.auth_branch_id())');
  PERFORM public._install_rls('inventory_transfer_request_items',
    'EXISTS (SELECT 1 FROM public.inventory_transfer_requests r WHERE r.id = request_id AND r.tenant_id = public.auth_tenant_id() AND (public.auth_is_tenant_wide() OR r.requesting_branch_id = public.auth_branch_id() OR r.supplying_branch_id = public.auth_branch_id()))',
    'EXISTS (SELECT 1 FROM public.inventory_transfer_requests r WHERE r.id = request_id AND r.tenant_id = public.auth_tenant_id() AND (public.auth_is_tenant_wide() OR r.requesting_branch_id = public.auth_branch_id() OR r.supplying_branch_id = public.auth_branch_id()))');
  PERFORM public._install_rls('inventory_dispatches',
    'EXISTS (SELECT 1 FROM public.inventory_transfer_requests r WHERE r.id = request_id AND r.tenant_id = public.auth_tenant_id() AND (public.auth_is_tenant_wide() OR r.requesting_branch_id = public.auth_branch_id() OR r.supplying_branch_id = public.auth_branch_id()))',
    'EXISTS (SELECT 1 FROM public.inventory_transfer_requests r WHERE r.id = request_id AND r.tenant_id = public.auth_tenant_id() AND (public.auth_is_tenant_wide() OR r.requesting_branch_id = public.auth_branch_id() OR r.supplying_branch_id = public.auth_branch_id()))');
  PERFORM public._install_rls('inventory_dispatch_items',
    'EXISTS (SELECT 1 FROM public.inventory_dispatches d JOIN public.inventory_transfer_requests r ON r.id = d.request_id WHERE d.id = dispatch_id AND r.tenant_id = public.auth_tenant_id() AND (public.auth_is_tenant_wide() OR r.requesting_branch_id = public.auth_branch_id() OR r.supplying_branch_id = public.auth_branch_id()))',
    'EXISTS (SELECT 1 FROM public.inventory_dispatches d JOIN public.inventory_transfer_requests r ON r.id = d.request_id WHERE d.id = dispatch_id AND r.tenant_id = public.auth_tenant_id() AND (public.auth_is_tenant_wide() OR r.requesting_branch_id = public.auth_branch_id() OR r.supplying_branch_id = public.auth_branch_id()))');

  -- Recipes are tenant-wide (shared across branches).
  PERFORM public._install_rls('inventory_recipes', t, t);
  PERFORM public._install_rls('inventory_recipe_items',
    'EXISTS (SELECT 1 FROM public.inventory_recipes rc WHERE rc.id = recipe_id AND rc.tenant_id = public.auth_tenant_id())',
    'EXISTS (SELECT 1 FROM public.inventory_recipes rc WHERE rc.id = recipe_id AND rc.tenant_id = public.auth_tenant_id())');
END $$;

DROP FUNCTION public._install_rls(text, text, text);

-- ---------------------------------------------------------------------------
-- 3. The anon role must not reach application tables or RPCs at all.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_analytics_summary', 'get_analytics_sales_trend',
                         'get_analytics_payment_split', 'get_analytics_item_performance',
                         'settle_order')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Sanity report
-- ---------------------------------------------------------------------------
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;

-- ---------------------------------------------------------------------------
-- ROLLBACK (emergency only — re-opens the database to the anon key):
--
-- DO $$ DECLARE r record; BEGIN
--   FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
--   END LOOP;
-- END $$;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
-- ---------------------------------------------------------------------------
