/**
 * HTTP client for the approval API (/api/approval/*).
 *
 * All calls are authenticated with the signed-in user's Supabase token via
 * apiFetch. The server derives tenant / branch from the caller; the
 * tenantId / branchId fields in the input types are kept for backwards
 * compatibility and for owners selecting another branch.
 */
import { apiFetch } from '@/lib/pos/api-client';
import type {
  BranchApprovalSettings,
  RequestApprovalApiInput,
  RequestApprovalApiResponse,
  VerifyApprovalApiInput,
  VerifyApprovalApiResponse,
  ResendApprovalApiInput,
  ResendApprovalApiResponse,
  CompleteApprovalApiInput,
  CompleteApprovalApiResponse,
} from './approval.types';

export interface SaveApprovalSettingsInput {
  branchId: string;
  approvalEmail: string;
  enabled: boolean;
  policies: Record<string, boolean> | null;
}

export const approvalService = {
  /**
   * Loads the approval settings for a branch (owners/admins may pass another branch).
   */
  async getSettings(branchId: string): Promise<{ data: BranchApprovalSettings | null; error: string | null }> {
    const res = await apiFetch<{ data: BranchApprovalSettings | null }>(
      `/api/approval/settings?branchId=${encodeURIComponent(branchId)}`
    );
    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data ?? null, error: null };
  },

  /**
   * Saves the approval settings + per-action policy matrix for a branch.
   */
  async saveSettings(input: SaveApprovalSettingsInput): Promise<{ data: BranchApprovalSettings | null; error: string | null }> {
    const res = await apiFetch<{ data: BranchApprovalSettings }>('/api/approval/settings', { method: 'POST', body: input });
    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data ?? null, error: null };
  },

  /**
   * Fast pre-check to determine if an action requires approval before opening any dialogs.
   */
  async checkPolicyRequired(_tenantId: string, branchId: string, action: string): Promise<{ required: boolean }> {
    const res = await this.getSettings(branchId);
    if (res.error) return { required: true };
    const settings = res.data;
    if (!settings || !settings.enabled || !settings.approval_email) {
      return { required: false };
    }
    const policyEnabled = settings.policies ? settings.policies[action] ?? true : true;
    return { required: policyEnabled !== false };
  },

  /**
   * Submits a new approval request.
   * If branch approval is disabled, the server returns { required: false, approved: true }.
   */
  async requestApproval(input: RequestApprovalApiInput): Promise<RequestApprovalApiResponse> {
    const res = await apiFetch<RequestApprovalApiResponse>('/api/approval/request', { method: 'POST', body: input });
    if (res.error || !res.data) {
      return { required: true, error: res.error ?? 'Unable to request approval.' };
    }
    return res.data;
  },

  /**
   * Verifies the 6-digit approval code entered by the cashier.
   */
  async verifyApproval(input: VerifyApprovalApiInput): Promise<VerifyApprovalApiResponse> {
    const res = await apiFetch<VerifyApprovalApiResponse>('/api/approval/verify', { method: 'POST', body: input });
    if (res.error || !res.data) {
      return { success: false, error: res.error ?? 'Unable to verify the approval code.' };
    }
    return res.data;
  },

  /**
   * Resends the approval code for an active pending request.
   */
  async resendApproval(input: ResendApprovalApiInput): Promise<ResendApprovalApiResponse> {
    const res = await apiFetch<ResendApprovalApiResponse>('/api/approval/resend', { method: 'POST', body: input });
    if (res.error || !res.data) {
      return { success: false, error: res.error ?? 'Unable to resend the approval code.' };
    }
    return res.data;
  },

  /**
   * Marks the approval request as COMPLETED after the protected action executes.
   */
  async completeApproval(input: CompleteApprovalApiInput): Promise<CompleteApprovalApiResponse> {
    const res = await apiFetch<CompleteApprovalApiResponse>('/api/approval/complete', { method: 'POST', body: input });
    if (res.error || !res.data) {
      return { success: false, error: res.error ?? 'Unable to update the approval status.' };
    }
    return res.data;
  },
};
