-- ============================================================================
-- Migration: revoke EXECUTE that nothing needs on SECURITY DEFINER functions
-- RLS audit 2026-09-21, finding L1.  NOT YET APPLIED.
--
-- Ten SECURITY DEFINER functions are executable with nothing but the
-- publishable anon key (Supabase advisor lint 0028). None is exploitable
-- today — each either returns false/NULL without a staff row, is a trigger
-- function PostgreSQL refuses to call directly, or is hard-wired to the demo
-- tenant — but none of them needs to be reachable either, and a definer
-- function that is reachable is one careless edit away from a hole.
--
--   demo_tenant_roll_forward()        called only by pg_cron (as postgres).
--                                     20260918000300 revoked PUBLIC, but the
--                                     explicit anon/authenticated grants that
--                                     Supabase adds by default survived.
--   finance_entries_after_void()      trigger functions: EXECUTE is not checked
--   finance_entries_audit()           when a trigger fires, so revoking it from
--   finance_entries_before_write()    every API role changes nothing at runtime.
--   finance_invalidate_snapshots()
--   finance_sync_partner_account()
--   trg_touch_branch_orders_activity()
--   auth_can_write_shared(uuid,uuid)  used inside RLS policies, which run as
--   finance_account_in_scope(uuid)    the querying role — so `authenticated`
--   finance_is_business_owner()       MUST keep EXECUTE. Only anon is revoked.
--
-- Re-runnable. Reversible with GRANT EXECUTE.
-- ============================================================================

-- Cron-only: no API role should be able to call it.
REVOKE EXECUTE ON FUNCTION public.demo_tenant_roll_forward() FROM PUBLIC, anon, authenticated;

-- Trigger functions.
REVOKE EXECUTE ON FUNCTION public.finance_entries_after_void()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_entries_audit()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_entries_before_write()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_invalidate_snapshots()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_sync_partner_account()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_touch_branch_orders_activity()  FROM PUBLIC, anon, authenticated;

-- Policy helpers: authenticated keeps EXECUTE, anon loses it.
REVOKE EXECUTE ON FUNCTION public.auth_can_write_shared(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_account_in_scope(uuid)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_is_business_owner()       FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.auth_can_write_shared(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_account_in_scope(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_is_business_owner()       TO authenticated;
