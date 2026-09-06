import {
  applyCors,
  authenticate,
  forbidden,
  methodNotAllowed,
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
  upsertBranchApprovalSettings,
} from '../../src/lib/approval/approval-service';

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function readBranchParam(req: ApiRequest): unknown {
  const fromQuery = req.query?.branchId;
  if (typeof fromQuery === 'string') return fromQuery;
  if (Array.isArray(fromQuery)) return fromQuery[0];
  return new URL(req.url || '', 'http://localhost').searchParams.get('branchId') ?? undefined;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (applyCors(req, res, 'GET,POST')) return;

  const caller = await authenticate(req);
  if (!caller) {
    unauthorized(res);
    return;
  }

  try {
    if (req.method === 'GET') {
      const branchId = await resolveBranchId(caller, readBranchParam(req));
      if (!branchId) {
        forbidden(res, 'You cannot view settings for that branch.');
        return;
      }
      const result = await getBranchApprovalSettings(caller.db, caller.tenantId, branchId);
      if (result.error) {
        sendJson(res, 500, { error: result.error });
        return;
      }
      sendJson(res, 200, {
        data: result.data ?? { tenant_id: caller.tenantId, branch_id: branchId, approval_email: '', enabled: false },
      });
      return;
    }

    if (req.method === 'POST') {
      if (!caller.isManager) {
        forbidden(res, 'Only owners, admins and managers can change approval policies.');
        return;
      }

      const body = readJsonBody(req);
      const branchId = await resolveBranchId(caller, body.branchId);
      if (!branchId) {
        forbidden(res, 'You cannot change settings for that branch.');
        return;
      }

      const approvalEmail = readString(body.approvalEmail) ?? '';
      const enabled = body.enabled === true;
      if (enabled && !EMAIL_RE.test(approvalEmail)) {
        sendJson(res, 400, { error: 'A valid approval email is required when approvals are enabled.' });
        return;
      }

      const policies =
        body.policies && typeof body.policies === 'object'
          ? Object.fromEntries(
              Object.entries(body.policies as Record<string, unknown>).map(([k, v]) => [k, v === true])
            )
          : null;

      const result = await upsertBranchApprovalSettings(
        caller.db,
        caller.tenantId,
        branchId,
        approvalEmail,
        enabled,
        policies,
        caller.name
      );
      if (result.error) {
        sendJson(res, 500, { error: result.error });
        return;
      }
      sendJson(res, 200, { data: result.data });
      return;
    }

    methodNotAllowed(res);
  } catch (err) {
    console.error('[API /settings] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
