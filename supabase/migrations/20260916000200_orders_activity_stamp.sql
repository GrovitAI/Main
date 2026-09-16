-- ============================================================================
-- Migration: Orders activity stamp — Task 73
--
-- Cuts Supabase egress from the Orders tab. Every till polls the day's orders
-- every ten seconds; each poll re-downloaded every order, item and kitchen
-- ticket of the day (about 170 MB a day by the evening). This adds one row
-- per branch that records when its orders last changed. The app now reads
-- that one row per poll and downloads the orders only when the stamp moves.
--
--   1. branch_activity: one row per (tenant, branch), orders_changed_at.
--   2. A trigger on open_orders, open_order_items and kots that stamps the
--      row on every insert, update or delete. The trigger swallows its own
--      errors so a stamp failure can never block an order write.
--   3. Row level security: staff can read only the branches they can access;
--      nobody writes to it except the trigger (SECURITY DEFINER).
--
-- Idempotent and additive. Safe to apply while the shop is open: AFTER triggers,
-- no change to existing rows. Not yet applied to the live project.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branch_activity (
  tenant_id         uuid        NOT NULL,
  branch_id         uuid        NOT NULL,
  orders_changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id)
);

ALTER TABLE public.branch_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branch_activity_select ON public.branch_activity;
CREATE POLICY branch_activity_select ON public.branch_activity
  FOR SELECT TO authenticated
  USING (public.auth_can_access_branch(tenant_id, branch_id));

REVOKE ALL ON public.branch_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.branch_activity TO authenticated;

-- Every branch gets a row now, so the first poll of a quiet branch finds one.
INSERT INTO public.branch_activity (tenant_id, branch_id)
SELECT b.tenant_id, b.id FROM public.branches b
ON CONFLICT (tenant_id, branch_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_touch_branch_orders_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_branch uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'open_order_items' THEN
      SELECT o.tenant_id, o.branch_id INTO v_tenant, v_branch
      FROM public.open_orders o
      WHERE o.id = COALESCE(NEW.open_order_id, OLD.open_order_id);
    ELSIF TG_OP = 'DELETE' THEN
      v_tenant := OLD.tenant_id;
      v_branch := OLD.branch_id;
    ELSE
      v_tenant := NEW.tenant_id;
      v_branch := NEW.branch_id;
    END IF;

    IF v_tenant IS NOT NULL AND v_branch IS NOT NULL THEN
      INSERT INTO public.branch_activity (tenant_id, branch_id, orders_changed_at)
      VALUES (v_tenant, v_branch, clock_timestamp())
      ON CONFLICT (tenant_id, branch_id)
      DO UPDATE SET orders_changed_at = EXCLUDED.orders_changed_at;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- The stamp is a hint for polling clients. It must never fail a sale.
    RAISE WARNING 'branch_activity stamp skipped: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_open_orders_activity ON public.open_orders;
CREATE TRIGGER trg_open_orders_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.open_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_branch_orders_activity();

DROP TRIGGER IF EXISTS trg_open_order_items_activity ON public.open_order_items;
CREATE TRIGGER trg_open_order_items_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.open_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_branch_orders_activity();

DROP TRIGGER IF EXISTS trg_kots_activity ON public.kots;
CREATE TRIGGER trg_kots_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.kots
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_branch_orders_activity();
