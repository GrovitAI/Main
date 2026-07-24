import {
  getBranchApprovalSettings,
  upsertBranchApprovalSettings,
} from '../../src/lib/approval/approval-service';

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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
    if (req.method === 'GET') {
      const urlParams = new URL(req.url || '', 'http://localhost').searchParams;
      const tenantId = req.query?.tenantId || urlParams.get('tenantId');
      const branchId = req.query?.branchId || urlParams.get('branchId');

      if (!tenantId || !branchId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing tenantId or branchId' }));
        return;
      }

      const result = await getBranchApprovalSettings(tenantId, branchId);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: result.data || { tenant_id: tenantId, branch_id: branchId, approval_email: '', enabled: false } }));
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const { tenantId, branchId, approvalEmail, enabled, policies, changedBy } = body;

      if (!tenantId || !branchId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing tenantId or branchId' }));
        return;
      }

      const result = await upsertBranchApprovalSettings(
        tenantId,
        branchId,
        approvalEmail || '',
        enabled ?? false,
        policies ?? null,
        changedBy || 'Owner'
      );
      if (result.error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ data: result.data }));
      return;
    }

    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err: any) {
    console.error('[API /settings] Exception:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}
