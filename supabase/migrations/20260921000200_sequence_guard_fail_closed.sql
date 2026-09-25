-- ============================================================================
-- Migration: make the document-number guard fail closed
-- RLS audit 2026-09-21, finding H1.  NOT YET APPLIED.
--
-- next_branch_sequence() is SECURITY DEFINER and hands out invoice, order and
-- KOT numbers. next_invoice_number() and next_kot_number() are thin wrappers
-- round it, so its guard is the only thing protecting all three. The guard is:
--
--   IF auth.uid() IS NOT NULL
--      AND NOT public.auth_can_access_branch(p_tenant_id, p_branch_id) THEN
--     RAISE EXCEPTION 'SEQ_FORBIDDEN';
--
-- auth_can_access_branch() compares against the caller's staff row. For a
-- signed-in user with NO active staff row — a deactivated cashier whose token
-- has not expired, or any account created through Supabase Auth sign-up —
-- auth_tenant_id() is NULL, the comparison is NULL, NOT NULL is NULL, and
-- plpgsql treats IF NULL as false. The exception is never raised. The audit
-- confirmed this read-only: for auth user e6bbca51-… (no staff row) the guard
-- expression evaluates to NULL; for the demo reviewer it evaluates to true.
--
-- What such a caller can do today, for ANY tenant and branch id they supply:
--   * burn invoice numbers, leaving gaps in a GST invoice series;
--   * read the returned number, which is that branch's lifetime bill count;
--   * hold the branch_counters row lock in a loop, stalling settlement.
--
-- The fix is one line: `IS NOT TRUE` instead of `NOT`, so NULL is a refusal.
-- The cron/worker path (no JWT at all, so auth.uid() IS NULL and the session
-- role is postgres or service_role) is still let through, exactly as before.
-- A JWT-bearing role with a NULL uid is now refused as well.
--
-- Signature, return type, seeding and increment logic are unchanged; the body
-- below is the live definition as of 2026-09-21 with only the guard edited.
-- Re-runnable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_branch_sequence(p_tenant_id uuid, p_branch_id uuid, p_kind text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seed_bill  bigint;
  v_seed_order bigint;
  v_seed_kot   bigint;
  v_next       bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'SEQ_INVALID_ARGS' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('bill', 'order', 'kot') THEN
    RAISE EXCEPTION 'SEQ_INVALID_KIND' USING ERRCODE = '22023';
  END IF;

  -- Callers must belong to the branch. Cron and worker paths carry no JWT, so
  -- auth.uid() and auth.role() are both NULL there and they are let through.
  -- Anything arriving through the API carries a JWT role; it must resolve to a
  -- staff row with access to this branch. IS NOT TRUE makes "no staff row"
  -- (NULL) a refusal rather than a pass.
  IF (auth.uid() IS NOT NULL OR coalesce(auth.role(), '') IN ('anon', 'authenticated'))
     AND public.auth_can_access_branch(p_tenant_id, p_branch_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'SEQ_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- First use for this branch: seed from the highest numbers already issued.
  IF NOT EXISTS (SELECT 1 FROM public.branch_counters
                  WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id) THEN
    SELECT greatest(
             coalesce((SELECT max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint)
                         FROM public.bills
                        WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id), 0),
             coalesce((SELECT max(nullif(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint)
                         FROM public.open_orders
                        WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id), 0))
      INTO v_seed_bill;

    SELECT coalesce(max(nullif(regexp_replace(order_name, '\D', '', 'g'), '')::bigint), 0)
      INTO v_seed_order
      FROM public.open_orders
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
       AND order_name ILIKE 'Order #%';

    SELECT coalesce(max(kot_number), 0)
      INTO v_seed_kot
      FROM public.kots
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id;

    INSERT INTO public.branch_counters (tenant_id, branch_id, bill_seq, order_seq, kot_seq)
    VALUES (p_tenant_id, p_branch_id, v_seed_bill, v_seed_order, v_seed_kot)
    ON CONFLICT (tenant_id, branch_id) DO NOTHING;
  END IF;

  -- Atomic increment under the row lock taken by UPDATE.
  IF p_kind = 'bill' THEN
    UPDATE public.branch_counters SET bill_seq = bill_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING bill_seq INTO v_next;
  ELSIF p_kind = 'order' THEN
    UPDATE public.branch_counters SET order_seq = order_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING order_seq INTO v_next;
  ELSE
    UPDATE public.branch_counters SET kot_seq = kot_seq + 1, updated_at = now()
     WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id
     RETURNING kot_seq INTO v_next;
  END IF;

  RETURN v_next;
END;
$function$;
