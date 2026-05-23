import type { OpenOrder, OpenOrderItem, OpenOrderWithItems } from './order-types';
import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';

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
  quantity: number;
  product_id: string;
  created_at: string;
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
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (ordersError) {
      return { data: null, error: 'Unable to load open orders.' };
    }

    const openOrders = (orders ?? []) as OpenOrderRow[];
    if (openOrders.length === 0) {
      return { data: [], error: null };
    }

    const orderIds = openOrders.map((order) => order.id);

    const { data: itemRows, error: itemsError } = await supabase
      .from('open_order_items')
      .select('open_order_id, quantity, product_id, created_at')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .in('open_order_id', orderIds)
      .order('created_at', { ascending: true });

    if (itemsError) {
      return { data: null, error: 'Unable to load open orders.' };
    }

    const items = (itemRows ?? []) as OrderItemRow[];
    const productIds = [...new Set(items.map((item) => item.product_id))];
    const productNames = await fetchProductNameMap(productIds);

    const itemsByOrderId: Record<string, OrderItemPreview[]> = {};
    const itemCountByOrderId: Record<string, number> = {};

    for (const item of items) {
      const preview: OrderItemPreview = {
        name: productNames[item.product_id] ?? 'Item',
        quantity: item.quantity,
      };
      const existing = itemsByOrderId[item.open_order_id] ?? [];
      existing.push(preview);
      itemsByOrderId[item.open_order_id] = existing;
      itemCountByOrderId[item.open_order_id] =
        (itemCountByOrderId[item.open_order_id] ?? 0) + item.quantity;
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
  } catch {
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
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: 'Unable to load orders.' };
    }

    return { data: data as OpenOrder[], error: null };
  } catch {
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
      return { data: null, error: 'Unable to load order.' };
    }

    const { data: items, error: itemsError } = await supabase
      .from('open_order_items')
      .select('*')
      .eq('open_order_id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (itemsError) {
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

export async function createOpenOrder(
  tableLabel: string,
): Promise<ServiceResult<OpenOrder>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('open_orders')
      .insert({
        tenant_id,
        branch_id,
        table_label: tableLabel,
        status: 'open',
      })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: 'Unable to create order.' };
    }

    return { data: data as OpenOrder, error: null };
  } catch {
    return { data: null, error: 'Unable to create order.' };
  }
}

export async function addOrderItem(input: {
  openOrderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}): Promise<ServiceResult<OpenOrderItem>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('open_order_items')
      .insert({
        tenant_id,
        branch_id,
        open_order_id: input.openOrderId,
        product_id: input.productId,
        quantity: input.quantity,
        unit_price: input.unitPrice,
      })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: 'Unable to add item.' };
    }

    return { data: data as OpenOrderItem, error: null };
  } catch {
    return { data: null, error: 'Unable to add item.' };
  }
}

export async function updateOrderItemQuantity(
  itemId: string,
  quantity: number,
): Promise<ServiceResult<OpenOrderItem>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('open_order_items')
      .update({ quantity })
      .eq('id', itemId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
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
    const { tenant_id, branch_id } = getTenantContext();

    const { error } = await supabase
      .from('open_order_items')
      .delete()
      .eq('id', itemId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

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
      .select('open_order_id, quantity')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .in('open_order_id', orderIds);

    if (error) {
      return { data: null, error: 'Unable to load order counts.' };
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const orderId = row.open_order_id as string;
      const quantity = row.quantity as number;
      counts[orderId] = (counts[orderId] ?? 0) + quantity;
    }

    return { data: counts, error: null };
  } catch {
    return { data: null, error: 'Unable to load order counts.' };
  }
}
