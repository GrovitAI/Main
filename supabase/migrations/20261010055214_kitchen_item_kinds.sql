-- Staging first: explicit stock classification; existing quantities and entries stay intact.
ALTER TABLE public.kitchen_items ADD COLUMN IF NOT EXISTS item_kind text;

-- The approved client scope alone is classified. Other tenants' legacy rows
-- remain nullable until their own rollout; application reads retain compatibility.
DO $backfill$
DECLARE target record;
BEGIN
  SELECT b.tenant_id, b.id AS branch_id INTO STRICT target
  FROM public.branches b JOIN public.tenants t ON t.id = b.tenant_id
  WHERE t.slug = 'leleban' AND b.branch_type = 'CENTRAL_KITCHEN';
  UPDATE public.kitchen_items i
SET item_kind = CASE WHEN i.sell_price_paise IS NOT NULL OR EXISTS (
  SELECT 1 FROM public.kitchen_entries e
  WHERE e.tenant_id = i.tenant_id AND e.branch_id = i.branch_id
    AND ((e.type = 'made' AND e.item_id = i.id) OR (e.type = 'sent' AND EXISTS (
      SELECT 1 FROM public.kitchen_entry_lines l
      WHERE l.tenant_id = i.tenant_id AND l.branch_id = i.branch_id
        AND l.entry_id = e.id AND l.item_id = i.id
    )))
) THEN 'finished_good' ELSE 'raw_material' END
WHERE i.item_kind IS NULL AND i.tenant_id = target.tenant_id AND i.branch_id = target.branch_id;
END $backfill$;

ALTER TABLE public.kitchen_items ALTER COLUMN item_kind SET DEFAULT 'raw_material';
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.kitchen_items'::regclass AND conname = 'kitchen_items_kind_check') THEN
    ALTER TABLE public.kitchen_items ADD CONSTRAINT kitchen_items_kind_check CHECK (item_kind IN ('raw_material', 'finished_good'));
  END IF;
END $constraint$;

-- Keep posting/voiding atomic in the incumbent RPC, guarding only new batches.
CREATE OR REPLACE FUNCTION public.kitchen_batch_item_check()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF NEW.type = 'made' AND NOT EXISTS (
    SELECT 1 FROM public.kitchen_items i
    WHERE i.id = NEW.item_id AND i.tenant_id = NEW.tenant_id AND i.branch_id = NEW.branch_id
      -- Untouched legacy scopes keep their incumbent batch behavior.
      AND (i.item_kind = 'finished_good' OR i.item_kind IS NULL) AND i.is_active
  ) THEN
    RAISE EXCEPTION 'KITCHEN_FINISHED_GOODS_ONLY' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.kitchen_batch_item_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_batch_item_check() TO service_role;
DROP TRIGGER IF EXISTS kitchen_batch_item_check ON public.kitchen_entries;
CREATE TRIGGER kitchen_batch_item_check BEFORE INSERT ON public.kitchen_entries
  FOR EACH ROW WHEN (NEW.type = 'made') EXECUTE FUNCTION public.kitchen_batch_item_check();
