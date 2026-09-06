-- ============================================================================
-- Migration: Server-side recipe consumption worker — Task 23 (H3)
--
-- Before: the only processor of `inventory_consumption_batches` was a
-- fire-and-forget call in the browser after settlement. Closing the tab left
-- batches Pending forever, and insufficient stock was silently clamped to 0.
--
-- Now: `process_consumption_batches()` runs inside PostgreSQL. It
--   * picks Pending batches with FOR UPDATE SKIP LOCKED (safe to run from
--     several workers at once);
--   * expands bill lines → active recipe → recipe items into jobs (once,
--     idempotently, grouped per material);
--   * deducts stock under a row lock, never clamps: stock may go negative and
--     the ledger remark records the shortfall so it is visible, not lost;
--   * retries failed jobs up to 5 times with a 5-minute back-off;
--   * is scheduled every minute with pg_cron.
--
-- How to apply: Supabase SQL Editor, after 20260907000300.
-- If `CREATE EXTENSION pg_cron` is refused, enable pg_cron from
-- Dashboard → Database → Extensions, then re-run section 3 only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Worker
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_consumption_batches(p_limit integer DEFAULT 50)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch        record;
  v_job          record;
  v_level        record;
  v_now          timestamptz;
  v_tracking     boolean;
  v_next_stock   numeric;
  v_unit_cost    numeric;
  v_ledger_id    uuid;
  v_any_failed   boolean;
  v_remaining    integer;
  v_batch_cost   numeric;
  v_processed    integer := 0;
  v_failed       integer := 0;
  v_deferred     integer := 0;
