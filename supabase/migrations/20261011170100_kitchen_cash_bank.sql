-- Task 194: separate Cash and Bank balances for the Central Kitchen.
-- Money entries already record a mode. Cash is Cash; UPI and bank are Bank
-- (an entry without a mode counts as Cash). A balance is the kitchen's opening
-- figure on its as-of date plus the money entries and transfers dated on or
-- after it. A transfer moves money between Cash and Bank and touches nothing
-- else: no sale, purchase, stock or branch/vendor balance.
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS public.kitchen_money_openings (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  as_of date NOT NULL,
  cash_paise bigint NOT NULL CHECK (cash_paise BETWEEN 0 AND 100000000000),
  bank_paise bigint NOT NULL CHECK (bank_paise BETWEEN -100000000000 AND 100000000000),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id)
);
CREATE INDEX IF NOT EXISTS kitchen_money_openings_branch_idx ON public.kitchen_money_openings(branch_id);

CREATE TABLE IF NOT EXISTS public.kitchen_money_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  move_date date NOT NULL,
  from_account text NOT NULL CHECK (from_account IN ('cash', 'bank')),
  to_account text NOT NULL CHECK (to_account IN ('cash', 'bank')),
  amount_paise bigint NOT NULL CHECK (amount_paise BETWEEN 1 AND 100000000000),
  note text CHECK (note IS NULL OR length(note) <= 200),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 12 AND 80),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by text,
  CONSTRAINT kitchen_money_moves_two_accounts CHECK (from_account <> to_account),
  CONSTRAINT kitchen_money_moves_request_once UNIQUE (tenant_id, branch_id, request_key)
);
CREATE INDEX IF NOT EXISTS kitchen_money_moves_scope_idx ON public.kitchen_money_moves(tenant_id, branch_id, move_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS kitchen_money_moves_branch_idx ON public.kitchen_money_moves(branch_id);

-- Signed-in kitchen users read their own kitchen's rows; only the functions below write.
ALTER TABLE public.kitchen_money_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_money_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_money_openings, public.kitchen_money_moves FROM anon, authenticated;
GRANT SELECT ON public.kitchen_money_openings, public.kitchen_money_moves TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_money_openings, public.kitchen_money_moves TO service_role;
DROP POLICY IF EXISTS kitchen_money_openings_read ON public.kitchen_money_openings;
CREATE POLICY kitchen_money_openings_read ON public.kitchen_money_openings FOR SELECT TO authenticated USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_money_moves_read ON public.kitchen_money_moves;
CREATE POLICY kitchen_money_moves_read ON public.kitchen_money_moves FOR SELECT TO authenticated USING (public.kitchen_can_use(tenant_id, branch_id));

-- Current Cash and Bank, read with the caller's own rights.
CREATE OR REPLACE FUNCTION public.kitchen_money_summary(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_open public.kitchen_money_openings%ROWTYPE; v_has boolean; v_from date;
  v_cash_in bigint; v_cash_out bigint; v_bank_in bigint; v_bank_out bigint; v_to_bank bigint; v_to_cash bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
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
  RETURN jsonb_build_object(
    'has_opening', v_has,
    'as_of', CASE WHEN v_has THEN v_open.as_of END,
    'opening_cash_paise', CASE WHEN v_has THEN v_open.cash_paise ELSE 0 END,
    'opening_bank_paise', CASE WHEN v_has THEN v_open.bank_paise ELSE 0 END,
    'opening_updated_by', CASE WHEN v_has THEN v_open.updated_by END,
    'cash_in_paise', v_cash_in, 'cash_out_paise', v_cash_out, 'bank_in_paise', v_bank_in, 'bank_out_paise', v_bank_out,
    'moved_to_bank_paise', v_to_bank, 'moved_to_cash_paise', v_to_cash,
    'cash_paise', CASE WHEN v_has THEN v_open.cash_paise ELSE 0 END + v_cash_in - v_cash_out - v_to_bank + v_to_cash,
    'bank_paise', CASE WHEN v_has THEN v_open.bank_paise ELSE 0 END + v_bank_in - v_bank_out + v_to_bank - v_to_cash,
    'moves', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'move_date', m.move_date, 'from_account', m.from_account,
        'to_account', m.to_account, 'amount_paise', m.amount_paise, 'note', m.note, 'created_by', m.created_by, 'created_at', m.created_at)
        ORDER BY m.move_date DESC, m.created_at DESC)
      FROM (SELECT * FROM public.kitchen_money_moves WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND voided_at IS NULL
            ORDER BY move_date DESC, created_at DESC LIMIT 30) m), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.kitchen_money_summary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_money_summary(uuid, uuid) TO authenticated;

