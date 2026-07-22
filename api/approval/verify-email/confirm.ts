import { supabase } from '../../../src/lib/pos/supabase';
import { hashApprovalCode } from '../../../src/lib/approval/approval.hash';

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
    const { tenantId, branchId, approvalEmail, verificationCode } = body;

    if (!tenantId || !branchId || !approvalEmail || !verificationCode) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required fields (tenantId, branchId, approvalEmail, verificationCode).' }));
      return;
    }

    const cleanEmail = approvalEmail.trim().toLowerCase();
    const codeHash = hashApprovalCode(verificationCode.trim());

    // Fetch latest verification record
    const { data, error } = await supabase
      .from('approval_email_verifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('approval_email', cleanEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Verification request not found. Please request a new code.' }));
      return;
    }

    const now = new Date();
    const expiry = new Date(data.expires_at);
    if (now > expiry) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Verification code expired. Please request a new code.' }));
      return;
    }

    if (data.attempts >= 5) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'Maximum attempts exceeded. Please request a new code.' }));
      return;
    }

    if (data.verification_code_hash === codeHash) {
      const nowIso = new Date().toISOString();

      // Mark verification record verified
      await supabase
        .from('approval_email_verifications')
        .update({ verified_at: nowIso })
        .eq('id', data.id);

      // Update branch_approval_settings
      await supabase
        .from('branch_approval_settings')
        .upsert(
          {
            tenant_id: tenantId,
            branch_id: branchId,
            approval_email: cleanEmail,
            approval_email_verified: true,
            approval_email_verified_at: nowIso,
            enabled: true,
            updated_at: nowIso,
          },
          { onConflict: 'tenant_id,branch_id' }
        );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, verifiedAt: nowIso }));
    } else {
      await supabase
        .from('approval_email_verifications')
        .update({ attempts: (data.attempts || 0) + 1 })
        .eq('id', data.id);

      const remaining = Math.max(0, 5 - ((data.attempts || 0) + 1));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        })
      );
    }
  } catch (err: any) {
    console.error('[API /verify-email/confirm] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}
