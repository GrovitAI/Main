-- Staging-only fixtures, authenticated kitchen scope; all writes roll back.
BEGIN;
DO $identity$
DECLARE target record; actor uuid;
BEGIN
 SELECT b.tenant_id,b.id AS branch_id INTO STRICT target FROM public.branches b
 JOIN public.tenants t ON t.id=b.tenant_id WHERE t.slug='leleban' AND b.branch_type='CENTRAL_KITCHEN';
 SELECT auth_user_id INTO STRICT actor FROM public.staff s WHERE s.tenant_id=target.tenant_id
 AND s.branch_id=target.branch_id AND s.status='active' AND s.deleted_at IS NULL AND s.role='kitchen' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('kitchen.test.tenant',target.tenant_id::text,true);
 PERFORM set_config('kitchen.test.branch',target.branch_id::text,true);
END $identity$;
SET LOCAL ROLE authenticated;
DO $tests$
DECLARE
 t uuid:=current_setting('kitchen.test.tenant')::uuid;
 b uuid:=current_setting('kitchen.test.branch')::uuid;
 outlet uuid; vendor uuid; item uuid; entry public.kitchen_entries%ROWTYPE;
 suffix text:=gen_random_uuid()::text;
 r jsonb; full_report jsonb; base jsonb; test_date date;
 today date:=(now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 base:=public.kitchen_range_report(t,b,'1999-01-31','1999-02-01','sales');
 INSERT INTO public.kitchen_parties(tenant_id,branch_id,kind,name) VALUES(t,b,'branch','Range outlet '||suffix) RETURNING id INTO outlet;
 INSERT INTO public.kitchen_parties(tenant_id,branch_id,kind,name) VALUES(t,b,'vendor','Range vendor '||suffix) RETURNING id INTO vendor;
 INSERT INTO public.kitchen_items(tenant_id,branch_id,name,unit) VALUES(t,b,'Range item '||suffix,'kg') RETURNING id INTO item;
 FOREACH test_date IN ARRAY ARRAY['1999-01-30'::date,'1999-01-31'::date,'1999-02-01'::date,'1999-02-02'::date] LOOP
  entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','sent','entry_date',test_date,'party_id',outlet,'lines',jsonb_build_array(jsonb_build_object('item_id',item,'qty',1,'price_paise',100))));
  entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','bought','entry_date',test_date,'party_id',vendor,'paid',true,'mode','cash','lines',jsonb_build_array(jsonb_build_object('item_id',item,'qty',1,'price_paise',200))));
 END LOOP;
 full_report:=public.kitchen_range_report(t,b,'1999-01-31','1999-02-01','sales',outlet,item);
 IF (full_report->>'filtered_paise')::bigint<>200 OR (full_report->'summary'->>'sales_paise')::bigint-(base->'summary'->>'sales_paise')::bigint<>200
 THEN RAISE EXCEPTION 'Inclusive cross-month bounds or KPI scope failed'; END IF;
 r:=public.kitchen_range_report(t,b,'1999-01-31','1999-02-01','sales',outlet,item,NULL,false,true,1,1);
 IF jsonb_array_length(r->'rows')<>1 OR (r->>'total_rows')::int<>2 OR (r->>'filtered_paise')::bigint<>200 THEN RAISE EXCEPTION 'Range pagination totals failed'; END IF;
 r:=public.kitchen_range_report(t,b,'1999-01-31','1999-02-01','sales',outlet,item,NULL,false,false,0,50,true);
 IF jsonb_array_length(r->'rows')<>2 OR (SELECT sum((row->>'amount_paise')::bigint) FROM jsonb_array_elements(r->'rows') row)<>(full_report->>'filtered_paise')::bigint
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') row WHERE (row->>'date')::date NOT BETWEEN '1999-01-31' AND '1999-02-01') THEN RAISE EXCEPTION 'Range export failed'; END IF;
 r:=public.kitchen_range_report(t,b,'1999-02-01','1999-02-01','purchases',vendor);
 IF (r->>'filtered_paise')::bigint<>200 THEN RAISE EXCEPTION 'Single-day purchase failed'; END IF;
 r:=public.kitchen_range_report(t,b,'1999-01-31','1999-02-01','cash',vendor);
 IF (r->>'filtered_out_paise')::bigint<>400 OR (r->>'filtered_in_paise')::bigint<>0 THEN RAISE EXCEPTION 'Range cash directions failed'; END IF;
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','sent','entry_date','2000-02-29','party_id',outlet,'lines',jsonb_build_array(jsonb_build_object('item_id',item,'qty',1,'price_paise',300))));
 r:=public.kitchen_range_report(t,b,'2000-02-29','2000-02-29','sales',outlet);
 IF (r->>'filtered_paise')::bigint<>300 THEN RAISE EXCEPTION 'Leap-day range failed'; END IF;
 r:=public.kitchen_range_report(t,b,date_trunc('month',today)::date,today,'sales');
 full_report:=public.kitchen_monthly_report(t,b,date_trunc('month',today)::date,'sales');
 IF r<>full_report THEN RAISE EXCEPTION 'Default monthly compatibility failed'; END IF;
 BEGIN
  PERFORM public.kitchen_range_report(t,b,'1999-02-01','1999-01-31','sales');
  RAISE EXCEPTION 'Reversed range accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.kitchen_range_report(t,b,NULL,'1999-02-01','sales');
  RAISE EXCEPTION 'Missing date accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.kitchen_range_report(gen_random_uuid(),b,'1999-01-31','1999-02-01','sales');
  RAISE EXCEPTION 'Wrong tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.kitchen_range_report(t,gen_random_uuid(),'1999-01-31','1999-02-01','sales');
  RAISE EXCEPTION 'Wrong branch accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $tests$;
ROLLBACK;
