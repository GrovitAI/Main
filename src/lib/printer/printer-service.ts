import { Platform, Alert } from 'react-native';
import { fetchPrinters, type Printer } from '../pos/printer-db-service';
import { sendPrintJob, checkAgentHealth } from './print-agent-service';
import { supabase } from '../pos/supabase';

export type PrintNodePrinter = {
  id: number;
  name: string;
  state: string; // 'online' | 'offline'
  default: boolean;
  computer: {
    name: string;
    state: string;
  };
};

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'http://localhost:8081';
};

export async function fetchPrintNodePrinters(): Promise<PrintNodePrinter[]> {
  const response = await fetch(`${getApiBaseUrl()}/api/printers`);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to fetch printers from server: ${response.status}`);
  }
  return await response.json();
}

/**
 * Base64 encoding helper for platforms without Buffer.
 */
export function encodeBase64(str: string): string {
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

export function utf8ToBinaryString(str: string): string {
  return unescape(encodeURIComponent(str));
}

/**
 * Pure JavaScript helper to verify TCP port reachability from browser/client environment.
 */
async function testTcpPort(ip: string, port: number, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // A fetch to http://<ip>:<port> with a short timeout attempts a standard TCP handshake
    await fetch(`http://${ip}:${port}`, {
      signal: controller.signal,
      mode: 'no-cors'
    });
    clearTimeout(id);
    return true;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      return false; // Connection timed out (port closed/printer offline)
    }
    return true; // CORS block or Connection Refused means port is open and handshake started!
  }
}

/**
 * Diagnoses printer connectivity with granular statuses:
 * - 'connected': TCP is open, compatibles found, and active.
 * - 'unreachable': TCP handshake failed on port 9100.
 * - 'missing': Not used, kept for compatibility.
 * - 'offline': Grovit Print Agent application is not running.
 */
