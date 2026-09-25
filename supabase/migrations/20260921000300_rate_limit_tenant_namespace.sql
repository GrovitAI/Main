-- ============================================================================
-- Migration: namespace rate-limit keys by the caller's tenant
-- RLS audit 2026-09-21, finding M1.  NOT YET APPLIED.
--
-- check_rate_limit(p_key, p_limit, p_window_seconds) is SECURITY DEFINER and
-- executable by every signed-in user, because the serverless API calls it with
-- the caller's own JWT (src/lib/server/api-auth.ts rateLimit()). The key is
-- whatever text the caller sends, and the hit counter behind a key is shared
-- by everyone who sends that key.
--
-- The API's keys are predictable: `printjobs:<branch uuid>`,
-- `approval:request:<branch uuid>:<ip>`, `staff:create:<tenant uuid>:<ip>`.
-- So a user of tenant A can call the RPC directly, in a loop, with
-- `printjobs:<tenant B's branch id>` and push B's counter past 120 every
-- minute. B's cashiers then get "Too many print jobs" from /api/printjobs for
-- as long as the loop runs. Branch ids are not secret (Le Laban's are
-- patterned, and staff_branch_access leaked them until migration
-- 20260921000100). That is a cross-tenant denial of service on printing.
--
-- Fix: the function prefixes the stored key with the caller's tenant id, taken
-- from the JWT via auth_tenant_id(), never from an argument. Two tenants
-- sending the same key now hit different counters. Callers with no staff row
-- share the single bucket 'no-tenant'. The API does not change: keys are
-- opaque to it, and the signature and return type are identical.
--
-- One-off effect on apply: counters already in api_rate_limits are keyed the
-- old way, so every window effectively restarts once. The opportunistic
-- cleanup inside the function removes the orphans within a day.
-- Re-runnable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row api_rate_limits%ROWTYPE;
  v_key text := coalesce(public.auth_tenant_id()::text, 'no-tenant') || '|' || coalesce(p_key, '');
BEGIN
  INSERT INTO public.api_rate_limits AS r (rate_key, window_start, hits)
  VALUES (v_key, now(), 1)
  ON CONFLICT (rate_key) DO UPDATE
    SET hits = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds)
                    THEN 1 ELSE r.hits + 1 END,
        window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds)
                            THEN now() ELSE r.window_start END
  RETURNING * INTO v_row;

  -- Opportunistic cleanup of stale keys (cheap, bounded).
  DELETE FROM public.api_rate_limits
   WHERE rate_key IN (SELECT rate_key FROM public.api_rate_limits
                       WHERE window_start < now() - interval '1 day' LIMIT 100);

  RETURN v_row.hits <= p_limit;
END;
$function$;
