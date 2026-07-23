import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';

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
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();

    // The restaurant business day runs from 1 PM afternoon to 1 PM the next afternoon
    // (covering the operational hours of 2 PM to 2 AM).
    // Construct local Date objects and let JS convert them to UTC ISO strings.
    const startLocal = new Date(`${filters.startDate}T13:00:00`);
    
    const endLocal = new Date(`${filters.endDate}T13:00:00`);
    endLocal.setDate(endLocal.getDate() + 1); // Extend to 1 PM of the day after endDate

    const startTimestamp = startLocal.toISOString();
    const endTimestamp = endLocal.toISOString();

    // Determine effective branch: explicit filter > session branch (non-owner)
    const effectiveBranchId = filters.branchId ?? (!isOwnerOrAdmin ? branch_id : null);

    let billsQuery = supabase
      .from('bills')
      .select(`
        *,
        branches ( name )
      `)
      .eq('tenant_id', tenant_id)
      .gte('created_at', startTimestamp)
      .lte('created_at', endTimestamp)
      .order('created_at', { ascending: true });

    // Apply branch filter when a specific branch is selected or user is not owner
    if (effectiveBranchId) {
      billsQuery = billsQuery.eq('branch_id', effectiveBranchId);
    }

    const { data: bills, error: billsError } = await billsQuery;

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

    // Helper: Shift bills created before 1 PM local time to the previous business date
    const getBusinessDate = (dateStr: string): Date => {
      const date = new Date(dateStr);
      if (date.getHours() < 13) {
        date.setDate(date.getDate() - 1);
      }
      return date;
    };

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
    const salesBills = filteredBills.filter((b) => b.status === 'paid' || b.status === 'unpaid');
    const cancelledBills = filteredBills.filter((b) => b.status === 'cancelled');
    const salesBillIds = salesBills.map((b) => b.id);

    // 3. Parallel fetch of items and settlements for the matching sales bills (batched in chunks of 50 to prevent URL length HTTP 400 errors)
    const CHUNK_SIZE = 50;
    const billIdChunks: string[][] = [];
    for (let i = 0; i < salesBillIds.length; i += CHUNK_SIZE) {
      billIdChunks.push(salesBillIds.slice(i, i + CHUNK_SIZE));
    }

    const [itemsChunks, settlementsChunks] = await Promise.all([
      billIdChunks.length > 0
        ? Promise.all(
            billIdChunks.map((chunk) =>
              supabase
                .from('bill_items')
                .select('*')
                .in('bill_id', chunk)
            )
          )
        : Promise.resolve([]),
      billIdChunks.length > 0
        ? Promise.all(
            billIdChunks.map((chunk) =>
              supabase
                .from('settlements')
                .select('*')
                .eq('tenant_id', tenant_id)
                .eq('branch_id', branch_id)
                .in('bill_id', chunk)
            )
          )
        : Promise.resolve([]),
    ]);

    // Check for any chunk errors
    for (const res of itemsChunks) {
      if (res.error) {
        console.error('[AnalyticsService] Error fetching bill items chunk:', res.error);
        return { data: null, error: 'Unable to load bill items.' };
      }
    }

    for (const res of settlementsChunks) {
      if (res.error) {
        console.error('[AnalyticsService] Error fetching settlements chunk:', res.error);
        return { data: null, error: 'Unable to load settlements.' };
      }
    }

    const billItems = itemsChunks.flatMap((res) => res.data || []);
    const settlements = settlementsChunks.flatMap((res) => res.data || []);

    // --- AGGREGATIONS ---

    // A. KPIs
    const totalSales = salesBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);
    const totalOrders = salesBills.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const taxCollected = salesBills.reduce((acc, b) => acc + (b.tax_amount || 0), 0);
    const itemsSold = billItems.reduce((acc, item) => acc + (item.qty || 0), 0);
    const cancelledOrders = cancelledBills.length;

    const collectedRevenue = filteredBills.filter(b => b.status === 'paid').reduce((acc, b) => acc + (b.total_amount || 0), 0);
    const pendingCollections = filteredBills.filter(b => b.status === 'unpaid').reduce((acc, b) => acc + (b.total_amount || 0), 0);
    const totalDiscounts = salesBills.reduce((acc, b) => acc + (b.discount_amount || 0), 0);
    const cancelledSales = cancelledBills.reduce((acc, b) => acc + (b.total_amount || 0), 0);

    // B. Sales by Day & Orders by Day
    // Construct calendar day keys between start and end dates to avoid gaps
    const dayMap = new Map<string, { sales: number; orders: number }>();
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const label = formatDateLabel(d.toISOString());
      dayMap.set(label, { sales: 0, orders: 0 });
    }

    // Populate day values from actual sales bills using their business date
    salesBills.forEach((bill) => {
      const bizDate = getBusinessDate(bill.created_at);
      const label = formatDateLabel(bizDate.toISOString());
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

    salesBills.forEach((bill) => {
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

    // F. Raw Transactions list (both paid, unpaid and cancelled for comprehensive export)
    const rawTransactions: TransactionRow[] = filteredBills.map((bill: any) => {
      const itemsForBill = billItems.filter((item) => item.bill_id === bill.id);
      const itemsSummary = itemsForBill
        .map((item) => `${item.qty}x ${item.item_name || 'Item'}`)
        .join(', ');

      return {
        id: bill.id,
        invoice_number: bill.invoice_number || 'PENDING',
        created_at: bill.created_at,
        branch_name: bill.branches?.name || '—',
        items_summary: itemsSummary || 'No Items',
        subtotal: bill.subtotal || 0,
        tax_amount: bill.tax_amount || 0,
        discount_amount: bill.discount_amount || 0,
        total_amount: bill.total_amount || 0,
        status: bill.status || 'paid',
      };
    });

    // G. Full Item Wise Sales Report (all items sold sorted by quantity descending)
    const itemWiseReport: ProductInsight[] = [...allProductInsights].sort((a, b) => b.qty - a.qty);

    return {
      data: {
        kpis: {
          totalSales: Math.round(totalSales * 100) / 100,
          totalOrders,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          itemsSold,
          taxCollected: Math.round(taxCollected * 100) / 100,
          cancelledOrders,
          collectedRevenue: Math.round(collectedRevenue * 100) / 100,
          pendingCollections: Math.round(pendingCollections * 100) / 100,
          totalDiscounts: Math.round(totalDiscounts * 100) / 100,
          cancelledSales: Math.round(cancelledSales * 100) / 100,
        },
        salesByDay,
        ordersByDay,
        salesByHour,
        paymentSplit,
        rawTransactions,
        itemWiseReport,
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
