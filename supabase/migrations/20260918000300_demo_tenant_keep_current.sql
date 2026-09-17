-- Keep the demo restaurant's data ending today — Task 95.
--
-- The demo tenant (20260917000100_demo_tenant_seed.sql) was seeded with three
-- weeks of bills ending on the day it was written. Analytics opens on Today, so
-- the morning after the seed a reviewer signing in as appreview@grovitai.com
-- sees an empty dashboard: no orders, no revenue, flat charts. An app that
-- looks empty is an app that gets rejected, and the gap widens every day the
-- review sits in Apple's queue.
--
-- This rolls the demo tenant's bills forward by whole days so the newest bill
-- always lands on today, keeping each bill's time of day and so the shape of
-- the trading day. A nightly cron job runs it just after midnight IST.
--
-- Safety: the function hardcodes the demo tenant id AND re-checks the tenant's
-- name before writing anything, so it cannot touch Le Leban's books even if the
-- id were ever reused. It shifts by whole days only, never reorders or deletes,
-- and does nothing when the data already ends today. Safe to run twice.

CREATE OR REPLACE FUNCTION public.demo_tenant_roll_forward()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant constant uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_name   constant text := 'Grovit Demo Cafe';
  v_zone   constant text := 'Asia/Kolkata';
  v_last   date;
  v_today  date;
  v_shift  integer;
BEGIN
  -- Belt and braces: the id is hardcoded above, but refuse to run at all
  -- unless that id really is the demo restaurant.
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant AND name = v_name) THEN
    RAISE WARNING 'demo_tenant_roll_forward: % is not the demo tenant; nothing done.', v_tenant;
    RETURN 0;
  END IF;

  SELECT max((created_at AT TIME ZONE v_zone)::date) INTO v_last
    FROM public.bills WHERE tenant_id = v_tenant;
  IF v_last IS NULL THEN
    RETURN 0;
  END IF;

  v_today := (now() AT TIME ZONE v_zone)::date;
  v_shift := v_today - v_last;

  -- Already current, or the clock has gone backwards: leave it alone.
  IF v_shift <= 0 THEN
    RETURN 0;
  END IF;

  -- A sane upper bound. A shift this large means something is wrong
  -- (a restored backup, a paused project) and a human should look.
  IF v_shift > 400 THEN
    RAISE WARNING 'demo_tenant_roll_forward: % days is too large a shift; nothing done.', v_shift;
    RETURN 0;
  END IF;

  UPDATE public.bills
     SET created_at   = created_at   + make_interval(days => v_shift),
         settled_at   = settled_at   + make_interval(days => v_shift),
         cancelled_at = cancelled_at + make_interval(days => v_shift),
         refunded_at  = refunded_at  + make_interval(days => v_shift),
         updated_at   = updated_at   + make_interval(days => v_shift)
   WHERE tenant_id = v_tenant;

  UPDATE public.settlements
     SET created_at = created_at + make_interval(days => v_shift)
   WHERE tenant_id = v_tenant;

  UPDATE public.finance_entries
     SET transaction_date = transaction_date + v_shift,
         entered_at       = entered_at + make_interval(days => v_shift),
         settled_at       = settled_at + make_interval(days => v_shift),
         updated_at       = updated_at + make_interval(days => v_shift)
   WHERE tenant_id = v_tenant;

  RETURN v_shift;
END $function$;

REVOKE ALL ON FUNCTION public.demo_tenant_roll_forward() FROM PUBLIC;

-- 00:35 IST, which is 19:05 UTC the previous day. Early enough that the demo is
-- current before anyone in Cupertino starts work, late enough not to collide
-- with the 21:30 UTC finance snapshot job.
SELECT cron.unschedule('demo-tenant-roll-forward')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo-tenant-roll-forward');

SELECT cron.schedule('demo-tenant-roll-forward', '5 19 * * *',
                     'SELECT public.demo_tenant_roll_forward();');
