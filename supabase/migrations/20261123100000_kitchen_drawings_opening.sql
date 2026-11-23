-- Task 329: old pendings on the owners' drawings, entered directly, and each owner's own account.
--   * kitchen_drawings gets a fourth kind, 'opening' (brought forward): what an owner already had in
--     drawings before the app. It counts in the owner's balance, takes nothing from Cash or Bank and
--     is not a move in, so Cash & bank and the reports do not see it.
--   * Spending and putting money back are only from the signed-in owner's own drawings (each owner
--     now has their own login); adding money or a brought-forward amount can be done for any owner.
--   * kitchen_drawings_summary says which owner is the caller ('me').
-- As in 20261020110000_kitchen_drawings.sql otherwise. Idempotent: safe to run twice.

ALTER TABLE public.kitchen_drawings DROP CONSTRAINT IF EXISTS kitchen_drawings_kind_check;
ALTER TABLE public.kitchen_drawings ADD CONSTRAINT kitchen_drawings_kind_check CHECK (kind IN ('in', 'spend', 'back', 'opening'));
ALTER TABLE public.kitchen_drawings DROP CONSTRAINT IF EXISTS kitchen_drawings_shape;
ALTER TABLE public.kitchen_drawings ADD CONSTRAINT kitchen_drawings_shape CHECK (
     (kind IN ('in', 'back') AND account IS NOT NULL AND category IS NULL)
  OR (kind = 'spend' AND account IS NULL AND category IS NOT NULL)
  OR (kind = 'opening' AND account IS NULL AND category IS NULL));

CREATE OR REPLACE FUNCTION public.kitchen_drawings_balance(p_tenant_id uuid, p_branch_id uuid, p_owner_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(CASE WHEN d.kind IN ('in', 'opening') THEN d.amount_paise ELSE -d.amount_paise END), 0)::bigint
  FROM public.kitchen_drawings d
  WHERE public.kitchen_is_owner(p_tenant_id, p_branch_id)
    AND d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id AND d.voided_at IS NULL
    AND (p_owner_id IS NULL OR d.owner_id = p_owner_id);
$$;

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
  IF v_kind IS NULL OR v_kind NOT IN ('in', 'spend', 'back', 'opening') OR v_amount IS NULL OR v_amount NOT BETWEEN 1 AND 100000000000
     OR v_date > (now() AT TIME ZONE 'Asia/Kolkata')::date OR coalesce(length(v_key), 0) NOT BETWEEN 12 AND 80
     OR coalesce(length(v_note), 0) > 200 OR coalesce(length(v_category), 0) > 40
     OR (v_kind IN ('in', 'back') AND (v_account IS NULL OR v_account NOT IN ('cash', 'bank')))
     OR (v_kind = 'spend' AND v_category IS NULL) THEN
    RAISE EXCEPTION 'KITCHEN_DRAWINGS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'spend' THEN v_account := NULL;
  ELSIF v_kind = 'opening' THEN v_account := NULL; v_category := NULL;
  ELSE v_category := NULL; END IF;
  -- The account belongs to one of this tenant's owners.
  IF NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = v_owner AND s.tenant_id = v_tenant AND s.role = 'owner' AND s.status = 'active' AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'KITCHEN_DRAWINGS_OWNER' USING ERRCODE = 'P0002';
  END IF;
  -- Spending, and money put back, come only from the owner's own drawings.
  IF v_kind IN ('spend', 'back') AND v_owner IS DISTINCT FROM public.kitchen_staff_id() THEN
    RAISE EXCEPTION 'KITCHEN_DRAWINGS_NOT_YOURS' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_existing FROM public.kitchen_drawings WHERE tenant_id = v_tenant AND branch_id = v_branch AND request_key = v_key;
  IF FOUND THEN RETURN v_existing; END IF;
  -- One at a time per owner, so two spends cannot both pass the balance check.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant::text || v_branch::text || v_owner::text, 282));
  IF v_kind IN ('spend', 'back') THEN
    v_left := public.kitchen_drawings_balance(v_tenant, v_branch, v_owner);
    IF v_amount > v_left THEN RAISE EXCEPTION 'KITCHEN_DRAWINGS_SHORT' USING ERRCODE = '22023'; END IF;
  ELSIF v_kind = 'in' THEN
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
  IF v_row.kind IN ('in', 'opening') AND public.kitchen_drawings_balance(p_tenant_id, p_branch_id, v_row.owner_id) < v_row.amount_paise THEN
    RAISE EXCEPTION 'KITCHEN_DRAWINGS_SHORT' USING ERRCODE = '22023';
  END IF;
  v_by := coalesce((SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Owner');
  UPDATE public.kitchen_drawings SET voided_at = now(), voided_by = v_by WHERE id = p_id;
  PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'drawing_voided', 'drawing', p_id, v_row.draw_date, NULL,
    jsonb_build_object('owner_id', v_row.owner_id, 'amount_paise', v_row.amount_paise, 'kind', v_row.kind));
  RETURN p_id;
END $$;

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
    'me', public.kitchen_staff_id(),
    'owners', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name,
        'left_paise', public.kitchen_drawings_balance(p_tenant_id, p_branch_id, s.id),
        'in_paise', coalesce((SELECT sum(d.amount_paise) FROM public.kitchen_drawings d WHERE d.tenant_id = p_tenant_id AND d.branch_id = p_branch_id
          AND d.owner_id = s.id AND d.voided_at IS NULL AND d.kind IN ('in', 'opening') AND d.draw_date >= v_start AND d.draw_date < v_end), 0),
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

REVOKE ALL ON FUNCTION public.kitchen_drawings_balance(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_drawings_balance(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.kitchen_drawings_record(jsonb), public.kitchen_drawings_void(uuid, uuid, uuid), public.kitchen_drawings_summary(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_drawings_record(jsonb), public.kitchen_drawings_void(uuid, uuid, uuid), public.kitchen_drawings_summary(uuid, uuid, text) TO authenticated, service_role;
