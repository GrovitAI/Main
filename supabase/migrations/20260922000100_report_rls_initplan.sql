-- ============================================================================
-- Migration: evaluate the tenant helpers once per query, not once per row,
-- on the six tables the report RPCs read.
-- Report performance pass 2026-09-21.  NOT YET APPLIED.
--
-- Every report RPC is SECURITY INVOKER, so each row it touches passes through
-- that table's SELECT policy. Five of the six policies are
--
--   USING (auth_can_access_branch(tenant_id, branch_id))
--
-- auth_can_access_branch() is SECURITY DEFINER, which PostgreSQL can never
-- inline, and it calls auth_tenant_id(), auth_is_tenant_wide() and
-- auth_branch_id(), each of which runs auth_staff_row() — a query on `staff`.
-- That is three lookups of the same staff row FOR EVERY ROW READ. Measured on
-- the live database as the Le Laban owner:
--
--   bills         0.49 ms per row   (Seq Scan, 5,985 rows  -> 2.8 s)
--   settlements   0.50 ms per row
--   bill_items    0.99 ms per row   (its policy looks up the bill, and the
--                                    bill's own policy then runs as well, so
--                                    the helper fires twice per item)
--
-- Run as postgres, which bypasses RLS, the same seven RPCs over a full year
-- take 9–34 ms. As the owner they take 2.5–8.4 s. The whole difference is
-- this function call; no index is missing.
--
-- The fix is the one Supabase documents for RLS: wrap each helper in a scalar
-- sub-select. An uncorrelated sub-select is an InitPlan, which the executor
-- evaluates once per statement and then reuses for every row.
--
--   auth_can_access_branch(tenant_id, branch_id)
--     is defined as
--   tenant_id = auth_tenant_id()
--     AND (auth_is_tenant_wide() OR branch_id = auth_branch_id())
--
-- so the policies below are that exact expression with each call wrapped in
-- (SELECT ...). Three-valued logic is unchanged: a caller with no staff row
-- gets NULL from auth_tenant_id(), the comparison is NULL, and RLS treats NULL
-- as a refusal, exactly as today. The helpers are STABLE, so evaluating them
-- once per statement cannot give a different answer from evaluating them per
-- row. Verified read-only by running the rewritten predicate by hand as the
-- Kolathur manager: 5,234 bill_items rows kept, 2,080 (Velachery and the demo
-- tenant) refused, 10.7 ms, helpers executed once each.
--
-- Scope: SELECT policies only, on bills, bill_items, settlements, expenses,
-- refunds and inventory_purchase_headers. INSERT/UPDATE/DELETE policies touch
-- one row at a time and are left alone. ALTER POLICY is atomic and keeps the
-- policy's name, command and roles; there is no moment with no policy.
--
-- Rollback: for the five simple tables,
--   ALTER POLICY <t>_select ON public.<t>
--     USING (auth_can_access_branch(tenant_id, branch_id));
-- and for bill_items,
--   ALTER POLICY bill_items_select ON public.bill_items USING (EXISTS (
--     SELECT 1 FROM bills b WHERE b.id = bill_items.bill_id
--        AND auth_can_access_branch(b.tenant_id, b.branch_id)));
--
-- Verify afterwards, signed in as the App Store demo reviewer:
--   SELECT count(*) FROM bills WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
--   -- must still be 0
-- Re-runnable.
-- ============================================================================

ALTER POLICY bills_select ON public.bills
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND ((SELECT public.auth_is_tenant_wide()) OR branch_id = (SELECT public.auth_branch_id()))
  );

ALTER POLICY settlements_select ON public.settlements
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND ((SELECT public.auth_is_tenant_wide()) OR branch_id = (SELECT public.auth_branch_id()))
  );

ALTER POLICY expenses_select ON public.expenses
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND ((SELECT public.auth_is_tenant_wide()) OR branch_id = (SELECT public.auth_branch_id()))
  );

ALTER POLICY refunds_select ON public.refunds
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND ((SELECT public.auth_is_tenant_wide()) OR branch_id = (SELECT public.auth_branch_id()))
  );

ALTER POLICY inventory_purchase_headers_select ON public.inventory_purchase_headers
  USING (
    tenant_id = (SELECT public.auth_tenant_id())
    AND ((SELECT public.auth_is_tenant_wide()) OR branch_id = (SELECT public.auth_branch_id()))
  );

ALTER POLICY bill_items_select ON public.bill_items
  USING (
    EXISTS (
      SELECT 1
        FROM public.bills b
       WHERE b.id = bill_items.bill_id
         AND b.tenant_id = (SELECT public.auth_tenant_id())
         AND ((SELECT public.auth_is_tenant_wide()) OR b.branch_id = (SELECT public.auth_branch_id()))
    )
  );
