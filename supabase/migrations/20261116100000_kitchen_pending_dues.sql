-- Task 313: pending dues and month close (plan: docs/plans/2026-11-kitchen-dues-and-month-close.md).
--
-- A bill counts in its own month; a payment moves cash in the month it is made and is never that
-- month's expense or income. Payments are amounts against what is pending, cleared oldest first.
--
--   * New entry type 'carried' ("Pending from earlier"): an amount a branch owed the kitchen, or the
--     kitchen owed a vendor, as of a date. It names the branch or vendor, has no items, moves no
--     money and no stock (paid = false). It counts in that period's sales (branch) or purchases
--     (vendor), and in the pending total until money clears it.
--   * A Spent expense can be Pay later: paid = false, with its vendor (party_id). It is that
--     period's expense on its own date, adds to what the kitchen owes the vendor, and moves no cash
--     or bank until the vendor is paid. A paid expense is unchanged (no vendor).
--   * kitchen_party_balances and kitchen_open_documents count both; vendor payments and branch
--     receipts can be matched against them by hand, as with buys and sends.
--   * kitchen_money_summary and kitchen_range_report: a Pay later expense moves no cash or bank;
--     Pending from earlier is in sales or purchases.
--   * kitchen_party_dues: what is still open on each bill: matches picked by hand first, then the
--     rest of the money clears the oldest bills (the opening balance first of all).
--   * kitchen_money_net and kitchen_month_close: a month's (or any range's) figures, cash and bank
--     at its start and end, and each branch's and vendor's pending at the start and end.
--
-- No new table. Function bodies are the current ones with the changes marked "Task 313".
-- Idempotent: safe to run twice.

ALTER TABLE public.kitchen_entries DROP CONSTRAINT IF EXISTS kitchen_entries_type_check;
ALTER TABLE public.kitchen_entries ADD CONSTRAINT kitchen_entries_type_check
  CHECK (type IN ('sent', 'received', 'bought', 'paid', 'spent', 'made', 'count', 'issued', 'carried'));
ALTER TABLE public.kitchen_entries DROP CONSTRAINT IF EXISTS kitchen_entries_shape;
ALTER TABLE public.kitchen_entries ADD CONSTRAINT kitchen_entries_shape CHECK (
     (type IN ('sent', 'received', 'bought', 'paid', 'carried') AND party_id IS NOT NULL AND item_id IS NULL)
  -- A paid expense names no vendor; a Pay later one must.
  OR (type = 'spent' AND item_id IS NULL AND category IS NOT NULL AND (party_id IS NULL) = paid)
  OR (type IN ('made', 'count') AND item_id IS NOT NULL AND party_id IS NULL AND qty IS NOT NULL)
  OR (type = 'issued' AND party_id IS NULL AND item_id IS NULL)
);
ALTER TABLE public.kitchen_entries DROP CONSTRAINT IF EXISTS kitchen_entries_carried_check;
ALTER TABLE public.kitchen_entries ADD CONSTRAINT kitchen_entries_carried_check
  CHECK (type <> 'carried' OR (NOT paid AND mode IS NULL AND amount_paise > 0));

-- As in 20261005000100_kitchen_opening_balances.sql, plus Pending from earlier and Pay later expenses.
-- The columns stay as they were, in the same order.
CREATE OR REPLACE VIEW public.kitchen_party_balances
WITH (security_invoker = true) AS
SELECT p.id AS party_id,
       p.tenant_id,
       p.branch_id,
       p.kind,
       p.name,
       p.phone,
       p.is_active,
       (p.opening_paise + coalesce(sum(CASE
         WHEN e.type IN ('sent', 'carried') THEN e.amount_paise
         WHEN e.type IN ('bought', 'spent') AND NOT e.paid THEN e.amount_paise
         WHEN e.type IN ('received', 'paid') THEN -e.amount_paise
         ELSE 0 END), 0))::bigint AS balance_paise,
       max(e.entry_date) AS last_entry_date,
       p.opening_paise
  FROM public.kitchen_parties p
  LEFT JOIN public.kitchen_entries e ON e.party_id = p.id AND e.voided_at IS NULL
 GROUP BY p.id;
