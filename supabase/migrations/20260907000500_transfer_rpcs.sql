-- ============================================================================
-- Migration: Atomic inter-branch transfer RPCs — Task 24 (H4)
--
-- `create_dispatch()`  — supplying branch ships goods. Refuses (instead of
--                        silently clamping) when stock is insufficient.
-- `receive_dispatch()` — requesting branch books goods in. Idempotent: a
--                        second submit returns already_received = true and
--                        writes nothing, so retries can never double stock.
-- Both run in one transaction with row locks on the dispatch / request and
-- on every stock-level row they touch.
--
-- Column names follow the LIVE schema (not scratch/02_final_inventory_schema.sql,
-- which differs):
--   inventory_dispatches(id, request_id, dispatch_number, dispatched_at, received_at, status)
--   inventory_dispatch_items(id, dispatch_id, material_id, quantity, received_quantity)
--   inventory_transfer_request_items(id, request_id, material_id, requested_qty, approved_qty, received_qty)
--
-- How to apply: Supabase SQL Editor, after 20260907000300.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.inventory_dispatch_number_seq;

-- ---------------------------------------------------------------------------
-- 1. create_dispatch
--    p_items: [{"material_id": uuid, "dispatched_quantity": number}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_dispatch(
  p_tenant_id  uuid,
  p_request_id uuid,
  p_items      jsonb,
  p_remarks    text DEFAULT NULL,
  p_created_by text DEFAULT 'Owner Staff'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_req         inventory_transfer_requests%ROWTYPE;
  v_dispatch    inventory_dispatches%ROWTYPE;
  v_item        jsonb;
  v_material_id uuid;
  v_qty         numeric;
  v_level       record;
  v_material    record;
  v_next_stock  numeric;
  v_next_res    numeric;
  v_now         timestamptz := now();
  v_all_done    boolean := true;
  v_ri          record;
  v_sent_total  numeric;
  v_status      text;
BEGIN
  IF p_tenant_id IS NULL OR p_request_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'DISPATCH_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.inventory_transfer_requests
   WHERE id = p_request_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISPATCH_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status IN ('Cancelled', 'Rejected', 'Completed') THEN
    RAISE EXCEPTION 'DISPATCH_REQUEST_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (public.auth_is_tenant_wide() OR public.auth_branch_id() = v_req.supplying_branch_id) THEN
    RAISE EXCEPTION 'DISPATCH_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.inventory_dispatches (request_id, dispatch_number, dispatched_at, status)
  VALUES (v_req.id,
          'DSP-' || to_char(v_now, 'YYYY') || '-' || lpad(nextval('public.inventory_dispatch_number_seq')::text, 6, '0'),
          v_now, 'Dispatched')
  RETURNING * INTO v_dispatch;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_material_id := (v_item->>'material_id')::uuid;
    v_qty := (v_item->>'dispatched_quantity')::numeric;
    IF v_material_id IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'DISPATCH_INVALID_ITEM' USING ERRCODE = '22023';
    END IF;

    SELECT id, material_name INTO v_material FROM public.inventory_materials
     WHERE id = v_material_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'DISPATCH_MATERIAL_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_level FROM public.inventory_material_stock_levels
     WHERE tenant_id = p_tenant_id AND branch_id = v_req.supplying_branch_id AND material_id = v_material_id
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND OR coalesce(v_level.current_stock, 0) < v_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_material.material_name USING ERRCODE = 'P0001';
    END IF;

    v_next_stock := coalesce(v_level.current_stock, 0) - v_qty;
    v_next_res   := greatest(0, coalesce(v_level.reserved_stock, 0) - v_qty);
    UPDATE public.inventory_material_stock_levels
       SET current_stock = v_next_stock, reserved_stock = v_next_res,
           available_stock = v_next_stock - v_next_res, updated_at = v_now
     WHERE id = v_level.id;

    INSERT INTO public.inventory_stock_ledger
      (tenant_id, branch_id, material_id, transaction_date, transaction_type, reference_type, reference_id,
       qty_in, qty_out, balance_stock, unit_cost, total_value, remarks, created_by)
    SELECT p_tenant_id, v_req.supplying_branch_id, v_material_id, v_now, 'Transfer Out', 'Dispatch Invoice', v_dispatch.id,
           0, v_qty, v_next_stock, coalesce(m.average_cost, 0), v_next_stock * coalesce(m.average_cost, 0),
           'Dispatched to branch. Dispatch No: ' || v_dispatch.dispatch_number, p_created_by
      FROM public.inventory_materials m WHERE m.id = v_material_id;

    INSERT INTO public.inventory_dispatch_items (dispatch_id, material_id, quantity)
    VALUES (v_dispatch.id, v_material_id, v_qty);
  END LOOP;

  -- Request status from the cumulative quantity shipped across all dispatches.
  FOR v_ri IN SELECT material_id, coalesce(approved_qty, 0) AS approved_qty
                FROM public.inventory_transfer_request_items WHERE request_id = v_req.id LOOP
    SELECT coalesce(sum(di.quantity), 0) INTO v_sent_total
      FROM public.inventory_dispatch_items di
      JOIN public.inventory_dispatches d ON d.id = di.dispatch_id
     WHERE d.request_id = v_req.id AND di.material_id = v_ri.material_id;
    IF v_sent_total < v_ri.approved_qty THEN
      v_all_done := false;
    END IF;
  END LOOP;

  v_status := CASE WHEN v_all_done THEN 'Dispatched' ELSE 'Partially Dispatched' END;
  UPDATE public.inventory_transfer_requests SET status = v_status, updated_at = v_now WHERE id = v_req.id;

  INSERT INTO public.inventory_transfer_events (tenant_id, branch_id, transfer_request_id, event_type, performed_by, notes)
  VALUES (p_tenant_id, v_req.supplying_branch_id, v_req.id, 'Dispatched', p_created_by,
          'Items dispatched. Status set to ' || v_status || '.'
          || CASE WHEN p_remarks IS NOT NULL AND trim(p_remarks) <> '' THEN ' Remarks: ' || trim(p_remarks) ELSE '' END);

  RETURN json_build_object(
    'dispatch', row_to_json(v_dispatch),
    'request_status', v_status,
    'request_number', v_req.request_number,
    'from_branch_id', v_req.supplying_branch_id,
    'to_branch_id', v_req.requesting_branch_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. receive_dispatch
--    p_items: [{"id": dispatch_item_id, "material_id": uuid,
--               "received_quantity": number, "dispatched_quantity": number}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_dispatch(
  p_tenant_id   uuid,
  p_dispatch_id uuid,
  p_items       jsonb,
  p_remarks     text DEFAULT NULL,
  p_received_by text DEFAULT 'Owner Staff'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_dispatch    inventory_dispatches%ROWTYPE;
  v_req         inventory_transfer_requests%ROWTYPE;
  v_item        jsonb;
  v_item_id     uuid;
  v_material_id uuid;
  v_received    numeric;
  v_dispatched  numeric;
  v_level       record;
  v_next_stock  numeric;
  v_now         timestamptz := now();
  v_all_done    boolean := true;
  v_ri          record;
  v_recv_total  numeric;
  v_status      text;
BEGIN
  IF p_tenant_id IS NULL OR p_dispatch_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'RECEIVE_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dispatch FROM public.inventory_dispatches WHERE id = p_dispatch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECEIVE_DISPATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_req FROM public.inventory_transfer_requests
   WHERE id = v_dispatch.request_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECEIVE_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_dispatch.status = 'Received' THEN
    RETURN json_build_object('already_received', true, 'request_status', v_req.status);
  END IF;

  IF NOT (public.auth_is_tenant_wide() OR public.auth_branch_id() = v_req.requesting_branch_id) THEN
    RAISE EXCEPTION 'RECEIVE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id     := nullif(v_item->>'id', '')::uuid;
    v_material_id := (v_item->>'material_id')::uuid;
    v_received    := coalesce((v_item->>'received_quantity')::numeric, 0);
    v_dispatched  := coalesce((v_item->>'dispatched_quantity')::numeric, 0);
    IF v_material_id IS NULL OR v_received < 0 THEN
      RAISE EXCEPTION 'RECEIVE_INVALID_ITEM' USING ERRCODE = '22023';
    END IF;

    -- Record what actually arrived on the dispatch line.
    IF v_item_id IS NOT NULL THEN
      UPDATE public.inventory_dispatch_items SET received_quantity = v_received
       WHERE id = v_item_id AND dispatch_id = v_dispatch.id;
    ELSE
      UPDATE public.inventory_dispatch_items SET received_quantity = v_received
       WHERE dispatch_id = v_dispatch.id AND material_id = v_material_id;
    END IF;

    UPDATE public.inventory_transfer_request_items
       SET received_qty = coalesce(received_qty, 0) + v_received
     WHERE request_id = v_req.id AND material_id = v_material_id;

    IF v_received > 0 THEN
      SELECT * INTO v_level FROM public.inventory_material_stock_levels
       WHERE tenant_id = p_tenant_id AND branch_id = v_req.requesting_branch_id AND material_id = v_material_id
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1
       FOR UPDATE;

      IF FOUND THEN
        v_next_stock := coalesce(v_level.current_stock, 0) + v_received;
        UPDATE public.inventory_material_stock_levels
           SET current_stock = v_next_stock,
               available_stock = v_next_stock - coalesce(reserved_stock, 0),
               updated_at = v_now
         WHERE id = v_level.id;
      ELSE
        v_next_stock := v_received;
        INSERT INTO public.inventory_material_stock_levels
          (tenant_id, branch_id, material_id, location_id, current_stock, reserved_stock, available_stock, updated_at)
        VALUES (p_tenant_id, v_req.requesting_branch_id, v_material_id, 'Main Storage', v_received, 0, v_received, v_now);
      END IF;

      INSERT INTO public.inventory_stock_ledger
        (tenant_id, branch_id, material_id, transaction_date, transaction_type, reference_type, reference_id,
         qty_in, qty_out, balance_stock, unit_cost, total_value, remarks, created_by)
      SELECT p_tenant_id, v_req.requesting_branch_id, v_material_id, v_now, 'Transfer In', 'Receipt Invoice', v_dispatch.id,
             v_received, 0, v_next_stock, coalesce(m.average_cost, 0), v_next_stock * coalesce(m.average_cost, 0),
             'Received from branch. Dispatch No: ' || coalesce(v_dispatch.dispatch_number, ''), p_received_by
        FROM public.inventory_materials m WHERE m.id = v_material_id;
    END IF;

    IF v_received < v_dispatched THEN
      INSERT INTO public.inventory_transfer_variances
        (tenant_id, branch_id, dispatch_item_id, material_id, dispatched_qty, received_qty, variance_qty, reason)
      VALUES (p_tenant_id, v_req.requesting_branch_id, v_item_id, v_material_id, v_dispatched, v_received,
              v_dispatched - v_received, coalesce(nullif(trim(p_remarks), ''), 'Transit loss'));
    END IF;
  END LOOP;

  UPDATE public.inventory_dispatches SET status = 'Received', received_at = v_now WHERE id = v_dispatch.id;

  -- Request status from cumulative received quantities across all dispatches.
  FOR v_ri IN SELECT material_id, coalesce(approved_qty, 0) AS approved_qty
                FROM public.inventory_transfer_request_items WHERE request_id = v_req.id LOOP
    SELECT coalesce(sum(coalesce(di.received_quantity, 0)), 0) INTO v_recv_total
      FROM public.inventory_dispatch_items di
      JOIN public.inventory_dispatches d ON d.id = di.dispatch_id
     WHERE d.request_id = v_req.id AND di.material_id = v_ri.material_id;
    IF v_recv_total < v_ri.approved_qty THEN
      v_all_done := false;
    END IF;
  END LOOP;

  v_status := CASE WHEN v_all_done THEN 'Completed' ELSE 'Partially Received' END;
  UPDATE public.inventory_transfer_requests SET status = v_status, updated_at = v_now WHERE id = v_req.id;

  INSERT INTO public.inventory_transfer_events (tenant_id, branch_id, transfer_request_id, event_type, performed_by, notes)
  VALUES (p_tenant_id, v_req.requesting_branch_id, v_req.id, 'Received', p_received_by,
          'Goods received. Status set to ' || v_status || '.');

  RETURN json_build_object('already_received', false, 'request_status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.create_dispatch(uuid, uuid, jsonb, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.receive_dispatch(uuid, uuid, jsonb, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_dispatch(uuid, uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_dispatch(uuid, uuid, jsonb, text, text) TO authenticated;
