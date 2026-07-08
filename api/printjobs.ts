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

  console.log('[API] Request received: POST /api/printjobs');
  const apiKey = process.env.PRINTNODE_API_KEY || process.env.EXPO_PUBLIC_PRINTNODE_API_KEY || '';
  console.log('[API] API key exists:', !!apiKey);
  console.log('[API] Raw API key length:', apiKey.length);

  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'PrintNode API key is not configured.' }));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const { printerId, base64Content } = req.body;

    if (!printerId || !base64Content) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing printerId or base64Content' }));
      return;
    }

    const rawBase64 = Buffer.from(`${apiKey}:`, 'utf8').toString('base64');
    const customBase64 = encodeBase64(apiKey + ':');

    console.log('[API] Buffer Base64:', rawBase64);
    console.log('[API] Custom Base64:', customBase64);
    console.log('[API] Encoder Match:', rawBase64 === customBase64);

    const authHeader = `Basic ${rawBase64}`;
    console.log('[API] Authorization header prefix:', 'Basic ' + rawBase64.substring(0, 15) + '...');

    const response = await fetch('https://api.printnode.com/printjobs', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        printerId: Number(printerId),
        title: 'Grovit POS Receipt',
        contentType: 'raw_base64',
        content: base64Content,
        source: 'Grovit POS',
      }),
    });

    console.log('[API] PrintNode response status:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `PrintNode API returned ${response.status}: ${errText}` }));
      return;
    }

    console.log('[API] Response sent successfully');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}
