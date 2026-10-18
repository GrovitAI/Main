-- Task 202: the invoice and edit flags each cover exactly one entry. The
-- entry triggers clear them as they read them, so a flag can never carry over
-- to a later statement in the same transaction. Bodies otherwise as in
-- 20261012140100_kitchen_access_enforce.sql. Idempotent: safe to run twice.

CREATE OR REPLACE FUNCTION public.kitchen_guard_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  NEW.created_by_id := auth.uid();
  SELECT nullif(btrim(s.name), '') INTO v_name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.tenant_id = NEW.tenant_id
    AND s.status = 'active' AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1;
  NEW.created_by := coalesce(v_name, NEW.created_by, 'Staff');
  -- The invoice flag allows exactly one entry, so it is cleared as it is read.
  IF coalesce(current_setting('kitchen.via', true), '') = 'invoice' THEN
    PERFORM set_config('kitchen.via', '', true);
  ELSE
    PERFORM public.kitchen_require(NEW.tenant_id, NEW.branch_id, CASE NEW.type
      WHEN 'sent' THEN 'entries.send' WHEN 'received' THEN 'entries.receive' WHEN 'bought' THEN 'entries.buy'
      WHEN 'paid' THEN 'entries.pay' WHEN 'spent' THEN 'entries.spend' WHEN 'made' THEN 'entries.batch'
      WHEN 'count' THEN 'entries.count' ELSE 'entries.unknown' END);
  END IF;
  IF NEW.entry_date > v_today THEN
    RAISE EXCEPTION 'KITCHEN_FUTURE_DATE' USING ERRCODE = '22023';
  END IF;
  IF NEW.entry_date < v_today AND NOT public.kitchen_can(NEW.tenant_id, NEW.branch_id, 'entries.backdate') THEN
    RAISE EXCEPTION 'KITCHEN_BACKDATE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  PERFORM public.kitchen_lock_check(NEW.tenant_id, NEW.branch_id, NEW.entry_date, 'entry', NEW.id, true);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.kitchen_guard_void()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_edit boolean;
BEGIN
  IF auth.uid() IS NULL OR OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL THEN RETURN NEW; END IF;
  IF NOT (public.kitchen_can(OLD.tenant_id, OLD.branch_id, 'fix.any')
    OR (public.kitchen_can(OLD.tenant_id, OLD.branch_id, 'fix.own') AND OLD.created_by_id = auth.uid()
        AND (OLD.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today)) THEN
    RAISE EXCEPTION 'KITCHEN_NOT_ALLOWED' USING ERRCODE = '42501', DETAIL = 'fix';
  END IF;
  PERFORM public.kitchen_lock_check(OLD.tenant_id, OLD.branch_id, OLD.entry_date, 'entry', OLD.id, true);
  v_edit := coalesce(current_setting('kitchen.via', true), '') = 'edit';
  -- The edit flag marks exactly one void, so it is cleared as it is read.
  IF v_edit THEN PERFORM set_config('kitchen.via', '', true); END IF;
  PERFORM public.kitchen_audit(OLD.tenant_id, OLD.branch_id,
    CASE WHEN v_edit THEN 'entry_edited' ELSE 'entry_voided' END,
    'entry', OLD.id, OLD.entry_date, NEW.void_reason,
    jsonb_build_object('type', OLD.type, 'amount_paise', OLD.amount_paise, 'created_by', OLD.created_by));
  RETURN NEW;
END $$;
