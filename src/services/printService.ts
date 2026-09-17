import { fetchPrinters, type Printer } from '@/lib/pos/printer-db-service';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { diagnosePrinterConnection, encodeBase64, utf8ToBinaryString } from '@/lib/printer/printer-service';
import { apiFetch } from '@/lib/pos/api-client';
import { RECEIPT_CONFIG, PAPER_WIDTH } from './receiptConfig';
import { roundUpToWholeRupee } from '@/lib/pos/order-utils';

/** How long the branch's printer rows are reused before the database is asked again. */
const PRINTER_CACHE_MS = 5 * 60_000;

let printerCache: { key: string; printers: Printer[]; resolvedAt: number } | null = null;

/**
 * The branch's printers, read from the database at most once every five
 * minutes. The rows almost never change, and both users of them are on hot
 * paths: the health check ran this read on every tick (a large share of an
 * idle till's database egress), and printing a bill waited for it before the
 * job could even be sent.
 */
async function loadBranchPrinters(forceFresh = false): Promise<{ printers: Printer[] | null; error: string | null }> {
  const { tenant_id, branch_id } = getTenantContext();
  const key = `${tenant_id}:${branch_id}`;
  const now = Date.now();
  if (!forceFresh && printerCache && printerCache.key === key && now - printerCache.resolvedAt < PRINTER_CACHE_MS) {
    return { printers: printerCache.printers, error: null };
  }

  const res = await fetchPrinters();
  if (res.error || !res.data) {
    // Keep any earlier answer; a transient read failure should not turn the
    // indicator red or stop a bill from printing.
    if (printerCache?.key === key) return { printers: printerCache.printers, error: null };
    return { printers: null, error: res.error || 'No printers configured.' };
  }
  printerCache = { key, printers: res.data, resolvedAt: now };
  return { printers: res.data, error: null };
}

/** The printer the health check should probe. */
async function resolveHealthPrinter(): Promise<Printer | null> {
  const { printers } = await loadBranchPrinters();
  if (!printers) return null;
  return printers.find(p => p.is_active && p.is_default && p.printer_role === 'bill')
      || printers.find(p => p.is_active && p.is_default)
      || printers.find(p => p.is_active)
      || null;
}

function pickBillPrinter(printers: Printer[]): Printer | null {
  return printers.find(p => p.is_active && p.is_default && p.printer_role === 'bill')
      || printers.find(p => p.is_active && p.printer_role === 'bill')
      || null;
}

/**
 * Checks whether the default PrintNode billing printer is online.
 */
export async function isPrintAgentRunning(): Promise<boolean> {
  try {
    const activePrinter = await resolveHealthPrinter();
    if (!activePrinter) return false;
    const status = await diagnosePrinterConnection(activePrinter);
    return status === 'connected';
  } catch {
    return false;
  }
}

/**
 * Empty stub kept for backward compatibility (formerly fetched list of local printers).
 */
export async function getPrinters(): Promise<string[]> {
  return [];
}

/**
 * Sends a thermal receipt print job directly via PrintNode API to the default billing printer.
 */
export async function printReceipt(printerName: string, content: string, useCachedPrinter = true): Promise<{ success: boolean; error?: string }> {
  try {
    // The cashier is waiting on this, so the printer comes from the cache
    // rather than a database round trip. If the job then fails, the printer
    // may have been changed in Settings: reload it and try once more.
    const loaded = await loadBranchPrinters(!useCachedPrinter);
    if (!loaded.printers) {
      return { success: false, error: loaded.error || 'No printers configured.' };
    }

    // Find active primary bill printer
    const defaultBillPrinter = pickBillPrinter(loaded.printers);
    if (!defaultBillPrinter) {
      if (useCachedPrinter) return printReceipt(printerName, content, false);
      return { success: false, error: 'No active bill printer configured in database.' };
    }

    if (defaultBillPrinter.connection === 'printnode') {
      const printerIdStr = defaultBillPrinter.ip_address;
      if (!printerIdStr) {
        return { success: false, error: 'PrintNode Printer ID is not configured.' };
      }

      const printerId = parseInt(printerIdStr, 10);
      if (isNaN(printerId)) {
        return { success: false, error: 'Invalid PrintNode Printer ID.' };
      }

      // ESC/POS: init reset + content + feed + cut
      const escPosString = [
        '\x1B@',        // initialize printer
        content,
        '\n\n\n\n',     // paper feed before cut
        '\x1Bi\x01'     // full cut
      ].join('');

      const base64Content = encodeBase64(utf8ToBinaryString(escPosString));

      console.log('[PrintService] Sending PrintNode job to default billing printer ID:', printerId);
      const response = await apiFetch<{ success: boolean }>('/api/printjobs', {
        method: 'POST',
        body: { printerId, base64Content },
      });
      if (response.error) {
        if (useCachedPrinter) return printReceipt(printerName, content, false);
        return { success: false, error: response.error };
      }

      return { success: true };
    } else {
      return { success: false, error: 'Default billing printer connection type in database is not printnode.' };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[PrintService] Thermal print request failed:', err);
    return { success: false, error: message };
  }
}

// ─── ESC/POS helpers ──────────────────────────────────────────────────────────

const ESC_BOLD_ON  = '\x1B\x45\x01';
const ESC_BOLD_OFF = '\x1B\x45\x00';
const ESC_DW_ON    = '\x1B\x21\x20'; // double width
const ESC_DW_OFF   = '\x1B\x21\x00'; // normal width
const ESC_CENTER   = '\x1B\x61\x01';
const ESC_LEFT     = '\x1B\x61\x00';

// ─── Text layout helpers ──────────────────────────────────────────────────────

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const spaces = Math.floor((width - text.length) / 2);
  return ' '.repeat(spaces) + text + ' '.repeat(width - text.length - spaces);
}

