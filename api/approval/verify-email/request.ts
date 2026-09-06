import {
  applyCors,
  authenticate,
  forbidden,
  getClientIp,
  isUuid,
  methodNotAllowed,
  rateLimit,
  readJsonBody,
  readString,
  resolveBranchId,
  sendJson,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../../../src/lib/server/api-auth';
import { hashApprovalCode, generateApprovalCode } from '../../../src/lib/approval/approval.hash';
import { sendApprovalEmail } from '../../../src/lib/approval/approval.email';

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

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
  if (!caller.isManager) {
    forbidden(res, 'Only owners, admins and managers can verify approval emails.');
    return;
  }

  try {
    const body = readJsonBody(req);
    const approvalEmail = readString(body.approvalEmail)?.toLowerCase() ?? null;
    const restaurantName = readString(body.restaurantName) ?? 'Grovit POS';
    const branchName = readString(body.branchName) ?? 'Branch';

    if (!approvalEmail || !EMAIL_RE.test(approvalEmail)) {
      sendJson(res, 400, { error: 'A valid approval email is required.' });
      return;
    }
    if (!isUuid(body.branchId)) {
      sendJson(res, 400, { error: 'Save the branch first, then verify its approval email.' });
      return;
    }
    const branchId = await resolveBranchId(caller, body.branchId);
    if (!branchId) {
      forbidden(res, 'You cannot verify emails for that branch.');
      return;
    }

    const allowed = await rateLimit(caller.db, `approval:verify-email:${branchId}:${getClientIp(req)}`, 5, 900);
    if (!allowed) {
      sendJson(res, 429, { error: 'Too many verification emails requested. Please wait 15 minutes.' });
      return;
    }

    const code = generateApprovalCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertError } = await caller.db.from('approval_email_verifications').insert({
      tenant_id: caller.tenantId,
      branch_id: branchId,
      approval_email: approvalEmail,
      verification_code_hash: hashApprovalCode(code),
      attempts: 0,
      expires_at: expiresAt,
    });
    if (insertError) {
      console.error('[API /verify-email/request] insert failed:', insertError.code, insertError.message);
      sendJson(res, 500, { error: 'Unable to start email verification.' });
      return;
    }

    const emailResult = await sendApprovalEmail({
      toEmail: approvalEmail,
      restaurantName,
      branchName,
      actionLabel: 'Verify Approval Email Address',
      cashierName: caller.name,
      reason: 'Owner email verification request for Grovit AI POS Branch Management.',
      approvalCode: code,
    });
    if (!emailResult.success) {
      console.warn('[API /verify-email/request] Email dispatch issue.');
    }

    sendJson(res, 200, { success: true, message: 'A verification email has been sent.', expiresAt });
  } catch (err) {
    console.error('[API /verify-email/request] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
