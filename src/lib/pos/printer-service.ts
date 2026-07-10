import { printerService as newPrinterService } from '../printer/printer-service';
import type { PosOrderItem, KotTicket } from './order-types';

export const printerService = {
  /**
   * Delegates to the production-grade kitchen ticket printer.
   */
  printKot: async (kotNumber: number, items: { name: string; quantity: number }[]) => {
    return newPrinterService.printKot(kotNumber, items);
  },

  /**
   * Delegates to the production-grade billing/provisional printer.
   * Pass `kots` to include the Kitchen Tickets audit section on the receipt.
   */
  printBill: async (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: PosOrderItem[],
    totalAmount: number,
    isFinal = false,
    paymentMethod?: string | null,
    kots?: Pick<KotTicket, 'kot_number' | 'created_at'>[]
  ) => {
    return newPrinterService.printBill(
      orderName,
      invoiceNumber,
      items,
      totalAmount,
      isFinal,
      paymentMethod ?? null,
      kots
    );
  }
};
