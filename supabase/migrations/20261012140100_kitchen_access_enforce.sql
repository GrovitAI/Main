-- Task 202: enforce kitchen permissions and day locks (helpers in 20261012140000).
-- Every write path checks the caller's permission in the database, not only
-- in the app: the saving functions, the entry triggers, and the policies on
-- the tables the app writes directly. Dated changes stop on a locked day
-- unless the owner gives a reason, which is logged. Entries record who made
-- them from the signed-in staff row. Function bodies are as in the files
-- noted against each, with the permission and lock lines added.
-- Idempotent: safe to run twice.

ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS created_by_id uuid;

-- New entries: who made them, the permission for their kind, today or an
-- allowed earlier day (never later), and not on a locked day. An invoice
-- payment is allowed by invoices.receive, checked by kitchen_invoice_action.
CREATE OR REPLACE FUNCTION public.kitchen_guard_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.created_by_id := auth.uid();
  SELECT nullif(btrim(s.name), '') INTO v_name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.tenant_id = NEW.tenant_id
    AND s.status = 'active' AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1;
  NEW.created_by := coalesce(v_name, NEW.created_by, 'Staff');
  IF coalesce(current_setting('kitchen.via', true), '') <> 'invoice' THEN
    PERFORM public.kitchen_require(NEW.tenant_id, NEW.branch_id, CASE NEW.type
      WHEN 'sent' THEN 'entries.send' WHEN 'received' THEN 'entries.receive' WHEN 'bought' THEN 'entries.buy'
      WHEN 'paid' THEN 'entries.pay' WHEN 'spent' THEN 'entries.spend' WHEN 'made' THEN 'entries.batch'
      WHEN 'count' THEN 'entries.count' ELSE 'entries.unknown' END);
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
REVOKE ALL ON FUNCTION public.kitchen_guard_entry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_guard_entry() TO service_role;
DROP TRIGGER IF EXISTS kitchen_guard_entry ON public.kitchen_entries;
CREATE TRIGGER kitchen_guard_entry BEFORE INSERT ON public.kitchen_entries
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_guard_entry();

