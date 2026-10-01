import type { DuesSummaryRow, FinanceEntry } from '../finance-types';
import {
  QUICK_ENTRY_PRESETS,
  canOffsetEntry,
  canSettleEntry,
  counterpartyCaption,
  dueStatus,
  emptyEntryForm,
  emptySettleForm,
  payerCaption,
  remainingAmount,
  summarizeDues,
  validateEntryForm,
  validateSettleForm,
} from '../finance-ledger-utils';

const CK = 'acct-ck';
const VL = 'acct-vl';

function entry(over: Partial<FinanceEntry> = {}): FinanceEntry {
  return {
    id: 'entry-1',
    account_id: CK,
    paid_from_account_id: null,
    counterparty_account_id: null,
    source_type: null,
    source_id: null,
    kind: 'payable',
    status: 'open',
    amount: 12000,
    amount_paise: 1_200_000,
    mode: null,
    transfer_from: null,
    transfer_to: null,
    transaction_date: '2026-09-03',
    due_date: null,
    entered_at: '2026-09-03T05:00:00.000Z',
    entered_by: 'staff-1',
    entered_by_name: 'Clerk',
    category_id: 'cat-gas',
    subcategory_id: null,
    particular_id: null,
    particulars: 'Gas supplier',
    counterparty: 'Bharat Gas',
    reference_no: null,
    notes: null,
    settles_entry_id: null,
    settled: 0,
    settled_at: null,
    void_reason: null,
    voided_at: null,
    updated_at: '2026-09-03T05:00:00.000Z',
    version: 1,
    ...over,
  };
}

const names: Record<string, string> = { [CK]: 'Central Kitchen', [VL]: 'Velachery' };
const nameOf = (id: string) => names[id] ?? id;

describe('paid from / for on the entry form', () => {
  test('keeps the paying account on an expense another account paid for', () => {
    const values = { ...emptyEntryForm(CK, '2026-09-16'), amount: '12000', particulars: 'Gas', paid_from_account_id: VL };
    const result = validateEntryForm(values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paid_from_account_id).toBe(VL);
  });

  test('drops the paying account on a payable, which moves no money yet', () => {
    const values = { ...emptyEntryForm(CK, '2026-09-16'), kind: 'payable' as const, amount: '12000', particulars: 'Gas', paid_from_account_id: VL };
    const result = validateEntryForm(values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paid_from_account_id).toBeNull();
  });

  test('the same account on both sides is stored as no other payer', () => {
    const values = { ...emptyEntryForm(CK, '2026-09-16'), amount: '500', particulars: 'Milk', paid_from_account_id: CK };
    const result = validateEntryForm(values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paid_from_account_id).toBeNull();
  });
});

describe('payerCaption', () => {
  test('reads who paid and for whom, by kind', () => {
    expect(payerCaption(entry({ kind: 'expense', paid_from_account_id: VL }), nameOf)).toBe('Paid by Velachery · for Central Kitchen');
    expect(payerCaption(entry({ kind: 'income', paid_from_account_id: VL }), nameOf)).toBe('Received by Velachery · for Central Kitchen');
    expect(payerCaption(entry({ kind: 'transfer', paid_from_account_id: VL }), nameOf)).toBe('From Velachery · to Central Kitchen');
  });

  test('is silent for the everyday case', () => {
    expect(payerCaption(entry(), nameOf)).toBeNull();
    expect(payerCaption(entry({ paid_from_account_id: CK }), nameOf)).toBeNull();
  });
});

describe('settlement', () => {
  test('remainingAmount is what is left after partial payments', () => {
    expect(remainingAmount(entry({ settled: 4500.5 }))).toBe(7499.5);
    expect(remainingAmount(entry({ settled: 12000 }))).toBe(0);
  });

  test('only an open payable or receivable can be settled, by an owner or a clerk', () => {
    expect(canSettleEntry(entry(), 'owner')).toBe(true);
    expect(canSettleEntry(entry(), 'accountant')).toBe(true);
    expect(canSettleEntry(entry(), 'cashier')).toBe(false);
    expect(canSettleEntry(entry({ status: 'settled' }), 'owner')).toBe(false);
    expect(canSettleEntry(entry({ kind: 'expense', status: 'recorded' }), 'owner')).toBe(false);
  });

  test('the settle form starts at the remaining amount', () => {
    expect(emptySettleForm(entry({ settled: 2000 }), '2026-09-16').amount).toBe('10000');
  });

  test('refuses more than remains and accepts a partial payment', () => {
    const e = entry({ settled: 2000 });
    const tooMuch = validateSettleForm({ ...emptySettleForm(e, '2026-09-16'), amount: '10000.01' }, e);
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.errors.amount).toContain('10000.00');

    const partial = validateSettleForm({ ...emptySettleForm(e, '2026-09-16'), amount: '2500', mode: 'bank', paid_from_account_id: VL, reference_no: ' UPI123 ' }, e);
    expect(partial.ok).toBe(true);
    if (partial.ok) {
      expect(partial.value).toMatchObject({ entry_id: 'entry-1', amount: 2500, mode: 'bank', paid_from_account_id: VL, reference_no: 'UPI123', notes: null });
    }
  });

  test('paying from the entry\'s own account is no other payer', () => {
    const e = entry();
    const result = validateSettleForm({ ...emptySettleForm(e, '2026-09-16'), paid_from_account_id: CK }, e);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paid_from_account_id).toBeNull();
  });
});

