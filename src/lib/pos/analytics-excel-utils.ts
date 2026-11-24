/**
 * Task 338: the POS Analytics report as one Excel workbook: a Summary of the period's figures, then
 * Daily sales, Hourly sales, Item sales, Payments and every Transaction, each on its own sheet with
 * numbers as numbers. It is made from what is already on screen plus the transactions (read when the
 * export is asked for), so the figures match the dashboard.
 */
import type { AnalyticsDashboard, TransactionRow } from '@/lib/analytics/analytics-service';
import { MONEY_FORMAT, type SheetCell, type SheetSpec } from '@/lib/pos/xlsx-export';

export type AnalyticsExcelInput = {
  startDate: string;
  endDate: string;
  /** "All branches" or the branch's name. */
  branchLabel: string;
  /** "All hours" or the business hours, for example "09:00 to 23:00". */
  hoursLabel: string;
  dashboard: AnalyticsDashboard;
  transactions: readonly TransactionRow[];
};

const round2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** "2026-11-03 14:05" in the viewer's time, or the text as it came when it is not a date. */
export function dateTimeText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function analyticsSheets(input: AnalyticsExcelInput): SheetSpec[] {
  const { dashboard: d } = input;
  const k = d.kpis;
  const summary: SheetCell[][] = [
    ['Le Laban sales report', null],
    ['Period', `${input.startDate} to ${input.endDate}`],
    ['Branch', input.branchLabel],
    ['Hours', input.hoursLabel],
    ['Currency', 'INR'],
    [null, null],
    ['Total sales', round2(k.totalSales)],
    ['Orders', k.totalOrders],
    ['Average order value', round2(k.avgOrderValue)],
    ['Items sold', k.itemsSold],
    ['Tax collected', round2(k.taxCollected)],
    ['Discounts', round2(k.totalDiscounts)],
    ['Collected revenue', round2(k.collectedRevenue)],
    ['Pending collections', round2(k.pendingCollections)],
    ['Cancelled orders', k.cancelledOrders],
    ['Cancelled sales', round2(k.cancelledSales)],
  ];
  const orders = new Map(d.ordersByDay.map((p) => [p.label, p.orders]));
  const daily: SheetCell[][] = [['Day', 'Sales INR', 'Orders'], ...d.salesByDay.map((p): SheetCell[] => [p.label, round2(p.sales), orders.get(p.label) ?? p.orders])];
  const hourly: SheetCell[][] = [['Hour', 'Sales INR'], ...d.salesByHour.map((h): SheetCell[] => [h.hour, round2(h.sales)])];
  const items: SheetCell[][] = [
    ['Menu item', 'Quantity sold', 'Sales INR'],
    ...d.itemWiseReport.map((i): SheetCell[] => [i.item_name, i.qty, round2(i.revenue)]),
  ];
  const payments: SheetCell[][] = [['Payment type', 'Total INR'], ...d.paymentSplit.map((p): SheetCell[] => [p.payment_type, round2(p.total)])];
  const transactions: SheetCell[][] = [
    ['Bill number', 'Date and time', 'Branch', 'Items', 'Subtotal INR', 'Tax INR', 'Discount INR', 'Total INR', 'Status'],
    ...input.transactions.map((t): SheetCell[] => [t.invoice_number, dateTimeText(t.created_at), t.branch_name, t.items_summary,
      round2(t.subtotal), round2(t.tax_amount), round2(t.discount_amount), round2(t.total_amount), t.status.toUpperCase()]),
  ];
  return [
    { name: 'Summary', rows: summary, widths: [26, 34], formats: { 1: MONEY_FORMAT } },
    { name: 'Daily sales', rows: daily, headerRow: 0, formats: { 1: MONEY_FORMAT } },
    { name: 'Hourly sales', rows: hourly, headerRow: 0, formats: { 1: MONEY_FORMAT } },
    { name: 'Item sales', rows: items, headerRow: 0, formats: { 2: MONEY_FORMAT } },
    { name: 'Payments', rows: payments, headerRow: 0, formats: { 1: MONEY_FORMAT } },
    { name: 'Transactions', rows: transactions, headerRow: 0, widths: [16, 18, 20, 50, 14, 12, 14, 14, 12], formats: { 4: MONEY_FORMAT, 5: MONEY_FORMAT, 6: MONEY_FORMAT, 7: MONEY_FORMAT } },
  ];
}
