import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';

export type Category = {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
};

export type Product = {
  id: string;
  tenant_id: string;
  branch_id: string;
  category_id: string | null;
  name: string;
  price: number;
  is_available: boolean | null;
  is_active: boolean;
  recipe_id?: string | null;
  inventory_tracking_enabled?: boolean;
};

export async function getCategories(): Promise<ServiceResult<Category[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('name', { ascending: true });

    if (error) {
      logSupabaseError('getCategories', error);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (error.code === '42P01' || error.message?.toLowerCase().includes('does not exist')) {
          return { data: [], error: null };
        }
      }
      return { data: null, error: 'Unable to load categories.' };
    }

    return { data: (data ?? []) as Category[], error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
        return { data: [], error: null };
      }
    }
    return { data: null, error: 'Unable to load categories.' };
  }
}

export async function getProducts(
  categoryId?: string,
): Promise<ServiceResult<Product[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    let query = supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .eq('is_active', true)
      .eq('is_available', true)
      .order('name', { ascending: true });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) {
      logSupabaseError('getProducts', error);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        if (error.code === '42P01' || error.message?.toLowerCase().includes('does not exist')) {
          return { data: [], error: null };
        }
      }
      return { data: null, error: 'Unable to load products.' };
    }

    return { data: (data ?? []) as Product[], error: null };
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
        return { data: [], error: null };
      }
    }
    return { data: null, error: 'Unable to load products.' };
  }
}
