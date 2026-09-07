-- ============================================================================
-- Migration: Finance module schema — Task 30
--
-- REVIEW BEFORE APPLYING. Nothing in this file is applied automatically; the
-- finance UI degrades gracefully (read-only aggregates, base-column expense
-- entry) until it is run in the Supabase SQL Editor.
--
-- What changes
--   1. `expenses` — the table exists today with only
--        id, tenant_id, branch_id, amount, category, description, date,
--        created_by, created_at
--      This adds payment method, payee, reference, notes, receipt URL, a
--      soft-void status, paired integer paise and updated_at, plus indexes.
--   2. `expense_categories` — NEW, tenant-wide category master, seeded with
--      sensible restaurant defaults for every existing tenant.
--   3. `refunds` — exists today as an empty shell (id, tenant_id, branch_id,
--      bill_id, created_at). Adds amount, method, reason and status so refunds
--      can reduce net revenue in finance reports.
--   4. `finance_day_closures` — NEW, one row per (tenant, branch, business
--      date) for end-of-day cash reconciliation.
--   5. RPCs `get_finance_summary` and `get_finance_daily_series` — server
--      side aggregation (mirrors the analytics RPC approach so totals are
--      never capped by the PostgREST 1,000-row limit).
--   6. RLS on the new tables, reusing the auth_* helpers from
--      20260907000100_rls_policies.sql when they exist.
--
-- How to apply: Supabase SQL Editor, run the whole file AFTER
-- 20260907000100_rls_policies.sql (the RLS block is skipped if the helper
-- functions are not installed yet, so the order is a recommendation, not a
-- hard requirement).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. expenses — extend
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS amount_paise   bigint,
  ADD COLUMN IF NOT EXISTS payment_method text        NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payee          text,
  ADD COLUMN IF NOT EXISTS reference_no   text,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS receipt_url    text,
  ADD COLUMN IF NOT EXISTS status         text        NOT NULL DEFAULT 'recorded',
  ADD COLUMN IF NOT EXISTS void_reason    text,
  ADD COLUMN IF NOT EXISTS voided_at      timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_method_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_method_check
  CHECK (payment_method IN ('cash', 'upi', 'card', 'bank_transfer', 'other'));

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('recorded', 'void'));

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_non_negative;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_non_negative
  CHECK (amount >= 0);

-- Back-fill paise for any rows that pre-date this migration.
UPDATE public.expenses SET amount_paise = ROUND(amount * 100) WHERE amount_paise IS NULL;

-- Keep amount_paise and updated_at authoritative regardless of the writer.
CREATE OR REPLACE FUNCTION public.finance_expenses_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.amount_paise := ROUND(NEW.amount * 100);
  NEW.updated_at   := now();
  IF NEW.status = 'void' AND NEW.voided_at IS NULL THEN
    NEW.voided_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_expenses_before_write ON public.expenses;
