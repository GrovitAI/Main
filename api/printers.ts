import { Buffer } from 'buffer';

type ApiRequest = {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
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
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
  const targetUrl = printerId
    ? `https://api.printnode.com/printers/${printerId}`
    : 'https://api.printnode.com/printers';

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
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
