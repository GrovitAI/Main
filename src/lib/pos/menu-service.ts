import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';
import type { Category, Product } from './products-service';

export type MenuProduct = Product & {
  is_active: boolean;
  updated_at?: string;
};

/**
 * Fetches all active products (is_active = true) for the current tenant and branch.
 */
export async function fetchActiveProducts(): Promise<ServiceResult<MenuProduct[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      return { data: null, error: 'Unable to load menu products.' };
    }

    return { data: (data ?? []) as MenuProduct[], error: null };
  } catch {
    return { data: null, error: 'Unable to load menu products.' };
  }
}

/**
 * Instantly toggles the is_available status of a product.
 */
export async function toggleProductAvailability(
  productId: string,
  nextStatus: boolean
): Promise<ServiceResult<MenuProduct>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('products')
      .update({
        is_available: nextStatus,
      })
      .eq('id', productId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: 'Unable to toggle product availability.' };
    }

    return { data: data as MenuProduct, error: null };
  } catch {
    return { data: null, error: 'Unable to toggle product availability.' };
  }
}

/**
 * Creates a new product under the current tenant and branch.
 */
export async function addProduct(
  input: Pick<MenuProduct, 'name' | 'price' | 'category_id' | 'is_available' | 'inventory_tracking_enabled' | 'recipe_id'>
): Promise<ServiceResult<MenuProduct>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const payload = {
      tenant_id,
      branch_id,
      name: input.name,
      price: Number(input.price),
      category_id: input.category_id,
      is_available: input.is_available,
      is_active: true,
      inventory_tracking_enabled: !!input.inventory_tracking_enabled,
      recipe_id: input.recipe_id || null,
    };

    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: 'Unable to create product.' };
    }

    return { data: data as MenuProduct, error: null };
  } catch {
    return { data: null, error: 'Unable to create product.' };
  }
}

/**
 * Updates details of an existing product.
 */
export async function updateProduct(
  productId: string,
  input: Pick<MenuProduct, 'name' | 'price' | 'category_id' | 'is_available' | 'inventory_tracking_enabled' | 'recipe_id'>
): Promise<ServiceResult<MenuProduct>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const payload = {
      name: input.name,
      price: Number(input.price),
      category_id: input.category_id,
      is_available: input.is_available,
      inventory_tracking_enabled: !!input.inventory_tracking_enabled,
      recipe_id: input.recipe_id || null,
    };

    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', productId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: 'Unable to update product details.' };
    }

    return { data: data as MenuProduct, error: null };
  } catch {
    return { data: null, error: 'Unable to update product details.' };
  }
}

/**
 * Soft deletes/archives a product.
 */
export async function archiveProduct(productId: string): Promise<ServiceResult<void>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { error } = await supabase
      .from('products')
      .update({
        is_active: false,
      })
      .eq('id', productId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: null, error: 'Unable to archive product.' };
    }

    return { data: undefined, error: null };
  } catch {
    return { data: null, error: 'Unable to archive product.' };
  }
}
