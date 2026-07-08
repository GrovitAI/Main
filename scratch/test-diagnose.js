const fs = require('fs');
const path = require('path');

// Manually setup env vars for the script
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

// Polyfill fetch and global state for React Native elements
global.fetch = fetch;

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// Define Base64 helpers matching printer-service.ts
function encodeBase64(str) {
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

// Diagnose function matching printer-service.ts
async function diagnosePrinterConnection(printer) {
  console.log("diagnosePrinterConnection input:", printer);
  if (printer.connection === 'printnode') {
    const apiKey = process.env.EXPO_PUBLIC_PRINTNODE_API_KEY || '';
    console.log("Using API Key:", apiKey ? "FOUND (starts with " + apiKey.substring(0, 5) + "...)" : "MISSING");
    if (!apiKey || !printer.ip_address) return 'unreachable';
    try {
      const authHeader = 'Basic ' + encodeBase64(apiKey + ':');
      console.log("Auth Header:", authHeader);
      const url = `https://api.printnode.com/printers/${printer.ip_address}`;
      console.log("Fetching url:", url);
      const res = await fetch(url, {
        headers: { 'Authorization': authHeader }
      });
      console.log("HTTP status:", res.status);
      if (!res.ok) {
        const errText = await res.text();
        console.error("HTTP error text:", errText);
        return 'unreachable';
      }
      const data = await res.json();
      console.log("PrintNode Response data:", JSON.stringify(data, null, 2));
      if (Array.isArray(data) && data.length > 0 && data[0].state === 'online') {
        return 'connected';
      }
      return 'unreachable';
    } catch (err) {
      console.error("Fetch threw error:", err);
      return 'unreachable';
    }
  }
  return 'offline';
}

async function isPrintAgentRunning() {
  const tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  const branch_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  
  const { data, error } = await supabase
    .from('printers')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('branch_id', branch_id);

  if (error) {
    console.error("DB select error:", error);
    return false;
  }
  console.log("Printers fetched:", data);
  const defaultBillPrinter = data.find(p => p.is_active && p.is_default && p.printer_role === 'bill');
  console.log("Selected printer:", defaultBillPrinter);
  if (!defaultBillPrinter) {
    console.log("No default bill printer found!");
    return false;
  }
  const status = await diagnosePrinterConnection(defaultBillPrinter);
  console.log("diagnosePrinterConnection returned:", status);
  return status === 'connected';
}

async function run() {
  const result = await isPrintAgentRunning();
  console.log("isPrintAgentRunning result:", result);
}

run();
