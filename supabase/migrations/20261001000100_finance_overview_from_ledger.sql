-- ============================================================================
-- Migration: one set of books — the Overview reads the ledger — Task 111
--
-- The Finance Overview summed the old `expenses` table and the purchase
-- headers, while the Ledger kept its own entries: three screens could show
-- three different totals. From here the Overview's expense figures come from
-- finance_entries, the same rows the Ledger shows.
--
--   * Expenses: recorded expense entries whose account ("For") is the branch
--     in view, or every branch account when all branches are in view. Built-in
--     categories (Opening Balance, Partners) are left out, as in the Books card.
--   * Purchases already post to the ledger as expenses (when paid) or payables
--     (task 110), so the profit and loss no longer subtracts purchase headers
--     as well. purchasesTotal stays as information: supplier invoices dated in
--     the range.
--   * Other income: recorded income entries of those accounts. With all
--     branches in view, income from one of our own accounts (a branch paying
--     the kitchen for goods) is internal and is left out; with one branch in
--     view it is that branch's income.
--   * Supplies from the kitchen: with ONE branch in view, the value of goods
--     billed to it by another of our accounts in the range (receivables with
--     this branch as the counterparty). It is that branch's cost of goods even
--     though nothing is written in the branch's own books. Zero with all
--     branches in view, where it cancels against the kitchen's purchases.
--   * Cash out: cash-mode expenses actually paid by those accounts, plus cash
--     refunds. Cash in gains cash-mode ledger income received by them. Cash is
--     about what physically moved, so a partner's drawing counts here although
--     it is not an expense in the profit and loss; only the Opening Balance
--     category, which moves nothing, is left out.
--   * The two built-in categories get a system_key ('opening_balance',
--     'partners') so they are recognised by key, not by name.
--
-- Both functions stay SECURITY INVOKER: row level security on finance_entries
-- decides what the caller may add up, exactly as it does on the Ledger tab.
-- No data is changed. Safe to run twice.
-- ============================================================================

-- The built-in categories, by key.
UPDATE public.finance_catalog c
   SET system_key = 'opening_balance'
 WHERE c.level = 'category' AND c.is_system AND c.system_key IS NULL AND lower(c.name) = 'opening balance'
   AND NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = c.tenant_id AND x.system_key = 'opening_balance');
UPDATE public.finance_catalog c
   SET system_key = 'partners'
 WHERE c.level = 'category' AND c.is_system AND c.system_key IS NULL AND lower(c.name) = 'partners'
   AND NOT EXISTS (SELECT 1 FROM public.finance_catalog x WHERE x.tenant_id = c.tenant_id AND x.system_key = 'partners');

CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_tenant_id  uuid,
  p_branch_id  uuid,
  p_start_ts   timestamptz,
  p_end_ts     timestamptz,
  p_start_date date,
  p_end_date   date
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  WITH bills_in_range AS (
    SELECT
      id, status, payment_status, total_amount, subtotal, tax_amount, discount_amount,
      (status = 'paid' AND discount_type = 'percent' AND discount_value = 100) AS is_comp
    FROM public.bills
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (
        (status = 'paid' AND settled_at >= p_start_ts AND settled_at < p_end_ts)
        OR
        (status <> 'paid' AND created_at >= p_start_ts AND created_at < p_end_ts)
      )
  ),
  bill_metrics AS (
    SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' AND NOT is_comp THEN total_amount END), 0)    AS gross_sales,
      COUNT(CASE WHEN status = 'paid' AND NOT is_comp THEN 1 END)                           AS bill_count,
      COALESCE(SUM(CASE WHEN status <> 'cancelled' AND payment_status = 'unpaid'
                        THEN total_amount END), 0)                                         AS pending_collections,
      COALESCE(SUM(CASE WHEN status = 'paid' AND NOT is_comp THEN tax_amount END), 0)      AS tax_collected,
      COALESCE(SUM(CASE WHEN status = 'paid' AND NOT is_comp THEN discount_amount END), 0) AS discounts_given,
      COALESCE(SUM(CASE WHEN is_comp THEN subtotal END), 0)                                AS complimentary_value
    FROM bills_in_range
  ),
  settle AS (
    SELECT LOWER(s.payment_type) AS payment_type, SUM(s.amount) AS total, COUNT(*) AS cnt
    FROM public.settlements s
    JOIN bills_in_range b ON b.id = s.bill_id AND b.status = 'paid' AND NOT b.is_comp
    WHERE s.tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY LOWER(s.payment_type)
  ),
  settle_tot AS (
    SELECT
      COALESCE(SUM(total), 0)                                            AS collected_revenue,
      COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total END), 0)   AS cash_in
    FROM settle
  ),
  -- The branch accounts in view: one branch's, or every branch's.
  accts AS (
    SELECT a.id
    FROM public.finance_accounts a
    WHERE a.tenant_id = p_tenant_id
      AND a.kind = 'branch'
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
  ),
  -- Money the ledger recorded in the range.
  led AS (
    SELECT e.kind, e.mode, e.amount_paise, e.account_id,
           COALESCE(e.paid_from_account_id, e.account_id) AS paying_account,
           e.counterparty_account_id,
           COALESCE(NULLIF(btrim(c.name), ''), 'Uncategorised') AS category,
           COALESCE(c.is_system, false) AS is_system,
           c.system_key
    FROM public.finance_entries e
    LEFT JOIN public.finance_catalog c ON c.id = e.category_id
    WHERE e.tenant_id = p_tenant_id
      AND e.status = 'recorded'
      AND e.kind IN ('income', 'expense')
      AND e.transaction_date >= p_start_date AND e.transaction_date <= p_end_date
  ),
  exp AS (
    SELECT l.category, SUM(l.amount_paise) / 100.0 AS total, COUNT(*) AS cnt
    FROM led l
    WHERE l.kind = 'expense' AND NOT l.is_system AND l.account_id IN (SELECT id FROM accts)
    GROUP BY l.category
  ),
  exp_tot AS (
    SELECT COALESCE(SUM(total), 0) AS expenses_total,
           COALESCE(SUM(cnt), 0)   AS expenses_count
    FROM exp
  ),
  cash AS (
    SELECT
      COALESCE(SUM(CASE WHEN l.kind = 'expense' THEN l.amount_paise END), 0) / 100.0 AS cash_out,
      COALESCE(SUM(CASE WHEN l.kind = 'income'
                         AND (p_branch_id IS NOT NULL OR l.counterparty_account_id IS NULL)
                        THEN l.amount_paise END), 0) / 100.0                         AS cash_income
    FROM led l
    WHERE l.mode = 'cash'
      AND l.system_key IS DISTINCT FROM 'opening_balance'
      AND l.paying_account IN (SELECT id FROM accts)
  ),
  oth AS (
    SELECT COALESCE(SUM(l.amount_paise), 0) / 100.0 AS other_income, COUNT(*) AS other_income_count
    FROM led l
    WHERE l.kind = 'income'
      AND NOT l.is_system
      AND l.account_id IN (SELECT id FROM accts)
      AND (p_branch_id IS NOT NULL OR l.counterparty_account_id IS NULL)
  ),
  sup AS (
    SELECT COALESCE(SUM(e.amount_paise), 0) / 100.0 AS supplies_from_kitchen
    FROM public.finance_entries e
    WHERE p_branch_id IS NOT NULL
      AND e.tenant_id = p_tenant_id
      AND e.kind = 'receivable'
      AND e.status IN ('open', 'settled')
      AND e.counterparty_account_id IN (SELECT id FROM accts)
      AND e.transaction_date >= p_start_date AND e.transaction_date <= p_end_date
  ),
  ref AS (
    SELECT COALESCE(SUM(amount), 0) AS refunds_total,
           COUNT(*)                 AS refunds_count,
           COALESCE(SUM(CASE WHEN refund_method = 'cash' THEN amount END), 0) AS cash_refunds
    FROM public.refunds
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'completed'
      AND created_at >= p_start_ts AND created_at < p_end_ts
  ),
  pur AS (
    SELECT COALESCE(SUM(grand_total), 0) AS purchases_total, COUNT(*) AS purchases_count
    FROM public.inventory_purchase_headers
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND COALESCE(status, '') <> 'cancelled'
      AND purchase_date >= p_start_date::timestamptz
      AND purchase_date <  (p_end_date + 1)::timestamptz
  )
  SELECT json_build_object(
    'grossSales',          ROUND(bm.gross_sales::numeric, 2),
    'billCount',           bm.bill_count,
    'collectedRevenue',    ROUND(st.collected_revenue::numeric, 2),
    'pendingCollections',  ROUND(bm.pending_collections::numeric, 2),
    'taxCollected',        ROUND(bm.tax_collected::numeric, 2),
    'discountsGiven',      ROUND(bm.discounts_given::numeric, 2),
    'complimentaryValue',  ROUND(bm.complimentary_value::numeric, 2),
    'refundsTotal',        ROUND(rf.refunds_total::numeric, 2),
    'refundsCount',        rf.refunds_count,
    'expensesTotal',       ROUND(et.expenses_total::numeric, 2),
    'expensesCount',       et.expenses_count,
    'otherIncome',         ROUND(ot.other_income::numeric, 2),
    'otherIncomeCount',    ot.other_income_count,
    'suppliesFromKitchen', ROUND(su.supplies_from_kitchen::numeric, 2),
    'purchasesTotal',      ROUND(pu.purchases_total::numeric, 2),
    'purchasesCount',      pu.purchases_count,
    'cashIn',              ROUND((st.cash_in + ca.cash_income)::numeric, 2),
    'cashOut',             ROUND((ca.cash_out + rf.cash_refunds)::numeric, 2),
    'paymentSplit',        COALESCE((SELECT json_agg(json_build_object(
                             'payment_type', s.payment_type, 'total', ROUND(s.total::numeric, 2), 'count', s.cnt)
                             ORDER BY s.total DESC) FROM settle s), '[]'::json),
    'expensesByCategory',  COALESCE((SELECT json_agg(json_build_object(
                             'category', e.category, 'total', ROUND(e.total::numeric, 2), 'count', e.cnt)
                             ORDER BY e.total DESC) FROM exp e), '[]'::json)
  ) INTO result
  FROM bill_metrics bm, settle_tot st, exp_tot et, cash ca, oth ot, sup su, ref rf, pur pu;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_summary(uuid, uuid, timestamptz, timestamptz, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_summary(uuid, uuid, timestamptz, timestamptz, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_finance_summary(uuid, uuid, timestamptz, timestamptz, date, date) TO authenticated;

-- One row per business date: revenue (settlements of paid, non-complimentary
-- bills, plus the ledger's other income), order count, the ledger's expenses
-- and the net.
CREATE OR REPLACE FUNCTION public.get_finance_daily_series(
  p_tenant_id  uuid,
  p_branch_id  uuid,
  p_start_ts   timestamptz,
  p_end_ts     timestamptz,
  p_start_date date,
  p_end_date   date,
  p_timezone   text DEFAULT 'Asia/Kolkata'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  WITH days AS (
    SELECT d::date AS business_date
    FROM generate_series(p_start_date, p_end_date, interval '1 day') d
  ),
  paid_bills AS (
    SELECT id,
           (((settled_at AT TIME ZONE p_timezone) - interval '2 hours 30 minutes')::date) AS business_date
    FROM public.bills
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'paid'
      AND NOT (discount_type = 'percent' AND discount_value = 100)
      AND settled_at >= p_start_ts AND settled_at < p_end_ts
  ),
  rev AS (
    SELECT b.business_date, SUM(s.amount) AS revenue, COUNT(DISTINCT b.id) AS orders
    FROM public.settlements s
    JOIN paid_bills b ON b.id = s.bill_id
    WHERE s.tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY b.business_date
  ),
  accts AS (
    SELECT a.id
    FROM public.finance_accounts a
    WHERE a.tenant_id = p_tenant_id
      AND a.kind = 'branch'
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
  ),
  led AS (
    SELECT e.transaction_date AS business_date,
           SUM(CASE WHEN e.kind = 'expense' THEN e.amount_paise ELSE 0 END) / 100.0 AS expenses,
           SUM(CASE WHEN e.kind = 'income'
                     AND (p_branch_id IS NOT NULL OR e.counterparty_account_id IS NULL)
                    THEN e.amount_paise ELSE 0 END) / 100.0                          AS other_income
    FROM public.finance_entries e
    LEFT JOIN public.finance_catalog c ON c.id = e.category_id
    WHERE e.tenant_id = p_tenant_id
      AND e.status = 'recorded'
      AND e.kind IN ('income', 'expense')
      AND e.account_id IN (SELECT id FROM accts)
      AND e.transaction_date >= p_start_date AND e.transaction_date <= p_end_date
      AND NOT COALESCE(c.is_system, false)
    GROUP BY e.transaction_date
  )
  SELECT COALESCE(json_agg(json_build_object(
    'date',     to_char(d.business_date, 'YYYY-MM-DD'),
    'revenue',  ROUND((COALESCE(r.revenue, 0) + COALESCE(l.other_income, 0))::numeric, 2),
    'orders',   COALESCE(r.orders, 0),
    'expenses', ROUND(COALESCE(l.expenses, 0)::numeric, 2),
    'net',      ROUND((COALESCE(r.revenue, 0) + COALESCE(l.other_income, 0) - COALESCE(l.expenses, 0))::numeric, 2)
  ) ORDER BY d.business_date), '[]'::json)
  INTO result
  FROM days d
  LEFT JOIN rev r ON r.business_date = d.business_date
  LEFT JOIN led l ON l.business_date = d.business_date;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_daily_series(uuid, uuid, timestamptz, timestamptz, date, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_finance_daily_series(uuid, uuid, timestamptz, timestamptz, date, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_finance_daily_series(uuid, uuid, timestamptz, timestamptz, date, date, text) TO authenticated;
