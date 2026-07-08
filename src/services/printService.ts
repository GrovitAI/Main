import { fetchPrinters } from '@/lib/pos/printer-db-service';
import { diagnosePrinterConnection, encodeBase64, utf8ToBinaryString } from '@/lib/printer/printer-service';

/**
 * Checks whether the default PrintNode billing printer is online.
 */
export async function isPrintAgentRunning(): Promise<boolean> {
  try {
    const res = await fetchPrinters();
    if (res.error || !res.data) return false;
    const activePrinter = res.data.find(p => p.is_active && p.is_default && p.printer_role === 'bill')
                       || res.data.find(p => p.is_active && p.is_default)
                       || res.data.find(p => p.is_active);
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
export async function printReceipt(printerName: string, content: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchPrinters();
    if (res.error || !res.data) {
      return { success: false, error: res.error || 'No printers configured.' };
    }
    
    // Find active primary bill printer
    const defaultBillPrinter = res.data.find(p => p.is_active && p.is_default && p.printer_role === 'bill') || res.data.find(p => p.is_active && p.printer_role === 'bill');
    if (!defaultBillPrinter) {
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

      const apiKey = process.env.EXPO_PUBLIC_PRINTNODE_API_KEY || '';
      if (!apiKey) {
        return { success: false, error: 'PrintNode API key is not configured.' };
      }

      // Convert ESC/POS control characters (initialized reset + cut)
      const escPosString = [
        '\x1B@',
        content,
        '\n\n\n\n',
        '\x1Bi\x01'
      ].join('');

      const base64Content = encodeBase64(utf8ToBinaryString(escPosString));
      const authHeader = 'Basic ' + encodeBase64(apiKey + ':');

      console.log('[PrintService] Sending PrintNode job to default billing printer ID:', printerId);
      const response = await fetch('https://api.printnode.com/printjobs', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printerId: printerId,
          title: 'Grovit POS Receipt',
          contentType: 'raw_base64',
          content: base64Content,
          source: 'Grovit POS',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `PrintNode API returned ${response.status}: ${errText}` };
      }

      return { success: true };
    } else {
      return { success: false, error: 'Default billing printer connection type in database is not printnode.' };
    }
  } catch (err: any) {
    console.warn('[PrintService] Thermal print request failed:', err);
    return { success: false, error: err.message || String(err) };
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
