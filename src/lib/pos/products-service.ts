import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import type { ServiceResult } from './settlement-service';

export type Category = {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean | null;
};

export type Product = {
  id: string;
  tenant_id: string;
  branch_id: string;
  category_id: string | null;
  name: string;
  price: number;
  is_active: boolean | null;
};

export async function getCategories(): Promise<ServiceResult<Category[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return { data: null, error: 'Unable to load categories.' };
    }

    return { data: data as Category[], error: null };
  } catch {
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
      .order('name', { ascending: true });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: 'Unable to load products.' };
    }

    return { data: data as Product[], error: null };
  } catch {
    return { data: null, error: 'Unable to load products.' };
  }
}