function alignLeftRight(left: string, right: string, width: number): string {
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
 * Wraps a long item name across multiple lines, respecting the column
 * budget so the numeric columns (qty / price / amount) remain aligned.
 *
 * Layout for a 32-char line:
 *   [item name up to 16 chars] [qty 3] [price 7] [amount 6]
 *
 * If name is longer than 16 chars it wraps; continuation lines are indented.
 */
function formatItemLines(
  name: string,
  qty: number,
  price: number,
  width: number,
): string[] {
  // Column widths (must sum to `width`)
  const nameCol  = Math.floor(width * 0.5);       // 16 for 32-wide
  const qtyCol   = 3;
  const priceCol = Math.floor(width * 0.22);      // ~7
  const amtCol   = width - nameCol - qtyCol - priceCol; // remainder

  const qtyStr   = String(qty).padStart(qtyCol - 1);
  const priceStr = price.toFixed(2).padStart(priceCol);
  const amtStr   = (qty * price).toFixed(2).padStart(amtCol);
  const numericCols = `${qtyStr} ${priceStr}${amtStr}`;

  // Split name into chunks of nameCol chars
  const chunks: string[] = [];
  let remaining = name;
  while (remaining.length > 0) {
    chunks.push(remaining.substring(0, nameCol));
    remaining = remaining.substring(nameCol);
  }

  const lines: string[] = [];
  chunks.forEach((chunk, i) => {
    if (i === 0) {
      // First line: name + numeric columns
      const paddedName = chunk.padEnd(nameCol);
      lines.push(paddedName + numericCols);
    } else {
      // Continuation: indent + no numeric columns
      lines.push((' '.repeat(2) + chunk.trim()).padEnd(width));
    }
  });

  return lines;
}

// ─── Receipt builder ──────────────────────────────────────────────────────────

export type ReceiptBranch = {
  phone?: string | null;
  gstin?: string | null;
  address?: string | null;
};

export type ReceiptItem = {
  name: string;
  qty: number;
  price: number;
};

/**
 * Builds a thermal receipt string matching Le Leban's production receipt layout.
 *
 * ESC/POS control characters are embedded for bold and double-width on the
 * restaurant name and grand total line.
 *
 * Configuration flags in receiptConfig.ts control address, GST info, and paper width.
 */
export function buildReceiptText(
  orderName: string,
  invoiceNumber: string | null | undefined,
  items: ReceiptItem[],
  totalAmount: number,
  paymentMethod?: string | null,
  branch?: ReceiptBranch | null,
  /** Branch GST percentage; 0 prints no GST lines. From pos_settings. */
  taxPercentage = 0,
  discountAmount = 0,
  discountType: 'percent' | 'fixed' | null = null,
  discountValue = 0
): string {
  const W   = PAPER_WIDTH;
  const div = '-'.repeat(W);
  const cfg = RECEIPT_CONFIG;

  const lines: string[] = [];

  // Legal trading name, printed above the brand as on the stamped receipts.
  const tradingName = 'NS TRADERS';
  const title = 'LE LABAN';
  const phone = branch?.phone || cfg.phone.replace('PH:', '').trim();
  const gstin = branch?.gstin;

  const addressRaw: string = branch?.address || `${cfg.addressLine1}, ${cfg.addressLine2}, ${cfg.addressLine3}`;
  const addressParts = addressRaw.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);

  // Standard ESC/POS command to print the NV graphics logo #1 pre-flashed in the printer memory.
  const printNvLogo = '\x1Cp\x01\x00';

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(ESC_CENTER);
  lines.push(printNvLogo); // Print NV logo
  lines.push(ESC_BOLD_ON + ESC_DW_ON + centerText(tradingName, W) + ESC_DW_OFF + ESC_BOLD_OFF);
  lines.push(ESC_BOLD_ON + ESC_DW_ON + centerText(title, W) + ESC_DW_OFF + ESC_BOLD_OFF);
  if (cfg.tagline && !branch) lines.push(centerText(cfg.tagline, W));
  lines.push('');
  addressParts.forEach((part: string) => {
    lines.push(centerText(part, W));
  });
  lines.push('');
  lines.push(centerText(`PH: ${phone}`, W));

  if (gstin) {
    lines.push(centerText(`GSTIN: ${gstin}`, W));
  }

  lines.push(ESC_LEFT);
  lines.push(div);

  // ── Customer / Order info ─────────────────────────────────────────────────
  lines.push('Name:');
  lines.push('');
  lines.push(div);

  const isFinal = !!invoiceNumber;
  const formattedDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const orderType = 'Pick Up';
  lines.push(alignLeftRight(`Date: ${formattedDate}`, orderType, W));
  lines.push('');
  lines.push(formattedTime);
  lines.push(`Cashier: ${cfg.cashierLabel}`);
  lines.push(`Bill No: ${isFinal ? (invoiceNumber ?? '') : 'PENDING'}`);
  if (orderName) lines.push(`Token No: ${orderName}`);
  lines.push(div);

  // ── Column header ─────────────────────────────────────────────────────────
  const nameCol  = Math.floor(W * 0.5);
  const qtyCol   = 3;
  const priceCol = Math.floor(W * 0.22);
  const amtCol   = W - nameCol - qtyCol - priceCol;

  const hdrName  = 'Item'.padEnd(nameCol);
  const hdrQty   = 'Qty'.padStart(qtyCol);
  const hdrPrice = 'Price'.padStart(priceCol);
  const hdrAmt   = 'Amt'.padStart(amtCol);
  lines.push(hdrName + hdrQty + hdrPrice + hdrAmt);
  lines.push(div);

  // ── Items ────────────────────────────────────────────────────────────────
  let totalQty = 0;
  items.forEach((item) => {
    totalQty += item.qty;
    const itemLines = formatItemLines(item.name, item.qty, item.price, W);
    lines.push(...itemLines);
  });

  lines.push(div);

  // ── Totals ────────────────────────────────────────────────────────────────
  lines.push(`Total Qty: ${totalQty}`);
  lines.push('');
  lines.push(alignLeftRight('Sub Total', totalAmount.toFixed(2), W));

  if (discountAmount > 0) {
    const label = discountType === 'percent' ? `Discount (${discountValue}%)` : 'Discount';
    lines.push(alignLeftRight(label, `-\u20B9${discountAmount.toFixed(2)}`, W));
  }

  const discountedSubtotal = Math.max(0, totalAmount - discountAmount);

  // GST breakdown — the branch's own rate, split half CGST and half SGST.
  // A branch with no rate configured prints no GST lines at all.
  let taxAmount = 0;
  if (taxPercentage > 0) {
    const halfRate = taxPercentage / 2;
    const cgst = discountedSubtotal * (halfRate / 100);
    const sgst = cgst;
    taxAmount = cgst + sgst;
    lines.push(alignLeftRight(`CGST (${halfRate}%)`, cgst.toFixed(2), W));
    lines.push(alignLeftRight(`SGST (${halfRate}%)`, sgst.toFixed(2), W));
  }

  const exactTotal = discountedSubtotal + taxAmount;
  const grandTotal = taxPercentage > 0 ? roundUpToWholeRupee(exactTotal) : exactTotal;
  const roundOff = grandTotal - exactTotal;
  if (roundOff > 0.001) {
    lines.push(alignLeftRight('Round Off', roundOff.toFixed(2), W));
  }

  lines.push(div);

  // Grand Total — bold + double width
  const grandTotalLabel = 'Grand Total';
  const grandTotalAmt   = `\u20B9${grandTotal.toFixed(2)}`;
  lines.push(ESC_CENTER);
  lines.push(
    ESC_BOLD_ON + ESC_DW_ON
    + alignLeftRight(grandTotalLabel, grandTotalAmt, W)
    + ESC_DW_OFF + ESC_BOLD_OFF,
  );
  lines.push(ESC_LEFT);
  lines.push(div);

  // Payment method (if available)
  if (paymentMethod) {
    lines.push(alignLeftRight('Payment:', paymentMethod.toUpperCase(), W));
    lines.push(div);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  lines.push(ESC_CENTER);
  lines.push(centerText(cfg.footerLine1, W));
  lines.push('');
  lines.push(centerText(cfg.footerLine2, W));
  lines.push(ESC_LEFT);

  return lines.join('\n');
}
