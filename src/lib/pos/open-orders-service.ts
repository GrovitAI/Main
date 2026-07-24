import type { OpenOrder, OpenOrderItem, OpenOrderWithItems, KotTicket, KotTicketItem, OrderStatus } from './order-types';
import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';

const ACTIVE_ORDER_STATUS = 'open';

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

// ─── KOT & Sequence Local Fallback Persistence ──────────────────────────────────

export type LocalSequences = {
  kot_sequence: number;
  bill_sequence: number;
  order_sequence: number;
};

let localKotTickets: KotTicket[] = [];
let localSequences: LocalSequences = {
  kot_sequence: 0,
  bill_sequence: 0,
  order_sequence: 0,
};

if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const cachedKots = window.localStorage.getItem('grovit_local_kot_tickets');
    if (cachedKots) {
      localKotTickets = JSON.parse(cachedKots);
    }
    const cachedSeqs = window.localStorage.getItem('grovit_local_sequences');
    if (cachedSeqs) {
      localSequences = JSON.parse(cachedSeqs);
      // Clean up fallback missing fields if any
      if (typeof localSequences.order_sequence === 'undefined') {
        localSequences.order_sequence = 0;
      }
    }
  } catch (err) {
    console.warn('[Grovit] Error loading cached fallback states:', err);
  }
}

function saveLocalKotTickets() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('grovit_local_kot_tickets', JSON.stringify(localKotTickets));
  }
}

function saveLocalSequences() {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('grovit_local_sequences', JSON.stringify(localSequences));
  }
}

// ─── Monotonic Sequence Generators ──────────────────────────────────────────────

export function bootstrapSequenceRegistry(highestKot: number, highestBill: number, highestOrder: number): void {
  localSequences.kot_sequence = Math.max(localSequences.kot_sequence, highestKot);
  localSequences.bill_sequence = Math.max(localSequences.bill_sequence, highestBill);
  localSequences.order_sequence = Math.max(localSequences.order_sequence, highestOrder);
  saveLocalSequences();
  console.log('[Grovit SequenceRegistry] Bootstrapped:', localSequences);
}

export function getNextKotNumber(): number {
  localSequences.kot_sequence += 1;
  saveLocalSequences();
  return localSequences.kot_sequence;
}

export function getNextOrderNumber(): number {
  localSequences.order_sequence += 1;
  saveLocalSequences();
  return localSequences.order_sequence;
}

export function getNextBillNumber(): string {
  localSequences.bill_sequence += 1;
  saveLocalSequences();
  const padded = String(localSequences.bill_sequence).padStart(4, '0');
  return `INV-${padded}`;
}

/** Alias for semantic clarity — generates the next invoice number */
export const getNextInvoiceNumber = getNextBillNumber;

// ─── KOT Service API ───────────────────────────────────────────────────────────

export async function fetchKotsForOrders(
  orderIds: string[],
): Promise<ServiceResult<Record<string, KotTicket[]>>> {
  try {
    if (orderIds.length === 0) {
      return { data: {}, error: null };
    }

    const { tenant_id, branch_id } = getTenantContext();

    // Try Supabase first
    const { data, error } = await supabase
      .from('kots')
      .select('*, kot_items(*)')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .in('open_order_id', orderIds)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01' || error.message?.toLowerCase().includes('does not exist')) {
        const map: Record<string, KotTicket[]> = {};
        for (const ticket of localKotTickets) {
          if (orderIds.includes(ticket.open_order_id)) {
            const list = map[ticket.open_order_id] ?? [];
            list.push(ticket);
            map[ticket.open_order_id] = list;
          }
        }
        return { data: map, error: null };
      }
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
  } catch (err) {
    const map: Record<string, KotTicket[]> = {};
    for (const ticket of localKotTickets) {
      if (orderIds.includes(ticket.open_order_id)) {
        const list = map[ticket.open_order_id] ?? [];
        list.push(ticket);
        map[ticket.open_order_id] = list;
      }
    }
    return { data: map, error: null };
  }
}

