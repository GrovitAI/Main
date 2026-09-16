-- ============================================================================
-- Migration: Finance ledger performance — Task 72
--
-- Keeps the ledger fast as it grows:
--   1. Trigram indexes so "contains" search on particulars, counterparty,
--      reference and notes uses an index instead of scanning the table.
--   2. A composite index for the common "category within a date range" filter.
--   3. Monthly balance snapshots, so finance_balances() sums the current month
--      on top of a stored figure rather than an account's whole history. A
--      trigger drops snapshots an edit makes stale; a nightly pg_cron job
--      rebuilds the current month's.
--
-- Idempotent and additive. Applied to the live project on 2026-09-16.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Search
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS finance_entries_particulars_trgm
  ON public.finance_entries USING gin (particulars gin_trgm_ops);
CREATE INDEX IF NOT EXISTS finance_entries_counterparty_trgm
  ON public.finance_entries USING gin (counterparty gin_trgm_ops);
CREATE INDEX IF NOT EXISTS finance_entries_reference_trgm
  ON public.finance_entries USING gin (reference_no gin_trgm_ops);
CREATE INDEX IF NOT EXISTS finance_entries_notes_trgm
  ON public.finance_entries USING gin (notes gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Filters
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS finance_entries_category_date_idx
  ON public.finance_entries (tenant_id, category_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS finance_entries_kind_date_idx
  ON public.finance_entries (tenant_id, kind, transaction_date DESC);

-- ---------------------------------------------------------------------------
-- 3. Balance snapshots
-- ---------------------------------------------------------------------------
-- One row per account per month: the cash and bank position from all
-- recorded entries dated before the first of that month, opening balances
-- excluded (the function adds those).
CREATE TABLE IF NOT EXISTS public.finance_balance_snapshots (
  account_id  uuid NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  month       date NOT NULL,
  cash_paise  bigint NOT NULL,
  bank_paise  bigint NOT NULL,
  built_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, month),
  CONSTRAINT finance_balance_snapshots_month CHECK (month = date_trunc('month', month)::date)
);

ALTER TABLE public.finance_balance_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_balance_snapshots FROM anon, public, authenticated;
-- Read and written only by the functions below, which run as their owner.

-- The movement an account's recorded entries produce over a date span.
CREATE OR REPLACE FUNCTION public.finance_movement(p_account_id uuid, p_from date, p_upto date)
RETURNS TABLE (cash_paise bigint, bank_paise bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (coalesce(sum(CASE WHEN e.kind = 'income'   AND e.mode = 'cash' THEN e.amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN e.kind = 'expense'  AND e.mode = 'cash' THEN e.amount_paise ELSE 0 END), 0)
     + coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_to   = 'cash' THEN e.amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_from = 'cash' THEN e.amount_paise ELSE 0 END), 0))::bigint,
    (coalesce(sum(CASE WHEN e.kind = 'income'   AND e.mode = 'bank' THEN e.amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN e.kind = 'expense'  AND e.mode = 'bank' THEN e.amount_paise ELSE 0 END), 0)
     + coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_to   = 'bank' THEN e.amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN e.kind = 'transfer' AND e.transfer_from = 'bank' THEN e.amount_paise ELSE 0 END), 0))::bigint
  FROM public.finance_entries e
  WHERE e.account_id = p_account_id
    AND e.status = 'recorded'
    AND (p_from IS NULL OR e.transaction_date >= p_from)
    AND (p_upto IS NULL OR e.transaction_date <= p_upto);
$$;
REVOKE ALL ON FUNCTION public.finance_movement(uuid, date, date) FROM public, anon, authenticated;

