-- Task 282: owners' drawings (owner's design, output/previews/task-279 round 2).
-- Each owner has a drawings account at the kitchen. Money goes into it from Cash or Bank, an owner
-- spends only from their own drawings, and money can be put back to Cash or Bank. Owners see every
-- owner's drawings; nobody else sees them. Moving money into drawings takes it out of Cash or Bank,
-- so kitchen_money_summary counts it; spending from drawings is not a kitchen expense.
--   * kitchen_drawings: one row per move in, spending or move back. Written and read only through
--     the functions below (no table grants for the app).
--   * kitchen_drawings_record, kitchen_drawings_void, kitchen_drawings_summary: owners only.
--   * kitchen_drawings_cash_effect: what drawings took from (or put back to) Cash and Bank since a
--     day, for kitchen_money_summary (which runs as the caller).
--   * kitchen_money_summary: as in 20261012140100_kitchen_access_enforce.sql, less the drawings.
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.kitchen_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  owner_id uuid NOT NULL REFERENCES public.staff(id),
  kind text NOT NULL CHECK (kind IN ('in', 'spend', 'back')),
  account text CHECK (account IN ('cash', 'bank')),
  amount_paise bigint NOT NULL CHECK (amount_paise BETWEEN 1 AND 100000000000),
  category text CHECK (category IS NULL OR length(btrim(category)) BETWEEN 1 AND 40),
  note text CHECK (note IS NULL OR length(note) <= 200),
  draw_date date NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 12 AND 80),
  created_by text NOT NULL,
  created_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by text,
  CONSTRAINT kitchen_drawings_shape CHECK (
       (kind IN ('in', 'back') AND account IS NOT NULL AND category IS NULL)
    OR (kind = 'spend' AND account IS NULL AND category IS NOT NULL)),
  CONSTRAINT kitchen_drawings_request_once UNIQUE (tenant_id, branch_id, request_key)
);
CREATE INDEX IF NOT EXISTS kitchen_drawings_owner_idx ON public.kitchen_drawings (tenant_id, branch_id, owner_id, draw_date);

ALTER TABLE public.kitchen_drawings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_drawings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_drawings TO service_role;

