import { fetchPrintersCached, type Printer } from '@/lib/pos/printer-db-service';
import { diagnosePrinterConnection } from '@/lib/printer/printer-service';

/**
 * The branch's printers from the shared five-minute cache; the health check
 * runs on a timer. Bills, first prints and reprints alike, print through
 * src/lib/printer/printer-service.ts (task 320).
 */
async function loadBranchPrinters(forceFresh = false): Promise<{ printers: Printer[] | null; error: string | null }> {
  const res = await fetchPrintersCached(forceFresh);
  if (res.error || !res.data) return { printers: null, error: res.error || 'No printers configured.' };
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
