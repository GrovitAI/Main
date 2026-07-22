import { upsertBranchApprovalSettings, createApprovalRequest } from '../src/lib/approval/approval-service';
import { sendApprovalEmail } from '../src/lib/approval/approval.email';
import { hashApprovalCode, generateApprovalCode } from '../src/lib/approval/approval.hash';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const tenantId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const branchId = 'bbbbbbbb-0000-0000-0000-000000000001';
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const targetEmail = body.toEmail || req.query?.toEmail || 'sinanlegend287@gmail.com';

    const mode = req.query?.mode || body.mode || 'request';
    const requestId = req.query?.requestId || body.requestId;
    const code = req.query?.code || body.code || body.approvalCode;

    // Mode: Verify
    if (mode === 'verify') {
      if (!requestId || !code) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing requestId or code query parameter. Example: ?mode=verify&requestId=UUID&code=123456' }));
        return;
      }

      const verifyRes = await fetch(`http://${req.headers.host || 'localhost:3000'}/api/approval/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, branchId, requestId, approvalCode: code }),
      });
      const verifyData = await verifyRes.json();
      res.statusCode = verifyRes.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ step: 'Step 7: Verify Code', result: verifyData }));
      return;
    }

    // Mode: Complete
    if (mode === 'complete') {
      if (!requestId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing requestId query parameter. Example: ?mode=complete&requestId=UUID' }));
        return;
      }

      const completeRes = await fetch(`http://${req.headers.host || 'localhost:3000'}/api/approval/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, branchId, requestId }),
      });
      const completeData = await completeRes.json();
      res.statusCode = completeRes.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ step: 'Step 8: Complete Action', result: completeData }));
      return;
    }

    // Step 1: Configure branch approval settings
    await upsertBranchApprovalSettings(tenantId, branchId, targetEmail, true, 'Test Admin');

    // Step 2: Request Approval
    const approvalCode = generateApprovalCode();
    const approvalCodeHash = hashApprovalCode(approvalCode);
    const requestUuid = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const createRes = await createApprovalRequest({
      tenant_id: tenantId,
      branch_id: branchId,
      request_uuid: requestUuid,
      action: 'REPRINT_BILL' as any,
      resource_type: 'bill' as any,
      resource_id: 'INV-TEST-999',
      requested_by: 'Test Cashier',
      cashier_name: 'Test Cashier',
      branch_name: 'Anna Nagar',
      approval_email: targetEmail,
      reason: 'Testing complete approval workflow (Reprint Bill)',
      approval_code_hash: approvalCodeHash,
      attempts: 0,
      expires_at: expiresAt,
      status: 'PENDING' as any,
    });

    if (createRes.error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: createRes.error }));
      return;
    }

    // Step 3: Dispatch Email
    const emailResult = await sendApprovalEmail({
      toEmail: targetEmail,
      restaurantName: 'Le Laban',
      branchName: 'Anna Nagar',
      actionLabel: 'Reprint Bill',
      cashierName: 'Test Cashier',
      reason: 'Testing complete approval workflow (Reprint Bill)',
      approvalCode,
      requestId: requestUuid,
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        message: `Approval request created and email dispatched to ${targetEmail}`,
        requestUuid,
        generatedApprovalCodeForTesting: approvalCode,
        expiresAt,
        emailResult,
        browserTestingLinks: {
          verifyLink: `https://${req.headers.host || 'leleban.grovitai.com'}/api/test-approval-flow?mode=verify&requestId=${requestUuid}&code=${approvalCode}`,
          completeLink: `https://${req.headers.host || 'leleban.grovitai.com'}/api/test-approval-flow?mode=complete&requestId=${requestUuid}`,
        },
      })
    );
  } catch (err: any) {
    console.error('[TestApprovalFlow] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err?.message || String(err) || 'Internal Server Error',
        stack: err?.stack || null,
      })
    );
  }
}
