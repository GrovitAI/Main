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
 * Builds clean, formatted string-based receipt layouts tailored for standard 58mm/80mm thermal paper rolls.
 */
export function buildReceiptText(
  orderName: string,
  invoiceNumber: string | null | undefined,
  items: { name: string; qty: number; price: number }[],
  totalAmount: number
): string {
  const width = 32; // standard 58mm line width boundary
  const divider = '='.repeat(width);
  const dashedDivider = '-'.repeat(width);

  const padLine = (left: string, right: string) => {
    const spacesNeeded = width - left.length - right.length;
    if (spacesNeeded <= 0) {
      const allowedLeft = width - right.length - 2;
      return left.substring(0, allowedLeft) + '..' + ' ' + right;
    }
    return left + ' '.repeat(spacesNeeded) + right;
  };

  const lines: string[] = [];
  lines.push('           LE LEBAN           ');
  lines.push('        RESTAURANT POS        ');
  lines.push(divider);
  lines.push(`Order: ${orderName}`);
  if (invoiceNumber) {
    lines.push(`Bill No: ${invoiceNumber}`);
  }
  lines.push(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  lines.push(divider);
  
  items.forEach((item) => {
    const qtyText = item.qty > 1 ? `${item.qty}x ` : '';
    const leftText = `${qtyText}${item.name}`;
    const rightText = String(item.price * item.qty);
    lines.push(padLine(leftText, rightText));
  });

  lines.push(dashedDivider);
  lines.push(padLine('TOTAL', `Rs ${totalAmount}`));
  lines.push(divider);
  lines.push('   * Thank you for your visit! *  ');
  lines.push('\n\n\n\n'); // Safe paper feed spacing

  return lines.join('\n');
}
