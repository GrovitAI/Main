import type { FinanceEntry } from '../finance-types';
import { buildStatement, rowBalanceLabel, statementBalanceLabel, statementIsCustomer } from '../finance-statement-utils';

const CK = 'acct-ck';
const VL = 'acct-vl';
const KLT = 'acct-klt';

let seq = 0;
function entry(over: Partial<FinanceEntry>): FinanceEntry {
  seq += 1;
  const stamp = `2026-10-${String(Math.min(28, seq)).padStart(2, '0')}`;
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
    transaction_date: stamp,
    due_date: null,
    entered_at: `${stamp}T05:00:00.000Z`,
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
    updated_at: `${stamp}T05:00:00.000Z`,
    version: 1,
    ...over,
  };
}

const money = (r: number) => `₹${r}`;

beforeEach(() => {
  seq = 0;
});

describe('a vendor statement', () => {
  test('a bill on credit is owed until its payment, and a bill paid on the spot nets to nothing', () => {
    const bill = entry({ kind: 'payable', status: 'settled', amount: 28000, settled: 28000, counterparty: 'Aavin Distributor', mode: null });
    const entries = [
      bill,
      entry({ kind: 'expense', amount: 900, counterparty: 'aavin distributor', particulars: 'Milk, paid cash' }),
      entry({ kind: 'expense', amount: 28000, mode: 'bank', counterparty: 'Aavin Distributor', settles_entry_id: bill.id }),
      entry({ kind: 'expense', amount: 500, counterparty: 'Someone else' }),
    ];
    const statement = buildStatement(entries, { type: 'name', name: 'Aavin Distributor' });
    expect(statement.rows).toHaveLength(3);
    expect(statement.rows.map((r) => r.balance)).toEqual([28000, 28000, 0]);
    expect(statement).toMatchObject({ billed: 28900, paid: 28900, balance: 0, direction: 'settled' });
  });

  test('an unpaid bill reads as ours to pay', () => {
    const statement = buildStatement(
      [entry({ kind: 'payable', status: 'open', amount: 12000, counterparty: 'Aavin Distributor', mode: null })],
      { type: 'name', name: 'Aavin Distributor' },
    );
    expect(statement.direction).toBe('we_owe');
    expect(statementBalanceLabel(statement, 'Aavin Distributor', null, money)).toBe('We owe Aavin Distributor ₹12000');
    expect(rowBalanceLabel(12000, { type: 'name', name: 'Aavin Distributor' }, statementIsCustomer(statement), money)).toBe('Owed ₹12000');
  });

  test('a voided entry and one with our own account on the other side are left out', () => {
    const statement = buildStatement(
      [
        entry({ kind: 'payable', status: 'void', amount: 500, counterparty: 'Aavin Distributor', mode: null }),
        entry({ kind: 'receivable', status: 'open', amount: 700, counterparty: 'Aavin Distributor', counterparty_account_id: VL, mode: null }),
      ],
      { type: 'name', name: 'Aavin Distributor' },
    );
    expect(statement.rows).toHaveLength(0);
  });
});

describe('a customer statement', () => {
  test('an order collected in two parts', () => {
    const order = entry({ kind: 'receivable', status: 'settled', amount: 15000, settled: 15000, counterparty: 'Mrs. Sruthi', mode: null });
    const statement = buildStatement(
      [
        order,
        entry({ kind: 'income', amount: 5000, mode: 'bank', counterparty: 'Mrs. Sruthi', settles_entry_id: order.id }),
        entry({ kind: 'income', amount: 10000, counterparty: 'Mrs. Sruthi', settles_entry_id: order.id }),
      ],
      { type: 'name', name: 'mrs. sruthi' },
    );
    expect(statement.rows.map((r) => r.balance)).toEqual([15000, 10000, 0]);
    expect(statement.direction).toBe('settled');
    expect(statementIsCustomer(statement)).toBe(true);
  });

  test('what a customer still owes reads as theirs to pay', () => {
    const statement = buildStatement(
      [entry({ kind: 'receivable', status: 'open', amount: 15000, counterparty: 'Mrs. Sruthi', mode: null })],
      { type: 'name', name: 'Mrs. Sruthi' },
    );
    expect(statement.direction).toBe('they_owe');
    expect(statementBalanceLabel(statement, 'Mrs. Sruthi', null, money)).toBe('Mrs. Sruthi owes us ₹15000');
  });
});