-- Voiding (and so editing): anyone's with fix.any, one's own on the day it
-- was made with fix.own; never on a locked day without the owner's reason.
CREATE OR REPLACE FUNCTION public.kitchen_guard_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF auth.uid() IS NULL OR OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL THEN RETURN NEW; END IF;
  IF NOT (public.kitchen_can(OLD.tenant_id, OLD.branch_id, 'fix.any')
    OR (public.kitchen_can(OLD.tenant_id, OLD.branch_id, 'fix.own') AND OLD.created_by_id = auth.uid()
        AND (OLD.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today)) THEN
    RAISE EXCEPTION 'KITCHEN_NOT_ALLOWED' USING ERRCODE = '42501', DETAIL = 'fix';
  END IF;
  PERFORM public.kitchen_lock_check(OLD.tenant_id, OLD.branch_id, OLD.entry_date, 'entry', OLD.id, true);
  PERFORM public.kitchen_audit(OLD.tenant_id, OLD.branch_id,
    CASE WHEN coalesce(current_setting('kitchen.via', true), '') = 'edit' THEN 'entry_edited' ELSE 'entry_voided' END,
    'entry', OLD.id, OLD.entry_date, NEW.void_reason,
    jsonb_build_object('type', OLD.type, 'amount_paise', OLD.amount_paise, 'created_by', OLD.created_by));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_guard_void() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_guard_void() TO service_role;
DROP TRIGGER IF EXISTS kitchen_guard_void ON public.kitchen_entries;
CREATE TRIGGER kitchen_guard_void BEFORE UPDATE OF voided_at ON public.kitchen_entries
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_guard_void();

-- kitchen_post_entry: as in 20261008061518_kitchen_purchase_categories.sql, plus the lock reason.
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

-- kitchen_edit_entry: as in 20261008061518_kitchen_purchase_categories.sql, marking the void as an edit.
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
  PERFORM set_config('kitchen.via', 'edit', true);
  -- An owner's reason for changing a locked day, read by kitchen_lock_check.
  IF nullif(btrim(coalesce(p->>'lock_reason', '')), '') IS NOT NULL THEN
    PERFORM set_config('kitchen.lock_reason', left(btrim(p->>'lock_reason'), 200), true);
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

-- kitchen_void_entry: as in 20261004000100_central_kitchen.sql; its reason is also the locked-day reason.
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

-- kitchen_create_invoice: as in 20261011170000_kitchen_invoice_numbers.sql, needing invoices.create.
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

-- kitchen_invoice_action: as in 20261011143000_kitchen_invoice_payment_oldest_first.sql,
-- needing invoices.receive or invoices.cancel, with a locked-day reason. A new
-- last parameter changes the signature, so the old one is dropped first; calls
-- by name without it still work.
DROP FUNCTION IF EXISTS public.kitchen_invoice_action(uuid, uuid, uuid, text, bigint, date, text, text, text);
CREATE OR REPLACE FUNCTION public.kitchen_invoice_action(p_tenant_id uuid, p_branch_id uuid, p_invoice_id uuid,
  p_action text, p_amount_paise bigint DEFAULT NULL, p_date date DEFAULT NULL, p_mode text DEFAULT NULL, p_note text DEFAULT NULL, p_request_key text DEFAULT NULL,
  p_lock_reason text DEFAULT NULL)
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
  IF p_action = 'receive' THEN PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'invoices.receive');
  ELSIF p_action = 'cancel' THEN PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'invoices.cancel');
  END IF;
  IF nullif(btrim(coalesce(p_lock_reason, '')), '') IS NOT NULL THEN
    PERFORM set_config('kitchen.lock_reason', left(btrim(p_lock_reason), 200), true);
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
    -- An invoice issued on a locked day is cancelled only by the owner, with a reason (the note).
    IF nullif(btrim(coalesce(current_setting('kitchen.lock_reason', true), '')), '') IS NULL THEN
      PERFORM set_config('kitchen.lock_reason', left(btrim(p_note), 200), true);
    END IF;
    PERFORM public.kitchen_lock_check(p_tenant_id, p_branch_id, (v_invoice.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'invoice', p_invoice_id, true);
    PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'invoice_cancelled', 'invoice', p_invoice_id,
      (v_invoice.created_at AT TIME ZONE 'Asia/Kolkata')::date, btrim(p_note), jsonb_build_object('invoice_no', v_invoice.invoice_no, 'total_paise', v_invoice.total_paise));
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
  -- The payment entry is allowed by invoices.receive, checked above.
  PERFORM set_config('kitchen.via', 'invoice', true);
  v_payment := public.kitchen_post_entry(jsonb_build_object('type', 'received', 'branch_id', p_branch_id,
    'party_id', v_invoice.party_id, 'entry_date', p_date, 'amount_paise', p_amount_paise,
    'mode', p_mode, 'note', nullif(btrim(coalesce(p_note, '')), ''), 'covers', v_covers));
  INSERT INTO public.kitchen_invoice_payments(tenant_id, branch_id, invoice_id, request_key, payment_id)
    VALUES(p_tenant_id, p_branch_id, p_invoice_id, p_request_key, v_payment.id);
  RETURN v_payment.id;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_invoice_action(uuid, uuid, uuid, text, bigint, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_invoice_action(uuid, uuid, uuid, text, bigint, date, text, text, text, text) TO authenticated;

-- kitchen_invoice_workspace: as in 20261011071731_kitchen_branch_invoices.sql, needing an invoice permission.
CREATE OR REPLACE FUNCTION public.kitchen_invoice_workspace(p_tenant_id uuid, p_branch_id uuid,
  p_start_date date, p_end_date date, p_party_id uuid DEFAULT NULL, p_page integer DEFAULT 0,
  p_candidates boolean DEFAULT false, p_invoice_id uuid DEFAULT NULL)
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
    OR p_end_date > (now() AT TIME ZONE 'Asia/Kolkata')::date OR p_page IS NULL OR p_page NOT BETWEEN 0 AND 100000 THEN
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
    SELECT count(*) INTO v_count FROM public.kitchen_invoices WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
      AND start_date <= p_end_date AND end_date >= p_start_date AND (p_party_id IS NULL OR party_id = p_party_id);
    SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC, i.id), '[]'::jsonb) INTO v_rows FROM (
      SELECT * FROM public.kitchen_invoice_totals WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
        AND start_date <= p_end_date AND end_date >= p_start_date AND (p_party_id IS NULL OR party_id = p_party_id)
      ORDER BY created_at DESC, id LIMIT 50 OFFSET p_page * 50) i;
  END IF;
  RETURN jsonb_build_object('rows', v_rows, 'total_rows', v_count, 'branches', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', id, 'label', name) ORDER BY name)
    FROM public.kitchen_parties WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND kind = 'branch'), '[]'::jsonb));
