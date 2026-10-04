import {
  allocateAcross,
  balanceFromEntries,
  describeKitchenError,
  entryAmountText,
  entryHeadline,
  entrySubline,
  formatQty,
  isMoneyOut,
  linesTotal,
  matchesSearch,
  monthTotals,
  slipText,
  statementRows,
  sumDues,
  whatsappUrl,
} from '../kitchen-utils';
import type { KitchenEntry, KitchenItem, KitchenOpenDocument, KitchenPartyBalance } from '../kitchen-types';

const item = (id: string, name: string, unit: KitchenItem['unit'], price: number | null): KitchenItem => ({
  id,
  name,
  unit,
  sell_price: price,
  stock: 0,
  is_active: true,
  updated_at: '',
});

let seq = 0;
const entry = (over: Partial<KitchenEntry> & Pick<KitchenEntry, 'type'>): KitchenEntry => ({
  id: `e${++seq}`,
  entry_date: '2026-10-04',
  party_id: null,
  item_id: null,
  qty: null,
  from_qty: null,
  amount: 0,
  paid: true,
  mode: null,
  category: null,
  note: null,
  created_by: 'Chef',
  created_at: `2026-10-04T10:00:${String(seq).padStart(2, '0')}Z`,
  voided_at: null,
  void_reason: null,
  lines: [],
  ...over,
});

const items = new Map<string, KitchenItem>([
  ['i1', item('i1', 'Nutella sauce', 'kg', 900)],
  ['i4', item('i4', 'Custard base', 'pcs', 60)],
]);

const sent = entry({
  type: 'sent',
  party_id: 'b1',
  entry_date: '2026-10-01',
  amount: 4400,
  lines: [
    { id: 'l1', item_id: 'i1', qty: 2, price: 900, line_total: 1800 },
    { id: 'l2', item_id: 'i4', qty: 20, price: 60, line_total: 1200 },
  ],
});
const received = entry({ type: 'received', party_id: 'b1', entry_date: '2026-10-03', amount: 3000, mode: 'upi' });
const boughtLater = entry({ type: 'bought', party_id: 'v1', entry_date: '2026-09-30', amount: 2720, paid: false });
const boughtNow = entry({ type: 'bought', party_id: 'v2', entry_date: '2026-10-04', amount: 3720, paid: true, mode: 'cash' });
const paid = entry({ type: 'paid', party_id: 'v1', entry_date: '2026-10-03', amount: 1500, mode: 'upi' });
const gas = entry({ type: 'spent', category: 'Gas', entry_date: '2026-10-03', amount: 1150, mode: 'cash' });
const voided = entry({ type: 'spent', category: 'Rent', entry_date: '2026-10-02', amount: 99999, mode: 'cash', voided_at: '2026-10-02T12:00:00Z' });
const made = entry({ type: 'made', item_id: 'i1', qty: 4 });
const all = [sent, received, boughtLater, boughtNow, paid, gas, voided, made];

describe('money in and out', () => {
  it('counts a buy as money out only when it was paid on the spot', () => {
    expect(isMoneyOut(boughtNow)).toBe(true);
    expect(isMoneyOut(boughtLater)).toBe(false);
    expect(isMoneyOut(paid)).toBe(true);
    expect(isMoneyOut(gas)).toBe(true);
    expect(isMoneyOut(sent)).toBe(false);
  });

  it('sums the month and skips voided entries and other months', () => {
    const t = monthTotals(all, '2026-10');
    expect(t.moneyIn).toBe(3000);
    expect(t.moneyOut).toBe(3720 + 1500 + 1150);
    expect(t.sent).toBe(4400);
    expect(t.bought).toBe(3720); // the September buy is not this month's
  });
});

describe('give and take', () => {
  it('a branch owes what was sent minus what it paid', () => {
    expect(balanceFromEntries(all, 'b1', 'branch')).toBe(1400);
  });

  it('a vendor is owed the pay-later buys minus payments; a paid-now buy does not count', () => {
    expect(balanceFromEntries(all, 'v1', 'vendor')).toBe(1220);
    expect(balanceFromEntries(all, 'v2', 'vendor')).toBe(0);
  });

  it('a statement runs oldest to newest and is shown newest first', () => {
    const rows = statementRows(all, 'b1', 'branch');
    expect(rows.map((r) => r.entry.type)).toEqual(['received', 'sent']);
    expect(rows.map((r) => r.balanceAfter)).toEqual([1400, 4400]);
  });

  it('a vendor statement keeps the paid-now buy visible at zero effect', () => {
    const rows = statementRows(all, 'v2', 'vendor');
    expect(rows).toHaveLength(1);
    expect(rows[0].balanceAfter).toBe(0);
  });

  it('adds up only what is still owed', () => {
    const balances: KitchenPartyBalance[] = [
      { party_id: 'b1', kind: 'branch', name: 'Kolathur', phone: null, is_active: true, balance: 1400, last_entry_date: null },
      { party_id: 'b2', kind: 'branch', name: 'Velachery', phone: null, is_active: true, balance: -200, last_entry_date: null },
      { party_id: 'v1', kind: 'vendor', name: 'Aavin', phone: null, is_active: true, balance: 1220, last_entry_date: null },
    ];
    expect(sumDues(balances, 'branch')).toBe(1400);
    expect(sumDues(balances, 'vendor')).toBe(1220);
  });
});

