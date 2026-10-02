-- Plays the new finance flows as real users. Everything is rolled back.
\set ON_ERROR_ROLLBACK on
\set VERBOSITY terse
\pset format unaligned
\pset tuples_only on
\pset fieldsep ' | '
BEGIN;

CREATE FUNCTION pg_temp.become(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

SELECT s.auth_user_id AS owner_auth, s.id AS owner_staff, s.tenant_id AS tenant FROM staff s JOIN branches b ON b.id = s.branch_id WHERE s.role = 'owner' AND b.code = 'CK' \gset
SELECT s.auth_user_id AS klt_admin FROM staff s JOIN branches b ON b.id = s.branch_id WHERE s.role = 'admin' AND b.code = 'KLT' AND s.tenant_id = :'tenant' \gset
SELECT s.auth_user_id AS klt_manager FROM staff s JOIN branches b ON b.id = s.branch_id WHERE s.role = 'manager' AND b.code = 'KLT' AND s.tenant_id = :'tenant' \gset
SELECT a.id AS ck_acct, a.branch_id AS ck_branch FROM finance_accounts a JOIN branches b ON b.id = a.branch_id WHERE b.code = 'CK' AND a.tenant_id = :'tenant' \gset
SELECT a.id AS klt_acct, a.branch_id AS klt_branch FROM finance_accounts a JOIN branches b ON b.id = a.branch_id WHERE b.code = 'KLT' AND a.tenant_id = :'tenant' \gset
SELECT a.id AS vl_acct FROM finance_accounts a JOIN branches b ON b.id = a.branch_id WHERE b.code = 'VL' AND a.tenant_id = :'tenant' \gset
INSERT INTO inventory_suppliers (tenant_id, branch_id, supplier_code, supplier_name, phone) VALUES (:'tenant', :'ck_branch', 'TST-1', 'Test Vendor', '0000000000') RETURNING id AS supplier \gset
INSERT INTO inventory_materials (tenant_id, branch_id, material_code, material_name) VALUES (:'tenant', :'ck_branch', 'TST-M1', 'Test Flour') RETURNING id AS material \gset
SELECT id AS cat_any FROM finance_catalog WHERE tenant_id = :'tenant' AND level = 'category' AND NOT is_system AND system_key IS NULL ORDER BY sort_order LIMIT 1 \gset
SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today \gset

\echo ===== A. OWNER (Central Kitchen)
SELECT pg_temp.become(:'owner_auth');
\echo A1 summary, all branches, last 30 days
SELECT j->>'collectedRevenue' AS revenue, j->>'expensesTotal' AS expenses, j->>'otherIncome' AS other_income, j->>'suppliesFromKitchen' AS supplies, j->>'cashOut' AS cash_out, json_array_length(j->'expensesByCategory') AS cats
  FROM (SELECT public.get_finance_summary(:'tenant', NULL, now() - interval '30 days', now(), :'today'::date - 30, :'today'::date) AS j) x;
\echo A2 summary, kitchen only
SELECT j->>'expensesTotal' AS expenses, j->>'otherIncome' AS other_income, j->>'suppliesFromKitchen' AS supplies
  FROM (SELECT public.get_finance_summary(:'tenant', :'ck_branch', now() - interval '30 days', now(), :'today'::date - 30, :'today'::date) AS j) x;
\echo A3 daily series length (expect 31)
SELECT json_array_length(public.get_finance_daily_series(:'tenant', NULL, now() - interval '30 days', now(), :'today'::date - 30, :'today'::date));
\echo A4 names offered for "test" (expect Test Vendor as supplier)
SELECT * FROM public.finance_counterparty_names('test', 5);
\echo A5 a payable with a due date
INSERT INTO finance_entries (tenant_id, account_id, kind, amount_paise, mode, transaction_date, due_date, particulars, counterparty, category_id)
VALUES (:'tenant', :'ck_acct', 'payable', 5000000, 'bank', :'today', :'today'::date + 3, 'TEST rent', 'Test Landlord', :'cat_any') RETURNING id AS payable, status, due_date \gset
\echo payable status :status
\echo A6 dues: today (expect week), and seen from 10 days later (expect overdue)
SELECT kind, bucket, amount_paise, entries FROM public.finance_dues_summary();
SELECT kind, bucket, amount_paise, entries FROM public.finance_dues_summary(:'today'::date + 10);
\echo A7 a due date on an expense is cleared by the guard (expect none)
INSERT INTO finance_entries (tenant_id, account_id, kind, amount_paise, mode, transaction_date, due_date, particulars, category_id)
VALUES (:'tenant', :'ck_acct', 'expense', 10000, 'cash', :'today', :'today'::date + 3, 'TEST tea', :'cat_any') RETURNING kind, status, coalesce(due_date::text, '(none)');
\echo A8 settle the payable: part (expect open 2000000), then the rest (expect settled 5000000)
SELECT public.finance_settle_entry(:'payable', 2000000, 'bank', :'today') IS NOT NULL AS paid_part;
SELECT status, settled_paise FROM finance_entries WHERE id = :'payable';
SELECT public.finance_settle_entry(:'payable', 3000000, 'cash', :'today') IS NOT NULL AS paid_rest;
SELECT status, settled_paise FROM finance_entries WHERE id = :'payable';
\echo A9 cash count: 100 rupees in the box
SELECT cash_paise AS expected FROM public.finance_balances(:'ck_acct', :'today') \gset
SELECT public.finance_record_cash_count(:'ck_acct', 'cash', 10000, :'today', 'TEST count', true) AS count_result \gset
SELECT (:'count_result'::json ->> 'entry_id') AS count_entry, (:'count_result'::json ->> 'difference_paise')::bigint = 10000 - (:expected) AS difference_ok \gset
\echo difference ok :difference_ok
SELECT kind, mode, amount_paise = abs(10000 - (:expected)) AS amount_ok, particulars, source_type FROM finance_entries WHERE id = :'count_entry';
SELECT cash_paise = 10000 AS books_now_match_the_box FROM public.finance_balances(:'ck_acct', :'today');
\echo A9b a negative cash count is refused (expect ERROR)
SELECT public.finance_record_cash_count(:'ck_acct', 'cash', -1, :'today', NULL, true);
\echo A10 the entry of the count cannot be edited by hand (expect ERROR: posted by a cash count)
UPDATE finance_entries SET amount_paise = 1 WHERE id = :'count_entry';
\echo A10b but it can be annotated
UPDATE finance_entries SET notes = 'checked twice' WHERE id = :'count_entry' RETURNING notes;
\echo A11 count dated tomorrow (expect ERROR: today or earlier)
SELECT public.finance_record_cash_count(:'ck_acct', 'cash', 0, :'today'::date + 1, NULL, true);
\echo A12 purchase paid in cash by Kolathur for the kitchen
SELECT public.record_purchase(:'ck_branch', :'supplier', :'today', 'INV-T1', :'today', 'Cash', true,
  json_build_array(json_build_object('material_id', :'material', 'quantity', 10, 'unit_price', 120, 'line_total', 1200))::jsonb,
  1200, 0, 0, 0, 0, 1200, 'TEST', 'Dry Storage', NULL, :'klt_acct', NULL) AS p1 \gset
SELECT (:'p1'::json -> 'header' ->> 'purchase_number') AS number, (:'p1'::json ->> 'finance_entry_id') AS p1_entry \gset
\echo number :number
SELECT kind, mode, amount_paise, account_id = :'ck_acct' AS for_kitchen, paid_from_account_id = :'klt_acct' AS paid_by_klt, source_type FROM finance_entries WHERE id = :'p1_entry';
\echo A13 between accounts (expect kitchen owes Kolathur 120000)
SELECT owed_by = :'ck_acct' AS kitchen_owes, owed_to = :'klt_acct' AS to_klt, amount_paise FROM public.finance_interaccount_positions();
\echo A14 purchase on credit, due in 15 days (expect payable open 50000 bank, due ok)
SELECT public.record_purchase(:'ck_branch', :'supplier', :'today', 'INV-T2', :'today', 'Credit', false,
  json_build_array(json_build_object('material_id', :'material', 'quantity', 5, 'unit_price', 100, 'line_total', 500))::jsonb,
  500, 0, 0, 0, 0, 500, NULL, 'Dry Storage', NULL, NULL, :'today'::date + 15) AS p2 \gset
SELECT (:'p2'::json -> 'header' ->> 'purchase_number') AS number2, (:'p2'::json ->> 'finance_entry_id') AS p2_entry \gset
\echo number :number2
SELECT kind, status, amount_paise, mode, due_date = :'today'::date + 15 AS due_ok, source_type FROM finance_entries WHERE id = :'p2_entry';
SELECT round(current_stock) AS stock, round(average_cost, 2) AS avg_cost FROM inventory_materials WHERE id = :'material';
\echo A15 purchase due before it was bought (expect ERROR: PURCHASE_INVALID_ARGS)
SELECT public.record_purchase(:'ck_branch', :'supplier', :'today', NULL, NULL, 'Credit', false,
  json_build_array(json_build_object('material_id', :'material', 'quantity', 1, 'unit_price', 1))::jsonb,
  1, 0, 0, 0, 0, 1, NULL, 'Dry Storage', NULL, NULL, :'today'::date - 1);
\echo A16 the entry of the purchase keeps its amount (expect ERROR: posted by a purchase)
UPDATE finance_entries SET amount_paise = 1 WHERE id = :'p2_entry';
\echo A17 pay the purchase from the ledger (expect settled)
SELECT public.finance_settle_entry(:'p2_entry', 50000, 'bank', :'today') IS NOT NULL AS paid;
SELECT status FROM finance_entries WHERE id = :'p2_entry';
\echo A18 a receivable from Kolathur for goods supplied, as a dispatch posts it: 2000 rupees
SELECT public.finance_post_source_entry(:'tenant', :'ck_acct', :'klt_acct', 'receivable', 200000, NULL, :'today', 'branch_supplies',
  'TEST dispatch to Kolathur', 'Kolathur', 'DSP-TEST', NULL, 'dispatch', gen_random_uuid(), NULL, :'today'::date + 7) AS recv \gset
SELECT kind, status, mode, due_date IS NOT NULL AS has_due FROM finance_entries WHERE id = :'recv';
\echo A19 Kolathur summary: supplies from the kitchen (expect 2000.00)
SELECT j->>'suppliesFromKitchen' FROM (SELECT public.get_finance_summary(:'tenant', :'klt_branch', now() - interval '1 day', now() + interval '1 day', :'today'::date, :'today'::date) AS j) x;
\echo A20 offset more than is owed (expect ERROR: only 120000 paise are owed)
SELECT public.finance_settle_entry(:'recv', 150000, 'offset', :'today');
\echo A21 offset what the kitchen owes Kolathur, 1200 (expect open 120000)
SELECT public.finance_settle_entry(:'recv', 120000, 'offset', :'today') IS NOT NULL AS offset_done;
SELECT status, settled_paise FROM finance_entries WHERE id = :'recv';
\echo A22 between accounts after the offset (expect Kolathur owes kitchen 80000)
SELECT owed_by = :'klt_acct' AS klt_owes, owed_to = :'ck_acct' AS to_kitchen, amount_paise FROM public.finance_interaccount_positions();
\echo A23 a regular (particulars trimmed)
INSERT INTO finance_entry_templates (tenant_id, account_id, kind, amount_paise, mode, category_id, particulars, counterparty, created_by)
VALUES (:'tenant', :'ck_acct', 'expense', 2500000, 'bank', :'cat_any', '  TEST monthly rent ', 'Test Landlord', :'owner_staff') RETURNING id AS tpl, particulars \gset
\echo template [:particulars]
UPDATE finance_entry_templates SET last_recorded_on = :'today' WHERE id = :'tpl' RETURNING last_recorded_on IS NOT NULL AS stamped;
\echo A23b a regular cannot be deleted (expect ERROR: permission denied)
DELETE FROM finance_entry_templates WHERE id = :'tpl';
\echo A24 attach a bill (expect t); a path for another entry is refused (expect ERROR: does not belong)
SELECT public.finance_set_entry_receipt(:'p1_entry', :'tenant' || '/' || :'p1_entry' || '/bill.jpg');
SELECT receipt_path IS NOT NULL AS has_bill FROM finance_entries WHERE id = :'p1_entry';
SELECT public.finance_set_entry_receipt(:'p1_entry', :'tenant' || '/' || :'payable' || '/bill.jpg');
\echo A25 storage policy lets the owner add the file
INSERT INTO storage.objects (bucket_id, name) VALUES ('finance-receipts', :'tenant' || '/' || :'p1_entry' || '/bill.jpg') RETURNING bucket_id;
\echo A26 edit trail of the purchase entry (expect create, then update receipt_path)
SELECT action, (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(changes) k) AS fields FROM finance_entry_revisions WHERE entry_id = :'p1_entry' ORDER BY changed_at;

\echo ===== B. KOLATHUR ADMIN
RESET ROLE;
SELECT pg_temp.become(:'klt_admin');
\echo B1 sees the due it owes (1), not the payable of the kitchen (0), and the bill it paid for the kitchen (1)
SELECT count(*) FILTER (WHERE id = :'recv') AS sees_own_due, count(*) FILTER (WHERE id = :'p2_entry') AS sees_kitchen_payable, count(*) FILTER (WHERE id = :'p1_entry') AS sees_bill_it_paid FROM finance_entries;
\echo B2 its dues (expect receivable week 80000)
SELECT kind, bucket, amount_paise FROM public.finance_dues_summary();
\echo B3 offset is refused (expect ERROR)
SELECT public.finance_settle_entry(:'recv', 10000, 'offset', :'today');
\echo B4 naming another payer is refused (expect ERROR)
SELECT public.finance_settle_entry(:'recv', 10000, 'cash', :'today', :'vl_acct');
\echo B5 pays 300 in cash (expect open 150000)
SELECT public.finance_settle_entry(:'recv', 30000, 'cash', :'today') IS NOT NULL AS paid;
SELECT status, settled_paise FROM finance_entries WHERE id = :'recv';
\echo B6 cannot count the cash of the kitchen (expect ERROR: Balances are visible to the owner)
SELECT public.finance_record_cash_count(:'ck_acct', 'cash', 0, :'today', NULL, true);
\echo B7 cannot add a bill to a kitchen entry (expect ERROR: not available)
SELECT public.finance_set_entry_receipt(:'p2_entry', :'tenant' || '/' || :'p2_entry' || '/x.jpg');
\echo B8 regulars of the kitchen are not visible (expect 0)
SELECT count(*) FROM finance_entry_templates;
\echo B9 cannot record a purchase for the kitchen (expect ERROR: PURCHASE_FORBIDDEN)
SELECT public.record_purchase(:'ck_branch', :'supplier', :'today', NULL, NULL, 'Cash', true,
  json_build_array(json_build_object('material_id', :'material', 'quantity', 1, 'unit_price', 1))::jsonb, 1, 0, 0, 0, 0, 1);
\echo B10 can count its own cash (expect a result)
SELECT (public.finance_record_cash_count(:'klt_acct', 'cash', 0, :'today', NULL, false) ->> 'difference_paise') IS NOT NULL AS counted;

\echo ===== C. KOLATHUR MANAGER (clerk)
RESET ROLE;
SELECT pg_temp.become(:'klt_manager');
\echo C1 sees the due (1), not the payable of the kitchen (0)
SELECT count(*) FILTER (WHERE id = :'recv') AS sees_own_due, count(*) FILTER (WHERE id = :'p2_entry') AS sees_kitchen_payable FROM finance_entries;
\echo C2 pays 200 through the bank
SELECT public.finance_settle_entry(:'recv', 20000, 'bank', :'today') IS NOT NULL AS paid;
\echo C3 cannot void it (expect ERROR, or 0 rows changed)
UPDATE finance_entries SET status = 'void', void_reason = 'test' WHERE id = :'recv' RETURNING status;
\echo C4 cannot count cash while clerks do not see balances (expect ERROR)
SELECT public.finance_record_cash_count(:'klt_acct', 'cash', 0, :'today', NULL, true);

\echo ===== D. NOT SIGNED IN
RESET ROLE;
SET LOCAL ROLE anon;
\echo D1 expect ERROR: permission denied (x4)
SELECT * FROM public.finance_dues_summary();
SELECT * FROM public.finance_counterparty_names();
SELECT count(*) FROM finance_cash_counts;
SELECT count(*) FROM finance_entry_templates;

RESET ROLE;
\echo ===== final state of the test receivable (expect open, 170000 of 200000)
SELECT status, settled_paise, amount_paise FROM finance_entries WHERE id = :'recv';
ROLLBACK;