REVOKE ALL ON public.kitchen_party_balances FROM anon;
GRANT SELECT ON public.kitchen_party_balances TO authenticated, service_role;

-- As in 20261004000100_central_kitchen.sql: what money can still be matched against, now also
-- Pay later expenses and Pending from earlier.
CREATE OR REPLACE VIEW public.kitchen_open_documents
WITH (security_invoker = true) AS
SELECT e.id AS entry_id,
       e.tenant_id,
       e.branch_id,
       e.party_id,
       e.type,
       e.entry_date,
       e.amount_paise,
       coalesce(a.covered_paise, 0)::bigint AS covered_paise,
       (e.amount_paise - coalesce(a.covered_paise, 0))::bigint AS open_paise
  FROM public.kitchen_entries e
  LEFT JOIN (SELECT covers_id, sum(amount_paise) AS covered_paise FROM public.kitchen_allocations GROUP BY covers_id) a
    ON a.covers_id = e.id
 WHERE e.voided_at IS NULL
   AND ((e.type IN ('bought', 'spent') AND NOT e.paid) OR e.type IN ('sent', 'carried'));
REVOKE ALL ON public.kitchen_open_documents FROM anon;
GRANT SELECT ON public.kitchen_open_documents TO authenticated, service_role;

-- As in 20261020100000_kitchen_spent_particulars.sql, plus Pending from earlier and Pay later expenses.
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
     CASE WHEN v_type = 'count' THEN v_item_row.stock END,
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

-- The permission for each kind of entry, as in 20261017110000_kitchen_give_to_kitchen.sql, plus Pending from earlier.
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
      WHEN 'count' THEN 'entries.count' WHEN 'issued' THEN 'entries.issue'
      -- Task 313: Pending from earlier is recorded by whoever records that side's bills and money.
      WHEN 'carried' THEN CASE WHEN (SELECT kp.kind FROM public.kitchen_parties kp WHERE kp.id = NEW.party_id) = 'branch'
        THEN 'entries.receive' ELSE 'entries.buy' END
      ELSE 'entries.unknown' END);
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

-- As in 20261012140100_kitchen_access_enforce.sql; matches carry over to a corrected Pay later expense or Pending from earlier too.
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
  IF (v_new.type IN ('bought', 'spent') AND NOT v_new.paid) OR v_new.type IN ('sent', 'carried') THEN
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

-- As in 20261022100000_kitchen_drawings_in_cash_bank.sql; a Pay later expense moves no cash or bank.
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
    coalesce(sum(e.amount_paise) FILTER (WHERE (e.type = 'paid' OR (e.type IN ('bought', 'spent') AND e.paid)) AND coalesce(e.mode, 'cash') NOT IN ('upi', 'bank')), 0),
    coalesce(sum(e.amount_paise) FILTER (WHERE e.type = 'received' AND e.mode IN ('upi', 'bank')), 0),
    coalesce(sum(e.amount_paise) FILTER (WHERE (e.type = 'paid' OR (e.type IN ('bought', 'spent') AND e.paid)) AND e.mode IN ('upi', 'bank')), 0)
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
            ORDER BY move_date DESC, created_at DESC LIMIT 30) m), '[]'::jsonb),
    -- Task 289: the latest moves into and out of the owners' drawings, listed with the transfers.
    'drawing_moves', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'draw_date', d.draw_date, 'kind', d.kind, 'account', d.account,
        'amount_paise', d.amount_paise, 'note', d.note, 'owner_name', d.owner_name, 'created_by', d.created_by, 'created_at', d.created_at)
        ORDER BY d.draw_date DESC, d.created_at DESC)
      FROM public.kitchen_drawings_cash_rows(p_tenant_id, p_branch_id, NULL, NULL, 30) d), '[]'::jsonb));
END $$;

