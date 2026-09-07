import type { OpenOrder, OpenOrderItem, OpenOrderWithItems, KotTicket, OrderStatus } from './order-types';
import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';
import { getBusinessDayBounds } from './reporting-utils';

function isOpenOrderRow(order: OpenOrder): boolean {
  if (!order.status) {
    return true;
  }
  return (
    order.status === 'open' ||
    order.status === 'draft' ||
    order.status === 'held' ||
    order.status === 'unpaid' ||
    order.status === 'in_kitchen'
  );
}

function filterOpenOrders(orders: OpenOrder[]): OpenOrder[] {
  return orders.filter(isOpenOrderRow);
}

export type OrderItemPreview = {
  name: string;
  quantity: number;
};

export type OpenOrderSummary = {
  order: OpenOrder;
  itemCount: number;
  created_at: string;
  previewItems: OrderItemPreview[];
  remainingItemLines: number;
  totalAmount: number;
  kotNumbers?: number[];
};

type OpenOrderRow = OpenOrder & {
  order_type?: string | null;
};

type OrderItemRow = {
  open_order_id: string;
  qty: number;
  product_id: string;
};

/** Order line with the columns needed to price a summary row. */
type PricedOrderItemRow = OrderItemRow & {
  price: number | null;
  item_name: string | null;
};

async function fetchProductNameMap(
  productIds: string[],
): Promise<Record<string, string>> {
  if (productIds.length === 0) {
    return {};
  }

  const { tenant_id } = getTenantContext();
  const { data, error } = await supabase
    .from('products')
    .select('id, name')
    .eq('tenant_id', tenant_id)
    .in('id', productIds);

  if (error || !data) {
    return {};
  }

  const nameMap: Record<string, string> = {};
  for (const row of data) {
    nameMap[row.id as string] = row.name as string;
  }
  return nameMap;
}

// ─── KOT reads (writes live in kot-service.ts) ────────────────────────────────

export async function fetchKotsForOrders(
  orderIds: string[],
): Promise<ServiceResult<Record<string, KotTicket[]>>> {
  try {
    if (orderIds.length === 0) {
      return { data: {}, error: null };
    }

    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('kots')
      .select('*, kot_items(*)')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .in('open_order_id', orderIds)
      .order('created_at', { ascending: true });

    if (error) {
      logSupabaseError('fetchKotsForOrders', error);
      return { data: null, error: 'Unable to load kitchen tickets.' };
    }

    const map: Record<string, KotTicket[]> = {};
    for (const row of data ?? []) {
      const ticket = row as KotTicket;
      const list = map[ticket.open_order_id] ?? [];
      list.push(ticket);
      map[ticket.open_order_id] = list;
    }

    return { data: map, error: null };
  } catch {
    return { data: null, error: 'Unable to load kitchen tickets.' };
  }
}

export async function getOpenOrders(): Promise<ServiceResult<OpenOrderSummary[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data: orders, error: ordersError } = await supabase
      .from('open_orders')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('created_at', { ascending: false });

    if (ordersError) {
      logSupabaseError('getOpenOrders.orders', ordersError);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (ordersError.code === '42P01' || ordersError.message?.toLowerCase().includes('does not exist')) {
          return { data: [], error: null };
        }
      }
      return { data: null, error: 'Unable to load open orders.' };
    }

    const openOrders = filterOpenOrders((orders ?? []) as OpenOrderRow[]);
    if (openOrders.length === 0) {
      return { data: [], error: null };
    }

    const orderIds = openOrders.map((order) => order.id);

    const { data: itemRows, error: itemsError } = await supabase
      .from('open_order_items')
      .select('open_order_id, qty, product_id')
      .in('open_order_id', orderIds);

    if (itemsError) {
      logSupabaseError('getOpenOrders.items', itemsError);
      const summariesWithoutItems: OpenOrderSummary[] = openOrders.map((order) => ({
        order,
        itemCount: 0,
        created_at: order.created_at,
        previewItems: [],
        remainingItemLines: 0,
        totalAmount: 0,
      }));
      const filtered = summariesWithoutItems.filter((s) => s.order.status !== 'draft');
      return { data: filtered, error: null };
    }

    const items = (itemRows ?? []) as OrderItemRow[];
    const productIds = [...new Set(items.map((item) => item.product_id))];
    const productNames = await fetchProductNameMap(productIds);

    const itemsByOrderId: Record<string, OrderItemPreview[]> = {};
    const itemCountByOrderId: Record<string, number> = {};

    for (const item of items) {
      const preview: OrderItemPreview = {
        name: productNames[item.product_id] ?? 'Item',
        quantity: item.qty,
      };
      const existing = itemsByOrderId[item.open_order_id] ?? [];
      existing.push(preview);
      itemsByOrderId[item.open_order_id] = existing;
      itemCountByOrderId[item.open_order_id] =
        (itemCountByOrderId[item.open_order_id] ?? 0) + item.qty;
    }

    const kotResult = await fetchKotsForOrders(orderIds);
    const kotsMap = kotResult.data ?? {};

    const summaries: OpenOrderSummary[] = openOrders.map((order) => {
      const orderItems = itemsByOrderId[order.id] ?? [];
      const previewItems = orderItems.slice(0, 3);
      const remainingItemLines = Math.max(0, orderItems.length - previewItems.length);
      const orderKots = kotsMap[order.id] ?? [];
      const kotNumbers = orderKots.map(k => k.kot_number);

      return {
        order,
        itemCount: itemCountByOrderId[order.id] ?? 0,
        created_at: order.created_at,
        previewItems,
        remainingItemLines,
        totalAmount: 0, // getOpenOrders does not fetch prices
        kotNumbers,
      };
    });

    const filteredSummaries = summaries.filter((summary) => {
      if (summary.order.status === 'draft' && summary.itemCount === 0) {
        return false;
      }
      return true;
    });

    return { data: filteredSummaries, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
        return { data: [], error: null };
      }
    }
    return { data: null, error: 'Unable to load open orders.' };
  }
}

