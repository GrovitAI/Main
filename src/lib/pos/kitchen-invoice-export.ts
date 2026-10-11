import { Platform } from 'react-native';
import { fetchKitchenInvoice } from '@/lib/pos/kitchen-invoice-service';
import { kitchenInvoiceHtml } from '@/lib/pos/kitchen-invoice-utils';
import type { ServiceResult } from '@/lib/pos/kitchen-types';

/** Open the browser window during the tap, then fetch fresh payment status. */
export async function exportKitchenInvoice(id: string): Promise<ServiceResult<boolean>> {
  let printWindow: Window | null = null;
  try {
    if (Platform.OS === 'web') {
      printWindow = window.open('', '_blank');
      if (!printWindow) return { data: null, error: 'Allow pop-ups for this app, then try Print / PDF again.' };
      printWindow.opener = null;
      printWindow.document.title = 'Preparing invoice';
    }
    const result = await fetchKitchenInvoice(id);
    if (!result.data || result.error) { printWindow?.close(); return { data: null, error: result.error ?? 'Unable to prepare the invoice.' }; }
    const html = kitchenInvoiceHtml(result.data);
    if (printWindow) {
      printWindow.document.open(); printWindow.document.write(html); printWindow.document.close();
      printWindow.focus(); printWindow.print();
    } else {
      const Print = await import('expo-print'); const Sharing = await import('expo-sharing');
      if (!await Sharing.isAvailableAsync()) return { data: null, error: 'PDF sharing is unavailable on this device.' };
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Kitchen invoice' });
    }
    return { data: true, error: null };
  } catch { printWindow?.close(); return { data: null, error: 'Unable to export the invoice. Please try again.' }; }
}
