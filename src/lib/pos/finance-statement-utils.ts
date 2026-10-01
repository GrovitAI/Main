/**
 * Finance ledger — statements. Pure helpers: no Supabase, no React.
 *
 * A statement is everything billed and paid with one vendor or customer, or
 * between two of our own accounts, oldest first with a running balance. It is
 * built from the same ledger entries the Ledger tab shows, so its closing
 * balance always agrees with Outstanding and with Between accounts.
 */
import type { FinanceEntry, Statement, StatementRow, StatementSubject } from './finance-types';

type Effect = { billed: number; paid: number };

const NONE: Effect = { billed: 0, paid: 0 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function byDate(a: FinanceEntry, b: FinanceEntry): number {
  if (a.transaction_date !== b.transaction_date) return a.transaction_date < b.transaction_date ? -1 : 1;
  if (a.entered_at !== b.entered_at) return a.entered_at < b.entered_at ? -1 : 1;
  return 0;
}

/**
 * What one entry does to the balance with a vendor or customer; null when the
 * entry is not theirs. A bill on credit adds to it, the payment of that bill
 * takes it off, and something paid on the spot is billed and paid at once.
 */
function nameEffect(e: FinanceEntry, lowerName: string): Effect | null {
  if (e.status === 'void' || e.counterparty_account_id) return null;
  if ((e.counterparty ?? '').trim().toLowerCase() !== lowerName) return null;
  if (e.kind === 'payable' || e.kind === 'receivable') return { billed: e.amount, paid: 0 };
  if (e.kind === 'expense' || e.kind === 'income') {
    return e.settles_entry_id ? { billed: 0, paid: e.amount } : { billed: e.amount, paid: e.amount };
  }
  return null;
}

/**
 * What one entry does to the balance between two of our accounts, where a
 * balance above zero means `other` owes `home`. null when the entry is not
 * between the two.
 */
function accountEffect(e: FinanceEntry, home: string, other: string): Effect | null {
  if (e.status === 'void') return null;
  const homeSide = e.account_id === home && e.counterparty_account_id === other;
  const otherSide = e.account_id === other && e.counterparty_account_id === home;

  // A due between the two: goods the kitchen sent a branch, for example.
  if (e.kind === 'payable' || e.kind === 'receivable') {
    if (homeSide) return e.kind === 'receivable' ? { billed: e.amount, paid: 0 } : { billed: 0, paid: e.amount };
    if (otherSide) return e.kind === 'receivable' ? { billed: 0, paid: e.amount } : { billed: e.amount, paid: 0 };
    return null;
  }
  if (e.status !== 'recorded') return null;

  // The payment of such a due.
  if (e.settles_entry_id && (homeSide || otherSide)) {
    const counterpart = homeSide ? other : home;
    // An offset moves no money: the due above already carries the amount, and
    // what it was set against is a row of its own.
    if (e.paid_from_account_id === counterpart) return NONE;
    if (e.kind === 'income') return homeSide ? { billed: 0, paid: e.amount } : { billed: e.amount, paid: 0 };
    if (e.kind === 'expense') return homeSide ? { billed: e.amount, paid: 0 } : { billed: 0, paid: e.amount };
    return null;
  }

  // Money one of the two moved for the other: a bill paid on its behalf, a
  // transfer, income collected for it.
  if (!e.paid_from_account_id || (e.kind !== 'income' && e.kind !== 'expense' && e.kind !== 'transfer')) return null;
  const between =
    (e.account_id === home && e.paid_from_account_id === other) || (e.account_id === other && e.paid_from_account_id === home);
  if (!between) return null;
  const debtor = e.kind === 'income' ? e.paid_from_account_id : e.account_id;
  return debtor === other ? { billed: e.amount, paid: 0 } : { billed: 0, paid: e.amount };
}

/**
 * Builds the statement for a subject from ledger entries. Entries that are not
 * part of it are ignored, so the caller may pass a wider set than needed.
 */
export function buildStatement(entries: readonly FinanceEntry[], subject: StatementSubject, truncated = false): Statement {
  const lowerName = subject.type === 'name' ? subject.name.trim().toLowerCase() : '';
  const rows: StatementRow[] = [];
  let billed = 0;
  let paid = 0;
  let balance = 0;
  let customer = false;

  for (const entry of [...entries].sort(byDate)) {
    const effect =
      subject.type === 'name' ? nameEffect(entry, lowerName) : accountEffect(entry, subject.homeAccountId, subject.accountId);
    if (!effect) continue;
    if (entry.kind === 'receivable' || entry.kind === 'income') customer = true;
    billed = round2(billed + effect.billed);
    paid = round2(paid + effect.paid);
    balance = round2(balance + effect.billed - effect.paid);
    rows.push({ entry, billed: effect.billed, paid: effect.paid, balance });
  }

  let direction: Statement['direction'] = 'settled';
  if (balance !== 0) {
    if (subject.type === 'account') direction = balance > 0 ? 'they_owe' : 'we_owe';
    // With a customer a positive balance is theirs to pay; with a vendor it is ours.
    else direction = balance > 0 === customer ? 'they_owe' : 'we_owe';
  }
  return { rows, billed, paid, balance, direction, truncated };
}

/**
 * The closing balance in words: "Aavin Distributor is owed ₹28,000",
 * "Kolathur owes Central Kitchen ₹5,100", "Settled".
 */
export function statementBalanceLabel(
  statement: Pick<Statement, 'balance' | 'direction'>,
  subjectName: string,
  homeName: string | null,
  formatMoney: (rupees: number) => string,
): string {
  if (statement.direction === 'settled') return 'Settled: nothing owed either way';
  const amount = formatMoney(Math.abs(statement.balance));
  if (homeName) {
    return statement.direction === 'they_owe' ? `${subjectName} owes ${homeName} ${amount}` : `${homeName} owes ${subjectName} ${amount}`;
  }
  return statement.direction === 'they_owe' ? `${subjectName} owes us ${amount}` : `We owe ${subjectName} ${amount}`;
}

/** The balance after a row, signed for reading: "Owes ₹5,100", "Owed ₹2,225", "Settled". */
export function rowBalanceLabel(
  balance: number,
  subject: StatementSubject,
  customer: boolean,
  formatMoney: (rupees: number) => string,
): string {
  if (balance === 0) return 'Settled';
  const amount = formatMoney(Math.abs(balance));
  const theyOwe = subject.type === 'account' ? balance > 0 : balance > 0 === customer;
  return theyOwe ? `Owes ${amount}` : `Owed ${amount}`;
}

/** Whether the rows read as a customer's (they pay us) rather than a vendor's. */
export function statementIsCustomer(statement: Pick<Statement, 'rows'>): boolean {
  return statement.rows.some((r) => r.entry.kind === 'receivable' || r.entry.kind === 'income');
}
