-- Task 330: table ordering by QR code.
-- A branch switches it on and lists its tables; each table has a printed QR code that opens the menu
-- for that table. A customer's order waits for staff, who accept it (it joins the table's open order
-- and goes to the kitchen) or decline it. The customer pays at the counter as usual.
--
--   * qr_ordering_settings: one row per branch, on or off.
--   * qr_tables: a branch's tables, each with a long random code that the QR holds (replaceable).
--   * qr_orders: what customers sent, waiting for staff. Prices come from the menu, never the customer.
--   * open_orders.table_label: the table an order is for, printed on the kitchen ticket and the bill.
--   * No table is open to the app or to anonymous callers. The three customer functions are for the
--     server only (service role; the public page reaches them through /api/public); staff use the
--     others, which check the signed-in role and branch.
-- Idempotent: safe to run twice.

ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS table_label text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'open_orders_table_label_check') THEN
    ALTER TABLE public.open_orders ADD CONSTRAINT open_orders_table_label_check
      CHECK (table_label IS NULL OR length(btrim(table_label)) BETWEEN 1 AND 20);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.qr_ordering_settings (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id)
);
ALTER TABLE public.qr_ordering_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_ordering_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_ordering_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.qr_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 20),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9a-f]{20}$'),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_tables_label_once UNIQUE (tenant_id, branch_id, label)
);
CREATE INDEX IF NOT EXISTS qr_tables_branch_idx ON public.qr_tables (tenant_id, branch_id, sort_order);
ALTER TABLE public.qr_tables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_tables FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_tables TO service_role;

CREATE TABLE IF NOT EXISTS public.qr_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  table_id uuid NOT NULL REFERENCES public.qr_tables(id),
  table_label text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  customer_name text CHECK (customer_name IS NULL OR length(btrim(customer_name)) BETWEEN 1 AND 60),
  note text CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 200),
  items jsonb NOT NULL,
  total numeric(12, 2) NOT NULL CHECK (total >= 0),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 12 AND 80),
  open_order_id uuid,
  decided_by text,
  decided_at timestamptz,
  decline_reason text CHECK (decline_reason IS NULL OR length(decline_reason) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_orders_request_once UNIQUE (table_id, request_key)
);
CREATE INDEX IF NOT EXISTS qr_orders_branch_idx ON public.qr_orders (tenant_id, branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS qr_orders_table_idx ON public.qr_orders (table_id, created_at DESC);
ALTER TABLE public.qr_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_orders TO service_role;

-- An order nobody has answered for this long is treated as expired.
CREATE OR REPLACE FUNCTION public.qr_order_window() RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '3 hours' $$;

-- Is the signed-in login allowed to work with this branch's table orders (p_manage: set them up)?
CREATE OR REPLACE FUNCTION public.qr_staff_ok(p_tenant_id uuid, p_branch_id uuid, p_manage boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(auth.uid() IS NOT NULL
    AND public.auth_can_access_branch(p_tenant_id, p_branch_id)
    AND public.auth_role() = ANY (CASE WHEN p_manage THEN ARRAY['owner', 'admin', 'manager'] ELSE ARRAY['owner', 'admin', 'manager', 'cashier'] END), false);
$$;

CREATE OR REPLACE FUNCTION public.qr_staff_name() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT nullif(btrim(s.name), '') FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active'
    AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1), 'Staff');
$$;

-- ── Customer functions (the server only) ─────────────────────────────────────

-- The menu for a table, or null when the code is unknown, the table is switched off or the branch
-- does not take table orders. Only items that can be ordered now.
CREATE OR REPLACE FUNCTION public.qr_public_menu(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_t public.qr_tables%ROWTYPE; v_branch text;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN RETURN NULL; END IF;
  SELECT * INTO v_t FROM public.qr_tables WHERE code = p_code AND is_active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.qr_ordering_settings s WHERE s.tenant_id = v_t.tenant_id AND s.branch_id = v_t.branch_id AND s.enabled) THEN RETURN NULL; END IF;
  SELECT b.name INTO v_branch FROM public.branches b WHERE b.id = v_t.branch_id AND b.is_active;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'branch', v_branch,
    'table', v_t.label,
    'categories', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
      FROM public.categories c WHERE c.tenant_id = v_t.tenant_id AND (c.branch_id IS NULL OR c.branch_id = v_t.branch_id)
        AND EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id AND p.tenant_id = v_t.tenant_id AND p.branch_id = v_t.branch_id
          AND p.is_active AND p.is_available IS NOT FALSE)), '[]'::jsonb),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'price', p.price, 'category_id', p.category_id) ORDER BY p.name)
      FROM public.products p WHERE p.tenant_id = v_t.tenant_id AND p.branch_id = v_t.branch_id AND p.is_active AND p.is_available IS NOT FALSE), '[]'::jsonb));