export type GetOrdersParams = {
  targetTable?: 'bills' | 'open_orders';
  preset?: 'today' | 'yesterday' | '7days' | '30days' | 'custom';
  fromDate?: Date | string;
  toDate?: Date | string;
  status?: OrderStatus | 'all';
  paymentMethod?: string;
  cashierId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'created_at' | 'invoice_number' | 'grand_total';
  sortOrder?: 'asc' | 'desc';
};

export type OrdersQueryResponse = {
  summaries: OpenOrderSummary[];
  totalCount: number;
  metrics: {
    grossSales: number;
    discountsGiven: number;
    complimentarySales: number;
    netCollected: number;
  };
  metadata: {
    source: 'bills' | 'open_orders';
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    generatedAt: string;
    filtersApplied: GetOrdersParams;
  };
};

type BillLedgerRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  open_order_id: string | null;
  invoice_number: string | null;
  status: string | null;
  payment_method: string | null;
  subtotal: number | null;
  total_amount: number | null;
  discount_amount: number | null;
  created_at: string;
};

type BillItemPreviewRow = {
  bill_id: string;
  item_name: string | null;
  qty: number | null;
};

type SettlementPreviewRow = {
  bill_id: string;
  payment_type: string | null;
  amount: number | null;
};

type LedgerKpis = OrdersQueryResponse['metrics'] & { billCount: number };

function toFiniteNumber(value: unknown): number {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : 0;
}

function parseLedgerKpis(value: unknown): LedgerKpis {
  const raw: Record<string, unknown> = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    grossSales: toFiniteNumber(raw.grossSales),
    discountsGiven: toFiniteNumber(raw.discountsGiven),
    complimentarySales: toFiniteNumber(raw.complimentarySales),
    netCollected: toFiniteNumber(raw.netCollected),
    billCount: toFiniteNumber(raw.billCount),
  };
}

/**
 * Minimal structural view of a PostgREST filter builder. Every method returns
 * the same view, so `applyBillFilters` can compose filters without dragging
 * the generated (deeply recursive) Supabase generics through the call.
 */
type BillsFilterQuery = {
  eq(column: string, value: string): BillsFilterQuery;
  gte(column: string, value: string): BillsFilterQuery;
  lte(column: string, value: string): BillsFilterQuery;
  or(filters: string): BillsFilterQuery;
  ilike(column: string, pattern: string): BillsFilterQuery;
  order(column: string, options: { ascending: boolean }): BillsFilterQuery;
  range(from: number, to: number): BillsFilterQuery;
};

/** Shape of an awaited PostgREST list response. */
type BillsPageResponse = {
  data: unknown;
  error: { message?: string; code?: string } | null;
  count: number | null;
};

type BillFilterBounds = {
  startTimestamp: string;
  endTimestamp: string;
  status: GetOrdersParams['status'];
  search: string | null;
};

function resolveBillFilterBounds(params: GetOrdersParams): BillFilterBounds {
  const { preset = 'today', fromDate, toDate, status, search } = params;
  const { startTimestamp, endTimestamp } = getBusinessDayBounds(preset, fromDate, toDate);
  const trimmedSearch = search?.trim() ?? '';
  return {
    startTimestamp,
    endTimestamp,
    status,
    search: trimmedSearch.length > 0 ? trimmedSearch : null,
  };
}

