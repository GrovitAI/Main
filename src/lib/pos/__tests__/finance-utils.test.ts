import {
  buildDailySeries,
  buildExpensesCsv,
  classifyVariance,
  computeCashVariance,
  computeExpectedCash,
  computeProfitAndLoss,
  describeDateRange,
  emptyFinanceSummary,
  enumerateDates,
  formatINR,
  formatPaymentMethod,
  formatPercent,
  getPresetDateRange,
  groupExpensesByCategory,
  isIsoDate,
  parseAmountInput,
  summarizeLedger,
  sumRupees,
  validateExpenseForm,
} from '../finance-utils';
import type { Expense, ExpenseFormValues, LedgerEntry } from '../finance-types';

function makeExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    tenant_id: 't',
    branch_id: 'b',
    amount: 100,
    amount_paise: 10000,
    category: 'Rent',
    description: null,
    expense_date: '2026-09-05',
    payment_method: 'cash',
    payee: null,
    reference_no: null,
    notes: null,
    receipt_url: null,
    status: 'recorded',
    void_reason: null,
    voided_at: null,
    created_by: null,
    created_at: '2026-09-05T10:00:00.000Z',
    updated_at: null,
    ...over,
  };
}

function makeForm(over: Partial<ExpenseFormValues> = {}): ExpenseFormValues {
  return {
    amount: '250.50',
    category: 'Rent',
    description: 'September rent',
    expense_date: '2026-09-05',
    payment_method: 'cash',
    payee: 'Landlord',
    reference_no: 'REF-1',
    notes: '',
    ...over,
  };
}

describe('finance-utils money formatting', () => {
  test('formatINR uses the Indian grouping and hides paise when whole', () => {
    expect(formatINR(1234)).toBe('₹1,234');
    expect(formatINR(100000)).toBe('₹1,00,000');
    expect(formatINR(1234.5)).toBe('₹1,234.50');
    expect(formatINR(1234, { showPaise: true })).toBe('₹1,234.00');
  });

  test('formatINR marks negatives and optional positives', () => {
    expect(formatINR(-500)).toBe('−₹500');
    expect(formatINR(500, { signed: true })).toBe('+₹500');
    expect(formatINR(0, { signed: true })).toBe('₹0');
  });

  test('formatINR compacts lakhs and crores', () => {
    expect(formatINR(250000, { compact: true })).toBe('₹2.50L');
    expect(formatINR(15000000, { compact: true })).toBe('₹1.50Cr');
    expect(formatINR(150000000, { compact: true })).toBe('₹15.0Cr');
    expect(formatINR(99999, { compact: true })).toBe('₹99,999');
  });

  test('formatINR survives non-finite input', () => {
    expect(formatINR(Number.NaN)).toBe('₹0');
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('0%');
  });

  test('sumRupees adds in paise so floats never drift', () => {
    expect(sumRupees([0.1, 0.2])).toBe(0.3);
    expect(sumRupees([10.005, 10.005])).toBe(20.02);
    expect(sumRupees([])).toBe(0);
  });

  test('formatPaymentMethod normalises the stored values', () => {
    expect(formatPaymentMethod('upi')).toBe('UPI');
    expect(formatPaymentMethod('bank_transfer')).toBe('Bank Transfer');
    expect(formatPaymentMethod('pos')).toBe('Card');
    expect(formatPaymentMethod('complimentary')).toBe('Complimentary');
    expect(formatPaymentMethod(null)).toBe('—');
  });
});

describe('finance-utils dates', () => {
  test('isIsoDate rejects impossible calendar dates', () => {
    expect(isIsoDate('2026-09-07')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('7-9-2026')).toBe(false);
  });

  test('presets are anchored on the business date, not the calendar date', () => {
    // 01:00 IST on 8 Sep is still the 7 Sep business day (02:30 cutoff).
    const lateNight = new Date('2026-09-07T19:30:00.000Z'); // 01:00 IST, 8 Sep
    expect(getPresetDateRange('today', undefined, lateNight)).toEqual({
      startDate: '2026-09-07',
      endDate: '2026-09-07',
    });
    expect(getPresetDateRange('7days', undefined, lateNight)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    });
    expect(getPresetDateRange('month', undefined, lateNight)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    });
  });

  test('a custom range with the dates reversed is corrected', () => {
    expect(getPresetDateRange('custom', { startDate: '2026-09-10', endDate: '2026-09-01' })).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-10',
    });
  });

  test('enumerateDates is inclusive and bounded', () => {
    expect(enumerateDates('2026-09-05', '2026-09-08')).toEqual([
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ]);
    expect(enumerateDates('2026-09-05', '2026-09-05')).toHaveLength(1);
    expect(enumerateDates('2026-01-01', '2030-01-01')).toHaveLength(400);
    expect(enumerateDates('bad', '2026-09-08')).toEqual([]);
  });

  test('describeDateRange collapses a single day', () => {
    expect(describeDateRange({ startDate: '2026-09-07', endDate: '2026-09-07' })).toBe('Mon, 7 Sep 2026');
    expect(describeDateRange({ startDate: '2026-09-01', endDate: '2026-09-07' })).toBe('1 Sep – 7 Sep 2026');
  });
});

