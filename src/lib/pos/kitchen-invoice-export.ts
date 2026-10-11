import { Platform } from 'react-native';
import { kitchenInvoiceHtml } from '@/lib/pos/kitchen-invoice-utils';
import type { KitchenInvoice } from '@/lib/pos/kitchen-invoice-types';
import type { ServiceResult } from '@/lib/pos/kitchen-types';

/**
 * Web prints from a hidden frame inside the page, so no pop-up window is opened
 * and pop-up blockers never interfere. Call it straight from the tap: the
 * invoice is already loaded (the preview fetched fresh status), so nothing is
 * awaited before print().
 */
function printInPage(html: string): ServiceResult<boolean> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const view = frame.contentWindow;
  if (!view) { frame.remove(); return { data: null, error: 'Unable to open the print dialog. Please try again.' }; }
  view.document.open(); view.document.write(html); view.document.close();
  let removed = false;
  const remove = (): void => { if (!removed) { removed = true; frame.remove(); } };
  view.addEventListener('afterprint', () => setTimeout(remove, 500), { once: true });
  setTimeout(remove, 60000);
  view.focus(); view.print();
  return { data: true, error: null };
}

/** Print / Save PDF on web; Share PDF on a phone (needs a build with expo-print and expo-sharing). */
export async function printKitchenInvoice(invoice: KitchenInvoice, checkedAt: Date): Promise<ServiceResult<boolean>> {
  try {
    const html = kitchenInvoiceHtml(invoice, checkedAt);
    if (Platform.OS === 'web') return printInPage(html);
    const Print = await import('expo-print'); const Sharing = await import('expo-sharing');
    if (!await Sharing.isAvailableAsync()) return { data: null, error: 'PDF sharing is unavailable on this device.' };
    const file = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Kitchen invoice' });
    return { data: true, error: null };
  } catch { return { data: null, error: 'Unable to print the invoice. Please try again.' }; }
}