// Mirrors the predicate inside get_bills_ledger_kpis so KPIs and rows agree.
function applyBillFilters(
  query: BillsFilterQuery,
  bounds: BillFilterBounds,
  tenant_id: string,
  branch_id: string,
): BillsFilterQuery {
  const { startTimestamp, endTimestamp, status, search } = bounds;
  let q: BillsFilterQuery = query.eq('tenant_id', tenant_id).eq('branch_id', branch_id);

  if (status === 'paid' || status === 'completed') {
    q = q.gte('settled_at', startTimestamp).lte('settled_at', endTimestamp);
  } else if (status === 'draft' || status === 'unpaid' || status === 'cancelled') {
    q = q.gte('created_at', startTimestamp).lte('created_at', endTimestamp);
  } else {
    q = q.or(
      `and(status.eq.paid,settled_at.gte.${startTimestamp},settled_at.lte.${endTimestamp}),and(status.neq.paid,created_at.gte.${startTimestamp},created_at.lte.${endTimestamp})`,
    );
  }

  if (status && status !== 'all') {
    q = q.eq('status', status);
  }

  if (search) {
    q = q.ilike('invoice_number', `%${search}%`);
  }

  return q;
}

export async function getOrders(
  params: GetOrdersParams = {}
): Promise<ServiceResult<OrdersQueryResponse>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const {
      targetTable = 'open_orders',
      preset = 'today',
      status = 'all',
      paymentMethod,
      cashierId,
      page = 1,
      pageSize = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = params;

    // ── 1. Query bills table if targetTable === 'bills' or historical presets ──
    if (targetTable === 'bills' || preset === 'yesterday' || preset === '7days' || preset === '30days' || preset === 'custom') {
      const bounds = resolveBillFilterBounds(params);

      // 1A. Aggregate KPIs across the ENTIRE filtered dataset, computed in the database.
      const kpiArgs: Record<string, string | null> = {
        p_tenant_id: tenant_id,
        p_branch_id: branch_id,
        p_start_ts: bounds.startTimestamp,
        p_end_ts: bounds.endTimestamp,
        p_status: bounds.status ?? 'all',
        p_search: bounds.search,
      };
      // Typed through `unknown`: the generated RPC types recurse too deeply for
      // the compiler when this builder is combined with Promise.all below.
      const kpiPromise = supabase.rpc('get_bills_ledger_kpis', kpiArgs) as unknown as
        Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

      // 1B. Paginated query for the requested page of rows.
      const fromIndex = (page - 1) * pageSize;
      const toIndex = fromIndex + pageSize - 1;
      const pageBillQuery = applyBillFilters(
        supabase.from('bills').select('*', { count: 'exact' }) as unknown as BillsFilterQuery,
        bounds,
        tenant_id,
        branch_id,
      )
        .order('created_at', { ascending: sortOrder === 'asc' })
        .range(fromIndex, toIndex) as unknown as Promise<BillsPageResponse>;

      const [{ data: kpiData, error: kpiErr }, { data: rawBills, error: billErr, count: billCount }] =
        await Promise.all([kpiPromise, pageBillQuery]);

      if (billErr) {
        logSupabaseError('getOrders.bills', billErr);
        return { data: null, error: 'Unable to load bills history.' };
      }
      if (kpiErr) {
        logSupabaseError('getOrders.metrics', kpiErr);
      }
      const kpis = parseLedgerKpis(kpiErr ? null : kpiData);

      const billsList = (rawBills ?? []) as BillLedgerRow[];
      const billIds = billsList.map((b) => b.id);
      let billItemsData: BillItemPreviewRow[] = [];
      let settlementsData: SettlementPreviewRow[] = [];
      if (billIds.length > 0) {
        const [itemsRes, settlementsRes] = await Promise.all([
          supabase.from('bill_items').select('bill_id, item_name, qty').in('bill_id', billIds),
          supabase
            .from('settlements')
            .select('bill_id, payment_type, amount')
            .eq('tenant_id', tenant_id)
            .eq('branch_id', branch_id)
            .in('bill_id', billIds),
        ]);
        billItemsData = (itemsRes.data ?? []) as BillItemPreviewRow[];
        settlementsData = (settlementsRes.data ?? []) as SettlementPreviewRow[];
      }

      const itemsByBillId: Record<string, OrderItemPreview[]> = {};
      const itemCountByBillId: Record<string, number> = {};

      for (const item of billItemsData) {
        const qty = item.qty ?? 1;
        const preview: OrderItemPreview = {
          name: item.item_name || 'Item',
          quantity: qty,
        };
        const existing = itemsByBillId[item.bill_id] ?? [];
        existing.push(preview);
        itemsByBillId[item.bill_id] = existing;
        itemCountByBillId[item.bill_id] = (itemCountByBillId[item.bill_id] ?? 0) + qty;
      }

      const settlementsByBillId: Record<string, string[]> = {};
      for (const s of settlementsData) {
        if (!s.payment_type) continue;
        const existing = settlementsByBillId[s.bill_id] ?? [];
        const typeLabel = s.payment_type.toUpperCase();
        if (!existing.includes(typeLabel)) {
          existing.push(typeLabel);
        }
        settlementsByBillId[s.bill_id] = existing;
      }

      const billSummaries: OpenOrderSummary[] = billsList.map((b) => {
        const allPreviews = itemsByBillId[b.id] ?? [];
        const previewItems = allPreviews.slice(0, 3);
        const remainingItemLines = Math.max(0, allPreviews.length - previewItems.length);
        const subtotal = b.subtotal ?? b.total_amount ?? 0;

        const rawTypes = settlementsByBillId[b.id] ?? [];
        const resolvedPaymentMethod = rawTypes.length > 0
          ? rawTypes.join(' + ')
          : (b.status === 'complimentary' ? 'COMPLIMENTARY' : (b.payment_method ?? (b.status === 'paid' ? 'PAID' : null)));

        const mockOrder: OpenOrder = {
          id: b.open_order_id ?? b.id,
          tenant_id: b.tenant_id,
          branch_id: b.branch_id,
          order_name: b.invoice_number ? `Invoice #${b.invoice_number}` : `Bill #${b.id.slice(0, 6)}`,
          status: (b.status ?? 'paid') as OrderStatus,
          created_by: null,
          created_at: b.created_at,
          invoice_number: b.invoice_number,
          payment_method: resolvedPaymentMethod,
          discount_amount: b.discount_amount,
        };

        return {
          order: mockOrder,
          itemCount: itemCountByBillId[b.id] ?? previewItems.reduce((acc, i) => acc + i.quantity, 0),
          created_at: b.created_at,
          previewItems,
          remainingItemLines,
          totalAmount: subtotal,
          kotNumbers: [],
        };
      });

      const totalCount = billCount ?? billSummaries.length;
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      return {
        data: {
          summaries: billSummaries,
          totalCount,
          metrics: {
            grossSales: kpis.grossSales,
            discountsGiven: kpis.discountsGiven,
            complimentarySales: kpis.complimentarySales,
            netCollected: kpis.netCollected,
          },
          metadata: {
            source: 'bills',
            page,
            pageSize,
            totalCount,
            totalPages,
            generatedAt: new Date().toISOString(),
            filtersApplied: params,
          },
        },
        error: null,
      };
    }

    // ── 2. Query open_orders table for active orders tab ──
    let query = supabase
      .from('open_orders')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (preset === 'today') {
      const { startTimestamp } = getBusinessDayBounds('today');
      query = query.gte('created_at', startTimestamp);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (paymentMethod && paymentMethod !== 'all') {
      query = query.eq('payment_method', paymentMethod);
    }

    if (cashierId) {
      query = query.eq('created_by', cashierId);
    }

    const sortCol = sortBy === 'grand_total' ? 'discount_amount' : sortBy;
    query = query.order(sortCol, { ascending: sortOrder === 'asc' });

    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;
    query = query.range(fromIndex, toIndex);

    const { data: rawOrders, error: queryErr, count } = await query;
    if (queryErr) {
      logSupabaseError('getOrders', queryErr);
      return { data: null, error: 'Unable to query orders.' };
    }

    const orders = (rawOrders ?? []) as OpenOrderRow[];
    const orderIds = orders.map((o) => o.id);

    let itemRows: PricedOrderItemRow[] = [];
    if (orderIds.length > 0) {
      const { data: fetchedItems } = await supabase
        .from('open_order_items')
        .select('open_order_id, qty, product_id, price, item_name')
        .in('open_order_id', orderIds);
      itemRows = (fetchedItems ?? []) as PricedOrderItemRow[];
    }

    const productIds = [...new Set(itemRows.map((item) => item.product_id))];
    const productNames = await fetchProductNameMap(productIds);

    const itemsByOrderId: Record<string, OrderItemPreview[]> = {};
    const itemCountByOrderId: Record<string, number> = {};
    const totalAmountByOrderId: Record<string, number> = {};

    for (const item of itemRows) {
      const pName = item.item_name || productNames[item.product_id] || 'Item';
      const preview: OrderItemPreview = {
        name: pName,
        quantity: item.qty,
      };
      const existing = itemsByOrderId[item.open_order_id] ?? [];
      existing.push(preview);
      itemsByOrderId[item.open_order_id] = existing;
      itemCountByOrderId[item.open_order_id] = (itemCountByOrderId[item.open_order_id] ?? 0) + item.qty;
      totalAmountByOrderId[item.open_order_id] = (totalAmountByOrderId[item.open_order_id] ?? 0) + (item.qty * (item.price ?? 0));
    }

    const kotResult = await fetchKotsForOrders(orderIds);
    const kotsMap = kotResult.data ?? {};

    let grossSales = 0;
    let discountsGiven = 0;
    let complimentarySales = 0;
    let netCollected = 0;

    const summaries: OpenOrderSummary[] = orders.map((order) => {
      const orderItems = itemsByOrderId[order.id] ?? [];
      const previewItems = orderItems.slice(0, 3);
      const remainingItemLines = Math.max(0, orderItems.length - previewItems.length);
      const orderKots = kotsMap[order.id] ?? [];
      const kotNumbers = orderKots.map((k) => k.kot_number);

      const calculatedSubtotal = totalAmountByOrderId[order.id] ?? 0;
      const discAmt = order.discount_amount ?? 0;
      const isComp = (order.payment_method || '').toLowerCase() === 'complimentary';

      grossSales += calculatedSubtotal;
      discountsGiven += discAmt;
      if (isComp) {
        complimentarySales += calculatedSubtotal;
      } else if (order.status === 'paid' || order.status === 'completed') {
        netCollected += Math.max(0, calculatedSubtotal - discAmt);
      }

      return {
        order,
        itemCount: itemCountByOrderId[order.id] ?? 0,
        created_at: order.created_at,
        previewItems,
        remainingItemLines,
        totalAmount: calculatedSubtotal,
        kotNumbers,
      };
    });

    const totalCount = count ?? summaries.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
      data: {
        summaries,
        totalCount,
        metrics: {
          grossSales,
          discountsGiven,
          complimentarySales,
          netCollected,
        },
        metadata: {
          source: 'open_orders',
          page,
          pageSize,
          totalCount,
          totalPages,
          generatedAt: new Date().toISOString(),
          filtersApplied: params,
        },
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to query orders.' };
  }
}

export async function fetchOpenOrders(): Promise<ServiceResult<OpenOrder[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();

    let query = supabase
      .from('open_orders')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false });

    // Owners and admins see all branches; cashiers/managers see only their branch
    if (!isOwnerOrAdmin) {
      query = query.eq('branch_id', branch_id);
    }

    const { data, error } = await query;

    if (error) {
      logSupabaseError('fetchOpenOrders', error);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (error.code === '42P01' || error.message?.toLowerCase().includes('does not exist')) {
          return { data: [], error: null };
        }
      }
      return { data: null, error: 'Unable to load orders.' };
    }

    const allOpen = filterOpenOrders((data ?? []) as OpenOrder[]);
    const activeBilling = allOpen.filter(order => order.status !== 'held' && order.status !== 'draft');
    return { data: activeBilling, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
        return { data: [], error: null };
      }
    }
    return { data: null, error: 'Unable to load orders.' };
  }
}


