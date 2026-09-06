import { Buffer } from 'buffer';
import {
  applyCors,
  authenticate,
  forbidden,
  methodNotAllowed,
  sendJson,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../src/lib/server/api-auth';

function readPrinterId(req: ApiRequest): string | null {
  const fromQuery = req.query?.id;
  const raw = Array.isArray(fromQuery)
    ? fromQuery[0]
    : fromQuery ?? new URL(req.url || '', 'http://localhost').searchParams.get('id');
  if (!raw) return null;
  // PrintNode printer ids are numeric; reject anything else so the id can never alter the URL path.
  return /^\d+$/.test(raw) ? raw : null;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (applyCors(req, res, 'GET')) return;
  if (req.method !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const caller = await authenticate(req);
  if (!caller) {
    unauthorized(res);
    return;
  }

  // Never log the key, its length, its bytes, or any header derived from it.
  const apiKey = (process.env.PRINTNODE_API_KEY || process.env.EXPO_PUBLIC_PRINTNODE_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[API] /api/printers: PrintNode API key is not configured.');
    sendJson(res, 500, { error: 'PrintNode API key is not configured.' });
    return;
  }

  const printerId = readPrinterId(req);

  if (printerId) {
    // Status check for one printer: it must be registered to the caller's tenant/branch.
    const { data: printer } = await caller.db
      .from('printers')
      .select('id')
      .eq('tenant_id', caller.tenantId)
      .eq('connection', 'printnode')
      .eq('ip_address', printerId)
      .limit(1)
      .maybeSingle();
    if (!printer) {
      forbidden(res, 'That printer is not registered to your branch.');
      return;
    }
  } else if (!caller.isManager) {
    // Listing every printer on the PrintNode account is a setup task.
    forbidden(res, 'Only owners, admins and managers can list account printers.');
    return;
  }

  const authHeader = `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
  const targetUrl = printerId
    ? `https://api.printnode.com/printers/${printerId}`
    : 'https://api.printnode.com/printers';

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error('[API] /api/printers: PrintNode responded', response.status);
      sendJson(res, response.status, { error: `PrintNode API returned status ${response.status}` });
      return;
    }

    const data: unknown = await response.json();
    sendJson(res, 200, data);
  } catch (err) {
    console.error('[API] /api/printers: unexpected error', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
