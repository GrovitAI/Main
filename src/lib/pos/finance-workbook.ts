/**
 * Finance ledger — the month-end workbook. Pure: no Supabase, no React, no
 * spreadsheet library. It turns a month of ledger entries into plain rows,
 * sheet by sheet; the screen hands those rows to the xlsx writer.
 *
 * One workbook per account per month (docs/FINANCE_LEDGER_PLAN.md §8):
 *   Summary       income and expenses by category, cash and bank at the start
 *                 and end of the month, what is still open
 *   Transactions  every entry of the month with who entered it and when
 *   Outstanding   payables and receivables still open
 */
import type { CatalogItem, FinanceEntry } from './finance-types';

export type WorkbookCell = string | number | null;
export type WorkbookSheet = { name: string; rows: WorkbookCell[][] };

export type MonthWorkbookInput = {
  accountId: string;
  accountName: string;
  /** YYYY-MM */
  month: string;
  /** Entries of the account (or paid from it) dated in the month, any status. */
  entries: readonly FinanceEntry[];
  /** Payables and receivables of the account still open, dated up to the month's end. */
  openDues: readonly FinanceEntry[];
  catalog: readonly CatalogItem[];
  accounts: readonly { id: string; name: string }[];
  /** Cash and bank on the day before the month began; null when not visible to the user. */
  opening: { cash: number; bank: number } | null;
  /** Cash and bank on the last day of the month. */
  closing: { cash: number; bank: number } | null;
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "October 2026" for "2026-10". */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const name = MONTH_NAMES[(m ?? 0) - 1];
  return name && year ? `${name} ${year}` : month;
}

/** First and last day of a YYYY-MM month, as YYYY-MM-DD. */
export function monthBounds(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

/** The month before or after, as YYYY-MM. */
export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  const index = year * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

type CategoryTotal = { category: string; subcategory: string; entries: number; amount: number };

function categoryTotals(entries: readonly FinanceEntry[], kind: 'income' | 'expense', nameOf: (id: string | null) => string, isSystem: (id: string | null) => boolean): { rows: CategoryTotal[]; total: number; left_out: number } {
  const map = new Map<string, CategoryTotal>();
  let total = 0;
  let leftOut = 0;
  for (const e of entries) {
    if (e.status !== 'recorded' || e.kind !== kind) continue;
    if (isSystem(e.category_id)) {
      leftOut = round2(leftOut + e.amount);
      continue;
    }
    const category = nameOf(e.category_id) || 'Uncategorised';
    const subcategory = nameOf(e.subcategory_id);
    const key = `${category}\u0000${subcategory}`;
    const current = map.get(key) ?? { category, subcategory, entries: 0, amount: 0 };
    current.entries += 1;
    current.amount = round2(current.amount + e.amount);
    map.set(key, current);
    total = round2(total + e.amount);
  }
  const rows = [...map.values()].sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory));
  return { rows, total, left_out: leftOut };
}

