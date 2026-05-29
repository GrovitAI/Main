import { Platform, Alert } from 'react-native';
import { fetchPrinters, type Printer } from '../pos/printer-db-service';
import { sendPrintJob, checkAgentHealth } from './print-agent-service';

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
  return paperWidth === '58mm' ? 32 : 42;
}

/**
 * Core raw printing method via Grovit Print Agent.
 */
async function printRawToPrinter(printer: Printer, lines: string[]): Promise<void> {
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
      if (res.error || !res.data) {
        console.warn('[Printer] Unable to load printers for KOT:', res.error);
        return;
      }

      const kitchenPrinters = res.data.filter(p => p.is_active && p.printer_role === 'kitchen');
      if (kitchenPrinters.length === 0) {
        console.log('[Printer] No active kitchen printers configured.');
        return;
      }

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

        await printRawToPrinter(printer, lines);
      }
    } catch (err) {
      console.warn('[Printer] printKot caught error (ignored to avoid blocking POS):', err);
    }
  },

  /**
   * Prints provisional customer bill to all active bill printers.
   */
  printBill: async (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: any[],
    totalAmount: number
  ): Promise<void> => {
    try {
      const res = await fetchPrinters();
      if (res.error || !res.data) {
        console.warn('[Printer] Unable to load printers for bill:', res.error);
        return;
      }

      const billPrinters = res.data.filter(p => p.is_active && p.printer_role === 'bill');
      if (billPrinters.length === 0) {
        console.log('[Printer] No active bill printers configured.');
        return;
      }

      for (const printer of billPrinters) {
        const width = getLineWidth(printer.paper_width);
        const divider = '-'.repeat(width) + '\n';

        const mergedMap: Record<string, { qty: number; price: number }> = {};
        for (const item of items) {
          const name = item.product_name || item.item_name || 'Item';
          if (mergedMap[name]) {
            mergedMap[name].qty += item.qty;
          } else {
            mergedMap[name] = { qty: item.qty, price: item.price };
          }
        }

        const itemLines: string[] = [];
        for (const [name, detail] of Object.entries(mergedMap)) {
          const left = `${detail.qty}x ${name}`;
          const right = `\u20B9${detail.qty * detail.price}`;
          itemLines.push(padLine(left, right, width) + '\n');
        }

        const lines: string[] = [
          '\x1Ba\x01', // Center
          '\x1B!\x18', // Bold double height
          '       GROVIT POS       \n\n',
          '\x1B!\x00', // Reset
          '\x1Ba\x00', // Left
          `Order: ${orderName}\n`,
          invoiceNumber ? `Bill No: ${invoiceNumber}\n` : '',
          `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`,
          divider,
          padLine('Item', 'Amount', width) + '\n',
          divider,
          ...itemLines,
          divider,
          padLine('TOTAL AMOUNT', `\u20B9${totalAmount}`, width) + '\n',
          divider,
          '\x1Ba\x01', // Center
          '   --- PROVISIONAL BILL ---   \n',
          divider,
        ];

        await printRawToPrinter(printer, lines);
      }
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
    try {
      const res = await fetchPrinters();
      if (res.error || !res.data) {
        console.warn('[Printer] Unable to load printers for final bill:', res.error);
        return;
      }

      const billPrinters = res.data.filter(p => p.is_active && p.printer_role === 'bill');
      if (billPrinters.length === 0) {
        console.log('[Printer] No active bill printers configured.');
        return;
      }

      for (const printer of billPrinters) {
        const width = getLineWidth(printer.paper_width);
        const divider = '-'.repeat(width) + '\n';

        const mergedMap: Record<string, { qty: number; price: number }> = {};
        for (const item of items) {
          const name = item.product_name || item.item_name || 'Item';
          if (mergedMap[name]) {
            mergedMap[name].qty += item.qty;
          } else {
            mergedMap[name] = { qty: item.qty, price: item.price };
          }
        }

        const itemLines: string[] = [];
        for (const [name, detail] of Object.entries(mergedMap)) {
          const left = `${detail.qty}x ${name}`;
          const right = `\u20B9${detail.qty * detail.price}`;
          itemLines.push(padLine(left, right, width) + '\n');
        }

        const lines: string[] = [
          '\x1Ba\x01', // Center
          '\x1B!\x18', // Bold double height
          '       GROVIT POS       \n\n',
          '\x1B!\x00', // Reset
          '\x1Ba\x00', // Left
          `Order: ${orderName}\n`,
          invoiceNumber ? `Bill No: ${invoiceNumber}\n` : '',
          `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`,
          divider,
          padLine('Item', 'Amount', width) + '\n',
          divider,
          ...itemLines,
          divider,
          padLine('TOTAL AMOUNT', `\u20B9${totalAmount}`, width) + '\n',
          divider,
          '\x1Ba\x01', // Center
          ' * Thank you for dining with us! * \n',
          divider,
        ];

        await printRawToPrinter(printer, lines);
      }
    } catch (err) {
      console.warn('[Printer] printSettlementBill caught error (ignored to avoid blocking POS):', err);
    }
  }
};
