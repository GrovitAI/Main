import { Buffer } from 'buffer';

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

type PrintJobBody = {
  printerId?: unknown;
  base64Content?: unknown;
};

function sendJson(res: ApiResponse, status: number, payload: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readBody(body: unknown): PrintJobBody {
  if (body && typeof body === 'object') {
    return body as PrintJobBody;
  }
  if (typeof body === 'string' && body.length > 0) {
    try {
      const parsed: unknown = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? (parsed as PrintJobBody) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Enable CORS
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
    sendJson(res, 405, { error: 'Method Not Allowed' });
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
    const { printerId, base64Content } = readBody(req.body);
    const numericPrinterId = Number(printerId);

    if (!Number.isInteger(numericPrinterId) || numericPrinterId <= 0 || typeof base64Content !== 'string' || base64Content.length === 0) {
      sendJson(res, 400, { error: 'Missing or invalid printerId or base64Content' });
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
