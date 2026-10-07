import {
  buildDailySeries,
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
  isIsoDate,
  parseAmountInput,
  summarizeLedger,
  sumRupees,
} from '../finance-utils';
import type { LedgerEntry } from '../finance-types';

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

describe('amount input', () => {
  test('accepts rupee symbols and separators in the amount field', () => {
    expect(parseAmountInput('₹1,250.75')).toBe(1250.75);
    expect(parseAmountInput('1 000')).toBe(1000);
    expect(parseAmountInput('12.345')).toBeNull();
  });

  test('rejects blanks, signs and letters', () => {
    for (const raw of ['', '-5', 'abc', '10.005']) {
      expect(parseAmountInput(raw)).toBeNull();
    }
  });
});

describe('aggregation', () => {
  test('computeProfitAndLoss subtracts refunds and ledger expenses; purchases are information', () => {
    const pnl = computeProfitAndLoss({
      ...emptyFinanceSummary(),
      collectedRevenue: 10000,
      refundsTotal: 500,
      expensesTotal: 2000,
      // A paid purchase is already inside expensesTotal, so this is not subtracted again.
      purchasesTotal: 1500,
    });
    expect(pnl.netRevenue).toBe(9500);
    expect(pnl.totalOutflow).toBe(2000);
    expect(pnl.netCashFlow).toBe(7500);
    expect(pnl.margin).toBeCloseTo(0.7895, 4);
  });

  test('computeProfitAndLoss adds ledger income and charges a branch for the kitchen supplies', () => {
    const pnl = computeProfitAndLoss({
      ...emptyFinanceSummary(),
      collectedRevenue: 10000,
      otherIncome: 2000,
      expensesTotal: 3000,
      suppliesFromKitchen: 4000,
    });
    expect(pnl.totalOutflow).toBe(7000);
    expect(pnl.netCashFlow).toBe(5000);
    expect(pnl.margin).toBeCloseTo(5000 / 12000, 4);
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
