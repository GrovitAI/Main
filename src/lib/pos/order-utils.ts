import type { OpenOrderItem } from './order-types';

export const TAX_RATE = 0.05;

export function calculateOrderSubtotal(items: OpenOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
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

export function formatOrderLabel(tableLabel: string | null, orderId: string): string {
  if (tableLabel && tableLabel.trim().length > 0) {
    return tableLabel.trim();
  }
  return `Order ${orderId.slice(0, 8)}`;
}
