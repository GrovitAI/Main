-- Authenticated, scoped staging checks. Every fixture is rolled back.
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
DECLARE t uuid:=current_setting('kitchen.test.tenant')::uuid; b uuid:=current_setting('kitchen.test.branch')::uuid;
 person uuid; second_person uuid; row_count integer; actor_name text;
BEGIN
 INSERT INTO public.kitchen_staff_roster(tenant_id,branch_id,name,job_title)
 VALUES(t,b,'Attendance fixture '||gen_random_uuid()::text,'Cook') RETURNING id INTO person;
 INSERT INTO public.kitchen_attendance(tenant_id,branch_id,roster_id,attendance_date,status,updated_by_name)
 VALUES(t,b,person,'2026-10-01','present','FORGED');
 INSERT INTO public.kitchen_attendance(tenant_id,branch_id,roster_id,attendance_date,status)
 VALUES(t,b,person,'2026-10-01','half_day')
 ON CONFLICT(tenant_id,branch_id,roster_id,attendance_date) DO UPDATE SET status=excluded.status;
 SELECT count(*),min(updated_by_name) INTO row_count,actor_name FROM public.kitchen_attendance
 WHERE tenant_id=t AND branch_id=b AND roster_id=person AND attendance_date='2026-10-01' AND status='half_day';
 IF row_count<>1 OR actor_name='FORGED' THEN RAISE EXCEPTION 'One-person/day or actor integrity failed'; END IF;
 BEGIN
  INSERT INTO public.kitchen_attendance(tenant_id,branch_id,roster_id,attendance_date,status)
  VALUES(t,b,person,(now() AT TIME ZONE 'Asia/Kolkata')::date+1,'present');
  RAISE EXCEPTION 'Future date accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM NOT LIKE '%KITCHEN_ATTENDANCE_FUTURE%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.kitchen_attendance SET attendance_date='2026-10-02' WHERE tenant_id=t AND branch_id=b AND roster_id=person;
  RAISE EXCEPTION 'Day identity moved';
 EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM NOT LIKE '%KITCHEN_ATTENDANCE_IDENTITY%' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO public.kitchen_staff_roster(tenant_id,branch_id,name) VALUES(t,gen_random_uuid(),'Wrong branch');
  RAISE EXCEPTION 'Cross-branch write accepted';
 EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.kitchen_attendance(tenant_id,branch_id,roster_id,attendance_date,status) VALUES(t,b,person,'2026-10-03','INVALID');
  RAISE EXCEPTION 'Invalid status accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.kitchen_staff_roster SET is_active=false WHERE tenant_id=t AND branch_id=b AND id=person;
 UPDATE public.kitchen_attendance SET status='leave' WHERE tenant_id=t AND branch_id=b AND roster_id=person;
 BEGIN
  INSERT INTO public.kitchen_attendance(tenant_id,branch_id,roster_id,attendance_date,status) VALUES(t,b,person,'2026-10-02','present');
  RAISE EXCEPTION 'Archived person new day accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN IF SQLERRM NOT LIKE '%KITCHEN_ATTENDANCE_ARCHIVED%' THEN RAISE; END IF; END;
 SELECT count(*) INTO row_count FROM public.kitchen_attendance WHERE tenant_id=t AND branch_id=b AND roster_id=person AND status='leave';
 IF row_count<>1 THEN RAISE EXCEPTION 'Archived attendance lost'; END IF;
 BEGIN
  DELETE FROM public.kitchen_staff_roster WHERE tenant_id=t AND branch_id=b AND id=person;
  RAISE EXCEPTION 'Physical delete allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.kitchen_staff_roster(tenant_id,branch_id,name) VALUES(t,b,'Unmarked fixture '||gen_random_uuid()::text) RETURNING id INTO second_person;
 SELECT count(*) INTO row_count FROM public.kitchen_attendance WHERE tenant_id=t AND branch_id=b AND roster_id=second_person;
 IF row_count<>0 THEN RAISE EXCEPTION 'Staff marked automatically'; END IF;
END $tests$;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 BEGIN
  PERFORM 1 FROM public.kitchen_attendance;
  RAISE EXCEPTION 'Anonymous attendance access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $anon$;
ROLLBACK;