END $$;

-- kitchen_money_summary: as in 20261011170100_kitchen_cash_bank.sql, needing money.view.
CREATE OR REPLACE FUNCTION public.kitchen_money_summary(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_open public.kitchen_money_openings%ROWTYPE; v_has boolean; v_from date;
  v_cash_in bigint; v_cash_out bigint; v_bank_in bigint; v_bank_out bigint; v_to_bank bigint; v_to_cash bigint;
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

-- kitchen_set_money_opening: as in 20261011170100_kitchen_cash_bank.sql, needing money.opening, and logged.
CREATE OR REPLACE FUNCTION public.kitchen_set_money_opening(p_tenant_id uuid, p_branch_id uuid, p_as_of date, p_cash_paise bigint, p_bank_paise bigint)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_by text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'money.opening');
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
  PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'opening_set', 'money', NULL, p_as_of, NULL,
    jsonb_build_object('cash_paise', p_cash_paise, 'bank_paise', p_bank_paise));
  RETURN p_as_of;
END $$;

-- kitchen_move_money: as in 20261011170100_kitchen_cash_bank.sql, needing money.move, stopped on a locked
-- day without the owner's reason, and logged. A new last parameter changes the
-- signature, so the old one is dropped first.
DROP FUNCTION IF EXISTS public.kitchen_move_money(uuid, uuid, date, text, text, bigint, text, text);
CREATE OR REPLACE FUNCTION public.kitchen_move_money(p_tenant_id uuid, p_branch_id uuid, p_move_date date,
  p_from text, p_to text, p_amount_paise bigint, p_note text, p_request_key text, p_lock_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_existing public.kitchen_money_moves%ROWTYPE; v_id uuid; v_by text; v_note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'money.move');
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
  IF nullif(btrim(coalesce(p_lock_reason, '')), '') IS NOT NULL THEN
    PERFORM set_config('kitchen.lock_reason', left(btrim(p_lock_reason), 200), true);
  END IF;
  PERFORM public.kitchen_lock_check(p_tenant_id, p_branch_id, p_move_date, 'money_move', NULL, true);
  v_by := coalesce((SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Staff');
  INSERT INTO public.kitchen_money_moves(tenant_id, branch_id, move_date, from_account, to_account, amount_paise, note, request_key, created_by)
  VALUES (p_tenant_id, p_branch_id, p_move_date, p_from, p_to, p_amount_paise, v_note, p_request_key, v_by)
  RETURNING id INTO v_id;
  PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'money_moved', 'money_move', v_id, p_move_date, v_note,
    jsonb_build_object('from', p_from, 'to', p_to, 'amount_paise', p_amount_paise));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_move_money(uuid, uuid, date, text, text, bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_move_money(uuid, uuid, date, text, text, bigint, text, text, text) TO authenticated;

-- kitchen_void_money_move: as in 20261011170100_kitchen_cash_bank.sql, needing money.move, stopped on a
-- locked day without the owner's reason, and logged.
DROP FUNCTION IF EXISTS public.kitchen_void_money_move(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.kitchen_void_money_move(p_tenant_id uuid, p_branch_id uuid, p_move_id uuid, p_lock_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_by text; v_move public.kitchen_money_moves%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'money.move');
  SELECT * INTO v_move FROM public.kitchen_money_moves WHERE id = p_move_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id;
  IF FOUND AND v_move.voided_at IS NULL THEN
    IF nullif(btrim(coalesce(p_lock_reason, '')), '') IS NOT NULL THEN
      PERFORM set_config('kitchen.lock_reason', left(btrim(p_lock_reason), 200), true);
    END IF;
    PERFORM public.kitchen_lock_check(p_tenant_id, p_branch_id, v_move.move_date, 'money_move', p_move_id, true);
    PERFORM public.kitchen_audit(p_tenant_id, p_branch_id, 'money_move_voided', 'money_move', p_move_id, v_move.move_date, p_lock_reason,
      jsonb_build_object('from', v_move.from_account, 'to', v_move.to_account, 'amount_paise', v_move.amount_paise));
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
REVOKE ALL ON FUNCTION public.kitchen_void_money_move(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_void_money_move(uuid, uuid, uuid, text) TO authenticated;

-- kitchen_range_report: as in 20261008152218_kitchen_report_date_range.sql, needing reports.view (and reports.export to export).
CREATE OR REPLACE FUNCTION public.kitchen_range_report(
 p_tenant_id uuid,p_branch_id uuid,p_start_date date,p_end_date date,p_report text,
 p_party_id uuid DEFAULT NULL,p_item_id uuid DEFAULT NULL,p_category text DEFAULT NULL,
 p_include_expenses boolean DEFAULT false,p_detail boolean DEFAULT false,
 p_offset integer DEFAULT 0,p_limit integer DEFAULT 50,p_export boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public
AS $report$
DECLARE result jsonb;
BEGIN
 IF public.kitchen_can_use(p_tenant_id,p_branch_id) IS NOT TRUE THEN
   RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM public.kitchen_require(p_tenant_id,p_branch_id,'reports.view');
 IF p_export THEN PERFORM public.kitchen_require(p_tenant_id,p_branch_id,'reports.export'); END IF;
 IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR p_report NOT IN ('sales','purchases','cash')
   OR p_report IS NULL OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE='22023';
 END IF;
 WITH range_entries AS MATERIALIZED (
   SELECT e.*,coalesce(p.name,'Other expense') AS party_name
   FROM public.kitchen_entries e
   LEFT JOIN public.kitchen_parties p ON p.id=e.party_id AND p.tenant_id=p_tenant_id AND p.branch_id=p_branch_id
   WHERE e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id AND e.voided_at IS NULL
     AND e.entry_date>=p_start_date AND e.entry_date<=p_end_date
 ), sale_lines AS MATERIALIZED (
   SELECT e.id AS entry_id,e.entry_date,e.party_id,e.party_name,l.id AS line_id,l.item_id,
     i.name AS item_name,i.unit,l.qty,l.price_paise,l.line_paise
   FROM range_entries e
   JOIN public.kitchen_entry_lines l ON l.entry_id=e.id AND l.tenant_id=p_tenant_id AND l.branch_id=p_branch_id
   JOIN public.kitchen_items i ON i.id=l.item_id AND i.tenant_id=p_tenant_id AND i.branch_id=p_branch_id
   WHERE e.type='sent'
 ), filtered_sales AS (
   SELECT * FROM sale_lines WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_item_id IS NULL OR item_id=p_item_id)
 ), spending AS MATERIALIZED (
   SELECT e.*,CASE WHEN e.type='bought' THEN coalesce(e.purchase_category_name,'Uncategorized') ELSE e.category END AS category_name,
     CASE WHEN e.type='bought' THEN 'Purchase' ELSE 'Other expense' END AS source_name
   FROM range_entries e WHERE e.type='bought' OR (p_include_expenses AND e.type='spent')
 ), filtered_spending AS (
   SELECT * FROM spending WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_category IS NULL OR category_name=p_category)
 ), cash_entries AS (
   SELECT e.* FROM range_entries e
   WHERE (e.type IN ('received','paid','spent') OR (e.type='bought' AND e.paid))
     AND (p_party_id IS NULL OR e.party_id=p_party_id)
 ), report_rows AS (
   SELECT party_id::text||':'||item_id::text AS key,'sale'::text AS kind,NULL::uuid AS entry_id,NULL::date AS date,
     party_id,party_name AS party,item_id,item_name AS item,unit,sum(qty) AS quantity,
     NULL::bigint AS price_paise,sum(line_paise)::bigint AS amount_paise,
     count(DISTINCT entry_id)::integer AS documents,NULL::text AS category,'Goods supplied'::text AS source,
     NULL::text AS payment,NULL::text AS mode,0::bigint AS money_in_paise,0::bigint AS money_out_paise
   FROM filtered_sales WHERE p_report='sales' AND NOT (p_detail OR p_export)
   GROUP BY party_id,party_name,item_id,item_name,unit
   UNION ALL
   SELECT line_id::text,'entry',entry_id,entry_date,party_id,party_name,item_id,item_name,unit,qty,price_paise,line_paise,
     1,NULL,'Goods supplied',NULL,NULL,0,0 FROM filtered_sales WHERE p_report='sales' AND (p_detail OR p_export)
   UNION ALL
   SELECT category_name,'category',NULL,NULL,NULL,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,NULL,NULL,NULL,
     sum(amount_paise)::bigint,count(*)::integer,category_name,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,0,0
   FROM filtered_spending WHERE p_report='purchases' AND NOT (p_detail OR p_export)
   GROUP BY category_name
   UNION ALL
   SELECT id::text,'entry',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,category_name,source_name,
     CASE WHEN type='spent' OR paid THEN 'Paid on entry' ELSE 'Pay later on entry' END,mode,0,0
   FROM filtered_spending WHERE p_report='purchases' AND (p_detail OR p_export)
   UNION ALL
   SELECT id::text,'cash',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,
     coalesce(purchase_category_name,category),
     CASE type WHEN 'received' THEN 'Branch collection' WHEN 'paid' THEN 'Vendor payment'
       WHEN 'bought' THEN 'Purchase paid on entry' ELSE 'Other expense' END,
     NULL,mode,CASE WHEN type='received' THEN amount_paise ELSE 0 END,
     CASE WHEN type<>'received' THEN amount_paise ELSE 0 END
   FROM cash_entries WHERE p_report='cash'
 ), ordered AS (
   SELECT r.*,row_number() OVER(ORDER BY r.date DESC NULLS LAST,r.amount_paise DESC,r.party,r.item,r.key) AS position
   FROM report_rows r
 ), paged AS (
   SELECT * FROM ordered WHERE (p_export AND position<=10000) OR (NOT p_export AND position>p_offset AND position<=p_offset+p_limit)
 )
 SELECT jsonb_build_object(
   'summary',jsonb_build_object(
     'sales_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='sent'),0),
     'purchases_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='bought'),0),
     'expenses_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='spent'),0),
     'cash_in_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='received'),0),
     'cash_out_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type IN ('paid','spent') OR (type='bought' AND paid)),0)
   ),
   'total_rows',(SELECT count(*) FROM report_rows),
   'filtered_paise',coalesce((SELECT sum(amount_paise) FROM report_rows),0),
   'filtered_in_paise',coalesce((SELECT sum(money_in_paise) FROM report_rows),0),
   'filtered_out_paise',coalesce((SELECT sum(money_out_paise) FROM report_rows),0),
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(r)-'position' ORDER BY position) FROM paged r),'[]'::jsonb),
   'options',jsonb_build_object(
     'branches',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM sale_lines) o),'[]'::jsonb),
     'items',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT item_id AS id,item_name AS label FROM sale_lines) o),'[]'::jsonb),
     'vendors',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM spending WHERE type='bought') o),'[]'::jsonb),
     'categories',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT category_name AS id,category_name AS label FROM spending) o),'[]'::jsonb)
   )
 ) INTO result;
 IF p_export AND (result->>'total_rows')::bigint>10000 THEN
   RAISE EXCEPTION 'KITCHEN_EXPORT_TOO_LARGE' USING ERRCODE='22023';
 END IF;
 RETURN result;