-- Balances = opening + latest usable snapshot + movement since that month.
CREATE OR REPLACE FUNCTION public.finance_balances(p_account_id uuid, p_upto date DEFAULT NULL)
RETURNS TABLE (cash_paise bigint, bank_paise bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_account public.finance_accounts%ROWTYPE;
  v_allowed boolean;
  v_snapshot public.finance_balance_snapshots%ROWTYPE;
  v_from date := NULL;
  v_move record;
BEGIN
  SELECT * INTO v_account FROM public.finance_accounts WHERE id = p_account_id;
  IF v_account.id IS NULL OR v_account.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'Unknown account.' USING ERRCODE = '42501';
  END IF;
  v_allowed := public.finance_is_owner()
    OR (public.finance_is_clerk() AND coalesce((SELECT r.clerk_sees_balances FROM public.finance_rules r WHERE r.tenant_id = v_account.tenant_id), false));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Balances are visible to the owner.' USING ERRCODE = '42501';
  END IF;

  -- The newest snapshot whose month starts on or before the date asked for.
  SELECT * INTO v_snapshot
    FROM public.finance_balance_snapshots s
   WHERE s.account_id = p_account_id
     AND (p_upto IS NULL OR s.month <= p_upto)
   ORDER BY s.month DESC
   LIMIT 1;
  IF v_snapshot.account_id IS NOT NULL THEN
    v_from := v_snapshot.month;
  END IF;

  SELECT * INTO v_move FROM public.finance_movement(p_account_id, v_from, p_upto);

  RETURN QUERY SELECT
    (v_account.opening_cash_paise + coalesce(v_snapshot.cash_paise, 0) + v_move.cash_paise)::bigint,
    (v_account.opening_bank_paise + coalesce(v_snapshot.bank_paise, 0) + v_move.bank_paise)::bigint;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_balances(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_balances(uuid, date) TO authenticated;

-- An entry dated inside a snapshotted month (or earlier) makes every snapshot
-- from that month on stale. Drop them; the nightly job rebuilds.
CREATE OR REPLACE FUNCTION public.finance_invalidate_snapshots()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_touch date;
BEGIN
  v_touch := NEW.transaction_date;
  IF TG_OP = 'UPDATE' AND OLD.transaction_date < v_touch THEN
    v_touch := OLD.transaction_date;
  END IF;
  DELETE FROM public.finance_balance_snapshots s
   WHERE s.account_id IN (NEW.account_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.account_id ELSE NEW.account_id END)
     AND s.month > v_touch;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_invalidate_snapshots ON public.finance_entries;
CREATE TRIGGER finance_invalidate_snapshots
  AFTER INSERT OR UPDATE OF account_id, kind, status, amount_paise, mode, transfer_from, transfer_to, transaction_date
  ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_invalidate_snapshots();

-- Builds this month's snapshot for every active account that lacks it: the
-- full position through the end of last month, from the previous snapshot
-- where one exists.
CREATE OR REPLACE FUNCTION public.finance_refresh_balance_snapshots()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_account record;
  v_prev public.finance_balance_snapshots%ROWTYPE;
  v_move record;
  v_built integer := 0;
BEGIN
  FOR v_account IN SELECT id FROM public.finance_accounts WHERE is_active LOOP
    IF EXISTS (SELECT 1 FROM public.finance_balance_snapshots WHERE account_id = v_account.id AND month = v_month) THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_prev
      FROM public.finance_balance_snapshots s
     WHERE s.account_id = v_account.id AND s.month < v_month
     ORDER BY s.month DESC
     LIMIT 1;
    SELECT * INTO v_move
      FROM public.finance_movement(v_account.id, v_prev.month, (v_month - 1)::date);
    INSERT INTO public.finance_balance_snapshots (account_id, month, cash_paise, bank_paise)
    VALUES (v_account.id, v_month, coalesce(v_prev.cash_paise, 0) + v_move.cash_paise, coalesce(v_prev.bank_paise, 0) + v_move.bank_paise)
    ON CONFLICT (account_id, month) DO UPDATE
      SET cash_paise = EXCLUDED.cash_paise, bank_paise = EXCLUDED.bank_paise, built_at = now();
    v_built := v_built + 1;
  END LOOP;
  RETURN v_built;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_refresh_balance_snapshots() FROM public, anon, authenticated;

-- Nightly at 03:00 IST (21:30 UTC), after the ledger day has ended.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'finance-balance-snapshots';
    PERFORM cron.schedule('finance-balance-snapshots', '30 21 * * *', 'SELECT public.finance_refresh_balance_snapshots();');
  ELSE
    RAISE WARNING 'pg_cron is not installed: balance snapshots will not be built nightly.';
  END IF;
END $$;

-- Build the first snapshot now so the function has one to start from.
SELECT public.finance_refresh_balance_snapshots();
