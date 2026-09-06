-- ============================================================================
-- Migration: Database-owned document numbering + settle_order v2 — Task 21
-- Fixes audit items C6 (invoice numbers from localStorage), M8 (float money
-- math), H7 (tax divergence) and H3 (consumption batch created atomically).
--
-- What changes
--   1. `branch_counters` — one row per (tenant, branch) holding the bill,
--      order and KOT sequences. Seeded from the highest existing numbers on
--      first use, then incremented under a row lock, so two terminals can
--      never produce the same number again.
--   2. `next_branch_sequence()`, `next_invoice_number()`,
--      `assign_order_numbers()` — the only writers of those counters.
--      Invoice format: <branches.invoice_prefix or 'INV'>-<4+ digits>.
--   3. `settle_order()` v2 — same signature as v1 (client compatible) but:
--        * invoice number is assigned by the database, never trusted from the
--          client;
--        * all money is computed in integer paise; the discount is allocated
--          per line with the largest-remainder method so Σ(lines) == total;
--        * the inventory consumption batch row is inserted in the SAME
--          transaction as the bill (processed later by the DB worker).
--   4. Partial UNIQUE index on bills(tenant_id, branch_id, invoice_number)
--      for rows created from 2026-09-07 onward. Historical duplicates (140 in
--      the first 1000 rows at audit time) are left untouched and listed by
--      the report query at the end for manual reconciliation.
--
-- How to apply: Supabase SQL Editor, run the whole file AFTER
-- 20260907000100_rls_policies.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Counters table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_counters (
  tenant_id  uuid NOT NULL,
  branch_id  uuid NOT NULL,
  bill_seq   bigint NOT NULL DEFAULT 0,
  order_seq  bigint NOT NULL DEFAULT 0,
  kot_seq    bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_counters_pkey PRIMARY KEY (tenant_id, branch_id)
);

ALTER TABLE public.branch_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branch_counters_select ON public.branch_counters;
CREATE POLICY branch_counters_select ON public.branch_counters
  FOR SELECT TO authenticated
  USING (public.auth_can_access_branch(tenant_id, branch_id));
-- No INSERT/UPDATE/DELETE policies: only the SECURITY DEFINER functions write.
REVOKE ALL ON public.branch_counters FROM anon;
GRANT SELECT ON public.branch_counters TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sequence functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_branch_sequence(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_kind text                      -- 'bill' | 'order' | 'kot'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seed_bill  bigint;
  v_seed_order bigint;
  v_seed_kot   bigint;
  v_next       bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'SEQ_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('bill', 'order', 'kot') THEN
    RAISE EXCEPTION 'SEQ_INVALID_KIND' USING ERRCODE = '22023';
  END IF;

  -- Callers must belong to the branch (cron/worker paths run without auth.uid()
  -- and are allowed through because auth.uid() is NULL there).
  IF auth.uid() IS NOT NULL AND NOT public.auth_can_access_branch(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'SEQ_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- First use for this branch: seed from the highest numbers already issued.
  IF NOT EXISTS (SELECT 1 FROM public.branch_counters
                  WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id) THEN
    SELECT greatest(
             coalesce((SELECT max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint)
                         FROM public.bills
                        WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id), 0),
             coalesce((SELECT max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint)
                         FROM public.open_orders
                        WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id), 0))
      INTO v_seed_bill;

    SELECT coalesce(max(nullif(regexp_replace(order_name, '\D', '', 'g'), '')::bigint), 0)
      INTO v_seed_order
      FROM public.open_orders
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
       AND order_name ILIKE 'Order #%';

    SELECT coalesce(max(kot_number), 0)
      INTO v_seed_kot
      FROM public.kots
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;

    INSERT INTO public.branch_counters (tenant_id, branch_id, bill_seq, order_seq, kot_seq)
    VALUES (p_tenant_id, p_branch_id, v_seed_bill, v_seed_order, v_seed_kot)
    ON CONFLICT (tenant_id, branch_id) DO NOTHING;
  END IF;

  -- Atomic increment under the row lock taken by UPDATE.
  IF p_kind = 'bill' THEN
    UPDATE public.branch_counters SET bill_seq = bill_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING bill_seq INTO v_next;
  ELSIF p_kind = 'order' THEN
    UPDATE public.branch_counters SET order_seq = order_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING order_seq INTO v_next;
  ELSE
    UPDATE public.branch_counters SET kot_seq = kot_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING kot_seq INTO v_next;
  END IF;

  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_tenant_id uuid, p_branch_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq    bigint;
  v_prefix text;