export async function fetchOpenOrderById(
  orderId: string,
): Promise<ServiceResult<OpenOrderWithItems>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data: order, error: orderError } = await supabase
      .from('open_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .single();

    if (orderError) {
      logSupabaseError('fetchOpenOrderById.order', orderError);
      return { data: null, error: 'Unable to load order.' };
    }

    const { data: items, error: itemsError } = await supabase
      .from('open_order_items')
      .select('*')
      .eq('open_order_id', orderId);

    if (itemsError) {
      logSupabaseError('fetchOpenOrderById.items', itemsError);
      return { data: null, error: 'Unable to load order items.' };
    }

    return {
      data: {
        ...(order as OpenOrder),
        items: items ?? [],
      },
      error: null,
    };
  } catch {
    return { data: null, error: 'Unable to load order.' };
  }
}

let openOrdersCols = new Set<string>();
let openOrderItemsCols = new Set<string>();
let detectedSchema = false;

async function ensureSchemaDetected() {
  if (detectedSchema) return;
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (supabaseUrl && supabaseAnonKey) {
      const restUrl = `${supabaseUrl}/rest/v1/`;
      const res = await fetch(restUrl, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      });
      if (res.ok) {
        const schema = await res.json();
        const definitions = schema.definitions;
        if (definitions) {
          const extractCols = (tableName: string) => {
            const properties = definitions[tableName]?.properties;
            return properties ? new Set(Object.keys(properties)) : new Set<string>();
          };
          openOrdersCols = extractCols('open_orders');
          openOrderItemsCols = extractCols('open_order_items');
          detectedSchema = true;
        }
      }
    }
  } catch {
    // Fail silently
  }
}

