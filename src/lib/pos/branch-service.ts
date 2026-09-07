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
  approval_email_verified?: boolean;
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

type BranchApprovalSettingRow = {
  branch_id: string;
  approval_email: string | null;
  enabled: boolean | null;
  approval_email_verified: boolean | null;
};

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
      console.error('fetchBranches failed', error);
      return { data: [], error: 'Unable to load branches. Please try again.' };
    }

    const { data: approvalSettings } = await supabase
      .from('branch_approval_settings')
      .select('*')
      .eq('tenant_id', tenant_id);

    const approvalMap: Record<string, { approval_email: string; enabled: boolean; verified: boolean }> = {};
    for (const item of (approvalSettings ?? []) as BranchApprovalSettingRow[]) {
      approvalMap[item.branch_id] = {
        approval_email: item.approval_email ?? '',
        enabled: item.enabled ?? true,
        verified: item.approval_email_verified === true,
      };
    }

    const enriched: Branch[] = ((data ?? []) as Branch[]).map((b) => ({
      ...b,
      approval_email: approvalMap[b.id]?.approval_email || '',
      approval_email_verified: approvalMap[b.id]?.verified ?? false,
      approval_enabled: approvalMap[b.id]?.enabled ?? true,
    }));

    return { data: enriched, error: null };
  } catch (err) {
    console.error('fetchBranches failed', err);
    return { data: [], error: 'Unable to load branches. Please try again.' };
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
      console.error('createBranch failed', error);
      return { data: null, error: 'Unable to create branch. Please try again.' };
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
    console.error('createBranch failed', err);
    return { data: null, error: 'Unable to create branch. Please try again.' };
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
        console.error('updateBranch failed', error);
        return { data: null, error: 'Unable to update branch. Please try again.' };
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
    console.error('updateBranch failed', err);
    return { data: null, error: 'Unable to update branch. Please try again.' };
  }
}
