import { printerService as newPrinterService } from '../printer/printer-service';
import type { PosOrderItem, KotTicket } from './order-types';

/**
 * Printing never holds up saving an order. The cashier used to wait for every
 * KOT and bill to reach PrintNode before the order was saved; now each job
 * joins this queue and the call returns at once. Jobs still run one at a time,
 * so tickets come out in the order they were sent (KOT before its bill).
 * Both printers catch their own errors and alert the cashier.
 */
let printQueue: Promise<void> = Promise.resolve();
function enqueuePrint(job: () => Promise<void>): Promise<void> {
  printQueue = printQueue.then(job).catch((err: unknown) => console.warn('[Printer] Background print failed:', err));
  return Promise.resolve();
}

export const printerService = {
  /**
   * Queues a kitchen ticket on the production-grade kitchen ticket printer.
   */
  printKot: async (kotNumber: number, items: { name: string; quantity: number; notes?: string | null }[], isCancel: boolean = false) => {
    const snapshot = items.map(item => ({ ...item }));
    return enqueuePrint(() => newPrinterService.printKot(kotNumber, snapshot, isCancel));
  },

  /**
   * Queues a bill on the production-grade billing/provisional printer.
   * Pass `kots` to include the Kitchen Tickets audit section on the receipt.
   */
  printBill: async (
    orderName: string,
    invoiceNumber: string | null | undefined,
    items: PosOrderItem[],
    totalAmount: number,
    isFinal = false,
    paymentMethod?: string | null,
    kots?: Pick<KotTicket, 'kot_number' | 'created_at'>[],
    discountAmount = 0,
    discountType: 'percent' | 'fixed' | null = null,
    discountValue = 0
  ) => {
    // The store may replace these arrays after the call returns; print what was sent.
    const itemSnapshot = items.map(item => ({ ...item }));
    const kotSnapshot = kots?.map(kot => ({ ...kot }));
    return enqueuePrint(() => newPrinterService.printBill(
      orderName,
      invoiceNumber,
      itemSnapshot,
      totalAmount,
      isFinal,
      paymentMethod ?? null,
      kotSnapshot,
      discountAmount,
      discountType,
      discountValue
    ));
  }
};
