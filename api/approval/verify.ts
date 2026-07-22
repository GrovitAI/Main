import {
  getApprovalRequestByUuid,
  updateApprovalRequest,
} from '../../src/lib/approval/approval-service';
import { hashApprovalCode } from '../../src/lib/approval/approval.hash';

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { requestId, approvalCode, tenantId, branchId } = body;

    if (!requestId || !approvalCode || !tenantId || !branchId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required fields (requestId, approvalCode, tenantId, branchId).' }));
      return;
    }

    // 1. Fetch request from database
    const requestRes = await getApprovalRequestByUuid(tenantId, branchId, requestId);
    if (requestRes.error || !requestRes.data) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Approval request not found.' }));
      return;
    }

    const record = requestRes.data;

    // 2. Status check
    if (record.status === 'APPROVED' || record.status === 'COMPLETED') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (record.status === 'FAILED') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, attemptsRemaining: 0, error: 'Maximum attempts exceeded for this request.' }));
      return;
    }

    // 3. Expiry check
    const now = new Date();
    const expiry = new Date(record.expires_at);
    if (now > expiry || record.status === 'EXPIRED') {
      void updateApprovalRequest(tenantId, branchId, requestId, { status: 'EXPIRED' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, isExpired: true, error: 'Approval code has expired (valid for 5 minutes).' }));
      return;
    }

    // 4. Rate-limit / attempts check
    if (record.attempts >= 5) {
      void updateApprovalRequest(tenantId, branchId, requestId, { status: 'FAILED' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, attemptsRemaining: 0, error: 'Maximum verification attempts exceeded (5/5).' }));
      return;
    }

    // 5. Compare SHA-256 hash
    const inputHash = hashApprovalCode(approvalCode);
    const isMatch = inputHash === record.approval_code_hash;

    if (isMatch) {
      // Success! Update status to APPROVED
      await updateApprovalRequest(tenantId, branchId, requestId, {
        status: 'APPROVED',
        verified_at: new Date().toISOString(),
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    } else {
      // Failed attempt: increment attempt counter
      const nextAttempts = record.attempts + 1;
      const isFailed = nextAttempts >= 5;
      const nextStatus = isFailed ? 'FAILED' : 'PENDING';

      await updateApprovalRequest(tenantId, branchId, requestId, {
        attempts: nextAttempts,
        status: nextStatus,
      });

      const attemptsRemaining = Math.max(0, 5 - nextAttempts);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          attemptsRemaining,
          error: isFailed
            ? 'Incorrect code. Maximum attempts exceeded (5/5).'
            : `Incorrect approval code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`,
        })
      );
    }
  } catch (err: any) {
    console.error('[API /verify] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Internal Server Error' }));
  }
}
