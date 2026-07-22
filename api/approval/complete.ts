import { updateApprovalRequest, getApprovalRequestByUuid } from '../../src/lib/approval/approval-service';

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
    const { requestId, tenantId, branchId } = body;

    if (!requestId || !tenantId || !branchId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing required parameters (requestId, tenantId, branchId).' }));
      return;
    }

    const existing = await getApprovalRequestByUuid(tenantId, branchId, requestId);
    if (existing.data && existing.data.status === 'COMPLETED') {
      console.log(`[Approval Request ${requestId}] Already marked COMPLETED (idempotent call).`);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, alreadyCompleted: true }));
      return;
    }

    const updateRes = await updateApprovalRequest(tenantId, branchId, requestId, {
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    });

    if (updateRes.error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: updateRes.error }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (err: any) {
    console.error('[API /complete] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message || 'Internal Server Error' }));
  }
}
