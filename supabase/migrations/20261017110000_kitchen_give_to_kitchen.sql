-- Task 242: give raw materials to the kitchen.
-- The owner's flow: a raw material is bought into the store and given to the
-- kitchen; what the kitchen is given counts as used. A new entry type,
-- 'issued', has lines of raw materials and quantities (no price) and takes
-- them out of the store's stock (kitchen_items.stock). Voiding it puts them
-- back. A new permission, entries.issue, is added to every login that could
-- already record stock counts. Function bodies are as in
-- 20261012140100_kitchen_access_enforce.sql (the guard as in
-- 20261012140200_kitchen_access_flags.sql) with the 'issued' lines added.
-- Idempotent: safe to run twice.

ALTER TABLE public.kitchen_entries DROP CONSTRAINT IF EXISTS kitchen_entries_type_check;
ALTER TABLE public.kitchen_entries ADD CONSTRAINT kitchen_entries_type_check
  CHECK (type IN ('sent', 'received', 'bought', 'paid', 'spent', 'made', 'count', 'issued'));
ALTER TABLE public.kitchen_entries DROP CONSTRAINT IF EXISTS kitchen_entries_shape;
ALTER TABLE public.kitchen_entries ADD CONSTRAINT kitchen_entries_shape CHECK (
     (type IN ('sent', 'received', 'bought', 'paid') AND party_id IS NOT NULL AND item_id IS NULL)
  OR (type = 'spent' AND party_id IS NULL AND item_id IS NULL AND category IS NOT NULL)
  OR (type IN ('made', 'count') AND item_id IS NOT NULL AND party_id IS NULL AND qty IS NOT NULL)
  OR (type = 'issued' AND party_id IS NULL AND item_id IS NULL)
);

CREATE OR REPLACE FUNCTION public.kitchen_all_permissions()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY[
    'entries.send', 'entries.receive', 'entries.buy', 'entries.pay', 'entries.spend', 'entries.batch', 'entries.count', 'entries.backdate',
    'entries.issue',
    'fix.own', 'fix.any',
    'invoices.create', 'invoices.receive', 'invoices.cancel',
    'money.view', 'money.move', 'money.opening',
    'setup.items', 'setup.parties', 'setup.categories', 'setup.roster',
    'attendance.mark', 'reports.view', 'reports.export', 'amounts.view', 'audit.view'
  ]::text[];
$$;

-- Logins that could record stock counts may give raw materials to the kitchen.
UPDATE public.kitchen_staff_access
   SET permissions = permissions || ARRAY['entries.issue']::text[]
 WHERE 'entries.count' = ANY(permissions) AND NOT ('entries.issue' = ANY(permissions));

CREATE OR REPLACE FUNCTION public.kitchen_guard_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.created_by_id := auth.uid();
  SELECT nullif(btrim(s.name), '') INTO v_name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.tenant_id = NEW.tenant_id
    AND s.status = 'active' AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1;
  NEW.created_by := coalesce(v_name, NEW.created_by, 'Staff');
  -- The invoice flag allows exactly one entry, so it is cleared as it is read.
  IF coalesce(current_setting('kitchen.via', true), '') = 'invoice' THEN
    PERFORM set_config('kitchen.via', '', true);
  ELSE
    PERFORM public.kitchen_require(NEW.tenant_id, NEW.branch_id, CASE NEW.type
      WHEN 'sent' THEN 'entries.send' WHEN 'received' THEN 'entries.receive' WHEN 'bought' THEN 'entries.buy'
      WHEN 'paid' THEN 'entries.pay' WHEN 'spent' THEN 'entries.spend' WHEN 'made' THEN 'entries.batch'
      WHEN 'count' THEN 'entries.count' WHEN 'issued' THEN 'entries.issue' ELSE 'entries.unknown' END);
  END IF;
  IF NEW.entry_date > v_today THEN
    RAISE EXCEPTION 'KITCHEN_FUTURE_DATE' USING ERRCODE = '22023';
  END IF;
  IF NEW.entry_date < v_today AND NOT public.kitchen_can(NEW.tenant_id, NEW.branch_id, 'entries.backdate') THEN
    RAISE EXCEPTION 'KITCHEN_BACKDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_lock_check(NEW.tenant_id, NEW.branch_id, NEW.entry_date, 'entry', NEW.id, true);
  RETURN NEW;
