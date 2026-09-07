import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { getTenantContext } from './tenant-context';

/**
 * Branch-level POS settings. The tax percentage returned here is the same
 * value `settle_order` reads from `pos_settings.tax_percentage`, so client
 * totals (cart, provisional bills) match what the database settles.
 */

const TAX_CACHE_TTL_MS = 5 * 60 * 1000;

type TaxCacheEntry = {
  value: number;
  expiresAt: number;
};

const taxCache = new Map<string, TaxCacheEntry>();

function cacheKey(tenantId: string, branchId: string): string {
  return `${tenantId}:${branchId}`;
}

function toTaxPercentage(raw: unknown): number {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

/** Drops the cached tax rate (e.g. after settings are edited). */
export function invalidateBranchTaxCache(): void {
  taxCache.clear();
}

/**
 * Returns the branch tax percentage (e.g. 5 for 5% GST), cached for five
 * minutes per tenant/branch. Defaults to 0 when unset or unreachable.
 */
export async function getBranchTaxPercentage(): Promise<number> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const key = cacheKey(tenant_id, branch_id);
    const cached = taxCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const { data, error } = await supabase
      .from('pos_settings')
      .select('tax_percentage')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .limit(1)
      .maybeSingle();

    if (error) {
      logSupabaseError('getBranchTaxPercentage', error);
      return cached?.value ?? 0;
    }

    const row: { tax_percentage?: unknown } | null = data;
    const value = toTaxPercentage(row?.tax_percentage);
    taxCache.set(key, { value, expiresAt: now + TAX_CACHE_TTL_MS });
    return value;
  } catch {
    return 0;
  }
}
