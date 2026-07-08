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

export async function POST(request: Request) {
  const apiKey = process.env.PRINTNODE_API_KEY || process.env.EXPO_PUBLIC_PRINTNODE_API_KEY || '';
  console.log('process.env.PRINTNODE_API_KEY:', process.env.PRINTNODE_API_KEY);

  if (!apiKey) {
    return Response.json({ error: 'PrintNode API key is not configured.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { printerId, base64Content } = body;

    if (!printerId || !base64Content) {
      return Response.json({ error: 'Missing printerId or base64Content' }, { status: 400 });
    }

    const authHeader = 'Basic ' + encodeBase64(apiKey + ':');

    const res = await fetch('https://api.printnode.com/printjobs', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerId: Number(printerId),
        title: 'Grovit POS Receipt',
        contentType: 'raw_base64',
        content: base64Content,
        source: 'Grovit POS',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `PrintNode API returned ${res.status}: ${errText}` }, { status: res.status });
    }

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