export async function diagnosePrinterConnection(
  printer: Omit<Printer, 'id' | 'tenant_id' | 'branch_id'>
): Promise<'connected' | 'unreachable' | 'offline' | 'missing'> {
  if (printer.connection === 'printnode') {
    if (!printer.ip_address) return 'unreachable';
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/printers?id=${printer.ip_address}`);
      if (!res.ok) return 'unreachable';
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].state === 'online') {
        return 'connected';
      }
      return 'unreachable';
    } catch {
      return 'unreachable';
    }
  }

  const agentOnline = await checkAgentHealth();
  if (!agentOnline) {
    return 'offline';
  }

  // Verify TCP Reachability
  if (printer.connection === 'network' && printer.ip_address) {
    const tcpSuccess = await testTcpPort(printer.ip_address, printer.port ?? 9100);
    if (!tcpSuccess) {
      console.warn(`[Printer] TCP socket check failed for ${printer.ip_address}:${printer.port}`);
      return 'unreachable';
    }
  }

  return 'connected';
}

/**
 * Helper to pad strings for clean receipt column alignment.
 */
function padLine(left: string, right: string, width: number): string {
  const spacesNeeded = width - left.length - right.length;
  if (spacesNeeded <= 0) {
    const allowedLeftLength = width - right.length - 2;
    const truncatedLeft = left.substring(0, allowedLeftLength) + '..';
    const finalSpaces = width - truncatedLeft.length - right.length;
    return truncatedLeft + ' '.repeat(Math.max(1, finalSpaces)) + right;
  }
  return left + ' '.repeat(spacesNeeded) + right;
}

function centerTextLocal(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const spaces = Math.floor((width - text.length) / 2);
  return ' '.repeat(spaces) + text + ' '.repeat(width - text.length - spaces);
}

/**
 * Generates formatting layout width based on the paper size.
 */
function getLineWidth(paperWidth: string): number {
  return paperWidth === '58mm' ? 32 : 42;
}

function padLeft(str: string, length: number, char = ' '): string {
  if (str.length >= length) return str;
  return char.repeat(length - str.length) + str;
}

function padRight(str: string, length: number, char = ' '): string {
  if (str.length >= length) return str;
  return str + char.repeat(length - str.length);
}

function center(str: string, length: number, char = ' '): string {
  if (str.length >= length) return str.substring(0, length);
  const spaces = Math.floor((length - str.length) / 2);
  return char.repeat(spaces) + str + char.repeat(length - str.length - spaces);
}

function separator(length: number, char = '-'): string {
  return char.repeat(length);
}

function formatMoney(amount: number): string {
  return 'Rs.' + amount.toFixed(2);
}

function wrapText(text: string, limit: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length <= limit) {
      currentLine += (currentLine === '' ? '' : ' ') + word;
    } else {
      if (currentLine !== '') {
        lines.push(currentLine);
      }
      currentLine = word;
      while (currentLine.length > limit) {
        lines.push(currentLine.substring(0, limit));
        currentLine = currentLine.substring(limit);
      }
    }
  }
  if (currentLine !== '') {
    lines.push(currentLine);
  }
  return lines;
}

function formatItemRow(name: string, qty: number, rate: number, amount: number, totalWidth = 42): string {
  // Name gets full paper width — wraps cleanly if long
  const nameLines = wrapText(name, totalWidth);

  // Detail line: "  2 x 349.00" left  →  "698.00" right
  const detail  = `  ${qty} x ${rate.toFixed(2)}`;
  const amtStr  = amount.toFixed(2);
  const detailLine = padLine(detail, amtStr, totalWidth);

  let result = '';
  for (const line of nameLines) {
    result += line + '\n';
  }
  result += detailLine + '\n';
  result += '\n'; // breathing room between items
  return result;
}

// ─── Receipt configuration ───────────────────────────────────────────────────

/**
 * Set to true once GST registration is obtained.
 * When false: GSTIN, FSSAI, CGST, SGST lines are suppressed.
 */
const SHOW_GST_INFORMATION = false;

function buildHeader(width = 42, branch?: any): string[] {
  // ESC/POS bold only — do NOT use double-width here.
  const boldOn  = '\x1B\x45\x01';
  const boldOff = '\x1B\x45\x00';

  const title = (branch?.name || 'LE LEBAN').toUpperCase();
  const phone = branch?.phone || '90309 13610';
  const gstin = branch?.gstin;

  // Split address by commas or newlines to center each part cleanly on its own line
  const addressRaw = branch?.address || 'No. 13, Balaji Nagar Main Road, Kolathur, Chennai - 600099';
  const addressParts = addressRaw.split(/[,\n]/).map((p: string) => p.trim()).filter(Boolean);

  const lines: string[] = [
    '\x1Ba\x01',   // center alignment
    boldOn + title + boldOff + '\n',
    '\n',
    ...addressParts.map((part: string) => center(part, width) + '\n'),
    '\n',
    center(`PH: ${phone}`, width) + '\n',
  ];

  if (gstin) {
    lines.push(center(`GSTIN: ${gstin}`, width) + '\n');
  }

  lines.push('\n'); // blank line before divider
  lines.push('\x1Ba\x00'); // back to left
  return lines;
}

function buildBillInfo(
  orderName: string,
  invoiceNumber: string | null | undefined,
  width = 42
): string[] {
  const formattedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const billNo = invoiceNumber || 'PENDING';

  // Resolve token display — avoid printing internal status labels
  const internalLabels = ['draft order', 'draft', 'order'];
  const rawToken = (orderName || '').trim();
  const tokenDisplay = (!rawToken || internalLabels.includes(rawToken.toLowerCase()))
    ? '--'
    : rawToken;

  return [
    separator(width) + '\n',
    separator(width) + '\n',
    padLine(`Date: ${formattedDate}`, 'Pick Up', width) + '\n',
    '\n',
    formattedTime + '\n',
    'Cashier: Biller' + '\n',
    `Bill No: ${billNo}` + '\n',
    `Token No: ${tokenDisplay}` + '\n',
    separator(width) + '\n',
  ];
}

function buildItemsHeader(width = 42): string[] {
  // Header mirrors detail line layout: label left, "Amount" right
  const colHeader = padLine('Item', 'Amount', width);
  return [
    separator(width) + '\n',
    colHeader + '\n',
    separator(width) + '\n',
  ];
}

function buildTotals(
  totalQty: number,
  totalAmount: number,
  width = 42
): string[] {
  const lines: string[] = [
    separator(width) + '\n',
    padLine('Total Qty:', String(totalQty), width) + '\n',
  ];

  if (SHOW_GST_INFORMATION) {
    const subtotal = totalAmount / 1.05;
    const cgst = (totalAmount - subtotal) / 2;
    const sgst = cgst;
    lines.push('\n');
    lines.push(padLine('Sub Total', 'Rs. ' + subtotal.toFixed(2), width) + '\n');
    lines.push(padLine('CGST (2.5%)', 'Rs. ' + cgst.toFixed(2), width) + '\n');
    lines.push(padLine('SGST (2.5%)', 'Rs. ' + sgst.toFixed(2), width) + '\n');
  }

  return lines;
}

/**
 * Core raw printing method via Grovit Print Agent.
 */
/**
 * Cloud printing via PrintNode API.
 */
async function printViaPrintNode(printer: Omit<Printer, 'id' | 'tenant_id' | 'branch_id'>, lines: string[]): Promise<void> {
  const printerIdStr = printer.ip_address;
  if (!printerIdStr) {
    Alert.alert('Configuration Error', 'No PrintNode Printer ID configured.');
    return;
  }

  const printerId = parseInt(printerIdStr, 10);
  if (isNaN(printerId)) {
    Alert.alert('Configuration Error', 'Invalid PrintNode Printer ID.');
    return;
  }

  try {
    const escPosString = [
      '\x1B@', // Reset printer
      ...lines,
      '\n\n\n\n', // Feed paper
      '\x1Bi\x01', // ESC/POS Paper Cut
    ].join('');

    const base64Content = encodeBase64(utf8ToBinaryString(escPosString));

    console.log('[Printer] Sending cloud print job via PrintNode to printer:', printerId);
    const response = await fetch(`${getApiBaseUrl()}/api/printjobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerId: printerId,
        base64Content: base64Content,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `PrintNode API returned ${response.status}`);
    }

    console.log('[Printer] PrintNode job submitted successfully.');
  } catch (err: any) {
    console.error('[Printer] PrintNode submission failed:', err);
    Alert.alert('Printing Failed', `PrintNode error: ${err.message}`);
  }
}

