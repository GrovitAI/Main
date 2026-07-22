import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  gstin: string | null;
  invoice_prefix: string;
  is_active: boolean;
  approval_email?: string;
  approval_enabled?: boolean;
  created_at: string;
};

export type CreateBranchPayload = {
  name: string;
  code: string;
  address: string;
  phone: string;
  gstin?: string;
  invoice_prefix: string;
  approval_email?: string;
  approval_enabled?: boolean;
};

export type UpdateBranchPayload = Partial<CreateBranchPayload & { is_active: boolean }>;

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Fetch all branches for the current tenant.
 * Owners and admins can see all branches.
 */
export async function fetchBranches(): Promise<{ data: Branch[]; error: string | null }> {
  try {
    const { tenant_id } = getTenantContext();

    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('name');

    if (error) {
      console.error('[branch-service] fetchBranches error:', error);
      return { data: [], error: error.message };
    }

    const { data: approvalSettings } = await supabase
      .from('branch_approval_settings')
      .select('*')
      .eq('tenant_id', tenant_id);

    const approvalMap = (approvalSettings ?? []).reduce((acc: Record<string, { approval_email: string; enabled: boolean }>, item: any) => {
      acc[item.branch_id] = { approval_email: item.approval_email, enabled: item.enabled };
      return acc;
    }, {});

    const enriched = (data ?? []).map((b: any) => ({
      ...b,
      approval_email: approvalMap[b.id]?.approval_email || '',
      approval_enabled: approvalMap[b.id]?.enabled ?? true,
    }));

    return { data: enriched as Branch[], error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch branches.';
    console.error('[branch-service] fetchBranches exception:', err);
    return { data: [], error: msg };
  }
}

/**
 * Create a new branch for the current tenant.
 */
export async function createBranch(
  payload: CreateBranchPayload
): Promise<{ data: Branch | null; error: string | null }> {
  try {
    const { tenant_id } = getTenantContext();

    const { data, error } = await supabase
      .from('branches')
      .insert({
        tenant_id,
        name: payload.name.trim(),
        code: payload.code.trim().toUpperCase(),
        address: payload.address.trim(),
        phone: payload.phone.trim(),
        gstin: payload.gstin?.trim() || null,
        invoice_prefix: payload.invoice_prefix.trim().toUpperCase(),
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('[branch-service] createBranch error:', error);
      return { data: null, error: error.message };
    }

    if (payload.approval_email !== undefined) {
      await supabase.from('branch_approval_settings').upsert({
        tenant_id,
        branch_id: data.id,
        approval_email: payload.approval_email.trim().toLowerCase(),
        enabled: payload.approval_enabled ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,branch_id' });
    }

    return { data: data as Branch, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create branch.';
    console.error('[branch-service] createBranch exception:', err);
    return { data: null, error: msg };
  }
}

/**
 * Update an existing branch.
 */
export async function updateBranch(
  branchId: string,
  payload: UpdateBranchPayload
): Promise<{ data: Branch | null; error: string | null }> {
  try {
    const { tenant_id } = getTenantContext();

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates['name'] = payload.name.trim();
    if (payload.code !== undefined) updates['code'] = payload.code.trim().toUpperCase();
    if (payload.address !== undefined) updates['address'] = payload.address.trim();
    if (payload.phone !== undefined) updates['phone'] = payload.phone.trim();
    if (payload.gstin !== undefined) updates['gstin'] = payload.gstin?.trim() || null;
    if (payload.invoice_prefix !== undefined)
      updates['invoice_prefix'] = payload.invoice_prefix.trim().toUpperCase();
    if (payload.is_active !== undefined) updates['is_active'] = payload.is_active;

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('branches')
        .update(updates)
        .eq('id', branchId)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error) {
        console.error('[branch-service] updateBranch error:', error);
        return { data: null, error: error.message };
      }
    }

    if (payload.approval_email !== undefined || payload.approval_enabled !== undefined) {
      const existingSettings = await supabase
        .from('branch_approval_settings')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branchId)
        .maybeSingle();

      const nextEmail = payload.approval_email !== undefined 
        ? payload.approval_email.trim().toLowerCase() 
        : (existingSettings.data?.approval_email || '');
      const nextEnabled = payload.approval_enabled !== undefined 
        ? payload.approval_enabled 
        : (existingSettings.data?.enabled ?? true);

      await supabase.from('branch_approval_settings').upsert({
        tenant_id,
        branch_id: branchId,
        approval_email: nextEmail,
        enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,branch_id' });
    }

    return { data: null, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update branch.';
    console.error('[branch-service] updateBranch exception:', err);
    return { data: null, error: msg };
  }
}
