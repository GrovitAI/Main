import { printerService as newPrinterService } from '../printer/printer-service';
import type { PosOrderItem } from './order-types';

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
   */
  printBill: (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: PosOrderItem[],
    totalAmount: number,
    isFinal = false,
    paymentMethod?: string | null
  ) => {
    if (isFinal) {
      newPrinterService.printBill(orderName, invoiceNumber, items, totalAmount, true, paymentMethod).catch(err => {
        console.warn('Deferred printSettlementBill failure:', err);
      });
    } else {
      newPrinterService.printBill(orderName, invoiceNumber, items, totalAmount, false, paymentMethod).catch(err => {
        console.warn('Deferred printBill failure:', err);
      });
    }
  }
};