describe('offset against what the kitchen owes a branch', () => {
  const dispatch = entry({ kind: 'receivable', counterparty_account_id: VL, source_type: 'dispatch', source_id: 'dsp-1', particulars: 'Dispatch DSP-2026-000001 to Velachery' });

  test('only an open receivable from one of our own accounts can be offset', () => {
    expect(canOffsetEntry(dispatch)).toBe(true);
    expect(canOffsetEntry(entry({ kind: 'receivable' }))).toBe(false);
    expect(canOffsetEntry(entry({ kind: 'payable', counterparty_account_id: VL }))).toBe(false);
    expect(canOffsetEntry({ ...dispatch, status: 'settled' })).toBe(false);
  });

  test('says who owes whom when the other side is our own account', () => {
    expect(counterpartyCaption(dispatch, nameOf)).toBe('Owed by Velachery');
    expect(counterpartyCaption(entry({ kind: 'payable', counterparty_account_id: VL }), nameOf)).toBe('Owed to Velachery');
    expect(counterpartyCaption(entry({ kind: 'income', counterparty_account_id: VL }), nameOf)).toBeNull();
    expect(counterpartyCaption(entry(), nameOf)).toBeNull();
  });

  test('an offset is capped at what is owed and is never paid from a chosen account', () => {
    const form = { ...emptySettleForm(dispatch, '2026-09-26'), mode: 'offset' as const, amount: '5000', paid_from_account_id: CK };
    const tooMuch = validateSettleForm(form, dispatch, 4000);
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.errors.amount).toContain('4000.00');

    const ok = validateSettleForm(form, dispatch, 5000);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toMatchObject({ mode: 'offset', amount: 5000, paid_from_account_id: null });
  });

  test('refuses an offset on an ordinary payable', () => {
    const gas = entry();
    const result = validateSettleForm({ ...emptySettleForm(gas, '2026-09-26'), mode: 'offset' }, gas, 10000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.mode).toBeDefined();
  });
});

describe('due dates', () => {
  const today = '2026-10-10';

  test('says how soon an open due falls due', () => {
    expect(dueStatus(entry({ due_date: '2026-10-07' }), today)).toMatchObject({ bucket: 'overdue', days: -3, label: 'Overdue 3 days' });
    expect(dueStatus(entry({ due_date: '2026-10-09' }), today)?.label).toBe('Overdue 1 day');
    expect(dueStatus(entry({ due_date: '2026-10-10' }), today)).toMatchObject({ bucket: 'week', label: 'Due today' });
    expect(dueStatus(entry({ due_date: '2026-10-17' }), today)).toMatchObject({ bucket: 'week', label: 'Due in 7 days' });
    expect(dueStatus(entry({ due_date: '2026-10-28' }), today)).toMatchObject({ bucket: 'later', label: 'Due 28 Oct' });
    expect(dueStatus(entry({ due_date: null }), today)).toMatchObject({ bucket: 'undated', days: null });
  });

  test('only an open payable or receivable has a due status', () => {
    expect(dueStatus(entry({ status: 'settled', due_date: '2026-10-01' }), today)).toBeNull();
    expect(dueStatus(entry({ kind: 'expense', status: 'recorded', due_date: null }), today)).toBeNull();
  });

  test('the form keeps a due date on a payable and drops it on an expense', () => {
    const base = { ...emptyEntryForm(CK, '2026-10-04'), amount: '35000', particulars: 'Rent', due_date: '2026-10-07' };
    const payable = validateEntryForm({ ...base, kind: 'payable' });
    expect(payable.ok && payable.value.due_date).toBe('2026-10-07');
    const expense = validateEntryForm({ ...base, kind: 'expense' });
    expect(expense.ok && expense.value.due_date).toBeNull();
  });

  test('a due date before the transaction date is refused', () => {
    const result = validateEntryForm({ ...emptyEntryForm(CK, '2026-10-04'), kind: 'payable', amount: '100', particulars: 'Rent', due_date: '2026-10-01' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.due_date).toBeDefined();
  });

  test('summarizeDues totals what is to pay and collect for the accounts in view', () => {
    const rows: DuesSummaryRow[] = [
      { account_id: CK, kind: 'payable', bucket: 'overdue', amount: 12000, entries: 1 },
      { account_id: CK, kind: 'payable', bucket: 'week', amount: 35000, entries: 1 },
      { account_id: CK, kind: 'receivable', bucket: 'undated', amount: 5100.5, entries: 2 },
      { account_id: VL, kind: 'payable', bucket: 'later', amount: 999, entries: 1 },
    ];
    const mine = summarizeDues(rows, [CK]);
    expect(mine.payables).toMatchObject({ total: 47000, overdue: 12000, week: 35000, later: 0, entries: 2 });
    expect(mine.receivables).toMatchObject({ total: 5100.5, undated: 5100.5, entries: 2 });
    expect(summarizeDues(rows).payables.total).toBe(47999);
  });
});

describe('quick actions', () => {
  test('there is one short form per kind', () => {
    expect(QUICK_ENTRY_PRESETS.map((p) => p.kind)).toEqual(['expense', 'income', 'payable', 'receivable', 'transfer']);
  });
});