describe('a statement between the kitchen and a branch', () => {
  // The walkthrough: goods sent to Velachery, Velachery pays the kitchen's
  // dairy bill, the goods are offset against that, more goods, then part
  // offset and the rest in cash.
  function scenario(): FinanceEntry[] {
    const goods1 = entry({ kind: 'receivable', status: 'settled', amount: 9775, settled: 9775, counterparty_account_id: VL, counterparty: 'Velachery', mode: null, source_type: 'dispatch', source_id: 'd-1' });
    const dairy = entry({ kind: 'expense', amount: 12000, mode: 'bank', paid_from_account_id: VL, counterparty: 'Aavin Distributor', settles_entry_id: 'payable-aavin' });
    const offset1 = entry({ kind: 'income', amount: 9775, mode: 'offset', paid_from_account_id: VL, counterparty_account_id: VL, settles_entry_id: goods1.id });
    const goods2 = entry({ kind: 'receivable', status: 'settled', amount: 5950, settled: 5950, counterparty_account_id: VL, counterparty: 'Velachery', mode: null, source_type: 'dispatch', source_id: 'd-2' });
    const offset2 = entry({ kind: 'income', amount: 2225, mode: 'offset', paid_from_account_id: VL, counterparty_account_id: VL, settles_entry_id: goods2.id });
    const cash = entry({ kind: 'income', amount: 3725, mode: 'cash', counterparty_account_id: VL, settles_entry_id: goods2.id });
    // Kolathur's goods, paid by bank: not part of the Velachery statement.
    const kolathur = entry({ kind: 'receivable', status: 'settled', amount: 5100, settled: 5100, counterparty_account_id: KLT, mode: null });
    return [goods1, dairy, offset1, goods2, offset2, cash, kolathur];
  }

  test('the running balance follows who owes whom, and an offset moves it no further', () => {
    const statement = buildStatement(scenario(), { type: 'account', accountId: VL, homeAccountId: CK });
    expect(statement.rows).toHaveLength(6);
    expect(statement.rows.map((r) => r.balance)).toEqual([9775, -2225, -2225, 3725, 3725, 0]);
    expect(statement.direction).toBe('settled');
  });

  test('part way through, the kitchen owes the branch', () => {
    const statement = buildStatement(scenario().slice(0, 3), { type: 'account', accountId: VL, homeAccountId: CK });
    expect(statement.balance).toBe(-2225);
    expect(statement.direction).toBe('we_owe');
    expect(statementBalanceLabel(statement, 'Velachery', 'Central Kitchen', money)).toBe('Central Kitchen owes Velachery ₹2225');
    expect(rowBalanceLabel(-2225, { type: 'account', accountId: VL, homeAccountId: CK }, false, money)).toBe('Owed ₹2225');
  });

  test('a part-paid due leaves the rest owed by the branch', () => {
    const goods = entry({ kind: 'receivable', status: 'open', amount: 10000, settled: 4000, counterparty_account_id: KLT, mode: null });
    const paid = entry({ kind: 'income', amount: 4000, mode: 'bank', counterparty_account_id: KLT, settles_entry_id: goods.id });
    const statement = buildStatement([goods, paid], { type: 'account', accountId: KLT, homeAccountId: CK });
    expect(statement.balance).toBe(6000);
    expect(statementBalanceLabel(statement, 'Kolathur', 'Central Kitchen', money)).toBe('Kolathur owes Central Kitchen ₹6000');
  });

  test('a transfer back clears what the kitchen owes a partner', () => {
    const OWNER = 'acct-owner';
    const repair = entry({ kind: 'expense', amount: 4500, paid_from_account_id: OWNER, counterparty: 'Cool Care Services' });
    const repay = entry({ kind: 'transfer', amount: 4500, mode: null, transfer_from: 'bank', transfer_to: 'bank', account_id: OWNER, paid_from_account_id: CK });
    const statement = buildStatement([repair, repay], { type: 'account', accountId: OWNER, homeAccountId: CK });
    expect(statement.rows.map((r) => r.balance)).toEqual([-4500, 0]);
  });
});
