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

export async function GET(request: Request) {
  const apiKey = process.env.PRINTNODE_API_KEY || process.env.EXPO_PUBLIC_PRINTNODE_API_KEY || '';
  console.log('process.env.PRINTNODE_API_KEY:', process.env.PRINTNODE_API_KEY);

  if (!apiKey) {
    return Response.json({ error: 'PrintNode API key is not configured.' }, { status: 500 });
  }

  // Parse ID from query params if querying a single printer
  const urlObj = new URL(request.url);
  const printerId = urlObj.searchParams.get('id');

  const authHeader = 'Basic ' + encodeBase64(apiKey + ':');
  const targetUrl = printerId 
    ? `https://api.printnode.com/printers/${printerId}` 
    : 'https://api.printnode.com/printers';

  try {
    const res = await fetch(targetUrl, {
      headers: { 'Authorization': authHeader }
    });

    if (!res.ok) {
      return Response.json({ error: `PrintNode API returned status ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err: any) {
    return Response.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
