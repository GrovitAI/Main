import type { OpenOrderItem } from './order-types';

export const TAX_RATE = 0.00;

export function calculateOrderSubtotal(items: OpenOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty * item.price, 0);
}

export function calculateTax(subtotal: number, taxRate: number = TAX_RATE): number {
  return subtotal * taxRate;
}

export function calculateOrderTotal(
  subtotal: number,
  taxRate: number = TAX_RATE,
): number {
  return subtotal + calculateTax(subtotal, taxRate);
}

/**
 * Rounds a money amount up to the next whole rupee.
 *
 * Applied to the grand total at branches that charge GST, so a bill is never
 * settled in paise. The difference appears on the bill as "Round Off". The
 * taxable value and the tax itself stay exact, which is what GST records need.
 *
 * toFixed first: floating point can leave 410.00000000001, which must round
 * to 410 rather than 411.
 */
export function roundUpToWholeRupee(amount: number): number {
  return Math.ceil(Number(amount.toFixed(2)));
}

export function formatPosOrderName(orderNumber: number): string {
  return `Order #${orderNumber}`;
}

export function formatOrderLabel(orderName: string | null, orderId: string): string {
  if (orderName && orderName.trim().length > 0) {
    return orderName.trim();
  }
  return `Order ${orderId.slice(0, 8)}`;
}
