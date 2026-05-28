import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';

export type AnalyticsFilters = {
  startDate: string; // ISO Date String YYYY-MM-DD
  endDate: string; // ISO Date String YYYY-MM-DD
  startTime?: string; // HH:MM format
  endTime?: string; // HH:MM format
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
  };

  salesByDay: SalesSeriesPoint[];
  ordersByDay: SalesSeriesPoint[];

  salesByHour: {
    hour: string;
    sales: number;
  }[];

  paymentSplit: PaymentSplit[];

  topSellingItems: ProductInsight[];
  leastSellingItems: ProductInsight[];
  highestRevenueItems: ProductInsight[];
};

export type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

/**
 * Format a Date object to "D MMM" (e.g., "27 May")
 */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[date.getMonth()]}`;
}

/**
 * Retrieve comprehensive POS analytics for a given time range and date range.
 * All DB queries are scoped strictly to tenant_id and branch_id.
 */
export async function fetchAnalyticsDashboard(
  filters: AnalyticsFilters,
): Promise<ServiceResult<AnalyticsDashboard>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    // 1. Fetch bills in date range (we append start/end times to capture full days)
    const startTimestamp = `${filters.startDate}T00:00:00.000Z`;
    const endTimestamp = `${filters.endDate}T23:59:59.999Z`;

    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .gte('created_at', startTimestamp)
      .lte('created_at', endTimestamp)
      .order('created_at', { ascending: true });

    if (billsError) {
      console.error('[AnalyticsService] Error fetching bills:', billsError);
      return { data: null, error: 'Unable to load bills.' };
    }

    if (!bills || bills.length === 0) {
      return {
        data: getEmptyDashboard(filters.startDate, filters.endDate),
        error: null,
      };
    }

    // 2. Dynamic time filter function
    const filterByTime = (dateStr: string) => {
      if (!filters.startTime || !filters.endTime) return true;
      const date = new Date(dateStr);
      
      // Convert to local time values
      const hour = date.getHours();
      const minute = date.getMinutes();
      const timeVal = hour * 60 + minute;

      const [startH, startM] = filters.startTime.split(':').map(Number);
      const [endH, endM] = filters.endTime.split(':').map(Number);
      const startVal = startH * 60 + startM;
      const endVal = endH * 60 + endM;

      return timeVal >= startVal && timeVal <= endVal;
    };

    // Apply time-of-day filters
    const filteredBills = bills.filter((b) => filterByTime(b.created_at));
    const paidBills = filteredBills.filter((b) => b.status === 'paid');
    const cancelledBills = filteredBills.filter((b) => b.status === 'cancelled');
    const paidBillIds = paidBills.map((b) => b.id);

    // 3. Parallel fetch of items and settlements for the matching paid bills
    const [itemsResult, settlementsResult] = await Promise.all([
      paidBillIds.length > 0
        ? supabase
            .from('bill_items')
            .select('*')
            .in('bill_id', paidBillIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      paidBillIds.length > 0
        ? supabase
            .from('settlements')
            .select('*')
            .eq('tenant_id', tenant_id)
            .eq('branch_id', branch_id)
            .in('bill_id', paidBillIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    if (itemsResult.error) {
      console.error('[AnalyticsService] Error fetching bill items:', itemsResult.error);
      return { data: null, error: 'Unable to load bill items.' };
    }

    if (settlementsResult.error) {
      console.error('[AnalyticsService] Error fetching settlements:', settlementsResult.error);
      return { data: null, error: 'Unable to load settlements.' };
    }

    const billItems = itemsResult.data || [];
    const settlements = settlementsResult.data || [];

    // --- AGGREGATIONS ---

    // A. KPIs
    const totalSales = paidBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);
    const totalOrders = paidBills.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const taxCollected = paidBills.reduce((acc, b) => acc + (b.tax_amount || 0), 0);
    const itemsSold = billItems.reduce((acc, item) => acc + (item.qty || 0), 0);
    const cancelledOrders = cancelledBills.length;

    // B. Sales by Day & Orders by Day
    // Construct calendar day keys between start and end dates to avoid gaps
    const dayMap = new Map<string, { sales: number; orders: number }>();
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const label = formatDateLabel(d.toISOString());
      dayMap.set(label, { sales: 0, orders: 0 });
    }

    // Populate day values from actual paid bills
    paidBills.forEach((bill) => {
      const label = formatDateLabel(bill.created_at);
      const current = dayMap.get(label) || { sales: 0, orders: 0 };
      dayMap.set(label, {
        sales: current.sales + (bill.total_amount || 0),
        orders: current.orders + 1,
      });
    });

    const salesByDay: SalesSeriesPoint[] = [];
    const ordersByDay: SalesSeriesPoint[] = [];

    dayMap.forEach((val, label) => {
      salesByDay.push({
        label,
        sales: Math.round(val.sales * 100) / 100,
        orders: val.orders,
      });
      ordersByDay.push({
        label,
        sales: Math.round(val.sales * 100) / 100,
        orders: val.orders,
      });
    });

    // C. Sales by Time (Hourly)
    const hourMap = new Map<string, number>();
    for (let h = 0; h < 24; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      hourMap.set(label, 0);
    }

    paidBills.forEach((bill) => {
      const hour = new Date(bill.created_at).getHours();
      const label = `${String(hour).padStart(2, '0')}:00`;
      hourMap.set(label, (hourMap.get(label) || 0) + (bill.total_amount || 0));
    });

    const salesByHour = Array.from(hourMap.entries()).map(([hour, sales]) => ({
      hour,
      sales: Math.round(sales * 100) / 100,
    }));

    // D. Payment Split
    const splitMap = new Map<string, number>();
    splitMap.set('upi', 0);
    splitMap.set('cash', 0);
    splitMap.set('card', 0);

    settlements.forEach((s) => {
      const type = s.payment_type ? s.payment_type.toLowerCase() : 'unknown';
      splitMap.set(type, (splitMap.get(type) || 0) + (s.amount || 0));
    });

    const paymentSplit: PaymentSplit[] = Array.from(splitMap.entries())
      .map(([payment_type, total]) => ({
        payment_type: payment_type.toUpperCase(),
        total: Math.round(total * 100) / 100,
      }))
      .filter((item) => item.total > 0);

    // E. Product Intelligence
    const productMap = new Map<string, { qty: number; revenue: number }>();
    billItems.forEach((item) => {
      const name = item.item_name || 'Unknown Item';
      const current = productMap.get(name) || { qty: 0, revenue: 0 };
      productMap.set(name, {
        qty: current.qty + (item.qty || 0),
        revenue: current.revenue + (item.price || 0) * (item.qty || 0),
      });
    });

    const allProductInsights: ProductInsight[] = Array.from(productMap.entries()).map(
      ([item_name, val]) => ({
        item_name,
        qty: val.qty,
        revenue: Math.round(val.revenue * 100) / 100,
      }),
    );

    // 1. Top Sellers
    const topSellingItems = [...allProductInsights]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // 2. Least Sold (excluding zero quantities)
    const leastSellingItems = [...allProductInsights]
      .filter((p) => p.qty > 0)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 10);

    // 3. Highest Revenue
    const highestRevenueItems = [...allProductInsights]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      data: {
        kpis: {
          totalSales: Math.round(totalSales * 100) / 100,
          totalOrders,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          itemsSold,
          taxCollected: Math.round(taxCollected * 100) / 100,
          cancelledOrders,
        },
        salesByDay,
        ordersByDay,
        salesByHour,
        paymentSplit,
        topSellingItems,
        leastSellingItems,
        highestRevenueItems,
      },
      error: null,
    };
  } catch (error: any) {
    console.error('[AnalyticsService] Error compiling analytics:', error);
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
    },
    salesByDay,
    ordersByDay: [...salesByDay],
    salesByHour,
    paymentSplit: [],
    topSellingItems: [],
    leastSellingItems: [],
    highestRevenueItems: [],
  };
}
