-- Finance setup for the demo tenant — Task 90. Run after 20260917000100_demo_tenant_seed.sql.
--
-- Without a branch account and a catalogue the Finance tab has nothing to show
-- and the entry form has nothing to pick, which reads as broken to a reviewer.
-- This gives the demo tenant one branch account, the default rules, the system
-- categories every tenant needs (copied by name from the first tenant, with new
-- ids) and a few generic expense categories. The owner's partner account is
-- created by the existing staff trigger when the demo owner is linked.
--
-- Inserts demo-tenant rows only; safe to run twice.

DO $$
DECLARE
  v_tenant constant uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_branch constant uuid := 'dddddddd-0000-0000-0000-0000000000b1';
  v_source constant uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  r_cat record;
  v_new uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.finance_accounts WHERE tenant_id = v_tenant AND kind = 'branch') THEN
    RAISE NOTICE 'Demo finance setup already present; nothing to do.';
    RETURN;
  END IF;

  INSERT INTO public.finance_accounts (tenant_id, kind, branch_id, name, sort_order)
  VALUES (v_tenant, 'branch', v_branch, 'Demo Branch', 10);

  INSERT INTO public.finance_rules (tenant_id) VALUES (v_tenant) ON CONFLICT (tenant_id) DO NOTHING;

  -- The system categories every tenant needs, copied by name (new ids, demo tenant).
  FOR r_cat IN
    SELECT * FROM public.finance_catalog WHERE tenant_id = v_source AND is_system AND level = 'category' ORDER BY sort_order
  LOOP
    INSERT INTO public.finance_catalog (tenant_id, level, parent_id, name, default_kind, sort_order, is_system, is_active)
    VALUES (v_tenant, 'category', NULL, r_cat.name, r_cat.default_kind, r_cat.sort_order, true, r_cat.is_active)
    RETURNING id INTO v_new;

    INSERT INTO public.finance_catalog (tenant_id, level, parent_id, name, default_kind, sort_order, is_system, is_active)
    SELECT v_tenant, 'subcategory', v_new, s.name, s.default_kind, s.sort_order, true, s.is_active
    FROM public.finance_catalog s
    WHERE s.tenant_id = v_source AND s.is_system AND s.level = 'subcategory' AND s.parent_id = r_cat.id;
  END LOOP;

  -- Generic expense categories so the entry form has something to pick.
  INSERT INTO public.finance_catalog (tenant_id, level, parent_id, name, default_kind, sort_order, is_system, is_active)
  SELECT v_tenant, 'category', NULL, n.name, 'expense', 200 + n.ord * 10, false, true
  FROM (VALUES ('Rent', 1), ('Salaries', 2), ('Groceries', 3), ('Utilities', 4), ('Maintenance', 5), ('Packaging', 6)) AS n(name, ord);
END $$;