END
$report$;

-- kitchen_monthly_report: as in 20261008065451_kitchen_spending_category_totals.sql, the same.
CREATE OR REPLACE FUNCTION public.kitchen_monthly_report(
 p_tenant_id uuid,p_branch_id uuid,p_month date,p_report text,
 p_party_id uuid DEFAULT NULL,p_item_id uuid DEFAULT NULL,p_category text DEFAULT NULL,
 p_include_expenses boolean DEFAULT false,p_detail boolean DEFAULT false,
 p_offset integer DEFAULT 0,p_limit integer DEFAULT 50,p_export boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public
AS $report$
DECLARE result jsonb;
BEGIN
 IF public.kitchen_can_use(p_tenant_id,p_branch_id) IS NOT TRUE THEN
   RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM public.kitchen_require(p_tenant_id,p_branch_id,'reports.view');
 IF p_export THEN PERFORM public.kitchen_require(p_tenant_id,p_branch_id,'reports.export'); END IF;
 IF p_month IS NULL OR p_month<>date_trunc('month',p_month)::date OR p_report NOT IN ('sales','purchases','cash')
   OR p_report IS NULL OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE='22023';
 END IF;
 WITH month_entries AS MATERIALIZED (
   SELECT e.*,coalesce(p.name,'Other expense') AS party_name
   FROM public.kitchen_entries e
   LEFT JOIN public.kitchen_parties p ON p.id=e.party_id AND p.tenant_id=p_tenant_id AND p.branch_id=p_branch_id
   WHERE e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id AND e.voided_at IS NULL
     AND e.entry_date>=p_month AND e.entry_date<(p_month+interval '1 month')::date
     AND (p_month<>date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date
          OR e.entry_date<=(now() AT TIME ZONE 'Asia/Kolkata')::date)
 ), sale_lines AS MATERIALIZED (
   SELECT e.id AS entry_id,e.entry_date,e.party_id,e.party_name,l.id AS line_id,l.item_id,
     i.name AS item_name,i.unit,l.qty,l.price_paise,l.line_paise
   FROM month_entries e
   JOIN public.kitchen_entry_lines l ON l.entry_id=e.id AND l.tenant_id=p_tenant_id AND l.branch_id=p_branch_id
   JOIN public.kitchen_items i ON i.id=l.item_id AND i.tenant_id=p_tenant_id AND i.branch_id=p_branch_id
   WHERE e.type='sent'
 ), filtered_sales AS (
   SELECT * FROM sale_lines WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_item_id IS NULL OR item_id=p_item_id)
 ), spending AS MATERIALIZED (
   SELECT e.*,CASE WHEN e.type='bought' THEN coalesce(e.purchase_category_name,'Uncategorized') ELSE e.category END AS category_name,
     CASE WHEN e.type='bought' THEN 'Purchase' ELSE 'Other expense' END AS source_name
   FROM month_entries e WHERE e.type='bought' OR (p_include_expenses AND e.type='spent')
 ), filtered_spending AS (
   SELECT * FROM spending WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_category IS NULL OR category_name=p_category)
 ), cash_entries AS (
   SELECT e.* FROM month_entries e
   WHERE (e.type IN ('received','paid','spent') OR (e.type='bought' AND e.paid))
     AND (p_party_id IS NULL OR e.party_id=p_party_id)
 ), report_rows AS (
   SELECT party_id::text||':'||item_id::text AS key,'sale'::text AS kind,NULL::uuid AS entry_id,NULL::date AS date,
     party_id,party_name AS party,item_id,item_name AS item,unit,sum(qty) AS quantity,
     NULL::bigint AS price_paise,sum(line_paise)::bigint AS amount_paise,
     count(DISTINCT entry_id)::integer AS documents,NULL::text AS category,'Goods supplied'::text AS source,
     NULL::text AS payment,NULL::text AS mode,0::bigint AS money_in_paise,0::bigint AS money_out_paise
   FROM filtered_sales WHERE p_report='sales' AND NOT (p_detail OR p_export)
   GROUP BY party_id,party_name,item_id,item_name,unit
   UNION ALL
   SELECT line_id::text,'entry',entry_id,entry_date,party_id,party_name,item_id,item_name,unit,qty,price_paise,line_paise,
     1,NULL,'Goods supplied',NULL,NULL,0,0 FROM filtered_sales WHERE p_report='sales' AND (p_detail OR p_export)
   UNION ALL
   SELECT category_name,'category',NULL,NULL,NULL,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,NULL,NULL,NULL,
     sum(amount_paise)::bigint,count(*)::integer,category_name,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,0,0
   FROM filtered_spending WHERE p_report='purchases' AND NOT (p_detail OR p_export)
   GROUP BY category_name
   UNION ALL
   SELECT id::text,'entry',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,category_name,source_name,
     CASE WHEN type='spent' OR paid THEN 'Paid on entry' ELSE 'Pay later on entry' END,mode,0,0
   FROM filtered_spending WHERE p_report='purchases' AND (p_detail OR p_export)
   UNION ALL
   SELECT id::text,'cash',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,
     coalesce(purchase_category_name,category),
     CASE type WHEN 'received' THEN 'Branch collection' WHEN 'paid' THEN 'Vendor payment'
       WHEN 'bought' THEN 'Purchase paid on entry' ELSE 'Other expense' END,
     NULL,mode,CASE WHEN type='received' THEN amount_paise ELSE 0 END,
     CASE WHEN type<>'received' THEN amount_paise ELSE 0 END
   FROM cash_entries WHERE p_report='cash'
 ), ordered AS (
   SELECT r.*,row_number() OVER(ORDER BY r.date DESC NULLS LAST,r.amount_paise DESC,r.party,r.item,r.key) AS position
   FROM report_rows r
 ), paged AS (
   SELECT * FROM ordered WHERE (p_export AND position<=10000) OR (NOT p_export AND position>p_offset AND position<=p_offset+p_limit)
 )
 SELECT jsonb_build_object(
   'summary',jsonb_build_object(
     'sales_paise',coalesce((SELECT sum(amount_paise) FROM month_entries WHERE type='sent'),0),
     'purchases_paise',coalesce((SELECT sum(amount_paise) FROM month_entries WHERE type='bought'),0),
     'expenses_paise',coalesce((SELECT sum(amount_paise) FROM month_entries WHERE type='spent'),0),
     'cash_in_paise',coalesce((SELECT sum(amount_paise) FROM month_entries WHERE type='received'),0),
     'cash_out_paise',coalesce((SELECT sum(amount_paise) FROM month_entries WHERE type IN ('paid','spent') OR (type='bought' AND paid)),0)
   ),
   'total_rows',(SELECT count(*) FROM report_rows),
   'filtered_paise',coalesce((SELECT sum(amount_paise) FROM report_rows),0),
   'filtered_in_paise',coalesce((SELECT sum(money_in_paise) FROM report_rows),0),
   'filtered_out_paise',coalesce((SELECT sum(money_out_paise) FROM report_rows),0),
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(r)-'position' ORDER BY position) FROM paged r),'[]'::jsonb),
   'options',jsonb_build_object(
     'branches',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM sale_lines) o),'[]'::jsonb),
     'items',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT item_id AS id,item_name AS label FROM sale_lines) o),'[]'::jsonb),
     'vendors',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM spending WHERE type='bought') o),'[]'::jsonb),
     'categories',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT category_name AS id,category_name AS label FROM spending) o),'[]'::jsonb)
   )
 ) INTO result;
 IF p_export AND (result->>'total_rows')::bigint>10000 THEN
   RAISE EXCEPTION 'KITCHEN_EXPORT_TOO_LARGE' USING ERRCODE='22023';
 END IF;
 RETURN result;
