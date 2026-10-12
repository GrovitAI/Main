-- Task 157. Additive kitchen purchase categories; apply to staging first.
CREATE TABLE IF NOT EXISTS public.kitchen_purchase_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,tenant_id,branch_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_purchase_categories_name_key
  ON public.kitchen_purchase_categories(tenant_id,branch_id,lower(btrim(name))) WHERE is_active;
ALTER TABLE public.kitchen_purchase_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_purchase_categories FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.kitchen_purchase_categories TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.kitchen_purchase_categories TO authenticated;
DROP POLICY IF EXISTS kitchen_purchase_categories_scope ON public.kitchen_purchase_categories;
CREATE POLICY kitchen_purchase_categories_scope ON public.kitchen_purchase_categories TO authenticated
  USING (public.kitchen_can_use(tenant_id,branch_id)) WITH CHECK (public.kitchen_can_use(tenant_id,branch_id));

ALTER TABLE public.kitchen_parties ADD COLUMN IF NOT EXISTS purchase_category_id uuid;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS purchase_category_id uuid;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS purchase_category_name text;
DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.kitchen_parties'::regclass AND conname='kitchen_party_purchase_category_scope') THEN
    ALTER TABLE public.kitchen_parties ADD CONSTRAINT kitchen_party_purchase_category_scope
      FOREIGN KEY(purchase_category_id,tenant_id,branch_id) REFERENCES public.kitchen_purchase_categories(id,tenant_id,branch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.kitchen_entries'::regclass AND conname='kitchen_entry_purchase_category_scope') THEN
    ALTER TABLE public.kitchen_entries ADD CONSTRAINT kitchen_entry_purchase_category_scope
      FOREIGN KEY(purchase_category_id,tenant_id,branch_id) REFERENCES public.kitchen_purchase_categories(id,tenant_id,branch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.kitchen_parties'::regclass AND conname='kitchen_vendor_category_only') THEN
    ALTER TABLE public.kitchen_parties ADD CONSTRAINT kitchen_vendor_category_only CHECK(kind='vendor' OR purchase_category_id IS NULL);
  END IF;
END
$constraints$;
-- Old purchases remain uncategorized; never infer history from a vendor's current default.
CREATE OR REPLACE FUNCTION public.kitchen_post_entry(p jsonb)
 RETURNS kitchen_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant    uuid := public.auth_tenant_id();
  v_branch    uuid := nullif(p->>'branch_id', '')::uuid;
  v_type      text := p->>'type';
  v_date      date := coalesce(nullif(p->>'entry_date', '')::date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_party     uuid := nullif(p->>'party_id', '')::uuid;
  v_item      uuid := nullif(p->>'item_id', '')::uuid;
  v_qty       numeric := nullif(p->>'qty', '')::numeric;
  v_amount    bigint := coalesce(nullif(p->>'amount_paise', '')::bigint, 0);
  v_paid      boolean := coalesce(nullif(p->>'paid', '')::boolean, true);
  v_mode      text := nullif(btrim(coalesce(p->>'mode', '')), '');
  v_category  text := nullif(btrim(coalesce(p->>'category', '')), '');
  v_purchase_category uuid;
  v_purchase_name text;
  v_note      text := nullif(btrim(coalesce(p->>'note', '')), '');
  v_by        text := coalesce(
                 nullif(btrim(coalesce(p->>'created_by', '')), ''),
                 (SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active' AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1),
                 'Staff');
  v_party_row public.kitchen_parties%ROWTYPE;
  v_item_row  public.kitchen_items%ROWTYPE;
  v_entry     public.kitchen_entries%ROWTYPE;
  v_line      jsonb;
  v_line_item uuid;
  v_line_qty  numeric;
  v_line_price bigint;
  v_line_total bigint;
  v_total     bigint := 0;
  v_count     integer := 0;
  v_cover     jsonb;
  v_cover_id  uuid;
  v_cover_amt bigint;
  v_cover_row public.kitchen_entries%ROWTYPE;
  v_open      bigint;
  v_covered   bigint := 0;
BEGIN
  IF v_tenant IS NULL OR v_branch IS NULL OR NOT public.kitchen_can_use(v_tenant, v_branch) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('sent', 'received', 'bought', 'paid', 'spent', 'made', 'count') THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_mode IS NOT NULL AND v_mode NOT IN ('cash', 'upi', 'bank') THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('kitchen.posting', 'on', true);

  IF v_type IN ('sent', 'received', 'bought', 'paid') THEN
    SELECT * INTO v_party_row FROM public.kitchen_parties
     WHERE id = v_party AND tenant_id = v_tenant AND branch_id = v_branch AND is_active
     FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'KITCHEN_PARTY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF (v_type IN ('sent', 'received') AND v_party_row.kind <> 'branch')
       OR (v_type IN ('bought', 'paid') AND v_party_row.kind <> 'vendor') THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_party := NULL;
  END IF;

  IF v_type IN ('received', 'paid', 'spent') THEN
    IF v_amount <= 0 OR v_mode IS NULL THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_type = 'spent' AND v_category IS NULL THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    v_paid := true;
  END IF;
  IF v_type <> 'spent' THEN v_category := NULL; END IF;
  IF v_type = 'bought' THEN
    v_purchase_category := CASE WHEN p ? 'purchase_category_id'
      THEN nullif(p->>'purchase_category_id','')::uuid ELSE v_party_row.purchase_category_id END;
    IF v_purchase_category IS NOT NULL THEN
      SELECT name INTO v_purchase_name FROM public.kitchen_purchase_categories
      WHERE id=v_purchase_category AND tenant_id=v_tenant AND branch_id=v_branch AND is_active FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'KITCHEN_CATEGORY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    END IF;
    IF v_paid AND v_mode IS NULL THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    IF NOT v_paid THEN v_mode := NULL; END IF;
  END IF;
  IF v_type IN ('sent', 'made', 'count') THEN
    v_paid := true;
    v_mode := NULL;
  END IF;
  IF v_type IN ('sent', 'bought', 'made', 'count') THEN
    v_amount := 0;
  END IF;

  IF v_type IN ('made', 'count') THEN
    SELECT * INTO v_item_row FROM public.kitchen_items
     WHERE id = v_item AND tenant_id = v_tenant AND branch_id = v_branch AND is_active
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'KITCHEN_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_qty IS NULL OR v_qty < 0 OR (v_type = 'made' AND v_qty <= 0) THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_item := NULL;
    v_qty := NULL;
  END IF;

  INSERT INTO public.kitchen_entries
    (tenant_id, branch_id, type, entry_date, party_id, item_id, qty, from_qty, amount_paise, paid, mode, category, note, created_by, purchase_category_id, purchase_category_name)
  VALUES
    (v_tenant, v_branch, v_type, v_date, v_party, v_item, v_qty,
     CASE WHEN v_type = 'count' THEN v_item_row.stock END,
     v_amount, v_paid, v_mode, v_category, v_note, v_by, v_purchase_category, v_purchase_name)
  RETURNING * INTO v_entry;

  IF v_type IN ('sent', 'bought') THEN
    IF p->'lines' IS NULL OR jsonb_typeof(p->'lines') <> 'array' THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
      v_line_item  := nullif(v_line->>'item_id', '')::uuid;
      v_line_qty   := nullif(v_line->>'qty', '')::numeric;
      v_line_price := nullif(v_line->>'price_paise', '')::bigint;
      IF v_line_item IS NULL OR v_line_qty IS NULL OR v_line_qty <= 0 OR v_line_price IS NULL OR v_line_price < 0 THEN
        RAISE EXCEPTION 'KITCHEN_INVALID_LINE' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_item_row FROM public.kitchen_items
       WHERE id = v_line_item AND tenant_id = v_tenant AND branch_id = v_branch AND is_active
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'KITCHEN_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;
      v_line_total := round(v_line_qty * v_line_price)::bigint;
      INSERT INTO public.kitchen_entry_lines (tenant_id, branch_id, entry_id, item_id, qty, price_paise, line_paise)
      VALUES (v_tenant, v_branch, v_entry.id, v_line_item, v_line_qty, v_line_price, v_line_total);
      UPDATE public.kitchen_items
         SET stock = stock + CASE WHEN v_type = 'bought' THEN v_line_qty ELSE -v_line_qty END
       WHERE id = v_line_item;
      v_total := v_total + v_line_total;
      v_count := v_count + 1;
    END LOOP;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    UPDATE public.kitchen_entries SET amount_paise = v_total WHERE id = v_entry.id RETURNING * INTO v_entry;
  ELSIF v_type = 'made' THEN
    UPDATE public.kitchen_items SET stock = stock + v_qty WHERE id = v_item;
  ELSIF v_type = 'count' THEN
    UPDATE public.kitchen_items SET stock = v_qty WHERE id = v_item;
  ELSIF v_type IN ('paid', 'received') AND jsonb_typeof(p->'covers') = 'array' THEN
    FOR v_cover IN SELECT * FROM jsonb_array_elements(p->'covers') LOOP
      v_cover_id  := nullif(v_cover->>'entry_id', '')::uuid;
      v_cover_amt := nullif(v_cover->>'amount_paise', '')::bigint;
      IF v_cover_id IS NULL OR v_cover_amt IS NULL OR v_cover_amt <= 0 THEN
        RAISE EXCEPTION 'KITCHEN_INVALID_MATCH' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_cover_row FROM public.kitchen_entries
       WHERE id = v_cover_id AND tenant_id = v_tenant AND branch_id = v_branch AND party_id = v_party
         AND voided_at IS NULL
         AND ((v_type = 'paid' AND type = 'bought' AND NOT paid) OR (v_type = 'received' AND type = 'sent'))
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'KITCHEN_INVALID_MATCH' USING ERRCODE = '22023';
      END IF;
      SELECT v_cover_row.amount_paise - coalesce(sum(a.amount_paise), 0) INTO v_open
        FROM public.kitchen_allocations a WHERE a.covers_id = v_cover_row.id;
      IF v_cover_amt > v_open THEN
        RAISE EXCEPTION 'KITCHEN_INVALID_MATCH' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.kitchen_allocations (tenant_id, branch_id, payment_id, covers_id, amount_paise)
      VALUES (v_tenant, v_branch, v_entry.id, v_cover_row.id, v_cover_amt);
      v_covered := v_covered + v_cover_amt;
    END LOOP;
    IF v_covered > v_amount THEN
      RAISE EXCEPTION 'KITCHEN_INVALID_MATCH' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_entry;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_post_entry(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kitchen_post_entry(jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.kitchen_edit_entry(p_entry_id uuid, p jsonb)
 RETURNS kitchen_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old    public.kitchen_entries%ROWTYPE;
  v_new    public.kitchen_entries%ROWTYPE;
  v_covers jsonb := '[]'::jsonb;
  v_alloc  record;
  v_payload jsonb := p;
  v_preserve_category boolean := false;
  v_left   bigint;
  v_take   bigint;
BEGIN
  SELECT * INTO v_old FROM public.kitchen_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR NOT public.kitchen_can_use(v_old.tenant_id, v_old.branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- A voided entry is history; an edit never changes the kind of entry.
  IF v_old.voided_at IS NOT NULL OR coalesce(p->>'type', '') <> v_old.type THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Remember which payments covered this buy or send; the void drops them.
  SELECT coalesce(jsonb_agg(jsonb_build_object('payment_id', a.payment_id, 'amount_paise', a.amount_paise) ORDER BY a.created_at), '[]'::jsonb)
    INTO v_covers
    FROM public.kitchen_allocations a
   WHERE a.covers_id = v_old.id;

  IF v_old.type='bought' THEN
    v_preserve_category := NOT (p ? 'purchase_category_id')
      OR nullif(p->>'purchase_category_id','')::uuid IS NOT DISTINCT FROM v_old.purchase_category_id;
    IF v_preserve_category THEN
      v_payload := p || jsonb_build_object('purchase_category_id',NULL);
    END IF;
  END IF;
  PERFORM public.kitchen_void_entry(v_old.id, 'Edited');

  -- The corrected entry is posted exactly as a new one would be, in the old
  -- entry's branch whatever the payload says.
  v_new := public.kitchen_post_entry(v_payload || jsonb_build_object('branch_id', v_old.branch_id::text));

  UPDATE public.kitchen_entries SET replaces_id=v_old.id,
    purchase_category_id=CASE WHEN v_preserve_category THEN v_old.purchase_category_id ELSE v_new.purchase_category_id END,
    purchase_category_name=CASE WHEN v_preserve_category THEN v_old.purchase_category_name ELSE v_new.purchase_category_name END
  WHERE id=v_new.id AND tenant_id=v_old.tenant_id AND branch_id=v_old.branch_id RETURNING * INTO v_new;

  -- Payments that covered the old document cover the new one, oldest first,
  -- up to what the corrected amount allows. Anything beyond that becomes plain
  -- give-and-take again, which the balance already reflects.
  IF (v_new.type = 'bought' AND NOT v_new.paid) OR v_new.type = 'sent' THEN
    v_left := v_new.amount_paise;
    FOR v_alloc IN SELECT * FROM jsonb_to_recordset(v_covers) AS x(payment_id uuid, amount_paise bigint) LOOP
      EXIT WHEN v_left <= 0;
      v_take := least(v_alloc.amount_paise, v_left);
      INSERT INTO public.kitchen_allocations (tenant_id, branch_id, payment_id, covers_id, amount_paise)
      VALUES (v_old.tenant_id, v_old.branch_id, v_alloc.payment_id, v_new.id, v_take)
      ON CONFLICT (payment_id, covers_id) DO NOTHING;
      v_left := v_left - v_take;
    END LOOP;
  END IF;

  RETURN v_new;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_edit_entry(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.kitchen_edit_entry(uuid,jsonb) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
