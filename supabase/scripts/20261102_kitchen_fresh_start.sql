-- Task 295: the Central Kitchen's fresh start (owner, 2026-11-02: "it only has test data").
-- Run ONCE, after migration 20261102100000_kitchen_item_catalog.sql, in the SQL editor.
-- For every CENTRAL_KITCHEN branch, in one transaction:
--   1. clears the kitchen's test data: entries and their lines, invoices and payments, cash and
--      bank, drawings, attendance and its staff list, spending particulars, the audit log, items,
--      branches and vendors. Logins, permissions, the day lock and the spending categories stay.
--   2. adds Food's sub-categories and the finished goods' categories.
--   3. adds the items (owner's lists; units of raw materials are first guesses to confirm),
--      the vendors with the items each usually supplies, and the two restaurant branches.
-- It stops without changing anything if the catalogue is already there (vendors' usual items exist:
-- only this script and the app after it make them), so running it again can never clear real data.

BEGIN;

DO $$
DECLARE
  k record;
  v_food uuid; v_pack uuid; v_clean uuid;
  v_cat jsonb;
  v_item record;
  v_vendor record;
  v_party uuid;
  v_ids jsonb := '{}'::jsonb;
  v_cats jsonb;
BEGIN
  FOR k IN SELECT b.id, b.tenant_id FROM public.branches b WHERE b.branch_type = 'CENTRAL_KITCHEN' LOOP
    IF EXISTS (SELECT 1 FROM public.kitchen_vendor_items v WHERE v.tenant_id = k.tenant_id AND v.branch_id = k.id) THEN
      RAISE EXCEPTION 'The catalogue is already in this kitchen; nothing was changed.';
    END IF;

    -- 1. The test data.
    DELETE FROM public.kitchen_allocations WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_invoice_payments WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_invoice_deliveries WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_invoices WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_invoice_counters WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_entry_lines WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    UPDATE public.kitchen_entries SET replaces_id = NULL WHERE tenant_id = k.tenant_id AND branch_id = k.id AND replaces_id IS NOT NULL;
    DELETE FROM public.kitchen_entries WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_money_moves WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_money_openings WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_drawings WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_attendance WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_staff_roster WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_particulars WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_audit_log WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_vendor_items WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_items WHERE tenant_id = k.tenant_id AND branch_id = k.id;
    DELETE FROM public.kitchen_parties WHERE tenant_id = k.tenant_id AND branch_id = k.id;

    -- 2. Categories. Top-level spending ones are found by name (or added); Food gets its groups.
    FOR v_cat IN SELECT * FROM jsonb_array_elements('["Food", "Packaging", "Cleaning"]'::jsonb) LOOP
      UPDATE public.kitchen_purchase_categories SET is_active = true
       WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(btrim(name)) = lower(v_cat #>> '{}') AND parent_id IS NULL;
      IF NOT FOUND THEN
        INSERT INTO public.kitchen_purchase_categories (tenant_id, branch_id, name) VALUES (k.tenant_id, k.id, v_cat #>> '{}');
      END IF;
    END LOOP;
    SELECT id INTO v_food FROM public.kitchen_purchase_categories WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(name) = 'food' AND parent_id IS NULL AND is_active ORDER BY created_at LIMIT 1;
    SELECT id INTO v_pack FROM public.kitchen_purchase_categories WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(name) = 'packaging' AND parent_id IS NULL AND is_active ORDER BY created_at LIMIT 1;
    SELECT id INTO v_clean FROM public.kitchen_purchase_categories WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(name) = 'cleaning' AND parent_id IS NULL AND is_active ORDER BY created_at LIMIT 1;
    v_cats := jsonb_build_object('Packaging', v_pack, 'Cleaning', v_clean);

    FOR v_cat IN SELECT * FROM jsonb_array_elements('["Dairy", "Chocolate & spreads", "Sponges & flakes", "Powders & custard", "Nuts", "Fruit", "Oils", "Arabic sweets"]'::jsonb) LOOP
      UPDATE public.kitchen_purchase_categories SET is_active = true, parent_id = v_food, scope = 'spend'
       WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(btrim(name)) = lower(v_cat #>> '{}');
      IF NOT FOUND THEN
        INSERT INTO public.kitchen_purchase_categories (tenant_id, branch_id, name, parent_id) VALUES (k.tenant_id, k.id, v_cat #>> '{}', v_food);
      END IF;
      v_cats := v_cats || jsonb_build_object(v_cat #>> '{}', (SELECT id FROM public.kitchen_purchase_categories WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(btrim(name)) = lower(v_cat #>> '{}') AND is_active LIMIT 1));
    END LOOP;

    FOR v_cat IN SELECT * FROM jsonb_array_elements('["Bases", "Cheese bombs", "Sauces"]'::jsonb) LOOP
      UPDATE public.kitchen_purchase_categories SET is_active = true, parent_id = NULL, asks = NULL, scope = 'goods'
       WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(btrim(name)) = lower(v_cat #>> '{}');
      IF NOT FOUND THEN
        INSERT INTO public.kitchen_purchase_categories (tenant_id, branch_id, name, scope) VALUES (k.tenant_id, k.id, v_cat #>> '{}', 'goods');
      END IF;
      v_cats := v_cats || jsonb_build_object(v_cat #>> '{}', (SELECT id FROM public.kitchen_purchase_categories WHERE tenant_id = k.tenant_id AND branch_id = k.id AND lower(btrim(name)) = lower(v_cat #>> '{}') AND is_active LIMIT 1));
    END LOOP;

    -- 3. Items: name, kind, unit, category, branch price, rate, packing (rupees; null = not known yet).
    FOR v_item IN SELECT * FROM (VALUES
      -- Finished goods (owner's selling-price and cost sheets).
      ('Fazea base',            'finished_good', 'pcs', 'Bases',        140::numeric, 91.57::numeric, 11::numeric),
      ('De Paris base',         'finished_good', 'pcs', 'Bases',        121, 83.19, 11),
      ('CDC base',              'finished_good', 'pcs', 'Bases',        100, 43.80, 9.32),
      ('Qashtuta base',         'finished_good', 'pcs', 'Bases',        142, 31.75, 11.21),
      ('Lazy Cat base',         'finished_good', 'pcs', 'Bases',        150, 120, 8),
      ('PBC base',              'finished_good', 'pcs', 'Bases',        200, 172.64, 9.32),
      ('Custard base',          'finished_good', 'pcs', 'Bases',        NULL, NULL, NULL),
      ('Cheese bomb',           'finished_good', 'pcs', 'Cheese bombs', 182, NULL, NULL),
      ('Milo cheese bomb',      'finished_good', 'pcs', 'Cheese bombs', 192, NULL, NULL),
      ('Fazea sauce',           'finished_good', 'kg',  'Sauces',       750, NULL, NULL),
      -- Raw materials (bought). A branch price only where it is also sold to branches.
      ('Whipping cream',        'raw_material',  'L',   'Dairy',        NULL, NULL, NULL),
      ('Milk Maid',             'raw_material',  'pcs', 'Dairy',        NULL, NULL, NULL),
      ('Cream cheese',          'raw_material',  'kg',  'Dairy',        NULL, NULL, NULL),
      ('Fresh cream',           'raw_material',  'L',   'Dairy',        NULL, NULL, NULL),
      ('Milk',                  'raw_material',  'L',   'Dairy',        NULL, NULL, NULL),
      ('Milk chocolate',        'raw_material',  'kg',  'Chocolate & spreads', NULL, NULL, NULL),
      ('Milo powder',           'raw_material',  'kg',  'Chocolate & spreads', NULL, NULL, NULL),
      ('Nutella',               'raw_material',  'kg',  'Chocolate & spreads', NULL, NULL, NULL),
      ('Pista sauce',           'raw_material',  'kg',  'Chocolate & spreads', 1350, NULL, NULL),
      ('Truffle',               'raw_material',  'kg',  'Chocolate & spreads', NULL, NULL, NULL),
      ('Vanilla sponge',        'raw_material',  'pcs', 'Sponges & flakes', NULL, NULL, NULL),
      ('Chocolate sponge',      'raw_material',  'pcs', 'Sponges & flakes', NULL, NULL, NULL),
      ('Feilettine flakes',     'raw_material',  'kg',  'Sponges & flakes', NULL, NULL, NULL),
      ('Vanilla powder',        'raw_material',  'kg',  'Powders & custard', NULL, NULL, NULL),
      ('Custard powder',        'raw_material',  'kg',  'Powders & custard', NULL, NULL, NULL),
      ('Custard',               'raw_material',  'kg',  'Powders & custard', NULL, NULL, NULL),
      ('Pista nuts',            'raw_material',  'kg',  'Nuts',         NULL, NULL, NULL),
      ('Cashew nuts',           'raw_material',  'kg',  'Nuts',         NULL, NULL, NULL),
      ('Mango pulp',            'raw_material',  'kg',  'Fruit',        NULL, NULL, NULL),
      ('Oil',                   'raw_material',  'L',   'Oils',         NULL, NULL, NULL),
      ('Kunafa',                'raw_material',  'kg',  'Arabic sweets', 650, NULL, NULL),
      ('Baklava',               'raw_material',  'pcs', 'Arabic sweets', 365, NULL, NULL),
      ('750 g round container', 'raw_material',  'pcs', 'Packaging',    NULL, NULL, NULL),
      ('600 g rectangle container', 'raw_material', 'pcs', 'Packaging', NULL, NULL, NULL),
      ('Fazea inner',           'raw_material',  'pcs', 'Packaging',    NULL, NULL, NULL),
      ('De Paris inner',        'raw_material',  'pcs', 'Packaging',    NULL, NULL, NULL),
      ('Gloves',                'raw_material',  'pcs', 'Cleaning',     NULL, NULL, NULL),
      ('Garbage bags',          'raw_material',  'pcs', 'Cleaning',     NULL, NULL, NULL)
    ) AS t(name, kind, unit, category, sell, rate, packing) LOOP
      INSERT INTO public.kitchen_items (tenant_id, branch_id, name, item_kind, unit, category_id, sell_price_paise, cost_price_paise, packing_price_paise, stock)
      VALUES (k.tenant_id, k.id, v_item.name, v_item.kind, v_item.unit, (v_cats ->> v_item.category)::uuid,
              round(v_item.sell * 100)::bigint, round(v_item.rate * 100)::bigint, round(v_item.packing * 100)::bigint, 0);
    END LOOP;
    SELECT jsonb_object_agg(i.name, i.id) INTO v_ids FROM public.kitchen_items i WHERE i.tenant_id = k.tenant_id AND i.branch_id = k.id;

    -- 4. Vendors, their usual category and items; the restaurant branches the kitchen sends to.
    FOR v_vendor IN SELECT * FROM (VALUES
      ('Tezz', 'Food', '["Whipping cream", "Milk chocolate", "Milk Maid", "Cream cheese", "Milo powder", "Fresh cream", "Vanilla powder", "Feilettine flakes", "Pista nuts", "Cashew nuts"]'),
      ('Rotticious', 'Food', '["Vanilla sponge", "Chocolate sponge"]'),
      ('Venus', 'Food', '["Vanilla powder", "Custard powder", "Mango pulp"]'),
      ('Flavourmart', 'Food', '["Pista sauce"]'),
      ('Atlas Distributors', 'Food', '["Nutella"]'),
      ('JN Traders', 'Food', '["Kunafa"]'),
      ('Nasco', 'Food', '["Kunafa", "Baklava"]'),
      ('Falcon Pack', 'Packaging', '["Fazea inner", "De Paris inner"]'),
      ('Pooja Plastic', 'Packaging', '["750 g round container", "600 g rectangle container", "Gloves", "Garbage bags"]')
    ) AS t(name, category, items) LOOP
      INSERT INTO public.kitchen_parties (tenant_id, branch_id, kind, name, purchase_category_id)
      VALUES (k.tenant_id, k.id, 'vendor', v_vendor.name, CASE v_vendor.category WHEN 'Food' THEN v_food ELSE v_pack END)
      RETURNING id INTO v_party;
      INSERT INTO public.kitchen_vendor_items (tenant_id, branch_id, party_id, item_id)
      SELECT k.tenant_id, k.id, v_party, (v_ids ->> x)::uuid FROM jsonb_array_elements_text(v_vendor.items::jsonb) x;
    END LOOP;
    INSERT INTO public.kitchen_parties (tenant_id, branch_id, kind, name)
    SELECT k.tenant_id, k.id, 'branch', b.name FROM public.branches b
     WHERE b.tenant_id = k.tenant_id AND b.branch_type = 'RESTAURANT' AND coalesce(b.is_active, true);
  END LOOP;
END $$;

COMMIT;
