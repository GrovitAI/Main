import { ageBucket, ageingOf, daysBetween, dueState, fifoClear, monthCloseCsv, monthCloseRows, monthCloseSums, oldestByParty, oldestOpen, sinceLabel, sortParties, withCovers } from '../kitchen-dues-utils';
import { parseKitchenDues, parseKitchenMonthClose } from '../kitchen-dues-service';
import type { KitchenDue, KitchenMonthCloseParty } from '../kitchen-dues-types';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: () => ({ id: 'kitchen' }) }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: () => ({ tenant_id: 'tenant' }) }));

const due = (entry_date: string | null, amount: number, open: number, type: KitchenDue['type'] = 'bought'): KitchenDue => ({
  party_id: 'v1', entry_id: entry_date ? `e-${entry_date}-${amount}` : null, type: entry_date ? type : 'opening', entry_date, amount, open,
});

describe('ageing what is open (task 316)', () => {
  it('counts whole days and buckets them, the opening balance oldest of all', () => {
    expect(daysBetween('2026-10-01', '2026-11-16')).toBe(46);
    expect(ageBucket('2026-11-01', '2026-11-16')).toBe('upTo30');
    expect(ageBucket('2026-10-17', '2026-11-16')).toBe('upTo30');
    expect(ageBucket('2026-10-16', '2026-11-16')).toBe('upTo60');
    expect(ageBucket('2026-09-01', '2026-11-16')).toBe('over60');
    expect(ageBucket(null, '2026-11-16')).toBe('over60');
  });

  it('adds up only what is open in each bucket and finds the oldest open bill', () => {
    const dues = [due(null, 5000, 0), due('2026-09-10', 4000, 1500.5), due('2026-10-12', 18750, 18750), due('2026-11-02', 9000, 3000)];
    expect(ageingOf(dues, '2026-11-16')).toEqual({ upTo30: 3000, upTo60: 18750, over60: 1500.5 });
    expect(oldestOpen(dues)).toBe('2026-09-10');
    expect(oldestOpen([due(null, 5000, 200), ...dues])).toBeNull();
    expect(oldestOpen([due('2026-10-12', 100, 0)])).toBeUndefined();
    expect(sinceLabel(null)).toBe('from before the app');
    expect(sinceLabel(undefined)).toBeNull();
  });

  it('tags a bill as cleared, part left or open', () => {
    expect(dueState({ amount: 100, open: 0 })).toEqual({ kind: 'cleared' });
    expect(dueState({ amount: 100, open: 40 })).toEqual({ kind: 'part', left: 40 });
    expect(dueState({ amount: 100, open: 100 })).toEqual({ kind: 'open' });
  });
});

describe('what a payment clears, oldest first (task 317)', () => {
  const dues = [due('2026-10-20', 9000, 9000), due('2026-10-12', 18750, 18750), due('2026-11-02', 4000, 4000), due('2026-10-01', 500, 0)];
  it('clears the oldest open bill first and part of the next', () => {
    const out = fifoClear(dues, 24750);
    expect(out.cleared.map((c) => [c.due.entry_date, c.take, c.left])).toEqual([['2026-10-12', 18750, 0], ['2026-10-20', 6000, 3000]]);
    expect(out.ahead).toBe(0);
  });
  it('says what is paid ahead when the amount is more than what is open', () => {
    const out = fifoClear(dues, 33000.25);
    expect(out.cleared).toHaveLength(3);
    expect(out.ahead).toBe(1250.25);
  });
  it('lets bills picked by hand take their part before the rest clears oldest first', () => {
    const picked = withCovers(dues, [{ entry_id: 'e-2026-11-02-4000', amount: 4000 }]);
    expect(picked?.find((d) => d.entry_date === '2026-11-02')?.open).toBe(0);
    expect(fifoClear(picked ?? [], 20000).cleared.map((c) => c.due.entry_date)).toEqual(['2026-10-12', '2026-10-20']);
    expect(withCovers(null, [])).toBeNull();
  });
  it('puts the opening balance first', () => {
    expect(fifoClear([due('2026-10-01', 100, 100), due(null, 50, 50)], 60).cleared[0]?.due.entry_id).toBeNull();
  });
});

