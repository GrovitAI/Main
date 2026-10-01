import type { CatalogItem, EntryTemplate, FinanceEntry } from '../finance-types';
import { entryToTemplateInput, templateDueDate, templateRecordedInMonth, templateToEntryInput } from '../finance-ledger-utils';
import { buildMonthWorkbook, monthBounds, monthLabel, shiftMonth, workbookFileName } from '../finance-workbook';

const CK = 'acct-ck';
const VL = 'acct-vl';

let seq = 0;
function entry(over: Partial<FinanceEntry>): FinanceEntry {
  seq += 1;
  return {
    id: `e-${seq}`,
    account_id: CK,
    paid_from_account_id: null,
    counterparty_account_id: null,
    source_type: null,
    source_id: null,
    kind: 'expense',
    status: 'recorded',
    amount: 0,
    amount_paise: 0,
    mode: 'cash',
    transfer_from: null,
    transfer_to: null,
    transaction_date: '2026-10-05',
    due_date: null,
    entered_at: `2026-10-05T05:00:${String(seq).padStart(2, '0')}.000Z`,
    entered_by: 'staff-1',
    entered_by_name: 'Owner',
    category_id: null,
    subcategory_id: null,
    particular_id: null,
    particulars: 'Entry',
    counterparty: null,
    reference_no: null,
    notes: null,
    settles_entry_id: null,
    settled: 0,
    settled_at: null,
    void_reason: null,
    voided_at: null,
    updated_at: '2026-10-05T05:00:00.000Z',
    version: 1,
    ...over,
  };
}

function category(id: string, name: string, over: Partial<CatalogItem> = {}): CatalogItem {
  return { id, level: 'category', parent_id: null, name, default_kind: 'expense', sort_order: 0, is_system: false, system_key: null, is_active: true, ...over };
}

const CATALOG: CatalogItem[] = [
  category('cat-rent', 'Rent'),
  category('cat-salary', 'Staff Salary'),
  category('cat-supplies', 'Branch Supplies', { default_kind: 'income', system_key: 'branch_supplies' }),
  category('cat-open', 'Opening Balance', { default_kind: 'income', is_system: true, system_key: 'opening_balance' }),
];
const ACCOUNTS = [
  { id: CK, name: 'Central Kitchen' },
  { id: VL, name: 'Velachery' },
];

beforeEach(() => {
  seq = 0;
});

describe('month helpers', () => {
  test('bounds, labels and stepping', () => {
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthBounds('2026-13')).toBeNull();
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(workbookFileName('Le Leban Central Kitchen', '2026-10')).toBe('Le-Leban-Central-Kitchen-2026-10.xlsx');
  });
});

describe('the month-end workbook', () => {
  const entries = [
    entry({ kind: 'income', amount: 40000, category_id: 'cat-open', particulars: 'Opening cash' }),
    entry({ kind: 'expense', amount: 35000, mode: 'bank', category_id: 'cat-rent', particulars: 'Rent · October', counterparty: 'Mr. Rajan' }),
    entry({ kind: 'expense', amount: 18000, mode: 'bank', category_id: 'cat-salary', particulars: 'Salary', counterparty: 'Jithesh' }),
    entry({ kind: 'expense', amount: 16000, mode: 'bank', category_id: 'cat-salary', particulars: 'Salary', counterparty: 'Priya' }),
    entry({ kind: 'income', amount: 132000, mode: 'bank', category_id: 'cat-supplies', particulars: 'September supplies', counterparty_account_id: VL }),
    entry({ kind: 'expense', status: 'void', amount: 999, category_id: 'cat-rent', particulars: 'Mistake' }),
    // Paid from the kitchen for Velachery: listed, but not the kitchen's expense.
    entry({ account_id: VL, paid_from_account_id: CK, kind: 'expense', amount: 700, category_id: 'cat-rent', particulars: 'Velachery plumber' }),
  ];
  const openDues = [
    entry({ kind: 'payable', status: 'open', amount: 28000, settled: 8000, mode: null, particulars: 'Milk', counterparty: 'Aavin Distributor', transaction_date: '2026-10-01', due_date: '2026-10-10' }),
    entry({ kind: 'receivable', status: 'open', amount: 5100, mode: null, particulars: 'Dispatch', counterparty_account_id: VL, transaction_date: '2026-10-21' }),
  ];
  const sheets = buildMonthWorkbook({
    accountId: CK,
    accountName: 'Central Kitchen',
    month: '2026-10',
    entries,
    openDues,
    catalog: CATALOG,
    accounts: ACCOUNTS,
    opening: { cash: 40000, bank: 120000 },
    closing: { cash: 35400, bank: 133260 },
  });
  const [summary, transactions, outstanding] = sheets;
  const row = (label: string) => summary.rows.find((r) => r[0] === label);

  test('has the three sheets', () => {
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Transactions', 'Outstanding']);
    expect(summary.rows[0][0]).toBe('Central Kitchen · October 2026');
  });

  test('the summary totals income and expenses by category, without built-in categories, voids or another account\'s costs', () => {
    expect(row('Total income')?.[3]).toBe(132000);
    expect(row('Total expenses')?.[3]).toBe(69000);
    expect(row('Net (income less expenses)')?.[3]).toBe(63000);
    expect(row('Staff Salary')).toEqual(['Staff Salary', '', 2, 34000]);
    expect(row('Opening balances and partner money in')?.[3]).toBe(40000);
  });

  test('the summary carries the balances and what is open', () => {
    expect(row('At the start of the month')).toEqual(['At the start of the month', 40000, 120000, 160000]);
    expect(row('At the end of the month')).toEqual(['At the end of the month', 35400, 133260, 168660]);
    expect(row('To pay')?.[3]).toBe(20000);
    expect(row('To collect')?.[3]).toBe(5100);
  });

  test('every entry of the month is listed, with the account names', () => {
    expect(transactions.rows).toHaveLength(1 + entries.length);
    const plumber = transactions.rows.find((r) => r[8] === 'Velachery plumber');
    expect(plumber?.[3]).toBe('Velachery');
    expect(plumber?.[4]).toBe('Central Kitchen');
  });

  test('outstanding shows what remains and how long it has been open', () => {
    const milk = outstanding.rows.find((r) => r[3] === 'Milk');
    expect(milk).toEqual(['payable', '2026-10-01', '2026-10-10', 'Milk', 'Aavin Distributor', 28000, 8000, 20000, 30]);
    const dispatch = outstanding.rows.find((r) => r[3] === 'Dispatch');
    expect(dispatch?.[4]).toBe('Velachery');
  });
});

