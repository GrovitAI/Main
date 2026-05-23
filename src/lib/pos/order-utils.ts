import type { OpenOrderItem } from './order-types';

export const TAX_RATE = 0.05;

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

export function formatPosOrderName(orderNumber: number): string {
  return `Order #${orderNumber}`;
}

export function formatOrderLabel(orderName: string | null, orderId: string): string {
  if (orderName && orderName.trim().length > 0) {
    return orderName.trim();
  }
  return `Order ${orderId.slice(0, 8)}`;
}
