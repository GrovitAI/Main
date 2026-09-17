-- An admin runs one branch — Task 93 (1 of 2).
--
-- Until now the database treated `admin` exactly like `owner`: business-wide.
-- The Le Leban admins are branch admins (one per outlet), so an admin could read
-- every other branch's bills, orders, stock and settlements, and could edit the
-- branches table and any staff row in the business.
--
-- Branch scoping is centralised: 145 policies go through
-- auth_can_access_branch(), which asks auth_is_tenant_wide(). Narrowing that one
-- function to the owner scopes an admin to their own branch everywhere at once,
-- including the report functions (analytics, finance summaries, bill KPIs), which
-- run with the caller's rights and so inherit the same rows.
--
-- What an admin keeps: everything inside their own branch, manager-level writes
-- there (auth_is_manager is unchanged), and stock transfers their branch is a
-- party to (those policies already allow the requesting and supplying branch).
-- What an admin loses: other branches' data, and creating, editing or deleting
-- branches, which becomes the owner's alone.
--
-- No data is changed. Safe to run twice.

CREATE OR REPLACE FUNCTION public.auth_is_tenant_wide()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT coalesce((SELECT role FROM public.auth_staff_row()) = 'owner', false); $function$;

-- Staff rows: a manager-level user could write any staff row in the business,
-- including another branch's staff and the owner's own row. Below the owner,
-- writes are now limited to non-owner staff of the writer's own branch.
DROP POLICY IF EXISTS staff_insert ON public.staff;
CREATE POLICY staff_insert ON public.staff FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_is_manager()
    AND (public.auth_is_tenant_wide() OR (branch_id = public.auth_branch_id() AND role <> 'owner'))
  );

DROP POLICY IF EXISTS staff_update ON public.staff;
CREATE POLICY staff_update ON public.staff FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_is_manager()
    AND (public.auth_is_tenant_wide() OR (branch_id = public.auth_branch_id() AND role <> 'owner'))
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_is_manager()
    AND (public.auth_is_tenant_wide() OR (branch_id = public.auth_branch_id() AND role <> 'owner'))
  );

DROP POLICY IF EXISTS staff_delete ON public.staff;
CREATE POLICY staff_delete ON public.staff FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_is_manager()
    AND (public.auth_is_tenant_wide() OR (branch_id = public.auth_branch_id() AND role <> 'owner'))
  );
