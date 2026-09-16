-- ============================================================================
-- Migration: Finance ledger step 2 — Task 74
--
-- Payables, receivables, settlement, transfers between accounts and the
-- "Paid from / For" model (docs/FINANCE_LEDGER_PLAN.md §2, §3).
--
--   1. finance_entries.paid_from_account_id: whose cash or bank the money left
--      (or arrived in), when that is not the account whose books carry the
--      entry. NULL means the same account, which is the everyday case.
--      Balances follow the paying account; categories, profit and the
--      transactions page follow account_id ("For").
--   2. finance_settle_entry(): records the payment of a payable or receivable
--      in one transaction: a new expense or income entry linked to the
--      original, and the original's settled amount and status. Partial
--      settlement is allowed. Voiding a payment reverses it.
--   3. The write trigger keeps settlement bookkeeping honest: settled amounts,
--      links and the settled status change only through the function or the
--      void reversal, a payment keeps its money facts, and an entry with
--      payments against it cannot be voided until they are.
--   4. finance_interaccount_positions(): who owes whom, netted per pair, from
--      every entry one account paid for another.
--   5. finance_ledger_summary(): per-account ledger income, expenses and
--      outstanding amounts for the Books card.
--   6. finance_movement() and the snapshot invalidation follow the paying
--      account, so balances stay right.
--
-- Idempotent and additive. Applied to the live project on 2026-09-16 and
-- verified with a rolled-back end-to-end test: payable, partial settlement
-- paid by another account, full settlement, positions, balances, summary,
-- the hand-edit guard, and the reversal when a payment is voided.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Paid from
-- ---------------------------------------------------------------------------
ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS paid_from_account_id uuid REFERENCES public.finance_accounts(id);

