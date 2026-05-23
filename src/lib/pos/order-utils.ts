import type { OpenOrderItem } from './order-types';

export function calculateOrderSubtotal(items: OpenOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

export function formatOrderLabel(tableLabel: string | null, orderId: string): string {
  if (tableLabel && tableLabel.trim().length > 0) {
    return tableLabel.trim();
  }
  return `Order ${orderId.slice(0, 8)}`;
}