describe('expense form validation', () => {
  test('accepts a well-formed entry and normalises blanks to null', () => {
    const result = validateExpenseForm(makeForm({ notes: '   ' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount).toBe(250.5);
      expect(result.value.notes).toBeNull();
      expect(result.value.payee).toBe('Landlord');
    }
  });

  test('rejects bad amounts', () => {
    for (const amount of ['', '0', '-5', 'abc', '10.005', '20000000']) {
      const result = validateExpenseForm(makeForm({ amount }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.amount).toBeDefined();
    }
  });

  test('accepts rupee symbols and separators in the amount field', () => {
    expect(parseAmountInput('₹1,250.75')).toBe(1250.75);
    expect(parseAmountInput('1 000')).toBe(1000);
    expect(parseAmountInput('12.345')).toBeNull();
  });

  test('requires a category and rejects future dates', () => {
    const noCategory = validateExpenseForm(makeForm({ category: '  ' }));
    expect(noCategory.ok).toBe(false);
    if (!noCategory.ok) expect(noCategory.errors.category).toBeDefined();

    const future = validateExpenseForm(makeForm({ expense_date: '2099-01-01' }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.errors.expense_date).toBeDefined();
  });
});

describe('aggregation', () => {
  test('groupExpensesByCategory ignores voided rows and sorts by spend', () => {
    const groups = groupExpensesByCategory([
      makeExpense({ id: '1', category: 'Rent', amount: 100 }),
      makeExpense({ id: '2', category: 'Rent', amount: 50.25 }),
      makeExpense({ id: '3', category: 'Gas / Fuel', amount: 400 }),
      makeExpense({ id: '4', category: 'Rent', amount: 999, status: 'void' }),
    ]);
    expect(groups).toEqual([
      { category: 'Gas / Fuel', total: 400, count: 1 },
      { category: 'Rent', total: 150.25, count: 2 },
    ]);
  });

  test('computeProfitAndLoss subtracts refunds, expenses and purchases', () => {
    const pnl = computeProfitAndLoss({
      ...emptyFinanceSummary(),
      collectedRevenue: 10000,
      refundsTotal: 500,
      expensesTotal: 2000,
      purchasesTotal: 1500,
    });
    expect(pnl.netRevenue).toBe(9500);
    expect(pnl.totalOutflow).toBe(3500);
    expect(pnl.netCashFlow).toBe(6000);
    expect(pnl.margin).toBeCloseTo(0.6316, 4);
  });

  test('margin is zero rather than infinite when there is no revenue', () => {
    const pnl = computeProfitAndLoss({ ...emptyFinanceSummary(), expensesTotal: 1000 });
    expect(pnl.netCashFlow).toBe(-1000);
    expect(pnl.margin).toBe(0);
  });

  test('buildDailySeries buckets settlements by business day and fills gaps', () => {
    const series = buildDailySeries(
      [
        // 22:00 IST 5 Sep → business day 5 Sep
        { bill_id: 'b1', payment_type: 'cash', amount: 300, occurred_at: '2026-09-05T16:30:00.000Z' },
        // 01:00 IST 6 Sep → still the 5 Sep business day
        { bill_id: 'b2', payment_type: 'upi', amount: 200, occurred_at: '2026-09-05T19:30:00.000Z' },
        // 12:00 IST 7 Sep
        { bill_id: 'b3', payment_type: 'cash', amount: 100, occurred_at: '2026-09-07T06:30:00.000Z' },
      ],
      [
        { expense_date: '2026-09-05', amount: 120, status: 'recorded' },
        { expense_date: '2026-09-06', amount: 999, status: 'void' },
      ],
      '2026-09-05',
      '2026-09-07',
    );
    expect(series).toHaveLength(3);
    expect(series[0]).toEqual({ date: '2026-09-05', revenue: 500, orders: 2, expenses: 120, net: 380 });
    expect(series[1]).toEqual({ date: '2026-09-06', revenue: 0, orders: 0, expenses: 0, net: 0 });
    expect(series[2]).toEqual({ date: '2026-09-07', revenue: 100, orders: 1, expenses: 0, net: 100 });
  });

  test('two settlements on one bill count as a single order', () => {
    const series = buildDailySeries(
      [
        { bill_id: 'b1', payment_type: 'cash', amount: 300, occurred_at: '2026-09-05T16:30:00.000Z' },
        { bill_id: 'b1', payment_type: 'upi', amount: 200, occurred_at: '2026-09-05T16:31:00.000Z' },
      ],
      [],
      '2026-09-05',
      '2026-09-05',
    );
    expect(series[0].revenue).toBe(500);
    expect(series[0].orders).toBe(1);
  });
});

describe('ledger', () => {
  const entries: LedgerEntry[] = [
    {
      id: 'sale:1',
      kind: 'sale',
      occurred_at: '2026-09-05T16:30:00.000Z',
      business_date: '2026-09-05',
      title: 'Invoice INV-0001',
      subtitle: null,
      payment_method: 'cash',
      amount: 500,
      direction: 'in',
      reference: null,
    },
    {
      id: 'sale:2',
      kind: 'sale',
      occurred_at: '2026-09-05T17:00:00.000Z',
      business_date: '2026-09-05',
      title: 'Invoice INV-0002',
      subtitle: null,
      payment_method: 'upi',
      amount: 300,
      direction: 'in',
      reference: null,
    },
    {
      id: 'expense:1',
      kind: 'expense',
      occurred_at: '2026-09-05T12:00:00.000Z',
      business_date: '2026-09-05',
      title: 'Rent',
      subtitle: null,
      payment_method: 'cash',
      amount: 200,
      direction: 'out',
      reference: null,
    },
  ];

  test('summarizeLedger separates cash from total flow', () => {
    const totals = summarizeLedger(entries);
    expect(totals.totalIn).toBe(800);
    expect(totals.totalOut).toBe(200);
    expect(totals.net).toBe(600);
    expect(totals.cashIn).toBe(500);
    expect(totals.cashOut).toBe(200);
    expect(totals.entryCount).toBe(3);
  });

  test('an empty ledger summarises to zeroes, not NaN', () => {
    expect(summarizeLedger([])).toEqual({
      totalIn: 0,
      totalOut: 0,
      net: 0,
      cashIn: 0,
      cashOut: 0,
      entryCount: 0,
    });
  });
});

describe('day close', () => {
  const computation = {
    business_date: '2026-09-05',
    cashSales: 5000,
    cashRefunds: 250,
    cashExpenses: 750.5,
    cashSettlementCount: 12,
    cashExpenseCount: 3,
  };

  test('expected cash = opening + sales − refunds − expenses', () => {
    // 2000 + 5000 − 250 − 750.50
    expect(computeExpectedCash(2000, computation)).toBe(5999.5);
    expect(computeExpectedCash(0, computation)).toBe(3999.5);
  });

  test('variance is counted minus expected, and null while uncounted', () => {
    expect(computeCashVariance(5999.5, 6000)).toBe(0.5);
    expect(computeCashVariance(5999.5, 5900)).toBe(-99.5);
    expect(computeCashVariance(5999.5, null)).toBeNull();
  });

  test('small rounding differences count as balanced', () => {
    expect(classifyVariance(0)).toBe('balanced');
    expect(classifyVariance(0.5)).toBe('balanced');
    expect(classifyVariance(null)).toBe('balanced');
    expect(classifyVariance(25)).toBe('surplus');
    expect(classifyVariance(-25)).toBe('shortage');
  });
});

describe('csv export', () => {
  test('quotes cells that contain commas or quotes', () => {
    const csv = buildExpensesCsv([
      makeExpense({ description: 'Rent, September', payee: 'The "Landlord"', amount: 1000 }),
    ]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('Date,Category,Description,Payee,Payment Method,Reference,Amount,Status');
    expect(row).toContain('"Rent, September"');
    expect(row).toContain('"The ""Landlord"""');
    expect(row).toContain('1000.00');
  });

  test('null fields become empty cells', () => {
    const csv = buildExpensesCsv([makeExpense({ description: null, payee: null, reference_no: null })]);
    expect(csv.split('\n')[1]).toBe('2026-09-05,Rent,,,Cash,,100.00,recorded');
  });
});
