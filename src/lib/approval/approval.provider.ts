import { sendApprovalEmail } from './approval.email';

export interface ApprovalProviderInput {
  requestId?: string;
  toEmail: string;
  restaurantName: string;
  branchName: string;
  actionLabel: string;
  cashierName: string;
  reason: string;
  approvalCode: string;
}

export interface ApprovalProviderResult {
  success: boolean;
  error?: string;
}

/**
 * Generic ApprovalProvider interface for pluggable approval channels
 * (e.g. EmailApprovalProvider, WhatsAppApprovalProvider, TotpApprovalProvider).
 */
export interface ApprovalProvider {
  name: string;
  sendApprovalCode(input: ApprovalProviderInput): Promise<ApprovalProviderResult>;
}

/**
 * Google Workspace SMTP Email Approval Provider implementation.
 */
export class EmailApprovalProvider implements ApprovalProvider {
  name = 'Email';

  async sendApprovalCode(input: ApprovalProviderInput): Promise<ApprovalProviderResult> {
    return await sendApprovalEmail({
      toEmail: input.toEmail,
      restaurantName: input.restaurantName,
      branchName: input.branchName,
      actionLabel: input.actionLabel,
      cashierName: input.cashierName,
      reason: input.reason,
      approvalCode: input.approvalCode,
      requestId: input.requestId,
    });
  }
}

// Default provider instance
export const defaultApprovalProvider: ApprovalProvider = new EmailApprovalProvider();