describe('regulars', () => {
  const rent: EntryTemplate = {
    id: 't-1',
    account_id: CK,
    paid_from_account_id: null,
    kind: 'payable',
    amount: 35000,
    mode: null,
    category_id: 'cat-rent',
    subcategory_id: null,
    particular_id: null,
    particulars: 'Rent',
    counterparty: 'Mr. Rajan',
    due_day: 7,
    sort_order: 0,
    is_active: true,
    last_recorded_on: '2026-09-04',
  };

  test('a due falls on its day this month, or next month once that day has passed', () => {
    expect(templateDueDate(7, '2026-10-04')).toBe('2026-10-07');
    expect(templateDueDate(7, '2026-10-07')).toBe('2026-10-07');
    expect(templateDueDate(7, '2026-10-08')).toBe('2026-11-07');
    expect(templateDueDate(31, '2026-04-10')).toBe('2026-04-30');
    expect(templateDueDate(5, '2026-12-20')).toBe('2027-01-05');
    expect(templateDueDate(null, '2026-10-04')).toBeNull();
  });

  test('a template records an ordinary entry dated today', () => {
    expect(templateToEntryInput(rent, 36000, '2026-10-04')).toMatchObject({
      account_id: CK,
      kind: 'payable',
      amount: 36000,
      transaction_date: '2026-10-04',
      due_date: '2026-10-07',
      particulars: 'Rent',
      counterparty: 'Mr. Rajan',
    });
  });

  test('knows whether this month is done', () => {
    expect(templateRecordedInMonth(rent, '2026-10-04')).toBe(false);
    expect(templateRecordedInMonth({ last_recorded_on: '2026-10-01' }, '2026-10-04')).toBe(true);
    expect(templateRecordedInMonth({ last_recorded_on: null }, '2026-10-04')).toBe(false);
  });

  test('an entry becomes a regular without its date; a payment, a transfer or a posted entry does not', () => {
    const saved = entryToTemplateInput(entry({ kind: 'payable', status: 'open', amount: 35000, mode: null, particulars: 'Rent', counterparty: 'Mr. Rajan', due_date: '2026-10-07', category_id: 'cat-rent' }));
    expect(saved).toMatchObject({ kind: 'payable', amount: 35000, due_day: 7, particulars: 'Rent', mode: null });
    expect(entryToTemplateInput(entry({ kind: 'transfer', mode: null, transfer_from: 'cash', transfer_to: 'bank' }))).toBeNull();
    expect(entryToTemplateInput(entry({ settles_entry_id: 'e-9' }))).toBeNull();
    expect(entryToTemplateInput(entry({ source_type: 'purchase', source_id: 'po-1' }))).toBeNull();
  });
});
