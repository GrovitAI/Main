import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import {
  getBusinessDayBounds,
  DEFAULT_BUSINESS_DAY_CONFIG,
} from '@/lib/pos/reporting-utils';

export type AnalyticsFilters = {
  startDate: string;    // ISO Date String YYYY-MM-DD
  endDate: string;      // ISO Date String YYYY-MM-DD
  startTime?: string;   // HH:MM format
  endTime?: string;     // HH:MM format
  branchId?: string;    // Optional: filter to a specific branch. Omit for all-branch (owner)
};

export type SalesSeriesPoint = {
  label: string;
  sales: number;
  orders: number;
};

export type ProductInsight = {
  item_name: string;
  qty: number;
  revenue: number;
};

export type PaymentSplit = {
  payment_type: string;
  total: number;
};

export type AnalyticsDashboard = {
  kpis: {
    totalSales: number;
    totalOrders: number;
    avgOrderValue: number;
    itemsSold: number;
    taxCollected: number;
    cancelledOrders: number;
    collectedRevenue: number;
    pendingCollections: number;
    totalDiscounts: number;
    cancelledSales: number;
  };

  salesByDay: SalesSeriesPoint[];
  ordersByDay: SalesSeriesPoint[];

  salesByHour: {
    hour: string;
    sales: number;
  }[];

  paymentSplit: PaymentSplit[];
  
  /** @deprecated Export rows are fetched on demand by analytics-export-service. */
  rawTransactions: TransactionRow[];
  itemWiseReport: ProductInsight[];

  topSellingItems: ProductInsight[];
  leastSellingItems: ProductInsight[];
  highestRevenueItems: ProductInsight[];
};

export type TransactionRow = {
  id: string;
  invoice_number: string;
  created_at: string;
  branch_name: string;
  items_summary: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: string;
};

export type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

/**
 * RPC response types for type-safe mapping
 */
type RpcSummaryResult = {
  totalSales: number;
  totalOrders: number;
  avgOrderValue: number;
  itemsSold: number;
  taxCollected: number;
  cancelledOrders: number;
  collectedRevenue: number;
  pendingCollections: number;
  totalDiscounts: number;
  cancelledSales: number;
  complimentaryValue: number;
  complimentaryCount: number;
};

type RpcSalesTrendResult = {
  salesByDay: { label: string; sales: number; orders: number }[];
  salesByHour: { hour: string; sales: number }[];
};

type RpcPaymentSplitItem = {
  payment_type: string;
  total: number;
};

type RpcItemPerformanceItem = {
  item_name: string;
  qty: number;
  revenue: number;
};

/**
 * Retrieve comprehensive POS analytics for a given time range and date range.
 *
 * Uses PostgreSQL RPC functions for server-side aggregation to:
 * 1. Eliminate the PostgREST 1,000-row response limit on raw queries
 * 2. Reduce network egress from ~4,800 raw rows to compact aggregated JSON
 * 3. Ensure accurate financial totals regardless of data volume
 *
 * All DB queries are scoped strictly to tenant_id and branch_id.
 */