CREATE INDEX IF NOT EXISTS finance_entries_paid_from_idx
  ON public.finance_entries (paid_from_account_id)
  WHERE paid_from_account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Balances follow the paying account
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_movement(p_account_id uuid, p_from date, p_upto date)
RETURNS TABLE (cash_paise bigint, bank_paise bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH e AS (
    SELECT x.kind, x.mode, x.transfer_from, x.transfer_to, x.amount_paise,
           x.account_id AS for_account,
           coalesce(x.paid_from_account_id, x.account_id) AS paying_account
      FROM public.finance_entries x
     WHERE (x.account_id = p_account_id OR x.paid_from_account_id = p_account_id)
       AND x.status = 'recorded'
       AND (p_from IS NULL OR x.transaction_date >= p_from)
       AND (p_upto IS NULL OR x.transaction_date <= p_upto)
  )
  SELECT
    (coalesce(sum(CASE WHEN kind = 'income'   AND mode = 'cash' AND paying_account = p_account_id THEN amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN kind = 'expense'  AND mode = 'cash' AND paying_account = p_account_id THEN amount_paise ELSE 0 END), 0)
     + coalesce(sum(CASE WHEN kind = 'transfer' AND transfer_to   = 'cash' AND for_account    = p_account_id THEN amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN kind = 'transfer' AND transfer_from = 'cash' AND paying_account = p_account_id THEN amount_paise ELSE 0 END), 0))::bigint,
    (coalesce(sum(CASE WHEN kind = 'income'   AND mode = 'bank' AND paying_account = p_account_id THEN amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN kind = 'expense'  AND mode = 'bank' AND paying_account = p_account_id THEN amount_paise ELSE 0 END), 0)
     + coalesce(sum(CASE WHEN kind = 'transfer' AND transfer_to   = 'bank' AND for_account    = p_account_id THEN amount_paise ELSE 0 END), 0)
     - coalesce(sum(CASE WHEN kind = 'transfer' AND transfer_from = 'bank' AND paying_account = p_account_id THEN amount_paise ELSE 0 END), 0))::bigint
  FROM e;
$$;
REVOKE ALL ON FUNCTION public.finance_movement(uuid, date, date) FROM public, anon, authenticated;

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
   WHERE s.account_id IN (
           NEW.account_id,
           NEW.paid_from_account_id,
           CASE WHEN TG_OP = 'UPDATE' THEN OLD.account_id ELSE NEW.account_id END,
           CASE WHEN TG_OP = 'UPDATE' THEN OLD.paid_from_account_id ELSE NEW.paid_from_account_id END
         )
     AND s.month > v_touch;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_invalidate_snapshots ON public.finance_entries;
CREATE TRIGGER finance_invalidate_snapshots
  AFTER INSERT OR UPDATE OF account_id, paid_from_account_id, kind, status, amount_paise, mode, transfer_from, transfer_to, transaction_date
  ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_invalidate_snapshots();

-- ---------------------------------------------------------------------------
-- 3. The write trigger, with settlement and "paid from" rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_entries_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rules     public.finance_rules%ROWTYPE;
  v_staff     uuid := public.finance_current_staff_id();
  -- Set by finance_settle_entry() and the void reversal for the transaction.
  v_settling  boolean := coalesce(current_setting('finance.settling', true), '') = 'on';
  v_paid_from public.finance_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_rules FROM public.finance_rules WHERE tenant_id = NEW.tenant_id;

  NEW.particulars := btrim(NEW.particulars);

  -- Paid from / For. The same account on both sides is stored as NULL.
  IF NEW.paid_from_account_id = NEW.account_id THEN
    NEW.paid_from_account_id := NULL;
  END IF;
  IF NEW.paid_from_account_id IS NOT NULL THEN
    IF NEW.kind IN ('payable', 'receivable') THEN
      RAISE EXCEPTION 'A payable or receivable moves no money yet. Choose who pays when it is settled.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_paid_from FROM public.finance_accounts WHERE id = NEW.paid_from_account_id;
    IF v_paid_from.id IS NULL OR v_paid_from.tenant_id <> NEW.tenant_id OR NOT v_paid_from.is_active THEN
      RAISE EXCEPTION 'Unknown paying account.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.entered_by := coalesce(NEW.entered_by, v_staff);
    NEW.entered_at := now();
    NEW.updated_at := now();
    NEW.updated_by := NEW.entered_by;
    NEW.version    := 1;
    IF NEW.kind IN ('payable', 'receivable') THEN
      NEW.status := 'open';
    ELSE
      NEW.status := 'recorded';
    END IF;
    IF NEW.settles_entry_id IS NOT NULL AND NOT v_settling THEN
      RAISE EXCEPTION 'Use Settle on the payable or receivable to record its payment.' USING ERRCODE = '42501';
    END IF;
    NEW.settled_paise := 0;
    NEW.settled_at    := NULL;
    NEW.settled_by    := NULL;
    IF NEW.kind = 'transfer' AND NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_transfer, false) THEN
      RAISE EXCEPTION 'Transfers are recorded by the owner.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: what can never change.
  NEW.id         := OLD.id;
  NEW.tenant_id  := OLD.tenant_id;
  NEW.entered_at := OLD.entered_at;
  NEW.entered_by := OLD.entered_by;
  NEW.version    := OLD.version + 1;
  NEW.updated_at := now();
  NEW.updated_by := v_staff;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'A voided entry cannot be changed.' USING ERRCODE = '42501';
  END IF;

  -- Settlement bookkeeping changes only through finance_settle_entry() or
  -- the reversal that voiding a payment triggers.
  IF NOT v_settling AND (
       NEW.settled_paise <> OLD.settled_paise
    OR NEW.settles_entry_id IS DISTINCT FROM OLD.settles_entry_id
    OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
    OR NEW.settled_by IS DISTINCT FROM OLD.settled_by
    OR (NEW.status = 'settled' AND OLD.status <> 'settled')
    OR (NEW.status = 'open' AND OLD.status = 'settled')
  ) THEN
    RAISE EXCEPTION 'Settlement is recorded with Settle, not by editing.' USING ERRCODE = '42501';
  END IF;

  -- A payment that settles another entry keeps its money facts. Void it and
  -- settle again to change them; the reversal keeps the original right.
  IF OLD.settles_entry_id IS NOT NULL AND NEW.status <> 'void' AND (
       NEW.amount_paise <> OLD.amount_paise
    OR NEW.kind <> OLD.kind
    OR NEW.account_id <> OLD.account_id
    OR NEW.paid_from_account_id IS DISTINCT FROM OLD.paid_from_account_id
  ) THEN
    RAISE EXCEPTION 'This payment settles another entry. Void it and settle again to change the amount or account.' USING ERRCODE = '42501';
  END IF;

  -- An entry with payments against it.
  IF OLD.settled_paise > 0 THEN
    IF NEW.status = 'void' THEN
      RAISE EXCEPTION 'This entry has payments against it. Void those payments first.' USING ERRCODE = '42501';
    END IF;
    IF NEW.kind <> OLD.kind OR NEW.account_id <> OLD.account_id THEN
      RAISE EXCEPTION 'This entry has payments against it. Its kind and account cannot change.' USING ERRCODE = '42501';
    END IF;
    IF NEW.amount_paise < NEW.settled_paise THEN
      RAISE EXCEPTION 'The amount cannot be less than what has already been settled.' USING ERRCODE = '23514';
    END IF;
    IF NOT v_settling THEN
      -- Raising the amount above what was paid reopens it.
      NEW.status := CASE WHEN NEW.settled_paise >= NEW.amount_paise THEN 'settled' ELSE 'open' END;
    END IF;
  ELSIF NEW.status <> 'void' AND NOT v_settling THEN
    -- Nothing settled yet: the status follows the kind.
    NEW.status := CASE WHEN NEW.kind IN ('payable', 'receivable') THEN 'open' ELSE 'recorded' END;
  END IF;

  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    IF NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_void, false) THEN
      RAISE EXCEPTION 'Only the owner can void an entry.' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(coalesce(NEW.void_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'A reason is needed to void an entry.' USING ERRCODE = '23514';
    END IF;
    NEW.voided_at := now();
    NEW.voided_by := v_staff;
  END IF;

  IF NEW.kind = 'transfer' AND OLD.kind <> 'transfer' AND NOT public.finance_is_owner() AND NOT coalesce(v_rules.clerk_can_transfer, false) THEN
    RAISE EXCEPTION 'Transfers are recorded by the owner.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Voiding a payment gives the amount back to the entry it settled.
CREATE OR REPLACE FUNCTION public.finance_entries_after_void()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'void' AND OLD.status <> 'void' AND NEW.settles_entry_id IS NOT NULL THEN
    PERFORM set_config('finance.settling', 'on', true);
    UPDATE public.finance_entries o
       SET settled_paise = greatest(0, o.settled_paise - NEW.amount_paise),
           status        = CASE
                             WHEN o.status = 'void' THEN o.status
                             WHEN greatest(0, o.settled_paise - NEW.amount_paise) >= o.amount_paise THEN 'settled'
                             ELSE 'open'
                           END,
           settled_at    = CASE WHEN greatest(0, o.settled_paise - NEW.amount_paise) >= o.amount_paise THEN o.settled_at ELSE NULL END,
           settled_by    = CASE WHEN greatest(0, o.settled_paise - NEW.amount_paise) >= o.amount_paise THEN o.settled_by ELSE NULL END
     WHERE o.id = NEW.settles_entry_id;
    PERFORM set_config('finance.settling', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_entries_after_void ON public.finance_entries;
CREATE TRIGGER finance_entries_after_void
  AFTER UPDATE OF status ON public.finance_entries
  FOR EACH ROW EXECUTE FUNCTION public.finance_entries_after_void();

-- The edit trail records the paying account too.
CREATE OR REPLACE FUNCTION public.finance_entries_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tracked text[] := ARRAY[
    'account_id', 'paid_from_account_id', 'kind', 'status', 'amount_paise', 'mode', 'transfer_from', 'transfer_to',
    'transaction_date', 'category_id', 'subcategory_id', 'particular_id', 'particulars',
    'counterparty', 'reference_no', 'notes', 'settles_entry_id', 'settled_paise', 'void_reason'
  ];
  v_old jsonb;
  v_new jsonb := to_jsonb(NEW);
  v_changes jsonb := '{}'::jsonb;
  v_field text;
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOREACH v_field IN ARRAY v_tracked LOOP
      IF v_new -> v_field IS NOT NULL AND v_new -> v_field <> 'null'::jsonb THEN
        v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', null, 'to', v_new -> v_field));
      END IF;
    END LOOP;
    INSERT INTO public.finance_entry_revisions (tenant_id, entry_id, action, changed_by, changes)
    VALUES (NEW.tenant_id, NEW.id, 'create', NEW.entered_by, v_changes);
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  FOREACH v_field IN ARRAY v_tracked LOOP
    IF v_old -> v_field IS DISTINCT FROM v_new -> v_field THEN
      v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('from', v_old -> v_field, 'to', v_new -> v_field));
    END IF;
  END LOOP;
  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_action := CASE
    WHEN NEW.status = 'void' AND OLD.status <> 'void' THEN 'void'
    WHEN NEW.status = 'settled' AND OLD.status <> 'settled' THEN 'settle'
    ELSE 'update'
  END;
  INSERT INTO public.finance_entry_revisions (tenant_id, entry_id, action, changed_by, changes)
  VALUES (NEW.tenant_id, NEW.id, v_action, NEW.updated_by, v_changes);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Settlement
-- ---------------------------------------------------------------------------
-- Records a payment against an open payable or receivable and returns the
-- payment entry's id. The payment is an expense (for a payable) or income
-- (for a receivable) in the original's account and category, linked through
-- settles_entry_id. Partial amounts leave the original open with the
-- remainder; the full amount marks it settled.
CREATE OR REPLACE FUNCTION public.finance_settle_entry(
  p_entry_id             uuid,
  p_amount_paise         bigint,
  p_mode                 text,
  p_transaction_date     date,
  p_paid_from_account_id uuid DEFAULT NULL,
  p_reference_no         text DEFAULT NULL,
  p_notes                text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_staff     uuid := public.finance_current_staff_id();
  v_orig      public.finance_entries%ROWTYPE;
  v_remaining bigint;
  v_payment   uuid;
  v_settled   bigint;
BEGIN
  IF v_staff IS NULL OR NOT (public.finance_is_owner() OR public.finance_is_clerk()) THEN
    RAISE EXCEPTION 'Sign in as the owner or a clerk to settle an entry.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_orig FROM public.finance_entries WHERE id = p_entry_id FOR UPDATE;
  IF v_orig.id IS NULL OR v_orig.tenant_id IS DISTINCT FROM public.auth_tenant_id() OR NOT public.finance_can_read(v_orig) THEN
    RAISE EXCEPTION 'That entry is not available to you.' USING ERRCODE = '42501';
  END IF;
  IF v_orig.kind NOT IN ('payable', 'receivable') THEN
    RAISE EXCEPTION 'Only a payable or a receivable can be settled.' USING ERRCODE = '23514';
  END IF;
  IF v_orig.status <> 'open' THEN
    RAISE EXCEPTION 'This entry is % and cannot be settled.', v_orig.status USING ERRCODE = '23514';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'Say whether it was paid in cash or through the bank.' USING ERRCODE = '23514';
  END IF;
  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'A transaction date is needed.' USING ERRCODE = '23514';
  END IF;
  v_remaining := v_orig.amount_paise - v_orig.settled_paise;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'The amount must be more than zero.' USING ERRCODE = '23514';
  END IF;
  IF p_amount_paise > v_remaining THEN
    RAISE EXCEPTION 'Only % paise remain to be settled on this entry.', v_remaining USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('finance.settling', 'on', true);

  INSERT INTO public.finance_entries (
    tenant_id, account_id, paid_from_account_id, kind, amount_paise, mode, transaction_date, entered_by,
    category_id, subcategory_id, particular_id, particulars, counterparty, reference_no, notes, settles_entry_id
  ) VALUES (
    v_orig.tenant_id,
    v_orig.account_id,
    p_paid_from_account_id,
    CASE WHEN v_orig.kind = 'payable' THEN 'expense' ELSE 'income' END,
    p_amount_paise,
    p_mode,
    p_transaction_date,
    v_staff,
    v_orig.category_id, v_orig.subcategory_id, v_orig.particular_id,
    v_orig.particulars, v_orig.counterparty,
    nullif(btrim(coalesce(p_reference_no, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_orig.id
  )
  RETURNING id INTO v_payment;

  v_settled := v_orig.settled_paise + p_amount_paise;
  UPDATE public.finance_entries
     SET settled_paise = v_settled,
         status        = CASE WHEN v_settled >= amount_paise THEN 'settled' ELSE 'open' END,
         settled_at    = CASE WHEN v_settled >= amount_paise THEN now() ELSE NULL END,
         settled_by    = CASE WHEN v_settled >= amount_paise THEN v_staff ELSE NULL END
   WHERE id = v_orig.id;

  PERFORM set_config('finance.settling', 'off', true);
  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_settle_entry(uuid, bigint, text, date, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_settle_entry(uuid, bigint, text, date, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Between accounts: who owes whom
-- ---------------------------------------------------------------------------
-- Money one account paid for another builds up a position: an expense paid
-- by X for Y, or a transfer from X to Y, means Y owes X; income collected by
-- X for Y means X owes Y. Netted per pair; only non-zero positions returned.
CREATE OR REPLACE FUNCTION public.finance_interaccount_positions()
RETURNS TABLE (owed_by uuid, owed_to uuid, amount_paise bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_allowed boolean;
BEGIN
  v_allowed := public.finance_is_owner()
    OR (public.finance_is_clerk() AND coalesce((SELECT r.clerk_sees_balances FROM public.finance_rules r WHERE r.tenant_id = v_tenant), false));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Balances are visible to the owner.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH moves AS (
    SELECT CASE WHEN e.kind = 'income' THEN e.paid_from_account_id ELSE e.account_id END AS debtor,
           CASE WHEN e.kind = 'income' THEN e.account_id ELSE e.paid_from_account_id END AS creditor,
           e.amount_paise
      FROM public.finance_entries e
     WHERE e.tenant_id = v_tenant
       AND e.status = 'recorded'
       AND e.paid_from_account_id IS NOT NULL
       AND e.kind IN ('income', 'expense', 'transfer')
  ),
  pairs AS (
    SELECT least(m.debtor, m.creditor) AS a,
           greatest(m.debtor, m.creditor) AS b,
           sum(CASE WHEN m.debtor = least(m.debtor, m.creditor) THEN m.amount_paise ELSE -m.amount_paise END)::bigint AS net
      FROM moves m
     GROUP BY least(m.debtor, m.creditor), greatest(m.debtor, m.creditor)
  )
  SELECT CASE WHEN p.net > 0 THEN p.a ELSE p.b END,
         CASE WHEN p.net > 0 THEN p.b ELSE p.a END,
         abs(p.net)::bigint
    FROM pairs p
   WHERE p.net <> 0;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_interaccount_positions() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_interaccount_positions() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Books summary per account
-- ---------------------------------------------------------------------------
-- Ledger income and expenses in a date range by the account whose books
-- carry them, built-in categories (Opening Balance, Partners) excluded, and
-- what is still open in payables and receivables as of the range's end.
CREATE OR REPLACE FUNCTION public.finance_ledger_summary(p_start date, p_end date)
RETURNS TABLE (account_id uuid, income_paise bigint, expense_paise bigint, open_payables_paise bigint, open_receivables_paise bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.auth_tenant_id();
  v_allowed boolean;
BEGIN
  v_allowed := public.finance_is_owner()
    OR (public.finance_is_clerk() AND coalesce((SELECT r.clerk_sees_balances FROM public.finance_rules r WHERE r.tenant_id = v_tenant), false));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Balances are visible to the owner.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id,
         coalesce(sum(CASE WHEN e.status = 'recorded' AND e.kind = 'income'  AND e.transaction_date BETWEEN p_start AND p_end
                            AND NOT coalesce(c.is_system, false) THEN e.amount_paise ELSE 0 END), 0)::bigint,
         coalesce(sum(CASE WHEN e.status = 'recorded' AND e.kind = 'expense' AND e.transaction_date BETWEEN p_start AND p_end
                            AND NOT coalesce(c.is_system, false) THEN e.amount_paise ELSE 0 END), 0)::bigint,
         coalesce(sum(CASE WHEN e.status = 'open' AND e.kind = 'payable'    AND e.transaction_date <= p_end THEN e.amount_paise - e.settled_paise ELSE 0 END), 0)::bigint,
         coalesce(sum(CASE WHEN e.status = 'open' AND e.kind = 'receivable' AND e.transaction_date <= p_end THEN e.amount_paise - e.settled_paise ELSE 0 END), 0)::bigint
    FROM public.finance_accounts a
    LEFT JOIN public.finance_entries e ON e.account_id = a.id
    LEFT JOIN public.finance_catalog c ON c.id = e.category_id
   WHERE a.tenant_id = v_tenant AND a.is_active
   GROUP BY a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_ledger_summary(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finance_ledger_summary(date, date) TO authenticated;
