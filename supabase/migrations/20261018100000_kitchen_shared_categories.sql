-- Task 255: Spent and Bought share one category list, kitchen_purchase_categories.
-- The app stops reading kitchen_categories (the old expense list), so its active names are
-- copied across once. A name already on the shared list is left alone; one that is there but
-- archived, with no active twin, comes back. Spent entries keep their category as text and
-- reports group by name, so nothing saved changes. kitchen_categories itself is kept.
-- Idempotent: running it again finds every name already present.

UPDATE public.kitchen_purchase_categories p
   SET is_active = true
 WHERE NOT p.is_active
   AND EXISTS (SELECT 1 FROM public.kitchen_categories c
                WHERE c.is_active AND c.tenant_id = p.tenant_id AND c.branch_id = p.branch_id
                  AND lower(btrim(c.name)) = lower(btrim(p.name)))
   AND NOT EXISTS (SELECT 1 FROM public.kitchen_purchase_categories q
                    WHERE q.is_active AND q.tenant_id = p.tenant_id AND q.branch_id = p.branch_id
                      AND lower(btrim(q.name)) = lower(btrim(p.name)))
   -- Only one archived twin per name comes back, the newest.
   AND p.id = (SELECT r.id FROM public.kitchen_purchase_categories r
                WHERE r.tenant_id = p.tenant_id AND r.branch_id = p.branch_id
                  AND lower(btrim(r.name)) = lower(btrim(p.name))
                ORDER BY r.created_at DESC, r.id LIMIT 1);

INSERT INTO public.kitchen_purchase_categories (tenant_id, branch_id, name)
SELECT DISTINCT ON (c.tenant_id, c.branch_id, lower(btrim(c.name))) c.tenant_id, c.branch_id, btrim(c.name)
  FROM public.kitchen_categories c
 WHERE c.is_active
   AND NOT EXISTS (SELECT 1 FROM public.kitchen_purchase_categories p
                    WHERE p.tenant_id = c.tenant_id AND p.branch_id = c.branch_id
                      AND lower(btrim(p.name)) = lower(btrim(c.name)))
 ORDER BY c.tenant_id, c.branch_id, lower(btrim(c.name)), c.sort_order, c.created_at;
