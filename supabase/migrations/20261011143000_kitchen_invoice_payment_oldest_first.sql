-- Task 190: an invoice payment covers the invoice's oldest deliveries first,
-- the same order the Received screen uses (allocateAcross in kitchen-utils.ts).
-- Task 188 walked the deliveries in id order, so a part payment could mark a
-- later delivery paid and leave an earlier one open. Rows are still locked in
-- id order, the deterministic order invoice creation and cancellation use.
-- Only the body of kitchen_invoice_action changes; its signature, guards and
-- grants are as in 20261011071731_kitchen_branch_invoices.sql.
CREATE OR REPLACE FUNCTION public.kitchen_invoice_action(p_tenant_id uuid, p_branch_id uuid, p_invoice_id uuid,
  p_action text, p_amount_paise bigint DEFAULT NULL, p_date date DEFAULT NULL, p_mode text DEFAULT NULL, p_note text DEFAULT NULL, p_request_key text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invoice public.kitchen_invoices%ROWTYPE; v_entry record; v_open bigint; v_left bigint := p_amount_paise;
  v_covers jsonb := '[]'::jsonb; v_payment public.kitchen_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_invoice FROM public.kitchen_invoices WHERE id = p_invoice_id
    AND tenant_id = p_tenant_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KITCHEN_INVOICE_CHANGED' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'receive' THEN
    SELECT e.* INTO v_payment FROM public.kitchen_invoice_payments r JOIN public.kitchen_entries e ON e.id = r.payment_id
      AND e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id
      WHERE r.invoice_id = p_invoice_id AND r.request_key = p_request_key AND r.tenant_id = p_tenant_id AND r.branch_id = p_branch_id;
    IF FOUND THEN
      IF v_payment.amount_paise IS DISTINCT FROM p_amount_paise OR v_payment.entry_date IS DISTINCT FROM p_date
        OR v_payment.mode IS DISTINCT FROM p_mode THEN
        RAISE EXCEPTION 'KITCHEN_INVOICE_CHANGED' USING ERRCODE = '22023';
      END IF;
      RETURN v_payment.id;
    END IF;
  END IF;
  IF v_invoice.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'KITCHEN_INVOICE_CHANGED' USING ERRCODE = '22023'; END IF;
  IF p_action = 'cancel' THEN
    IF coalesce(length(btrim(p_note)), 0) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'KITCHEN_INVOICE_INVALID' USING ERRCODE = '22023';
    END IF;
    -- Same deterministic delivery locks used by invoice creation and payments.
    PERFORM e.id FROM public.kitchen_entries e JOIN public.kitchen_invoice_deliveries d ON d.entry_id = e.id
      WHERE d.invoice_id = p_invoice_id AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id
      AND e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id ORDER BY e.id FOR UPDATE OF e;
    UPDATE public.kitchen_invoices SET cancelled_at = now(), cancel_reason = btrim(p_note)
      WHERE id = p_invoice_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id;
    UPDATE public.kitchen_invoice_deliveries SET is_active = false
      WHERE invoice_id = p_invoice_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id;
    RETURN p_invoice_id;
  END IF;
  IF p_action IS DISTINCT FROM 'receive' OR p_amount_paise IS NULL OR p_amount_paise <= 0
    OR p_date IS NULL OR p_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR p_mode IS NULL OR p_mode NOT IN ('cash', 'upi', 'bank') OR coalesce(length(p_note), 0) > 200
    OR coalesce(length(p_request_key), 0) NOT BETWEEN 12 AND 80 THEN
    RAISE EXCEPTION 'KITCHEN_INVOICE_INVALID' USING ERRCODE = '22023';
  END IF;
  -- Lock in id order first, then allocate oldest delivery first.
  PERFORM e.id FROM public.kitchen_entries e JOIN public.kitchen_invoice_deliveries d ON d.entry_id = e.id
    WHERE d.invoice_id = p_invoice_id AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id
    AND e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id ORDER BY e.id FOR UPDATE OF e;
  FOR v_entry IN SELECT e.* FROM public.kitchen_entries e JOIN public.kitchen_invoice_deliveries d ON d.entry_id = e.id
    WHERE d.invoice_id = p_invoice_id AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id
      AND e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id ORDER BY e.entry_date, e.created_at, e.id LOOP
    SELECT greatest(0, v_entry.amount_paise - coalesce(sum(amount_paise), 0)) INTO v_open
      FROM public.kitchen_allocations WHERE covers_id = v_entry.id AND tenant_id = p_tenant_id AND branch_id = p_branch_id;
    IF v_left > 0 AND v_open > 0 THEN
      v_covers := v_covers || jsonb_build_array(jsonb_build_object('entry_id', v_entry.id, 'amount_paise', least(v_left, v_open)));
      v_left := v_left - least(v_left, v_open);
    END IF;
  END LOOP;
  IF v_left > 0 THEN RAISE EXCEPTION 'KITCHEN_INVOICE_CHANGED' USING ERRCODE = '22023'; END IF;
  v_payment := public.kitchen_post_entry(jsonb_build_object('type', 'received', 'branch_id', p_branch_id,
    'party_id', v_invoice.party_id, 'entry_date', p_date, 'amount_paise', p_amount_paise,
    'mode', p_mode, 'note', nullif(btrim(coalesce(p_note, '')), ''), 'covers', v_covers));
  INSERT INTO public.kitchen_invoice_payments(tenant_id, branch_id, invoice_id, request_key, payment_id)
    VALUES(p_tenant_id, p_branch_id, p_invoice_id, p_request_key, v_payment.id);
  RETURN v_payment.id;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_invoice_action(uuid, uuid, uuid, text, bigint, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_invoice_action(uuid, uuid, uuid, text, bigint, date, text, text, text) TO authenticated;
