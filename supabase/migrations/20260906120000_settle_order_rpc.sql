-- ============================================================================
-- Migration: settle_order transactional RPC — Task 19
--
-- Replaces the 6+ separate client round-trips previously performed by
-- settleOrderById() (open-orders-service.ts) with ONE atomic PostgreSQL
-- transaction. Either every write below commits, or none of them do.
--
-- Guarantees:
--   * Row lock (SELECT ... FOR UPDATE) on the open order serialises concurrent
--     settle attempts from multiple terminals / tabs.
--   * Idempotent: settling an already-paid order returns the existing bill and
--     settlement and writes nothing (no duplicate settlements).
--   * Exactly one bill per order (upsert on unique_open_order_id).
--   * Exactly one settlement per bill.
--   * bill_items are always snapshotted in the same transaction as the bill.
--
-- How to apply: paste into the Supabase SQL Editor and run, or
--   npx supabase db execute --linked -f supabase/migrations/20260906120000_settle_order_rpc.sql
--
-- SECURITY INVOKER — respects (future) RLS policies.
-- ============================================================================

-- 0. Guarantee the one-bill-per-order uniqueness the upsert relies on.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_open_order_id')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'unique_open_order_id') THEN
    ALTER TABLE bills ADD CONSTRAINT unique_open_order_id UNIQUE (open_order_id);
  END IF;
END $$;

