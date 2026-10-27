-- Task 279: Spent by particular.
-- The owner's flow (mockups in output/previews/task-279): a Spent entry starts from its
-- particular (Milk), which belongs to a category or a sub-category (Food > Dairy); a particular
-- used once is kept so it brings its category next time. The particular stands where the note
-- was and is required. A quantity with its unit is optional. Two categories ask for more:
-- Transport needs the route (from or to one of the branches) and Salary advance needs the
-- person (from the attendance list).
--   * kitchen_purchase_categories: parent_id (one level of sub-categories) and asks
--     ('route' | 'person'), set here on Transport and Salary advance, which are added to every
--     kitchen that has categories and lacks them.
--   * kitchen_particulars: name and category per kitchen.
--   * kitchen_entries: particular_id, category_id (the category or sub-category picked),
--     subcategory, qty_unit, route_party_id, route_dir, roster_id. category keeps the top
--     category's name, so reports and History read as before.
--   * kitchen_post_entry: as in 20261017110000_kitchen_give_to_kitchen.sql with the Spent
--     additions. Old-style Spent entries (category and note, no particular) still save.
-- Idempotent: safe to run twice.

ALTER TABLE public.kitchen_purchase_categories ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.kitchen_purchase_categories ADD COLUMN IF NOT EXISTS asks text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_purchase_categories_asks_check') THEN
    ALTER TABLE public.kitchen_purchase_categories ADD CONSTRAINT kitchen_purchase_categories_asks_check
      CHECK (asks IS NULL OR asks IN ('route', 'person'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_purchase_categories_parent_fk') THEN
    ALTER TABLE public.kitchen_purchase_categories ADD CONSTRAINT kitchen_purchase_categories_parent_fk
      FOREIGN KEY (parent_id, tenant_id, branch_id) REFERENCES public.kitchen_purchase_categories (id, tenant_id, branch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_purchase_categories_not_own_parent') THEN
    ALTER TABLE public.kitchen_purchase_categories ADD CONSTRAINT kitchen_purchase_categories_not_own_parent
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS kitchen_purchase_categories_parent_idx
  ON public.kitchen_purchase_categories (tenant_id, branch_id, parent_id);

-- Transport and Salary advance in every kitchen that keeps categories, asking for the route and
-- the person. An existing category of that name (active or archived) is used as it is.
INSERT INTO public.kitchen_purchase_categories (tenant_id, branch_id, name)
SELECT s.tenant_id, s.branch_id, n.name
  FROM (SELECT DISTINCT tenant_id, branch_id FROM public.kitchen_purchase_categories) s
 CROSS JOIN (VALUES ('Transport'), ('Salary advance')) AS n(name)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kitchen_purchase_categories c
    WHERE c.tenant_id = s.tenant_id AND c.branch_id = s.branch_id AND lower(btrim(c.name)) = lower(n.name));
UPDATE public.kitchen_purchase_categories SET asks = 'route'
 WHERE lower(btrim(name)) = 'transport' AND asks IS DISTINCT FROM 'route';
UPDATE public.kitchen_purchase_categories SET asks = 'person'
 WHERE lower(btrim(name)) = 'salary advance' AND asks IS DISTINCT FROM 'person';

CREATE TABLE IF NOT EXISTS public.kitchen_particulars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  category_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id, branch_id),
  CONSTRAINT kitchen_particulars_category_fk FOREIGN KEY (category_id, tenant_id, branch_id)
    REFERENCES public.kitchen_purchase_categories (id, tenant_id, branch_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_particulars_name_key
  ON public.kitchen_particulars (tenant_id, branch_id, lower(btrim(name))) WHERE is_active;
CREATE INDEX IF NOT EXISTS kitchen_particulars_category_idx ON public.kitchen_particulars (tenant_id, branch_id, category_id);

ALTER TABLE public.kitchen_particulars ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_particulars FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_particulars TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.kitchen_particulars TO authenticated;
DROP POLICY IF EXISTS kitchen_particulars_read ON public.kitchen_particulars;
CREATE POLICY kitchen_particulars_read ON public.kitchen_particulars FOR SELECT TO authenticated
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_particulars_add ON public.kitchen_particulars;
CREATE POLICY kitchen_particulars_add ON public.kitchen_particulars FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.categories'));
DROP POLICY IF EXISTS kitchen_particulars_edit ON public.kitchen_particulars;
CREATE POLICY kitchen_particulars_edit ON public.kitchen_particulars FOR UPDATE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'setup.categories')) WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.categories'));

ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS particular_id uuid;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS subcategory text;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS qty_unit text;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS route_party_id uuid;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS route_dir text;
ALTER TABLE public.kitchen_entries ADD COLUMN IF NOT EXISTS roster_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_entries_spent_extras_check') THEN
    ALTER TABLE public.kitchen_entries ADD CONSTRAINT kitchen_entries_spent_extras_check CHECK (
          (qty_unit IS NULL OR qty_unit IN ('kg', 'L', 'pcs'))
      AND (route_dir IS NULL OR route_dir IN ('from', 'to'))
      AND (subcategory IS NULL OR length(subcategory) <= 80)
      AND (type = 'spent' OR (particular_id IS NULL AND category_id IS NULL AND route_party_id IS NULL AND roster_id IS NULL)));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS kitchen_entries_roster_idx ON public.kitchen_entries (tenant_id, branch_id, roster_id) WHERE roster_id IS NOT NULL;

-- kitchen_post_entry: as in 20261017110000_kitchen_give_to_kitchen.sql, plus the Spent particular,
-- its category, the optional quantity, and the route or person its category asks for.
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

REVOKE ALL ON FUNCTION public.kitchen_post_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_post_entry(jsonb) TO authenticated, service_role;