/**
 * Core raw printing method via Grovit Print Agent.
 */
async function printRawToPrinter(printer: Printer, lines: string[]): Promise<void> {
  if (printer.connection === 'printnode') {
    await printViaPrintNode(printer, lines);
    return;
  }

  const ip = printer.ip_address || '127.0.0.1';
  const port = printer.port ?? 9100;

  try {
    const escPosString = [
      '\x1B@', // Reset printer
      ...lines,
      '\n\n\n\n', // Feed paper
      '\x1Bi\x01', // ESC/POS Paper Cut
    ].join('');

    console.log('[Printer] Direct network print via Grovit Print Agent', { ip, port });
    await sendPrintJob({
      ip,
      port,
      type: 'raw',
      content: escPosString
    });
    console.log('[Printer] Print success');
  } catch (err: any) {
    console.error('[Printer] Print failed:', err);
    
    // Check if agent is unavailable (network fetch failed)
    const isAgentOffline = err.message === 'Print agent unavailable' || err.name === 'TypeError' || err.message?.toLowerCase().includes('fetch');
    if (isAgentOffline) {
      const errorMsg = 'Printer service offline. Please start Grovit Print Agent.';
      Alert.alert('Printer Offline', errorMsg);
    } else {
      const errorMsg = `Could not reach printer\n${ip}:${port}`;
      Alert.alert('Printer Unreachable', errorMsg);
    }
  }
}

