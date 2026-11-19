import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import type { ServiceResult } from '@/lib/pos/kitchen-types';
import { parseSalaryMonth, type SalaryMonth } from '@/lib/pos/kitchen-salary-utils';

/** Task 327: salaries, through the two kitchen functions (the salary table has no direct access). */
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function scope(): { p_tenant_id: string; p_branch_id: string } {
  return { p_tenant_id: getTenantContext().tenant_id, p_branch_id: kitchenBranch().id };
}
function explain(error: unknown, fallback: string): string {
  const code = record(error) ? String(error.code ?? '') : '';
  const message = record(error) ? String(error.message ?? '') : '';
  if (code === 'PGRST202') return 'This needs the kitchen’s latest database update.';
  if (code === '42501' || message.includes('KITCHEN_NOT_ALLOWED')) return 'Your login cannot see salaries. Ask the owner.';
  if (message.includes('KITCHEN_INVALID')) return 'Check the salary and try again.';
  return fallback;
}

export async function fetchKitchenSalaryMonth(from: string, to: string): Promise<ServiceResult<SalaryMonth>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_salary_month', { ...scope(), p_from: from, p_to: to });
    if (error) return { data: null, error: explain(error, 'Unable to load salaries. Please retry.') };
    return { data: parseSalaryMonth(data), error: null };
  } catch (error) {
    return { data: null, error: explain(error, 'Unable to load salaries. Please retry.') };
  }
}

export async function setKitchenStaffSalary(rosterId: string, monthlySalary: number): Promise<ServiceResult<true>> {
  try {
    const amount = Math.round(monthlySalary * 100);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) return { data: null, error: 'Enter a monthly salary up to ₹10,00,000.' };
    const { error } = await supabase.rpc('kitchen_set_staff_salary', { ...scope(), p_roster_id: rosterId, p_monthly_salary_paise: amount });
    if (error) return { data: null, error: explain(error, 'Unable to save the salary. Please retry.') };
    return { data: true, error: null };
  } catch (error) {
    return { data: null, error: explain(error, 'Unable to save the salary. Please retry.') };
  }
}
