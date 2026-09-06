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
  type AuthenticatedCaller,
} from '../../src/lib/server/api-auth';
import { getApprovalRequestByUuid, updateApprovalRequest } from '../../src/lib/approval/approval-service';
import { hashApprovalCode } from '../../src/lib/approval/approval.hash';
import type { ApprovalRequestRecord } from '../../src/lib/approval/approval.types';

const MAX_ATTEMPTS = 5;

/** Branch-bound staff may only touch requests raised in their own branch. */
export function canAccessRequest(caller: AuthenticatedCaller, record: ApprovalRequestRecord): boolean {
  return caller.isTenantWide || record.branch_id === caller.branchId;
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
    const requestId = readString(body.requestId);
    const approvalCode = readString(body.approvalCode);

    if (!requestId || !approvalCode) {
      sendJson(res, 400, { error: 'Missing required fields (requestId, approvalCode).' });
      return;
    }
    if (!/^\d{6}$/.test(approvalCode)) {
      sendJson(res, 200, { success: false, error: 'The approval code must be 6 digits.' });
      return;
    }

    const allowed = await rateLimit(caller.db, `approval:verify:${requestId}:${getClientIp(req)}`, 10, 60);
    if (!allowed) {
      sendJson(res, 429, { success: false, error: 'Too many attempts. Please wait a minute.' });
      return;
    }

    // 1. Load request (tenant-scoped, RLS enforced)
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

    // 2. Terminal states
    if (record.status === 'APPROVED' || record.status === 'COMPLETED') {
      sendJson(res, 200, { success: true });
      return;
    }
    if (record.status === 'FAILED') {
      sendJson(res, 200, { success: false, attemptsRemaining: 0, error: 'Maximum attempts exceeded for this request.' });
      return;
    }

    // 3. Expiry
    if (Date.now() > new Date(record.expires_at).getTime() || record.status === 'EXPIRED') {
      void updateApprovalRequest(caller.db, caller.tenantId, requestId, { status: 'EXPIRED' });
      sendJson(res, 200, { success: false, isExpired: true, error: 'Approval code has expired (valid for 5 minutes).' });
      return;
    }

    // 4. Attempt cap
    if (record.attempts >= MAX_ATTEMPTS) {
      void updateApprovalRequest(caller.db, caller.tenantId, requestId, { status: 'FAILED' });
      sendJson(res, 200, { success: false, attemptsRemaining: 0, error: 'Maximum verification attempts exceeded (5/5).' });
      return;
    }

    // 5. Compare hashes
    const isMatch = hashApprovalCode(approvalCode) === record.approval_code_hash;
    if (isMatch) {
      const nowIso = new Date().toISOString();
      await updateApprovalRequest(caller.db, caller.tenantId, requestId, {
        status: 'APPROVED',
        verified_at: nowIso,
        code_verified_at: nowIso,
        approved_by_email: record.approval_email || null,
      });
      sendJson(res, 200, { success: true });
      return;
    }

    const nextAttempts = record.attempts + 1;
    const isFailed = nextAttempts >= MAX_ATTEMPTS;
    await updateApprovalRequest(caller.db, caller.tenantId, requestId, {
      attempts: nextAttempts,
      status: isFailed ? 'FAILED' : 'PENDING',
    });

    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - nextAttempts);
    sendJson(res, 200, {
      success: false,
      attemptsRemaining,
      error: isFailed
        ? 'Incorrect code. Maximum attempts exceeded (5/5).'
        : `Incorrect approval code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`,
    });
  } catch (err) {
    console.error('[API /verify] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { success: false, error: 'Internal Server Error' });
  }
}
