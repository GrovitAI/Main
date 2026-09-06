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
import { hashApprovalCode } from '../../../src/lib/approval/approval.hash';

const MAX_ATTEMPTS = 5;

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
    const verificationCode = readString(body.verificationCode);

    if (!approvalEmail || !verificationCode) {
      sendJson(res, 400, { error: 'Missing required fields (approvalEmail, verificationCode).' });
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

    const allowed = await rateLimit(caller.db, `approval:verify-email-confirm:${branchId}:${getClientIp(req)}`, 10, 300);
    if (!allowed) {
      sendJson(res, 429, { success: false, error: 'Too many attempts. Please wait a few minutes.' });
      return;
    }

    const { data, error } = await caller.db
      .from('approval_email_verifications')
      .select('*')
      .eq('tenant_id', caller.tenantId)
      .eq('branch_id', branchId)
      .eq('approval_email', approvalEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      sendJson(res, 404, { success: false, error: 'Verification request not found. Please request a new code.' });
      return;
    }

    if (Date.now() > new Date(data.expires_at).getTime()) {
      sendJson(res, 200, { success: false, error: 'Verification code expired. Please request a new code.' });
      return;
    }
    const attempts = Number(data.attempts) || 0;
    if (attempts >= MAX_ATTEMPTS) {
      sendJson(res, 200, { success: false, error: 'Maximum attempts exceeded. Please request a new code.' });
      return;
    }

    if (data.verification_code_hash === hashApprovalCode(verificationCode)) {
      const nowIso = new Date().toISOString();

      await caller.db
        .from('approval_email_verifications')
        .update({ verified_at: nowIso })
        .eq('id', data.id);

      const { error: upsertError } = await caller.db
        .from('branch_approval_settings')
        .upsert(
          {
            tenant_id: caller.tenantId,
            branch_id: branchId,
            approval_email: approvalEmail,
            approval_email_verified: true,
            approval_email_verified_at: nowIso,
            enabled: true,
            updated_at: nowIso,
          },
          { onConflict: 'tenant_id,branch_id' }
        );
      if (upsertError) {
        console.error('[API /verify-email/confirm] settings upsert failed:', upsertError.code, upsertError.message);
        sendJson(res, 500, { success: false, error: 'Email verified but settings could not be saved.' });
        return;
      }

      sendJson(res, 200, { success: true, verifiedAt: nowIso });
      return;
    }

    await caller.db
      .from('approval_email_verifications')
      .update({ attempts: attempts + 1 })
      .eq('id', data.id);

    const remaining = Math.max(0, MAX_ATTEMPTS - (attempts + 1));
    sendJson(res, 200, {
      success: false,
      error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    });
  } catch (err) {
    console.error('[API /verify-email/confirm] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
