-- Task 206: the invoice register can be narrowed to one status (to be paid,
-- paid or cancelled). The filter runs in the database so the 50-row pages and
-- the total count stay right. Same body as 20261012140100_kitchen_access_enforce.sql
-- plus p_status; the old eight-argument version is dropped so PostgREST never
-- sees two overloads.

DROP FUNCTION IF EXISTS public.kitchen_invoice_workspace(uuid, uuid, date, date, uuid, integer, boolean, uuid);
DROP FUNCTION IF EXISTS public.kitchen_invoice_workspace(uuid, uuid, date, date, uuid, integer, boolean, uuid, text);

CREATE FUNCTION public.kitchen_invoice_workspace(p_tenant_id uuid, p_branch_id uuid,
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
    OR (p_status IS NOT NULL AND p_status NOT IN ('to_be_paid', 'paid', 'cancelled')) THEN
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
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_entry_lines l LEFT JOIN public.kitchen_items m
          ON m.id = l.item_id AND m.tenant_id = p_tenant_id AND m.branch_id = p_branch_id
          WHERE l.entry_id = e.id AND l.tenant_id = p_tenant_id AND l.branch_id = p_branch_id
          AND m.item_kind IS DISTINCT FROM 'finished_good')
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
      AND (p_status IS NULL OR status = p_status);
    SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC, i.id), '[]'::jsonb) INTO v_rows FROM (
      SELECT * FROM public.kitchen_invoice_totals WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
        AND start_date <= p_end_date AND end_date >= p_start_date AND (p_party_id IS NULL OR party_id = p_party_id)
        AND (p_status IS NULL OR status = p_status)
      ORDER BY created_at DESC, id LIMIT 50 OFFSET p_page * 50) i;
  END IF;
  RETURN jsonb_build_object('rows', v_rows, 'total_rows', v_count, 'branches', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', id, 'label', name) ORDER BY name)
    FROM public.kitchen_parties WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND kind = 'branch'), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.kitchen_invoice_workspace(uuid, uuid, date, date, uuid, integer, boolean, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_invoice_workspace(uuid, uuid, date, date, uuid, integer, boolean, uuid, text) TO authenticated;
