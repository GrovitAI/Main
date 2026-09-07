/**
 * Finance module — pure helpers (no Supabase, no React).
 * Everything here is deterministic and unit-testable.
 */
import { getBusinessDate, getCurrentBusinessDate as reportingCurrentBusinessDate } from './reporting-utils';
import { fromPaise, toPaise } from './money-utils';
import type {
  CategorySpend,
  DayCloseComputation,
  Expense,
  ExpenseFormErrors,
  ExpenseFormValues,
  ExpenseInput,
  ExpensePaymentMethod,
  FinanceDailyPoint,
  FinancePreset,
  FinanceSummary,
  LedgerEntry,
  LedgerTotals,
  ProfitAndLoss,
} from './finance-types';
import { EXPENSE_PAYMENT_METHODS } from './finance-types';

// ─── Money ────────────────────────────────────────────────────────────────────

/**
 * Paise conversion is re-exported from money-utils so finance reporting rounds
 * exactly the way settle_order() and the cart do. Never re-implement it here.
 */
export { fromPaise, toPaise };

/** Sums rupee amounts in integer paise to avoid float drift, returns rupees. */
export function sumRupees(values: readonly number[]): number {
  let paise = 0;
  for (const v of values) paise += toPaise(v);
  return fromPaise(paise);
}

/** Rounds a rupee amount to 2 decimals via paise. */
export function roundRupees(value: number): number {
  return fromPaise(toPaise(value));
}

export type FormatINROptions = {
  /** Always show two decimals. Default: hide paise when the amount is whole. */
  showPaise?: boolean;
  /** Abbreviate large numbers (1.2L, 3.4Cr). */
  compact?: boolean;
  /** Prefix + for positive values (negatives always get a minus). */
  signed?: boolean;
};

const RUPEE = '₹';
const MINUS = '−';

