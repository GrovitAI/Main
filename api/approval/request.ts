import crypto from 'crypto';
import {
  getBranchApprovalSettings,
  findActivePendingRequest,
  createApprovalRequest,
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
    const { tenantId, branchId, action, resourceType, resourceId, requestedBy, reason, restaurantName, branchName } = body;

    if (!tenantId || !branchId || !action || !resourceType || !resourceId || !reason) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required parameters (tenantId, branchId, action, resourceType, resourceId, reason).' }));
      return;
    }

    // 1. Check branch approval settings
    const settingsRes = await getBranchApprovalSettings(tenantId, branchId);
    if (settingsRes.error) {
      console.warn('[API /request] Failed to fetch settings:', settingsRes.error);
    }

    const settings = settingsRes.data;
    if (!settings || !settings.enabled || !settings.approval_email) {
      // Approval is disabled for this branch or email not configured — auto-pass
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ required: false, approved: true }));
      return;
    }

    // 2. Check for active pending request for same action/resource
    const existingRes = await findActivePendingRequest(tenantId, branchId, action, resourceType, resourceId);
    if (existingRes.data) {
      const existing = existingRes.data;
      // Resend a fresh code for the existing request
      const freshCode = generateApprovalCode();
      const freshHash = hashApprovalCode(freshCode);
      const actionLabel = getActionLabel(action);

      await sendApprovalEmail({
        toEmail: settings.approval_email,
        restaurantName: restaurantName || 'Le Laban',
        branchName: branchName || 'Anna Nagar',
        actionLabel,
        cashierName: requestedBy || 'Cashier',
        reason,
        approvalCode: freshCode,
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          required: true,
          requestId: existing.request_uuid,
          expiresAt: existing.expires_at,
        })
      );
      return;
    }

    // 3. Create a new approval request
    const approvalCode = generateApprovalCode();
    const approvalCodeHash = hashApprovalCode(approvalCode);
    const requestUuid = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    const createRes = await createApprovalRequest({
      tenant_id: tenantId,
      branch_id: branchId,
      request_uuid: requestUuid,
      action,
      resource_type: resourceType,
      resource_id: String(resourceId),
      requested_by: requestedBy || 'Cashier',
      reason: reason.trim(),
      approval_code_hash: approvalCodeHash,
      attempts: 0,
      expires_at: expiresAt,
      status: 'PENDING',
    });

    if (createRes.error || !createRes.data) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: createRes.error || 'Failed to record approval request.' }));
      return;
    }

    // 4. Dispatch Email
    const actionLabel = getActionLabel(action);
    const emailResult = await sendApprovalEmail({
      toEmail: settings.approval_email,
      restaurantName: restaurantName || 'Le Laban',
      branchName: branchName || 'Anna Nagar',
      actionLabel,
      cashierName: requestedBy || 'Cashier',
      reason: reason.trim(),
      approvalCode,
    });

    if (!emailResult.success) {
      console.warn('[API /request] Email dispatch issue:', emailResult.error);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        required: true,
        requestId: requestUuid,
        expiresAt,
      })
    );
  } catch (err: any) {
    console.error('[API /request] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}
