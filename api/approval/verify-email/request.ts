import crypto from 'crypto';
import { supabase } from '../../../src/lib/pos/supabase';
import { hashApprovalCode, generateApprovalCode } from '../../../src/lib/approval/approval.hash';
import { sendApprovalEmail } from '../../../src/lib/approval/approval.email';

export default async function handler(req: any, res: any) {
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
    const { tenantId, branchId, approvalEmail, restaurantName, branchName } = body;

    if (!tenantId || !branchId || !approvalEmail) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required fields (tenantId, branchId, approvalEmail).' }));
      return;
    }

    const code = generateApprovalCode();
    const codeHash = hashApprovalCode(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins for email verification

    await supabase.from('approval_email_verifications').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      approval_email: approvalEmail.trim().toLowerCase(),
      verification_code_hash: codeHash,
      attempts: 0,
      expires_at: expiresAt,
    });

    const emailResult = await sendApprovalEmail({
      toEmail: approvalEmail.trim().toLowerCase(),
      restaurantName: restaurantName || 'Le Laban',
      branchName: branchName || 'Anna Nagar',
      actionLabel: 'Verify Approval Email Address',
      cashierName: 'System Administrator',
      reason: 'Owner email verification request for Grovit AI POS Branch Management.',
      approvalCode: code,
    });

    if (!emailResult.success) {
      console.warn('[API /verify-email/request] Email dispatch issue:', emailResult.error);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        message: 'If verification is required, a verification email has been sent.',
        expiresAt,
      })
    );
  } catch (err: any) {
    console.error('[API /verify-email/request] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}
