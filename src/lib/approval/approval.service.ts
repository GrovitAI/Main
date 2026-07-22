import type {
  RequestApprovalApiInput,
  RequestApprovalApiResponse,
  VerifyApprovalApiInput,
  VerifyApprovalApiResponse,
  ResendApprovalApiInput,
  ResendApprovalApiResponse,
  CompleteApprovalApiInput,
  CompleteApprovalApiResponse,
} from './approval.types';

// Utility helper to get absolute API base URL depending on window / environment
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
}

export const approvalService = {
  /**
   * Submits a new approval request.
   * If branch approval is disabled, returns { required: false, approved: true }.
   */
  async requestApproval(input: RequestApprovalApiInput): Promise<RequestApprovalApiResponse> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/approval/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          required: true,
          error: errorData.error || `Server returned error status ${response.status}`,
        };
      }

      return await response.json();
    } catch (err: any) {
      console.error('[approvalService.requestApproval] Failed:', err);
      return { required: true, error: err.message || 'Network error requesting approval.' };
    }
  },

  /**
   * Verifies the 6-digit approval code entered by the cashier.
   */
  async verifyApproval(input: VerifyApprovalApiInput): Promise<VerifyApprovalApiResponse> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/approval/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `Verification failed with status ${response.status}`,
        };
      }

      return await response.json();
    } catch (err: any) {
      console.error('[approvalService.verifyApproval] Failed:', err);
      return { success: false, error: err.message || 'Network error verifying approval code.' };
    }
  },

  /**
   * Resends the approval code for an active pending request.
   */
  async resendApproval(input: ResendApprovalApiInput): Promise<ResendApprovalApiResponse> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/approval/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `Resend failed with status ${response.status}`,
        };
      }

      return await response.json();
    } catch (err: any) {
      console.error('[approvalService.resendApproval] Failed:', err);
      return { success: false, error: err.message || 'Network error resending approval code.' };
    }
  },

  /**
   * Marks the approval request as COMPLETED after the protected action executes.
   */
  async completeApproval(input: CompleteApprovalApiInput): Promise<CompleteApprovalApiResponse> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/approval/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || `Completion failed with status ${response.status}`,
        };
      }

      return await response.json();
    } catch (err: any) {
      console.error('[approvalService.completeApproval] Failed:', err);
      return { success: false, error: err.message || 'Network error updating approval status.' };
    }
  },
};