-- As in 20261022100000_kitchen_drawings_in_cash_bank.sql, with Pending from earlier in sales and purchases
-- and a Pay later expense out of Cash and Bank.
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
 IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR p_report NOT IN ('sales','purchases','cash','bank','profit')
   OR p_report IS NULL OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE='22023';
 END IF;
 WITH range_entries AS MATERIALIZED (
   SELECT e.*,coalesce(p.name,'Other expense') AS party_name,p.kind AS party_kind
   FROM public.kitchen_entries e
   LEFT JOIN public.kitchen_parties p ON p.id=e.party_id AND p.tenant_id=p_tenant_id AND p.branch_id=p_branch_id
   WHERE e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id AND e.voided_at IS NULL
     AND e.entry_date>=p_start_date AND e.entry_date<=p_end_date
 ), sale_lines AS MATERIALIZED (
   SELECT e.id AS entry_id,e.entry_date,e.party_id,e.party_name,l.id AS line_id,l.item_id,
     i.name AS item_name,i.unit,l.qty,l.price_paise,l.line_paise,
     -- The cost of the day of the send; sends from before a cost was set use today's cost.
     coalesce(l.cost_paise,i.cost_price_paise) AS unit_cost_paise
   FROM range_entries e
   JOIN public.kitchen_entry_lines l ON l.entry_id=e.id AND l.tenant_id=p_tenant_id AND l.branch_id=p_branch_id
   JOIN public.kitchen_items i ON i.id=l.item_id AND i.tenant_id=p_tenant_id AND i.branch_id=p_branch_id
   WHERE e.type='sent'
 ), filtered_sales AS (
   SELECT * FROM sale_lines WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_item_id IS NULL OR item_id=p_item_id)
 ), carried_sales AS (
   -- Task 313: what a branch owed from before, entered as one amount, counts in that period's sales.
   SELECT * FROM range_entries e
   WHERE e.type='carried' AND e.party_kind='branch' AND p_item_id IS NULL AND (p_party_id IS NULL OR e.party_id=p_party_id)
 ), spending AS MATERIALIZED (
   SELECT e.*,CASE WHEN e.type='bought' THEN coalesce(e.purchase_category_name,'Uncategorized')
       WHEN e.type='carried' THEN 'Pending from earlier' ELSE e.category END AS category_name,
     CASE WHEN e.type IN ('bought','carried') THEN 'Purchase' ELSE 'Other expense' END AS source_name
   FROM range_entries e
   WHERE e.type='bought' OR (e.type='carried' AND e.party_kind='vendor') OR (p_include_expenses AND e.type='spent')
 ), filtered_spending AS (
   SELECT * FROM spending WHERE (p_party_id IS NULL OR party_id=p_party_id) AND (p_category IS NULL OR category_name=p_category)
 ), cash_entries AS (
   -- Cash is cash (or no mode); UPI and bank are Bank, as in kitchen_money_summary.
   SELECT e.* FROM range_entries e
   WHERE (e.type IN ('received','paid') OR (e.type IN ('bought','spent') AND e.paid))
     AND (p_party_id IS NULL OR e.party_id=p_party_id)
     AND CASE WHEN coalesce(e.mode,'cash') IN ('upi','bank') THEN 'bank' ELSE 'cash' END=p_report
 ), money_moves AS (
   -- A move takes money out of one account and puts it into the other; it has no branch or vendor.
   SELECT m.* FROM public.kitchen_money_moves m
   WHERE m.tenant_id=p_tenant_id AND m.branch_id=p_branch_id AND m.voided_at IS NULL
     AND m.move_date>=p_start_date AND m.move_date<=p_end_date
     AND p_party_id IS NULL AND p_report IN ('cash','bank')
 ), drawing_moves AS (
   -- Task 289: money moved into the owners' drawings, or put back, out of or into this account.
   SELECT d.* FROM public.kitchen_drawings_cash_rows(p_tenant_id,p_branch_id,p_start_date,p_end_date,NULL) d
   WHERE p_party_id IS NULL AND p_report IN ('cash','bank') AND d.account=p_report
 ), report_rows AS (
   SELECT party_id::text||':'||item_id::text AS key,'sale'::text AS kind,NULL::uuid AS entry_id,NULL::date AS date,
     party_id,party_name AS party,item_id,item_name AS item,unit,sum(qty) AS quantity,
     NULL::bigint AS price_paise,sum(line_paise)::bigint AS amount_paise,
     count(DISTINCT entry_id)::integer AS documents,NULL::text AS category,'Goods supplied'::text AS source,
     NULL::text AS payment,NULL::text AS mode,0::bigint AS money_in_paise,0::bigint AS money_out_paise,
     NULL::bigint AS cost_paise
   FROM filtered_sales WHERE p_report='sales' AND NOT (p_detail OR p_export)
   GROUP BY party_id,party_name,item_id,item_name,unit
   UNION ALL
   SELECT line_id::text,'entry',entry_id,entry_date,party_id,party_name,item_id,item_name,unit,qty,price_paise,line_paise,
     1,NULL,'Goods supplied',NULL,NULL,0,0,NULL FROM filtered_sales WHERE p_report='sales' AND (p_detail OR p_export)
   UNION ALL
   SELECT party_id::text||':carried','sale',NULL,NULL,party_id,party_name,NULL,'Brought forward',NULL,NULL,NULL,sum(amount_paise)::bigint,
     count(*)::integer,NULL,'Brought forward',NULL,NULL,0,0,NULL
   FROM carried_sales WHERE p_report='sales' AND NOT (p_detail OR p_export)
   GROUP BY party_id,party_name
   UNION ALL
   SELECT id::text,'entry',id,entry_date,party_id,party_name,NULL,'Brought forward',NULL,NULL,NULL,amount_paise,
     1,NULL,'Brought forward',NULL,NULL,0,0,NULL
   FROM carried_sales WHERE p_report='sales' AND (p_detail OR p_export)
   UNION ALL
   -- Profit: per finished good, what branches paid against what it cost to make.
   SELECT item_id::text,'profit',NULL,NULL,NULL,'',item_id,item_name,unit,sum(qty),NULL,sum(line_paise)::bigint,
     count(DISTINCT entry_id)::integer,NULL,'Goods supplied',NULL,NULL,0,0,
     CASE WHEN bool_and(unit_cost_paise IS NOT NULL) THEN round(sum(qty*unit_cost_paise))::bigint END
   FROM filtered_sales WHERE p_report='profit'
   GROUP BY item_id,item_name,unit
   UNION ALL
   SELECT category_name,'category',NULL,NULL,NULL,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,NULL,NULL,NULL,
     sum(amount_paise)::bigint,count(*)::integer,category_name,string_agg(DISTINCT source_name,' + ' ORDER BY source_name),NULL,NULL,0,0,NULL
   FROM filtered_spending WHERE p_report='purchases' AND NOT (p_detail OR p_export)
   GROUP BY category_name
   UNION ALL
   SELECT id::text,'entry',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,category_name,source_name,
     CASE WHEN type='carried' THEN 'Brought forward' WHEN paid THEN 'Paid on entry' ELSE 'Pay later on entry' END,mode,0,0,NULL
   FROM filtered_spending WHERE p_report='purchases' AND (p_detail OR p_export)
   UNION ALL
   SELECT id::text,'cash',id,entry_date,party_id,party_name,NULL,NULL,NULL,NULL,NULL,amount_paise,1,
     coalesce(purchase_category_name,category),
     CASE type WHEN 'received' THEN 'Branch collection' WHEN 'paid' THEN 'Vendor payment'
       WHEN 'bought' THEN 'Purchase paid on entry' ELSE 'Other expense' END,
     NULL,mode,CASE WHEN type='received' THEN amount_paise ELSE 0 END,
     CASE WHEN type<>'received' THEN amount_paise ELSE 0 END,NULL
   FROM cash_entries WHERE p_report IN ('cash','bank')
   UNION ALL
   SELECT id::text,'cash',id,move_date,NULL,CASE WHEN to_account='bank' THEN 'Cash deposited in bank' ELSE 'Cash withdrawn from bank' END,
     NULL,NULL,NULL,NULL,NULL,amount_paise,1,NULL,'Money moved',NULL,NULL,
     CASE WHEN to_account=p_report THEN amount_paise ELSE 0 END,
     CASE WHEN from_account=p_report THEN amount_paise ELSE 0 END,NULL
   FROM money_moves
   UNION ALL
   SELECT id::text,'cash',id,draw_date,NULL,
     CASE WHEN kind='in' THEN 'To drawings' ELSE 'Back from drawings' END||coalesce(' · '||owner_name,''),
     NULL,NULL,NULL,NULL,NULL,amount_paise,1,NULL,'Drawings',NULL,NULL,
     CASE WHEN kind='back' THEN amount_paise ELSE 0 END,
     CASE WHEN kind='in' THEN amount_paise ELSE 0 END,NULL
   FROM drawing_moves
 ), ordered AS (
   SELECT r.*,row_number() OVER(ORDER BY r.date DESC NULLS LAST,r.amount_paise DESC,r.party,r.item,r.key) AS position
   FROM report_rows r
 ), paged AS (
   SELECT * FROM ordered WHERE (p_export AND position<=10000) OR (NOT p_export AND position>p_offset AND position<=p_offset+p_limit)
 )
 SELECT jsonb_build_object(
   'summary',jsonb_build_object(
     'sales_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='sent' OR (type='carried' AND party_kind='branch')),0),
     'purchases_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='bought' OR (type='carried' AND party_kind='vendor')),0),
     'expenses_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='spent'),0),
     'cash_in_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='received'),0),
     'cash_out_paise',coalesce((SELECT sum(amount_paise) FROM range_entries WHERE type='paid' OR (type IN ('bought','spent') AND paid)),0),
     'cost_paise',coalesce((SELECT round(sum(qty*unit_cost_paise))::bigint FROM sale_lines WHERE unit_cost_paise IS NOT NULL),0),
     'cost_missing_items',(SELECT count(DISTINCT item_id) FROM sale_lines WHERE unit_cost_paise IS NULL),
     'cost_missing_sales_paise',coalesce((SELECT sum(line_paise) FROM sale_lines WHERE unit_cost_paise IS NULL),0)
   ),
   'total_rows',(SELECT count(*) FROM report_rows),
   'filtered_paise',coalesce((SELECT sum(amount_paise) FROM report_rows),0),
   'filtered_in_paise',coalesce((SELECT sum(money_in_paise) FROM report_rows),0),
   'filtered_out_paise',coalesce((SELECT sum(money_out_paise) FROM report_rows),0),
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(r)-'position' ORDER BY position) FROM paged r),'[]'::jsonb),
   'options',jsonb_build_object(
     'branches',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM sale_lines UNION SELECT DISTINCT party_id,party_name FROM range_entries WHERE type='carried' AND party_kind='branch') o),'[]'::jsonb),
     'items',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT item_id AS id,item_name AS label FROM sale_lines) o),'[]'::jsonb),
     'vendors',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT party_id AS id,party_name AS label FROM spending WHERE type IN ('bought','carried')) o),'[]'::jsonb),
     'categories',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY label) FROM (SELECT DISTINCT category_name AS id,category_name AS label FROM spending) o),'[]'::jsonb)
   )
 ) INTO result;
 IF p_export AND (result->>'total_rows')::bigint>10000 THEN
   RAISE EXCEPTION 'KITCHEN_EXPORT_TOO_LARGE' USING ERRCODE='22023';
 END IF;
 RETURN result;