function filterPayload(
  payload: Record<string, unknown>,
  allowedCols: Set<string>,
  fallbackCols: string[]
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  const colsToUse = detectedSchema ? allowedCols : new Set(fallbackCols);
  for (const [key, val] of Object.entries(payload)) {
    if (colsToUse.has(key)) {
      filtered[key] = val;
    }
  }

  return filtered;
}

export async function createOpenOrder(
  orderName: string,
  status: 'open' | 'draft' | string = 'draft',
): Promise<ServiceResult<OpenOrder>> {
  try {
    await ensureSchemaDetected();
    const { tenant_id, branch_id } = getTenantContext();

    const rawPayload = {
      tenant_id,
      branch_id,
      order_name: orderName,
      status: status,
    };

    const fallbackCols = [
      'tenant_id',
      'branch_id',
      'order_name',
      'status',
      'invoice_number',
      'token_number',
      'payment_method',
      'held_at',
      'paid_at',
      'cancelled_at',
      'completed_at',
      'notes',
    ];
    const filteredPayload = filterPayload(rawPayload, openOrdersCols, fallbackCols);

    const { data, error } = await supabase
      .from('open_orders')
      .insert(filteredPayload)
      .select('*')
      .single();

    if (error) {
      logSupabaseError('createOpenOrder', error);
      return { data: null, error: 'Unable to create order.' };
    }

    return { data: data as OpenOrder, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[Grovit] createOpenOrder exception:', err);
    }
    return { data: null, error: 'Unable to create order.' };
  }
}