END
$report$;

-- kitchen_attendance_stamp: as in 20261010070428_kitchen_attendance.sql; locked days are kept, except
-- that the owner may correct them (logged). Definer so the change log can be written.
CREATE OR REPLACE FUNCTION public.kitchen_attendance_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_name text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.branch_id <> OLD.branch_id THEN
      RAISE EXCEPTION 'KITCHEN_ATTENDANCE_IDENTITY' USING ERRCODE = '22023';
    END IF;
    NEW.created_at := OLD.created_at;
    IF TG_TABLE_NAME = 'kitchen_attendance' THEN
      IF NEW.roster_id <> OLD.roster_id OR NEW.attendance_date <> OLD.attendance_date THEN
        RAISE EXCEPTION 'KITCHEN_ATTENDANCE_IDENTITY' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    NEW.created_at := now();
  END IF;
  IF TG_TABLE_NAME = 'kitchen_attendance' THEN
    IF NEW.attendance_date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
      RAISE EXCEPTION 'KITCHEN_ATTENDANCE_FUTURE' USING ERRCODE = '22023';
    END IF;
    PERFORM public.kitchen_lock_check(NEW.tenant_id, NEW.branch_id, NEW.attendance_date, 'attendance', NEW.roster_id, false);
    -- A correction to an archived person's existing day is allowed; a new day is not.
    IF NOT EXISTS (SELECT 1 FROM public.kitchen_staff_roster r
      WHERE r.id = NEW.roster_id AND r.tenant_id = NEW.tenant_id AND r.branch_id = NEW.branch_id
      AND (r.is_active OR EXISTS (SELECT 1 FROM public.kitchen_attendance a
        WHERE a.tenant_id = NEW.tenant_id AND a.branch_id = NEW.branch_id
          AND a.roster_id = NEW.roster_id AND a.attendance_date = NEW.attendance_date))) THEN
      RAISE EXCEPTION 'KITCHEN_ATTENDANCE_ARCHIVED' USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT s.name INTO actor_name FROM public.staff s
    WHERE s.auth_user_id = auth.uid() AND s.tenant_id = NEW.tenant_id
      AND s.branch_id = public.auth_branch_id() AND s.status = 'active' AND s.deleted_at IS NULL LIMIT 1;
  NEW.updated_by := auth.uid();
  NEW.updated_by_name := coalesce(nullif(btrim(actor_name), ''), 'Staff');
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Tables the app writes directly: reading stays open to kitchen users;
-- adding and changing needs the permission for that list.
DROP POLICY IF EXISTS kitchen_items_insert ON public.kitchen_items;
CREATE POLICY kitchen_items_insert ON public.kitchen_items FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.items'));
DROP POLICY IF EXISTS kitchen_items_update ON public.kitchen_items;
CREATE POLICY kitchen_items_update ON public.kitchen_items FOR UPDATE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'setup.items')) WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.items'));