-- Writes are security definer because authenticated clients only have SELECT.
-- Each checks auth.uid() and kitchen_can_use, and scopes by tenant and branch.
CREATE OR REPLACE FUNCTION public.kitchen_set_money_opening(p_tenant_id uuid, p_branch_id uuid, p_as_of date, p_cash_paise bigint, p_bank_paise bigint)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_by text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_as_of IS NULL OR p_as_of > (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR p_cash_paise IS NULL OR p_cash_paise NOT BETWEEN 0 AND 100000000000
    OR p_bank_paise IS NULL OR p_bank_paise NOT BETWEEN -100000000000 AND 100000000000 THEN
    RAISE EXCEPTION 'KITCHEN_MONEY_INVALID' USING ERRCODE = '22023';
  END IF;
  v_by := coalesce((SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Staff');
  INSERT INTO public.kitchen_money_openings(tenant_id, branch_id, as_of, cash_paise, bank_paise, updated_by, updated_at)
  VALUES (p_tenant_id, p_branch_id, p_as_of, p_cash_paise, p_bank_paise, v_by, now())
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET as_of = EXCLUDED.as_of, cash_paise = EXCLUDED.cash_paise,
    bank_paise = EXCLUDED.bank_paise, updated_by = EXCLUDED.updated_by, updated_at = now();
  RETURN p_as_of;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_set_money_opening(uuid, uuid, date, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_set_money_opening(uuid, uuid, date, bigint, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.kitchen_move_money(p_tenant_id uuid, p_branch_id uuid, p_move_date date,
  p_from text, p_to text, p_amount_paise bigint, p_note text, p_request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_existing public.kitchen_money_moves%ROWTYPE; v_id uuid; v_by text; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_move_date IS NULL OR p_move_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR p_from IS NULL OR p_to IS NULL OR p_from NOT IN ('cash', 'bank') OR p_to NOT IN ('cash', 'bank') OR p_from = p_to
    OR p_amount_paise IS NULL OR p_amount_paise NOT BETWEEN 1 AND 100000000000
    OR coalesce(length(v_note), 0) > 200 OR coalesce(length(p_request_key), 0) NOT BETWEEN 12 AND 80 THEN
    RAISE EXCEPTION 'KITCHEN_MONEY_INVALID' USING ERRCODE = '22023';
  END IF;
  -- A repeated request (lost response, double tap) returns the first transfer.
  SELECT * INTO v_existing FROM public.kitchen_money_moves
    WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND request_key = p_request_key;
  IF FOUND THEN
    IF v_existing.move_date IS DISTINCT FROM p_move_date OR v_existing.from_account IS DISTINCT FROM p_from
      OR v_existing.amount_paise IS DISTINCT FROM p_amount_paise THEN
      RAISE EXCEPTION 'KITCHEN_MONEY_CHANGED' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.id;
  END IF;
  v_by := coalesce((SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Staff');
  INSERT INTO public.kitchen_money_moves(tenant_id, branch_id, move_date, from_account, to_account, amount_paise, note, request_key, created_by)
  VALUES (p_tenant_id, p_branch_id, p_move_date, p_from, p_to, p_amount_paise, v_note, p_request_key, v_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_move_money(uuid, uuid, date, text, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_move_money(uuid, uuid, date, text, text, bigint, text, text) TO authenticated;

-- A transfer entered by mistake is voided, never deleted.
CREATE OR REPLACE FUNCTION public.kitchen_void_money_move(p_tenant_id uuid, p_branch_id uuid, p_move_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_by text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_by := coalesce((SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Staff');
  UPDATE public.kitchen_money_moves SET voided_at = now(), voided_by = v_by
    WHERE id = p_move_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id AND voided_at IS NULL;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.kitchen_money_moves
      WHERE id = p_move_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_MONEY_CHANGED' USING ERRCODE = '22023';
  END IF;
  RETURN p_move_id;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_void_money_move(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_void_money_move(uuid, uuid, uuid) TO authenticated;
