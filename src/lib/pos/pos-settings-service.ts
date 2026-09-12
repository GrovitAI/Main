import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';

/**
 * GST rate for the signed-in user's branch.
 *
 * The rate lives in pos_settings.tax_percentage, one row per branch, and is the
 * single source every part of the POS reads: the cart total, the printed
 * receipt and the settlement write. A branch with no row, or a row set to 0,
 * charges no GST — which is every branch until one is switched on.
 */

/** Cached per branch: the rate only changes when an owner edits settings. */
const rateByBranch = new Map<string, number>();

/**
 * Returns the branch's GST percentage, or 0 when none is configured.
 * Never throws: a failed lookup reads as "no GST", the safe direction, because
 * charging tax that was not configured is worse than charging none.
 */
export async function getBranchTaxPercentage(): Promise<number> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const cached = rateByBranch.get(branch_id);
    if (cached !== undefined) return cached;

    const { data, error } = await supabase
      .from('pos_settings')
      .select('tax_percentage')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .maybeSingle();

    if (error) return 0;

    const parsed = Number(data?.tax_percentage ?? 0);
    const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    rateByBranch.set(branch_id, rate);
    return rate;
  } catch {
    return 0;
  }
}

/**
 * Forgets the cached rates, so the next read sees a changed setting.
 * A till that is already open keeps its rate until it reloads or this is called.
 */
export function clearBranchTaxPercentageCache(): void {
  rateByBranch.clear();
}