DROP POLICY IF EXISTS kitchen_parties_insert ON public.kitchen_parties;
CREATE POLICY kitchen_parties_insert ON public.kitchen_parties FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.parties'));
DROP POLICY IF EXISTS kitchen_parties_update ON public.kitchen_parties;
CREATE POLICY kitchen_parties_update ON public.kitchen_parties FOR UPDATE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'setup.parties')) WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.parties'));

DROP POLICY IF EXISTS kitchen_categories_insert ON public.kitchen_categories;
CREATE POLICY kitchen_categories_insert ON public.kitchen_categories FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.categories'));
DROP POLICY IF EXISTS kitchen_categories_update ON public.kitchen_categories;
CREATE POLICY kitchen_categories_update ON public.kitchen_categories FOR UPDATE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'setup.categories')) WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.categories'));

DROP POLICY IF EXISTS kitchen_purchase_categories_scope ON public.kitchen_purchase_categories;
DROP POLICY IF EXISTS kitchen_purchase_categories_read ON public.kitchen_purchase_categories;
CREATE POLICY kitchen_purchase_categories_read ON public.kitchen_purchase_categories FOR SELECT TO authenticated
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_purchase_categories_add ON public.kitchen_purchase_categories;
CREATE POLICY kitchen_purchase_categories_add ON public.kitchen_purchase_categories FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.categories'));
DROP POLICY IF EXISTS kitchen_purchase_categories_edit ON public.kitchen_purchase_categories;
CREATE POLICY kitchen_purchase_categories_edit ON public.kitchen_purchase_categories FOR UPDATE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'setup.categories')) WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.categories'));

