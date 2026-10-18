import {
  allocateAcross,
  amountReadBack,
  balanceFromEntries,
  describeKitchenError,
  entryAmountText,
  entryHeadline,
  entrySubline,
  formatEnteredAt,
  formatQty,
  orderCategories,
  shownCategories,
  isMoneyOut,
  linesTotal,
  matchesSearch,
  monthTotals,
  oftenSent,
  slipText,
  statementRows,
  keepIfSame,
  moneyChangeOn,
  oftenGiven,
  padDisplay,
  padPress,
  stockLevels,
  sumDues,
  whatsappUrl,
} from '../kitchen-utils';
import type { PadKey } from '../kitchen-utils';
import type { KitchenEntry, KitchenItem, KitchenOpenDocument, KitchenPartyBalance } from '../kitchen-types';

const item = (id: string, name: string, unit: KitchenItem['unit'], price: number | null): KitchenItem => ({
  item_kind: price === null ? 'raw_material' : 'finished_good',
  id,
  name,
  unit,
  sell_price: price,
  cost_price: null,
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
  replaces_id: null,
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
      { party_id: 'b1', kind: 'branch', name: 'Kolathur', phone: null, is_active: true, balance: 1400, opening: 0, last_entry_date: null },
      { party_id: 'b2', kind: 'branch', name: 'Velachery', phone: null, is_active: true, balance: -200, opening: 0, last_entry_date: null },
      { party_id: 'v1', kind: 'vendor', name: 'Aavin', phone: null, is_active: true, balance: 1220, opening: 0, last_entry_date: null },
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
    { entry_id: 'd2', party_id: 'v1', type: 'bought', entry_date: '2026-10-02', amount: 1000, covered: 0, open: 1000, reopened: 0 },
    { entry_id: 'd1', party_id: 'v1', type: 'bought', entry_date: '2026-09-30', amount: 2720, covered: 1500, open: 1220, reopened: 0 },
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

describe('expense categories', () => {
  const cat = (name: string, sort_order: number, is_active = true) => ({ id: name, name, sort_order, is_active });
  const spent = (category: string, voided = false) => ({ type: 'spent' as const, category, voided_at: voided ? '2026-10-01T00:00:00Z' : null });

  it('puts the most-used categories first, then the list order, and hides inactive ones', () => {
    const list = [cat('Rent', 10), cat('Gas', 20), cat('Water cans', 100), cat('Old', 30, false)];
    const uses = [spent('Water cans'), spent('water cans'), spent('Gas'), spent('Old'), spent('Old'), spent('Old'), spent('Gas', true)];
    expect(orderCategories(list, uses).map((c) => c.name)).toEqual(['Water cans', 'Gas', 'Rent']);
  });

  it('shows the first few and pulls the chosen one in when it sits further down', () => {
    const ordered = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => cat(n, i));
    expect(shownCategories(ordered, null).map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(shownCategories(ordered, 'C').map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(shownCategories(ordered, 'G').map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'G']);
    expect(shownCategories(ordered, 'Missing').map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('formatEnteredAt', () => {
  it('gives the day and the clock time, and nothing for a bad stamp', () => {
    const text = formatEnteredAt('2026-10-04T18:02:00+05:30');
    expect(text).toMatch(/Oct/);
    expect(text).toMatch(/\d{1,2}:\d{2}/);
    expect(formatEnteredAt('not a date')).toBe('');
  });
});

describe('opening balances', () => {
  const sent = entry({ type: 'sent', party_id: 'b9', amount: 300, entry_date: '2026-10-02' });
  const got = entry({ type: 'received', party_id: 'b9', amount: 1000, entry_date: '2026-10-03' });

  it('starts the figure at what stood before the app', () => {
    expect(balanceFromEntries([sent, got], 'b9', 'branch')).toBe(-700);
    expect(balanceFromEntries([sent, got], 'b9', 'branch', 1200)).toBe(500);
    expect(balanceFromEntries([sent, got], 'b9', 'branch', -50)).toBe(-750);
  });

  it('runs the statement from the opening figure', () => {
    const rows = statementRows([sent, got], 'b9', 'branch', 1200);
    expect(rows.map((r) => r.balanceAfter)).toEqual([500, 1500]);
  });
});

describe('oftenSent (task 216)', () => {
  const line = (item_id: string, qty: number) => ({ id: item_id + qty, item_id, qty, price: 10, line_total: qty * 10 });
  it('ranks a branch\'s items by sends, keeps the latest quantity and skips voids and other branches', () => {
    const list = [
      entry({ type: 'sent', party_id: 'p1', entry_date: '2026-10-01', lines: [line('mousse', 10), line('sauce', 2)] }),
      entry({ type: 'sent', party_id: 'p1', entry_date: '2026-10-03', lines: [line('mousse', 24)] }),
      entry({ type: 'sent', party_id: 'p1', entry_date: '2026-10-04', voided_at: '2026-10-04T11:00:00Z', lines: [line('sauce', 9), line('cup', 5)] }),
      entry({ type: 'sent', party_id: 'p2', lines: [line('cup', 50), line('cup', 50)] }),
      entry({ type: 'bought', party_id: 'p1', lines: [line('milk', 30)] }),
    ];
    expect(oftenSent(list, 'p1')).toEqual([{ itemId: 'mousse', times: 2, lastQty: 24 }, { itemId: 'sauce', times: 1, lastQty: 2 }]);
    expect(oftenSent(list, 'p1', 1).map((r) => r.itemId)).toEqual(['mousse']);
    expect(oftenSent(list, 'nobody')).toEqual([]);
  });
});

describe('amountReadBack', () => {
  it('reads large amounts back the Indian way', () => {
    expect(amountReadBack('112000')).toBe('₹1,12,000 · 1.12 lakh');
    expect(amountReadBack('2500')).toBe('₹2,500');
    expect(amountReadBack('15000000')).toBe('₹1,50,00,000 · 1.5 crore');
    expect(amountReadBack('100000')).toBe('₹1,00,000 · 1 lakh');
  });
  it('stays quiet for small, empty or unreadable amounts', () => {
    expect(amountReadBack('999')).toBeNull();
    expect(amountReadBack('')).toBeNull();
    expect(amountReadBack('12a')).toBeNull();
  });
});

describe('stockLevels', () => {
  test('measures against the latest count, low at a quarter or less, out at zero', () => {
    const entries = [
      entry({ type: 'count', item_id: 'a', qty: 40, entry_date: '2026-10-01' }),
      entry({ type: 'count', item_id: 'a', qty: 56, entry_date: '2026-10-12' }),
      entry({ type: 'count', item_id: 'b', qty: 8, entry_date: '2026-10-14' }),
      entry({ type: 'count', item_id: 'c', qty: 99, entry_date: '2026-10-15', voided_at: '2026-10-15T12:00:00Z' }),
    ];
    const levels = stockLevels(entries, [{ id: 'a', stock: 40 }, { id: 'b', stock: 1.2 }, { id: 'c', stock: 0 }, { id: 'd', stock: 12 }, { id: 'e', stock: 70 }]);
    expect(levels.get('a')).toEqual({ ref: 56, countedOn: '2026-10-12', state: 'ok', share: 40 / 56 });
    expect(levels.get('b')?.state).toBe('low');
    // A voided count is ignored; zero stock is out with or without a count.
    expect(levels.get('c')).toEqual({ ref: null, countedOn: null, state: 'out', share: 0 });
    expect(levels.get('d')).toEqual({ ref: null, countedOn: null, state: 'unknown', share: 0 });
  });
  test('stock grown past the last count fills the bar instead of overflowing it', () => {
    const levels = stockLevels([entry({ type: 'count', item_id: 'a', qty: 20 })], [{ id: 'a', stock: 50 }]);
    expect(levels.get('a')).toMatchObject({ ref: 50, share: 1, state: 'ok' });
  });
});

describe('padPress and padDisplay', () => {
  const typed = (keys: readonly PadKey[]): string => keys.reduce<string>((v, k) => padPress(v, k), '');
  it('types rupees and up to two paise digits after one point', () => {
    expect(typed(['1', '2', '3', '4', '.', '5', '0', '9'])).toBe('1234.50');
    expect(typed(['5', '.', '.', '2'])).toBe('5.2');
  });
  it('starts a lone point as zero and drops a leading zero', () => {
    expect(typed(['.', '7', '5'])).toBe('0.75');
    expect(typed(['0', '0', '8'])).toBe('8');
  });
  it('stops at nine rupee digits and deletes one character at a time', () => {
    expect(typed(['9', '9', '9', '9', '9', '9', '9', '9', '9', '9'])).toBe('999999999');
    expect(typed(['1', '.', '5', 'del', 'del'])).toBe('1');
  });
  it('shows the amount as typed, grouped the Indian way', () => {
    expect(padDisplay('')).toBe('₹0');
    expect(padDisplay('112000')).toBe('₹1,12,000');
    expect(padDisplay('12.')).toBe('₹12.');
    expect(padDisplay('1234.5')).toBe('₹1,234.5');
  });
});

describe('moneyChangeOn', () => {
  it('adds the day to cash or bank by mode, with transfers, skipping voided entries and other days', () => {
    const day = '2026-10-16';
    const entries = [
      entry({ type: 'received', amount: 850, mode: 'cash', entry_date: day }),
      entry({ type: 'received', amount: 2000, mode: 'upi', entry_date: day }),
      entry({ type: 'spent', amount: 150, mode: null, entry_date: day }),
      entry({ type: 'bought', amount: 400, paid: false, entry_date: day }),
      entry({ type: 'paid', amount: 300, mode: 'bank', entry_date: day }),
      entry({ type: 'received', amount: 999, mode: 'cash', entry_date: day, voided_at: '2026-10-16T08:00:00Z' }),
      entry({ type: 'received', amount: 500, mode: 'cash', entry_date: '2026-10-15' }),
    ];
    const moves = [{ move_date: day, from_account: 'cash' as const, amount_paise: 50000 }, { move_date: '2026-10-15', from_account: 'bank' as const, amount_paise: 100 }];
    expect(moneyChangeOn(entries, moves, day)).toEqual({ cash: 850 - 150 - 500, bank: 2000 - 300 + 500 });
  });
});

describe('give to the kitchen (task 242)', () => {
  it('names the move and lists its lines, with no amount', () => {
    const items = new Map([['m', item('m', 'Milk', 'L', null)]]);
    const gave = entry({ type: 'issued', lines: [{ id: 'l1', item_id: 'm', qty: 12, price: 0, line_total: 0 }] });
    expect(entryHeadline(gave, {})).toBe('Given to the kitchen');
    expect(entrySubline(gave, items)).toBe('Milk 12 L');
    expect(entryAmountText(gave)).toBe('');
  });
  it('offers the raw materials most often given, with the last quantity', () => {
    const a = entry({ type: 'issued', entry_date: '2026-10-10', created_at: '2026-10-10T05:00:00Z', lines: [{ id: '1', item_id: 'm', qty: 10, price: 0, line_total: 0 }] });
    const b = entry({ type: 'issued', entry_date: '2026-10-12', created_at: '2026-10-12T05:00:00Z', lines: [{ id: '2', item_id: 'm', qty: 14, price: 0, line_total: 0 }, { id: '3', item_id: 's', qty: 2, price: 0, line_total: 0 }] });
    const voided = entry({ type: 'issued', voided_at: '2026-10-12T06:00:00Z', lines: [{ id: '4', item_id: 'x', qty: 1, price: 0, line_total: 0 }] });
    expect(oftenGiven([a, b, voided])).toEqual([{ itemId: 'm', times: 2, lastQty: 14 }, { itemId: 's', times: 1, lastQty: 2 }]);
  });
});

describe('keepIfSame (task 250)', () => {
  it('keeps the list already held when a reload finds nothing new', () => {
    const held = [{ id: 'a', stock: 4 }];
    expect(keepIfSame(held, [{ id: 'a', stock: 4 }])).toBe(held);
    const changed = [{ id: 'a', stock: 5 }];
    expect(keepIfSame(held, changed)).toBe(changed);
    expect(keepIfSame(held, null)).toBe(held);
  });
});
