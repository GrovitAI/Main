import type { OpenOrder, OpenOrderItem, OpenOrderWithItems, KotTicket, KotTicketItem } from './order-types';
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
    order.status === 'in_kitchen' ||
    order.status === 'confirmed'
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
    const tax_amount = 0;
    const discount_amount = 0;
    const total_amount = subtotal;

    const invoiceNumber = order.invoice_number || getNextBillNumber();

    // 3. Create or reuse existing bill
    const { data: existingBill } = await supabase
      .from('bills')
      .select('*')
      .eq('open_order_id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .maybeSingle();

    let bill = existingBill;

    if (!bill) {
      const billPayload = {
        tenant_id,
        branch_id,
        open_order_id: orderId,
        invoice_number: invoiceNumber,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        status: 'paid',
        settled_at: new Date().toISOString(),
        created_by: null,
      };

      console.log('[settleOrderById] Bill payload', billPayload);

      const { data: newBill, error: billErr } = await supabase
        .from('bills')
        .insert(billPayload)
        .select()
        .single();

      if (billErr || !newBill) {
        console.error(
          '[settleOrderById] Bill creation failed',
          {
            error: billErr,
            payload: billPayload,
            orderId,
          }
        );
        throw new Error(`Unable to create bill: ${billErr?.message || 'Unknown error'}`);
      }
      bill = newBill;
    }

    // 4. Copy order items -> bill_items (prevent duplicates)
    const { data: existingBillItems } = await supabase
      .from('bill_items')
      .select('id')
      .eq('bill_id', bill.id)
      .limit(1);

    if (!existingBillItems || existingBillItems.length === 0) {
      const billItemsPayload = orderItems.map((item) => ({
        bill_id: bill.id,
        product_id: item.product_id,
        item_name: item.item_name || 'Item',
        qty: item.qty,
        price: item.price,
      }));

      console.log('[settleOrderById] Bill items payload', billItemsPayload);

      const { error: billItemsErr } = await supabase
        .from('bill_items')
        .insert(billItemsPayload);

      if (billItemsErr) {
        console.error(
          '[settleOrderById] Bill items creation failed',
          {
            error: billItemsErr,
            payload: billItemsPayload,
            billId: bill.id,
          }
        );
        throw new Error(`Unable to create bill items: ${billItemsErr.message}`);
      }
    }

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
        payment_type: paymentType.toLowerCase(),
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

