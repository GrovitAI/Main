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
    const { tenant_id } = getTenantContext();
    // Categories are tenant-wide — the same menu applies across all branches.
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant_id)
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

/**
 * Adds a menu category (task 276). Categories are shared by every branch, as getCategories reads
 * them; the row still records the branch that made it. The caller checks the name against the
 * categories it has loaded.
 */
export async function addCategory(name: string): Promise<ServiceResult<Category>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { data, error } = await supabase
      .from('categories')
      .insert({ tenant_id, branch_id, name: name.trim() })
      .select('*')
      .single();

    if (error || !data) {
      if (error) logSupabaseError('addCategory', error);
      return { data: null, error: 'Unable to add the category.' };
    }
    return { data: data as Category, error: null };
  } catch {
    return { data: null, error: 'Unable to add the category.' };
  }
}

export async function getProducts(
  categoryId?: string,
): Promise<ServiceResult<Product[]>> {
  try {
    const { tenant_id } = getTenantContext();
    // Products are tenant-wide — the same menu applies across all branches.
    // Inventory stock levels are per-branch, but the catalog is shared.
    let query = supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenant_id)
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
