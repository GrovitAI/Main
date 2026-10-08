import type { KitchenReport, KitchenReportFilter } from '@/lib/pos/kitchen-analytics-types';

export function kitchenToday(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find(value => value.type === type)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

export function shiftKitchenMonth(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return String(date.getUTCFullYear()).padStart(4, '0') + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}

export function kitchenMonthLabel(month: string): string {
  return new Date(month + '-01T12:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Escape CSV syntax and neutralize spreadsheet formulas in user-entered names. */
export function kitchenCsvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/** Export rows and totals originate from the same, filtered database snapshot. */
export function kitchenReportCsv(report: KitchenReport, filter: KitchenReportFilter): string {
  const money = (paise: number): string => (paise / 100).toFixed(2);
  const rows: (string | number | null)[][] = [
    ['Central Kitchen', filter.report, filter.month, 'Currency: INR', 'Goods supplied are kitchen sales; pay-later status is recorded at entry, not current debt.'],
    ['Entry ID', 'Date', 'Source', 'Branch / vendor', 'Category', 'Item', 'Quantity', 'Unit', 'Unit price INR', 'Value INR', 'Payment at entry', 'Mode', 'Cash received INR', 'Cash paid INR'],
    ...report.rows.map(row => [row.entry_id, row.date, row.source, row.party, row.category, row.item, row.quantity, row.unit,
      row.price_paise === null ? null : money(row.price_paise), money(row.amount_paise), row.payment, row.mode,
      money(row.money_in_paise), money(row.money_out_paise)]),
    [null, null, 'TOTAL', null, null, null, null, null, null, money(report.filtered_paise), null, null, money(report.filtered_in_paise), money(report.filtered_out_paise)],
  ];
  return '\uFEFF' + rows.map(row => row.map(kitchenCsvCell).join(',')).join('\r\n');
}