export async function createKot(
  orderId: string,
  items: { name: string; quantity: number; notes?: string | null }[],
): Promise<ServiceResult<KotTicket>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const nextNumber = getNextKotNumber();

    // 1. Insert KOT master row
    const { data: kotData, error: kotError } = await supabase
      .from('kots')
      .insert({
        tenant_id,
        branch_id,
        open_order_id: orderId,
        kot_number: nextNumber,
        status: 'pending',
      })
      .select('*')
      .single();

    if (kotError) {
      if (kotError.code === '42P01' || kotError.message?.toLowerCase().includes('does not exist')) {
        const kotUuid = `kot-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const newTicket: KotTicket = {
          id: kotUuid,
          tenant_id,
          branch_id,
          open_order_id: orderId,
          kot_number: nextNumber,
          status: 'pending',
          printed_at: null,
          created_at: new Date().toISOString(),
          kot_items: items.map((item) => ({
            id: `kot-item-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            kot_id: kotUuid,
            item_name: item.name,
            qty: item.quantity,
            notes: item.notes || null,
          })),
        };
        localKotTickets.push(newTicket);
        saveLocalKotTickets();
        return { data: newTicket, error: null };
      }
      logSupabaseError('createKot.kots', kotError);
      return { data: null, error: 'Unable to save kitchen ticket.' };
    }

    const createdKot = kotData as KotTicket;
    const kotId = createdKot.id;

    // 2. Insert KOT items rows
    const itemsToInsert = items.map((item) => ({
      kot_id: kotId,
      item_name: item.name,
      qty: item.quantity,
      notes: item.notes || null,
    }));

    const { data: itemsData, error: itemsError } = await supabase
      .from('kot_items')
      .insert(itemsToInsert)
      .select('*');

    if (itemsError) {
      logSupabaseError('createKot.kot_items', itemsError);
      // Clean up KOT master row if items insert failed
      await supabase.from('kots').delete().eq('id', kotId);
      return { data: null, error: 'Unable to save kitchen ticket items.' };
    }

    createdKot.kot_items = itemsData as KotTicketItem[];
    return { data: createdKot, error: null };
  } catch (err) {
    const { tenant_id, branch_id } = getTenantContext();
    const nextNumber = getNextKotNumber();
    const kotUuid = `kot-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newTicket: KotTicket = {
      id: kotUuid,
      tenant_id,
      branch_id,
      open_order_id: orderId,
      kot_number: nextNumber,
      status: 'pending',
      printed_at: null,
      created_at: new Date().toISOString(),
      kot_items: items.map((item) => ({
        id: `kot-item-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        kot_id: kotUuid,
        item_name: item.name,
        qty: item.quantity,
        notes: item.notes || null,
      })),
    };
    localKotTickets.push(newTicket);
    saveLocalKotTickets();
    return { data: newTicket, error: null };
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

