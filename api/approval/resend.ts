import {
  getApprovalRequestByUuid,
  updateApprovalRequest,
  getBranchApprovalSettings,
} from '../../src/lib/approval/approval-service';
import { hashApprovalCode, generateApprovalCode } from '../../src/lib/approval/approval.hash';
import { sendApprovalEmail } from '../../src/lib/approval/approval.email';
import { ApprovalAction } from '../../src/lib/approval/approval.types';

function getActionLabel(action: string): string {
  switch (action) {
    case ApprovalAction.REPRINT_BILL:
      return 'Reprint Bill';
    case ApprovalAction.CANCEL_BILL:
      return 'Cancel Bill';
    case ApprovalAction.APPLY_DISCOUNT:
      return 'Apply Discount';
    case ApprovalAction.COMPLIMENTARY_BILL:
      return 'Complimentary Bill';
    default:
      return action;
  }
}

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
    const { requestId, tenantId, branchId, restaurantName, branchName } = body;

    if (!requestId || !tenantId || !branchId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required parameters (requestId, tenantId, branchId).' }));
      return;
    }

    // 1. Fetch approval request
    const requestRes = await getApprovalRequestByUuid(tenantId, branchId, requestId);
    if (requestRes.error || !requestRes.data) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Approval request not found.' }));
      return;
    }

    const record = requestRes.data;

    // 2. Check 30-second rate limiting
    const lastUpdated = new Date(record.updated_at || record.created_at).getTime();
    const elapsedSeconds = (Date.now() - lastUpdated) / 1000;

    if (elapsedSeconds < 30) {
      const waitRemaining = Math.ceil(30 - elapsedSeconds);
      res.statusCode = 429;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: `Please wait ${waitRemaining} second${waitRemaining === 1 ? '' : 's'} before resending code.` }));
      return;
    }

    // 3. Fetch branch settings
    const settingsRes = await getBranchApprovalSettings(tenantId, branchId);
    const settings = settingsRes.data;
    if (!settings || !settings.approval_email) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Branch approval email is not configured.' }));
      return;
    }

    console.log(`[Approval Request ${requestId}] Action: ${record.action}, Resend requested by ${record.requested_by}`);

    // 4. Generate new code & update database record (reset attempts to 0!)
    const newCode = generateApprovalCode();
    const newHash = hashApprovalCode(newCode);
    const newExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await updateApprovalRequest(tenantId, branchId, requestId, {
      approval_code_hash: newHash,
      expires_at: newExpiresAt,
      attempts: 0, // RESET ATTEMPTS BACK TO ZERO
      status: 'PENDING',
    });

    console.log(`[Approval Request ${requestId}] Code hash updated, attempts reset to 0, expiry extended to ${newExpiresAt}`);

    // 5. Send email
    const actionLabel = getActionLabel(record.action);
    const emailResult = await sendApprovalEmail({
      toEmail: settings.approval_email,
      restaurantName: restaurantName || 'Le Laban',
      branchName: branchName || record.branch_name || 'Anna Nagar',
      actionLabel,
      cashierName: record.requested_by,
      reason: record.reason,
      approvalCode: newCode,
    });

    if (!emailResult.success) {
      console.warn(`[Approval Request ${requestId}] Email send failed:`, emailResult.error);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, expiresAt: newExpiresAt }));
  } catch (err: any) {
    console.error(`[API /resend] Exception:`, err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Internal Server Error' }));
  }
}
