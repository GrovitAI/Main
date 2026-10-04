-- Central Kitchen, second cut (task 134):
--   1. kitchen_categories: the expense categories are the kitchen's own list,
--      added to from the Spent screen, instead of a fixed set in the app.
--   2. kitchen_edit_entry: an entry can be corrected. The old one is voided
--      with the reason "Edited", a new one is posted in the same transaction
--      with the corrected figures, and payments that covered the old buy or
--      send are re-attached to the new one as far as its amount allows.
--      kitchen_entries.replaces_id links the new entry to the one it replaced.
-- Idempotent: safe to run twice.

-- ---------------------------------------------------------------------------
-- 1. Expense categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  branch_id  uuid NOT NULL REFERENCES public.branches(id),
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  sort_order integer NOT NULL DEFAULT 100,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_categories_name_key
  ON public.kitchen_categories (tenant_id, branch_id, lower(btrim(name)));

ALTER TABLE public.kitchen_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_categories FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_categories TO service_role;
-- The app adds and renames categories and hides them; it never deletes one,
-- because old entries keep the name.
GRANT SELECT, INSERT, UPDATE ON public.kitchen_categories TO authenticated;

DROP POLICY IF EXISTS kitchen_categories_select ON public.kitchen_categories;
CREATE POLICY kitchen_categories_select ON public.kitchen_categories FOR SELECT
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_categories_insert ON public.kitchen_categories;
CREATE POLICY kitchen_categories_insert ON public.kitchen_categories FOR INSERT
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_categories_update ON public.kitchen_categories;
CREATE POLICY kitchen_categories_update ON public.kitchen_categories FOR UPDATE
  USING (public.kitchen_can_use(tenant_id, branch_id))
  WITH CHECK (public.kitchen_can_use(tenant_id, branch_id));

-- ---------------------------------------------------------------------------
-- 2. The link from a corrected entry to the one it replaced
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_entries
  ADD COLUMN IF NOT EXISTS replaces_id uuid REFERENCES public.kitchen_entries(id);
CREATE INDEX IF NOT EXISTS kitchen_entries_replaces_idx
  ON public.kitchen_entries (replaces_id) WHERE replaces_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Editing: void the old entry and post the corrected one, together
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_edit_entry(p_entry_id uuid, p jsonb)
RETURNS public.kitchen_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old    public.kitchen_entries%ROWTYPE;
  v_new    public.kitchen_entries%ROWTYPE;
  v_covers jsonb := '[]'::jsonb;
  v_alloc  record;
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

  PERFORM public.kitchen_void_entry(v_old.id, 'Edited');

  -- The corrected entry is posted exactly as a new one would be, in the old
  -- entry's branch whatever the payload says.
  v_new := public.kitchen_post_entry(p || jsonb_build_object('branch_id', v_old.branch_id::text));

  UPDATE public.kitchen_entries SET replaces_id = v_old.id WHERE id = v_new.id RETURNING * INTO v_new;

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
$$;
REVOKE ALL ON FUNCTION public.kitchen_edit_entry(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_edit_entry(uuid, jsonb) TO authenticated, service_role;