export async function fetchAnalyticsDashboard(
  filters: AnalyticsFilters,
): Promise<ServiceResult<AnalyticsDashboard>> {
  try {
    const { tenant_id, branch_id, canViewAllBranches } = getTenantContext();

    const { startTimestamp, endTimestamp } = getBusinessDayBounds(
      'custom',
      filters.startDate,
      filters.endDate
    );

    // Only the owner may choose a branch or see them all. Everyone else gets
    // their own branch whatever the screen asked for.
    const effectiveBranchId = canViewAllBranches ? (filters.branchId ?? null) : branch_id;

    const timezone = DEFAULT_BUSINESS_DAY_CONFIG.timezone;

    // ---------- PARALLEL RPC CALLS ----------
    // All 4 RPCs execute simultaneously for minimal latency
    const [summaryRes, trendRes, paymentRes, itemRes] = await Promise.all([
      supabase.rpc('get_analytics_summary', {
        p_tenant_id: tenant_id,
        p_branch_id: effectiveBranchId,
        p_start_ts: startTimestamp,
        p_end_ts: endTimestamp,
        p_timezone: timezone,
      }),
      supabase.rpc('get_analytics_sales_trend', {
        p_tenant_id: tenant_id,
        p_branch_id: effectiveBranchId,
        p_start_ts: startTimestamp,
        p_end_ts: endTimestamp,
        p_timezone: timezone,
      }),
      supabase.rpc('get_analytics_payment_split', {
        p_tenant_id: tenant_id,
        p_branch_id: effectiveBranchId,
        p_start_ts: startTimestamp,
        p_end_ts: endTimestamp,
      }),
      supabase.rpc('get_analytics_item_performance', {
        p_tenant_id: tenant_id,
        p_branch_id: effectiveBranchId,
        p_start_ts: startTimestamp,
        p_end_ts: endTimestamp,
      }),
    ]);

    // ---------- ERROR HANDLING ----------
    // Financial analytics must never silently return partial results
    if (summaryRes.error) {
      console.error('[AnalyticsService] RPC get_analytics_summary error:', summaryRes.error);
      return { data: null, error: 'Unable to load analytics summary.' };
    }
    if (trendRes.error) {
      console.error('[AnalyticsService] RPC get_analytics_sales_trend error:', trendRes.error);
      return { data: null, error: 'Unable to load sales trend data.' };
    }
    if (paymentRes.error) {
      console.error('[AnalyticsService] RPC get_analytics_payment_split error:', paymentRes.error);
      return { data: null, error: 'Unable to load payment breakdown.' };
    }
    if (itemRes.error) {
      console.error('[AnalyticsService] RPC get_analytics_item_performance error:', itemRes.error);
      return { data: null, error: 'Unable to load item performance data.' };
    }

    // ---------- MAP RPC RESULTS ----------
    const summary: RpcSummaryResult = summaryRes.data as RpcSummaryResult;
    const trends: RpcSalesTrendResult = trendRes.data as RpcSalesTrendResult;
    const paymentSplitRaw: RpcPaymentSplitItem[] = (paymentRes.data ?? []) as RpcPaymentSplitItem[];
    const itemPerformanceRaw: RpcItemPerformanceItem[] = (itemRes.data ?? []) as RpcItemPerformanceItem[];

    // Handle empty dashboard case
    if (!summary || (summary.totalSales === 0 && summary.totalOrders === 0)) {
      return {
        data: getEmptyDashboard(filters.startDate, filters.endDate),
        error: null,
      };
    }

    // ---------- KPIs ----------
    const kpis = {
      totalSales: Number(summary.totalSales) || 0,
      totalOrders: Number(summary.totalOrders) || 0,
      avgOrderValue: Number(summary.avgOrderValue) || 0,
      itemsSold: Number(summary.itemsSold) || 0,
      taxCollected: Number(summary.taxCollected) || 0,
      cancelledOrders: Number(summary.cancelledOrders) || 0,
      collectedRevenue: Number(summary.collectedRevenue) || 0,
      pendingCollections: Number(summary.pendingCollections) || 0,
      totalDiscounts: Number(summary.totalDiscounts) || 0,
      cancelledSales: Number(summary.cancelledSales) || 0,
    };

    // ---------- SALES TREND ----------
    const salesByDay: SalesSeriesPoint[] = (trends?.salesByDay ?? []).map((p) => ({
      label: String(p.label),
      sales: Number(p.sales) || 0,
      orders: Number(p.orders) || 0,
    }));

    const ordersByDay: SalesSeriesPoint[] = salesByDay.map((p) => ({
      label: p.label,
      sales: p.sales,
      orders: p.orders,
    }));

    const salesByHour = (trends?.salesByHour ?? []).map((p) => ({
      hour: String(p.hour),
      sales: Number(p.sales) || 0,
    }));

    // ---------- PAYMENT SPLIT ----------
    const paymentSplit: PaymentSplit[] = paymentSplitRaw.map((p) => ({
      payment_type: String(p.payment_type),
      total: Number(p.total) || 0,
    }));

    // ---------- ITEM PERFORMANCE ----------
    const allItemInsights: ProductInsight[] = itemPerformanceRaw.map((p) => ({
      item_name: String(p.item_name),
      qty: Number(p.qty) || 0,
      revenue: Number(p.revenue) || 0,
    }));

    // Item-wise report (full list, sorted by qty desc — already sorted by RPC)
    const itemWiseReport = allItemInsights;

    // Top Sellers (top 10 by qty)
    const topSellingItems = allItemInsights.slice(0, 10);

    // Least Sold (bottom 10 by qty, excluding zero)
    const leastSellingItems = [...allItemInsights]
      .filter((p) => p.qty > 0)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 10);

    // Highest Revenue (top 10 by revenue)
    const highestRevenueItems = [...allItemInsights]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      data: {
        kpis,
        salesByDay,
        ordersByDay,
        salesByHour,
        paymentSplit,
        rawTransactions: [],
        itemWiseReport,
        topSellingItems,
        leastSellingItems,
        highestRevenueItems,
      },
      error: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AnalyticsService] Error compiling analytics:', message);
    return { data: null, error: 'Internal system error occurred.' };
  }
}

/**
 * Fallback empty dashboard populated with dates to render clean empty charts
 */
function getEmptyDashboard(startDate: string, endDate: string): AnalyticsDashboard {
  const salesByDay: SalesSeriesPoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const label = formatDateLabel(d.toISOString());
    salesByDay.push({ label, sales: 0, orders: 0 });
  }

  const salesByHour = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    sales: 0,
  }));

  return {
    kpis: {
      totalSales: 0,
      totalOrders: 0,
      avgOrderValue: 0,
      itemsSold: 0,
      taxCollected: 0,
      cancelledOrders: 0,
      collectedRevenue: 0,
      pendingCollections: 0,
      totalDiscounts: 0,
      cancelledSales: 0,
    },
    salesByDay,
    ordersByDay: [...salesByDay],
    salesByHour,
    paymentSplit: [],
    rawTransactions: [],
    itemWiseReport: [],
    topSellingItems: [],
    leastSellingItems: [],
    highestRevenueItems: [],
  };
}

/**
 * Format a Date object to "D MMM" (e.g., "27 May")
 */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[date.getMonth()]}`;
}
