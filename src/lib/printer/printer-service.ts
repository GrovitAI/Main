import { Alert } from 'react-native';
import { fetchPrintersCached, type Printer } from '../pos/printer-db-service';
import { getTenantContext } from '../pos/tenant-context';
import { getBranchTaxPercentage } from '../pos/pos-settings-service';
import { roundUpToWholeRupee } from '../pos/order-utils';
import { sendPrintJob, checkAgentHealth } from './print-agent-service';
import { supabase } from '../pos/supabase';
import { apiFetch } from '../pos/api-client';
import { billLogoForPrint } from './bill-logo';

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

export type ReceiptBranchInfo = {
  phone?: string | null;
  gstin?: string | null;
  address?: string | null;
};

/** Task 288: the optional customer printed under the bill details. */
/** Who the bill is for. `table` (task 333) is the table a QR order came from, printed under the bill number. */
export type BillCustomer = { name: string | null; phone: string | null; table?: string | null };

export type PrintableBillItem = {
  product_name?: string | null;
  item_name?: string | null;
  qty: number;
  price: number;
};

function getErrorName(err: unknown): string {
  return err instanceof Error ? err.name : '';
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return 'http://localhost:8081';
};

export async function fetchPrintNodePrinters(): Promise<PrintNodePrinter[]> {
  const response = await apiFetch<PrintNodePrinter[]>('/api/printers');
  if (response.error || !response.data) {
    throw new Error(response.error || 'Failed to fetch printers from server.');
  }
  return response.data;
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
 * Task 287: stands in for the logo picture among a bill's lines. The picture is raw bytes, so it
 * is put in only after the text is turned into the printer's bytes.
 */
const LOGO_MARK = '\uE000';
let logoBytes: string | null = null;
/** The badge as an ESC/POS raster picture (GS v 0), as a binary string. */
function logoRaster(): string {
  if (logoBytes === null) {
    // Task 311: the badge at three quarters, for a shorter bill.
    const logo = billLogoForPrint();
    const bytesPerRow = logo.widthDots / 8;
    const header = String.fromCharCode(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, logo.heightDots & 0xff, logo.heightDots >> 8);
    logoBytes = header + Array.from(logo.bytes, (b) => String.fromCharCode(b)).join('');
  }
  return logoBytes;
}
/** A job's text as the printer's bytes, with the logo picture where the mark is. */
function toPrinterBytes(escPos: string): string {
  return utf8ToBinaryString(escPos).split(utf8ToBinaryString(LOGO_MARK)).join(logoRaster());
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
  } catch (err: unknown) {
    clearTimeout(id);
    if (getErrorName(err) === 'AbortError') {
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
      const res = await apiFetch<PrintNodePrinter[]>(`/api/printers?id=${encodeURIComponent(printer.ip_address)}`);
      if (res.error || !res.data) return 'unreachable';
      const data = res.data;
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

/**
 * Generates formatting layout width based on the paper size.
 */
function getLineWidth(paperWidth: string): number {
  return paperWidth === '58mm' ? 32 : 48;
}

function center(str: string, length: number, char = ' '): string {
  if (str.length >= length) return str.substring(0, length);
  const spaces = Math.floor((length - str.length) / 2);
  return char.repeat(spaces) + str + char.repeat(length - str.length - spaces);
}

function separator(length: number, char = '-'): string {
  return char.repeat(length);
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

// ─── Receipt configuration ───────────────────────────────────────────────────

// GST is per branch: the rate comes from pos_settings.tax_percentage, read
// through getBranchTaxPercentage(). 0 means the branch charges no GST.

/** Everything a customer bill prints. */
export type BillLayoutInput = {
  width: number;
  branch?: ReceiptBranchInfo | null;
  orderName: string;
  invoiceNumber: string | null | undefined;
  items: PrintableBillItem[];
  totalAmount: number;
  kots?: { kot_number: number }[];
  discountAmount?: number;
  discountType?: 'percent' | 'fixed' | null;
  discountValue?: number;
  taxPercentage?: number;
  customer?: BillCustomer;
  /** Task 320: how a settled bill was paid, printed under the total on a reprint. */
  paymentMethod?: string | null;
  /** When the bill is printed; now unless a preview or test sets it. */
  printedAt?: Date;
};

const BOLD_ON = '\x1B\x45\x01';
const BOLD_OFF = '\x1B\x45\x00';
const ALIGN_LEFT = '\x1Ba\x00';
const ALIGN_CENTER = '\x1Ba\x01';
const money = (n: number): string => n.toFixed(2);

/** One item: name, qty, rate and amount on one line when the name fits, else the name wraps above. */
function itemRows(name: string, qty: number, rate: number, width: number): string[] {
  const amount = money(qty * rate);
  if (width < 40) {
    // 58 mm paper: the name, then "  2 x 349.00 ... 698.00".
    return [...wrapText(name, width), padLine(`  ${qty} x ${money(rate)}`, amount, width)];
  }
  const nameCol = width - 23;
  const figures = String(qty).padStart(4) + money(rate).padStart(9) + amount.padStart(10);
  const names = wrapText(name, nameCol);
  const last = names.pop() ?? '';
  return [...names, last.padEnd(nameCol) + figures];
}

/**
 * Task 311 (the client asked for less roll paper): the customer bill, compact. The address runs on
 * two lines, the bill details share lines, an item takes one line on 80 mm paper, Sub Total shows
 * only when a discount, GST or round-off makes it differ from the Grand Total, the badge prints at
 * three quarters, and there are no blank lines or doubled dividers. About half the paper of before.
 */
export function buildBillLines(input: BillLayoutInput): string[] {
  const { width, branch, customer } = input;
  const discountAmount = input.discountAmount ?? 0;
  const taxPercentage = input.taxPercentage ?? 0;
  const at = input.printedAt ?? new Date();
  const line = (text: string): string => text + '\n';
  const divider = line(separator(width));

  const phone = branch?.phone || '90309 13610';
  const addressRaw: string = branch?.address || 'No. 13, Balaji Nagar Main Road, Kolathur, Chennai - 600099';
  const address = addressRaw.split(/[,\n]/).map((p) => p.trim()).filter(Boolean).join(', ');
  const contact = branch?.gstin && `PH: ${phone}   GSTIN: ${branch.gstin}`.length <= width
    ? [`PH: ${phone}   GSTIN: ${branch.gstin}`]
    : [`PH: ${phone}`, ...(branch?.gstin ? [`GSTIN: ${branch.gstin}`] : [])];
  const header = [
    ALIGN_CENTER,
    LOGO_MARK + '\n',
    line(BOLD_ON + 'LE LABAN' + BOLD_OFF),
    ...wrapText(address, width).map((part) => line(center(part, width).trimEnd())),
    ...contact.map((part) => line(center(part, width).trimEnd())),
    ALIGN_LEFT,
  ];

  const date = at.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const time = at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  // Internal status labels are not a token.
  const rawToken = (input.orderName || '').trim();
  const token = !rawToken || ['draft order', 'draft', 'order'].includes(rawToken.toLowerCase()) ? '--' : rawToken;
  const kot = input.kots && input.kots.length > 0 ? `KOT: ${input.kots.map((k) => k.kot_number).join(', ')}` : '';
  const tokenLine = `Token: ${token}`;
  const details = [
    divider,
    line(padLine(`Bill No: ${input.invoiceNumber || 'PENDING'}`, `${date} ${time}`, width)),
    ...(kot && tokenLine.length + kot.length + 2 <= width ? [line(padLine(tokenLine, kot, width))] : [line(tokenLine), ...(kot ? wrapText(kot, width).map(line) : [])]),
  ];
  // Task 333: the table, for an order that came from a table's QR code.
  if (customer?.table) details.push(line(`Table: ${customer.table}`));
  // Task 288: the customer, only when one was entered.
  const who = customer?.name ? `Customer: ${customer.name}` : '';
  const ph = customer?.phone ? `Ph: ${customer.phone}` : '';
  if (who && ph && who.length + ph.length + 2 <= width) details.push(line(padLine(who, ph, width)));
  else details.push(...(who ? wrapText(who, width).map(line) : []), ...(ph ? [line(ph)] : []));

  // Repeated items print once with their quantities added.
  const merged = new Map<string, { qty: number; price: number }>();
  let totalQty = 0;
  for (const item of input.items) {
    const name = item.product_name || item.item_name || 'Item';
    const seen = merged.get(name);
    if (seen) seen.qty += item.qty; else merged.set(name, { qty: item.qty, price: item.price });
    totalQty += item.qty;
  }
  const columns = width < 40 ? padLine('Item', 'Amount', width) : 'Item'.padEnd(width - 23) + 'Qty'.padStart(4) + 'Rate'.padStart(9) + 'Amount'.padStart(10);
  const items = [divider, line(columns), divider, ...[...merged].flatMap(([name, d]) => itemRows(name, d.qty, d.price, width).map(line))];

  const discountedSubtotal = Math.max(0, input.totalAmount - discountAmount);
  const exactTotal = discountedSubtotal * (1 + taxPercentage / 100);
  const grandTotal = taxPercentage > 0 ? roundUpToWholeRupee(exactTotal) : exactTotal;
  const roundOff = grandTotal - exactTotal;
  const adjustments: string[] = [];
  if (discountAmount > 0) {
    const label = input.discountType === 'percent' ? `Discount (${input.discountValue ?? 0}%)` : 'Discount';
    adjustments.push(line(padLine(label, '-Rs. ' + money(discountAmount), width)));
  }
  if (taxPercentage > 0) {
    const halfRate = taxPercentage / 2;
    const half = discountedSubtotal * (halfRate / 100);
    adjustments.push(line(padLine(`CGST (${halfRate}%)`, 'Rs. ' + money(half), width)));
    adjustments.push(line(padLine(`SGST (${halfRate}%)`, 'Rs. ' + money(half), width)));
  }
  if (roundOff > 0.001) adjustments.push(line(padLine('Round Off', 'Rs. ' + money(roundOff), width)));
  // Grand Total in bold with "Rs." (the rupee sign is missing on some Epson code pages).
  const totals = [
    divider,
    ...(adjustments.length > 0 ? [line(padLine(`Total Qty: ${totalQty}`, 'Sub Total Rs. ' + money(input.totalAmount), width)), ...adjustments, divider] : []),
    line(BOLD_ON + padLine(adjustments.length > 0 ? 'Grand Total' : `Grand Total (Qty ${totalQty})`, 'Rs. ' + money(grandTotal), width) + BOLD_OFF),
    ...(input.paymentMethod ? [line(padLine('Payment', input.paymentMethod.toUpperCase(), width))] : []),
    divider,
    ALIGN_CENTER,
    line(center('Thank You..!! & Visit Again..!!', width).trimEnd()),
    ALIGN_LEFT,
  ];

  return [ALIGN_LEFT, ...header, ...details, ...items, ...totals];
}

/**
 * Core raw printing method via Grovit Print Agent.
 */
/**
 * Cloud printing via PrintNode API.
 */
async function printViaPrintNode(printer: Omit<Printer, 'id' | 'tenant_id' | 'branch_id'>, lines: string[], alertOnFailure = true): Promise<boolean> {
  const printerIdStr = printer.ip_address;
  if (!printerIdStr) {
    if (alertOnFailure) Alert.alert('Configuration Error', 'No PrintNode Printer ID configured.');
    return false;
  }

  const printerId = parseInt(printerIdStr, 10);
  if (isNaN(printerId)) {
    if (alertOnFailure) Alert.alert('Configuration Error', 'Invalid PrintNode Printer ID.');
    return false;
  }

  try {
    const escPosString = [
      '\x1B@', // Reset printer
      ...lines,
      '\n\n\n\n', // Feed paper
      '\x1Bi\x01', // ESC/POS Paper Cut
    ].join('');

    const base64Content = encodeBase64(toPrinterBytes(escPosString));

    console.log('[Printer] Sending cloud print job via PrintNode to printer:', printerId);
    const response = await apiFetch<{ success: boolean }>('/api/printjobs', {
      method: 'POST',
      body: { printerId, base64Content },
    });
    if (response.error) {
      throw new Error(response.error);
    }

    console.log('[Printer] PrintNode job submitted successfully.');
    return true;
  } catch (err: unknown) {
    console.error('[Printer] PrintNode submission failed:', err);
    if (alertOnFailure) Alert.alert('Printing Failed', 'Unable to submit the print job to PrintNode. Please try again.');
    return false;
  }
}

/**
 * Core raw printing method via Grovit Print Agent.
 */
async function printRawToPrinter(printer: Printer, lines: string[], alertOnFailure = true): Promise<boolean> {
  if (printer.connection === 'printnode') {
    return printViaPrintNode(printer, lines, alertOnFailure);
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
      content: escPosString.split(LOGO_MARK).join(logoRaster())
    });
    console.log('[Printer] Print success');
    return true;
  } catch (err: unknown) {
    console.error('[Printer] Print failed:', err);

    // Check if agent is unavailable (network fetch failed)
    const message = getErrorMessage(err);
    const isAgentOffline = message === 'Print agent unavailable' || getErrorName(err) === 'TypeError' || message.toLowerCase().includes('fetch');
    if (isAgentOffline) {
      const errorMsg = 'Printer service offline. Please start Grovit Print Agent.';
      Alert.alert('Printer Offline', errorMsg);
    } else {
      const errorMsg = `Could not reach printer\n${ip}:${port}`;
      Alert.alert('Printer Unreachable', errorMsg);
    }
    return false;
  }
}

/**
 * Sends one ticket using the cached printer list. If the job is refused and
 * the list came from memory, the printer may have changed in Settings on
 * another device: reload the list, pick again and try once more. Only the
 * final attempt shows an alert.
 */
async function printWithFreshRetry(
  pick: (printers: Printer[]) => Printer | null,
  printer: Printer,
  cached: boolean,
  lines: string[],
  alerts = true,
): Promise<boolean> {
  if (await printRawToPrinter(printer, lines, alerts && !cached)) return true;
  if (!cached) return false;
  const fresh = await fetchPrintersCached(true);
  const retry = fresh.data ? pick(fresh.data) : null;
  if (retry) return printRawToPrinter(retry, lines, alerts);
  if (alerts) Alert.alert('Printing Failed', 'Unable to submit the print job to PrintNode. Please try again.');
  return false;
}

/** A customer bill to print: the layout's input without what the printer and branch supply. */
export type BillJob = Omit<BillLayoutInput, 'width' | 'branch' | 'taxPercentage' | 'printedAt'>;

/**
 * Prints one customer bill on the branch's default bill printer in the compact layout (task 311).
 * The first print and every reprint come through here, so they always look the same (task 320).
 * With alerts off the caller reports the outcome itself.
 */
async function sendBill(bill: BillJob, alerts: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    // Printers, receipt header and GST rate are independent; read them together.
    const [res, branch, taxPercentage] = await Promise.all([fetchPrintersCached(), loadReceiptBranch(), getBranchTaxPercentage()]);
    if (res.error || !res.data) {
      console.warn('[Printer] Unable to load printers for bill:', res.error);
      return { success: false, error: 'Unable to load the printers.' };
    }

    const pickBill = (printers: Printer[]): Printer | null => {
      const active = printers.filter(p => p.is_active && p.printer_role === 'bill');
      return active.find(p => p.is_default) || active[0] || null;
    };
    const printer = pickBill(res.data);
    if (!printer) {
      const errorMsg = 'No active billing printer configured.\nGo to Settings -> Printer Configuration.';
      console.log('[Printer]', errorMsg);
      if (alerts) Alert.alert('Printer Error', errorMsg);
      return { success: false, error: 'No active bill printer.' };
    }

    const lines = buildBillLines({ ...bill, width: getLineWidth(printer.paper_width), branch, taxPercentage });
    const sent = await printWithFreshRetry(pickBill, printer, res.cached, lines, alerts);
    return sent ? { success: true } : { success: false, error: 'The printer did not take the job.' };
  } catch (err) {
    console.warn('[Printer] Bill print failed:', err);
    return { success: false, error: getErrorMessage(err) };
  }
}

/** Receipt header details change rarely, so they are reused for five minutes like the printer list. */
const BRANCH_CACHE_MS = 5 * 60_000;
let receiptBranchCache: { key: string; branch: ReceiptBranchInfo | null; resolvedAt: number } | null = null;

async function loadReceiptBranch(): Promise<ReceiptBranchInfo | null> {
  const { tenant_id, branch_id } = getTenantContext();
  const key = tenant_id + ':' + branch_id;
  const now = Date.now();
  if (receiptBranchCache?.key === key && now - receiptBranchCache.resolvedAt < BRANCH_CACHE_MS) return receiptBranchCache.branch;
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('phone, gstin, address')
      .eq('tenant_id', tenant_id)
      .eq('id', branch_id)
      .maybeSingle();
    if (error) return receiptBranchCache?.key === key ? receiptBranchCache.branch : null;
    const branch: ReceiptBranchInfo | null = data;
    receiptBranchCache = { key, branch, resolvedAt: now };
    return branch;
  } catch {
    return receiptBranchCache?.key === key ? receiptBranchCache.branch : null;
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
  printKot: async (kotNumber: number, items: { name: string; quantity: number; notes?: string | null }[], isCancel: boolean = false, table: string | null = null): Promise<void> => {
    try {
      const res = await fetchPrintersCached();
      // Kitchen printers, or the default billing printer when the branch has none.
      const pickKitchen = (printers: Printer[]): Printer[] => {
        const kitchen = printers.filter(p => p.is_active && p.printer_role === 'kitchen');
        if (kitchen.length > 0) return kitchen;
        const billingFallback = printers.find(p => p.is_active && p.printer_role === 'bill' && p.is_default)
          || printers.find(p => p.is_active && p.printer_role === 'bill');
        return billingFallback ? [billingFallback] : [];
      };
      let kitchenPrinters: Printer[] = [];
      if (res.error || !res.data) {
        console.warn('[Printer] Unable to load printers for KOT:', res.error);
      } else {
        kitchenPrinters = pickKitchen(res.data);
      }

      if (kitchenPrinters.length > 0) {
        // Each kitchen printer is independent, so the tickets go out together rather than one after another.
        await Promise.all(kitchenPrinters.map(async (printer, index) => {
          const width = getLineWidth(printer.paper_width);
          const divider = '-'.repeat(width) + '\n';

          const lines: string[] = [
            '\x1Ba\x01', // Center
            '\x1B!\x18', // Bold double height
            `     ${isCancel ? 'CANCEL KOT' : 'KITCHEN TICKET'}     \n\n`,
            '\x1B!\x00', // Reset
            '\x1Ba\x00', // Left
            `KOT Number: #${kotNumber}\n`,
            // Task 333: a table's order says which table to take it to.
            ...(table ? ['\x1B!\x18', `Table: ${table}\n`, '\x1B!\x00'] : []),
            `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`,
            divider,
            padLine('Qty & Item', '', width) + '\n',
            divider,
            ...items.map(item => {
              let line = `${Math.abs(item.quantity)}x ${item.name}${isCancel ? ' (CANCELLED)' : ''}\n`;
              if (isCancel && item.notes) {
                line += `  * Reason: ${item.notes}\n`;
              }
              return line;
            }),
            divider,
          ];

          try {
            await printWithFreshRetry(printers => { const fresh = pickKitchen(printers); return fresh.find(p => p.id === printer.id) ?? fresh[index] ?? null; }, printer, res.cached, lines);
          } catch (err: unknown) {
            console.error(`[Printer] KOT print failed for kitchen printer "${printer.name}" (ID: ${printer.ip_address}):`, err);
          }
        }));
      } else {
        console.log('[Printer] No active network kitchen printers configured.');
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
    items: PrintableBillItem[],
    totalAmount: number,
    isFinal = false,
    paymentMethod?: string | null,
    kots?: { kot_number: number; created_at: string }[],
    discountAmount = 0,
    discountType: 'percent' | 'fixed' | null = null,
    discountValue = 0,
    customer?: BillCustomer
  ): Promise<void> => {
    // Failures alert the cashier and never block the POS.
    await sendBill({ orderName, invoiceNumber, items, totalAmount, kots, discountAmount, discountType, discountValue, customer }, true);
  },

  /**
   * Task 320: prints a bill again in the same compact layout as its first print, and says whether
   * the printer took it so the screen can show the outcome.
   */
  reprintBill: (bill: BillJob): Promise<{ success: boolean; error?: string }> => sendBill(bill, false),

  /**
   * Prints final settled bill to all active bill printers.
   */
  printSettlementBill: async (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: PrintableBillItem[],
    totalAmount: number,
    discountAmount = 0,
    discountType: 'percent' | 'fixed' | null = null,
    discountValue = 0
  ): Promise<void> => {
    return printerService.printBill(orderName, invoiceNumber, items, totalAmount, true, null, undefined, discountAmount, discountType, discountValue);
  }
};
