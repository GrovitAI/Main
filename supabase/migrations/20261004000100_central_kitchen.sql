-- ============================================================================
-- Migration: the Central Kitchen's own books — Task 131
--
-- The kitchen wants four things and nothing else: send items to a branch,
-- take money from a branch, buy from a vendor, pay a vendor or a bill. No
-- matching of a payment to a bill; each branch and each vendor just has a
-- running give-and-take, and the kitchen's money is in minus out.
--
--   kitchen_items        what the kitchen makes or buys, with a stock figure
--                        and (for what it sells to branches) a price
--   kitchen_parties      the branches it sends to and the vendors it buys from:
--                        names the kitchen types in
--   kitchen_entries      one row per thing that happened: sent, received,
--                        bought, paid, spent, made, count
--   kitchen_entry_lines  the items on a send or a buy
--
-- Stock moves only inside kitchen_post_entry, in the same transaction as the
-- entry: bought and made add, sent takes away, count sets. A mistake is voided
-- with kitchen_void_entry, which puts the stock back; nothing is deleted.
--
-- Who: staff with the 'kitchen' role at that branch, and the owner or an
-- admin. Nobody else reads or writes these tables.
--
-- Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Who may use a kitchen's books
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_can_use(p_tenant_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    public.auth_can_access_branch(p_tenant_id, p_branch_id)
    AND public.auth_role() IN ('kitchen', 'owner', 'admin'),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.kitchen_can_use(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_can_use(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  branch_id        uuid NOT NULL REFERENCES public.branches(id),
  name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  unit             text NOT NULL CHECK (unit IN ('kg', 'L', 'pcs')),
  -- What a branch pays per unit. NULL for a raw material the kitchen only buys.
  sell_price_paise bigint CHECK (sell_price_paise IS NULL OR sell_price_paise >= 0),
  stock            numeric(14,3) NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_items_name_key
  ON public.kitchen_items (tenant_id, branch_id, lower(btrim(name))) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.kitchen_parties (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  branch_id  uuid NOT NULL REFERENCES public.branches(id),
  kind       text NOT NULL CHECK (kind IN ('branch', 'vendor')),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  phone      text CHECK (phone IS NULL OR length(phone) <= 20),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_parties_name_key
  ON public.kitchen_parties (tenant_id, branch_id, kind, lower(btrim(name))) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.kitchen_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  branch_id    uuid NOT NULL REFERENCES public.branches(id),
  type         text NOT NULL CHECK (type IN ('sent', 'received', 'bought', 'paid', 'spent', 'made', 'count')),
  entry_date   date NOT NULL,
  party_id     uuid REFERENCES public.kitchen_parties(id),
  item_id      uuid REFERENCES public.kitchen_items(id),
  qty          numeric(14,3),
  -- A count remembers what the figure was, so voiding it can put it back.
  from_qty     numeric(14,3),
  amount_paise bigint NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
  -- A buy paid on the spot is money out today; one paid later sits on the vendor's tab.
  paid         boolean NOT NULL DEFAULT true,
  mode         text CHECK (mode IN ('cash', 'upi', 'bank')),
  category     text CHECK (category IS NULL OR length(category) <= 40),
  note         text CHECK (note IS NULL OR length(note) <= 200),
  created_by   text NOT NULL DEFAULT 'Staff',
  created_at   timestamptz NOT NULL DEFAULT now(),
  voided_at    timestamptz,
  voided_by    text,
  void_reason  text,
  CONSTRAINT kitchen_entries_shape CHECK (
       (type IN ('sent', 'received', 'bought', 'paid') AND party_id IS NOT NULL AND item_id IS NULL)
    OR (type = 'spent' AND party_id IS NULL AND item_id IS NULL AND category IS NOT NULL)
    OR (type IN ('made', 'count') AND item_id IS NOT NULL AND party_id IS NULL AND qty IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS kitchen_entries_branch_date_idx
  ON public.kitchen_entries (tenant_id, branch_id, entry_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS kitchen_entries_party_idx
  ON public.kitchen_entries (party_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS kitchen_entries_item_idx
  ON public.kitchen_entries (item_id) WHERE item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.kitchen_entry_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  branch_id   uuid NOT NULL,
  entry_id    uuid NOT NULL REFERENCES public.kitchen_entries(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES public.kitchen_items(id),
  qty         numeric(14,3) NOT NULL CHECK (qty > 0),
  price_paise bigint NOT NULL CHECK (price_paise >= 0),
  line_paise  bigint NOT NULL CHECK (line_paise >= 0)
);
CREATE INDEX IF NOT EXISTS kitchen_entry_lines_entry_idx ON public.kitchen_entry_lines (entry_id);
CREATE INDEX IF NOT EXISTS kitchen_entry_lines_item_idx ON public.kitchen_entry_lines (item_id);

-- Optional matching. A vendor payment may say which pay-later buys it covers,
-- and money from a branch which sends. The balances never depend on this; it
-- only lets a buy or a send show as paid. Voiding either side drops the match.
CREATE TABLE IF NOT EXISTS public.kitchen_allocations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  branch_id    uuid NOT NULL,
  payment_id   uuid NOT NULL REFERENCES public.kitchen_entries(id) ON DELETE CASCADE,
  covers_id    uuid NOT NULL REFERENCES public.kitchen_entries(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_allocations_pair UNIQUE (payment_id, covers_id)
);
CREATE INDEX IF NOT EXISTS kitchen_allocations_covers_idx ON public.kitchen_allocations (covers_id);

-- ---------------------------------------------------------------------------
-- 2. Grants and row level security
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_parties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kitchen_items, public.kitchen_parties, public.kitchen_entries, public.kitchen_entry_lines, public.kitchen_allocations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_items, public.kitchen_parties, public.kitchen_entries, public.kitchen_entry_lines, public.kitchen_allocations TO service_role;
-- Lists are kept from the app; nothing is deleted, only switched off.
GRANT SELECT, INSERT, UPDATE ON public.kitchen_items, public.kitchen_parties TO authenticated;
-- Entries, their lines and their matches are written only by the functions below.
GRANT SELECT ON public.kitchen_entries, public.kitchen_entry_lines, public.kitchen_allocations TO authenticated;

DROP POLICY IF EXISTS kitchen_items_select ON public.kitchen_items;
CREATE POLICY kitchen_items_select ON public.kitchen_items FOR SELECT
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_items_insert ON public.kitchen_items;
CREATE POLICY kitchen_items_insert ON public.kitchen_items FOR INSERT
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_items_update ON public.kitchen_items;
CREATE POLICY kitchen_items_update ON public.kitchen_items FOR UPDATE
  USING (public.kitchen_can_use(tenant_id, branch_id))
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));

DROP POLICY IF EXISTS kitchen_parties_select ON public.kitchen_parties;
CREATE POLICY kitchen_parties_select ON public.kitchen_parties FOR SELECT
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_parties_insert ON public.kitchen_parties;
CREATE POLICY kitchen_parties_insert ON public.kitchen_parties FOR INSERT
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_parties_update ON public.kitchen_parties;
CREATE POLICY kitchen_parties_update ON public.kitchen_parties FOR UPDATE
  USING (public.kitchen_can_use(tenant_id, branch_id))
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));

DROP POLICY IF EXISTS kitchen_entries_select ON public.kitchen_entries;
CREATE POLICY kitchen_entries_select ON public.kitchen_entries FOR SELECT
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_entry_lines_select ON public.kitchen_entry_lines;
CREATE POLICY kitchen_entry_lines_select ON public.kitchen_entry_lines FOR SELECT
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_allocations_select ON public.kitchen_allocations;
CREATE POLICY kitchen_allocations_select ON public.kitchen_allocations FOR SELECT
  USING (public.kitchen_can_use(tenant_id, branch_id));

-- ---------------------------------------------------------------------------
-- 3. Tidy on write. The stock figure moves only through the posting function:
--    a direct update from the app leaves it as it was.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_items_touch()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id  := OLD.tenant_id;
    NEW.branch_id  := OLD.branch_id;
    NEW.created_at := OLD.created_at;
    IF coalesce(current_setting('kitchen.posting', true), '') <> 'on' THEN
      NEW.stock := OLD.stock;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_items_touch ON public.kitchen_items;
CREATE TRIGGER kitchen_items_touch
  BEFORE INSERT OR UPDATE ON public.kitchen_items
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_items_touch();

CREATE OR REPLACE FUNCTION public.kitchen_parties_touch()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.name  := btrim(NEW.name);
  NEW.phone := nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9+]', '', 'g'), '');
  IF TG_OP = 'UPDATE' THEN
    NEW.tenant_id  := OLD.tenant_id;
    NEW.branch_id  := OLD.branch_id;
    NEW.kind       := OLD.kind;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_parties_touch ON public.kitchen_parties;
CREATE TRIGGER kitchen_parties_touch
  BEFORE INSERT OR UPDATE ON public.kitchen_parties
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_parties_touch();

-- ---------------------------------------------------------------------------
-- 4. Posting: the entry, its lines and the stock, in one transaction
--
--    p is a JSON object:
--      branch_id, type, entry_date (optional, today in India otherwise),
--      party_id (sent/received/bought/paid), item_id + qty (made/count),
--      lines: [{item_id, qty, price_paise}] (sent/bought),
--      amount_paise + mode (received/paid/spent), paid + mode (bought),
--      category (spent), note, created_by,
--      covers: [{entry_id, amount_paise}] (paid/received, optional): the
--        pay-later buys or the sends this money is for.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_post_entry(p jsonb)
RETURNS public.kitchen_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  -- The branch or vendor it concerns.
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

  -- Money that moved by hand needs an amount and how it moved.
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

  -- One item, made or counted.
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
    (tenant_id, branch_id, type, entry_date, party_id, item_id, qty, from_qty, amount_paise, paid, mode, category, note, created_by)
  VALUES
    (v_tenant, v_branch, v_type, v_date, v_party, v_item, v_qty,
     CASE WHEN v_type = 'count' THEN v_item_row.stock END,
     v_amount, v_paid, v_mode, v_category, v_note, v_by)
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
    -- What this money is for, when the kitchen says so. Each buy or send can
    -- take no more than what is still open on it, and the matches together
    -- no more than the money that moved.
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
$$;
REVOKE ALL ON FUNCTION public.kitchen_post_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_post_entry(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Voiding: the entry stays, marked, and the stock it moved goes back
-- ---------------------------------------------------------------------------
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
REVOKE ALL ON FUNCTION public.kitchen_void_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_void_entry(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The give-and-take per branch and vendor. A send or an unpaid buy adds to
--    it; money received or paid takes from it. Voided entries do not count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.kitchen_party_balances
WITH (security_invoker = true) AS
SELECT p.id AS party_id,
       p.tenant_id,
       p.branch_id,
       p.kind,
       p.name,
       p.phone,
       p.is_active,
       coalesce(sum(CASE
         WHEN e.type = 'sent' THEN e.amount_paise
         WHEN e.type = 'bought' AND NOT e.paid THEN e.amount_paise
         WHEN e.type IN ('received', 'paid') THEN -e.amount_paise
         ELSE 0 END), 0)::bigint AS balance_paise,
       max(e.entry_date) AS last_entry_date
  FROM public.kitchen_parties p
  LEFT JOIN public.kitchen_entries e ON e.party_id = p.id AND e.voided_at IS NULL
 GROUP BY p.id;
REVOKE ALL ON public.kitchen_party_balances FROM anon;
GRANT SELECT ON public.kitchen_party_balances TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. What is still open to be matched: pay-later buys and sends, with what
--    has already been set against each.
-- ---------------------------------------------------------------------------
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
   AND ((e.type = 'bought' AND NOT e.paid) OR e.type = 'sent');
REVOKE ALL ON public.kitchen_open_documents FROM anon;
GRANT SELECT ON public.kitchen_open_documents TO authenticated, service_role;
