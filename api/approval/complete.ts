import {
  applyCors,
  authenticate,
  methodNotAllowed,
  readJsonBody,
  readString,
  sendJson,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../../src/lib/server/api-auth';
import { updateApprovalRequest, getApprovalRequestByUuid } from '../../src/lib/approval/approval-service';
import { canAccessRequest } from './verify';

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
    if (!requestId) {
      sendJson(res, 400, { error: 'Missing required parameter (requestId).' });
      return;
    }

    const existing = await getApprovalRequestByUuid(caller.db, caller.tenantId, requestId);
    if (existing.error || !existing.data) {
      sendJson(res, 404, { success: false, error: 'Approval request not found.' });
      return;
    }
    const record = existing.data;
    if (!canAccessRequest(caller, record)) {
      sendJson(res, 403, { success: false, error: 'This approval belongs to another branch.' });
      return;
    }

    if (record.status === 'COMPLETED') {
      sendJson(res, 200, { success: true, alreadyCompleted: true });
      return;
    }

    // Only a verified (APPROVED) request may be completed; PENDING/FAILED/EXPIRED cannot.
    if (record.status !== 'APPROVED') {
      sendJson(res, 409, { success: false, error: 'This approval has not been verified yet.' });
      return;
    }

    const updateRes = await updateApprovalRequest(caller.db, caller.tenantId, requestId, {
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    });
    if (updateRes.error) {
      sendJson(res, 500, { success: false, error: updateRes.error });
      return;
    }

    sendJson(res, 200, { success: true });
  } catch (err) {
    console.error('[API /complete] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { success: false, error: 'Internal Server Error' });
  }
}
