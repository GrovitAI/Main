-- ============================================================================
-- Migration: a cash count for the kitchen's books — Task 113
--
-- Day Close reconciles the tills from POS sales. Nothing checked the cash
-- box or the bank balance of a ledger account against what the ledger says
-- should be there. finance_record_cash_count() does that in one transaction:
--
--   * reads what the ledger expects in the account's cash or bank on the day,
--   * stores the count next to it (finance_cash_counts), and
--   * when they differ and the caller asks for it, posts the difference into
--     the ledger so the books match the box again: a shortage as an expense,
--     a surplus as income, under the "Cash Over / Short" category, tied to the
--     count so it is posted once and never edited by hand.
--
-- Who may count: whoever may see the account's balance (the owner, or a clerk
-- when the owner has switched "clerks see balances" on), inside their scope.
-- The table is written only by the function; signed-in users read it.
--
-- Safe to run twice.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A count is a third kind of document that can post an entry
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_entries DROP CONSTRAINT IF EXISTS finance_entries_source;
ALTER TABLE public.finance_entries ADD CONSTRAINT finance_entries_source CHECK (
  (source_type IS NULL AND source_id IS NULL)
  OR (source_type IN ('purchase', 'dispatch', 'cash_count') AND source_id IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- 2. The counts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_cash_counts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  account_id          uuid NOT NULL REFERENCES public.finance_accounts(id),
  -- 'cash': the cash box. 'bank': the bank statement balance.
  mode                text NOT NULL CHECK (mode IN ('cash', 'bank')),
  counted_on          date NOT NULL,
  expected_paise      bigint NOT NULL,
  counted_paise       bigint NOT NULL,
  difference_paise    bigint GENERATED ALWAYS AS (counted_paise - expected_paise) STORED,
  -- The ledger entry that carried the difference, when one was posted.
  adjustment_entry_id uuid REFERENCES public.finance_entries(id),
  note                text,
  counted_by          uuid NOT NULL REFERENCES public.staff(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_cash_counts_cash_not_negative CHECK (mode <> 'cash' OR counted_paise >= 0)
);

CREATE INDEX IF NOT EXISTS finance_cash_counts_account_idx
  ON public.finance_cash_counts (tenant_id, account_id, counted_on DESC, created_at DESC);

ALTER TABLE public.finance_cash_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_cash_counts FROM anon;
REVOKE ALL ON public.finance_cash_counts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_cash_counts TO service_role;
-- Signed-in users read; only finance_record_cash_count() writes.
GRANT SELECT ON public.finance_cash_counts TO authenticated;

DROP POLICY IF EXISTS finance_cash_counts_select ON public.finance_cash_counts;
CREATE POLICY finance_cash_counts_select ON public.finance_cash_counts FOR SELECT
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.finance_account_in_scope(account_id)
    AND (
      public.finance_is_owner()
      OR (public.finance_is_clerk()
          AND coalesce((SELECT r.clerk_sees_balances FROM public.finance_rules r WHERE r.tenant_id = finance_cash_counts.tenant_id), false))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Recording a count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_record_cash_count(
  p_account_id    uuid,
  p_mode          text,
  p_counted_paise bigint,
  p_counted_on    date,
  p_note          text DEFAULT NULL,
  p_adjust        boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant   uuid := public.auth_tenant_id();
  v_staff    uuid := public.finance_current_staff_id();
  v_balance  record;
  v_expected bigint;
  v_diff     bigint;
  v_count    uuid;
  v_category uuid;
  v_entry    uuid;
  v_what     text;
BEGIN
  IF v_tenant IS NULL OR v_staff IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a count.' USING ERRCODE = '42501';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'Say whether the cash box or the bank balance was counted.' USING ERRCODE = '23514';
  END IF;
  IF p_counted_paise IS NULL OR (p_mode = 'cash' AND p_counted_paise < 0) THEN
    RAISE EXCEPTION 'Enter the amount that was counted.' USING ERRCODE = '23514';
  END IF;
  IF p_counted_on IS NULL OR p_counted_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'A count is dated today or earlier.' USING ERRCODE = '23514';
  END IF;

  -- finance_balances() refuses anyone who may not see this account's balance.
  SELECT * INTO v_balance FROM public.finance_balances(p_account_id, p_counted_on);
  v_expected := CASE WHEN p_mode = 'cash' THEN v_balance.cash_paise ELSE v_balance.bank_paise END;
  v_diff := p_counted_paise - v_expected;

  INSERT INTO public.finance_cash_counts (tenant_id, account_id, mode, counted_on, expected_paise, counted_paise, note, counted_by)
  VALUES (v_tenant, p_account_id, p_mode, p_counted_on, v_expected, p_counted_paise, nullif(btrim(coalesce(p_note, '')), ''), v_staff)
  RETURNING id INTO v_count;

  IF coalesce(p_adjust, true) AND v_diff <> 0 THEN
    SELECT id INTO v_category FROM public.finance_catalog
     WHERE tenant_id = v_tenant AND system_key = 'cash_difference';
    IF v_category IS NULL THEN
      INSERT INTO public.finance_catalog (tenant_id, level, name, default_kind, sort_order, system_key)
      VALUES (v_tenant, 'category', 'Cash Over / Short', 'expense', 175, 'cash_difference')
      RETURNING id INTO v_category;
    END IF;

    v_what := CASE WHEN p_mode = 'cash' THEN 'Cash count' ELSE 'Bank reconciliation' END;
    PERFORM set_config('finance.system', 'on', true);
    INSERT INTO public.finance_entries (
      tenant_id, account_id, kind, amount_paise, mode, transaction_date, entered_by,
      category_id, particulars, notes, source_type, source_id
    ) VALUES (
      v_tenant, p_account_id,
      CASE WHEN v_diff > 0 THEN 'income' ELSE 'expense' END,
      abs(v_diff), p_mode, p_counted_on, v_staff,
      v_category,
      v_what || CASE WHEN v_diff > 0 THEN ' · over' ELSE ' · short' END,
      nullif(btrim(coalesce(p_note, '')), ''),
      'cash_count', v_count
    )
    RETURNING id INTO v_entry;
    PERFORM set_config('finance.system', 'off', true);

    UPDATE public.finance_cash_counts SET adjustment_entry_id = v_entry WHERE id = v_count;
  END IF;

  RETURN json_build_object(
    'count_id', v_count,
    'expected_paise', v_expected,
    'counted_paise', p_counted_paise,
    'difference_paise', v_diff,
    'entry_id', v_entry
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finance_record_cash_count(uuid, text, bigint, date, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_record_cash_count(uuid, text, bigint, date, text, boolean) TO authenticated;
