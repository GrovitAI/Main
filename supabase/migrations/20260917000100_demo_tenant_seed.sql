-- Demo restaurant for App Store / TestFlight review — Task 90.
--
-- Apple's reviewers must be able to sign in, and they must never see or touch
-- a real restaurant's books. This creates a second tenant, "Grovit Demo Cafe",
-- with one branch, a small menu and three weeks of sample bills. Every row
-- carries the demo tenant id, so the existing tenant-scoped RLS keeps it
-- apart from every real tenant in both directions.
--
-- It only inserts rows under the new tenant id and changes nothing else. It is
-- safe to run twice: if the demo tenant already exists it does nothing.
--
-- The demo login is NOT created here. Create the auth user in the Supabase
-- dashboard, then link it with 20260917000200_demo_tenant_owner.sql.

DO $$
DECLARE
  v_tenant  constant uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_branch  constant uuid := 'dddddddd-0000-0000-0000-0000000000b1';
  v_cat     uuid;
  v_bill    uuid;
  v_day     integer;
  v_n       integer;
  v_i       integer;
  v_items   integer;
  v_at      timestamptz;
  v_total   numeric;
  v_seq     integer := 0;
  v_pay     text;
  r_prod    record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant) THEN
    RAISE NOTICE 'Demo tenant already present; nothing to do.';
    RETURN;
  END IF;

  INSERT INTO public.tenants (id, name, slug, theme_color, theme_accent, layout, plan)
  VALUES (v_tenant, 'Grovit Demo Cafe', 'grovit-demo', '#1d4ed8', '#93c5fd', 'default', 'pos');

  INSERT INTO public.branches (id, tenant_id, name, address, branch_type, code, phone, invoice_prefix, is_active)
  VALUES (v_branch, v_tenant, 'Demo Branch', '1 Sample Street, Chennai', 'RESTAURANT', 'DEMO', '0000000000', 'DM', true);

  -- The cancel code hash is deliberately not the hash of anything: nobody can
  -- know a code that matches it, so manager-only actions stay locked.
  INSERT INTO public.pos_settings (tenant_id, branch_id, manager_cancel_code_hash, currency, tax_percentage, tax_rounding, timezone, inventory_tracking_enabled)
  VALUES (v_tenant, v_branch, md5(random()::text) || md5(random()::text), 'Rs.', 0, 'round_nearest', 'Asia/Kolkata', false);

  -- Menu: four categories, twelve items.
  INSERT INTO public.categories (tenant_id, branch_id, name) VALUES (v_tenant, v_branch, 'Hot Drinks') RETURNING id INTO v_cat;
  INSERT INTO public.products (tenant_id, branch_id, category_id, name, price, is_available, is_active, inventory_tracking_enabled) VALUES
    (v_tenant, v_branch, v_cat, 'Filter Coffee', 60, true, true, false),
    (v_tenant, v_branch, v_cat, 'Masala Chai', 40, true, true, false),
    (v_tenant, v_branch, v_cat, 'Hot Chocolate', 140, true, true, false);

  INSERT INTO public.categories (tenant_id, branch_id, name) VALUES (v_tenant, v_branch, 'Cold Drinks') RETURNING id INTO v_cat;
  INSERT INTO public.products (tenant_id, branch_id, category_id, name, price, is_available, is_active, inventory_tracking_enabled) VALUES
    (v_tenant, v_branch, v_cat, 'Fresh Lime Soda', 80, true, true, false),
    (v_tenant, v_branch, v_cat, 'Mango Lassi', 120, true, true, false),
    (v_tenant, v_branch, v_cat, 'Iced Latte', 160, true, true, false);

  INSERT INTO public.categories (tenant_id, branch_id, name) VALUES (v_tenant, v_branch, 'Snacks') RETURNING id INTO v_cat;
  INSERT INTO public.products (tenant_id, branch_id, category_id, name, price, is_available, is_active, inventory_tracking_enabled) VALUES
    (v_tenant, v_branch, v_cat, 'Veg Sandwich', 150, true, true, false),
    (v_tenant, v_branch, v_cat, 'Paneer Roll', 180, true, true, false),
    (v_tenant, v_branch, v_cat, 'French Fries', 110, true, true, false);

  INSERT INTO public.categories (tenant_id, branch_id, name) VALUES (v_tenant, v_branch, 'Desserts') RETURNING id INTO v_cat;
  INSERT INTO public.products (tenant_id, branch_id, category_id, name, price, is_available, is_active, inventory_tracking_enabled) VALUES
    (v_tenant, v_branch, v_cat, 'Chocolate Brownie', 130, true, true, false),
    (v_tenant, v_branch, v_cat, 'Gulab Jamun', 90, true, true, false),
    (v_tenant, v_branch, v_cat, 'Ice Cream Sundae', 170, true, true, false);

  -- Three weeks of paid bills, oldest first so invoice numbers rise with time.
  -- A fixed seed keeps the sample figures the same if this is ever re-created.
  PERFORM setseed(0.42);
  FOR v_day IN REVERSE 20..0 LOOP
    v_n := 5 + floor(random() * 6)::int;
    FOR v_i IN 1..v_n LOOP
      v_seq := v_seq + 1;
      -- Between 10:00 and 22:00 India time on that day, never in the future.
      v_at := least(
        ((now() AT TIME ZONE 'Asia/Kolkata')::date - v_day + time '10:00' + random() * interval '12 hours') AT TIME ZONE 'Asia/Kolkata',
        now() - interval '5 minutes'
      );
      v_bill := gen_random_uuid();
      v_total := 0;

      INSERT INTO public.bills (id, tenant_id, branch_id, subtotal, tax_amount, discount_amount, total_amount, status, settled_at, created_at, updated_at,
                                document_status, payment_status, subtotal_paise, tax_paise, discount_paise, grand_total_paise, invoice_number, discount_value)
      VALUES (v_bill, v_tenant, v_branch, 0, 0, 0, 0, 'paid', v_at + interval '4 minutes', v_at, v_at + interval '4 minutes',
              'confirmed', 'paid', 0, 0, 0, 0, 'DM-' || lpad(v_seq::text, 4, '0'), 0);

      v_items := 1 + floor(random() * 3)::int;
      FOR r_prod IN
        SELECT p.id, p.name, p.price, c.name AS category_name, 1 + floor(random() * 2)::int AS qty
        FROM public.products p JOIN public.categories c ON c.id = p.category_id
        WHERE p.tenant_id = v_tenant
        ORDER BY random() LIMIT v_items
      LOOP
        INSERT INTO public.bill_items (bill_id, product_id, item_name, qty, price, category_name, price_paise, tax_rate, gst_percentage, discount_amount_paise, unit_name, modifiers_snapshot)
        VALUES (v_bill, r_prod.id, r_prod.name, r_prod.qty, r_prod.price, r_prod.category_name, (r_prod.price * 100)::bigint, 0, 0, 0, 'pcs', '[]'::jsonb);
        v_total := v_total + r_prod.qty * r_prod.price;
      END LOOP;

      UPDATE public.bills
         SET subtotal = v_total, total_amount = v_total,
             subtotal_paise = (v_total * 100)::bigint, grand_total_paise = (v_total * 100)::bigint
       WHERE id = v_bill;

      v_pay := (ARRAY['upi', 'upi', 'cash', 'card'])[1 + floor(random() * 4)::int];
      INSERT INTO public.settlements (bill_id, tenant_id, branch_id, payment_type, amount, created_at)
      VALUES (v_bill, v_tenant, v_branch, v_pay, v_total, v_at + interval '4 minutes');
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Demo tenant created with % bills.', v_seq;
END $$;