DROP POLICY IF EXISTS kitchen_staff_roster_add ON public.kitchen_staff_roster;
CREATE POLICY kitchen_staff_roster_add ON public.kitchen_staff_roster FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.roster') AND EXISTS (
    SELECT 1 FROM public.branches b WHERE b.tenant_id = kitchen_staff_roster.tenant_id AND b.id = kitchen_staff_roster.branch_id));
DROP POLICY IF EXISTS kitchen_staff_roster_edit ON public.kitchen_staff_roster;
CREATE POLICY kitchen_staff_roster_edit ON public.kitchen_staff_roster FOR UPDATE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'setup.roster')) WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.roster'));

DROP POLICY IF EXISTS kitchen_attendance_add ON public.kitchen_attendance;
CREATE POLICY kitchen_attendance_add ON public.kitchen_attendance FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'attendance.mark'));
DROP POLICY IF EXISTS kitchen_attendance_edit ON public.kitchen_attendance;
CREATE POLICY kitchen_attendance_edit ON public.kitchen_attendance FOR UPDATE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'attendance.mark')) WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'attendance.mark'));

-- Cash and Bank rows are for logins with money.view.
DROP POLICY IF EXISTS kitchen_money_openings_read ON public.kitchen_money_openings;
CREATE POLICY kitchen_money_openings_read ON public.kitchen_money_openings FOR SELECT TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'money.view'));
DROP POLICY IF EXISTS kitchen_money_moves_read ON public.kitchen_money_moves;
CREATE POLICY kitchen_money_moves_read ON public.kitchen_money_moves FOR SELECT TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'money.view'));

NOTIFY pgrst, 'reload schema';

