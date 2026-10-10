-- Staging only. The approved client scope is resolved once; all writes roll back.
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
DECLARE t uuid:=current_setting('kitchen.test.tenant')::uuid;
 b uuid:=current_setting('kitchen.test.branch')::uuid;
 raw_item uuid; finished_item uuid; entry public.kitchen_entries%ROWTYPE;
 quantity numeric; suffix text:=gen_random_uuid()::text;
BEGIN
 INSERT INTO public.kitchen_items(tenant_id,branch_id,name,unit,item_kind,stock)
 VALUES(t,b,'Raw fixture '||suffix,'kg','raw_material',10) RETURNING id INTO raw_item;
 INSERT INTO public.kitchen_items(tenant_id,branch_id,name,unit,item_kind,stock)
 VALUES(t,b,'Finished fixture '||suffix,'kg','finished_good',2) RETURNING id INTO finished_item;
 BEGIN
  PERFORM public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','made','item_id',raw_item,'qty',5));
  RAISE EXCEPTION 'Raw material batch was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM NOT LIKE '%KITCHEN_FINISHED_GOODS_ONLY%' THEN RAISE; END IF;
 END;
 SELECT stock INTO quantity FROM public.kitchen_items WHERE tenant_id=t AND branch_id=b AND id=raw_item;
 IF quantity<>10 THEN RAISE EXCEPTION 'Rejected raw batch changed stock'; END IF;
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','made','item_id',finished_item,'qty',2.5,'created_by','Fixture chef'));
 SELECT stock INTO quantity FROM public.kitchen_items WHERE tenant_id=t AND branch_id=b AND id=finished_item;
 IF quantity<>4.5 OR entry.qty<>2.5 OR entry.created_by<>'Fixture chef' THEN RAISE EXCEPTION 'Finished batch quantity or audit failed'; END IF;
 SELECT stock INTO quantity FROM public.kitchen_items WHERE tenant_id=t AND branch_id=b AND id=raw_item;
 IF quantity<>10 THEN RAISE EXCEPTION 'Finished batch consumed raw material'; END IF;
 PERFORM public.kitchen_void_entry(entry.id,'Fixture reversal');
 SELECT stock INTO quantity FROM public.kitchen_items WHERE tenant_id=t AND branch_id=b AND id=finished_item;
 IF quantity<>2 THEN RAISE EXCEPTION 'Batch void did not reverse stock'; END IF;
 entry:=public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','count','item_id',raw_item,'qty',0));
 SELECT stock INTO quantity FROM public.kitchen_items WHERE tenant_id=t AND branch_id=b AND id=raw_item;
 IF quantity<>0 THEN RAISE EXCEPTION 'Raw zero stock count failed'; END IF;
 PERFORM public.kitchen_void_entry(entry.id,'Fixture count reversal');
 SELECT stock INTO quantity FROM public.kitchen_items WHERE tenant_id=t AND branch_id=b AND id=raw_item;
 IF quantity<>10 THEN RAISE EXCEPTION 'Count reversal failed'; END IF;
 BEGIN
  PERFORM public.kitchen_post_entry(jsonb_build_object('branch_id',b,'type','made','item_id',finished_item,'qty',0));
  RAISE EXCEPTION 'Zero batch accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  INSERT INTO public.kitchen_items(tenant_id,branch_id,name,unit,item_kind) VALUES(t,b,'Invalid fixture '||suffix,'kg','other');
  RAISE EXCEPTION 'Invalid kind accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.kitchen_post_entry(jsonb_build_object('branch_id',gen_random_uuid(),'type','made','item_id',finished_item,'qty',1));
  RAISE EXCEPTION 'Cross-branch batch accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $tests$;
ROLLBACK;
