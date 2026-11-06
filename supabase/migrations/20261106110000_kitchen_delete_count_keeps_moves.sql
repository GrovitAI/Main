-- Task 307: deleting a stock count took the stock back to the figure the count found, which lost
-- anything sent, bought, given or made after it: count 100, send 30, delete the count, and the
-- stock came out as it was before the count instead of 30 lower. Deleting a count now takes back
-- only what that count changed. Latest version of the function (20261017110000) with that one line
-- changed. On 2026-11-06 production had no stock counts, so no figures need correcting.

CREATE OR REPLACE FUNCTION public.kitchen_void_entry(p_entry_id uuid, p_reason text DEFAULT NULL)
RETURNS public.kitchen_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry public.kitchen_entries%ROWTYPE;
  v_line  record;
  v_by    text := coalesce(
            (SELECT s.name FROM public.staff s WHERE s.auth_user_id = auth.uid() AND s.status = 'active' AND s.deleted_at IS NULL ORDER BY s.created_at LIMIT 1),
            'Staff');
BEGIN
  SELECT * INTO v_entry FROM public.kitchen_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR NOT public.kitchen_can_use(v_entry.tenant_id, v_entry.branch_id) THEN
    RAISE EXCEPTION 'KITCHEN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_entry.voided_at IS NOT NULL THEN
    RETURN v_entry;
  END IF;
  IF nullif(btrim(coalesce(current_setting('kitchen.lock_reason', true), '')), '') IS NULL AND coalesce(p_reason, '') <> 'Edited' THEN
    PERFORM set_config('kitchen.lock_reason', left(btrim(coalesce(p_reason, '')), 200), true);
  END IF;
  PERFORM set_config('kitchen.posting', 'on', true);

  IF v_entry.type IN ('sent', 'bought') THEN
    FOR v_line IN SELECT item_id, qty FROM public.kitchen_entry_lines WHERE entry_id = v_entry.id LOOP
      UPDATE public.kitchen_items
         SET stock = stock + CASE WHEN v_entry.type = 'sent' THEN v_line.qty ELSE -v_line.qty END
       WHERE id = v_line.item_id;
    END LOOP;
  ELSIF v_entry.type = 'issued' THEN
    FOR v_line IN SELECT item_id, qty FROM public.kitchen_entry_lines WHERE entry_id = v_entry.id LOOP
      UPDATE public.kitchen_items SET stock = stock + v_line.qty WHERE id = v_line.item_id;
    END LOOP;
  ELSIF v_entry.type = 'made' THEN
    UPDATE public.kitchen_items SET stock = stock - v_entry.qty WHERE id = v_entry.item_id;
  ELSIF v_entry.type = 'count' THEN
    -- Task 307: take back only what this count changed, so what moved after it stays.
    UPDATE public.kitchen_items SET stock = stock + coalesce(v_entry.from_qty - v_entry.qty, 0) WHERE id = v_entry.item_id;
  END IF;

  -- A voided payment no longer covers anything; a voided buy or send is no
  -- longer covered. Either way the money becomes plain give-and-take again.
  DELETE FROM public.kitchen_allocations WHERE payment_id = v_entry.id OR covers_id = v_entry.id;

  UPDATE public.kitchen_entries
     SET voided_at = now(), voided_by = v_by, void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = v_entry.id
  RETURNING * INTO v_entry;
  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.kitchen_void_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_void_entry(uuid, text) TO authenticated;