export const printerService = {
  /**
   * Triggers a test print configuration. 
   * Sends small receipt directly via print agent.
   */
  testPrinter: async (printer: Omit<Printer, 'id' | 'tenant_id' | 'branch_id'>): Promise<string> => {
    if (printer.connection === 'printnode') {
      const ip = printer.ip_address || '';
      if (!ip) {
        throw new Error('No PrintNode Printer ID configured.');
      }
      const width = printer.paper_width === '58mm' ? 32 : 42;
      const divider = '-'.repeat(width) + '\n';
      const testReceipt = [
        divider,
        '       GROVIT POS\n\n',
        'Printer Connected via PrintNode \u2713\n\n',
        `Printer ID: ${ip}\n`,
        `Date/Time: ${new Date().toLocaleString()}\n`,
        divider,
      ];
      await printViaPrintNode(printer, testReceipt);
      return 'PrintNode Printer';
    }

    const ip = printer.ip_address || '';
    const port = printer.port ?? 9100;

    if (!ip) {
      throw new Error('No IP address configured for printer.');
    }

    // 1. Verify agent health
    const agentOnline = await checkAgentHealth();
    if (!agentOnline) {
      throw new Error('Printer service offline. Please start Grovit Print Agent.');
    }

    // 2. Verify TCP Reachability
    const tcpSuccess = await testTcpPort(ip, port);
    if (!tcpSuccess) {
      throw new Error(`Could not reach printer\n${ip}:${port}`);
    }

    const width = printer.paper_width === '58mm' ? 32 : 42;
    const divider = '-'.repeat(width) + '\n';
    
    console.log('[Printer] Sending ESC/POS test receipt via Print Agent to:', { ip, port });

    const testReceipt = [
      '\x1B@',                  // initialize
      divider,
      '\x1Ba\x01',              // center
      'GROVIT POS\n\n',
      'Printer Connected \u2713\n\n',
      '\x1Ba\x00',              // left
      'IP:\n',
      `${ip}\n\n`,
      'Port:\n',
      `${port}\n\n`,
      'Date/Time:\n',
      `${new Date().toLocaleString()}\n`,
      divider,
      '\n\n\n',
      '\x1Bi\x01'               // cut
    ].join('');

    await sendPrintJob({
      ip,
      port,
      type: 'raw',
      content: testReceipt
    });

    console.log('[Printer] Print success');
    return 'Network Printer';
  },

  /**
   * Prints KOT ticket to all active kitchen printers.
   */
  printKot: async (kotNumber: number, items: { name: string; quantity: number }[]): Promise<void> => {
    try {
      const res = await fetchPrinters();
      let kitchenPrinters: any[] = [];
      if (res.error || !res.data) {
        console.warn('[Printer] Unable to load printers for KOT:', res.error);
      } else {
        kitchenPrinters = res.data.filter(p => p.is_active && p.printer_role === 'kitchen');
        
        // Fallback: If no kitchen printers are configured, send KOT to the active/default billing printer
        if (kitchenPrinters.length === 0) {
          const billingFallback = res.data.find(p => p.is_active && p.printer_role === 'bill' && p.is_default)
            || res.data.find(p => p.is_active && p.printer_role === 'bill');
          if (billingFallback) {
            console.log('[Printer] No kitchen printer found. Falling back to billing printer for KOT:', billingFallback.name);
            kitchenPrinters = [billingFallback];
          }
        }
      }

      if (kitchenPrinters.length > 0) {
        for (const printer of kitchenPrinters) {
          const width = getLineWidth(printer.paper_width);
          const divider = '-'.repeat(width) + '\n';

          const lines: string[] = [
            '\x1Ba\x01', // Center
            '\x1B!\x18', // Bold double height
            '     KITCHEN TICKET     \n\n',
            '\x1B!\x00', // Reset
            '\x1Ba\x00', // Left
            `KOT Number: #${kotNumber}\n`,
            `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`,
            divider,
            padLine('Qty & Item', '', width) + '\n',
            divider,
            ...items.map(item => `${item.quantity}x ${item.name}\n`),
            divider,
          ];

          try {
            await printRawToPrinter(printer, lines);
          } catch (err: any) {
            console.error(`[Printer] KOT print failed for kitchen printer "${printer.name}" (ID: ${printer.ip_address}):`, err);
          }
        }
      } else {
        console.log('[Printer] No active network kitchen printers configured.');
      }

      // 2. Local OS Printer (if configured in localStorage)
      if (typeof window !== 'undefined' && window.localStorage) {
        const localPrinter = window.localStorage.getItem('billingPrinter');
        if (localPrinter) {
          const width = 32; // standard 58mm width
          const divider = '='.repeat(width);
          const dashedDivider = '-'.repeat(width);

          const lines: string[] = [];
          lines.push(centerTextLocal('*** KITCHEN TICKET ***', width));
          lines.push(divider);
          lines.push(padLine(`KOT Number: #${kotNumber}`, '', width));
          
          const formattedDate = new Date().toLocaleDateString('en-GB');
          const formattedTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          lines.push(padLine('Date:', `${formattedDate} ${formattedTime}`, width));
          lines.push(divider);
          
          lines.push(padLine('Qty & Item', '', width));
          lines.push(dashedDivider);
          
          items.forEach((item) => {
            lines.push(padLine(`${item.quantity}x`, item.name, width));
          });

          lines.push(divider);
          lines.push('\n\n\n\n'); // Safe paper feed spacing

          const content = lines.join('\n');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          try {
            await fetch('http://localhost:4545/print', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                printerName: localPrinter,
                type: 'bill',
                content,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            console.log('[Printer] Local KOT print job submitted successfully.');
          } catch (localErr) {
            clearTimeout(timeoutId);
            console.warn('[Printer] Failed to print local KOT:', localErr);
          }
        }
      }
    } catch (err) {
      console.warn('[Printer] printKot caught error (ignored to avoid blocking POS):', err);
    }
  },

  /**
   * Prints provisional customer bill to all active bill printers.
   *
   * @param kots - Optional array of KOT entries to print on the receipt.
   *               Each entry needs kot_number and created_at.
   */
  printBill: async (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: any[],
    totalAmount: number,
    isFinal = false,
    paymentMethod?: string | null,
    kots?: Array<{ kot_number: number; created_at: string }>
  ): Promise<void> => {
    try {
      const res = await fetchPrinters();
      if (res.error || !res.data) {
        console.warn('[Printer] Unable to load printers for bill:', res.error);
        return;
      }

      const activeBillingPrinters = res.data.filter(p => p.is_active && p.printer_role === 'bill');
      if (activeBillingPrinters.length === 0) {
        const errorMsg = 'No active billing printer configured.\nGo to Settings -> Printer Configuration.';
        console.log('[Printer]', errorMsg);
        Alert.alert('Printer Error', errorMsg);
        return;
      }

      // Find default billing printer, fallback to first active one
      const printer = activeBillingPrinters.find(p => p.is_default) || activeBillingPrinters[0];

      const width = getLineWidth(printer.paper_width);

      const mergedMap: Record<string, { qty: number; price: number }> = {};
      let totalQty = 0;
      for (const item of items) {
        const name = item.product_name || item.item_name || 'Item';
        if (mergedMap[name]) {
          mergedMap[name].qty += item.qty;
        } else {
          mergedMap[name] = { qty: item.qty, price: item.price };
        }
        totalQty += item.qty;
      }

      // Fetch branch details dynamically
      const { data: branch } = await supabase
        .from('branches')
        .select('*')
        .eq('id', printer.branch_id)
        .maybeSingle();

      // 1. Build Header
      const headerLines = buildHeader(width, branch);



      // 3. Bill Information
      const billInfoLines = buildBillInfo(orderName, invoiceNumber, width);

      // 3b. KOT reference line — e.g. "KOT: 1, 2, 3"
      const kotSectionLines: string[] = [];
      if (kots && kots.length > 0) {
        const kotNumbers = kots.map(k => String(k.kot_number)).join(', ');
        kotSectionLines.push(`KOT: ${kotNumbers}` + '\n');
        kotSectionLines.push(separator(width) + '\n');
      }

      // 4. Items Table Header
      const itemsHeaderLines = buildItemsHeader(width);

      // 5. Items Rows
      const itemLines: string[] = [];
      for (const [name, detail] of Object.entries(mergedMap)) {
        itemLines.push(formatItemRow(name, detail.qty, detail.price, detail.qty * detail.price, width));
      }

      // 6. Totals Section
      const totalsLines = buildTotals(totalQty, totalAmount, width);

      // 7. Grand Total — bold, right-aligned, Rs. prefix (no Unicode ₹ — not supported on all Epson code pages)
      const boldOn  = '\x1B\x45\x01';
      const boldOff = '\x1B\x45\x00';
      const grandTotalLines = [
        separator(width) + '\n',
        boldOn + padLine('Grand Total', 'Rs. ' + totalAmount.toFixed(2), width) + boldOff + '\n',
        separator(width) + '\n',
      ];

      // 8. Footer
      const footerLines = [
        center('Thank You..!! & Visit Again..!!', width) + '\n',
        '\n\n\n\n',  // 4 feed lines before cut
      ];

      const lines: string[] = [
        '\x1Ba\x00', // Left alignment default
        ...headerLines,
        ...billInfoLines,
        ...kotSectionLines,
        ...itemsHeaderLines,
        ...itemLines,
        ...totalsLines,
        ...grandTotalLines,
        ...footerLines,
      ];

      await printRawToPrinter(printer, lines);
    } catch (err) {
      console.warn('[Printer] printBill caught error (ignored to avoid blocking POS):', err);
    }
  },

  /**
   * Prints final settled bill to all active bill printers.
   */
  printSettlementBill: async (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: any[],
    totalAmount: number
  ): Promise<void> => {
    return printerService.printBill(orderName, invoiceNumber, items, totalAmount, true);
  }
};
