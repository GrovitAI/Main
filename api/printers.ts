import { Buffer } from 'buffer';

function encodeBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const c1 = str.charCodeAt(i++);
    const c2 = i < str.length ? str.charCodeAt(i++) : NaN;
    const c3 = i < str.length ? str.charCodeAt(i++) : NaN;

    const byte1 = c1 >> 2;
    const byte2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
    const byte3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6);
    const byte4 = isNaN(c3) ? 64 : c3 & 63;

    result += chars.charAt(byte1) + chars.charAt(byte2) +
              (byte3 === 64 ? '=' : chars.charAt(byte3)) +
              (byte4 === 64 ? '=' : chars.charAt(byte4));
  }
  return result;
}

export default async function handler(req: any, res: any) {
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

  console.log('[API] Request received: GET /api/printers');
  const rawApiKey = process.env.PRINTNODE_API_KEY || process.env.EXPO_PUBLIC_PRINTNODE_API_KEY || '';
  console.log('[API] Raw API key exists:', !!rawApiKey);
  console.log('[API] Raw API key length:', rawApiKey.length);
  console.log('[API] Raw API key char codes:', [...rawApiKey].map(c => c.charCodeAt(0)));

  const apiKey = rawApiKey.trim();
  console.log('[API] Trimmed API key length:', apiKey.length);
  console.log('[API] Trimmed API key char codes:', [...apiKey].map(c => c.charCodeAt(0)));

  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'PrintNode API key is not configured.' }));
    return;
  }

  const printerId = req.query?.id || new URL(req.url || '', 'http://localhost').searchParams.get('id');

  const rawBase64 = Buffer.from(`${apiKey}:`, 'utf8').toString('base64');
  const customBase64 = encodeBase64(apiKey + ':');

  console.log('[API] Buffer Base64:', rawBase64);
  console.log('[API] Custom Base64:', customBase64);
  console.log('[API] Encoder Match:', rawBase64 === customBase64);

  const authHeader = `Basic ${rawBase64}`;
  console.log('[API] Authorization header prefix:', 'Basic ' + rawBase64.substring(0, 15) + '...');

  const targetUrl = printerId 
    ? `https://api.printnode.com/printers/${printerId}` 
    : 'https://api.printnode.com/printers';

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    console.log('[API] PrintNode response status:', response.status);

    if (!response.ok) {
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `PrintNode API returned status ${response.status}` }));
      return;
    }

    const data = await response.json();
    console.log('[API] Response sent successfully');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}
