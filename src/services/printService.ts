const PRINT_AGENT_URL = 'http://localhost:4545';

/**
 * Checks whether the local Grovit Print Agent is running at port 4545.
 */
export async function isPrintAgentRunning(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500); // Short timeout for snappy loading check
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

/**
 * Fetches the list of available OS printers connected to the local Print Agent spools.
 */
export async function getPrinters(): Promise<string[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/printers`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[PrintService] Failed to retrieve local printers list:', err);
    return [];
  }
}

/**
 * Sends a thermal receipt print job to the designated printer.
 */
export async function printReceipt(printerName: string, content: string): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds print socket timeout
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerName,
        type: 'bill',
        content,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      return { success: true };
    } else {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.details || data.error || `HTTP ${res.status}` };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    const msg = err.name === 'AbortError' ? 'Connection timed out' : err.message || String(err);
    console.warn('[PrintService] Thermal print request failed:', err);
    return { success: false, error: msg };
  }
}

/**
 * Helper to dynamically center text.
 */
function centerText(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const spaces = Math.floor((width - text.length) / 2);
  return ' '.repeat(spaces) + text + ' '.repeat(width - text.length - spaces);
}

/**
 * Helper to left-align a label and right-align a value.
 */
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
 * Builds clean, formatted string-based receipt layouts tailored for standard 58mm/80mm thermal paper rolls.
 */
export function buildReceiptText(
  orderName: string,
  invoiceNumber: string | null | undefined,
  items: { name: string; qty: number; price: number }[],
  totalAmount: number,
  paymentMethod?: string | null
): string {
  const width = 32; // standard 58mm line width boundary
  const divider = '='.repeat(width);
  const dashedDivider = '-'.repeat(width);

  const lines: string[] = [];
  lines.push(centerText('LE LEBAN', width));
  lines.push(centerText('RESTAURANT POS', width));
  lines.push(divider);
  
  const isFinal = !!invoiceNumber;
  lines.push(centerText(isFinal ? '*** TAX INVOICE ***' : '*** PROVISIONAL BILL ***', width));
  lines.push(divider);

  if (invoiceNumber) {
    lines.push(alignLeftRight('Bill No   :', invoiceNumber, width));
  }
  lines.push(alignLeftRight('Order Ref :', orderName, width));
  
  const formattedDate = new Date().toLocaleDateString('en-GB');
  const formattedTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  lines.push(alignLeftRight('Date      :', `${formattedDate} ${formattedTime}`, width));

  if (paymentMethod) {
    lines.push(alignLeftRight('Payment   :', paymentMethod.toUpperCase(), width));
  }
  lines.push(divider);
  
  items.forEach((item) => {
    lines.push(item.name);
    const qtyText = `  ${item.qty} x Rs.${item.price.toFixed(2)}`;
    const totalText = `Rs.${(item.qty * item.price).toFixed(2)}`;
    lines.push(alignLeftRight(qtyText, totalText, width));
  });

  lines.push(dashedDivider);
  
  const totalText = `Rs.${totalAmount.toFixed(2)}`;
  lines.push(alignLeftRight('TOTAL AMOUNT', totalText, width));
  
  lines.push(divider);

  // Load configurable receipt footer
  let footerMessage = '* Thank you for your visit! *';
  if (typeof window !== 'undefined' && window.localStorage) {
    const storedFooter = window.localStorage.getItem('receiptFooter');
    if (storedFooter !== null) {
      footerMessage = storedFooter;
    }
  }

  if (footerMessage) {
    footerMessage.split('\n').forEach((line) => {
      lines.push(centerText(line.trim(), width));
    });
  }
  
  lines.push('\n\n\n\n'); // Safe paper feed spacing

  return lines.join('\n');
}
