-- Task 321: a stock count can be for an earlier day. The kitchen counts its finished goods at the end
-- of the day and sometimes enters yesterday's count the next morning.
--
--   * A count is the stock by the end of its day. Saving one works out what the shelf held then (the
--     stock now less everything dated after that day, kitchen_stock_on), keeps that as the count's
--     "from" figure, and moves the stock by the difference, so whatever was recorded after that day
--     stays on top of what was counted. A count for today works exactly as before.
--   * Every stock change goes through kitchen_stock_shift. When the item has a count later in the day
--     order (a later date, or the same date recorded later), that count already saw the shelf: the
--     change moves the figure that count expected instead of the stock. So a send or batch entered
--     for a day before a count, or deleted later, no longer throws a counted figure off; and a count
--     entered for an earlier day between two counts only moves the later count's difference.
--   * Same-day order is the order of recording, so a count taken in the morning is still followed
--     by the day's sends, as before.
-- No table changes. Existing figures are unchanged.

CREATE OR REPLACE FUNCTION public.kitchen_stock_on(p_item uuid, p_date date)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT i.stock - coalesce((
    SELECT sum(x.change) FROM (
      SELECT e.qty AS change FROM public.kitchen_entries e
       WHERE e.item_id = p_item AND e.type = 'made' AND e.voided_at IS NULL AND e.entry_date > p_date
      UNION ALL
      SELECT coalesce(e.qty - e.from_qty, 0) FROM public.kitchen_entries e
       WHERE e.item_id = p_item AND e.type = 'count' AND e.voided_at IS NULL AND e.entry_date > p_date
      UNION ALL
      SELECT CASE WHEN e.type = 'bought' THEN l.qty ELSE -l.qty END
        FROM public.kitchen_entry_lines l JOIN public.kitchen_entries e ON e.id = l.entry_id
       WHERE l.item_id = p_item AND e.type IN ('bought', 'sent', 'issued') AND e.voided_at IS NULL AND e.entry_date > p_date
    ) x), 0)
  FROM public.kitchen_items i
  WHERE i.id = p_item;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_stock_shift(p_item uuid, p_date date, p_change numeric, p_after timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next uuid;
BEGIN
  IF p_item IS NULL OR coalesce(p_change, 0) = 0 THEN
    RETURN;
  END IF;
  SELECT e.id INTO v_next FROM public.kitchen_entries e
   WHERE e.item_id = p_item AND e.type = 'count' AND e.voided_at IS NULL
     AND (e.entry_date > p_date OR (p_after IS NOT NULL AND e.entry_date = p_date AND e.created_at > p_after))
   ORDER BY e.entry_date, e.created_at
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    UPDATE public.kitchen_entries SET from_qty = coalesce(from_qty, qty) + p_change WHERE id = v_next;
  ELSE
    UPDATE public.kitchen_items SET stock = stock + p_change WHERE id = p_item;
  END IF;
END;
$$;

-- Only the kitchen's own functions use these; they read and move any item's stock.
REVOKE ALL ON FUNCTION public.kitchen_stock_on(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_stock_shift(uuid, date, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_stock_on(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.kitchen_stock_shift(uuid, date, numeric, timestamptz) TO service_role;

-- As in 20261116100000_kitchen_pending_dues.sql, with stock moved through kitchen_stock_shift and a count
-- checked against the stock by the end of its day.
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
  v_expected  numeric;
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
  -- Task 279: a Spent entry names its particular, which belongs to a category or sub-category.
  v_particular uuid;
  v_particular_name text;
  v_category_id uuid;
  v_category_row public.kitchen_purchase_categories%ROWTYPE;
  v_parent_row public.kitchen_purchase_categories%ROWTYPE;
  v_subcategory text;
  v_asks      text;
  v_unit      text;
  v_route_party uuid;
  v_route_dir text;
  v_roster    uuid;
BEGIN
  IF v_tenant IS NULL OR v_branch IS NULL OR NOT public.kitchen_can_use(v_tenant, v_branch) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('sent', 'received', 'bought', 'paid', 'spent', 'made', 'count', 'issued', 'carried') THEN
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

  -- Task 313: Pending from earlier names a branch or a vendor; a Pay later expense names its vendor.
  IF v_type IN ('sent', 'received', 'bought', 'paid', 'carried') OR (v_type = 'spent' AND NOT v_paid) THEN
    SELECT * INTO v_party_row FROM public.kitchen_parties
     WHERE id = v_party AND tenant_id = v_tenant AND branch_id = v_branch AND is_active
     FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'KITCHEN_PARTY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF (v_type IN ('sent', 'received') AND v_party_row.kind <> 'branch')
       OR (v_type IN ('bought', 'paid', 'spent') AND v_party_row.kind <> 'vendor') THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_party := NULL;
  END IF;

  IF v_type = 'spent' AND (p ? 'particular_name' OR p ? 'particular_id') THEN
    v_particular := nullif(p->>'particular_id', '')::uuid;
    v_particular_name := nullif(btrim(coalesce(p->>'particular_name', '')), '');
    v_category_id := nullif(p->>'category_id', '')::uuid;
    IF v_particular IS NOT NULL THEN
      SELECT name, coalesce(v_category_id, category_id) INTO v_particular_name, v_category_id
        FROM public.kitchen_particulars
       WHERE id = v_particular AND tenant_id = v_tenant AND branch_id = v_branch AND is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'KITCHEN_PARTICULAR_NOT_FOUND' USING ERRCODE = 'P0002';
      END IF;
    END IF;
    IF v_particular_name IS NULL OR length(v_particular_name) > 80 OR v_category_id IS NULL THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_category_row FROM public.kitchen_purchase_categories
     WHERE id = v_category_id AND tenant_id = v_tenant AND branch_id = v_branch AND is_active FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'KITCHEN_CATEGORY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_category_row.parent_id IS NOT NULL THEN
      SELECT * INTO v_parent_row FROM public.kitchen_purchase_categories
       WHERE id = v_category_row.parent_id AND tenant_id = v_tenant AND branch_id = v_branch;
      v_category := left(coalesce(v_parent_row.name, v_category_row.name), 40);
      v_subcategory := v_category_row.name;
      v_asks := coalesce(v_category_row.asks, v_parent_row.asks);
    ELSE
      v_category := left(v_category_row.name, 40);
      v_asks := v_category_row.asks;
    END IF;
    -- A particular typed for the first time is kept, under this category, for next time.
    IF v_particular IS NULL THEN
      SELECT id INTO v_particular FROM public.kitchen_particulars
       WHERE tenant_id = v_tenant AND branch_id = v_branch AND is_active AND lower(btrim(name)) = lower(v_particular_name);
      IF NOT FOUND THEN
        INSERT INTO public.kitchen_particulars (tenant_id, branch_id, name, category_id)
        VALUES (v_tenant, v_branch, v_particular_name, v_category_id)
        RETURNING id INTO v_particular;
      END IF;
    END IF;
    -- The particular is what the entry was for; it stands where the note used to.
    v_note := v_particular_name;
    v_qty := nullif(p->>'qty', '')::numeric;
    v_unit := nullif(p->>'qty_unit', '');
    IF v_qty IS NOT NULL AND (v_qty <= 0 OR v_unit IS NULL OR v_unit NOT IN ('kg', 'L', 'pcs')) THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    IF v_qty IS NULL THEN v_unit := NULL; END IF;
    IF v_asks = 'route' THEN
      v_route_party := nullif(p->>'route_party_id', '')::uuid;
      v_route_dir := nullif(p->>'route_dir', '');
      IF v_route_party IS NULL OR v_route_dir IS NULL OR v_route_dir NOT IN ('from', 'to') OR NOT EXISTS (
        SELECT 1 FROM public.kitchen_parties
         WHERE id = v_route_party AND tenant_id = v_tenant AND branch_id = v_branch AND kind = 'branch' AND is_active) THEN
        RAISE EXCEPTION 'KITCHEN_ROUTE_REQUIRED' USING ERRCODE = '22023';
      END IF;
    ELSIF v_asks = 'person' THEN
      v_roster := nullif(p->>'roster_id', '')::uuid;
      IF v_roster IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.kitchen_staff_roster
         WHERE id = v_roster AND tenant_id = v_tenant AND branch_id = v_branch AND is_active) THEN
        RAISE EXCEPTION 'KITCHEN_PERSON_REQUIRED' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF v_type = 'spent' THEN
    v_qty := NULL;
  END IF;

  IF v_type IN ('received', 'paid') OR (v_type = 'spent' AND v_paid) THEN
    IF v_amount <= 0 OR v_mode IS NULL THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    v_paid := true;
  END IF;
  -- Task 313: an expense to pay later moves no money yet; it sits with its vendor.
  IF v_type = 'spent' AND NOT v_paid THEN
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    v_mode := NULL;
  END IF;
  IF v_type = 'spent' AND v_category IS NULL THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;
  -- Task 313: Pending from earlier is an amount owed as of a date: no items, no money moved.
  IF v_type = 'carried' THEN
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
    v_paid := false;
    v_mode := NULL;
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
    -- Task 321: a count is the stock by the end of its day, so it is checked against what the
    -- shelf held then: the stock now less everything dated after it.
    IF v_type = 'count' THEN
      v_expected := public.kitchen_stock_on(v_item, v_date);
    END IF;
  ELSE
    v_item := NULL;
    -- Task 279: a Spent entry may carry a quantity; nothing else outside made/count does.
    IF v_type <> 'spent' THEN v_qty := NULL; END IF;
  END IF;

  INSERT INTO public.kitchen_entries
    (tenant_id, branch_id, type, entry_date, party_id, item_id, qty, from_qty, amount_paise, paid, mode, category, note, created_by, purchase_category_id, purchase_category_name,
     particular_id, category_id, subcategory, qty_unit, route_party_id, route_dir, roster_id)
  VALUES
    (v_tenant, v_branch, v_type, v_date, v_party, v_item, v_qty,
     CASE WHEN v_type = 'count' THEN v_expected END,
     v_amount, v_paid, v_mode, v_category, v_note, v_by, v_purchase_category, v_purchase_name,
     v_particular, CASE WHEN v_particular IS NOT NULL THEN v_category_id END, v_subcategory, v_unit, v_route_party, v_route_dir, v_roster)
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
      PERFORM public.kitchen_stock_shift(v_line_item, v_date, CASE WHEN v_type = 'bought' THEN v_line_qty ELSE -v_line_qty END);
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
      PERFORM public.kitchen_stock_shift(v_line_item, v_date, -v_line_qty);
      v_count := v_count + 1;
    END LOOP;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
    END IF;
  ELSIF v_type = 'made' THEN
    PERFORM public.kitchen_stock_shift(v_item, v_date, v_qty);
  ELSIF v_type = 'count' THEN
    PERFORM public.kitchen_stock_shift(v_item, v_date, v_qty - v_expected);
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
         AND ((v_type = 'paid' AND ((type IN ('bought', 'spent') AND NOT paid) OR type = 'carried'))
           OR (v_type = 'received' AND type IN ('sent', 'carried')))
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
REVOKE ALL ON FUNCTION public.kitchen_post_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_post_entry(jsonb) TO authenticated, service_role;

-- As in 20261106110000_kitchen_delete_count_keeps_moves.sql, with stock moved through kitchen_stock_shift.
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
      PERFORM public.kitchen_stock_shift(v_line.item_id, v_entry.entry_date, CASE WHEN v_entry.type = 'sent' THEN v_line.qty ELSE -v_line.qty END, v_entry.created_at);
    END LOOP;
  ELSIF v_entry.type = 'issued' THEN
    FOR v_line IN SELECT item_id, qty FROM public.kitchen_entry_lines WHERE entry_id = v_entry.id LOOP
      PERFORM public.kitchen_stock_shift(v_line.item_id, v_entry.entry_date, v_line.qty, v_entry.created_at);
    END LOOP;
  ELSIF v_entry.type = 'made' THEN
    PERFORM public.kitchen_stock_shift(v_entry.item_id, v_entry.entry_date, -v_entry.qty, v_entry.created_at);
  ELSIF v_entry.type = 'count' THEN
    -- Task 307: take back only what this count changed, so what moved after it stays.
    PERFORM public.kitchen_stock_shift(v_entry.item_id, v_entry.entry_date, coalesce(v_entry.from_qty - v_entry.qty, 0), v_entry.created_at);
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

REVOKE ALL ON FUNCTION public.kitchen_void_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_void_entry(uuid, text) TO authenticated;
