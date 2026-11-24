import * as XLSX from 'xlsx';
import { fitWidths, setXlsxLoader, sheetTabName, workbookBytes, type SheetSpec } from '@/lib/pos/xlsx-export';
import { kitchenReportSheets } from '@/lib/pos/kitchen-analytics-utils';
import type { KitchenReport } from '@/lib/pos/kitchen-analytics-types';

setXlsxLoader(async () => XLSX);

async function open(sheets: readonly SheetSpec[]): Promise<XLSX.WorkBook> {
  return XLSX.read(await workbookBytes(sheets), { type: 'array', cellNF: true, cellStyles: true });
}

describe('sheetTabName', () => {
  it('keeps to what Excel allows and never repeats a name', () => {
    expect(sheetTabName('Item sales: Q1/Q2 [draft]?', new Set())).toBe('Item sales Q1 Q2 draft');
    expect(sheetTabName('x'.repeat(50), new Set())).toHaveLength(31);
    expect(sheetTabName('Report', new Set(['report']))).toBe('Report (2)');
    expect(sheetTabName('Report', new Set(['Report', 'Report (2)']))).toBe('Report (3)');
    expect(sheetTabName('   ', new Set())).toBe('Sheet');
  });
});

describe('fitWidths', () => {
  it('fits the longest cell, between 8 and 60 characters', () => {
    expect(fitWidths([['a', 'a much longer heading'], ['bb', 12345]])).toEqual([8, 23]);
    expect(fitWidths([['y'.repeat(200)]])).toEqual([60]);
  });
});

describe('the workbook', () => {
  it('keeps numbers as numbers with their format, text as text, and a filter on the heading row', async () => {
    const book = await open([{ name: 'Data', rows: [['Name', 'Amount'], ['Milk', 1234.5], [null, 2], ['=1+1', 3]], formats: { 1: '#,##0.00' }, headerRow: 0 }]);
    const sheet = book.Sheets['Data'];
    expect(sheet).toBeDefined();
    if (!sheet) return;
    expect(sheet['B2']).toMatchObject({ t: 'n', v: 1234.5, z: '#,##0.00' });
    expect(sheet['A2']).toMatchObject({ t: 's', v: 'Milk' });
    expect(sheet['A3']).toBeUndefined();
    // Typed text that looks like a formula stays text.
    expect(sheet['A4']).toMatchObject({ t: 's', v: '=1+1' });
    expect(sheet['!autofilter']?.ref).toBe('A1:B4');
    expect(sheet['!cols']?.[0]?.wch ?? 0).toBeGreaterThanOrEqual(8);
  });

  it('makes one sheet for each spec, with names Excel accepts', async () => {
    const book = await open([{ name: 'Report', rows: [['a']] }, { name: 'Report', rows: [['b']] }]);
    expect(book.SheetNames).toEqual(['Report', 'Report (2)']);
  });
});

describe('kitchenReportSheets', () => {
  const report: KitchenReport = {
    summary: { sales_paise: 1234500, purchases_paise: 500000, expenses_paise: 25000, cash_in_paise: 900000, cash_out_paise: 300000, cost_paise: 700000, cost_missing_items: 0, cost_missing_sales_paise: 0 },
    total_rows: 2, filtered_paise: 1234500, filtered_in_paise: 0, filtered_out_paise: 0,
    rows: [
      { key: 'a', kind: 'sale', entry_id: 'e1', date: '2026-11-03', party_id: 'p1', party: 'Kolathur', item_id: 'i1', item: 'Fazea base', unit: 'pcs', quantity: 12, price_paise: 14000, amount_paise: 168000, documents: 1, category: 'Bases', source: 'Sent', payment: null, mode: null, money_in_paise: 0, money_out_paise: 0, cost_paise: 91570 },
      { key: 'b', kind: 'sale', entry_id: 'e2', date: '2026-11-04', party_id: 'p2', party: 'Velachery', item_id: 'i2', item: '=cmd|calc', unit: 'kg', quantity: 1.25, price_paise: null, amount_paise: 99950, documents: 1, category: null, source: 'Sent', payment: null, mode: null, money_in_paise: 0, money_out_paise: 0, cost_paise: null },
    ],
    options: { branches: [], items: [], vendors: [], categories: [] },
  };
  const filter = { month: '2026-09', report: 'sales' as const };

  it('has a Report sheet with amounts in rupees as numbers and a total, and a Summary sheet', async () => {
    const book = await open(kitchenReportSheets(report, filter));
    expect(book.SheetNames).toEqual(['Report', 'Summary']);
    const sheet = book.Sheets['Report'];
    if (!sheet) throw new Error('no Report sheet');
    expect(sheet['A1']?.v).toBe('Entry ID');
    expect(sheet['G2']).toMatchObject({ t: 'n', v: 12 });
    expect(sheet['I2']).toMatchObject({ t: 'n', v: 140, z: '#,##0.00' });
    expect(sheet['J2']).toMatchObject({ t: 'n', v: 1680 });
    expect(sheet['G3']?.v).toBe(1.25);
    expect(sheet['I3']).toBeUndefined();
    // A name that looks like a formula is text.
    expect(sheet['F3']).toMatchObject({ t: 's', v: '=cmd|calc' });
    expect(sheet['C4']?.v).toBe('TOTAL');
    expect(sheet['J4']?.v).toBe(12345);
    expect(sheet['O4']).toBeUndefined();
    const summary = book.Sheets['Summary'];
    if (!summary) throw new Error('no Summary sheet');
    expect(summary['B2']?.v).toBe('Item sales to branches');
    expect(summary['B3']?.v).toBe('2026-09-01 to 2026-09-30');
    expect(summary['B6']?.v).toBe(12345);
    expect(JSON.stringify(summary)).not.toContain('Cost of goods sent');
  });

  it('adds the cost for the profit report and names the all-spending view', async () => {
    const profit = await open(kitchenReportSheets(report, { ...filter, report: 'profit' }));
    expect(JSON.stringify(profit.Sheets['Summary'])).toContain('Cost of goods sent');
    expect(profit.Sheets['Report']?.['O4']?.v).toBe(7000);
    const spending = await open(kitchenReportSheets(report, { ...filter, report: 'purchases', includeExpenses: true }));
    expect(spending.Sheets['Summary']?.['B2']?.v).toBe('All spending by category');
  });
});