BEGIN
  v_seq := public.next_branch_sequence(p_tenant_id, p_branch_id, 'bill');
  SELECT coalesce(nullif(trim(invoice_prefix), ''), 'INV') INTO v_prefix
    FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id;
  RETURN coalesce(v_prefix, 'INV') || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- Assigns (only if missing) the invoice number and/or a real "Order #N" name
-- to an open order, atomically. Used by Save & Print before printing.
CREATE OR REPLACE FUNCTION public.assign_order_numbers(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_assign_invoice boolean DEFAULT true,
  p_assign_order_name boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order      open_orders%ROWTYPE;
  v_invoice    text;
  v_order_name text;
  v_changed    boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.open_orders
   WHERE id = p_order_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_invoice    := v_order.invoice_number;
  v_order_name := v_order.order_name;

  IF p_assign_invoice AND (v_invoice IS NULL OR trim(v_invoice) = '') THEN
    v_invoice := public.next_invoice_number(p_tenant_id, p_branch_id);
    v_changed := true;
  END IF;

  IF p_assign_order_name AND (v_order_name IS NULL OR trim(v_order_name) = ''
                              OR lower(v_order_name) LIKE '%draft%'
                              OR v_order_name NOT LIKE 'Order #%') THEN
    v_order_name := 'Order #' || public.next_branch_sequence(p_tenant_id, p_branch_id, 'order');
    v_changed := true;
  END IF;

  IF v_changed THEN
    UPDATE public.open_orders
       SET invoice_number = v_invoice, order_name = v_order_name, updated_at = now()
     WHERE id = v_order.id;
  END IF;

  RETURN json_build_object('invoice_number', v_invoice, 'order_name', v_order_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.next_kot_number(p_tenant_id uuid, p_branch_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
AS $$ SELECT public.next_branch_sequence(p_tenant_id, p_branch_id, 'kot'); $$;

REVOKE ALL ON FUNCTION public.next_branch_sequence(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.next_invoice_number(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.assign_order_numbers(uuid, uuid, uuid, boolean, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.next_kot_number(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_branch_sequence(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_numbers(uuid, uuid, uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_kot_number(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. settle_order v2 — integer paise, DB-assigned numbering, atomic batch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_order(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_payment_type text,
  p_invoice_number text DEFAULT NULL,   -- ignored since v2: DB assigns numbers
  p_order_name text DEFAULT NULL        -- ignored since v2: DB assigns names
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order            open_orders%ROWTYPE;
  v_bill             bills%ROWTYPE;
  v_settlement       settlements%ROWTYPE;
  v_batch_id         uuid;
  v_payment_type     text;
  v_is_comp          boolean;
  v_item_count       integer := 0;
  v_tax_pct          numeric := 0;
  v_subtotal_paise   bigint := 0;
  v_discount_paise   bigint := 0;
  v_tax_paise        bigint := 0;
  v_total_paise      bigint := 0;
  v_discount_type    text;
  v_discount_value   numeric;
  v_invoice_number   text;
  v_order_name       text;
  v_now              timestamptz := now();
BEGIN
  IF p_tenant_id IS NULL OR p_branch_id IS NULL OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'SETTLE_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  v_payment_type := lower(coalesce(nullif(trim(p_payment_type), ''), 'cash'));
  v_is_comp := (v_payment_type = 'complimentary');

  -- 1. Lock the order. Concurrent callers queue here, then see status = 'paid'.
  SELECT * INTO v_order
    FROM public.open_orders
   WHERE id = p_order_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLE_ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Idempotent replay.
  IF v_order.status = 'paid' THEN
    SELECT * INTO v_bill FROM public.bills
     WHERE open_order_id = v_order.id AND tenant_id = p_tenant_id AND branch_id = p_branch_id
     LIMIT 1;
    IF v_bill.id IS NOT NULL THEN
      SELECT * INTO v_settlement FROM public.settlements
       WHERE bill_id = v_bill.id ORDER BY created_at ASC LIMIT 1;
    END IF;
    RETURN json_build_object(
      'already_settled', true,
      'order', row_to_json(v_order),
      'bill', CASE WHEN v_bill.id IS NULL THEN NULL ELSE row_to_json(v_bill) END,
      'settlement', CASE WHEN v_settlement.id IS NULL THEN NULL ELSE row_to_json(v_settlement) END,
      'consumption_batch_id', NULL
    );
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'SETTLE_ORDER_CANCELLED' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Subtotal in integer paise from the live cart lines.
  SELECT coalesce(sum(round(qty * round(coalesce(price, 0) * 100))::bigint), 0), count(*)
    INTO v_subtotal_paise, v_item_count
    FROM public.open_order_items
   WHERE open_order_id = v_order.id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'SETTLE_ORDER_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(tax_percentage, 0) INTO v_tax_pct
    FROM public.pos_settings
   WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
   LIMIT 1;
  v_tax_pct := coalesce(v_tax_pct, 0);

  -- 4. Discount / tax / total — integer paise throughout.
  v_discount_type  := v_order.discount_type;
  v_discount_value := coalesce(v_order.discount_value, 0);

  IF v_is_comp THEN
    v_tax_paise      := round(v_subtotal_paise * v_tax_pct / 100.0)::bigint;
    v_discount_type  := 'percent';
    v_discount_value := 100;
    v_discount_paise := v_subtotal_paise + v_tax_paise;
    v_total_paise    := 0;
  ELSE
    IF v_discount_type = 'percent' THEN
      v_discount_paise := round(v_subtotal_paise * least(100, greatest(0, v_discount_value)) / 100.0)::bigint;
    ELSIF v_discount_type = 'fixed' THEN
      v_discount_paise := least(v_subtotal_paise, greatest(0, round(v_discount_value * 100)::bigint));
    ELSE
      v_discount_type  := NULL;
      v_discount_value := 0;
      v_discount_paise := 0;
    END IF;
    v_tax_paise   := round((v_subtotal_paise - v_discount_paise) * v_tax_pct / 100.0)::bigint;
    v_total_paise := v_subtotal_paise - v_discount_paise + v_tax_paise;
  END IF;

  -- 5. Document numbers are owned by the database.
  v_invoice_number := v_order.invoice_number;
  IF v_invoice_number IS NULL OR trim(v_invoice_number) = '' THEN
    v_invoice_number := public.next_invoice_number(p_tenant_id, p_branch_id);
  END IF;

  v_order_name := v_order.order_name;
  IF v_order_name IS NULL OR trim(v_order_name) = '' OR lower(v_order_name) LIKE '%draft%'
     OR v_order_name NOT LIKE 'Order #%' THEN
    v_order_name := 'Order #' || public.next_branch_sequence(p_tenant_id, p_branch_id, 'order');
  END IF;

  -- 6. Upsert the bill (exactly one per order).
  INSERT INTO public.bills (
    tenant_id, branch_id, open_order_id, invoice_number,
    subtotal, tax_amount, discount_amount, total_amount,
    status, payment_status, document_status,
    subtotal_paise, tax_paise, discount_paise, grand_total_paise,
    discount_type, discount_value,
    settled_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_branch_id, v_order.id, v_invoice_number,
    v_subtotal_paise / 100.0, v_tax_paise / 100.0, v_discount_paise / 100.0, v_total_paise / 100.0,
    'paid', 'paid', 'confirmed',
    v_subtotal_paise, v_tax_paise, v_discount_paise, v_total_paise,
    v_discount_type, v_discount_value,
    v_now, v_now, v_now
  )
  ON CONFLICT (open_order_id) DO UPDATE SET
    invoice_number    = EXCLUDED.invoice_number,
    subtotal          = EXCLUDED.subtotal,
    tax_amount        = EXCLUDED.tax_amount,
    discount_amount   = EXCLUDED.discount_amount,
    total_amount      = EXCLUDED.total_amount,
    status            = EXCLUDED.status,
    payment_status    = EXCLUDED.payment_status,
    document_status   = EXCLUDED.document_status,
    subtotal_paise    = EXCLUDED.subtotal_paise,
    tax_paise         = EXCLUDED.tax_paise,
    discount_paise    = EXCLUDED.discount_paise,
    grand_total_paise = EXCLUDED.grand_total_paise,
    discount_type     = EXCLUDED.discount_type,
    discount_value    = EXCLUDED.discount_value,
    settled_at        = EXCLUDED.settled_at,
    updated_at        = EXCLUDED.updated_at
  WHERE bills.tenant_id = p_tenant_id AND bills.branch_id = p_branch_id
  RETURNING * INTO v_bill;

  IF v_bill.id IS NULL THEN
    RAISE EXCEPTION 'SETTLE_BILL_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  -- 7. Snapshot line items with the discount allocated per line
  --    (largest-remainder method, so Σ line discounts == bill discount).
  DELETE FROM public.bill_items WHERE bill_id = v_bill.id;

  WITH lines AS (
    SELECT i.id,
           i.product_id,
           coalesce(nullif(i.item_name, ''), 'Item')            AS item_name,
           i.qty,
           coalesce(i.price, 0)                                  AS price,
           round(coalesce(i.price, 0) * 100)::bigint             AS price_paise,
           round(i.qty * round(coalesce(i.price, 0) * 100))::bigint AS line_paise
      FROM public.open_order_items i
     WHERE i.open_order_id = v_order.id
  ),
  alloc AS (
    SELECT l.*,
           CASE WHEN v_subtotal_paise > 0 THEN (v_discount_paise * l.line_paise) / v_subtotal_paise ELSE 0 END AS base_disc,
           CASE WHEN v_subtotal_paise > 0 THEN (v_discount_paise * l.line_paise) % v_subtotal_paise ELSE 0 END AS remainder
      FROM lines l
  ),
  ranked AS (
    SELECT a.*,
           row_number() OVER (ORDER BY a.remainder DESC, a.id) AS rn,
           v_discount_paise - sum(a.base_disc) OVER ()          AS leftover
      FROM alloc a
  )
  INSERT INTO public.bill_items (
    bill_id, product_id, item_name, qty, price, price_paise,
    tax_rate, gst_percentage, discount_amount_paise
  )
  SELECT v_bill.id,
         r.product_id,
         r.item_name,
         r.qty,
         r.price,
         r.price_paise,
         CASE WHEN v_tax_paise > 0 THEN v_tax_pct ELSE 0 END,
         CASE WHEN v_tax_paise > 0 THEN v_tax_pct ELSE 0 END,
         r.base_disc + CASE WHEN r.rn <= r.leftover THEN 1 ELSE 0 END
    FROM ranked r;

  -- 8. Exactly one settlement per bill.
  SELECT * INTO v_settlement FROM public.settlements
   WHERE bill_id = v_bill.id ORDER BY created_at ASC LIMIT 1;

  IF v_settlement.id IS NULL THEN
    INSERT INTO public.settlements (bill_id, tenant_id, branch_id, payment_type, amount, created_at)
    VALUES (v_bill.id, p_tenant_id, p_branch_id, v_payment_type, v_total_paise / 100.0, v_now)
    RETURNING * INTO v_settlement;
  END IF;

  -- 9. Queue recipe consumption in the same transaction (worker processes it).
  IF NOT EXISTS (SELECT 1 FROM public.inventory_consumption_batches WHERE bill_id = v_bill.id) THEN
    INSERT INTO public.inventory_consumption_batches (tenant_id, branch_id, bill_id, status, total_cost_snapshot, created_at)
    VALUES (p_tenant_id, p_branch_id, v_bill.id, 'Pending', 0, v_now)
    RETURNING id INTO v_batch_id;
  END IF;

  -- 10. Mark the order paid.
  UPDATE public.open_orders
     SET status         = 'paid',
         paid_at        = v_now,
         completed_at   = v_now,
         invoice_number = v_invoice_number,
         payment_method = v_payment_type,
         order_name     = v_order_name,
         updated_at     = v_now
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN json_build_object(
    'already_settled', false,
    'order', row_to_json(v_order),
    'bill', row_to_json(v_bill),
    'settlement', row_to_json(v_settlement),
    'consumption_batch_id', v_batch_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_order(uuid, uuid, uuid, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.settle_order(uuid, uuid, uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Uniqueness for all invoice numbers issued from now on.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bills_invoice_number_per_branch_v2
  ON public.bills (tenant_id, branch_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND created_at >= '2026-09-07 00:00:00+00';

-- Report: historical duplicates that predate this migration (manual review).
SELECT tenant_id, branch_id, invoice_number, count(*) AS copies
  FROM public.bills
 WHERE invoice_number IS NOT NULL AND created_at < '2026-09-07 00:00:00+00'
 GROUP BY tenant_id, branch_id, invoice_number
HAVING count(*) > 1
 ORDER BY copies DESC, invoice_number;