-- What drawings took from Cash and Bank (moves in less moves back) since a day, for the summary.
CREATE OR REPLACE FUNCTION public.kitchen_drawings_cash_effect(p_tenant_id uuid, p_branch_id uuid, p_from date)
RETURNS TABLE (cash_paise bigint, bank_paise bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    coalesce(sum(CASE WHEN d.kind = 'in' THEN d.amount_paise ELSE -d.amount_paise END) FILTER (WHERE d.account = 'cash'), 0)::bigint,
    coalesce(sum(CASE WHEN d.kind = 'in' THEN d.amount_paise ELSE -d.amount_paise END) FILTER (WHERE d.account = 'bank'), 0)::bigint
  FROM public.kitchen_drawings d
  WHERE public.kitchen_can_use(p_tenant_id, p_branch_id)
    AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id AND d.voided_at IS NULL
    AND d.kind IN ('in', 'back') AND d.draw_date >= p_from;
$$;

-- An owner's drawings balance (in, less spent, less put back); all owners together when p_owner_id is
-- null. Only an owner of this kitchen gets a figure; anyone else gets 0.
CREATE OR REPLACE FUNCTION public.kitchen_drawings_balance(p_tenant_id uuid, p_branch_id uuid, p_owner_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(CASE WHEN d.kind = 'in' THEN d.amount_paise ELSE -d.amount_paise END), 0)::bigint
  FROM public.kitchen_drawings d
  WHERE public.kitchen_is_owner(p_tenant_id, p_branch_id)
    AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id AND d.voided_at IS NULL
    AND (p_owner_id IS NULL OR d.owner_id = p_owner_id);
$$;

-- Records a move into drawings ('in', from cash or bank), an owner's spending ('spend') or a move
-- back ('back', to cash or bank). Owners only; a repeated request returns the first row.
CREATE OR REPLACE FUNCTION public.kitchen_drawings_record(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tenant uuid := nullif(p->>'tenant_id', '')::uuid;
  v_branch uuid := nullif(p->>'branch_id', '')::uuid;
  v_owner uuid := nullif(p->>'owner_id', '')::uuid;
  v_kind text := p->>'kind';
  v_account text := nullif(p->>'account', '');
  v_amount bigint := nullif(p->>'amount_paise', '')::bigint;
  v_category text := nullif(btrim(coalesce(p->>'category', '')), '');
  v_note text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_date date := coalesce(nullif(p->>'draw_date', '')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_key text := p->>'request_key';
  v_existing uuid;
  v_id uuid;
  v_by text;
  v_left bigint;
  v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL OR v_branch IS NULL OR NOT public.kitchen_is_owner(v_tenant, v_branch) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('in', 'spend', 'back') OR v_amount IS NULL OR v_amount NOT BETWEEN 1 AND 100000000000
     OR v_date > (now() AT TIME ZONE 'Asia/Kolkata')::date OR coalesce(length(v_key), 0) NOT BETWEEN 12 AND 80
     OR coalesce(length(v_note), 0) > 200 OR coalesce(length(v_category), 0) > 40
     OR (v_kind IN ('in', 'back') AND (v_account IS NULL OR v_account NOT IN ('cash', 'bank')))
     OR (v_kind = 'spend' AND v_category IS NULL) THEN
    RAISE EXCEPTION 'KITCHEN_DRAWINGS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'spend' THEN v_account := NULL; ELSE v_category := NULL; END IF;
  -- The account belongs to one of this tenant's owners.
  IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_owner AND s.tenant_id = v_tenant AND s.role = 'owner' AND s.status = 'active' AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'KITCHEN_DRAWINGS_OWNER' USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_existing FROM public.kitchen_drawings WHERE tenant_id = v_tenant AND branch_id = v_branch AND request_key = v_key;
  IF FOUND THEN RETURN v_existing; END IF;
  -- One at a time per owner, so two spends cannot both pass the balance check.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || v_branch::text || v_owner::text, 282));
  IF v_kind IN ('spend', 'back') THEN
    v_left := public.kitchen_drawings_balance(v_tenant, v_branch, v_owner);
    IF v_amount > v_left THEN RAISE EXCEPTION 'KITCHEN_DRAWINGS_SHORT' USING ERRCODE = '22023'; END IF;
  ELSE
    v_summary := public.kitchen_money_summary(v_tenant, v_branch);
    IF v_amount > coalesce((v_summary->>(v_account || '_paise'))::bigint, 0) THEN
      RAISE EXCEPTION 'KITCHEN_DRAWINGS_SOURCE_SHORT' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_by := coalesce((SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Owner');
  INSERT INTO public.kitchen_drawings (tenant_id, branch_id, owner_id, kind, account, amount_paise, category, note, draw_date, request_key, created_by, created_by_id)
  VALUES (v_tenant, v_branch, v_owner, v_kind, v_account, v_amount, v_category, v_note, v_date, v_key, v_by, auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.kitchen_audit(v_tenant, v_branch, 'drawing_' || v_kind, 'drawing', v_id, v_date, NULL,
    jsonb_build_object('owner_id', v_owner, 'amount_paise', v_amount, 'account', v_account));
  RETURN v_id;
END $$;

-- Voids a drawings row. Owners only. Voiding a move in that was already spent is refused.
CREATE OR REPLACE FUNCTION public.kitchen_drawings_void(p_tenant_id uuid, p_branch_id uuid, p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.kitchen_drawings%ROWTYPE; v_by text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_is_owner(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.kitchen_drawings WHERE id = p_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id AND voided_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KITCHEN_DRAWINGS_INVALID' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || p_branch_id::text || v_row.owner_id::text, 282));
  IF v_row.kind = 'in' AND public.kitchen_drawings_balance(p_tenant_id, p_branch_id, v_row.owner_id) < v_row.amount_paise THEN
    RAISE EXCEPTION 'KITCHEN_DRAWINGS_SHORT' USING ERRCODE = '22023';
  END IF;
  v_by := coalesce((SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Owner');
  UPDATE public.kitchen_drawings SET voided_at = now(), voided_by = v_by WHERE id = p_id;
  PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'drawing_voided', 'drawing', p_id, v_row.draw_date, NULL,
    jsonb_build_object('owner_id', v_row.owner_id, 'amount_paise', v_row.amount_paise, 'kind', v_row.kind));
  RETURN p_id;
END $$;

-- The owners, each with what is left, what went in and what was spent in the month, and the
-- month's rows (newest first). Owners only.
CREATE OR REPLACE FUNCTION public.kitchen_drawings_summary(p_tenant_id uuid, p_branch_id uuid, p_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_start date; v_end date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_is_owner(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR p_month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'KITCHEN_DRAWINGS_INVALID' USING ERRCODE = '22023'; END IF;
  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month')::date;
  RETURN jsonb_build_object(
    'owners', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name,
        'left_paise', public.kitchen_drawings_balance(p_tenant_id, p_branch_id, s.id),
        'in_paise', coalesce((SELECT sum(d.amount_paise) FROM public.kitchen_drawings d WHERE d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id
          AND d.owner_id = s.id AND d.voided_at IS NULL AND d.kind = 'in' AND d.draw_date >= v_start AND d.draw_date < v_end), 0),
        'spent_paise', coalesce((SELECT sum(d.amount_paise) FROM public.kitchen_drawings d WHERE d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id
          AND d.owner_id = s.id AND d.voided_at IS NULL AND d.kind = 'spend' AND d.draw_date >= v_start AND d.draw_date < v_end), 0))
        ORDER BY s.created_at)
      FROM public.staff s WHERE s.tenant_id = p_tenant_id AND s.role = 'owner' AND s.status = 'active' AND s.deleted_at IS NULL), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'owner_id', d.owner_id, 'kind', d.kind, 'account', d.account,
        'amount_paise', d.amount_paise, 'category', d.category, 'note', d.note, 'draw_date', d.draw_date, 'created_by', d.created_by, 'created_at', d.created_at)
        ORDER BY d.draw_date DESC, d.created_at DESC)
      FROM public.kitchen_drawings d WHERE d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id AND d.voided_at IS NULL
        AND d.draw_date >= v_start AND d.draw_date < v_end), '[]'::jsonb),
    'categories', coalesce((SELECT jsonb_agg(c.category ORDER BY c.times DESC, c.category)
      FROM (SELECT d.category, count(*) AS times FROM public.kitchen_drawings d WHERE d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id
        AND d.kind = 'spend' AND d.voided_at IS NULL GROUP BY d.category ORDER BY count(*) DESC LIMIT 12) c), '[]'::jsonb));
END $$;

-- kitchen_money_summary: as in 20261012140100_kitchen_access_enforce.sql, less what drawings took
-- from Cash and Bank; owners also get the drawings in all.
CREATE OR REPLACE FUNCTION public.kitchen_money_summary(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_open public.kitchen_money_openings%ROWTYPE; v_has boolean; v_from date;
  v_cash_in bigint; v_cash_out bigint; v_bank_in bigint; v_bank_out bigint; v_to_bank bigint; v_to_cash bigint;
  v_draw_cash bigint; v_draw_bank bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'money.view');
  SELECT * INTO v_open FROM public.kitchen_money_openings WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  v_has := FOUND;
  v_from := CASE WHEN v_has THEN v_open.as_of ELSE '-infinity'::date END;
  SELECT
    coalesce(sum(e.amount_paise) FILTER (WHERE e.type = 'received' AND coalesce(e.mode, 'cash') NOT IN ('upi', 'bank')), 0),
    coalesce(sum(e.amount_paise) FILTER (WHERE (e.type IN ('paid', 'spent') OR (e.type = 'bought' AND e.paid)) AND coalesce(e.mode, 'cash') NOT IN ('upi', 'bank')), 0),
    coalesce(sum(e.amount_paise) FILTER (WHERE e.type = 'received' AND e.mode IN ('upi', 'bank')), 0),
    coalesce(sum(e.amount_paise) FILTER (WHERE (e.type IN ('paid', 'spent') OR (e.type = 'bought' AND e.paid)) AND e.mode IN ('upi', 'bank')), 0)
  INTO v_cash_in, v_cash_out, v_bank_in, v_bank_out
  FROM public.kitchen_entries e
  WHERE e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id AND e.voided_at IS NULL
    AND e.type IN ('received', 'paid', 'spent', 'bought') AND e.entry_date >= v_from;
  SELECT coalesce(sum(m.amount_paise) FILTER (WHERE m.to_account = 'bank'), 0),
         coalesce(sum(m.amount_paise) FILTER (WHERE m.to_account = 'cash'), 0)
  INTO v_to_bank, v_to_cash
  FROM public.kitchen_money_moves m
  WHERE m.tenant_id = p_tenant_id AND m.branch_id = p_branch_id AND m.voided_at IS NULL AND m.move_date >= v_from;
  SELECT x.cash_paise, x.bank_paise INTO v_draw_cash, v_draw_bank FROM public.kitchen_drawings_cash_effect(p_tenant_id, p_branch_id, v_from) x;
  RETURN jsonb_build_object(
    'has_opening', v_has,
    'as_of', CASE WHEN v_has THEN v_open.as_of END,
    'opening_cash_paise', CASE WHEN v_has THEN v_open.cash_paise ELSE 0 END,
    'opening_bank_paise', CASE WHEN v_has THEN v_open.bank_paise ELSE 0 END,
    'opening_updated_by', CASE WHEN v_has THEN v_open.updated_by END,
    'cash_in_paise', v_cash_in, 'cash_out_paise', v_cash_out, 'bank_in_paise', v_bank_in, 'bank_out_paise', v_bank_out,
    'moved_to_bank_paise', v_to_bank, 'moved_to_cash_paise', v_to_cash,
    'to_drawings_cash_paise', coalesce(v_draw_cash, 0), 'to_drawings_bank_paise', coalesce(v_draw_bank, 0),
    'drawings_paise', CASE WHEN public.kitchen_is_owner(p_tenant_id, p_branch_id) THEN public.kitchen_drawings_balance(p_tenant_id, p_branch_id, NULL) END,
    'cash_paise', CASE WHEN v_has THEN v_open.cash_paise ELSE 0 END + v_cash_in - v_cash_out - v_to_bank + v_to_cash - coalesce(v_draw_cash, 0),
    'bank_paise', CASE WHEN v_has THEN v_open.bank_paise ELSE 0 END + v_bank_in - v_bank_out + v_to_bank - v_to_cash - coalesce(v_draw_bank, 0),
    'moves', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'move_date', m.move_date, 'from_account', m.from_account,
        'to_account', m.to_account, 'amount_paise', m.amount_paise, 'note', m.note, 'created_by', m.created_by, 'created_at', m.created_at)
        ORDER BY m.move_date DESC, m.created_at DESC)
      FROM (SELECT * FROM public.kitchen_money_moves WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND voided_at IS NULL
            ORDER BY move_date DESC, created_at DESC LIMIT 30) m), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.kitchen_drawings_cash_effect(uuid, uuid, date), public.kitchen_drawings_balance(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_drawings_cash_effect(uuid, uuid, date), public.kitchen_drawings_balance(uuid, uuid, uuid) TO service_role;
-- kitchen_money_summary runs as the caller and calls these two, so the app's role may call them:
-- the cash effect gives totals only for a kitchen the caller can use, the balance only to its owners.
GRANT EXECUTE ON FUNCTION public.kitchen_drawings_cash_effect(uuid, uuid, date), public.kitchen_drawings_balance(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.kitchen_drawings_record(jsonb), public.kitchen_drawings_void(uuid, uuid, uuid), public.kitchen_drawings_summary(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_drawings_record(jsonb), public.kitchen_drawings_void(uuid, uuid, uuid), public.kitchen_drawings_summary(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.kitchen_money_summary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_money_summary(uuid, uuid) TO authenticated, service_role;
