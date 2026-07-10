import { supabase } from './supabase';
import { getTenantContext, requireBranchContext } from './tenant-context';

export type Settlement = {
  id: string;
  tenant_id: string;
  branch_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  settled_at: string;
  created_at: string;
};

export type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

export async function fetchSettlements(): Promise<ServiceResult<Settlement[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();

    let query = supabase
      .from('settlements')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('settled_at', { ascending: false });

    // Owners and admins see all branches; others see only their branch
    if (!isOwnerOrAdmin) {
      query = query.eq('branch_id', branch_id);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: 'Unable to load settlements.' };
    }

    return { data: data as Settlement[], error: null };
  } catch {
    return { data: null, error: 'Unable to load settlements.' };
  }
}

export async function createSettlement(
  input: Pick<Settlement, 'amount' | 'payment_method' | 'reference' | 'notes' | 'settled_at'>,
): Promise<ServiceResult<Settlement>> {
  try {
    const context = getTenantContext();
    const branchId = requireBranchContext(context);

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        tenant_id: context.tenant_id,
        branch_id: branchId,
        amount: input.amount,
        payment_method: input.payment_method,
        reference: input.reference,
        notes: input.notes,
        settled_at: input.settled_at,
      })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: 'Unable to save settlement.' };
    }

    return { data: data as Settlement, error: null };
  } catch {
    return { data: null, error: 'Unable to save settlement.' };
  }
}