END $$;

-- Places an order for a table. Lines are {product_id, qty}; names and prices come from the menu.
-- A repeated request key returns the first order. Too many waiting orders for a table are refused.
-- Errors: QR_CLOSED (code unknown or ordering off), QR_INVALID, QR_ITEM_GONE, QR_BUSY.
CREATE OR REPLACE FUNCTION public.qr_place_order(p_code text, p_items jsonb, p_customer_name text, p_note text, p_request_key text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_t public.qr_tables%ROWTYPE; v_name text := nullif(btrim(coalesce(p_customer_name, '')), ''); v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_existing public.qr_orders%ROWTYPE; v_lines jsonb; v_asked integer; v_found integer; v_total numeric(12, 2); v_id uuid;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9a-f]{20}$' THEN RAISE EXCEPTION 'QR_CLOSED' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_t FROM public.qr_tables WHERE code = p_code AND is_active;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.qr_ordering_settings s WHERE s.tenant_id = v_t.tenant_id AND s.branch_id = v_t.branch_id AND s.enabled) THEN
    RAISE EXCEPTION 'QR_CLOSED' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(length(p_request_key), 0) NOT BETWEEN 12 AND 80 OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 OR coalesce(length(v_name), 0) > 60 OR coalesce(length(v_note), 0) > 200 THEN
    RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM public.qr_orders WHERE table_id = v_t.id AND request_key = p_request_key;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'total', v_existing.total, 'table', v_existing.table_label);
  END IF;
  -- One at a time per table, so the limits below cannot be passed by two orders at once.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_t.id::text, 330));
  IF (SELECT count(*) FROM public.qr_orders o WHERE o.table_id = v_t.id AND o.status = 'pending' AND o.created_at > now() - public.qr_order_window()) >= 3
     OR (SELECT count(*) FROM public.qr_orders o WHERE o.table_id = v_t.id AND o.created_at > now() - interval '10 minutes') >= 6 THEN
    RAISE EXCEPTION 'QR_BUSY' USING ERRCODE = '53400';
  END IF;
  BEGIN
    -- Every line must be a product and a quantity of 1 to 20; nothing is dropped quietly.
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS x(product_id uuid, qty integer) WHERE x.product_id IS NULL OR x.qty IS NULL OR x.qty NOT BETWEEN 1 AND 20) THEN
      RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023';
    END IF;
    WITH asked AS (
      SELECT x.product_id, least(sum(x.qty), 20)::integer AS qty
        FROM jsonb_to_recordset(p_items) AS x(product_id uuid, qty integer)
       WHERE x.product_id IS NOT NULL AND x.qty BETWEEN 1 AND 20
       GROUP BY x.product_id)
    SELECT count(*), count(p.id), coalesce(sum(p.price * a.qty), 0),
           jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'price', p.price, 'qty', a.qty) ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL)
      INTO v_asked, v_found, v_total, v_lines
      FROM asked a
      LEFT JOIN public.products p ON p.id = a.product_id AND p.tenant_id = v_t.tenant_id AND p.branch_id = v_t.branch_id AND p.is_active AND p.is_available IS NOT FALSE;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
    RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023';
  END;
  IF v_asked IS NULL OR v_asked = 0 THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023'; END IF;
  IF v_found <> v_asked THEN RAISE EXCEPTION 'QR_ITEM_GONE' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.qr_orders (tenant_id, branch_id, table_id, table_label, customer_name, note, items, total, request_key)
  VALUES (v_t.tenant_id, v_t.branch_id, v_t.id, v_t.label, v_name, v_note, v_lines, v_total, p_request_key)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'status', 'pending', 'total', v_total, 'table', v_t.label);
END $$;

-- Where an order stands, for the customer's page: pending, accepted, declined or expired.
CREATE OR REPLACE FUNCTION public.qr_order_status(p_code text, p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'status', CASE WHEN o.status = 'pending' AND o.created_at <= now() - public.qr_order_window() THEN 'expired' ELSE o.status END,
    'reason', o.decline_reason)
  FROM public.qr_orders o JOIN public.qr_tables t ON t.id = o.table_id
  WHERE o.id = p_order_id AND t.code = p_code;
$$;

-- ── Staff functions ──────────────────────────────────────────────────────────

