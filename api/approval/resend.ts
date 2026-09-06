import {
  applyCors,
  authenticate,
  getClientIp,
  methodNotAllowed,
  rateLimit,
  readJsonBody,
  readString,
  sendJson,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../../src/lib/server/api-auth';
import {
  getApprovalRequestByUuid,
  updateApprovalRequest,
  getBranchApprovalSettings,
} from '../../src/lib/approval/approval-service';
import { hashApprovalCode, generateApprovalCode } from '../../src/lib/approval/approval.hash';
import { sendApprovalEmail } from '../../src/lib/approval/approval.email';
import { getActionLabel } from './request';
import { canAccessRequest } from './verify';

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_RESENDS = 3;

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
    const requestId = readString(body.requestId);
    const restaurantName = readString(body.restaurantName) ?? 'Grovit POS';
    const branchNameOverride = readString(body.branchName);

    if (!requestId) {
      sendJson(res, 400, { error: 'Missing required parameter (requestId).' });
      return;
    }

    const allowed = await rateLimit(caller.db, `approval:resend:${requestId}:${getClientIp(req)}`, 5, 300);
    if (!allowed) {
      sendJson(res, 429, { success: false, error: 'Too many resend attempts. Please wait.' });
      return;
    }

    const requestRes = await getApprovalRequestByUuid(caller.db, caller.tenantId, requestId);
    if (requestRes.error || !requestRes.data) {
      sendJson(res, 404, { success: false, error: 'Approval request not found.' });
      return;
    }
    const record = requestRes.data;
    if (!canAccessRequest(caller, record)) {
      sendJson(res, 403, { success: false, error: 'This approval belongs to another branch.' });
      return;
    }
    if (record.status !== 'PENDING') {
      sendJson(res, 200, { success: false, error: 'This approval request is no longer pending.' });
      return;
    }

    // Resend cap per request (attempts are NOT reset — a resend is not a fresh budget).
    const resendCount = Number((record as { resend_count?: number }).resend_count ?? 0);
    if (resendCount >= MAX_RESENDS) {
      sendJson(res, 429, { success: false, error: 'Resend limit reached for this request. Ask the manager for the last code or start a new request after it expires.' });
      return;
    }

    // Cooldown measured from the last time a code was issued (expires_at - TTL),
    // so failed verification attempts do not reset the clock.
    const lastIssuedAt = new Date(record.expires_at).getTime() - CODE_TTL_MS;
    const elapsed = Date.now() - lastIssuedAt;
    if (elapsed < RESEND_COOLDOWN_MS) {
      const waitRemaining = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      sendJson(res, 429, { success: false, error: `Please wait ${waitRemaining} second${waitRemaining === 1 ? '' : 's'} before resending the code.` });
      return;
    }

    const settingsRes = await getBranchApprovalSettings(caller.db, caller.tenantId, record.branch_id);
    const settings = settingsRes.data;
    if (!settings || !settings.approval_email) {
      sendJson(res, 400, { success: false, error: 'Branch approval email is not configured.' });
      return;
    }

    const newCode = generateApprovalCode();
    const newExpiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const updateRes = await updateApprovalRequest(caller.db, caller.tenantId, requestId, {
      approval_code_hash: hashApprovalCode(newCode),
      expires_at: newExpiresAt,
      resend_count: resendCount + 1,
      status: 'PENDING',
    });
    if (updateRes.error) {
      sendJson(res, 500, { success: false, error: updateRes.error });
      return;
    }

    const emailResult = await sendApprovalEmail({
      toEmail: settings.approval_email,
      restaurantName,
      branchName: branchNameOverride ?? record.branch_name ?? 'Branch',
      actionLabel: getActionLabel(record.action),
      cashierName: record.requested_by,
      reason: record.reason,
      approvalCode: newCode,
      requestId,
    });
    if (!emailResult.success) {
      console.warn('[API /resend] Email send failed.');
    }

    sendJson(res, 200, { success: true, expiresAt: newExpiresAt });
  } catch (err) {
    console.error('[API /resend] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { success: false, error: 'Internal Server Error' });
  }
}
