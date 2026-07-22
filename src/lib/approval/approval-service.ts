import { supabase } from '@/lib/pos/supabase';
import { logSupabaseError } from '@/lib/pos/supabase-debug';
import type { BranchApprovalSettings, ApprovalRequestRecord, ApprovalStatus } from './approval.types';

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Fetches the branch approval settings for a specific tenant and branch.
 */
export async function getBranchApprovalSettings(
  tenantId: string,
  branchId: string
): Promise<ServiceResult<BranchApprovalSettings>> {
  try {
    const { data, error } = await supabase
      .from('branch_approval_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) {
      logSupabaseError('getBranchApprovalSettings', error);
      return { data: null, error: error.message };
    }

    return { data: data as BranchApprovalSettings | null, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to fetch branch approval settings.' };
  }
}

/**
 * Inserts or updates the branch approval settings.
 */
export async function upsertBranchApprovalSettings(
  tenantId: string,
  branchId: string,
  approvalEmail: string,
  enabled: boolean,
  changedBy: string = 'Admin'
): Promise<ServiceResult<BranchApprovalSettings>> {
  try {
    const existing = await getBranchApprovalSettings(tenantId, branchId);
    const cleanEmail = approvalEmail.trim().toLowerCase();

    const { data, error } = await supabase
      .from('branch_approval_settings')
      .upsert(
        {
          tenant_id: tenantId,
          branch_id: branchId,
          approval_email: cleanEmail,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,branch_id' }
      )
      .select()
      .single();

    if (error) {
      logSupabaseError('upsertBranchApprovalSettings', error);
      return { data: null, error: error.message };
    }

    // Record audit history entry
    void supabase.from('branch_approval_settings_history').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      changed_by: changedBy,
      previous_email: existing.data?.approval_email || null,
      new_email: cleanEmail,
      previous_enabled: existing.data?.enabled ?? null,
      new_enabled: enabled,
      created_at: new Date().toISOString(),
    });

    return { data: data as BranchApprovalSettings, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to update branch approval settings.' };
  }
}

/**
 * Inserts a new approval request audit record into Supabase.
 */
export async function createApprovalRequest(
  payload: Omit<ApprovalRequestRecord, 'id' | 'created_at'>
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const { data, error } = await supabase
      .from('approval_requests')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logSupabaseError('createApprovalRequest', error);
      return { data: null, error: error.message };
    }

    return { data: data as ApprovalRequestRecord, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to create approval request.' };
  }
}

/**
 * Searches for an existing active PENDING approval request for the exact action & resource.
 */
export async function findActivePendingRequest(
  tenantId: string,
  branchId: string,
  action: string,
  resourceType: string,
  resourceId: string
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('action', action)
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .eq('status', 'PENDING')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logSupabaseError('findActivePendingRequest', error);
      return { data: null, error: error.message };
    }

    return { data: data as ApprovalRequestRecord | null, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to search pending approval requests.' };
  }
}

/**
 * Fetches an approval request by its unique request_uuid.
 */
export async function getApprovalRequestByUuid(
  tenantId: string,
  branchId: string,
  requestUuid: string
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const { data, error } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('request_uuid', requestUuid)
      .maybeSingle();

    if (error) {
      logSupabaseError('getApprovalRequestByUuid', error);
      return { data: null, error: error.message };
    }

    return { data: data as ApprovalRequestRecord | null, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to fetch approval request.' };
  }
}

/**
 * Updates an approval request record (status, attempts, hashes, timestamps).
 */
export async function updateApprovalRequest(
  tenantId: string,
  branchId: string,
  requestUuid: string,
  updates: Partial<ApprovalRequestRecord>
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const { data, error } = await supabase
      .from('approval_requests')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('request_uuid', requestUuid)
      .select()
      .single();

    if (error) {
      logSupabaseError('updateApprovalRequest', error);
      return { data: null, error: error.message };
    }

    return { data: data as ApprovalRequestRecord, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to update approval request.' };
  }
}
