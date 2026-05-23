import type { OpenOrder, OpenOrderItem, OpenOrderWithItems } from './order-types';
import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';

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
