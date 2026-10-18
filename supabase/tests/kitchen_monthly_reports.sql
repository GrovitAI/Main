-- Staging-only, disposable fixtures. Everything is rolled back.
BEGIN;
DO $identity$
DECLARE target record; actor uuid;
BEGIN
 SELECT b.tenant_id,b.id AS branch_id INTO STRICT target FROM public.branches b
 JOIN public.tenants t ON t.id=b.tenant_id WHERE t.slug='leleban' AND b.branch_type='CENTRAL_KITCHEN';
 SELECT auth_user_id INTO STRICT actor FROM public.staff s
 WHERE s.tenant_id=target.tenant_id AND s.branch_id=target.branch_id AND s.status='active'
 AND s.deleted_at IS NULL AND s.role='kitchen' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('kitchen.test.tenant',target.tenant_id::text,true);
 PERFORM set_config('kitchen.test.branch',target.branch_id::text,true);
END $identity$;
SET LOCAL ROLE authenticated;
DO $tests$
DECLARE
 t uuid := current_setting('kitchen.test.tenant')::uuid;
 b uuid := current_setting('kitchen.test.branch')::uuid;
 suffix text := gen_random_uuid()::text;
 ca uuid; cb uuid; vendor uuid; outlet uuid; kg uuid; pcs uuid;
 buy public.kitchen_entries%ROWTYPE; paid_buy public.kitchen_entries%ROWTYPE;
 corrected public.kitchen_entries%ROWTYPE; entry public.kitchen_entries%ROWTYPE;
 report jsonb; cash jsonb; summary jsonb; sale jsonb;
 old_name text := 'Test Dairy ';
 baseline jsonb;
 today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
 this_month date := date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 old_name:=old_name||suffix;
 baseline:=public.kitchen_monthly_report(t,b,'1999-02-01','sales');
 INSERT INTO public.kitchen_purchase_categories(tenant_id,branch_id,name) VALUES(t,b,old_name) RETURNING id INTO ca;
 INSERT INTO public.kitchen_purchase_categories(tenant_id,branch_id,name) VALUES(t,b,'Test Rent '||left(suffix,8)) RETURNING id INTO cb;
 INSERT INTO public.kitchen_parties(tenant_id,branch_id,kind,name,purchase_category_id) VALUES(t,b,'vendor','Test Vendor '||suffix,ca) RETURNING id INTO vendor;
 INSERT INTO public.kitchen_parties(tenant_id,branch_id,kind,name) VALUES(t,b,'branch','Test Outlet '||suffix) RETURNING id INTO outlet;
 INSERT INTO public.kitchen_items(tenant_id,branch_id,name,unit) VALUES(t,b,'Test kg '||suffix,'kg') RETURNING id INTO kg;
 INSERT INTO public.kitchen_items(tenant_id,branch_id,name,unit) VALUES(t,b,'Test pcs '||suffix,'pcs') RETURNING id INTO pcs;
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','sent','entry_date',today,'party_id',outlet,'lines',jsonb_build_array(jsonb_build_object('item_id',kg,'qty',1,'price_paise',100))));
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','sent','entry_date',today+1,'party_id',outlet,'lines',jsonb_build_array(jsonb_build_object('item_id',kg,'qty',1,'price_paise',200))));
 report:=public.kitchen_monthly_report(t,b,this_month,'sales',outlet);
 IF (report->>'filtered_paise')::bigint<>100 THEN RAISE EXCEPTION 'Month-to-date cutoff failed'; END IF;
 BEGIN
  entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','bought','entry_date',today,'party_id',vendor,'purchase_category_id',gen_random_uuid(),'paid',false,'lines',jsonb_build_array(jsonb_build_object('item_id',kg,'qty',1,'price_paise',100))));
  RAISE EXCEPTION 'Invalid category accepted';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','sent','entry_date','1999-02-28','party_id',outlet,'lines',jsonb_build_array(jsonb_build_object('item_id',kg,'qty',2,'price_paise',10000),jsonb_build_object('item_id',pcs,'qty',3,'price_paise',5000))));
 buy:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','bought','entry_date','1999-02-01','party_id',vendor,'paid',false,'lines',jsonb_build_array(jsonb_build_object('item_id',kg,'qty',1,'price_paise',10000))));
 paid_buy:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','bought','entry_date','1999-02-28','party_id',vendor,'purchase_category_id',cb,'paid',true,'mode','upi','lines',jsonb_build_array(jsonb_build_object('item_id',pcs,'qty',1,'price_paise',5000))));
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','paid','entry_date','1999-02-15','party_id',vendor,'amount_paise',4000,'mode','bank'));
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','received','entry_date','1999-02-15','party_id',outlet,'amount_paise',6000,'mode','cash'));
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','spent','entry_date','1999-02-15','amount_paise',2000,'mode','cash','category','Test Rent '||left(suffix,8)));
 sale:=public.kitchen_monthly_report(t,b,'1999-02-01','sales',outlet);
 IF (sale->>'total_rows')::integer<>2 OR (sale->>'filtered_paise')::bigint<>35000
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sale->'rows') r WHERE r->>'unit'='kg' AND (r->>'quantity')::numeric=2)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sale->'rows') r WHERE r->>'unit'='pcs' AND (r->>'quantity')::numeric=3) THEN RAISE EXCEPTION 'Mixed-unit sale aggregation failed'; END IF;
 report:=public.kitchen_monthly_report(t,b,'1999-02-01','purchases',vendor);
 IF (report->>'filtered_paise')::bigint<>15000 OR (report->>'total_rows')::integer<>2 THEN RAISE EXCEPTION 'Purchase/category totals failed'; END IF;
 cash:=public.kitchen_monthly_report(t,b,'1999-02-01','purchases',NULL,NULL,'Test Rent '||left(suffix,8),true);
 IF (cash->>'filtered_paise')::bigint<>7000 OR (cash->>'total_rows')::integer<>1
 OR (cash->'rows'->0->>'amount_paise')::bigint<>7000 OR (cash->'rows'->0->>'documents')::integer<>2
 THEN RAISE EXCEPTION 'Same-label spending categories do not reconcile'; END IF;
 cash:=public.kitchen_monthly_report(t,b,'1999-02-01','purchases',NULL,NULL,'Test Rent '||left(suffix,8),true,true);
 IF (cash->>'filtered_paise')::bigint<>7000 OR (cash->>'total_rows')::integer<>2 THEN RAISE EXCEPTION 'Same-label category drilldown lost a source'; END IF;
 summary:=report->'summary';
 IF (summary->>'cash_out_paise')::bigint-(baseline->'summary'->>'cash_out_paise')::bigint<>11000
 OR (summary->>'cash_in_paise')::bigint-(baseline->'summary'->>'cash_in_paise')::bigint<>6000 THEN RAISE EXCEPTION 'Buy/pay cash double counting'; END IF;
 UPDATE public.kitchen_purchase_categories SET name='Renamed '||suffix WHERE id=ca AND tenant_id=t AND branch_id=b;
 UPDATE public.kitchen_parties SET purchase_category_id=cb WHERE id=vendor AND tenant_id=t AND branch_id=b;
 UPDATE public.kitchen_purchase_categories SET is_active=false WHERE id=ca AND tenant_id=t AND branch_id=b;
 corrected:=public.kitchen_edit_entry(buy.id,jsonb_build_object('branch_id',b,'type','bought','entry_date','1999-02-01','party_id',vendor,'purchase_category_id',ca,'paid',false,'lines',jsonb_build_array(jsonb_build_object('item_id',kg,'qty',2,'price_paise',10000))));
 IF corrected.purchase_category_name<>old_name OR corrected.purchase_category_id<>ca THEN RAISE EXCEPTION 'Edit/rename/archive rewrote historical category'; END IF;
 report:=public.kitchen_monthly_report(t,b,'1999-02-01','purchases',vendor);
 IF (report->>'filtered_paise')::bigint<>25000 THEN RAISE EXCEPTION 'Replacement was double counted'; END IF;
 report:=public.kitchen_monthly_report(t,b,'1999-02-01','purchases',vendor,NULL,old_name,false,true,0,1);
 IF (report->>'total_rows')::integer<>1 OR jsonb_array_length(report->'rows')<>1 OR (report->>'filtered_paise')::bigint<>20000 THEN RAISE EXCEPTION 'Filtered drilldown failed'; END IF;
 PERFORM public.kitchen_void_entry(paid_buy.id,'Test');
 report:=public.kitchen_monthly_report(t,b,'1999-02-01','purchases',vendor);
 IF (report->>'filtered_paise')::bigint<>20000 THEN RAISE EXCEPTION 'Voided purchase counted'; END IF;
 report:=public.kitchen_monthly_report(t,b,'1999-02-01','sales',outlet,NULL,NULL,false,false,1,1);
 IF jsonb_array_length(report->'rows')<>1 OR (report->>'total_rows')::integer<>2 THEN RAISE EXCEPTION 'Pagination truncates totals'; END IF;
 report:=public.kitchen_monthly_report(t,b,'1999-02-01','sales',outlet,NULL,NULL,false,false,0,50,true);
 IF jsonb_array_length(report->'rows')<>2 OR (SELECT sum((r->>'amount_paise')::bigint) FROM jsonb_array_elements(report->'rows') r)<>(report->>'filtered_paise')::bigint THEN RAISE EXCEPTION 'Export reconciliation failed'; END IF;
 report:=public.kitchen_monthly_report(t,b,'1999-03-01','sales',outlet);
 IF (report->>'total_rows')::integer<>0 THEN RAISE EXCEPTION 'Month boundary leaked entries'; END IF;
 UPDATE public.kitchen_parties SET is_active=false WHERE id=outlet AND tenant_id=t AND branch_id=b;
 report:=public.kitchen_monthly_report(t,b,'1999-02-01','sales',outlet);
 IF (report->>'filtered_paise')::bigint<>35000 THEN RAISE EXCEPTION 'Archived branch lost historical sales'; END IF;
 BEGIN
  PERFORM public.kitchen_monthly_report(gen_random_uuid(),b,'1999-02-01','sales');
  RAISE EXCEPTION 'Tenant isolation failed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.kitchen_monthly_report(t,gen_random_uuid(),'1999-02-01','sales');
  RAISE EXCEPTION 'Branch isolation failed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $tests$;
RESET ROLE;
SELECT 'PASS: category snapshots, overrides, archived edit, replacement/void, mixed units, cash double counting, pagination, export, scope and month boundaries' AS result;
ROLLBACK;
