-- Task 301: a send can go on an invoice whatever is on it. Sends take raw materials too (task 280:
-- Kunafa, Baklava, Milk), but New invoice left out any send with a raw material on it, without a
-- word, so those deliveries could never be invoiced; on 2026-11-05 that was 11 of the 21 sends.
-- Both functions are their latest versions (20261012140100 and 20261016100000) with only the
-- finished-goods checks taken out. Invoices already made are untouched: they keep their own lines.

CREATE OR REPLACE FUNCTION public.kitchen_invoice_workspace(p_tenant_id uuid, p_branch_id uuid,
  p_start_date date, p_end_date date, p_party_id uuid DEFAULT NULL, p_page integer DEFAULT 0,
  p_candidates boolean DEFAULT false, p_invoice_id uuid DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_result jsonb; v_rows jsonb; v_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.kitchen_can(p_tenant_id, p_branch_id, 'invoices.create') OR public.kitchen_can(p_tenant_id, p_branch_id, 'invoices.receive')
    OR public.kitchen_can(p_tenant_id, p_branch_id, 'invoices.cancel')) THEN
    RAISE EXCEPTION 'KITCHEN_NOT_ALLOWED' USING ERRCODE = '42501', DETAIL = 'invoices';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
    OR p_end_date > (now() AT TIME ZONE 'Asia/Kolkata')::date OR p_page IS NULL OR p_page NOT BETWEEN 0 AND 100000
    OR (p_status IS NOT NULL AND (p_status = '' OR EXISTS (SELECT 1 FROM unnest(string_to_array(p_status, ',')) AS s(value)
      WHERE s.value NOT IN ('to_be_paid', 'paid', 'cancelled')))) THEN
    RAISE EXCEPTION 'KITCHEN_INVOICE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_invoice_id IS NOT NULL THEN
    SELECT to_jsonb(i) || jsonb_build_object('deliveries', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.entry_date, d.id)
      FROM public.kitchen_invoice_deliveries d WHERE d.invoice_id = i.id AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id), '[]'::jsonb))
      INTO v_result FROM public.kitchen_invoice_totals i WHERE i.id = p_invoice_id
      AND i.tenant_id = p_tenant_id AND i.branch_id = p_branch_id;
    RETURN jsonb_build_object('invoice', v_result);
  END IF;
  IF p_candidates THEN
    WITH eligible AS (
      SELECT e.* FROM public.kitchen_entries e WHERE e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id
        AND e.party_id = p_party_id AND e.type = 'sent' AND e.voided_at IS NULL
        AND e.entry_date BETWEEN p_start_date AND p_end_date
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_invoice_deliveries d WHERE d.entry_id = e.id
          AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id AND d.is_active)
        AND EXISTS (SELECT 1 FROM public.kitchen_entry_lines l WHERE l.entry_id = e.id AND l.tenant_id = p_tenant_id AND l.branch_id = p_branch_id)
    ), page AS (SELECT * FROM eligible ORDER BY entry_date, created_at, id LIMIT 50 OFFSET p_page * 50)
    SELECT (SELECT count(*) FROM eligible), coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'entry_date', e.entry_date,
      'amount_paise', e.amount_paise, 'lines', (SELECT jsonb_agg(jsonb_build_object('id', l.id, 'item_name', m.name,
        'unit', m.unit, 'qty', l.qty, 'price_paise', l.price_paise, 'line_paise', l.line_paise) ORDER BY m.name, l.id)
        FROM public.kitchen_entry_lines l JOIN public.kitchen_items m ON m.id = l.item_id AND m.tenant_id = p_tenant_id AND m.branch_id = p_branch_id
        WHERE l.entry_id = e.id AND l.tenant_id = p_tenant_id AND l.branch_id = p_branch_id)) ORDER BY e.entry_date, e.created_at, e.id), '[]'::jsonb)
      INTO v_count, v_rows FROM page e;
  ELSE
    SELECT count(*) INTO v_count FROM public.kitchen_invoice_totals WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
      AND start_date <= p_end_date AND end_date >= p_start_date AND (p_party_id IS NULL OR party_id = p_party_id)
      AND (p_status IS NULL OR status = ANY (string_to_array(p_status, ',')));
    SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC, i.id), '[]'::jsonb) INTO v_rows FROM (
      SELECT * FROM public.kitchen_invoice_totals WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
        AND start_date <= p_end_date AND end_date >= p_start_date AND (p_party_id IS NULL OR party_id = p_party_id)
        AND (p_status IS NULL OR status = ANY (string_to_array(p_status, ',')))
      ORDER BY created_at DESC, id LIMIT 50 OFFSET p_page * 50) i;
  END IF;
  RETURN jsonb_build_object('rows', v_rows, 'total_rows', v_count, 'branches', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', id, 'label', name) ORDER BY name)
    FROM public.kitchen_parties WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND kind = 'branch'), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.kitchen_invoice_workspace(uuid, uuid, date, date, uuid, integer, boolean, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_invoice_workspace(uuid, uuid, date, date, uuid, integer, boolean, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.kitchen_create_invoice(p_tenant_id uuid, p_branch_id uuid,
  p_party_id uuid, p_start_date date, p_end_date date, p_entry_ids uuid[], p_expected_total_paise bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid; v_name text; v_kitchen text; v_actor text; v_entry record;
  v_count integer := 0; v_total bigint := 0; v_rows jsonb := '[]'::jsonb; v_lines jsonb; v_no integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'invoices.create');
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
    OR p_end_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR coalesce(cardinality(p_entry_ids), 0) NOT BETWEEN 1 AND 100
    OR p_expected_total_paise IS NULL OR p_expected_total_paise < 0
    OR (SELECT count(DISTINCT x) FROM unnest(p_entry_ids) x) <> cardinality(p_entry_ids) THEN
    RAISE EXCEPTION 'KITCHEN_INVOICE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO v_name FROM public.kitchen_parties WHERE id = p_party_id
    AND tenant_id = p_tenant_id AND branch_id = p_branch_id AND kind = 'branch' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KITCHEN_INVOICE_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT name INTO v_kitchen FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id;
  SELECT name INTO v_actor FROM public.staff WHERE auth_user_id = auth.uid() AND tenant_id = p_tenant_id
    AND branch_id = public.auth_branch_id() AND status = 'active' AND deleted_at IS NULL LIMIT 1;
  FOR v_entry IN SELECT * FROM public.kitchen_entries WHERE id = ANY(p_entry_ids)
    AND tenant_id = p_tenant_id AND branch_id = p_branch_id ORDER BY id FOR UPDATE LOOP
    IF v_entry.type <> 'sent' OR v_entry.party_id <> p_party_id OR v_entry.voided_at IS NOT NULL
      OR v_entry.entry_date NOT BETWEEN p_start_date AND p_end_date
      OR EXISTS (SELECT 1 FROM public.kitchen_invoice_deliveries WHERE entry_id = v_entry.id AND is_active) THEN
      RAISE EXCEPTION 'KITCHEN_INVOICE_CHANGED' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_agg(jsonb_build_object('id', l.id, 'item_name', m.name, 'unit', m.unit,
      'qty', l.qty, 'price_paise', l.price_paise, 'line_paise', l.line_paise) ORDER BY m.name, l.id)
      INTO v_lines FROM public.kitchen_entry_lines l JOIN public.kitchen_items m ON m.id = l.item_id
      AND m.tenant_id = p_tenant_id AND m.branch_id = p_branch_id
      WHERE l.entry_id = v_entry.id AND l.tenant_id = p_tenant_id AND l.branch_id = p_branch_id;
    IF v_lines IS NULL OR jsonb_array_length(v_lines) <> (SELECT count(*) FROM public.kitchen_entry_lines
      WHERE entry_id = v_entry.id AND tenant_id = p_tenant_id AND branch_id = p_branch_id)
      OR (SELECT sum((l->>'line_paise')::bigint) FROM jsonb_array_elements(v_lines) l) <> v_entry.amount_paise THEN
      RAISE EXCEPTION 'KITCHEN_INVOICE_INVALID' USING ERRCODE = '22023';
    END IF;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('entry_id', v_entry.id, 'entry_date', v_entry.entry_date,
      'amount_paise', v_entry.amount_paise, 'lines', v_lines));
    v_count := v_count + 1; v_total := v_total + v_entry.amount_paise;
  END LOOP;
  IF v_count <> cardinality(p_entry_ids) OR v_total <> p_expected_total_paise THEN
    RAISE EXCEPTION 'KITCHEN_INVOICE_CHANGED' USING ERRCODE = '22023';
  END IF;
  -- The kitchen's next number. The counter row lock serialises creation, and a
  -- rolled-back attempt also rolls back the counter, so numbers have no gaps.
  INSERT INTO public.kitchen_invoice_counters(tenant_id, branch_id, last_no) VALUES (p_tenant_id, p_branch_id, 999)
    ON CONFLICT (tenant_id, branch_id) DO NOTHING;
  UPDATE public.kitchen_invoice_counters SET last_no = last_no + 1
    WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id RETURNING last_no INTO v_no;
  INSERT INTO public.kitchen_invoices(tenant_id, branch_id, party_id, kitchen_name, party_name, start_date, end_date,
    total_paise, created_by, created_by_name, invoice_no)
  VALUES(p_tenant_id, p_branch_id, p_party_id, coalesce(v_kitchen, 'Central Kitchen'), v_name, p_start_date, p_end_date,
    v_total, auth.uid(), coalesce(v_actor, 'Staff'), v_no) RETURNING id INTO v_id;
  INSERT INTO public.kitchen_invoice_deliveries(tenant_id, branch_id, invoice_id, entry_id, entry_date, amount_paise, lines)
  SELECT p_tenant_id, p_branch_id, v_id, (r->>'entry_id')::uuid, (r->>'entry_date')::date,
    (r->>'amount_paise')::bigint, r->'lines' FROM jsonb_array_elements(v_rows) r;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.kitchen_create_invoice(uuid, uuid, uuid, date, date, uuid[], bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_create_invoice(uuid, uuid, uuid, date, date, uuid[], bigint) TO authenticated;
