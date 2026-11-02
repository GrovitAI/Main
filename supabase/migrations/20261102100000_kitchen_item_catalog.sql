-- Task 295: the kitchen's item catalogue (owner's lists, 2026-11-01/02).
--   * kitchen_purchase_categories.scope: 'spend' (the Spent and Bought list, as before) or 'goods'
--     (finished goods' categories: Bases, Cheese bombs, Sauces). The spending pickers read only
--     'spend'. Raw materials sit under spending categories (Food > Dairy, Packaging), so a buy
--     can be filed by what was bought.
--   * kitchen_items.category_id: the item's category, of its own scope (raw: spend, finished: goods).
--   * kitchen_items.packing_price_paise: an optional packing cost on a finished good, beside its
--     rate (cost_price_paise). A send line's cost is now rate + packing.
--   * kitchen_vendor_items: the items a vendor usually supplies, offered first when buying from them.
-- Idempotent: safe to run twice.

ALTER TABLE public.kitchen_purchase_categories ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'spend';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_purchase_categories_scope_check') THEN
    ALTER TABLE public.kitchen_purchase_categories ADD CONSTRAINT kitchen_purchase_categories_scope_check
      CHECK (scope IN ('spend', 'goods'));
  END IF;
  -- Goods categories are one level and ask for nothing.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_purchase_categories_goods_shape') THEN
    ALTER TABLE public.kitchen_purchase_categories ADD CONSTRAINT kitchen_purchase_categories_goods_shape
      CHECK (scope = 'spend' OR (parent_id IS NULL AND asks IS NULL));
  END IF;
END $$;

ALTER TABLE public.kitchen_items ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE public.kitchen_items ADD COLUMN IF NOT EXISTS packing_price_paise bigint;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_items_category_fk') THEN
    ALTER TABLE public.kitchen_items ADD CONSTRAINT kitchen_items_category_fk
      FOREIGN KEY (category_id, tenant_id, branch_id) REFERENCES public.kitchen_purchase_categories (id, tenant_id, branch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_items_packing_price_range') THEN
    ALTER TABLE public.kitchen_items ADD CONSTRAINT kitchen_items_packing_price_range
      CHECK (packing_price_paise IS NULL OR packing_price_paise BETWEEN 0 AND 100000000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_items_id_tenant_id_branch_id_key') THEN
    ALTER TABLE public.kitchen_items ADD CONSTRAINT kitchen_items_id_tenant_id_branch_id_key UNIQUE (id, tenant_id, branch_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_parties_id_tenant_id_branch_id_key') THEN
    ALTER TABLE public.kitchen_parties ADD CONSTRAINT kitchen_parties_id_tenant_id_branch_id_key UNIQUE (id, tenant_id, branch_id);
  END IF;
END $$;
COMMENT ON COLUMN public.kitchen_items.cost_price_paise IS 'Finished goods: what one unit costs to make (the rate), paise, without packing; null when not set.';
COMMENT ON COLUMN public.kitchen_items.packing_price_paise IS 'Finished goods: packing for one unit, paise; null when there is none. Added to the rate for the cost.';
CREATE INDEX IF NOT EXISTS kitchen_items_category_idx ON public.kitchen_items (tenant_id, branch_id, category_id);

-- An item's category is of its own scope: raw materials under spending, finished goods under goods.
CREATE OR REPLACE FUNCTION public.kitchen_item_category_check()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_scope text;
BEGIN
  IF NEW.category_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.scope INTO v_scope FROM public.kitchen_purchase_categories c
   WHERE c.id = NEW.category_id AND c.tenant_id = NEW.tenant_id AND c.branch_id = NEW.branch_id;
  IF v_scope IS DISTINCT FROM (CASE WHEN NEW.item_kind = 'finished_good' THEN 'goods' ELSE 'spend' END) THEN
    RAISE EXCEPTION 'KITCHEN_ITEM_CATEGORY' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_item_category_check() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS kitchen_item_category_check ON public.kitchen_items;
CREATE TRIGGER kitchen_item_category_check BEFORE INSERT OR UPDATE OF category_id, item_kind ON public.kitchen_items
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_item_category_check();

-- As in 20261014100200_kitchen_finished_goods_cost.sql, with packing added to the rate. No rate
-- set still means no cost (packing alone is not the cost of the item).
CREATE OR REPLACE FUNCTION public.kitchen_line_cost_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.cost_paise := NULL;
  IF EXISTS (SELECT 1 FROM public.kitchen_entries e WHERE e.id = NEW.entry_id
      AND e.tenant_id = NEW.tenant_id AND e.branch_id = NEW.branch_id AND e.type = 'sent') THEN
    SELECT i.cost_price_paise + coalesce(i.packing_price_paise, 0) INTO NEW.cost_paise FROM public.kitchen_items i
      WHERE i.id = NEW.item_id AND i.tenant_id = NEW.tenant_id AND i.branch_id = NEW.branch_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_line_cost_snapshot() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.kitchen_vendor_items (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  party_id uuid NOT NULL,
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, party_id, item_id),
  CONSTRAINT kitchen_vendor_items_party_fk FOREIGN KEY (party_id, tenant_id, branch_id)
    REFERENCES public.kitchen_parties (id, tenant_id, branch_id) ON DELETE CASCADE,
  CONSTRAINT kitchen_vendor_items_item_fk FOREIGN KEY (item_id, tenant_id, branch_id)
    REFERENCES public.kitchen_items (id, tenant_id, branch_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS kitchen_vendor_items_item_idx ON public.kitchen_vendor_items (tenant_id, branch_id, item_id);

ALTER TABLE public.kitchen_vendor_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kitchen_vendor_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchen_vendor_items TO service_role;
GRANT SELECT, INSERT, DELETE ON public.kitchen_vendor_items TO authenticated;
DROP POLICY IF EXISTS kitchen_vendor_items_read ON public.kitchen_vendor_items;
CREATE POLICY kitchen_vendor_items_read ON public.kitchen_vendor_items FOR SELECT TO authenticated
  USING (public.kitchen_can_use(tenant_id, branch_id));
DROP POLICY IF EXISTS kitchen_vendor_items_add ON public.kitchen_vendor_items;
CREATE POLICY kitchen_vendor_items_add ON public.kitchen_vendor_items FOR INSERT TO authenticated
  WITH CHECK (public.kitchen_can(tenant_id, branch_id, 'setup.parties'));
DROP POLICY IF EXISTS kitchen_vendor_items_remove ON public.kitchen_vendor_items;
CREATE POLICY kitchen_vendor_items_remove ON public.kitchen_vendor_items FOR DELETE TO authenticated
  USING (public.kitchen_can(tenant_id, branch_id, 'setup.parties'));
