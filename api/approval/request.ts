import crypto from 'crypto';
import {
  applyCors,
  authenticate,
  getClientIp,
  methodNotAllowed,
  rateLimit,
  readJsonBody,
  readString,
  resolveBranchId,
  sendJson,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../../src/lib/server/api-auth';
import {
  getBranchApprovalSettings,
  findActivePendingRequest,
  createApprovalRequest,
  updateApprovalRequest,
} from '../../src/lib/approval/approval-service';
import { hashApprovalCode, generateApprovalCode } from '../../src/lib/approval/approval.hash';
import { sendApprovalEmail } from '../../src/lib/approval/approval.email';
import { ApprovalAction } from '../../src/lib/approval/approval.types';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_RESENDS = 3;

const ACTION_LABELS: Record<string, string> = {
  [ApprovalAction.REPRINT_BILL]: 'Reprint Bill',
  [ApprovalAction.CANCEL_BILL]: 'Cancel Bill',
  [ApprovalAction.APPLY_DISCOUNT]: 'Apply Discount',
  [ApprovalAction.COMPLIMENTARY_BILL]: 'Complimentary Bill',
  [ApprovalAction.EDIT_UNPAID_BILL]: 'Edit Unpaid Bill',
  [ApprovalAction.REMOVE_SENT_ITEMS]: 'Remove Sent Kitchen Items',
  [ApprovalAction.VOID_PAYMENT]: 'Void Payment',
  [ApprovalAction.EDIT_CUSTOMER]: 'Edit Customer Details',
  [ApprovalAction.REOPEN_BILL]: 'Reopen Closed Bill',
  [ApprovalAction.DELETE_DRAFT_ORDER]: 'Delete Draft Order',
};

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (applyCors(req, res, 'POST')) return;
  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  const caller = await authenticate(req);
  if (!caller) {
    unauthorized(res);
    return;
  }

  try {
    const body = readJsonBody(req);
    const action = readString(body.action);
    const resourceType = readString(body.resourceType);
    const resourceId = readString(body.resourceId);
    const reason = readString(body.reason);
    const restaurantName = readString(body.restaurantName) ?? 'Grovit POS';
    const branchName = readString(body.branchName) ?? 'Branch';

    if (!action || !resourceType || !resourceId || !reason) {
      sendJson(res, 400, { error: 'Missing required parameters (action, resourceType, resourceId, reason).' });
      return;
    }

    const branchId = await resolveBranchId(caller, body.branchId);
    if (!branchId) {
      sendJson(res, 403, { error: 'You cannot request approvals for that branch.' });
      return;
    }

    const allowed = await rateLimit(caller.db, `approval:request:${branchId}:${getClientIp(req)}`, 30, 600);
    if (!allowed) {
      sendJson(res, 429, { error: 'Too many approval requests. Please wait a few minutes.' });
      return;
    }

    // 1. Branch approval settings
    const settingsRes = await getBranchApprovalSettings(caller.db, caller.tenantId, branchId);
    const settings = settingsRes.data;
    if (!settings || !settings.enabled || !settings.approval_email) {
      sendJson(res, 200, { required: false, approved: true });
      return;
    }

    const actionPolicyEnabled = settings.policies ? settings.policies[action] ?? true : true;
    if (actionPolicyEnabled === false) {
      sendJson(res, 200, { required: false, approved: true });
      return;
    }

    const requestedBy = caller.name;
    const actionLabel = getActionLabel(action);

    // 2. Re-use an active pending request: rotate the code (and persist the new hash).
    const existingRes = await findActivePendingRequest(caller.db, caller.tenantId, branchId, action, resourceType, resourceId);
    if (existingRes.data) {
      const existing = existingRes.data;
      const resendCount = Number((existing as { resend_count?: number }).resend_count ?? 0);
      if (resendCount >= MAX_RESENDS) {
        sendJson(res, 200, {
          required: true,
          requestId: existing.request_uuid,
          expiresAt: existing.expires_at,
          error: 'A code was already sent. Please use it or wait for it to expire.',
        });
        return;
      }

      const freshCode = generateApprovalCode();
      const freshExpiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      const updateRes = await updateApprovalRequest(caller.db, caller.tenantId, existing.request_uuid, {
        approval_code_hash: hashApprovalCode(freshCode),
        expires_at: freshExpiresAt,
        resend_count: resendCount + 1,
      });
      if (updateRes.error) {
        sendJson(res, 500, { error: updateRes.error });
        return;
      }

      const emailResult = await sendApprovalEmail({
        toEmail: settings.approval_email,
        restaurantName,
        branchName,
        actionLabel,
        cashierName: requestedBy,
        reason,
        approvalCode: freshCode,
        requestId: existing.request_uuid,
      });
      if (!emailResult.success) {
        console.warn('[API /request] Email dispatch issue on re-send.');
      }

      sendJson(res, 200, { required: true, requestId: existing.request_uuid, expiresAt: freshExpiresAt });
      return;
    }

    // 3. New approval request
    const approvalCode = generateApprovalCode();
    const requestUuid = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const createRes = await createApprovalRequest(caller.db, {
      tenant_id: caller.tenantId,
      branch_id: branchId,
      request_uuid: requestUuid,
      action: action as ApprovalAction,
      resource_type: resourceType,
      resource_id: resourceId,
      requested_by: requestedBy,
      cashier_id: caller.staffId,
      cashier_name: requestedBy,
      branch_name: branchName,
      approval_email: settings.approval_email,
      reason,
      approval_code_hash: hashApprovalCode(approvalCode),
      attempts: 0,
      expires_at: expiresAt,
      status: 'PENDING',
    });

    if (createRes.error || !createRes.data) {
      sendJson(res, 500, { error: createRes.error ?? 'Failed to record approval request.' });
      return;
    }

    // 4. Email the code
    const emailResult = await sendApprovalEmail({
      toEmail: settings.approval_email,
      restaurantName,
      branchName,
      actionLabel,
      cashierName: requestedBy,
      reason,
      approvalCode,
      requestId: requestUuid,
    });
    if (!emailResult.success) {
      console.warn('[API /request] Email dispatch issue.');
    }

    sendJson(res, 200, { required: true, requestId: requestUuid, expiresAt });
  } catch (err) {
    console.error('[API /request] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
