import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';

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
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .order('settled_at', { ascending: false });

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
    const { tenant_id, branch_id } = getTenantContext();

    const { data, error } = await supabase
      .from('settlements')
      .insert({
        tenant_id,
        branch_id,
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
