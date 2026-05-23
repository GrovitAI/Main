import type { OpenOrder, OpenOrderWithItems } from './order-types';
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
