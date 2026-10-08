import { kitchenCsvCell, kitchenMonthLabel, kitchenReportCsv, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { parseKitchenReport } from '@/lib/pos/kitchen-analytics-service';

jest.mock('@/lib/pos/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: () => ({ id: 'kitchen' }) }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: () => ({ tenant_id: 'tenant' }) }));

const response = () => ({
  summary: { sales_paise: '17525', purchases_paise: 10000, expenses_paise: 0, cash_in_paise: 1000, cash_out_paise: 0 },
  total_rows: 1, filtered_paise: '17525', filtered_in_paise: 0, filtered_out_paise: 0,
  rows: [{ key: 'line', kind: 'entry', entry_id: 'send', date: '2026-10-01', party_id: 'branch', party: '=HYPERLINK("x")',
    item_id: 'item', item: 'Sauce, "special"', unit: 'kg', quantity: '1.25', price_paise: 14020, amount_paise: '17525',
    documents: 1, category: null, source: 'Goods supplied', payment: null, mode: null, money_in_paise: 0, money_out_paise: 0 }],
  options: { branches: [], items: [], vendors: [], categories: [] },
});

describe('Kitchen report dates and exports', () => {
  it('uses the India calendar at UTC month boundaries', () => {
    expect(kitchenToday(new Date('2026-09-30T18:29:59Z'))).toBe('2026-09-30');
    expect(kitchenToday(new Date('2026-09-30T18:30:00Z'))).toBe('2026-10-01');
    expect(shiftKitchenMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftKitchenMonth('2025-12', 1)).toBe('2026-01');
    expect(kitchenMonthLabel('2026-02')).toBe('February 2026');
  });
  it('parses Postgres numeric strings without losing unit or paise precision', () => {
    const report = parseKitchenReport(response());
    expect(report.rows[0].quantity).toBe(1.25);
    expect(report.rows[0].amount_paise).toBe(17525);
    expect(report.filtered_paise).toBe(17525);
  });
  it('rejects incomplete or unsafe report numbers instead of displaying zero', () => {
    expect(() => parseKitchenReport({ ...response(), filtered_paise: undefined })).toThrow();
    expect(() => parseKitchenReport({ ...response(), filtered_paise: '9007199254740993' })).toThrow();
  });
  it('exports exact amounts, units and a matching totals row', () => {
    const csv = kitchenReportCsv(parseKitchenReport(response()), { month: '2026-10', report: 'sales' });
    expect(csv).toContain('"1.25","kg","140.20","175.25"');
    expect(csv).toContain('"TOTAL"');
    expect(csv.match(/"175.25"/g)).toHaveLength(2);
    expect(csv).toContain('"Sauce, ""special"""');
    expect(csv).toContain("\"'=HYPERLINK");
  });
  it('neutralizes spreadsheet formula prefixes and quotes text', () => {
    expect(kitchenCsvCell(' +SUM(1,2)')).toBe("\"' +SUM(1,2)\"");
    expect(kitchenCsvCell('Normal, name')).toBe('"Normal, name"');
    expect(kitchenCsvCell(null)).toBe('""');
    expect(kitchenCsvCell(12.5)).toBe('"12.5"');
  });
});