export async function addOrderItem(input: {
  openOrderId: string;
  productId: string;
  itemName: string;
  quantity: number;
  price: number;
}): Promise<ServiceResult<OpenOrderItem>> {
  try {
    await ensureSchemaDetected();
    const rawPayload = {
      open_order_id: input.openOrderId,
      product_id: input.productId,
      item_name: input.itemName,
      qty: input.quantity,
      price: input.price,
      kot_sent: false,
    };

    const fallbackCols = ['open_order_id', 'product_id', 'item_name', 'qty', 'price', 'kot_sent'];
    const filteredPayload = filterPayload(rawPayload, openOrderItemsCols, fallbackCols);

    const { data, error } = await supabase
      .from('open_order_items')
      .insert(filteredPayload)
      .select('*')
      .single();

    if (error) {
      logSupabaseError('addOrderItem', error);
      return { data: null, error: 'Unable to add item.' };
    }

    return { data: data as OpenOrderItem, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[Grovit] addOrderItem exception:', err);
    }
    return { data: null, error: 'Unable to add item.' };
  }
}

export async function updateOrderItemQuantity(
  itemId: string,
  quantity: number,
): Promise<ServiceResult<OpenOrderItem>> {
  try {
    const { data, error } = await supabase
      .from('open_order_items')
      .update({ qty: quantity })
      .eq('id', itemId)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: 'Unable to update item.' };
    }

    return { data: data as OpenOrderItem, error: null };
  } catch {
    return { data: null, error: 'Unable to update item.' };
  }
}

export async function removeOrderItem(
  itemId: string,
): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase
      .from('open_order_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      return { data: null, error: 'Unable to remove item.' };
    }

    return { data: null, error: null };
  } catch {
    return { data: null, error: 'Unable to remove item.' };
  }
}

export async function fetchOrderItemCounts(
  orderIds: string[],
): Promise<ServiceResult<Record<string, number>>> {
  try {
    if (orderIds.length === 0) {
      return { data: {}, error: null };
    }

    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('open_order_items')
      .select('open_order_id, qty')
      .in('open_order_id', orderIds);

    if (error) {
      logSupabaseError('fetchOrderItemCounts', error);
      return { data: {}, error: null };
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const orderId = row.open_order_id as string;
      const qty = row.qty as number;
      counts[orderId] = (counts[orderId] ?? 0) + qty;
    }

    return { data: counts, error: null };
  } catch {
    return { data: null, error: 'Unable to load order counts.' };
  }
}

export async function clearOpenOrderItems(
  orderId: string,
): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase
      .from('open_order_items')
      .delete()
      .eq('open_order_id', orderId);

    if (error) {
      return { data: null, error: 'Unable to clear cart.' };
    }
    return { data: null, error: null };
  } catch {
    return { data: null, error: 'Unable to clear cart.' };
  }
}

export async function holdOpenOrder(
  orderId: string,
  heldAt: string,
): Promise<ServiceResult<OpenOrder>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { data, error } = await supabase
      .from('open_orders')
      .update({
        status: 'held',
        held_at: heldAt,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('*')
      .single();

    if (error) {
      logSupabaseError('holdOpenOrder', error);
      return { data: null, error: 'Unable to hold order.' };
    }
    return { data: data as OpenOrder, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[Grovit] holdOpenOrder exception:', err);
    }
    return { data: null, error: 'Unable to hold order.' };
  }
}

export async function resumeHeldOrder(
  orderId: string,
): Promise<ServiceResult<OpenOrder>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { data, error } = await supabase
      .from('open_orders')
      .update({
        status: 'draft',
        held_at: null,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('*')
      .single();

    if (error) {
      logSupabaseError('resumeHeldOrder', error);
      return { data: null, error: 'Unable to resume order.' };
    }
    return { data: data as OpenOrder, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[Grovit] resumeHeldOrder exception:', err);
    }
    return { data: null, error: 'Unable to resume order.' };
  }
}

/**
 * Fetches ALL orders for today (all statuses) for the Orders Management tab.
 * Includes item prices so totalAmount can be computed per order.
 * Scoped to today only for performance.
 */