-- 1. The transactional settle function.
CREATE OR REPLACE FUNCTION settle_order(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_payment_type text,
  p_invoice_number text DEFAULT NULL,
  p_order_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order               open_orders%ROWTYPE;
  v_bill                bills%ROWTYPE;
  v_settlement          settlements%ROWTYPE;
  v_payment_type        text;
  v_is_comp             boolean;
  v_subtotal            numeric := 0;
  v_item_count          integer := 0;
  v_tax_pct             numeric := 0;
  v_discount_type       text;
  v_discount_value      numeric;
  v_discount_amount     numeric;
  v_discounted_subtotal numeric;
  v_tax_amount          numeric;
  v_total_amount        numeric;
  v_invoice_number      text;
  v_order_name          text;
  v_now                 timestamptz := now();
BEGIN
  IF p_tenant_id IS NULL OR p_branch_id IS NULL OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'SETTLE_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  v_payment_type := lower(coalesce(nullif(trim(p_payment_type), ''), 'cash'));
  v_is_comp := (v_payment_type = 'complimentary');

  -- 1. Lock the order row. Concurrent callers wait here, then see status = 'paid'.
  SELECT * INTO v_order
    FROM open_orders
   WHERE id = p_order_id
     AND tenant_id = p_tenant_id
     AND branch_id = p_branch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTLE_ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Idempotent replay: already paid -> return existing rows, write nothing.
  IF v_order.status = 'paid' THEN
    SELECT * INTO v_bill
      FROM bills
     WHERE open_order_id = v_order.id
       AND tenant_id = p_tenant_id
       AND branch_id = p_branch_id
     LIMIT 1;

    IF v_bill.id IS NOT NULL THEN
      SELECT * INTO v_settlement
        FROM settlements
       WHERE bill_id = v_bill.id
       ORDER BY created_at ASC
       LIMIT 1;
    END IF;

    RETURN json_build_object(
      'already_settled', true,
      'order', row_to_json(v_order),
      'bill', CASE WHEN v_bill.id IS NULL THEN NULL ELSE row_to_json(v_bill) END,
      'settlement', CASE WHEN v_settlement.id IS NULL THEN NULL ELSE row_to_json(v_settlement) END
    );
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'SETTLE_ORDER_CANCELLED' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Totals from the live cart lines.
  SELECT coalesce(sum(qty * coalesce(price, 0)), 0), count(*)
    INTO v_subtotal, v_item_count
    FROM open_order_items
   WHERE open_order_id = v_order.id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'SETTLE_ORDER_EMPTY' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(tax_percentage, 0) INTO v_tax_pct
    FROM pos_settings
   WHERE tenant_id = p_tenant_id
     AND branch_id = p_branch_id
   LIMIT 1;
  v_tax_pct := coalesce(v_tax_pct, 0);

  -- Same arithmetic as the previous client implementation.
  v_discount_type       := v_order.discount_type;
  v_discount_value      := coalesce(v_order.discount_value, 0);
  v_discount_amount     := coalesce(v_order.discount_amount, 0);
  v_discounted_subtotal := greatest(0, v_subtotal - v_discount_amount);
  v_tax_amount          := round(v_discounted_subtotal * v_tax_pct / 100.0, 2);
  v_total_amount        := v_discounted_subtotal + v_tax_amount;

  IF v_is_comp THEN
    -- Preserve gross sales analytics: 100% discount on (subtotal + gross tax).
    v_tax_amount      := round(v_subtotal * v_tax_pct / 100.0, 2);
    v_discount_type   := 'percent';
    v_discount_value  := 100;
    v_discount_amount := v_subtotal + v_tax_amount;
    v_total_amount    := 0;
  END IF;

  v_invoice_number := coalesce(v_order.invoice_number, nullif(trim(p_invoice_number), ''));
  IF v_invoice_number IS NULL THEN
    RAISE EXCEPTION 'SETTLE_INVOICE_NUMBER_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_order_name := coalesce(nullif(trim(p_order_name), ''), v_order.order_name);

  -- 4. Upsert the bill (exactly one per order).
  INSERT INTO bills (
    tenant_id, branch_id, open_order_id, invoice_number,
    subtotal, tax_amount, discount_amount, total_amount,
    status, payment_status, document_status,
    subtotal_paise, tax_paise, discount_paise, grand_total_paise,
    discount_type, discount_value,
    settled_at, created_at, updated_at
  ) VALUES (
    p_tenant_id, p_branch_id, v_order.id, v_invoice_number,
    v_subtotal, v_tax_amount, v_discount_amount, v_total_amount,
    'paid', 'paid', 'confirmed',
    round(v_subtotal * 100)::bigint, round(v_tax_amount * 100)::bigint,
    round(v_discount_amount * 100)::bigint, round(v_total_amount * 100)::bigint,
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
  WHERE bills.tenant_id = p_tenant_id
    AND bills.branch_id = p_branch_id
  RETURNING * INTO v_bill;

  IF v_bill.id IS NULL THEN
    -- The existing bill for this order belongs to another tenant/branch.
    RAISE EXCEPTION 'SETTLE_BILL_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Snapshot line items in the same transaction as the bill.
  DELETE FROM bill_items WHERE bill_id = v_bill.id;

  INSERT INTO bill_items (
    bill_id, product_id, item_name, qty, price, price_paise,
    tax_rate, gst_percentage, discount_amount_paise
  )
  SELECT
    v_bill.id,
    i.product_id,
    coalesce(nullif(i.item_name, ''), 'Item'),
    i.qty,
    coalesce(i.price, 0),
    round(coalesce(i.price, 0) * 100)::bigint,
    CASE WHEN v_tax_amount > 0 THEN v_tax_pct ELSE 0 END,
    CASE WHEN v_tax_amount > 0 THEN v_tax_pct ELSE 0 END,
    0
  FROM open_order_items i
  WHERE i.open_order_id = v_order.id;

  -- 6. Exactly one settlement per bill.
  SELECT * INTO v_settlement
    FROM settlements
   WHERE bill_id = v_bill.id
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_settlement.id IS NULL THEN
    INSERT INTO settlements (bill_id, tenant_id, branch_id, payment_type, amount, created_at)
    VALUES (v_bill.id, p_tenant_id, p_branch_id, v_payment_type, v_total_amount, v_now)
    RETURNING * INTO v_settlement;
  END IF;

  -- 7. Mark the order paid.
  UPDATE open_orders
     SET status         = 'paid',
         paid_at        = v_now,
         completed_at   = v_now,
         invoice_number = v_invoice_number,
         payment_method = p_payment_type,
         order_name     = v_order_name,
         updated_at     = v_now
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN json_build_object(
    'already_settled', false,
    'order', row_to_json(v_order),
    'bill', row_to_json(v_bill),
    'settlement', row_to_json(v_settlement)
  );
END;
$$;

-- 2. Permissions. Matches the existing analytics RPC grants; remove the anon
--    grant once RLS + authenticated-only access is enforced (audit item C1).
REVOKE ALL ON FUNCTION settle_order(uuid, uuid, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION settle_order(uuid, uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_order(uuid, uuid, uuid, text, text, text) TO anon;
