import type { FinanceEntry } from '../finance-types';
import {
  canSettleEntry,
  emptyEntryForm,
  emptySettleForm,
  payerCaption,
  remainingAmount,
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
    kind: 'payable',
    status: 'open',
    amount: 12000,
    amount_paise: 1_200_000,
    mode: null,
    transfer_from: null,
    transfer_to: null,
    transaction_date: '2026-09-03',
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