END
$report$;

-- ---------------------------------------------------------------------------
-- What is still open on each bill (a send, a pay-later buy or expense, Pending from earlier, and a
-- positive opening balance), for one branch or vendor or all of them, as of a day (today when
-- p_as_of is null). Money matched to a bill by hand clears that bill first; the rest of all the
-- money paid, and any opening credit, clears the oldest bills, the opening balance first of all.
-- The open amounts add up to the pending total whenever it is above zero.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_party_dues(p_tenant_id uuid, p_branch_id uuid, p_party_id uuid DEFAULT NULL, p_as_of date DEFAULT NULL)
RETURNS TABLE (party_id uuid, entry_id uuid, type text, entry_date date, amount_paise bigint, open_paise bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH parties AS (
    SELECT p.id, p.opening_paise FROM public.kitchen_parties p
     WHERE p.tenant_id = p_tenant_id AND p.branch_id = p_branch_id AND (p_party_id IS NULL OR p.id = p_party_id)
  ), live AS (
    SELECT e.id, e.party_id, e.type, e.paid, e.entry_date, e.created_at, e.amount_paise
      FROM public.kitchen_entries e
      JOIN parties p ON p.id = e.party_id
     WHERE e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id AND e.voided_at IS NULL
       AND (p_as_of IS NULL OR e.entry_date <= p_as_of)
  ), bills AS (
    SELECT l.party_id, l.id AS entry_id, l.type, l.entry_date, l.created_at, l.amount_paise
      FROM live l
     WHERE l.type IN ('sent', 'carried') OR (l.type IN ('bought', 'spent') AND NOT l.paid)
    UNION ALL
    SELECT p.id, NULL::uuid, 'opening'::text, NULL::date, NULL::timestamptz, p.opening_paise
      FROM parties p WHERE p.opening_paise > 0
  ), pays AS (
    SELECT l.id, l.party_id, l.amount_paise FROM live l WHERE l.type IN ('received', 'paid')
  ), matched AS (
    -- Matches by hand between money and a bill that both still count.
    SELECT a.payment_id, a.covers_id, a.amount_paise
      FROM public.kitchen_allocations a
      JOIN pays y ON y.id = a.payment_id
      JOIN bills b ON b.entry_id = a.covers_id
     WHERE a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id
  ), pool AS (
    SELECT q.party_id, sum(q.paise)::bigint AS paise FROM (
      SELECT y.party_id, y.amount_paise - coalesce((SELECT sum(m.amount_paise) FROM matched m WHERE m.payment_id = y.id), 0) AS paise FROM pays y
      UNION ALL
      SELECT p.id, -p.opening_paise FROM parties p WHERE p.opening_paise < 0
    ) q GROUP BY q.party_id
  ), rest AS (
    SELECT b.*, greatest(b.amount_paise - coalesce((SELECT sum(m.amount_paise) FROM matched m WHERE m.covers_id = b.entry_id), 0), 0)::bigint AS rest_paise
      FROM bills b
  ), run AS (
    SELECT r.*, sum(r.rest_paise) OVER (PARTITION BY r.party_id
             ORDER BY r.entry_date NULLS FIRST, r.created_at NULLS FIRST, r.entry_id NULLS FIRST
             ROWS UNBOUNDED PRECEDING)::bigint AS upto
      FROM rest r
  )
  SELECT run.party_id, run.entry_id, run.type, run.entry_date, run.amount_paise,
         greatest(0, least(run.rest_paise, run.upto - greatest(coalesce(pool.paise, 0), 0)))::bigint
    FROM run LEFT JOIN pool ON pool.party_id = run.party_id
   ORDER BY run.party_id, run.entry_date NULLS FIRST, run.created_at NULLS FIRST;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_party_dues(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_party_dues(uuid, uuid, uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- How cash and the bank moved over a range of days, by the rules of kitchen_money_summary: money
-- from branches in; vendors paid, buys and expenses paid on the spot out; moves between the two;
-- money moved into the owners' drawings (out) or put back (in). Cash is cash or no mode.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_money_net(p_tenant_id uuid, p_branch_id uuid, p_from date, p_to date)
RETURNS TABLE (cash_in bigint, cash_out bigint, bank_in bigint, bank_out bigint, to_bank bigint, to_cash bigint,
               drawings_cash bigint, drawings_bank bigint, cash_net bigint, bank_net bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH e AS (
    SELECT e.type, e.amount_paise, CASE WHEN coalesce(e.mode, 'cash') IN ('upi', 'bank') THEN 'bank' ELSE 'cash' END AS acct
      FROM public.kitchen_entries e
     WHERE public.kitchen_can_use(p_tenant_id, p_branch_id)
       AND e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id AND e.voided_at IS NULL
       AND e.entry_date BETWEEN p_from AND p_to
       AND (e.type IN ('received', 'paid') OR (e.type IN ('bought', 'spent') AND e.paid))
  ), m AS (
    SELECT m.to_account, m.amount_paise FROM public.kitchen_money_moves m
     WHERE m.tenant_id = p_tenant_id AND m.branch_id = p_branch_id AND m.voided_at IS NULL
       AND m.move_date BETWEEN p_from AND p_to
  ), d AS (
    SELECT d.account, CASE WHEN d.kind = 'in' THEN d.amount_paise ELSE -d.amount_paise END AS out_paise
      FROM public.kitchen_drawings_cash_rows(p_tenant_id, p_branch_id, p_from, p_to, NULL) d
  ), s AS (
    SELECT
      coalesce((SELECT sum(amount_paise) FROM e WHERE type = 'received' AND acct = 'cash'), 0)::bigint AS cash_in,
      coalesce((SELECT sum(amount_paise) FROM e WHERE type <> 'received' AND acct = 'cash'), 0)::bigint AS cash_out,
      coalesce((SELECT sum(amount_paise) FROM e WHERE type = 'received' AND acct = 'bank'), 0)::bigint AS bank_in,
      coalesce((SELECT sum(amount_paise) FROM e WHERE type <> 'received' AND acct = 'bank'), 0)::bigint AS bank_out,
      coalesce((SELECT sum(amount_paise) FROM m WHERE to_account = 'bank'), 0)::bigint AS to_bank,
      coalesce((SELECT sum(amount_paise) FROM m WHERE to_account = 'cash'), 0)::bigint AS to_cash,
      coalesce((SELECT sum(out_paise) FROM d WHERE account = 'cash'), 0)::bigint AS drawings_cash,
      coalesce((SELECT sum(out_paise) FROM d WHERE account = 'bank'), 0)::bigint AS drawings_bank
  )
  SELECT s.cash_in, s.cash_out, s.bank_in, s.bank_out, s.to_bank, s.to_cash, s.drawings_cash, s.drawings_bank,
         s.cash_in - s.cash_out - s.to_bank + s.to_cash - s.drawings_cash,
         s.bank_in - s.bank_out + s.to_bank - s.to_cash - s.drawings_bank
    FROM s;
$$;
REVOKE ALL ON FUNCTION public.kitchen_money_net(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_money_net(uuid, uuid, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A month's close (any range up to about a year): its figures, cash and bank at its start and end
-- (when the kitchen's opening cash and bank are set on or before those days), each branch's and
-- vendor's pending at the start and end with the bills and money in between and the oldest bill
-- still open, the Pending from earlier entries of the range, and a check that the oldest-first
-- open amounts add up to the pending totals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_month_close(p_tenant_id uuid, p_branch_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_open public.kitchen_money_openings%ROWTYPE;
  v_has boolean;
  v_flow record;
  v_before record;
  v_upto record;
  v_start_cash bigint; v_start_bank bigint; v_end_cash bigint; v_end_bank bigint;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kitchen_can_use(p_tenant_id, p_branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_require(p_tenant_id, p_branch_id, 'reports.view');
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'KITCHEN_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_open FROM public.kitchen_money_openings WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  v_has := FOUND;
  SELECT * INTO v_flow FROM public.kitchen_money_net(p_tenant_id, p_branch_id, p_from, p_to);
  IF v_has AND p_from >= v_open.as_of THEN
    SELECT * INTO v_before FROM public.kitchen_money_net(p_tenant_id, p_branch_id, v_open.as_of, p_from - 1);
    v_start_cash := v_open.cash_paise + v_before.cash_net;
    v_start_bank := v_open.bank_paise + v_before.bank_net;
  END IF;
  IF v_has AND p_to >= v_open.as_of THEN
    SELECT * INTO v_upto FROM public.kitchen_money_net(p_tenant_id, p_branch_id, v_open.as_of, p_to);
    v_end_cash := v_open.cash_paise + v_upto.cash_net;
    v_end_bank := v_open.bank_paise + v_upto.bank_net;
  END IF;

  WITH r AS (
    SELECT e.id, e.type, e.paid, e.entry_date, e.party_id, e.amount_paise, e.note, e.created_by, p.kind AS party_kind, p.name AS party_name
      FROM public.kitchen_entries e
      LEFT JOIN public.kitchen_parties p ON p.id = e.party_id AND p.tenant_id = p_tenant_id AND p.branch_id = p_branch_id
     WHERE e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id AND e.voided_at IS NULL
       AND e.entry_date BETWEEN p_from AND p_to
  ), parties AS (
    SELECT p.id, p.kind, p.name, p.is_active, p.opening_paise FROM public.kitchen_parties p
     WHERE p.tenant_id = p_tenant_id AND p.branch_id = p_branch_id
  ), eff AS (
    SELECT e.party_id, e.entry_date,
           CASE WHEN e.type IN ('sent', 'carried') OR (e.type IN ('bought', 'spent') AND NOT e.paid) THEN e.amount_paise
                WHEN e.type IN ('received', 'paid') THEN -e.amount_paise ELSE 0 END AS effect
      FROM public.kitchen_entries e
     WHERE e.tenant_id = p_tenant_id AND e.branch_id = p_branch_id AND e.voided_at IS NULL
       AND e.party_id IS NOT NULL AND e.entry_date <= p_to
  ), per AS (
    SELECT p.id, p.kind, p.name, p.is_active,
           (p.opening_paise + coalesce(sum(f.effect) FILTER (WHERE f.entry_date < p_from), 0))::bigint AS at_start,
           coalesce(sum(f.effect) FILTER (WHERE f.entry_date >= p_from AND f.effect > 0), 0)::bigint AS bills,
           coalesce(-sum(f.effect) FILTER (WHERE f.entry_date >= p_from AND f.effect < 0), 0)::bigint AS paid,
           (p.opening_paise + coalesce(sum(f.effect), 0))::bigint AS at_end
      FROM parties p LEFT JOIN eff f ON f.party_id = p.id
     GROUP BY p.id, p.kind, p.name, p.is_active, p.opening_paise
  ), dues AS (
    SELECT d.party_id, sum(d.open_paise)::bigint AS open_paise,
           min(d.entry_date) FILTER (WHERE d.open_paise > 0) AS oldest,
           coalesce(bool_or(d.entry_date IS NULL AND d.open_paise > 0), false) AS opening_open
      FROM public.kitchen_party_dues(p_tenant_id, p_branch_id, NULL, p_to) d
     GROUP BY d.party_id
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'sales_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'sent' OR (type = 'carried' AND party_kind = 'branch')), 0),
      'carried_sales_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'carried' AND party_kind = 'branch'), 0),
      'purchases_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'bought' OR (type = 'carried' AND party_kind = 'vendor')), 0),
      'carried_purchases_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'carried' AND party_kind = 'vendor'), 0),
      'expenses_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'spent'), 0),
      'expenses_later_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'spent' AND NOT paid), 0),
      'received_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'received'), 0),
      'paid_vendors_paise', coalesce((SELECT sum(amount_paise) FROM r WHERE type = 'paid'), 0),
      'cash_in_paise', v_flow.cash_in, 'cash_out_paise', v_flow.cash_out,
      'bank_in_paise', v_flow.bank_in, 'bank_out_paise', v_flow.bank_out,
      'moved_to_bank_paise', v_flow.to_bank, 'moved_to_cash_paise', v_flow.to_cash,
      'drawings_cash_paise', v_flow.drawings_cash, 'drawings_bank_paise', v_flow.drawings_bank,
      'has_opening', v_has, 'opening_as_of', CASE WHEN v_has THEN v_open.as_of END,
      'start_cash_paise', v_start_cash, 'start_bank_paise', v_start_bank,
      'end_cash_paise', v_end_cash, 'end_bank_paise', v_end_bank
    ),
    'parties', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'party_id', per.id, 'kind', per.kind, 'name', per.name, 'is_active', per.is_active,
        'at_start_paise', per.at_start, 'bills_paise', per.bills, 'paid_paise', per.paid, 'at_end_paise', per.at_end,
        'open_paise', coalesce(dues.open_paise, 0), 'oldest_due', dues.oldest, 'opening_due', coalesce(dues.opening_open, false))
        ORDER BY per.kind, per.at_end DESC, per.name)
      FROM per LEFT JOIN dues ON dues.party_id = per.id), '[]'::jsonb),
    'carried', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'entry_date', r.entry_date, 'party_id', r.party_id, 'party', r.party_name, 'kind', r.party_kind,
        'amount_paise', r.amount_paise, 'note', r.note, 'created_by', r.created_by)
        ORDER BY r.entry_date, r.party_name)
      FROM r WHERE r.type = 'carried'), '[]'::jsonb),
    'check', jsonb_build_object(
      'pending_paise', coalesce((SELECT sum(greatest(at_end, 0)) FROM per), 0),
      'open_paise', coalesce((SELECT sum(open_paise) FROM dues), 0),
      'difference_paise', coalesce((SELECT sum(greatest(at_end, 0)) FROM per), 0) - coalesce((SELECT sum(open_paise) FROM dues), 0)
    )
  ) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_month_close(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_month_close(uuid, uuid, date, date) TO authenticated, service_role;