export async function getAllOrders(): Promise<ServiceResult<OpenOrderSummary[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    // Compute business day bounds for 'today' (11:30 AM -> 02:30 AM next calendar day)
    const { startTimestamp, endTimestamp } = getBusinessDayBounds('today');

    const { data: orders, error: ordersError } = await supabase
      .from('open_orders')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .gte('created_at', startTimestamp)
      .lte('created_at', endTimestamp)
      .order('created_at', { ascending: false });

    if (ordersError) {
      logSupabaseError('getAllOrders.orders', ordersError);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (ordersError.code === '42P01' || ordersError.message?.toLowerCase().includes('does not exist')) {
          return { data: [], error: null };
        }
      }
      return { data: null, error: 'Unable to load orders.' };
    }

    const allOrders = (orders ?? []) as OpenOrder[];
    if (allOrders.length === 0) {
      return { data: [], error: null };
    }

    const orderIds = allOrders.map((o) => o.id);

    const { data: itemRows, error: itemsError } = await supabase
      .from('open_order_items')
      .select('open_order_id, qty, product_id, price')
      .in('open_order_id', orderIds);

    if (itemsError) {
      logSupabaseError('getAllOrders.items', itemsError);
      // Return orders without item detail
      return {
        data: allOrders.map((order) => ({
          order,
          itemCount: 0,
          created_at: order.created_at,
          previewItems: [],
          remainingItemLines: 0,
          totalAmount: 0,
        })),
        error: null,
      };
    }

    type AllOrderItemRow = {
      open_order_id: string;
      qty: number;
      product_id: string;
      price: number;
    };

    const items = (itemRows ?? []) as AllOrderItemRow[];
    const productIds = [...new Set(items.map((item) => item.product_id))];
    const productNames = await fetchProductNameMap(productIds);

    const itemsByOrderId: Record<string, OrderItemPreview[]> = {};
    const itemCountByOrderId: Record<string, number> = {};
    const totalAmountByOrderId: Record<string, number> = {};

    for (const item of items) {
      const name = productNames[item.product_id] ?? 'Item';
      const existing = itemsByOrderId[item.open_order_id] ?? [];
      const duplicate = existing.find((p) => p.name === name);
      if (duplicate) {
        duplicate.quantity += item.qty;
      } else {
        existing.push({
          name,
          quantity: item.qty,
        });
      }
      itemsByOrderId[item.open_order_id] = existing;
      itemCountByOrderId[item.open_order_id] = (itemCountByOrderId[item.open_order_id] ?? 0) + item.qty;
      totalAmountByOrderId[item.open_order_id] = (totalAmountByOrderId[item.open_order_id] ?? 0) + item.qty * (item.price ?? 0);
    }

    const kotResult = await fetchKotsForOrders(orderIds);
    const kotsMap = kotResult.data ?? {};

    const summaries: OpenOrderSummary[] = allOrders.map((order) => {
      const orderItems = itemsByOrderId[order.id] ?? [];
      const previewItems = orderItems.slice(0, 3);
      const remainingItemLines = Math.max(0, orderItems.length - previewItems.length);
      const orderKots = kotsMap[order.id] ?? [];
      const kotNumbers = orderKots.map(k => k.kot_number);

      return {
        order,
        itemCount: itemCountByOrderId[order.id] ?? 0,
        created_at: order.created_at,
        previewItems,
        remainingItemLines,
        totalAmount: totalAmountByOrderId[order.id] ?? 0,
        kotNumbers,
      };
    });

    const filteredSummaries = summaries.filter((summary) => {
      if (summary.order.status === 'draft' && summary.itemCount === 0) {
        return false;
      }
      return true;
    });

    return { data: filteredSummaries, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
        return { data: [], error: null };
      }
    }
    return { data: null, error: 'Unable to load orders.' };
  }
}

// ─── Order mutations used by the POS store ────────────────────────────────────

export type OrderDiscountInput = {
  discountType: 'percent' | 'fixed' | null;
  /** Percent (0–100) for 'percent', rupees for 'fixed'. */
  discountValue: number;
  discountAmount: number;
};

/** Persists the discount currently applied to an open order. */
export async function updateOrderDiscount(
  orderId: string,
  discount: OrderDiscountInput,
): Promise<ServiceResult<null>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { error } = await supabase
      .from('open_orders')
      .update({
        discount_type: discount.discountType,
        discount_value: discount.discountValue,
        discount_amount: discount.discountAmount,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      logSupabaseError('updateOrderDiscount', error);
      return { data: null, error: 'Unable to save discount.' };
    }
    return { data: null, error: null };
  } catch {
    return { data: null, error: 'Unable to save discount.' };
  }
}

export type OrderStatusUpdate = {
  status: OrderStatus;
  orderName?: string;
  cancelledAt?: string;
  discount?: OrderDiscountInput;
};

/** Updates an open order's lifecycle status (and optionally its name / discount). */
export async function updateOpenOrderStatus(
  orderId: string,
  update: OrderStatusUpdate,
): Promise<ServiceResult<null>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const payload: Record<string, unknown> = { status: update.status };
    if (update.orderName !== undefined) {
      payload.order_name = update.orderName;
    }
    if (update.cancelledAt !== undefined) {
      payload.cancelled_at = update.cancelledAt;
    }
    if (update.discount) {
      payload.discount_type = update.discount.discountType;
      payload.discount_value = update.discount.discountValue;
      payload.discount_amount = update.discount.discountAmount;
    }

    const { error } = await supabase
      .from('open_orders')
      .update(payload)
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      logSupabaseError('updateOpenOrderStatus', error);
      return { data: null, error: 'Unable to update order.' };
    }
    return { data: null, error: null };
  } catch {
    return { data: null, error: 'Unable to update order.' };
  }
}