-- On or off, and the tables with their codes. Owners, admins and managers.
CREATE OR REPLACE FUNCTION public.qr_settings_get(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.qr_staff_ok(p_tenant_id, p_branch_id, true) THEN RAISE EXCEPTION 'QR_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'enabled', coalesce((SELECT s.enabled FROM public.qr_ordering_settings s WHERE s.tenant_id = p_tenant_id AND s.branch_id = p_branch_id), false),
    'tables', coalesce((SELECT jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'code', t.code, 'is_active', t.is_active) ORDER BY t.sort_order, t.created_at)
      FROM public.qr_tables t WHERE t.tenant_id = p_tenant_id AND t.branch_id = p_branch_id), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.qr_set_enabled(p_tenant_id uuid, p_branch_id uuid, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.qr_staff_ok(p_tenant_id, p_branch_id, true) THEN RAISE EXCEPTION 'QR_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.qr_ordering_settings (tenant_id, branch_id, enabled, updated_by, updated_at)
  VALUES (p_tenant_id, p_branch_id, p_enabled, auth.uid(), now())
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
  RETURN p_enabled;
END $$;

-- Adds tables by label (a label that is already there is left alone). At most 100 tables a branch.
CREATE OR REPLACE FUNCTION public.qr_add_tables(p_tenant_id uuid, p_branch_id uuid, p_labels text[])
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_label text; v_added integer := 0; v_next integer; v_n integer;
BEGIN
  IF NOT public.qr_staff_ok(p_tenant_id, p_branch_id, true) THEN RAISE EXCEPTION 'QR_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_labels IS NULL OR coalesce(array_length(p_labels, 1), 0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || p_branch_id::text, 331));
  SELECT count(*), coalesce(max(sort_order), 0) + 1 INTO v_n, v_next FROM public.qr_tables WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;
  FOREACH v_label IN ARRAY p_labels LOOP
    v_label := btrim(v_label);
    IF length(v_label) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023'; END IF;
    IF v_n + v_added >= 100 THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.qr_tables (tenant_id, branch_id, label, code, sort_order)
    VALUES (p_tenant_id, p_branch_id, v_label, substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), v_next)
    ON CONFLICT ON CONSTRAINT qr_tables_label_once DO NOTHING;
    IF FOUND THEN v_added := v_added + 1; v_next := v_next + 1; END IF;
  END LOOP;
  RETURN v_added;
END $$;

-- Renames a table, switches it on or off, or gives it a new code (the old printed QR stops working).
CREATE OR REPLACE FUNCTION public.qr_update_table(p_tenant_id uuid, p_branch_id uuid, p_id uuid, p_label text, p_active boolean, p_new_code boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_label text := nullif(btrim(coalesce(p_label, '')), '');
BEGIN
  IF NOT public.qr_staff_ok(p_tenant_id, p_branch_id, true) THEN RAISE EXCEPTION 'QR_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF v_label IS NOT NULL AND length(v_label) > 20 THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023'; END IF;
  UPDATE public.qr_tables t SET
    label = coalesce(v_label, t.label),
    is_active = coalesce(p_active, t.is_active),
    code = CASE WHEN p_new_code IS TRUE THEN substr(replace(gen_random_uuid()::text, '-', ''), 1, 20) ELSE t.code END
   WHERE t.id = p_id AND t.tenant_id = p_tenant_id AND t.branch_id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = 'P0002'; END IF;
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'QR_DUPLICATE' USING ERRCODE = '23505';
END $$;

-- Whether the branch takes table orders, and the ones waiting, oldest first. Anyone at the till.
CREATE OR REPLACE FUNCTION public.qr_pending(p_tenant_id uuid, p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_on boolean;
BEGIN
  IF NOT public.qr_staff_ok(p_tenant_id, p_branch_id, false) THEN RAISE EXCEPTION 'QR_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  v_on := coalesce((SELECT s.enabled FROM public.qr_ordering_settings s WHERE s.tenant_id = p_tenant_id AND s.branch_id = p_branch_id), false);
  RETURN jsonb_build_object('enabled', v_on, 'orders', CASE WHEN NOT v_on THEN '[]'::jsonb ELSE coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'table', o.table_label, 'customer_name', o.customer_name, 'note', o.note,
        'items', o.items, 'total', o.total, 'created_at', o.created_at) ORDER BY o.created_at)
      FROM (SELECT * FROM public.qr_orders q WHERE q.tenant_id = p_tenant_id AND q.branch_id = p_branch_id AND q.status = 'pending'
              AND q.created_at > now() - public.qr_order_window() ORDER BY q.created_at LIMIT 30) o), '[]'::jsonb) END);
END $$;