export function formatINR(amount: number, options: FormatINROptions = {}): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safe);
  let body: string;

  if (options.compact && abs >= 1_00_000) {
    if (abs >= 1_00_00_000) {
      body = `${(abs / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 1 : 2)}Cr`;
    } else {
      body = `${(abs / 1_00_000).toFixed(abs >= 10_00_000 ? 1 : 2)}L`;
    }
  } else {
    const hasPaise = Math.round(abs * 100) % 100 !== 0;
    const fractionDigits = options.showPaise || hasPaise ? 2 : 0;
    body = abs.toLocaleString('en-IN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }

  const sign = safe < 0 ? MINUS : options.signed && safe > 0 ? '+' : '';
  return `${sign}${RUPEE}${body}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '0%';
  return `${(fraction * 100).toFixed(digits)}%`;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function formatCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(value: string): Date | null {
  if (!isIsoDate(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(isoDate: string, days: number): string {
  const d = parseIsoDate(isoDate);
  if (!d) return isoDate;
  d.setDate(d.getDate() + days);
  return formatCalendarDate(d);
}

/** "2026-09-07" → "7 Sep" (or "7 Sep 2026" when withYear). */
export function formatDateLabel(isoDate: string, withYear = false): string {
  const d = parseIsoDate(isoDate);
  if (!d) return isoDate;
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

/** "2026-09-07" → "Mon, 7 Sep 2026". */
export function formatDateLong(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  if (!d) return isoDate;
  return `${DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function formatClock(d: Date): string {
  let hours = d.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

/** ISO timestamp → "7 Sep, 9:42 PM" in device-local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${formatClock(d)}`;
}

/** ISO timestamp → "9:42 PM". */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatClock(d);
}

/**
 * The business date "now" belongs to, honouring the 02:30 cut-off from
 * reporting-utils (00:00–02:30 still counts as the previous day).
 */
export function getCurrentBusinessDate(now: Date = new Date()): string {
  return reportingCurrentBusinessDate({}, now) || formatCalendarDate(now);
}

export type DateRange = { startDate: string; endDate: string };

export function getPresetDateRange(
  preset: FinancePreset,
  custom?: Partial<DateRange>,
  now: Date = new Date(),
): DateRange {
  const today = getCurrentBusinessDate(now);
  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { startDate: y, endDate: y };
    }
    case '7days':
      return { startDate: addDays(today, -6), endDate: today };
    case '30days':
      return { startDate: addDays(today, -29), endDate: today };
    case 'month':
      return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
    case 'custom': {
      const start = custom?.startDate && isIsoDate(custom.startDate) ? custom.startDate : today;
      const end = custom?.endDate && isIsoDate(custom.endDate) ? custom.endDate : start;
      return start <= end ? { startDate: start, endDate: end } : { startDate: end, endDate: start };
    }
    default:
      return { startDate: today, endDate: today };
  }
}

export function describeDateRange(range: DateRange): string {
  if (range.startDate === range.endDate) return formatDateLong(range.startDate);
  const sameYear = range.startDate.slice(0, 4) === range.endDate.slice(0, 4);
  return `${formatDateLabel(range.startDate, !sameYear)} – ${formatDateLabel(range.endDate, true)}`;
}

/** Inclusive list of YYYY-MM-DD dates between start and end (max 400 for safety). */
export function enumerateDates(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return out;
  let cursor = startDate <= endDate ? startDate : endDate;
  const last = startDate <= endDate ? endDate : startDate;
  while (cursor <= last && out.length < 400) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

export function isExpensePaymentMethod(value: string): value is ExpensePaymentMethod {
  return (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return '—';
  const key = method.toLowerCase();
  if (isExpensePaymentMethod(key)) return PAYMENT_METHOD_LABELS[key];
  if (key === 'complimentary') return 'Complimentary';
  if (key === 'pos') return 'Card';
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

/** Used when the expense_categories table is not installed yet. */
export const DEFAULT_EXPENSE_CATEGORIES: readonly string[] = [
  'Raw Materials',
  'Groceries & Supplies',
  'Staff Salary',
  'Staff Welfare',
  'Rent',
  'Electricity',
  'Water',
  'Gas / Fuel',
  'Maintenance & Repairs',
  'Cleaning',
  'Packaging',
  'Marketing',
  'Delivery Charges',
  'Transport',
  'Licenses & Fees',
  'Bank Charges',
  'Petty Cash',
  'Miscellaneous',
];

// ─── Expense form validation ─────────────────────────────────────────────────

export const EXPENSE_MAX_AMOUNT = 1_00_00_000; // one crore per line

export function emptyExpenseForm(defaultDate: string = getCurrentBusinessDate()): ExpenseFormValues {
  return {
    amount: '',
    category: '',
    description: '',
    expense_date: defaultDate,
    payment_method: 'cash',
    payee: '',
    reference_no: '',
    notes: '',
  };
}

export function expenseToFormValues(expense: Expense): ExpenseFormValues {
  return {
    amount: expense.amount.toString(),
    category: expense.category,
    description: expense.description ?? '',
    expense_date: expense.expense_date,
    payment_method: expense.payment_method,
    payee: expense.payee ?? '',
    reference_no: expense.reference_no ?? '',
    notes: expense.notes ?? '',
  };
}

export type ExpenseValidation =
  | { ok: true; value: ExpenseInput }
  | { ok: false; errors: ExpenseFormErrors };

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function validateExpenseForm(values: ExpenseFormValues): ExpenseValidation {
  const errors: ExpenseFormErrors = {};

  const amount = parseAmountInput(values.amount);
  if (amount === null) {
    errors.amount = 'Enter a valid amount (up to 2 decimals).';
  } else if (amount <= 0) {
    errors.amount = 'Amount must be greater than zero.';
  } else if (amount > EXPENSE_MAX_AMOUNT) {
    errors.amount = 'Amount exceeds the one crore limit.';
  }

  const category = values.category.trim();
  if (!category) {
    errors.category = 'Choose a category.';
  } else if (category.length > 60) {
    errors.category = 'Category is too long.';
  }

  if (!isIsoDate(values.expense_date)) {
    errors.expense_date = 'Use the format YYYY-MM-DD.';
  } else if (values.expense_date > addDays(getCurrentBusinessDate(), 1)) {
    errors.expense_date = 'Expense date cannot be in the future.';
  }

  if (!isExpensePaymentMethod(values.payment_method)) {
    errors.payment_method = 'Choose a payment method.';
  }

  if (values.description.trim().length > 200) {
    errors.description = 'Keep the description under 200 characters.';
  }
  if (values.payee.trim().length > 120) {
    errors.payee = 'Payee name is too long.';
  }
  if (values.reference_no.trim().length > 60) {
    errors.reference_no = 'Reference is too long.';
  }
  if (values.notes.trim().length > 500) {
    errors.notes = 'Keep notes under 500 characters.';
  }

  if (Object.keys(errors).length > 0 || amount === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      amount: roundRupees(amount),
      category,
      description: emptyToNull(values.description),
      expense_date: values.expense_date,
      payment_method: values.payment_method,
      payee: emptyToNull(values.payee),
      reference_no: emptyToNull(values.reference_no),
      notes: emptyToNull(values.notes),
    },
  };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function sumExpenses(expenses: readonly Expense[]): number {
  return sumRupees(expenses.filter((e) => e.status === 'recorded').map((e) => e.amount));
}

export function groupExpensesByCategory(expenses: readonly Expense[]): CategorySpend[] {
  const map = new Map<string, { paise: number; count: number }>();
  for (const e of expenses) {
    if (e.status !== 'recorded') continue;
    const key = e.category.trim() || 'Uncategorised';
    const entry = map.get(key) ?? { paise: 0, count: 0 };
    entry.paise += toPaise(e.amount);
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, total: fromPaise(v.paise), count: v.count }))
    .sort((a, b) => b.total - a.total);
}

export function computeProfitAndLoss(summary: FinanceSummary): ProfitAndLoss {
  const netRevenue = roundRupees(summary.collectedRevenue - summary.refundsTotal);
  const totalOutflow = roundRupees(summary.expensesTotal + summary.purchasesTotal);
  const netCashFlow = roundRupees(netRevenue - totalOutflow);
  const margin = netRevenue > 0 ? netCashFlow / netRevenue : 0;
  return {
    collectedRevenue: summary.collectedRevenue,
    refundsTotal: summary.refundsTotal,
    netRevenue,
    expensesTotal: summary.expensesTotal,
    purchasesTotal: summary.purchasesTotal,
    totalOutflow,
    netCashFlow,
    margin,
  };
}

export function emptyFinanceSummary(): FinanceSummary {
  return {
    grossSales: 0,
    billCount: 0,
    collectedRevenue: 0,
    pendingCollections: 0,
    taxCollected: 0,
    discountsGiven: 0,
    complimentaryValue: 0,
    refundsTotal: 0,
    refundsCount: 0,
    expensesTotal: 0,
    expensesCount: 0,
    purchasesTotal: 0,
    purchasesCount: 0,
    cashIn: 0,
    cashOut: 0,
    paymentSplit: [],
    expensesByCategory: [],
  };
}

/** Minimal shape needed to build a daily series client-side. */
export type SettlementLike = {
  bill_id: string;
  payment_type: string;
  amount: number;
  /** settled_at of the bill (preferred) or the settlement created_at. */
  occurred_at: string;
};

export type ExpenseLike = { expense_date: string; amount: number; status: string };

/**
 * Client-side equivalent of the get_finance_daily_series RPC. Used before the
 * migration is applied. Groups settlements by business date (02:30 cut-off).
 */
export function buildDailySeries(
  settlements: readonly SettlementLike[],
  expenses: readonly ExpenseLike[],
  startDate: string,
  endDate: string,
): FinanceDailyPoint[] {
  const revenueByDate = new Map<string, { paise: number; bills: Set<string> }>();
  for (const s of settlements) {
    const date = getBusinessDate(s.occurred_at);
    if (!date) continue;
    const entry = revenueByDate.get(date) ?? { paise: 0, bills: new Set<string>() };
    entry.paise += toPaise(s.amount);
    entry.bills.add(s.bill_id);
    revenueByDate.set(date, entry);
  }

  const expenseByDate = new Map<string, number>();
  for (const e of expenses) {
    if (e.status !== 'recorded') continue;
    expenseByDate.set(e.expense_date, (expenseByDate.get(e.expense_date) ?? 0) + toPaise(e.amount));
  }

  return enumerateDates(startDate, endDate).map((date) => {
    const rev = revenueByDate.get(date);
    const revenue = fromPaise(rev?.paise ?? 0);
    const exp = fromPaise(expenseByDate.get(date) ?? 0);
    return {
      date,
      revenue,
      orders: rev?.bills.size ?? 0,
      expenses: exp,
      net: roundRupees(revenue - exp),
    };
  });
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export function summarizeLedger(entries: readonly LedgerEntry[]): LedgerTotals {
  let inPaise = 0;
  let outPaise = 0;
  let cashInPaise = 0;
  let cashOutPaise = 0;
  for (const e of entries) {
    const paise = toPaise(e.amount);
    const isCash = e.payment_method.toLowerCase() === 'cash';
    if (e.direction === 'in') {
      inPaise += paise;
      if (isCash) cashInPaise += paise;
    } else {
      outPaise += paise;
      if (isCash) cashOutPaise += paise;
    }
  }
  return {
    totalIn: fromPaise(inPaise),
    totalOut: fromPaise(outPaise),
    net: fromPaise(inPaise - outPaise),
    cashIn: fromPaise(cashInPaise),
    cashOut: fromPaise(cashOutPaise),
    entryCount: entries.length,
  };
}

export function sortLedgerDesc(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0));
}

// ─── Day close ────────────────────────────────────────────────────────────────

export function computeExpectedCash(openingCash: number, computation: DayCloseComputation): number {
  return roundRupees(
    openingCash + computation.cashSales - computation.cashRefunds - computation.cashExpenses,
  );
}

/** counted − expected. Positive = surplus, negative = shortage. */
export function computeCashVariance(expectedCash: number, countedCash: number | null): number | null {
  if (countedCash === null || !Number.isFinite(countedCash)) return null;
  return roundRupees(countedCash - expectedCash);
}

export type VarianceTone = 'balanced' | 'surplus' | 'shortage';

export function classifyVariance(variance: number | null, tolerance = 1): VarianceTone {
  if (variance === null || Math.abs(variance) <= tolerance) return 'balanced';
  return variance > 0 ? 'surplus' : 'shortage';
}

// ─── Export ───────────────────────────────────────────────────────────────────

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildExpensesCsv(expenses: readonly Expense[]): string {
  const header = ['Date', 'Category', 'Description', 'Payee', 'Payment Method', 'Reference', 'Amount', 'Status'];
  const lines = expenses.map((e) =>
    [
      e.expense_date,
      e.category,
      e.description,
      e.payee,
      formatPaymentMethod(e.payment_method),
      e.reference_no,
      e.amount.toFixed(2),
      e.status,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}
