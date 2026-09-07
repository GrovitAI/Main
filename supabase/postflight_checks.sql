-- ============================================================================
-- Post-migration verification. All read-only. Run in the Supabase SQL Editor
-- AFTER the migrations in docs/DEPLOYMENT_RUNBOOK_2026-09-07.md.
--
-- Every row must report PASS. A FAIL means the migration did not take effect,
-- and the anon key that ships inside the web bundle can still reach tenant data.
-- ============================================================================

-- 1. Row level security is enabled on every application table.
SELECT '1. tables WITHOUT row level security' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || string_agg(relname, ', ') END AS result
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relrowsecurity = false
   AND c.relname NOT IN ('schema_migrations')

UNION ALL

-- 2. Tables with RLS on but no policies deny everything, which silently breaks
--    the app for signed-in staff. api_rate_limits is intentionally in this
--    state: only the SECURITY DEFINER function touches it.
SELECT '2. RLS enabled but NO policies (locks out real users)',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'REVIEW: ' || string_agg(c.relname, ', ') END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relrowsecurity = true
   AND c.relname <> 'api_rate_limits'
   AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)

UNION ALL

-- 3. The anon role must hold no privilege on any application table.
SELECT '3. tables still granting privileges to anon',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || string_agg(DISTINCT table_name, ', ') END
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee = 'anon'

UNION ALL

-- 4. No function may be executable by anon or PUBLIC. Postgres grants EXECUTE
--    to PUBLIC on every new function, so each one needs an explicit REVOKE.
SELECT '4. functions executable by anon or PUBLIC',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || string_agg(DISTINCT p.proname, ', ') END
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('public', p.oid, 'EXECUTE'))

UNION ALL

-- 5. Every function the application calls is present.
SELECT '5. expected functions missing',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || string_agg(expected, ', ') END
  FROM (VALUES
    ('settle_order'), ('assign_order_numbers'), ('next_kot_number'),
    ('next_branch_sequence'), ('next_invoice_number'), ('get_bills_ledger_kpis'),
    ('process_consumption_batches'), ('run_consumption_worker'),
    ('create_dispatch'), ('receive_dispatch'), ('check_rate_limit'),
    ('auth_tenant_id'), ('auth_branch_id'), ('auth_can_access_branch')
  ) AS f(expected)
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f.expected)

UNION ALL

-- 6. Supporting tables exist.
SELECT '6. expected tables missing',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || string_agg(expected, ', ') END
  FROM (VALUES ('branch_counters'), ('api_rate_limits')) AS t(expected)
 WHERE to_regclass('public.' || t.expected) IS NULL

UNION ALL

-- 7. Constraints the settlement transaction relies on.
SELECT '7. required unique constraints missing',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || string_agg(expected, ', ') END
  FROM (VALUES
    ('unique_open_order_id'),
    ('uniq_settlements_bill_id'),
    ('uniq_bills_invoice_number_per_branch_v2')
  ) AS c(expected)
 WHERE NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = c.expected)
   AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.expected)

UNION ALL

-- 8. The consumption worker is scheduled.
SELECT '8. consumption worker cron job',
       CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
            THEN CASE WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'grovit-process-consumption-batches')
                      THEN 'PASS' ELSE 'FAIL: pg_cron installed but the job is not scheduled' END
            ELSE 'FAIL: pg_cron extension is not enabled' END

ORDER BY 1;