-- Accepts a waiting order: its items join the table's open order (kitchen sent or not yet), or start a
-- new one. The items are not yet sent to the kitchen; the till does that next. Repeating it returns the
-- same order. Errors: QR_FORBIDDEN, QR_INVALID (no such waiting order), QR_DECIDED, QR_EXPIRED.
CREATE OR REPLACE FUNCTION public.qr_accept(p_tenant_id uuid, p_branch_id uuid, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_o public.qr_orders%ROWTYPE; v_open uuid; v_merged boolean := false; v_line jsonb;
BEGIN
  IF NOT public.qr_staff_ok(p_tenant_id, p_branch_id, false) THEN RAISE EXCEPTION 'QR_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_o FROM public.qr_orders WHERE id = p_order_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = 'P0002'; END IF;
  IF v_o.status = 'accepted' AND v_o.open_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('open_order_id', v_o.open_order_id, 'table', v_o.table_label, 'merged', false);
  END IF;
  IF v_o.status <> 'pending' THEN RAISE EXCEPTION 'QR_DECIDED' USING ERRCODE = '22023'; END IF;
  IF v_o.created_at <= now() - public.qr_order_window() THEN RAISE EXCEPTION 'QR_EXPIRED' USING ERRCODE = '22023'; END IF;
  SELECT o.id INTO v_open FROM public.open_orders o
   WHERE o.tenant_id = p_tenant_id AND o.branch_id = p_branch_id AND o.table_label = v_o.table_label AND o.status IN ('draft', 'open', 'in_kitchen')
   ORDER BY o.created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    v_merged := true;
  ELSE
    INSERT INTO public.open_orders (tenant_id, branch_id, order_name, status, table_label, customer_name, notes)
    VALUES (p_tenant_id, p_branch_id, 'Draft Order', 'draft', v_o.table_label, v_o.customer_name, v_o.note)
    RETURNING id INTO v_open;
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_o.items) LOOP
    INSERT INTO public.open_order_items (open_order_id, product_id, item_name, price, qty, kot_sent)
    VALUES (v_open, (v_line->>'product_id')::uuid, v_line->>'name', (v_line->>'price')::numeric, (v_line->>'qty')::integer, false);
  END LOOP;
  UPDATE public.qr_orders SET status = 'accepted', open_order_id = v_open, decided_by = public.qr_staff_name(), decided_at = now() WHERE id = v_o.id;
  RETURN jsonb_build_object('open_order_id', v_open, 'table', v_o.table_label, 'merged', v_merged);
END $$;

CREATE OR REPLACE FUNCTION public.qr_decline(p_tenant_id uuid, p_branch_id uuid, p_order_id uuid, p_reason text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.qr_staff_ok(p_tenant_id, p_branch_id, false) THEN RAISE EXCEPTION 'QR_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF coalesce(length(v_reason), 0) > 100 THEN RAISE EXCEPTION 'QR_INVALID' USING ERRCODE = '22023'; END IF;
  UPDATE public.qr_orders SET status = 'declined', decline_reason = v_reason, decided_by = public.qr_staff_name(), decided_at = now()
   WHERE id = p_order_id AND tenant_id = p_tenant_id AND branch_id = p_branch_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'QR_DECIDED' USING ERRCODE = '22023'; END IF;
  RETURN true;
END $$;

-- ── Grants ───────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.qr_order_window(), public.qr_staff_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_order_window(), public.qr_staff_name() TO service_role;
REVOKE ALL ON FUNCTION public.qr_staff_ok(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_staff_ok(uuid, uuid, boolean) TO service_role;
-- Customer functions: the server only.
REVOKE ALL ON FUNCTION public.qr_public_menu(text), public.qr_place_order(text, jsonb, text, text, text), public.qr_order_status(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_public_menu(text), public.qr_place_order(text, jsonb, text, text, text), public.qr_order_status(text, uuid) TO service_role;
-- Staff functions: signed-in logins (each checks its own role and branch).
REVOKE ALL ON FUNCTION public.qr_settings_get(uuid, uuid), public.qr_set_enabled(uuid, uuid, boolean), public.qr_add_tables(uuid, uuid, text[]),
  public.qr_update_table(uuid, uuid, uuid, text, boolean, boolean), public.qr_pending(uuid, uuid), public.qr_accept(uuid, uuid, uuid),
  public.qr_decline(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qr_settings_get(uuid, uuid), public.qr_set_enabled(uuid, uuid, boolean), public.qr_add_tables(uuid, uuid, text[]),
  public.qr_update_table(uuid, uuid, uuid, text, boolean, boolean), public.qr_pending(uuid, uuid), public.qr_accept(uuid, uuid, uuid),
  public.qr_decline(uuid, uuid, uuid, text) TO authenticated, service_role;
