/**
 * Approval governance database layer (server-side).
 *
 * Every function receives the caller-scoped Supabase client created by the
 * API handler after authentication, so RLS decides what the caller may see.
 * Raw database error messages are logged here and never returned to clients.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BranchApprovalSettings, ApprovalRequestRecord } from './approval.types';

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

function logDbError(context: string, error: { message?: string; code?: string } | null): void {
  if (error) {
    console.error(`[approval-service] ${context}:`, error.code ?? '', error.message ?? '');
  }
}

/**
 * Fetches the branch approval settings for a specific tenant and branch.
 */
export async function getBranchApprovalSettings(
  db: SupabaseClient,
  tenantId: string,
  branchId: string
): Promise<ServiceResult<BranchApprovalSettings>> {
  try {
    const { data, error } = await db
      .from('branch_approval_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) {
      logDbError('getBranchApprovalSettings', error);
      return { data: null, error: 'Unable to load approval settings.' };
    }

    return { data: (data as BranchApprovalSettings | null) ?? null, error: null };
  } catch (err) {
    logDbError('getBranchApprovalSettings.exception', err instanceof Error ? { message: err.message } : null);
    return { data: null, error: 'Unable to load approval settings.' };
  }
}

/**
 * Inserts or updates the branch approval settings including action policies.
 */
export async function upsertBranchApprovalSettings(
  db: SupabaseClient,
  tenantId: string,
  branchId: string,
  approvalEmail: string,
  enabled: boolean,
  policies: Record<string, boolean> | null = null,
  changedBy: string = 'Admin'
): Promise<ServiceResult<BranchApprovalSettings>> {
  try {
    const existing = await getBranchApprovalSettings(db, tenantId, branchId);
    const cleanEmail = approvalEmail.trim().toLowerCase();

    const { data, error } = await db
      .from('branch_approval_settings')
      .upsert(
        {
          tenant_id: tenantId,
          branch_id: branchId,
          approval_email: cleanEmail,
          enabled,
          policies,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,branch_id' }
      )
      .select()
      .single();

    if (error) {
      logDbError('upsertBranchApprovalSettings', error);
      return { data: null, error: 'Unable to save approval settings.' };
    }

    const { error: historyError } = await db.from('branch_approval_settings_history').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      changed_by: changedBy,
      previous_email: existing.data?.approval_email || null,
      new_email: cleanEmail,
      previous_enabled: existing.data?.enabled ?? null,
      new_enabled: enabled,
      previous_policies: existing.data?.policies || null,
      new_policies: policies,
      created_at: new Date().toISOString(),
    });
    if (historyError) {
      logDbError('upsertBranchApprovalSettings.history', historyError);
    }

    return { data: data as BranchApprovalSettings, error: null };
  } catch (err) {
    logDbError('upsertBranchApprovalSettings.exception', err instanceof Error ? { message: err.message } : null);
    return { data: null, error: 'Unable to save approval settings.' };
  }
}

/**
 * Inserts a new approval request audit record.
 */
export async function createApprovalRequest(
  db: SupabaseClient,
  payload: Omit<ApprovalRequestRecord, 'id' | 'created_at'>
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const { data, error } = await db
      .from('approval_requests')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logDbError('createApprovalRequest', error);
      return { data: null, error: 'Unable to record the approval request.' };
    }

    return { data: data as ApprovalRequestRecord, error: null };
  } catch (err) {
    logDbError('createApprovalRequest.exception', err instanceof Error ? { message: err.message } : null);
    return { data: null, error: 'Unable to record the approval request.' };
  }
}

/**
 * Searches for an existing active PENDING approval request for the exact action & resource.
 */
export async function findActivePendingRequest(
  db: SupabaseClient,
  tenantId: string,
  branchId: string,
  action: string,
  resourceType: string,
  resourceId: string
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await db
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
      logDbError('findActivePendingRequest', error);
      return { data: null, error: 'Unable to look up pending approvals.' };
    }

    return { data: (data as ApprovalRequestRecord | null) ?? null, error: null };
  } catch (err) {
    logDbError('findActivePendingRequest.exception', err instanceof Error ? { message: err.message } : null);
    return { data: null, error: 'Unable to look up pending approvals.' };
  }
}

/**
 * Fetches an approval request by its unique request_uuid within the caller's tenant.
 */
export async function getApprovalRequestByUuid(
  db: SupabaseClient,
  tenantId: string,
  requestUuid: string
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const { data, error } = await db
      .from('approval_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('request_uuid', requestUuid)
      .maybeSingle();

    if (error) {
      logDbError('getApprovalRequestByUuid', error);
      return { data: null, error: 'Unable to load the approval request.' };
    }

    return { data: (data as ApprovalRequestRecord | null) ?? null, error: null };
  } catch (err) {
    logDbError('getApprovalRequestByUuid.exception', err instanceof Error ? { message: err.message } : null);
    return { data: null, error: 'Unable to load the approval request.' };
  }
}

/**
 * Updates an approval request record (status, attempts, hashes, timestamps).
 */
export async function updateApprovalRequest(
  db: SupabaseClient,
  tenantId: string,
  requestUuid: string,
  updates: Partial<ApprovalRequestRecord> & { resend_count?: number }
): Promise<ServiceResult<ApprovalRequestRecord>> {
  try {
    const { data, error } = await db
      .from('approval_requests')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('request_uuid', requestUuid)
      .select()
      .single();

    if (error) {
      logDbError('updateApprovalRequest', error);
      return { data: null, error: 'Unable to update the approval request.' };
    }

    return { data: data as ApprovalRequestRecord, error: null };
  } catch (err) {
    logDbError('updateApprovalRequest.exception', err instanceof Error ? { message: err.message } : null);
    return { data: null, error: 'Unable to update the approval request.' };
  }
}
