import { printerService as newPrinterService } from '../printer/printer-service';
import type { PosOrderItem, KotTicket } from './order-types';

export const printerService = {
  /**
   * Delegates to the production-grade kitchen ticket printer.
   */
  printKot: (kotNumber: number, items: { name: string; quantity: number }[]) => {
    newPrinterService.printKot(kotNumber, items).catch(err => {
      console.warn('Deferred printKot failure:', err);
    });
  },

  /**
   * Delegates to the production-grade billing/provisional printer.
   * Pass `kots` to include the Kitchen Tickets audit section on the receipt.
   */
  printBill: (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: PosOrderItem[],
    totalAmount: number,
    isFinal = false,
    paymentMethod?: string | null,
    kots?: Pick<KotTicket, 'kot_number' | 'created_at'>[]
  ) => {
    newPrinterService.printBill(
      orderName,
      invoiceNumber,
      items,
      totalAmount,
      isFinal,
      paymentMethod ?? null,
      kots
    ).catch(err => {
      console.warn('Deferred printBill failure:', err);
    });
  }
};