END $$;

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
  IF v_type IS NULL OR v_type NOT IN ('sent', 'received', 'bought', 'paid', 'spent', 'made', 'count', 'issued') THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_mode IS NOT NULL AND v_mode NOT IN ('cash', 'upi', 'bank') THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('kitchen.posting', 'on', true);
  -- An owner's reason for changing a locked day, read by kitchen_lock_check.
  IF nullif(btrim(coalesce(p->>'lock_reason', '')), '') IS NOT NULL THEN
    PERFORM set_config('kitchen.lock_reason', left(btrim(p->>'lock_reason'), 200), true);
  END IF;

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
  IF v_type IN ('sent', 'made', 'count', 'issued') THEN
    v_paid := true;
    v_mode := NULL;
  END IF;
  IF v_type IN ('sent', 'bought', 'made', 'count', 'issued') THEN
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
  ELSIF v_type = 'issued' THEN
    -- Given to the kitchen: raw materials leave the store and count as used.
    IF p->'lines' IS NULL OR jsonb_typeof(p->'lines') <> 'array' THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
      v_line_item := nullif(v_line->>'item_id', '')::uuid;
      v_line_qty  := nullif(v_line->>'qty', '')::numeric;
      IF v_line_item IS NULL OR v_line_qty IS NULL OR v_line_qty <= 0 THEN
        RAISE EXCEPTION 'KITCHEN_INVALID_LINE' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_item_row FROM public.kitchen_items
       WHERE id = v_line_item AND tenant_id = v_tenant AND branch_id = v_branch AND is_active AND item_kind = 'raw_material'
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'KITCHEN_ITEM_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;
      INSERT INTO public.kitchen_entry_lines (tenant_id, branch_id, entry_id, item_id, qty, price_paise, line_paise)
      VALUES (v_tenant, v_branch, v_entry.id, v_line_item, v_line_qty, 0, 0);
      UPDATE public.kitchen_items SET stock = stock - v_line_qty WHERE id = v_line_item;
      v_count := v_count + 1;
    END LOOP;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
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

CREATE OR REPLACE FUNCTION public.kitchen_void_entry(p_entry_id uuid, p_reason text DEFAULT NULL)
RETURNS public.kitchen_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry public.kitchen_entries%ROWTYPE;
  v_line  record;
  v_by    text := coalesce(
            (SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active' AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1),
            'Staff');
BEGIN
  SELECT * INTO v_entry FROM public.kitchen_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR NOT public.kitchen_can_use(v_entry.tenant_id, v_entry.branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_entry.voided_at IS NOT NULL THEN
    RETURN v_entry;
  END IF;
  IF nullif(btrim(coalesce(current_setting('kitchen.lock_reason', true), '')), '') IS NULL AND coalesce(p_reason, '') <> 'Edited' THEN
    PERFORM set_config('kitchen.lock_reason', left(btrim(coalesce(p_reason, '')), 200), true);
  END IF;
  PERFORM set_config('kitchen.posting', 'on', true);

  IF v_entry.type IN ('sent', 'bought') THEN
    FOR v_line IN SELECT item_id, qty FROM public.kitchen_entry_lines WHERE entry_id = v_entry.id LOOP
      UPDATE public.kitchen_items
         SET stock = stock + CASE WHEN v_entry.type = 'sent' THEN v_line.qty ELSE -v_line.qty END
       WHERE id = v_line.item_id;
    END LOOP;
  ELSIF v_entry.type = 'issued' THEN
    FOR v_line IN SELECT item_id, qty FROM public.kitchen_entry_lines WHERE entry_id = v_entry.id LOOP
      UPDATE public.kitchen_items SET stock = stock + v_line.qty WHERE id = v_line.item_id;
    END LOOP;
  ELSIF v_entry.type = 'made' THEN
    UPDATE public.kitchen_items SET stock = stock - v_entry.qty WHERE id = v_entry.item_id;
  ELSIF v_entry.type = 'count' THEN
    UPDATE public.kitchen_items SET stock = coalesce(v_entry.from_qty, stock) WHERE id = v_entry.item_id;
  END IF;

  -- A voided payment no longer covers anything; a voided buy or send is no
  -- longer covered. Either way the money becomes plain give-and-take again.
  DELETE FROM public.kitchen_allocations WHERE payment_id = v_entry.id OR covers_id = v_entry.id;

  UPDATE public.kitchen_entries
     SET voided_at = now(), voided_by = v_by, void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = v_entry.id
  RETURNING * INTO v_entry;
  RETURN v_entry;
END;
$$;