export type AssignedOrderNumbers = {
  invoiceNumber: string | null;
  orderName: string | null;
};

function isAssignOrderNumbersResult(value: unknown): value is { invoice_number: unknown; order_name: unknown } {
  return !!value && typeof value === 'object' && 'invoice_number' in value && 'order_name' in value;
}

/**
 * Atomically assigns the missing invoice number and/or `Order #N` name to an
 * open order via the `assign_order_numbers` RPC. Numbers already present are
 * returned unchanged. Call this BEFORE printing anything that shows a number.
 */
export async function assignOrderNumbers(
  orderId: string,
  options: { invoice?: boolean; orderName?: boolean },
): Promise<ServiceResult<AssignedOrderNumbers>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { data, error } = await supabase.rpc('assign_order_numbers', {
      p_tenant_id: tenant_id,
      p_branch_id: branch_id,
      p_order_id: orderId,
      p_assign_invoice: options.invoice ?? false,
      p_assign_order_name: options.orderName ?? false,
    });

    if (error) {
      logSupabaseError('assignOrderNumbers', error);
      if (error.message?.includes('ORDER_NOT_FOUND')) {
        return { data: null, error: 'Order not found.' };
      }
      return { data: null, error: 'Unable to assign order numbers.' };
    }

    if (!isAssignOrderNumbersResult(data)) {
      logSupabaseError('assignOrderNumbers', { message: 'assign_order_numbers returned an unexpected payload', code: 'BAD_RPC_RESULT' });
      return { data: null, error: 'Unable to assign order numbers.' };
    }

    return {
      data: {
        invoiceNumber: typeof data.invoice_number === 'string' ? data.invoice_number : null,
        orderName: typeof data.order_name === 'string' ? data.order_name : null,
      },
      error: null,
    };
  } catch {
    return { data: null, error: 'Unable to assign order numbers.' };
  }
}

type SettleOrderRpcResult = {
  already_settled: boolean;
  order: OpenOrder | null;
  bill: { id: string } | null;
  settlement: { id: string } | null;
  consumption_batch_id?: string | null;
};

function isSettleOrderRpcResult(value: unknown): value is SettleOrderRpcResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.already_settled === 'boolean' && 'order' in candidate;
}

function mapSettleOrderError(error: { code?: string; message?: string }): string {
  const message = error.message ?? '';
  if (message.includes('SETTLE_ORDER_NOT_FOUND')) return 'Order not found.';
  if (message.includes('SETTLE_ORDER_CANCELLED')) return 'This order was cancelled and cannot be settled.';
  if (message.includes('SETTLE_ORDER_EMPTY')) return 'This order has no items to settle.';
  if (message.includes('SETTLE_INVOICE_NUMBER_REQUIRED')) return 'Unable to assign an invoice number.';
  if (message.includes('SETTLE_BILL_CONFLICT')) return 'A bill for this order already exists in another branch.';
  if (error.code === 'PGRST202') return 'Settlement service is not available. Please contact support.';
  return 'Unable to settle order.';
}

/**
 * Settles an open order atomically via the `settle_order` PostgreSQL function
 * (supabase/migrations/20260907000200_sequences_and_settle_order_v2.sql).
 *
 * The database assigns the invoice number / order name, computes integer-paise
 * totals from `pos_settings.tax_percentage`, upserts the bill and bill_items,
 * inserts the settlement and updates the order status in ONE transaction.
 * Concurrent settle attempts serialise on the order row; the second caller
 * receives the existing bill (`already_settled`) instead of a duplicate.
 */
export async function settleOrderById(
  orderId: string,
  paymentType: string = 'cash',
): Promise<ServiceResult<OpenOrder>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error: rpcErr } = await supabase.rpc('settle_order', {
      p_tenant_id: tenant_id,
      p_branch_id: branch_id,
      p_order_id: orderId,
      p_payment_type: paymentType,
    });

    if (rpcErr) {
      logSupabaseError('settleOrderById.rpc', rpcErr);
      return { data: null, error: mapSettleOrderError(rpcErr) };
    }

    if (!isSettleOrderRpcResult(data) || !data.order) {
      logSupabaseError('settleOrderById.rpc', { message: 'settle_order returned an unexpected payload', code: 'BAD_RPC_RESULT' });
      return { data: null, error: 'Unable to settle order.' };
    }

    // Recipe consumption is queued inside the settle_order transaction
    // (inventory_consumption_batches) and processed by the database worker
    // `process_consumption_batches`, scheduled every minute by pg_cron.
    // The client must NOT create or process a batch here: doing so would
    // deduct every ingredient twice.
    return { data: data.order, error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[Grovit] settleOrderById exception:', err);
    }
    return { data: null, error: 'Unable to settle order.' };
  }
}