describe('lines and quantities', () => {
  it('totals lines to the paisa', () => {
    expect(linesTotal([{ qty: 1.5, price: 950 }, { qty: 15, price: 60 }])).toBe(2325);
    expect(linesTotal([{ qty: 0.333, price: 100 }])).toBe(33.3);
  });

  it('formats quantities without trailing noise', () => {
    expect(formatQty(2, 'kg')).toBe('2 kg');
    expect(formatQty(0.5, 'kg')).toBe('0.5 kg');
    expect(formatQty(1.2345, 'L')).toBe('1.235 L');
    expect(formatQty(Number.NaN, 'pcs')).toBe('0 pcs');
  });
});

describe('matching money to what is open', () => {
  const docs: KitchenOpenDocument[] = [
    { entry_id: 'd2', party_id: 'v1', type: 'bought', entry_date: '2026-10-02', amount: 1000, covered: 0, open: 1000 },
    { entry_id: 'd1', party_id: 'v1', type: 'bought', entry_date: '2026-09-30', amount: 2720, covered: 1500, open: 1220 },
  ];

  it('covers the oldest first and stops when the money runs out', () => {
    expect(allocateAcross(docs, 1500)).toEqual([
      { entry_id: 'd1', amount: 1220 },
      { entry_id: 'd2', amount: 280 },
    ]);
  });

  it('never covers more than is open, and leaves the rest unmatched', () => {
    expect(allocateAcross(docs, 5000)).toEqual([
      { entry_id: 'd1', amount: 1220 },
      { entry_id: 'd2', amount: 1000 },
    ]);
    expect(allocateAcross(docs, 0)).toEqual([]);
  });
});

describe('labels', () => {
  it('names the entry from the kitchen’s side', () => {
    expect(entryHeadline(sent, { party: 'Kolathur' })).toBe('Sent to Kolathur');
    expect(entryHeadline(paid, { party: 'Aavin' })).toBe('Paid Aavin');
    expect(entryHeadline(gas, {})).toBe('Gas');
    expect(entryHeadline(made, { item: 'Nutella sauce' })).toBe('Made Nutella sauce');
  });

  it('says what was on a send, and how a buy was paid', () => {
    expect(entrySubline(sent, items)).toBe('Nutella sauce 2 kg, Custard base 20 pcs');
    expect(entrySubline(boughtLater, items)).toBe('pay later');
    expect(entrySubline(boughtNow, items)).toBe('paid · Cash');
    expect(entrySubline(made, items)).toBe('+4 kg');
  });

  it('signs money in and out, and leaves stock entries blank', () => {
    expect(entryAmountText(received)).toBe('+₹3,000');
    expect(entryAmountText(paid)).toBe('−₹1,500');
    expect(entryAmountText(sent)).toBe('₹4,400');
    expect(entryAmountText(made)).toBe('');
  });
});

describe('the slip', () => {
  it('lists each line, the total and what the branch now owes', () => {
    const text = slipText({ kitchenName: 'Le Laban Central Kitchen', partyName: 'Kolathur', entry: sent, itemsById: items, balanceAfter: 5800 });
    expect(text).toContain('Nutella sauce  2 kg × ₹900 = ₹1,800');
    expect(text).toContain('Total ₹4,400');
    expect(text.trim().endsWith('Kolathur yet to pay: ₹5,800')).toBe(true);
  });

  it('opens WhatsApp to the number when there is one, with the text filled in', () => {
    expect(whatsappUrl('Hi there', '98765 43210')).toBe('https://wa.me/919876543210?text=Hi%20there');
    expect(whatsappUrl('Hi', null)).toBe('https://wa.me/?text=Hi');
  });
});

describe('search and errors', () => {
  it('matches every word, in any order, ignoring case', () => {
    expect(matchesSearch('nut sauce', 'Nutella sauce')).toBe(true);
    expect(matchesSearch('SAUCE', 'Nutella sauce')).toBe(true);
    expect(matchesSearch('pista', 'Nutella sauce', null)).toBe(false);
    expect(matchesSearch('  ', 'anything')).toBe(true);
  });

  it('turns the database codes into sentences', () => {
    expect(describeKitchenError('P0002 KITCHEN_PARTY_NOT_FOUND', 'x')).toBe('That branch or vendor is no longer in the list.');
    expect(describeKitchenError('22023 KITCHEN_INVALID_MATCH', 'x')).toContain('matched amounts');
    expect(describeKitchenError('something else', 'fallback')).toBe('fallback');
  });
});