describe('month close rows (task 318)', () => {
  const party = (name: string, kind: 'branch' | 'vendor', atStart: number, bills: number, paid: number): KitchenMonthCloseParty => ({
    party_id: name, kind, name, is_active: true, atStart, bills, paid, atEnd: atStart + bills - paid, open: Math.max(0, atStart + bills - paid), oldestDue: null, openingDue: false,
  });
  const all = [party('Kolathur', 'branch', 1000, 500, 300), party('Egmore', 'branch', 0, 0, 0), party('Tezz', 'vendor', 200, 0, 200)];
  const matches = (q: string, name: string) => name.toLowerCase().includes(q.toLowerCase());
  it('hides settled names unless asked, and filters by side and search', () => {
    expect(monthCloseRows(all, { show: 'all', query: '', settled: false, matches }).map((p) => p.name)).toEqual(['Kolathur', 'Tezz']);
    expect(monthCloseRows(all, { show: 'all', query: '', settled: true, matches })).toHaveLength(3);
    expect(monthCloseRows(all, { show: 'vendor', query: '', settled: false, matches }).map((p) => p.name)).toEqual(['Tezz']);
    expect(monthCloseRows(all, { show: 'all', query: 'kol', settled: false, matches }).map((p) => p.name)).toEqual(['Kolathur']);
  });
  it('adds the rows up', () => {
    expect(monthCloseSums(all)).toEqual({ atStart: 1200, bills: 500, paid: 500, atEnd: 1200 });
  });
});

describe('branches and vendors lists (task 319)', () => {
  const open = (party_id: string, entry_date: string | null, o: number): KitchenDue => ({ party_id, entry_id: entry_date, type: entry_date ? 'sent' : 'opening', entry_date, amount: 100, open: o });
  const oldest = oldestByParty([open('a', '2026-10-20', 10), open('a', '2026-10-05', 0), open('a', '2026-10-12', 5), open('b', null, 3), open('b', '2026-09-01', 3), open('c', '2026-11-01', 9)]);
  it('finds each name’s oldest open bill', () => {
    expect([...oldest.entries()]).toEqual([['a', '2026-10-12'], ['b', null], ['c', '2026-11-01']]);
  });
  it('orders by most pending, oldest due or name', () => {
    const row = (id: string, balance: number) => ({ party: { id, name: id.toUpperCase() }, balance });
    const rows = [row('c', 900), row('a', 15), row('d', 0), row('b', 6)];
    expect(sortParties(rows, 'pending', oldest).map((r) => r.party.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(sortParties(rows, 'oldest', oldest).map((r) => r.party.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortParties(rows, 'name', oldest).map((r) => r.party.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('reading the database answers', () => {
  it('reads dues in rupees and refuses a bad row', () => {
    expect(parseKitchenDues([{ party_id: 'v1', entry_id: null, type: 'opening', entry_date: null, amount_paise: 500000, open_paise: '125050' }]))
      .toEqual([{ party_id: 'v1', entry_id: null, type: 'opening', entry_date: null, amount: 5000, open: 1250.5 }]);
    expect(() => parseKitchenDues([{ party_id: 'v1', type: 'paid', amount_paise: 1, open_paise: 1 }])).toThrow();
  });
  it('reads the month close', () => {
    const t = { sales_paise: 100, carried_sales_paise: 0, purchases_paise: 200, carried_purchases_paise: 50, expenses_paise: 300, expenses_later_paise: 100, received_paise: 0, paid_vendors_paise: 0,
      cash_in_paise: 0, cash_out_paise: 0, bank_in_paise: 0, bank_out_paise: 0, moved_to_bank_paise: 0, moved_to_cash_paise: 0, drawings_cash_paise: 0, drawings_bank_paise: 0,
      has_opening: false, opening_as_of: null, start_cash_paise: null, start_bank_paise: null, end_cash_paise: null, end_bank_paise: null };
    const out = parseKitchenMonthClose({ from: '2026-10-01', to: '2026-10-31', totals: t, parties: [{ party_id: 'p', kind: 'vendor', name: 'Tezz', is_active: true, at_start_paise: 0, bills_paise: 5000, paid_paise: 0, at_end_paise: 5000, open_paise: 5000, oldest_due: '2026-10-12', opening_due: false }],
      carried: [{ id: 'c', entry_date: '2026-10-31', party_id: 'p', party: 'Tezz', kind: 'vendor', amount_paise: 5000, note: null, created_by: 'Junu' }], check: { pending_paise: 5000, open_paise: 5000, difference_paise: 0 } });
    expect(out.totals.purchases).toBe(2);
    expect(out.totals.startCash).toBeNull();
    expect(out.parties[0]?.oldestDue).toBe('2026-10-12');
    expect(out.check.difference).toBe(0);
    const first = out.carried[0];
    if (!first) throw new Error('no brought forward row');
    const csv = monthCloseCsv({ ...out, carried: [{ ...first, note: 'Bills, October "late"' }] });
    expect(csv.split(String.fromCharCode(10))[0]).toBe('Month close,2026-10-01 to 2026-10-31');
    expect(csv).toContain('Tezz,Vendor,0.00,50.00,0.00,50.00,2026-10-12');
    expect(csv).toContain('Tezz,2026-10-31,Vendor,50.00,"Bills, October ""late"""');
    expect(csv).toContain('Cash at start,' + String.fromCharCode(10));
  });
});
