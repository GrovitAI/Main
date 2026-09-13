-- ============================================================================
-- Migration: close the legacy rpc_* functions to the public key
--
-- Post-flight check 4 on 2026-09-13 found five functions from an earlier
-- design that anyone holding the publishable anon key could execute:
--
--   rpc_allocate_sequence, rpc_cancel_order, rpc_confirm_order,
--   rpc_send_kot, rpc_settle_bill
--
-- All five are SECURITY DEFINER and owned by postgres, so they run with the
-- owner's rights and bypass row level security. With only the anon key a
-- caller could cancel, confirm or settle an order, or send a KOT, for any
-- tenant and branch by supplying its ids.
--
-- No application code calls any of them: not main, not the deployed build.
-- Settlement goes through settle_order, numbering through next_branch_sequence.
-- So EXECUTE is revoked from PUBLIC, anon and authenticated alike. The
-- functions are kept, not dropped, so the change is reversible; service_role
-- and the owner retain access.
--
-- The same check listed five trigger functions. A trigger function cannot be
-- called directly, and PostgreSQL does not check EXECUTE when a trigger fires,
-- so this only tidies the grant: EXECUTE is revoked from PUBLIC and anon.
--
-- Every overload with these names is covered, and the file is re-runnable.
--
-- Applied to the live project on 2026-09-13, after 20260907010000.
-- ============================================================================

DO $$
DECLARE
  fn text;
BEGIN
  -- Legacy SECURITY DEFINER RPCs: nobody but the owner and service_role.
  FOR fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('rpc_allocate_sequence', 'rpc_cancel_order', 'rpc_confirm_order',
                         'rpc_send_kot', 'rpc_settle_bill')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    RAISE NOTICE 'Closed %', fn;
  END LOOP;

  -- Trigger helpers: not callable directly; drop the stray public grant.
  FOR fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('finance_expenses_before_write', 'set_updated_at', 'trigger_set_updated_at',
                         'trigger_update_open_order_version', 'update_updated_at_column')
       AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    RAISE NOTICE 'Tidied %', fn;
  END LOOP;
END $$;

-- Report: none of these should be executable by anon or PUBLIC any more.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')   AS anon_exec,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('rpc_allocate_sequence', 'rpc_cancel_order', 'rpc_confirm_order', 'rpc_send_kot',
                     'rpc_settle_bill', 'finance_expenses_before_write', 'set_updated_at',
                     'trigger_set_updated_at', 'trigger_update_open_order_version', 'update_updated_at_column')
 ORDER BY p.proname;
