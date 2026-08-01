-- ============================================================================
-- Analytics RPC Migration — Task 66
-- 4 PostgreSQL functions for server-side analytics aggregation
-- SECURITY INVOKER — respects existing (future) RLS policies
-- ============================================================================

-- ==========================================================================
-- 1. get_analytics_summary
-- Returns: JSON object with 12 KPIs
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_analytics_summary(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_timezone text DEFAULT 'Asia/Kolkata'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  WITH filtered_bills AS (
    SELECT
      id,
      status,
      total_amount,
      subtotal,
      tax_amount,
      discount_amount,
      discount_type,
      discount_value
    FROM bills
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (
        (status = 'paid' AND settled_at >= p_start_ts AND settled_at < p_end_ts)
        OR
        (status != 'paid' AND created_at >= p_start_ts AND created_at < p_end_ts)
      )
  ),
  categorised AS (
    SELECT
      id,
      status,
      total_amount,
      subtotal,
      tax_amount,
      discount_amount,
      -- Authoritative complimentary marker (set by settleOrderById)
      (status = 'paid' AND discount_type = 'percent' AND discount_value = 100) AS is_comp
    FROM filtered_bills
  ),
  bill_metrics AS (
    SELECT
      -- Total Sales = paid non-comp + unpaid (excludes comp + cancelled)
      COALESCE(SUM(CASE WHEN status IN ('paid','unpaid') AND NOT is_comp THEN total_amount ELSE 0 END), 0) AS total_sales,
      -- Total Orders = count of paid non-comp + unpaid
      COUNT(CASE WHEN status IN ('paid','unpaid') AND NOT is_comp THEN 1 END) AS total_orders,
      -- Tax Collected on genuine sales only
      COALESCE(SUM(CASE WHEN status IN ('paid','unpaid') AND NOT is_comp THEN tax_amount ELSE 0 END), 0) AS tax_collected,
      -- Cancelled Orders count
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_orders,
      -- Collected Revenue = paid non-comp only
      COALESCE(SUM(CASE WHEN status = 'paid' AND NOT is_comp THEN total_amount ELSE 0 END), 0) AS collected_revenue,
      -- Pending Collections = unpaid only
      COALESCE(SUM(CASE WHEN status = 'unpaid' THEN total_amount ELSE 0 END), 0) AS pending_collections,
      -- Total Discounts on genuine sales (excludes complimentary discount)
      COALESCE(SUM(CASE WHEN status IN ('paid','unpaid') AND NOT is_comp THEN discount_amount ELSE 0 END), 0) AS total_discounts,
      -- Cancelled Sales = subtotal of cancelled bills
      COALESCE(SUM(CASE WHEN status = 'cancelled' THEN subtotal ELSE 0 END), 0) AS cancelled_sales,
      -- Complimentary Value = subtotal of complimentary bills (gross food value given away)
      COALESCE(SUM(CASE WHEN is_comp THEN subtotal ELSE 0 END), 0) AS complimentary_value,
      -- Complimentary Count
      COUNT(CASE WHEN is_comp THEN 1 END) AS complimentary_count
    FROM categorised
  ),
  sales_bill_ids AS (
    SELECT id FROM categorised
    WHERE status IN ('paid','unpaid') AND NOT is_comp
  ),
  item_metrics AS (
    SELECT COALESCE(SUM(bi.qty), 0) AS items_sold
    FROM bill_items bi
    WHERE bi.bill_id IN (SELECT id FROM sales_bill_ids)
  )
  SELECT json_build_object(
    'totalSales',          ROUND(bm.total_sales::numeric, 2),
    'totalOrders',         bm.total_orders,
    'avgOrderValue',       CASE WHEN bm.total_orders > 0
                             THEN ROUND((bm.total_sales / bm.total_orders)::numeric, 2)
                             ELSE 0
                           END,
    'itemsSold',           im.items_sold,
    'taxCollected',        ROUND(bm.tax_collected::numeric, 2),
    'cancelledOrders',     bm.cancelled_orders,
    'collectedRevenue',    ROUND(bm.collected_revenue::numeric, 2),
    'pendingCollections',  ROUND(bm.pending_collections::numeric, 2),
    'totalDiscounts',      ROUND(bm.total_discounts::numeric, 2),
    'cancelledSales',      ROUND(bm.cancelled_sales::numeric, 2),
    'complimentaryValue',  ROUND(bm.complimentary_value::numeric, 2),
    'complimentaryCount',  bm.complimentary_count
  ) INTO result
  FROM bill_metrics bm, item_metrics im;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_analytics_summary(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_summary(uuid, uuid, timestamptz, timestamptz, text) TO anon;


-- ==========================================================================
-- 2. get_analytics_sales_trend
-- Returns: JSON with salesByDay and salesByHour arrays
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_analytics_sales_trend(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz,
  p_timezone text DEFAULT 'Asia/Kolkata'
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  WITH filtered_sales AS (
    SELECT
      total_amount,
      settled_at,
      created_at,
      status,
      discount_type,
      discount_value
    FROM bills
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (
        (status = 'paid' AND settled_at >= p_start_ts AND settled_at < p_end_ts)
        OR
        (status != 'paid' AND created_at >= p_start_ts AND created_at < p_end_ts)
      )
      -- Exclude complimentary and cancelled from sales trends
      AND NOT (status = 'cancelled')
      AND NOT (discount_type = 'percent' AND discount_value = 100)
      AND status IN ('paid', 'unpaid')
  ),
  with_local AS (
    SELECT
      total_amount,
      -- Effective reporting timestamp converted to local
      CASE WHEN status = 'paid' THEN settled_at ELSE created_at END AT TIME ZONE p_timezone AS local_ts
    FROM filtered_sales
  ),
  -- Business date: shift by -2h30m so early-morning maps to previous business day
  with_biz_date AS (
    SELECT
      total_amount,
      local_ts,
      DATE(local_ts - INTERVAL '2 hours 30 minutes') AS biz_date,
      EXTRACT(HOUR FROM local_ts)::int AS local_hour
    FROM with_local
  ),
  daily_agg AS (
    SELECT
      biz_date,
      TO_CHAR(biz_date, 'DD Mon') AS label,
      ROUND(COALESCE(SUM(total_amount), 0)::numeric, 2) AS sales,
      COUNT(*) AS orders
    FROM with_biz_date
    GROUP BY biz_date
    ORDER BY biz_date
  ),
  hourly_agg AS (
    SELECT
      local_hour AS hour_num,
      LPAD(local_hour::text, 2, '0') || ':00' AS hour_label,
      ROUND(COALESCE(SUM(total_amount), 0)::numeric, 2) AS sales
    FROM with_biz_date
    GROUP BY local_hour
    ORDER BY local_hour
  )
  SELECT json_build_object(
    'salesByDay',  COALESCE((SELECT json_agg(json_build_object(
                      'label', d.label,
                      'sales', d.sales,
                      'orders', d.orders
                    ) ORDER BY d.biz_date) FROM daily_agg d), '[]'::json),
    'salesByHour', COALESCE((SELECT json_agg(json_build_object(
                      'hour', h.hour_label,
                      'sales', h.sales
                    ) ORDER BY h.hour_num) FROM hourly_agg h), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_analytics_sales_trend(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_sales_trend(uuid, uuid, timestamptz, timestamptz, text) TO anon;


-- ==========================================================================
-- 3. get_analytics_payment_split
-- Returns: JSON array of payment method totals
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_analytics_payment_split(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  WITH sales_bills AS (
    SELECT id
    FROM bills
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (
        (status = 'paid' AND settled_at >= p_start_ts AND settled_at < p_end_ts)
        OR
        (status = 'unpaid' AND created_at >= p_start_ts AND created_at < p_end_ts)
      )
      -- Exclude complimentary bills from payment split
      AND NOT (discount_type = 'percent' AND discount_value = 100)
  ),
  payment_agg AS (
    SELECT
      UPPER(s.payment_type) AS payment_type,
      ROUND(COALESCE(SUM(s.amount), 0)::numeric, 2) AS total
    FROM settlements s
    WHERE s.bill_id IN (SELECT id FROM sales_bills)
      AND s.tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    GROUP BY UPPER(s.payment_type)
    HAVING SUM(s.amount) > 0
    ORDER BY total DESC
  )
  SELECT COALESCE(
    (SELECT json_agg(json_build_object(
      'payment_type', pa.payment_type,
      'total', pa.total
    )) FROM payment_agg pa),
    '[]'::json
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_analytics_payment_split(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_payment_split(uuid, uuid, timestamptz, timestamptz) TO anon;


-- ==========================================================================
-- 4. get_analytics_item_performance
-- Returns: JSON array of item-wise sales sorted by qty desc
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_analytics_item_performance(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_start_ts timestamptz,
  p_end_ts timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  result json;
BEGIN
  WITH sales_bills AS (
    SELECT id
    FROM bills
    WHERE tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
      AND (
        (status = 'paid' AND settled_at >= p_start_ts AND settled_at < p_end_ts)
        OR
        (status = 'unpaid' AND created_at >= p_start_ts AND created_at < p_end_ts)
      )
      -- Exclude complimentary and cancelled
      AND NOT (discount_type = 'percent' AND discount_value = 100)
      AND status IN ('paid', 'unpaid')
  ),
  item_agg AS (
    SELECT
      bi.item_name,
      COALESCE(SUM(bi.qty), 0)::int AS qty,
      ROUND(COALESCE(SUM(bi.price * bi.qty), 0)::numeric, 2) AS revenue
    FROM bill_items bi
    WHERE bi.bill_id IN (SELECT id FROM sales_bills)
    GROUP BY bi.item_name
    ORDER BY qty DESC
  )
  SELECT COALESCE(
    (SELECT json_agg(json_build_object(
      'item_name', ia.item_name,
      'qty', ia.qty,
      'revenue', ia.revenue
    )) FROM item_agg ia),
    '[]'::json
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_analytics_item_performance(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION get_analytics_item_performance(uuid, uuid, timestamptz, timestamptz) TO anon;