export async function getOrders(
  params: GetOrdersParams = {}
): Promise<ServiceResult<OrdersQueryResponse>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const {
      targetTable = 'open_orders',
      preset = 'today',
      fromDate,
      toDate,
      status = 'all',
      paymentMethod,
      cashierId,
      search,
      page = 1,
      pageSize = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = params;

    const now = new Date();

    // ── 1. Query bills table if targetTable === 'bills' or historical presets ──
    if (targetTable === 'bills' || preset === 'yesterday' || preset === '7days' || preset === '30days' || preset === 'custom') {
      // 1A. Unpaginated query for aggregate metrics across the ENTIRE filtered dataset
      let metricsQuery = supabase
        .from('bills')
        .select('subtotal, total_amount, discount_amount, payment_method, status')
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);

      if (preset === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
        metricsQuery = metricsQuery.gte('created_at', startOfToday);
      } else if (preset === 'yesterday') {
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).toISOString();
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).toISOString();
        metricsQuery = metricsQuery.gte('created_at', startOfYesterday).lte('created_at', endOfYesterday);
      } else if (preset === '7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        metricsQuery = metricsQuery.gte('created_at', sevenDaysAgo);
      } else if (preset === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        metricsQuery = metricsQuery.gte('created_at', thirtyDaysAgo);
      } else if (preset === 'custom' || fromDate || toDate) {
        if (fromDate) {
          const dFrom = typeof fromDate === 'string' ? new Date(fromDate) : fromDate;
          dFrom.setHours(0, 0, 0, 0);
          metricsQuery = metricsQuery.gte('created_at', dFrom.toISOString());
        }
        if (toDate) {
          const dTo = typeof toDate === 'string' ? new Date(toDate) : toDate;
          dTo.setHours(23, 59, 59, 999);
          metricsQuery = metricsQuery.lte('created_at', dTo.toISOString());
        }
      }

      if (paymentMethod && paymentMethod !== 'all') {
        metricsQuery = metricsQuery.eq('payment_method', paymentMethod);
      }

      if (status && status !== 'all') {
        metricsQuery = metricsQuery.eq('status', status);
      }

      if (search && search.trim().length > 0) {
        metricsQuery = metricsQuery.ilike('invoice_number', `%${search.trim()}%`);
      }

      const { data: allMetricsBills } = await metricsQuery;

      let grossSales = 0;
      let discountsGiven = 0;
      let complimentarySales = 0;
      let netCollected = 0;

      for (const b of (allMetricsBills || [])) {
        const subtotal = b.subtotal || b.total_amount || 0;
        const disc = b.discount_amount || 0;
        const isComp = (b.payment_method || '').toLowerCase() === 'complimentary';

        grossSales += subtotal;
        discountsGiven += disc;
        if (isComp) {
          complimentarySales += subtotal;
        } else if (b.status === 'paid' || b.status === 'completed') {
          netCollected += Math.max(0, subtotal - disc);
        }
      }

      // 1B. Paginated query for the requested page of rows
      let billQuery = supabase
        .from('bills')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);

      if (preset === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
        billQuery = billQuery.gte('created_at', startOfToday);
      } else if (preset === 'yesterday') {
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).toISOString();
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).toISOString();
        billQuery = billQuery.gte('created_at', startOfYesterday).lte('created_at', endOfYesterday);
      } else if (preset === '7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        billQuery = billQuery.gte('created_at', sevenDaysAgo);
      } else if (preset === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        billQuery = billQuery.gte('created_at', thirtyDaysAgo);
      } else if (preset === 'custom' || fromDate || toDate) {
        if (fromDate) {
          const dFrom = typeof fromDate === 'string' ? new Date(fromDate) : fromDate;
          dFrom.setHours(0, 0, 0, 0);
          billQuery = billQuery.gte('created_at', dFrom.toISOString());
        }
        if (toDate) {
          const dTo = typeof toDate === 'string' ? new Date(toDate) : toDate;
          dTo.setHours(23, 59, 59, 999);
          billQuery = billQuery.lte('created_at', dTo.toISOString());
        }
      }

      if (paymentMethod && paymentMethod !== 'all') {
        billQuery = billQuery.eq('payment_method', paymentMethod);
      }

      if (status && status !== 'all') {
        billQuery = billQuery.eq('status', status);
      }

      if (search && search.trim().length > 0) {
        billQuery = billQuery.ilike('invoice_number', `%${search.trim()}%`);
      }

      billQuery = billQuery.order('created_at', { ascending: sortOrder === 'asc' });

      const fromIndex = (page - 1) * pageSize;
      const toIndex = fromIndex + pageSize - 1;
      billQuery = billQuery.range(fromIndex, toIndex);

      const { data: rawBills, error: billErr, count: billCount } = await billQuery;
      if (billErr) {
        logSupabaseError('getOrders.bills', billErr);
        return { data: null, error: 'Unable to load bills history.' };
      }

      const billsList = rawBills || [];
      const billIds = billsList.map((b) => b.id);
      let billItemsData: any[] = [];
      if (billIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('bill_items')
          .select('*')
          .in('bill_id', billIds);
        billItemsData = itemsData || [];
      }

      const itemsByBillId: Record<string, OrderItemPreview[]> = {};
      const itemCountByBillId: Record<string, number> = {};

      for (const item of billItemsData) {
        const preview: OrderItemPreview = {
          name: item.item_name || 'Item',
          quantity: item.qty || 1,
        };
        const existing = itemsByBillId[item.bill_id] ?? [];
        existing.push(preview);
        itemsByBillId[item.bill_id] = existing;
        itemCountByBillId[item.bill_id] = (itemCountByBillId[item.bill_id] ?? 0) + (item.qty || 1);
      }

      const billSummaries: OpenOrderSummary[] = billsList.map((b) => {
        const previewItems = (itemsByBillId[b.id] || []).slice(0, 3);
        const remainingItemLines = Math.max(0, (itemsByBillId[b.id] || []).length - previewItems.length);
        const subtotal = b.subtotal || b.total_amount || 0;

        const mockOrder: OpenOrder = {
          id: b.open_order_id || b.id,
          tenant_id: b.tenant_id,
          branch_id: b.branch_id,
          order_name: b.invoice_number ? `Invoice #${b.invoice_number}` : `Bill #${b.id.slice(0, 6)}`,
          status: b.status || 'paid',
          created_by: null,
          created_at: b.created_at,
          invoice_number: b.invoice_number,
          payment_method: b.payment_method,
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
            grossSales,
            discountsGiven,
            complimentarySales,
            netCollected,
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
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      query = query.gte('created_at', startOfToday);
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

    let itemRows: OrderItemRow[] = [];
    if (orderIds.length > 0) {
      const { data: fetchedItems } = await supabase
        .from('open_order_items')
        .select('open_order_id, qty, product_id, price, item_name')
        .in('open_order_id', orderIds);
      itemRows = (fetchedItems ?? []) as any[];
    }

    const productIds = [...new Set(itemRows.map((item) => item.product_id))];
    const productNames = await fetchProductNameMap(productIds);

    const itemsByOrderId: Record<string, OrderItemPreview[]> = {};
    const itemCountByOrderId: Record<string, number> = {};
    const totalAmountByOrderId: Record<string, number> = {};

    for (const item of itemRows) {
      const pName = (item as any).item_name || productNames[item.product_id] || 'Item';
      const preview: OrderItemPreview = {
        name: pName,
        quantity: item.qty,
      };
      const existing = itemsByOrderId[item.open_order_id] ?? [];
      existing.push(preview);
      itemsByOrderId[item.open_order_id] = existing;
      itemCountByOrderId[item.open_order_id] = (itemCountByOrderId[item.open_order_id] ?? 0) + item.qty;
      totalAmountByOrderId[item.open_order_id] = (totalAmountByOrderId[item.open_order_id] ?? 0) + (item.qty * ((item as any).price || 0));
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
  payload: Record<string, any>,
  allowedCols: Set<string>,
  fallbackCols: string[]
) {
  const filtered: Record<string, any> = {};
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

    // Compute today's start in ISO format (local midnight → UTC)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    const { data: orders, error: ordersError } = await supabase
      .from('open_orders')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .gte('created_at', todayStartISO)
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

export async function createOrUpdateBill(
  orderId: string,
  invoiceNumber: string,
  subtotal: number,
  taxAmount: number,
  discountAmount: number,
  totalAmount: number,
  status: 'paid' | 'unpaid' | 'cancelled',
  discountType: 'percent' | 'fixed' | null = null,
  discountValue: number = 0,
  items?: any[]
): Promise<ServiceResult<any>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    // Check if bill already exists
    const { data: existingBill, error: fetchErr } = await supabase
      .from('bills')
      .select('*')
      .eq('open_order_id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .maybeSingle();

    if (fetchErr) {
      logSupabaseError('createOrUpdateBill.fetch', fetchErr);
      return { data: null, error: 'Failed to check existing bill.' };
    }

    const subtotal_paise = Math.round(subtotal * 100);
    const tax_paise = Math.round(taxAmount * 100);
    const discount_paise = Math.round(discountAmount * 100);
    const grand_total_paise = Math.round(totalAmount * 100);

    const billPayload = {
      tenant_id,
      branch_id,
      open_order_id: orderId,
      invoice_number: invoiceNumber,
      subtotal,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      status, // 'unpaid', 'paid', or 'cancelled'
      payment_status: (status === 'paid' ? 'paid' : 'unpaid') as any,
      document_status: (status === 'cancelled' ? 'cancelled' : 'confirmed') as any,
      subtotal_paise,
      tax_paise,
      discount_paise,
      grand_total_paise,
      discount_type: discountType,
      discount_value: discountValue,
      settled_at: status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let bill: any;
    if (existingBill) {
      const { data: updatedBill, error: updateErr } = await supabase
        .from('bills')
        .update(billPayload)
        .eq('id', existingBill.id)
        .select()
        .single();

      if (updateErr) {
        logSupabaseError('createOrUpdateBill.update', updateErr);
        return { data: null, error: 'Failed to update bill.' };
      }
      bill = updatedBill;
    } else {
      const { data: newBill, error: insertErr } = await supabase
        .from('bills')
        .insert({
          ...billPayload,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertErr) {
        // Handle PostgreSQL 23505 Unique Constraint Violation idempotently
        if (insertErr.code === '23505' || insertErr.message?.includes('unique_open_order_id') || insertErr.message?.includes('duplicate key')) {
          console.log(`[Grovit POS] Duplicate bill creation prevented for open_order_id: ${orderId}, invoice: ${invoiceNumber}, branch: ${branch_id}, timestamp: ${new Date().toISOString()}`);

          const { data: existingPostgresBill, error: fetchFallbackErr } = await supabase
            .from('bills')
            .select('*')
            .eq('open_order_id', orderId)
            .eq('tenant_id', tenant_id)
            .eq('branch_id', branch_id)
            .single();

          if (existingPostgresBill) {
            bill = existingPostgresBill;
          } else {
            logSupabaseError('createOrUpdateBill.insertFallback', fetchFallbackErr || insertErr);
            return { data: null, error: 'Failed to retrieve existing bill after constraint handling.' };
          }
        } else {
          logSupabaseError('createOrUpdateBill.insert', insertErr);
          return { data: null, error: 'Failed to create bill.' };
        }
      } else {
        bill = newBill;
      }
    }

    // Sync bill items if provided
    if (items && items.length > 0) {
      const { error: deleteBillItemsErr } = await supabase
        .from('bill_items')
        .delete()
        .eq('bill_id', bill.id);

      if (deleteBillItemsErr) {
        console.error('[createOrUpdateBill] Failed to delete existing bill items:', deleteBillItemsErr);
      }

      const billItemsPayload = items.map((item) => {
        const price_paise = Math.round((item.price || 0) * 100);
        return {
          bill_id: bill.id,
          product_id: item.product_id,
          item_name: item.product_name || item.item_name || 'Item',
          qty: item.qty,
          price: item.price || 0,
          price_paise,
          tax_rate: taxAmount > 0 ? 5 : 0, // simple GST percentage indicator
          gst_percentage: taxAmount > 0 ? 5 : 0,
          discount_amount_paise: 0,
        };
      });

      const { error: billItemsErr } = await supabase
        .from('bill_items')
        .insert(billItemsPayload);

      if (billItemsErr) {
        console.error('[createOrUpdateBill] Bill items sync failed', billItemsErr);
        return { data: null, error: `Unable to sync bill items: ${billItemsErr.message}` };
      }
    }

    return { data: bill, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function settleOrderById(
  orderId: string,
  paymentType: string = 'cash',
  createdBy: string = 'Cashier'
): Promise<ServiceResult<OpenOrder>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    // 1. Fetch open_order details
    const { data: order, error: orderErr } = await supabase
      .from('open_orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .single();

    if (orderErr || !order) {
      logSupabaseError('settleOrderById.fetchOrder', orderErr);
      return { data: null, error: 'Order not found.' };
    }

    // 2. Fetch open_order_items to copy
    const { data: orderItems, error: itemsErr } = await supabase
      .from('open_order_items')
      .select('*')
      .eq('open_order_id', orderId);

    if (itemsErr || !orderItems) {
      logSupabaseError('settleOrderById.fetchItems', itemsErr);
      return { data: null, error: 'Order items not found.' };
    }

    const subtotal = orderItems.reduce((acc, item) => acc + (item.qty * (item.price || 0)), 0);

    let tax_percentage = 0;
    const { data: posSettings } = await supabase
      .from('pos_settings')
      .select('tax_percentage')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .maybeSingle();

    if (posSettings) {
      tax_percentage = posSettings.tax_percentage || 0;
    }

    const isComplimentary = paymentType.toLowerCase() === 'complimentary';
    let discountType = order.discount_type || null;
    let discountValue = order.discount_value || 0;
    let discountAmount = order.discount_amount || 0;
    let discountedSubtotal = Math.max(0, subtotal - discountAmount);
    let tax_amount = Math.round((discountedSubtotal * tax_percentage / 100.0) * 100) / 100;
    let total_amount = discountedSubtotal + tax_amount;

    if (isComplimentary) {
      // Preserve gross sales revenue analytics by applying 100% discount (subtotal + tax)
      const grossTax = Math.round((subtotal * tax_percentage / 100.0) * 100) / 100;
      discountType = 'percent';
      discountValue = 100;
      discountAmount = subtotal + grossTax;
      tax_amount = grossTax;
      total_amount = 0;
    }

    let invoiceNumber = order.invoice_number;
    if (!invoiceNumber) {
      invoiceNumber = getNextBillNumber();
      await supabase
        .from('open_orders')
        .update({ invoice_number: invoiceNumber })
        .eq('id', orderId)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);
    }

    // 3. Create or update bill record using centralized method (which also handles items sync)
    const billResult = await createOrUpdateBill(
      orderId,
      invoiceNumber,
      subtotal,
      tax_amount,
      discountAmount,
      total_amount,
      'paid',
      discountType,
      discountValue,
      orderItems
    );

    if (billResult.error || !billResult.data) {
      throw new Error(billResult.error ?? 'Failed to write bill to database.');
    }

    const bill = billResult.data;

    // 5. Create settlement record
    const { data: existingSettlement } = await supabase
      .from('settlements')
      .select('id')
      .eq('bill_id', bill.id)
      .limit(1);

    if (!existingSettlement || existingSettlement.length === 0) {
      const settlementPayload = {
        bill_id: bill.id,
        tenant_id,
        branch_id,
        payment_type: isComplimentary ? 'complimentary' : paymentType.toLowerCase(),
        amount: total_amount,
      };

      console.log('[settleOrderById] Settlement payload', settlementPayload);

      const { error: settlementErr } = await supabase
        .from('settlements')
        .insert(settlementPayload);

      if (settlementErr) {
        console.error(
          '[settleOrderById] Settlement creation failed',
          {
            error: settlementErr,
            payload: settlementPayload,
            billId: bill.id,
          }
        );
        throw new Error(`Unable to create settlement: ${settlementErr.message}`);
      }
    }

    // 6. Mark open order as paid
    const paidAt = new Date().toISOString();

    const needsOrderNumber = !order.order_name || order.order_name.toLowerCase().includes('draft') || !order.order_name.startsWith('Order #');
    let nextOrderName = order.order_name;
    if (needsOrderNumber) {
      const nextOrderNum = getNextOrderNumber();
      nextOrderName = `Order #${nextOrderNum}`;
    }

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('open_orders')
      .update({
        status: 'paid',
        paid_at: paidAt,
        completed_at: paidAt,
        invoice_number: invoiceNumber,
        payment_method: paymentType,
        order_name: nextOrderName,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('*')
      .single();

    if (updateErr) {
      logSupabaseError('settleOrderById.updateOrder', updateErr);
      throw new Error(`Unable to mark order as paid: ${updateErr.message}`);
    }

    // Trigger recipe consumption asynchronously without blocking the checkout response
    if (bill && bill.id) {
      void (async () => {
        try {
          const { createConsumptionBatch, processConsumptionBatch } = await import('./inventory-service');
          console.log(`[Grovit] Triggering recipe consumption batch for bill ${bill.id}`);
          const batchResult = await createConsumptionBatch(bill.id);
          if (batchResult.error) {
            console.error('[Grovit] createConsumptionBatch error:', batchResult.error);
          }
          if (batchResult.data) {
            const procResult = await processConsumptionBatch(batchResult.data.id);
            if (procResult.error) {
              console.error('[Grovit] processConsumptionBatch error:', procResult.error);
            }
          }
        } catch (err) {
          console.error('[Grovit] Async consumption batch trigger failed:', err);
        }
      })();
    }

    return { data: updatedOrder as OpenOrder, error: null };
  } catch (err: any) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[Grovit] settleOrderById exception:', err);
    }
    return { data: null, error: err instanceof Error ? err.message : 'Unable to settle order.' };
  }
}

/**
 * Historical helper to backfill missing bills, bill_items, and settlements
 * from paid open orders that don't have matching transaction history rows.
 */
export async function repairMissingBills(): Promise<void> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    // 1. Fetch all paid open orders
    const { data: paidOrders, error: ordersErr } = await supabase
      .from('open_orders')
      .select('id, order_name, payment_method, created_at, created_by')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .eq('status', 'paid');

    if (ordersErr || !paidOrders) return;

    for (const order of paidOrders) {
      // Check if bill already exists
      const { data: bill } = await supabase
        .from('bills')
        .select('id')
        .eq('open_order_id', order.id)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .maybeSingle();

      if (!bill) {
        console.log(`[Grovit] Repairing missing bill for order: ${order.order_name} (${order.id})`);
        
        // Fetch order items
        const { data: orderItems } = await supabase
          .from('open_order_items')
          .select('*')
          .eq('open_order_id', order.id);

        if (orderItems && orderItems.length > 0) {
          const subtotal = orderItems.reduce((sum, item) => sum + (item.qty * (item.price || 0)), 0);
          
          // Create bill
          const { data: newBill, error: billErr } = await supabase
            .from('bills')
            .insert({
              tenant_id,
              branch_id,
              open_order_id: order.id,
              subtotal,
              tax_amount: 0,
              discount_amount: 0,
              total_amount: subtotal,
              status: 'paid',
              settled_at: order.created_at, // Preserves historical timeline
              created_by: null,
            })
            .select()
            .single();

          if (!billErr && newBill) {
            // Copy items to bill_items
            const billItemsPayload = orderItems.map((item) => ({
              bill_id: newBill.id,
              product_id: item.product_id,
              item_name: item.item_name || 'Item',
              qty: item.qty,
              price: item.price,
            }));
            await supabase.from('bill_items').insert(billItemsPayload);

            // Create settlement
            const pType = order.payment_method ? order.payment_method.toLowerCase() : 'cash';
            await supabase.from('settlements').insert({
              bill_id: newBill.id,
              tenant_id,
              branch_id,
              payment_type: pType,
              amount: subtotal,
            });
            
            console.log(`[Grovit] Successfully repaired bill for order: ${order.order_name}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Grovit] repairMissingBills exception caught:', err);
  }
}

