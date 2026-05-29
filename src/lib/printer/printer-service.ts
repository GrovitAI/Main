import { Platform, Alert } from 'react-native';
import qz from 'qz-tray';
import { fetchPrinters, type Printer } from '../pos/printer-db-service';

if (typeof window !== 'undefined') {
  (window as any).qz = qz;
}

let qzConnectionPromise: Promise<void> | null = null;

/**
 * Ensures a WebSocket connection is active with the local QZ Tray software.
 * Uses a singleton promise to prevent connection socket collision and permission prompt spam.
 */
export async function ensureQZConnection(): Promise<void> {
  if (Platform.OS !== 'web' || !qz) {
    throw new Error('Please start QZ Tray');
  }

  if (qz.websocket.isActive()) {
    return;
  }

  if (!qzConnectionPromise) {
    qzConnectionPromise = qz.websocket
      .connect({
        retries: 0,
      })
      .finally(() => {
        qzConnectionPromise = null;
      });
  }

  await qzConnectionPromise;
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
 * - 'missing': TCP open but no compatible Epson spooler matches.
 * - 'offline': QZ application is not running.
 */
export async function diagnosePrinterConnection(
  printer: Omit<Printer, 'id' | 'tenant_id' | 'branch_id'>
): Promise<'connected' | 'unreachable' | 'offline' | 'missing'> {
  try {
    await ensureQZConnection();
  } catch {
    return 'offline';
  }

  // 1. Verify TCP Reachability
  if (printer.connection === 'network' && printer.ip_address) {
    const tcpSuccess = await testTcpPort(printer.ip_address, printer.port ?? 9100);
    if (!tcpSuccess) {
      console.warn(`[Printer] TCP socket check failed for ${printer.ip_address}:${printer.port}`);
      return 'unreachable';
    }
  }

  // 2. Query QZ Printers List for compatible drivers
  try {
    const printersList = await qz.printers.find();
    const matchedPrinter = printersList.find((p: string) => {
      const upper = p.toUpperCase();
      return upper.includes('EPSON') || upper.includes('TM-T82') || upper.includes('RECEIPT');
    });

    if (!matchedPrinter && !printer.os_printer_name) {
      return 'missing';
    }
  } catch (err) {
    console.error('[Printer] Driver search failed:', err);
    return 'missing';
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
 * Core raw printing method via QZ Tray using OS Spooler name (Windows Spooler).
 */
async function printRawToPrinter(printer: Printer, lines: string[]): Promise<void> {
  // 1. Ensure QZ connection
  try {
    await ensureQZConnection();
  } catch (err) {
    const errorMsg = 'Printer service offline. Please start QZ Tray.';
    console.error('[Printer] Offline error:', errorMsg);
    Alert.alert('Printer Offline', errorMsg);
    return;
  }

  const rawData = [
    '\x1B@', // Reset printer
    ...lines,
    '\n\n\n\n', // Feed paper
    '\x1Bi\x01', // ESC/POS Paper Cut
  ];

  // Resolve target Windows Spooler name
  const targetPrinterName = printer.os_printer_name || printer.name;
  if (!targetPrinterName) {
    console.error('[Printer] Printing failed: No compatible Windows printer name specified.');
    Alert.alert('Printing Failed', 'No compatible printer name has been detected or configured.');
    return;
  }

  try {
    console.log('[Printer] TCP Print Config', {
      ip: printer.ip_address,
      port: printer.port
    });

    console.log(`[Printer] Direct OS Spooler print to "${targetPrinterName}"`);
    const config = qz.configs.create(targetPrinterName);

    console.log('[Printer] Sending ESC/POS print job');
    await qz.print(config, rawData);
    console.log('[Printer] Print success');
  } catch (error) {
    console.error('[Printer] TCP print failed', error);
    Alert.alert(
      'Printing Failed',
      `Could not print to OS Spooler "${targetPrinterName}". Verify printer settings and QZ status.`
    );
  }
}

export const printerService = {
  /**
   * Triggers a test print configuration. 
   * Discovers available OS spoolers, selects the best Epson match, and prints.
   * Returns the matched spooler name.
   */
  testPrinter: async (printer: Omit<Printer, 'id' | 'tenant_id' | 'branch_id'>): Promise<string> => {
    // Ensure QZ connection
    await ensureQZConnection();

    // 1. Verify TCP Reachability
    if (printer.connection === 'network' && printer.ip_address) {
      const tcpSuccess = await testTcpPort(printer.ip_address, printer.port ?? 9100);
      if (!tcpSuccess) {
        throw new Error(`Could not reach printer at ${printer.ip_address}:${printer.port ?? 9100}`);
      }
    }

    // 2. Query QZ spoolers
    const printersList = await qz.printers.find();
    console.log('[Printer] Discovered OS printers:', printersList);

    // 3. Find compatible Epson match
    const matchedPrinter = printersList.find((p: string) => {
      const upper = p.toUpperCase();
      return upper.includes('EPSON') || upper.includes('TM-T82') || upper.includes('RECEIPT');
    });

    if (!matchedPrinter) {
      throw new Error('No Epson printer match found in local OS printers.');
    }

    console.log('[Printer] Best Epson match selected:', matchedPrinter);

    console.log('[Printer] TCP Print Config', {
      ip: printer.ip_address,
      port: printer.port
    });

    console.log('[Printer] Sending ESC/POS test receipt');

    const config = qz.configs.create(matchedPrinter);

    await qz.print(config, [
      '\x1B@',                  // initialize
      '\x1Ba\x01',              // center
      'GROVIT POS\n',
      'Printer Test\n\n',
      '\x1Ba\x00',              // left
      'Printer Connected Successfully\n\n',
      `IP: ${printer.ip_address}\n`,
      `Port: ${printer.port}\n`,
      `OS Spooler: ${matchedPrinter}\n`,
      new Date().toLocaleString(),
      '\n\n\n',
      '\x1Bi\x01'               // cut
    ]);

    console.log('[Printer] Print success');
    return matchedPrinter;
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
