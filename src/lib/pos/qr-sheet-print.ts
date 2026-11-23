import { Platform } from 'react-native';
import { printInPage } from '@/lib/pos/kitchen-invoice-export';
import { qrSheetHtml, tableLink, type QrTable } from '@/lib/pos/qr-table-utils';
import type { ServiceResult } from '@/lib/pos/kitchen-types';

/**
 * Task 332: prints the QR cards of the given tables, four to an A4 sheet. A browser prints from a hidden
 * frame (no pop-up); a phone shares a PDF (needs a build with expo-print and expo-sharing).
 */
export async function printQrSheet(branch: string, tables: readonly QrTable[], origin: string): Promise<ServiceResult<boolean>> {
  try {
    if (tables.length === 0) return { data: null, error: 'There are no tables to print.' };
    const { PRINT_LOGO_DATA_URI } = await import('@/lib/pos/kitchen-print-logo');
    const html = qrSheetHtml(branch, tables.map((t) => ({ label: t.label, link: tableLink(origin, t.code) })), PRINT_LOGO_DATA_URI);
    if (Platform.OS === 'web') return printInPage(html);
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    if (!await Sharing.isAvailableAsync()) return { data: null, error: 'PDF sharing is unavailable on this device.' };
    const file = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Table QR codes' });
    return { data: true, error: null };
  } catch {
    return { data: null, error: 'Unable to print the QR codes. Please try again.' };
  }
}
