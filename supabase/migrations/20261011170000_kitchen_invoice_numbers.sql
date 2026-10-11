-- Task 193: invoices are numbered 01000, 01001, 01002 ... for each Central
-- Kitchen, with no gaps. The app shows invoice_no as five digits. The old
-- global identity column `number` stays for history but is no longer shown.
-- Idempotent: safe to run twice.
ALTER TABLE public.kitchen_invoices ADD COLUMN IF NOT EXISTS invoice_no integer;

CREATE TABLE IF NOT EXISTS public.kitchen_invoice_counters (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  last_no integer NOT NULL CHECK (last_no >= 999),
  PRIMARY KEY (tenant_id, branch_id)
);
CREATE INDEX IF NOT EXISTS kitchen_invoice_counters_branch_idx ON public.kitchen_invoice_counters(branch_id);
-- Only kitchen_create_invoice (security definer) reads or writes the counter.
ALTER TABLE public.kitchen_invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_invoice_counters FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_invoice_counters TO service_role;

-- Existing invoices take numbers in creation order, after any already numbered.
WITH tops AS (
  SELECT tenant_id, branch_id, coalesce(max(invoice_no), 999) AS top
  FROM public.kitchen_invoices GROUP BY tenant_id, branch_id
), ordered AS (
  SELECT i.id, t.top + row_number() OVER (PARTITION BY i.tenant_id, i.branch_id ORDER BY i.created_at, i.number) AS n
  FROM public.kitchen_invoices i JOIN tops t ON t.tenant_id = i.tenant_id AND t.branch_id = i.branch_id
  WHERE i.invoice_no IS NULL
)
UPDATE public.kitchen_invoices i SET invoice_no = o.n FROM ordered o WHERE i.id = o.id;
INSERT INTO public.kitchen_invoice_counters(tenant_id, branch_id, last_no)
SELECT tenant_id, branch_id, max(invoice_no) FROM public.kitchen_invoices GROUP BY tenant_id, branch_id
ON CONFLICT (tenant_id, branch_id) DO UPDATE SET last_no = greatest(public.kitchen_invoice_counters.last_no, EXCLUDED.last_no);
ALTER TABLE public.kitchen_invoices ALTER COLUMN invoice_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_invoices_no_once ON public.kitchen_invoices(tenant_id, branch_id, invoice_no);

-- Same view with invoice_no appended (a replaced view may only add columns at the end).
CREATE OR REPLACE VIEW public.kitchen_invoice_totals WITH (security_invoker = true) AS
SELECT i.id, i.number, i.tenant_id, i.branch_id, i.party_id, i.kitchen_name, i.party_name, i.start_date, i.end_date,
  i.total_paise, i.created_at, i.created_by, i.created_by_name, i.cancelled_at, i.cancel_reason,
  coalesce(p.covered_paise, 0)::bigint AS covered_paise,
  greatest(0, i.total_paise - coalesce(p.covered_paise, 0))::bigint AS open_paise,
  CASE WHEN i.cancelled_at IS NOT NULL THEN 'cancelled'
       WHEN i.total_paise <= coalesce(p.covered_paise, 0) THEN 'paid' ELSE 'to_be_paid' END AS status,
  i.invoice_no
FROM public.kitchen_invoices i
LEFT JOIN LATERAL (
  SELECT sum(least(d.amount_paise, coalesce(a.amount, 0))) AS covered_paise
  FROM public.kitchen_invoice_deliveries d
  LEFT JOIN LATERAL (
    SELECT sum(a.amount_paise) AS amount FROM public.kitchen_allocations a
    JOIN public.kitchen_entries e ON e.id = a.payment_id AND e.tenant_id = d.tenant_id AND e.branch_id = d.branch_id
      AND e.type = 'received' AND e.voided_at IS NULL AND e.party_id = i.party_id
    WHERE a.covers_id = d.entry_id AND a.tenant_id = d.tenant_id AND a.branch_id = d.branch_id
  ) a ON true
  WHERE d.invoice_id = i.id AND d.tenant_id = i.tenant_id AND d.branch_id = i.branch_id
) p ON true;
REVOKE ALL ON public.kitchen_invoice_totals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.kitchen_invoice_totals TO authenticated, service_role;

-- Invoice creation as in 20261011071731, now taking the kitchen's next number.
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
      AND m.tenant_id = p_tenant_id AND m.branch_id = p_branch_id AND m.item_kind = 'finished_good'
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