BEGIN
  FOR v_batch IN
    SELECT b.*
      FROM public.inventory_consumption_batches b
     WHERE b.status = 'Pending'
     ORDER BY b.created_at
     LIMIT greatest(1, least(p_limit, 500))
     FOR UPDATE SKIP LOCKED
  LOOP
    v_now := now();
    v_any_failed := false;

    SELECT coalesce(inventory_tracking_enabled, true) INTO v_tracking
      FROM public.pos_settings
     WHERE tenant_id = v_batch.tenant_id AND branch_id = v_batch.branch_id
     LIMIT 1;
    v_tracking := coalesce(v_tracking, true);

    -- 1a. Expand the bill into per-material jobs exactly once.
    IF v_tracking AND NOT EXISTS (SELECT 1 FROM public.inventory_consumption_jobs j WHERE j.batch_id = v_batch.id) THEN
      INSERT INTO public.inventory_consumption_jobs
        (tenant_id, branch_id, batch_id, material_id, quantity_to_deduct, status)
      SELECT v_batch.tenant_id,
             v_batch.branch_id,
             v_batch.id,
             ri.material_id,
             sum((ri.quantity / nullif(coalesce(rc.yield_quantity, 1), 0)) * bi.qty),
             'Pending'
        FROM public.bill_items bi
        JOIN public.products p ON p.id = bi.product_id
        JOIN LATERAL (
          SELECT r.id, r.yield_quantity
            FROM public.inventory_recipes r
           WHERE r.tenant_id = v_batch.tenant_id
             AND r.is_active = true
             AND (r.id = p.recipe_id OR r.menu_item_id = p.id)
           ORDER BY (r.id = p.recipe_id) DESC, r.created_at DESC
           LIMIT 1
        ) rc ON true
        JOIN public.inventory_recipe_items ri ON ri.recipe_id = rc.id
       WHERE bi.bill_id = v_batch.bill_id
         AND bi.product_id IS NOT NULL
       GROUP BY ri.material_id
      HAVING sum((ri.quantity / nullif(coalesce(rc.yield_quantity, 1), 0)) * bi.qty) > 0;
    END IF;

    -- 1b. Process every job that is due.
    FOR v_job IN
      SELECT *
        FROM public.inventory_consumption_jobs
       WHERE batch_id = v_batch.id
         AND status <> 'Processed'
         AND attempt_count < 5
         AND (retry_after IS NULL OR retry_after <= v_now)
       ORDER BY created_at
       FOR UPDATE
    LOOP
      BEGIN
        SELECT * INTO v_level
          FROM public.inventory_material_stock_levels
         WHERE tenant_id = v_job.tenant_id
           AND branch_id = v_job.branch_id
           AND material_id = v_job.material_id
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 1
         FOR UPDATE;

        IF FOUND THEN
          v_next_stock := coalesce(v_level.current_stock, 0) - v_job.quantity_to_deduct;
          UPDATE public.inventory_material_stock_levels
             SET current_stock   = v_next_stock,
                 available_stock = v_next_stock - coalesce(reserved_stock, 0),
                 updated_at      = v_now
           WHERE id = v_level.id;
        ELSE
          v_next_stock := -v_job.quantity_to_deduct;
          INSERT INTO public.inventory_material_stock_levels
            (tenant_id, branch_id, material_id, location_id, current_stock, reserved_stock, available_stock, updated_at)
          VALUES
            (v_job.tenant_id, v_job.branch_id, v_job.material_id, 'Main Storage', v_next_stock, 0, v_next_stock, v_now);
        END IF;

        SELECT coalesce(average_cost, 0) INTO v_unit_cost
          FROM public.inventory_materials WHERE id = v_job.material_id;
        v_unit_cost := coalesce(v_unit_cost, 0);

        INSERT INTO public.inventory_stock_ledger
          (tenant_id, branch_id, material_id, transaction_date, transaction_type, reference_type,
           reference_id, qty_in, qty_out, balance_stock, unit_cost, total_value, remarks, created_by)
        VALUES
          (v_job.tenant_id, v_job.branch_id, v_job.material_id, v_now, 'Recipe Consumption', 'Sales Bill Batch',
           v_batch.id, 0, v_job.quantity_to_deduct, v_next_stock, v_unit_cost, v_next_stock * v_unit_cost,
           'Recipe consumption for POS bill. Batch: ' || v_batch.id
             || CASE WHEN v_next_stock < 0
                     THEN ' | SHORTFALL: stock is negative by ' || abs(v_next_stock)
                     ELSE '' END,
           'DB Worker')
        RETURNING id INTO v_ledger_id;

        UPDATE public.inventory_consumption_jobs
           SET status          = 'Processed',
               processed_at    = v_now,
               processed_by    = 'DB Worker',
               ledger_entry_id = v_ledger_id,
               attempt_count   = attempt_count + 1,
               last_attempt_at = v_now,
               retry_after     = NULL,
               error_message   = NULL
         WHERE id = v_job.id;
      EXCEPTION WHEN OTHERS THEN
        v_any_failed := true;
        UPDATE public.inventory_consumption_jobs
           SET status          = 'Failed',
               attempt_count   = attempt_count + 1,
               last_attempt_at = v_now,
               retry_after     = v_now + interval '5 minutes',
               error_message   = left(SQLERRM, 500)
         WHERE id = v_job.id;
      END;
    END LOOP;

    -- 1c. Finalise the batch.
    SELECT count(*) INTO v_remaining
      FROM public.inventory_consumption_jobs
     WHERE batch_id = v_batch.id AND status <> 'Processed';

    IF v_remaining = 0 THEN
      SELECT coalesce(sum(qty_out * unit_cost), 0) INTO v_batch_cost
        FROM public.inventory_stock_ledger
       WHERE reference_type = 'Sales Bill Batch' AND reference_id::text = v_batch.id::text;

      UPDATE public.inventory_consumption_batches
         SET status = 'Processed', processed_at = v_now, total_cost_snapshot = coalesce(v_batch_cost, 0)
       WHERE id = v_batch.id;
      v_processed := v_processed + 1;
    ELSIF NOT EXISTS (SELECT 1 FROM public.inventory_consumption_jobs
                       WHERE batch_id = v_batch.id AND status <> 'Processed' AND attempt_count < 5) THEN
      -- Every remaining job exhausted its retries.
      UPDATE public.inventory_consumption_batches
         SET status = 'Failed', processed_at = v_now
       WHERE id = v_batch.id;
      v_failed := v_failed + 1;
    ELSE
      v_deferred := v_deferred + 1;   -- stays Pending, retried on the next tick
    END IF;
  END LOOP;

  RETURN json_build_object('processed', v_processed, 'failed', v_failed, 'deferred', v_deferred);
END;
$$;

REVOKE ALL ON FUNCTION public.process_consumption_batches(integer) FROM public, anon, authenticated;

-- Manual trigger for managers ("Process pending deductions" button).
CREATE OR REPLACE FUNCTION public.run_consumption_worker()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_manager() THEN
    RAISE EXCEPTION 'WORKER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN public.process_consumption_batches(200);
END;
$$;
REVOKE ALL ON FUNCTION public.run_consumption_worker() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_consumption_worker() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reset batches that were stuck by the old client-side path so the worker
--    picks them up (jobs already marked Processed are left alone).
-- ---------------------------------------------------------------------------
UPDATE public.inventory_consumption_jobs
   SET retry_after = NULL
 WHERE status = 'Failed' AND attempt_count < 5;

-- ---------------------------------------------------------------------------
-- 3. Schedule with pg_cron (every minute)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'grovit-process-consumption-batches';
    PERFORM cron.schedule('grovit-process-consumption-batches', '* * * * *',
                          'SELECT public.process_consumption_batches(100);');
    RAISE NOTICE 'pg_cron job grovit-process-consumption-batches scheduled (every minute).';
  ELSE
    RAISE NOTICE 'pg_cron is not enabled. Enable it in Dashboard -> Database -> Extensions and re-run section 3.';
  END IF;
END $$;