/** The sheets of one account's month, as plain rows. */
export function buildMonthWorkbook(input: MonthWorkbookInput): WorkbookSheet[] {
  const bounds = monthBounds(input.month);
  const monthEnd = bounds?.end ?? `${input.month}-28`;
  const catalogById = new Map(input.catalog.map((c) => [c.id, c]));
  const accountById = new Map(input.accounts.map((a) => [a.id, a.name]));
  const nameOf = (id: string | null): string => (id ? catalogById.get(id)?.name ?? '' : '');
  const isSystem = (id: string | null): boolean => (id ? catalogById.get(id)?.is_system === true : false);
  const accountName = (id: string | null): string => (id ? accountById.get(id) ?? '' : '');

  // The books of this account: what it is "for". Entries it only paid for
  // another account are listed under Transactions but are not its profit.
  const own = input.entries.filter((e) => e.account_id === input.accountId);
  const income = categoryTotals(own, 'income', nameOf, isSystem);
  const expenses = categoryTotals(own, 'expense', nameOf, isSystem);

  let toPay = 0;
  let toCollect = 0;
  for (const e of input.openDues) {
    const remaining = round2(e.amount - e.settled);
    if (e.kind === 'payable') toPay = round2(toPay + remaining);
    else if (e.kind === 'receivable') toCollect = round2(toCollect + remaining);
  }

  const summary: WorkbookCell[][] = [
    [`${input.accountName} · ${monthLabel(input.month)}`],
    ['Amounts in rupees. Opening balances and partner entries are left out of income and expenses.'],
    [],
    ['Income', 'Sub-category', 'Entries', 'Amount'],
    ...income.rows.map((r) => [r.category, r.subcategory, r.entries, r.amount]),
    ['Total income', null, null, income.total],
    [],
    ['Expenses', 'Sub-category', 'Entries', 'Amount'],
    ...expenses.rows.map((r) => [r.category, r.subcategory, r.entries, r.amount]),
    ['Total expenses', null, null, expenses.total],
    [],
    ['Net (income less expenses)', null, null, round2(income.total - expenses.total)],
    [],
    ['Balances', 'Cash', 'Bank', 'Total'],
    ['At the start of the month', input.opening?.cash ?? null, input.opening?.bank ?? null, input.opening ? round2(input.opening.cash + input.opening.bank) : null],
    ['At the end of the month', input.closing?.cash ?? null, input.closing?.bank ?? null, input.closing ? round2(input.closing.cash + input.closing.bank) : null],
    [],
    ['Outstanding', null, null, 'Amount'],
    ['To pay', null, null, toPay],
    ['To collect', null, null, toCollect],
  ];
  if (income.left_out > 0 || expenses.left_out > 0) {
    summary.push([], ['Left out of the profit above', null, null, 'Amount'], ['Opening balances and partner money in', null, null, income.left_out], ['Partner money out', null, null, expenses.left_out]);
  }

  const transactions: WorkbookCell[][] = [
    ['Date', 'Kind', 'Status', 'For', 'Paid from / received by', 'Other account', 'Category', 'Sub-category', 'Particulars', 'Paid to / received from', 'Mode', 'Amount', 'Settled', 'Due date', 'Reference', 'Notes', 'Entered by', 'Entered at', 'Posted by'],
    ...[...input.entries]
      .sort((a, b) => (a.transaction_date === b.transaction_date ? (a.entered_at < b.entered_at ? -1 : 1) : a.transaction_date < b.transaction_date ? -1 : 1))
      .map((e) => [
        e.transaction_date,
        e.kind,
        e.status,
        accountName(e.account_id),
        accountName(e.paid_from_account_id),
        accountName(e.counterparty_account_id),
        nameOf(e.category_id),
        nameOf(e.subcategory_id),
        e.particulars,
        e.counterparty ?? '',
        e.mode ?? (e.kind === 'transfer' ? `${e.transfer_from} to ${e.transfer_to}` : ''),
        e.amount,
        e.kind === 'payable' || e.kind === 'receivable' ? e.settled : null,
        e.due_date ?? '',
        e.reference_no ?? '',
        e.notes ?? '',
        e.entered_by_name ?? '',
        e.entered_at,
        e.source_type ?? '',
      ]),
  ];

  const outstanding: WorkbookCell[][] = [
    ['Kind', 'Date', 'Due date', 'Particulars', 'With', 'Amount', 'Settled', 'Remaining', `Days open at ${monthEnd}`],
    ...[...input.openDues]
      .sort((a, b) => (a.kind === b.kind ? (a.transaction_date < b.transaction_date ? -1 : 1) : a.kind < b.kind ? -1 : 1))
      .map((e) => [
        e.kind,
        e.transaction_date,
        e.due_date ?? '',
        e.particulars,
        accountName(e.counterparty_account_id) || (e.counterparty ?? ''),
        e.amount,
        e.settled,
        round2(e.amount - e.settled),
        Math.max(0, daysBetween(e.transaction_date, monthEnd)),
      ]),
  ];

  return [
    { name: 'Summary', rows: summary },
    { name: 'Transactions', rows: transactions },
    { name: 'Outstanding', rows: outstanding },
  ];
}

/** A file name that is safe everywhere: "Central-Kitchen-2026-10.xlsx". */
export function workbookFileName(accountName: string, month: string): string {
  const slug = accountName.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Ledger';
  return `${slug}-${month}.xlsx`;
}
