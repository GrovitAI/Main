-- ============================================================================
-- Migration: lock down the nine tables that still have no row level security
-- RLS audit 2026-09-21, finding C1.  NOT YET APPLIED.
--
-- Nine tables in schema public have RLS switched off:
--
--   pos_audit_logs, pos_domain_events, print_jobs, refund_items, request_log,
--   sequence_trackers, settings, staff_branch_access, tax_configs
--
-- The anon key has no grant on any of them, but the `authenticated` role holds
-- SELECT, INSERT, UPDATE, DELETE and TRUNCATE on all nine. With RLS off, a
-- grant is the only gate, so every signed-in user of every tenant can read and
-- rewrite every row. The audit proved it: signed in as the App Store demo
-- reviewer (tenant "Grovit Demo Cafe"), these counts came back non-zero for
-- rows belonging to Le Laban:
--
--   tax_configs          1   (Le Laban's "GST 5%" row)
--   sequence_trackers    1   (Kolathur bill_number counter)
--   staff_branch_access  2   (the Kolathur manager's branch list)
--
-- The other six tables are empty today, so nothing else has leaked yet, but
-- any tenant could also INSERT into or TRUNCATE them.
--
-- No application code reads or writes any of the nine: not src/, not api/,
-- not scripts/. The only database code that touches them is the legacy rpc_*
-- family, which is SECURITY DEFINER, owned by postgres, and therefore
-- unaffected by RLS or by these revokes. So this migration:
--
--   1. enables RLS with no policies (deny-all for anon and authenticated), and
--   2. revokes the table grants from anon and authenticated as a second lock.
--
-- service_role and the owner keep full access. Re-runnable. Reversible with
-- ALTER TABLE ... DISABLE ROW LEVEL SECURITY and GRANT.
--
-- Verify afterwards, signed in as any staff member:
--   SELECT count(*) FROM public.tax_configs;   -- expect "permission denied"
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_audit_logs', 'pos_domain_events', 'print_jobs', 'refund_items',
    'request_log', 'sequence_trackers', 'settings', 'staff_branch_access',
    'tax_configs'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
