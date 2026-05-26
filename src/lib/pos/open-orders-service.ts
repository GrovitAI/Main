import type { OpenOrder, OpenOrderItem, OpenOrderWithItems } from './order-types';
import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';

const ACTIVE_ORDER_STATUS = 'open';

function isOpenOrderRow(order: OpenOrder): boolean {
  if (!order.status) {
    return true;
  }
  return order.status === 'open' || order.status === 'draft';
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

  const { tenant_id, branch_id } = getTenantContext();
  const { data, error } = await supabase
    .from('products')
    .select('id, name')
    .eq('tenant_id', tenant_id)
    .eq('branch_id', branch_id)
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
      }));
      return { data: summariesWithoutItems, error: null };
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

    const summaries: OpenOrderSummary[] = openOrders.map((order) => {
      const orderItems = itemsByOrderId[order.id] ?? [];
      const previewItems = orderItems.slice(0, 2);
      const remainingItemLines = Math.max(0, orderItems.length - previewItems.length);

      return {
        order,
        itemCount: itemCountByOrderId[order.id] ?? 0,
        created_at: order.created_at,
        previewItems,
        remainingItemLines,
      };
    });

    return { data: summaries, error: null };
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
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('open_orders')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('created_at', { ascending: false });

    if (error) {
      logSupabaseError('fetchOpenOrders', error);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (error.code === '42P01' || error.message?.toLowerCase().includes('does not exist')) {
          return { data: [], error: null };
        }
      }
      return { data: null, error: 'Unable to load orders.' };
    }

    return { data: filterOpenOrders((data ?? []) as OpenOrder[]), error: null };
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
