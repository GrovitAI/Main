-- ============================================================================
-- Migration: Ledger KPI RPC, indexes, schema hardening — Task 22
-- Fixes audit items H5 (KPIs capped at 1000 rows), M9 (missing indexes),
-- H1 (duplicate settlements), H8 (OTP resend abuse) and adds the columns the
-- new transfer RPC / worker rely on.
--
-- How to apply: Supabase SQL Editor, after 20260907000200.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sales & Order History KPIs computed server-side over the WHOLE range
--    (replaces the client-side sum over a PostgREST-capped result set).
--    Filter semantics mirror applyBillFilters() in open-orders-service.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_bills_ledger_kpis(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_start_ts  timestamptz,
  p_end_ts    timestamptz,
  p_status    text DEFAULT 'all',
  p_search    text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH filtered AS (
    SELECT b.subtotal, b.total_amount, b.discount_amount, b.status,
           (
             (b.status = 'paid' AND b.discount_type = 'percent' AND b.discount_value = 100)
             OR EXISTS (SELECT 1 FROM public.settlements s
                         WHERE s.bill_id = b.id AND s.payment_type = 'complimentary')
           ) AS is_comp
      FROM public.bills b
     WHERE b.tenant_id = p_tenant_id
       AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
       AND CASE
             WHEN p_status IN ('paid', 'completed') THEN
               b.settled_at >= p_start_ts AND b.settled_at <= p_end_ts
             WHEN p_status IN ('draft', 'unpaid', 'cancelled') THEN
               b.created_at >= p_start_ts AND b.created_at <= p_end_ts
             ELSE
               (b.status = 'paid'  AND b.settled_at >= p_start_ts AND b.settled_at <= p_end_ts)
               OR
               (b.status <> 'paid' AND b.created_at >= p_start_ts AND b.created_at <= p_end_ts)
           END
       AND (p_status IS NULL OR p_status = 'all' OR b.status = p_status)
       AND (p_search IS NULL OR trim(p_search) = ''
            OR b.invoice_number ILIKE '%' || trim(p_search) || '%')
  )
  SELECT json_build_object(
    'grossSales',         coalesce(sum(coalesce(subtotal, total_amount, 0)), 0),
    'discountsGiven',     coalesce(sum(coalesce(discount_amount, 0)), 0),
    'complimentarySales', coalesce(sum(CASE WHEN is_comp THEN coalesce(subtotal, total_amount, 0) ELSE 0 END), 0),
    'netCollected',       coalesce(sum(CASE WHEN NOT is_comp AND status IN ('paid', 'completed')
                                            THEN greatest(0, coalesce(subtotal, total_amount, 0) - coalesce(discount_amount, 0))
                                            ELSE 0 END), 0),
    'billCount',          count(*)
  )
  FROM filtered;
$$;

REVOKE ALL ON FUNCTION public.get_bills_ledger_kpis(uuid, uuid, timestamptz, timestamptz, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_bills_ledger_kpis(uuid, uuid, timestamptz, timestamptz, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Indexes for the hot query paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bills_tenant_branch_settled
  ON public.bills (tenant_id, branch_id, settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_tenant_branch_status_created
  ON public.bills (tenant_id, branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_invoice_number_trgm_fallback
  ON public.bills (tenant_id, branch_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_settlements_bill_id
  ON public.settlements (bill_id);
CREATE INDEX IF NOT EXISTS idx_settlements_tenant_branch_created
  ON public.settlements (tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_open_orders_tenant_branch_status
  ON public.open_orders (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS idx_open_order_items_order
  ON public.open_order_items (open_order_id);
CREATE INDEX IF NOT EXISTS idx_kots_order
  ON public.kots (open_order_id);
CREATE INDEX IF NOT EXISTS idx_kot_items_kot
  ON public.kot_items (kot_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id
  ON public.bill_items (bill_id);
CREATE INDEX IF NOT EXISTS idx_staff_auth_user
  ON public.staff (auth_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_levels_branch_material
  ON public.inventory_material_stock_levels (tenant_id, branch_id, material_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_branch_material_date
  ON public.inventory_stock_ledger (tenant_id, branch_id, material_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_batches_pending
  ON public.inventory_consumption_batches (status, created_at) WHERE status = 'Pending';
CREATE INDEX IF NOT EXISTS idx_consumption_jobs_batch
  ON public.inventory_consumption_jobs (batch_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_branch_created
  ON public.approval_requests (tenant_id, branch_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. One settlement per bill (guarded: only when no duplicates exist yet)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.settlements GROUP BY bill_id HAVING count(*) > 1) THEN
    RAISE NOTICE 'settlements has duplicate bill_id rows; unique index NOT created. Clean up with scratch/clean-duplicate-bills.sql style query first.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_settlements_bill_id ON public.settlements (bill_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Columns required by the hardened API and RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS inventory_tracking_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.inventory_dispatch_items
  ADD COLUMN IF NOT EXISTS received_quantity numeric;

-- ---------------------------------------------------------------------------
-- 5. Durable rate limiting for the serverless API (per key, fixed window)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  rate_key     text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits         integer NOT NULL DEFAULT 0
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;

-- Returns true when the call is allowed, false when the limit is exceeded.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row api_rate_limits%ROWTYPE;
BEGIN
  INSERT INTO public.api_rate_limits AS r (rate_key, window_start, hits)
  VALUES (p_key, now(), 1)
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
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated;
