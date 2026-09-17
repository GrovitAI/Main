-- The finance ledger gets a branch scope — Task 93 (2 of 2).
--
-- The ledger's permissions knew two levels, "owner" (owner + admin) and "clerk"
-- (manager + accountant), and neither was tied to a branch: an admin saw every
-- branch's account, the partner accounts, the positions between accounts and the
-- whole-business summary, and a clerk saw every other clerk's entries.
--
-- Now every ledger read and write also asks whether the ACCOUNT is in the
-- caller's scope:
--   * the owner: every account of the tenant;
--   * everyone else: the branch account of their own branch, nothing more.
-- An admin keeps the owner-level powers (edit any entry, void, balances,
-- settling) inside that one account.
--
-- An entry is readable when its own account is in scope, or when it was paid
-- from an account in scope: if another account's expense was paid out of this
-- branch's money, this branch needs to see where its money went.
--
-- The accounts themselves and the finance rules are business-wide settings, so
-- writing them becomes the owner's alone. The catalogue stays as it was: it is
-- shared, but a branch admin adding an expense category is everyday work.
--
-- No data is changed. Safe to run twice.

CREATE OR REPLACE FUNCTION public.finance_is_business_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT coalesce(public.auth_role() = 'owner', false); $function$;

CREATE OR REPLACE FUNCTION public.finance_account_in_scope(p_account_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.finance_accounts a
     WHERE a.id = p_account_id
       AND a.tenant_id = public.auth_tenant_id()
       AND (
         public.finance_is_business_owner()
         OR (a.kind = 'branch' AND a.branch_id = public.auth_branch_id())
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.finance_is_business_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_account_in_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_is_business_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.finance_account_in_scope(uuid) TO authenticated;

-- Reading an entry.
CREATE OR REPLACE FUNCTION public.finance_can_read(e finance_entries)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.tenant_id = public.auth_tenant_id()
     AND (
       public.finance_account_in_scope(e.account_id)
       OR (e.paid_from_account_id IS NOT NULL AND public.finance_account_in_scope(e.paid_from_account_id))
     )
     AND (
       public.finance_is_owner()
       OR (
         public.finance_is_clerk()
         AND (
           coalesce((SELECT r.clerk_sees_partner_entries FROM public.finance_rules r WHERE r.tenant_id = e.tenant_id), false)
           OR EXISTS (SELECT 1 FROM public.staff s WHERE s.id = e.entered_by AND s.role IN ('accountant', 'manager'))
         )
       )
     );
$function$;

-- Editing an entry: only inside an account in scope.
CREATE OR REPLACE FUNCTION public.finance_can_edit(e finance_entries)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((
    SELECT e.tenant_id = public.auth_tenant_id()
       AND e.status <> 'void'
       AND public.finance_account_in_scope(e.account_id)
       AND (
         public.finance_is_owner()
         OR (
           public.finance_is_clerk()
           AND e.entered_by = public.finance_current_staff_id()
           AND (
             r.clerk_edits_after_day_end
             OR public.finance_ledger_day(e.entered_at, r.day_end_time) = public.finance_ledger_day(now(), r.day_end_time)
           )
         )
       )
      FROM public.finance_rules r
     WHERE r.tenant_id = e.tenant_id
  ), false);
$function$;

-- Writing a new entry: only into an account in scope.
DROP POLICY IF EXISTS finance_entries_insert ON public.finance_entries;
CREATE POLICY finance_entries_insert ON public.finance_entries FOR INSERT
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (public.finance_is_owner() OR public.finance_is_clerk())
    AND entered_by = public.finance_current_staff_id()
    AND public.finance_account_in_scope(account_id)
  );

-- Balances of one account.
CREATE OR REPLACE FUNCTION public.finance_balances(p_account_id uuid, p_upto date DEFAULT NULL::date)
 RETURNS TABLE(cash_paise bigint, bank_paise bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_allowed := (public.finance_is_owner()
    OR (public.finance_is_clerk() AND coalesce((SELECT r.clerk_sees_balances FROM public.finance_rules r WHERE r.tenant_id = v_account.tenant_id), false)))
    AND public.finance_account_in_scope(p_account_id);
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Balances are visible to the owner.' USING ERRCODE = '42501';
  END IF;

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
$function$;

-- Positions between accounts: only the pairs the caller's account is part of.
CREATE OR REPLACE FUNCTION public.finance_interaccount_positions()
 RETURNS TABLE(owed_by uuid, owed_to uuid, amount_paise bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   WHERE p.net <> 0
     AND (public.finance_account_in_scope(p.a) OR public.finance_account_in_scope(p.b));
END;
$function$;

-- Per-account summary: only the accounts in scope.
CREATE OR REPLACE FUNCTION public.finance_ledger_summary(p_start date, p_end date)
 RETURNS TABLE(account_id uuid, income_paise bigint, expense_paise bigint, open_payables_paise bigint, open_receivables_paise bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     AND public.finance_account_in_scope(a.id)
   GROUP BY a.id;
END;
$function$;

-- Business-wide settings: the owner's alone.
DROP POLICY IF EXISTS finance_accounts_insert ON public.finance_accounts;
CREATE POLICY finance_accounts_insert ON public.finance_accounts FOR INSERT
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_business_owner());

DROP POLICY IF EXISTS finance_accounts_update ON public.finance_accounts;
CREATE POLICY finance_accounts_update ON public.finance_accounts FOR UPDATE
  USING (tenant_id = public.auth_tenant_id() AND public.finance_is_business_owner())
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_business_owner());

DROP POLICY IF EXISTS finance_rules_insert ON public.finance_rules;
CREATE POLICY finance_rules_insert ON public.finance_rules FOR INSERT
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_business_owner());

DROP POLICY IF EXISTS finance_rules_update ON public.finance_rules;
CREATE POLICY finance_rules_update ON public.finance_rules FOR UPDATE
  USING (tenant_id = public.auth_tenant_id() AND public.finance_is_business_owner())
  WITH CHECK (tenant_id = public.auth_tenant_id() AND public.finance_is_business_owner());
