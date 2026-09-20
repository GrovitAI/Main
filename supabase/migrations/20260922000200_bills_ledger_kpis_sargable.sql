-- ============================================================================
-- Migration: let get_bills_ledger_kpis use the date indexes
-- Report performance pass 2026-09-21.  NOT YET APPLIED.
--
-- The Bills ledger KPI strip took 2.3 s for "today" (14 bills), the same as
-- for a full year (5,829 bills). The function picks its date column with
--
--   AND CASE WHEN p_status IN ('paid','completed') THEN settled_at BETWEEN ...
--            WHEN p_status IN ('draft','unpaid','cancelled') THEN created_at BETWEEN ...
--            ELSE (status = 'paid' AND settled_at ...) OR (status <> 'paid' AND created_at ...)
--       END
--
-- and the planner cannot see through a CASE, so it never considers
-- idx_bills_tenant_branch_settled or idx_bills_tenant_branch_status_created.
-- It reads every bill the tenant has ever issued and filters afterwards, so
-- the cost grows with the restaurant's whole history rather than with the
-- range on screen — and each of those rows pays the RLS policy as well.
--
-- The rewrite states the same condition as an OR of two plain range tests.
-- The plan becomes a BitmapOr over the two existing indexes: 14 heap rows read
-- for "today" instead of 5,985, 1.2 ms instead of ~30 ms before RLS is counted.
-- No new index is needed.
--
-- Equivalence. CASE takes its first branch only when `p_status IN (...)` is
-- TRUE; a NULL p_status falls to ELSE. The rewrite spells that out with
-- `p_status IS NULL OR p_status NOT IN (...)`. A NULL settled_at makes the
-- CASE NULL and drops the row; it makes the range test NULL and drops the row.
-- Proven on the live data: old function against new body over 1,080 argument
-- combinations (4 branch values x 6 ranges incl. an empty and an inverted one
-- x 9 statuses incl. NULL, '' and an unknown value x 5 search strings), 182 of
-- them non-empty — 1,080 byte-identical JSON results, 0 differences.
--
-- Signature, defaults, return type, language, volatility and the JSON keys are
-- unchanged. CREATE OR REPLACE keeps the existing grants. The only edit is the
-- date predicate. Rollback: re-run the CREATE OR REPLACE FUNCTION block for it in
-- 20260907000300_ledger_kpis_indexes_hardening.sql. Re-runnable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_bills_ledger_kpis(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_start_ts timestamp with time zone,
  p_end_ts timestamp with time zone,
  p_status text DEFAULT 'all'::text,
  p_search text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH filtered AS (
    SELECT b.subtotal, b.total_amount, b.discount_amount, b.status,
           (
             (b.status = 'paid' AND b.discount_type = 'percent' AND b.discount_value = 100)
             OR EXISTS (SELECT 1 FROM public.settlements s
                         WHERE s.bill_id = b.id AND s.payment_type = 'complimentary')
           ) AS is_comp
      FROM public.bills b
     WHERE b.tenant_id = p_tenant_id
       AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
       AND (
             -- Dated by settlement: an explicit paid/completed filter, or a
             -- paid bill when no single status was asked for.
             (b.settled_at >= p_start_ts AND b.settled_at <= p_end_ts
              AND (p_status IN ('paid', 'completed')
                   OR ((p_status IS NULL
                        OR p_status NOT IN ('paid', 'completed', 'draft', 'unpaid', 'cancelled'))
                       AND b.status = 'paid')))
             OR
             -- Dated by creation: an explicit draft/unpaid/cancelled filter, or
             -- an unpaid bill when no single status was asked for.
             (b.created_at >= p_start_ts AND b.created_at <= p_end_ts
              AND (p_status IN ('draft', 'unpaid', 'cancelled')
                   OR ((p_status IS NULL
                        OR p_status NOT IN ('paid', 'completed', 'draft', 'unpaid', 'cancelled'))
                       AND b.status <> 'paid')))
           )
       AND (p_status IS NULL OR p_status = 'all' OR b.status = p_status)
       AND (p_search IS NULL OR trim(p_search) = ''
            OR b.invoice_number ILIKE '%' || trim(p_search) || '%')
  )
  SELECT json_build_object(
    'grossSales',         coalesce(sum(coalesce(subtotal, total_amount, 0)), 0),
    'discountsGiven',     coalesce(sum(coalesce(discount_amount, 0)), 0),
    'complimentarySales', coalesce(sum(CASE WHEN is_comp THEN coalesce(subtotal, total_amount, 0) ELSE 0 END), 0),
    'netCollected',       coalesce(sum(CASE WHEN NOT is_comp AND status IN ('paid', 'completed')
                                            THEN greatest(0, coalesce(subtotal, total_amount, 0) - coalesce(discount_amount, 0))
                                            ELSE 0 END), 0),
    'billCount',          count(*)
  )
  FROM filtered;
$function$;
