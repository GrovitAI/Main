import { sendApprovalEmail } from '../src/lib/approval/approval.email';

export default async function handler(req: any, res: any) {
  // CORS
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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const queryEmail = req.query?.toEmail;
    const targetEmail = body.toEmail || queryEmail || process.env.SMTP_USER || 'security@grovitai.com';

    console.log(`[TestEmail] Attempting to send test email to: ${targetEmail}`);

    const result = await sendApprovalEmail({
      toEmail: targetEmail,
      restaurantName: 'Le Laban (Test)',
      branchName: 'Anna Nagar',
      actionLabel: 'Test SMTP Configuration',
      cashierName: 'Test Admin',
      reason: 'Verifying Vercel -> Google Workspace SMTP email dispatch.',
      approvalCode: '123456',
      requestId: 'TEST-SMTP-001',
    });

    if (result.success) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          message: `Test email sent successfully to ${targetEmail}`,
        })
      );
    } else {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: result.error || 'SMTP dispatch failed.',
        })
      );
    }
  } catch (err: any) {
    console.error('[TestEmail] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'Internal Server Error',
      })
    );
  }
}
