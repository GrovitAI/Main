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

export type KitchenDateRange = { startDate: string; endDate: string };

/** Calendar dates stay timezone-free; India time is used only for today's cutoff. */
export function validKitchenDate(value: string): boolean {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function kitchenMonthRange(month: string, today = kitchenToday()): KitchenDateRange {
  const nextMonth = shiftKitchenMonth(month, 1);
  const last = new Date(nextMonth + '-01T12:00:00Z');
  last.setUTCDate(0);
  return { startDate: month + '-01', endDate: month === today.slice(0, 7) ? today : last.toISOString().slice(0, 10) };
}

export function kitchenReportRange(filter: KitchenReportFilter): KitchenDateRange {
  if (filter.startDate !== undefined || filter.endDate !== undefined) {
    if (!filter.startDate || !filter.endDate || !validKitchenDate(filter.startDate) || !validKitchenDate(filter.endDate) || filter.endDate < filter.startDate) {
      throw new Error('Invalid report dates');
    }
    return { startDate: filter.startDate, endDate: filter.endDate };
  }
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(filter.month)) throw new Error('Invalid report month');
  return kitchenMonthRange(filter.month);
}

export function kitchenRangeLabel(range: KitchenDateRange): string {
  const label = (value: string, year: boolean): string => new Date(value + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' as const } : {}), timeZone: 'Asia/Kolkata' });
  return label(range.startDate, range.startDate.slice(0, 4) !== range.endDate.slice(0, 4)) + ' – ' + label(range.endDate, true);
}

export function kitchenCalendarDays(month: string): readonly { key: string; date: string | null }[] {
  const first = new Date(month + '-01T12:00:00Z');
  const offset = first.getUTCDay();
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  const cells = Math.ceil((offset + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(first); date.setUTCDate(index - offset + 1);
    const value = date.toISOString().slice(0, 10);
    return { key: String(index), date: value.slice(0, 7) === month ? value : null };
  });
}

/** Escape CSV syntax and neutralize spreadsheet formulas in user-entered names. */
export function kitchenCsvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/** Export rows and totals originate from the same, filtered database snapshot. */
export function kitchenReportCsv(report: KitchenReport, filter: KitchenReportFilter): string {
  const range = kitchenReportRange(filter);
  const money = (paise: number): string => (paise / 100).toFixed(2);
  const rows: (string | number | null)[][] = [
    ['Central Kitchen', filter.report, range.startDate + ' through ' + range.endDate, 'Currency: INR', 'India calendar dates, inclusive. Goods supplied are kitchen sales; pay-later status is recorded at entry, not current debt.'],
    ['Entry ID', 'Date', 'Source', 'Branch / vendor', 'Category', 'Item', 'Quantity', 'Unit', 'Unit price INR', 'Value INR', 'Payment at entry', 'Mode', 'Money in INR', 'Money out INR', 'Cost INR'],
    ...report.rows.map(row => [row.entry_id, row.date, row.source, row.party, row.category, row.item, row.quantity, row.unit,
      row.price_paise === null ? null : money(row.price_paise), money(row.amount_paise), row.payment, row.mode,
      money(row.money_in_paise), money(row.money_out_paise), row.cost_paise === null ? null : money(row.cost_paise)]),
    [null, null, 'TOTAL', null, null, null, null, null, null, money(report.filtered_paise), null, null, money(report.filtered_in_paise), money(report.filtered_out_paise),
      filter.report === 'profit' ? money(report.summary.cost_paise) : null],
  ];
  return '\uFEFF' + rows.map(row => row.map(kitchenCsvCell).join(',')).join('\r\n');
}