CREATE TRIGGER trg_finance_expenses_before_write
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.finance_expenses_before_write();

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch_date
  ON public.expenses (tenant_id, branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_branch_status_category
  ON public.expenses (tenant_id, branch_id, status, category);

-- ---------------------------------------------------------------------------
-- 2. expense_categories — NEW (tenant-wide, like inventory_recipes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_categories_tenant_name
  ON public.expense_categories (tenant_id, lower(name));

INSERT INTO public.expense_categories (tenant_id, name, sort_order)
SELECT t.id, d.name, d.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
  ('Raw Materials',         10),
  ('Groceries & Supplies',  20),
  ('Staff Salary',          30),
  ('Staff Welfare',         40),
  ('Rent',                  50),
  ('Electricity',           60),
  ('Water',                 70),
  ('Gas / Fuel',            80),
  ('Maintenance & Repairs', 90),
  ('Cleaning',             100),
  ('Packaging',            110),
  ('Marketing',            120),
  ('Delivery Charges',     130),
  ('Transport',            140),
  ('Licenses & Fees',      150),
  ('Bank Charges',         160),
  ('Petty Cash',           170),
  ('Miscellaneous',        180)
) AS d(name, sort_order)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. refunds — extend the shell
-- ---------------------------------------------------------------------------
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS amount        numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paise  bigint,
  ADD COLUMN IF NOT EXISTS refund_method text        NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS reason        text,
  ADD COLUMN IF NOT EXISTS reference_no  text,
  ADD COLUMN IF NOT EXISTS status        text        NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS created_by    uuid,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check
  CHECK (status IN ('completed', 'void'));

UPDATE public.refunds SET amount_paise = ROUND(amount * 100) WHERE amount_paise IS NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_tenant_branch_created
  ON public.refunds (tenant_id, branch_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. finance_day_closures — NEW
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_day_closures (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  branch_id      uuid        NOT NULL,
  business_date  date        NOT NULL,
  opening_cash   numeric     NOT NULL DEFAULT 0,
  cash_sales     numeric     NOT NULL DEFAULT 0,
  cash_refunds   numeric     NOT NULL DEFAULT 0,
  cash_expenses  numeric     NOT NULL DEFAULT 0,
  expected_cash  numeric     NOT NULL DEFAULT 0,
  counted_cash   numeric,
  variance       numeric,
  notes          text,
  status         text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by      uuid,
  closed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_finance_day_closures UNIQUE (tenant_id, branch_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_finance_day_closures_branch_date
  ON public.finance_day_closures (tenant_id, branch_id, business_date DESC);

-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------

-- 5a. get_finance_summary
-- Bills/settlements use the business-day timestamp window (p_start_ts/p_end_ts,
-- computed client side via reporting-utils). Expenses use their calendar
-- `date` column and purchases their purchase_date, so those take the date pair.
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
  exp AS (
    SELECT category, SUM(amount) AS total, COUNT(*) AS cnt,
           SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) AS cash_out
    FROM public.expenses
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'recorded'
      AND date >= p_start_date AND date <= p_end_date
    GROUP BY category
  ),
  exp_tot AS (
    SELECT COALESCE(SUM(total), 0)    AS expenses_total,
           COALESCE(SUM(cnt), 0)      AS expenses_count,
           COALESCE(SUM(cash_out), 0) AS cash_out
    FROM exp
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
    'purchasesTotal',      ROUND(pu.purchases_total::numeric, 2),
    'purchasesCount',      pu.purchases_count,
    'cashIn',              ROUND(st.cash_in::numeric, 2),
    'cashOut',             ROUND((et.cash_out + rf.cash_refunds)::numeric, 2),
    'paymentSplit',        COALESCE((SELECT json_agg(json_build_object(
                             'payment_type', s.payment_type, 'total', ROUND(s.total::numeric, 2), 'count', s.cnt)
                             ORDER BY s.total DESC) FROM settle s), '[]'::json),
    'expensesByCategory',  COALESCE((SELECT json_agg(json_build_object(
                             'category', e.category, 'total', ROUND(e.total::numeric, 2), 'count', e.cnt)
                             ORDER BY e.total DESC) FROM exp e), '[]'::json)
  ) INTO result
  FROM bill_metrics bm, settle_tot st, exp_tot et, ref rf, pur pu;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_summary(uuid, uuid, timestamptz, timestamptz, date, date) TO authenticated;

-- 5b. get_finance_daily_series
-- One row per business date in the window: revenue (settlements of paid,
-- non-complimentary bills), order count, expenses (calendar date) and net.
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
  exp AS (
    SELECT date AS business_date, SUM(amount) AS expenses
    FROM public.expenses
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND status = 'recorded'
      AND date >= p_start_date AND date <= p_end_date
    GROUP BY date
  )
  SELECT COALESCE(json_agg(json_build_object(
    'date',     to_char(d.business_date, 'YYYY-MM-DD'),
    'revenue',  ROUND(COALESCE(r.revenue, 0)::numeric, 2),
    'orders',   COALESCE(r.orders, 0),
    'expenses', ROUND(COALESCE(e.expenses, 0)::numeric, 2),
    'net',      ROUND((COALESCE(r.revenue, 0) - COALESCE(e.expenses, 0))::numeric, 2)
  ) ORDER BY d.business_date), '[]'::json)
  INTO result
  FROM days d
  LEFT JOIN rev r ON r.business_date = d.business_date
  LEFT JOIN exp e ON e.business_date = d.business_date;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finance_daily_series(uuid, uuid, timestamptz, timestamptz, date, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS for the new tables (skipped if the auth helpers are not installed)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_can_access_branch') THEN
    -- expense_categories: tenant-wide read, manager+ write
    ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS expense_categories_select ON public.expense_categories;
    DROP POLICY IF EXISTS expense_categories_insert ON public.expense_categories;
    DROP POLICY IF EXISTS expense_categories_update ON public.expense_categories;
    DROP POLICY IF EXISTS expense_categories_delete ON public.expense_categories;
    CREATE POLICY expense_categories_select ON public.expense_categories FOR SELECT TO authenticated
      USING (tenant_id = public.auth_tenant_id());
    CREATE POLICY expense_categories_insert ON public.expense_categories FOR INSERT TO authenticated
      WITH CHECK (tenant_id = public.auth_tenant_id() AND public.auth_is_manager());
    CREATE POLICY expense_categories_update ON public.expense_categories FOR UPDATE TO authenticated
      USING (tenant_id = public.auth_tenant_id() AND public.auth_is_manager())
      WITH CHECK (tenant_id = public.auth_tenant_id() AND public.auth_is_manager());
    CREATE POLICY expense_categories_delete ON public.expense_categories FOR DELETE TO authenticated
      USING (tenant_id = public.auth_tenant_id() AND public.auth_is_manager());

    -- finance_day_closures: branch scoped
    ALTER TABLE public.finance_day_closures ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS finance_day_closures_select ON public.finance_day_closures;
    DROP POLICY IF EXISTS finance_day_closures_insert ON public.finance_day_closures;
    DROP POLICY IF EXISTS finance_day_closures_update ON public.finance_day_closures;
    DROP POLICY IF EXISTS finance_day_closures_delete ON public.finance_day_closures;
    CREATE POLICY finance_day_closures_select ON public.finance_day_closures FOR SELECT TO authenticated
      USING (public.auth_can_access_branch(tenant_id, branch_id));
    CREATE POLICY finance_day_closures_insert ON public.finance_day_closures FOR INSERT TO authenticated
      WITH CHECK (public.auth_can_access_branch(tenant_id, branch_id));
    CREATE POLICY finance_day_closures_update ON public.finance_day_closures FOR UPDATE TO authenticated
      USING (public.auth_can_access_branch(tenant_id, branch_id))
      WITH CHECK (public.auth_can_access_branch(tenant_id, branch_id));
    CREATE POLICY finance_day_closures_delete ON public.finance_day_closures FOR DELETE TO authenticated
      USING (public.auth_can_access_branch(tenant_id, branch_id) AND public.auth_is_manager());

    -- refunds: branch scoped (was not covered by the base RLS migration)
    ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS refunds_select ON public.refunds;
    DROP POLICY IF EXISTS refunds_insert ON public.refunds;
    DROP POLICY IF EXISTS refunds_update ON public.refunds;
    CREATE POLICY refunds_select ON public.refunds FOR SELECT TO authenticated
      USING (public.auth_can_access_branch(tenant_id, branch_id));
    CREATE POLICY refunds_insert ON public.refunds FOR INSERT TO authenticated
      WITH CHECK (public.auth_can_access_branch(tenant_id, branch_id));
    CREATE POLICY refunds_update ON public.refunds FOR UPDATE TO authenticated
      USING (public.auth_can_access_branch(tenant_id, branch_id) AND public.auth_is_manager())
      WITH CHECK (public.auth_can_access_branch(tenant_id, branch_id) AND public.auth_is_manager());

    REVOKE ALL ON public.expense_categories    FROM anon;
    REVOKE ALL ON public.finance_day_closures  FROM anon;
    REVOKE ALL ON public.refunds               FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories   TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_day_closures TO authenticated;
    GRANT SELECT, INSERT, UPDATE          ON public.refunds             TO authenticated;
  END IF;
END $$;
