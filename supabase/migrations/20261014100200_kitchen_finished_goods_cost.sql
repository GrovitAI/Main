-- Task 209: a cost per unit on finished goods, for the month's profit.
-- The owner types what one kg, litre or piece costs the kitchen to make. Each
-- send line keeps the cost of that day, so a later change of cost does not
-- rewrite past months. Lines are written only by the posting functions; the
-- trigger stamps the cost whatever the caller sends.

ALTER TABLE public.kitchen_items ADD COLUMN IF NOT EXISTS cost_price_paise bigint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_items_cost_price_range') THEN
    ALTER TABLE public.kitchen_items ADD CONSTRAINT kitchen_items_cost_price_range
      CHECK (cost_price_paise IS NULL OR cost_price_paise BETWEEN 0 AND 100000000000);
  END IF;
END $$;
COMMENT ON COLUMN public.kitchen_items.cost_price_paise IS 'What one unit costs the kitchen to make, paise; null when not set. Finished goods only.';

ALTER TABLE public.kitchen_entry_lines ADD COLUMN IF NOT EXISTS cost_paise bigint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_entry_lines_cost_range') THEN
    ALTER TABLE public.kitchen_entry_lines ADD CONSTRAINT kitchen_entry_lines_cost_range
      CHECK (cost_paise IS NULL OR cost_paise >= 0);
  END IF;
END $$;
COMMENT ON COLUMN public.kitchen_entry_lines.cost_paise IS 'Cost per unit of the item on the day of a send, paise; null for other entries or when no cost was set.';

CREATE OR REPLACE FUNCTION public.kitchen_line_cost_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.cost_paise := NULL;
  IF EXISTS (SELECT 1 FROM public.kitchen_entries e WHERE e.id = NEW.entry_id
      AND e.tenant_id = NEW.tenant_id AND e.branch_id = NEW.branch_id AND e.type = 'sent') THEN
    SELECT i.cost_price_paise INTO NEW.cost_paise FROM public.kitchen_items i
      WHERE i.id = NEW.item_id AND i.tenant_id = NEW.tenant_id AND i.branch_id = NEW.branch_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_line_cost_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS kitchen_line_cost_snapshot ON public.kitchen_entry_lines;
CREATE TRIGGER kitchen_line_cost_snapshot BEFORE INSERT ON public.kitchen_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_line_cost_snapshot();
