import { Buffer } from 'buffer';
import {
  applyCors,
  authenticate,
  forbidden,
  methodNotAllowed,
  rateLimit,
  readJsonBody,
  sendJson,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../src/lib/server/api-auth';

const MAX_CONTENT_CHARS = 512 * 1024; // 512 KB of Base64 (~384 KB raw) per receipt

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (applyCors(req, res, 'POST')) return;
  if (req.method !== 'POST') {
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
    console.error('[API] /api/printjobs: PrintNode API key is not configured.');
    sendJson(res, 500, { error: 'PrintNode API key is not configured.' });
    return;
  }

  try {
    const { printerId, base64Content } = readJsonBody(req);
    const numericPrinterId = Number(printerId);

    if (!Number.isInteger(numericPrinterId) || numericPrinterId <= 0 || typeof base64Content !== 'string' || base64Content.length === 0) {
      sendJson(res, 400, { error: 'Missing or invalid printerId or base64Content' });
      return;
    }
    if (base64Content.length > MAX_CONTENT_CHARS || !/^[A-Za-z0-9+/=\r\n]+$/.test(base64Content)) {
      sendJson(res, 400, { error: 'Print payload is too large or not valid Base64.' });
      return;
    }

    // The two checks are independent, and a cashier is waiting on the paper,
    // so they run side by side instead of one after the other.
    // The printer must be registered to the caller's branch (RLS scopes this lookup).
    // For PrintNode printers the numeric PrintNode id is stored in printers.ip_address.
    const [allowed, { data: printer }] = await Promise.all([
      rateLimit(caller.db, `printjobs:${caller.branchId}`, 120, 60),
      caller.db
        .from('printers')
        .select('id')
        .eq('tenant_id', caller.tenantId)
        .eq('connection', 'printnode')
        .eq('ip_address', String(numericPrinterId))
        .limit(1)
        .maybeSingle(),
    ]);
    if (!allowed) {
      sendJson(res, 429, { error: 'Too many print jobs. Please wait a moment.' });
      return;
    }
    if (!printer) {
      forbidden(res, 'That printer is not registered to your branch.');
      return;
    }

    const authHeader = `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
    const response = await fetch('https://api.printnode.com/printjobs', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        printerId: numericPrinterId,
        title: 'Grovit POS Receipt',
        contentType: 'raw_base64',
        content: base64Content,
        source: 'Grovit POS',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[API] /api/printjobs: PrintNode responded', response.status, errText.slice(0, 300));
      sendJson(res, response.status, { error: `PrintNode API returned status ${response.status}` });
      return;
    }

    sendJson(res, 200, { success: true });
  } catch (err) {
    console.error('[API] /api/printjobs: unexpected error', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