describe('analyticsSheets', () => {
  // The dynamic imports are avoided here: the utilities are pure.
  const { analyticsSheets, dateTimeText } = require('@/lib/pos/analytics-excel-utils') as typeof import('@/lib/pos/analytics-excel-utils');
  const dashboard = {
    kpis: { totalSales: 10523.456, totalOrders: 40, avgOrderValue: 263.09, itemsSold: 120, taxCollected: 500, cancelledOrders: 2, collectedRevenue: 9000, pendingCollections: 1523.46, totalDiscounts: 80, cancelledSales: 300 },
    salesByDay: [{ label: '2026-11-01', sales: 5000.5, orders: 20 }, { label: '2026-11-02', sales: 5522.956, orders: 20 }],
    ordersByDay: [{ label: '2026-11-01', sales: 5000.5, orders: 21 }],
    salesByHour: [{ hour: '12:00', sales: 2000 }],
    paymentSplit: [{ payment_type: 'cash', total: 6000 }, { payment_type: 'upi', total: 4523.46 }],
    rawTransactions: [], itemWiseReport: [{ item_name: 'Cheese bomb', qty: 30, revenue: 5460 }], topSellingItems: [], leastSellingItems: [], highestRevenueItems: [],
  };
  const tx = [{ id: 'b1', invoice_number: 'KLT-0001', created_at: '2026-11-01T08:30:00.000Z', branch_name: 'Kolathur', items_summary: '2 x Cheese bomb', subtotal: 364, tax_amount: 18.2, discount_amount: 0, total_amount: 382.2, status: 'paid' }];

  it('makes the six sheets, with the figures as numbers', async () => {
    const sheets = analyticsSheets({ startDate: '2026-11-01', endDate: '2026-11-02', branchLabel: 'All branches', hoursLabel: 'All hours', dashboard, transactions: tx });
    const book = await open(sheets);
    expect(book.SheetNames).toEqual(['Summary', 'Daily sales', 'Hourly sales', 'Item sales', 'Payments', 'Transactions']);
    expect(book.Sheets['Summary']?.['B2']?.v).toBe('2026-11-01 to 2026-11-02');
    expect(book.Sheets['Summary']?.['B7']).toMatchObject({ t: 'n', v: 10523.46, z: '#,##0.00' });
    expect(book.Sheets['Summary']?.['B8']?.v).toBe(40);
    // Orders come from the orders series where it has the day, and the sales series otherwise.
    expect(book.Sheets['Daily sales']?.['C2']?.v).toBe(21);
    expect(book.Sheets['Daily sales']?.['C3']?.v).toBe(20);
    expect(book.Sheets['Daily sales']?.['B3']?.v).toBe(5522.96);
    expect(book.Sheets['Item sales']?.['B2']?.v).toBe(30);
    expect(book.Sheets['Payments']?.['B3']?.v).toBe(4523.46);
    const t = book.Sheets['Transactions'];
    expect(t?.['A2']?.v).toBe('KLT-0001');
    expect(t?.['H2']).toMatchObject({ t: 'n', v: 382.2 });
    expect(t?.['I2']?.v).toBe('PAID');
  });

  it('writes a date and time in the viewer\'s own time, or leaves text it cannot read', () => {
    expect(dateTimeText('2026-11-01T08:30:00.000Z')).toMatch(/^2026-11-01 \d{2}:\d{2}$/);
    expect(dateTimeText('not a date')).toBe('not a date');
  });
});
