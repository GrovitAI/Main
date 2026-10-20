import { categoryTree, lastAmounts, matchParticulars, oftenParticulars, placeOf, sameParticular } from '../kitchen-spend-utils';
import type { KitchenCategory, KitchenEntry, KitchenParticular } from '../kitchen-types';

const cat = (id: string, name: string, extra: Partial<KitchenCategory> = {}): KitchenCategory => ({ id, name, sort_order: 0, is_active: true, ...extra });
const categories = [
  cat('food', 'Food'), cat('dairy', 'Dairy', { parent_id: 'food' }), cat('fruit', 'Fruits', { parent_id: 'food' }),
  cat('tr', 'Transport', { asks: 'route' }), cat('sa', 'Salary advance', { asks: 'person' }), cat('old', 'Old', { is_active: false }),
];
const part = (id: string, name: string, category_id: string): KitchenParticular => ({ id, name, category_id, is_active: true });
const particulars = [part('m', 'Milk', 'dairy'), part('mm', 'Milkmaid', 'dairy'), part('v', 'Van', 'tr'), part('sm', 'Soy milk', 'dairy')];
const spent = (id: string, particular_id: string, amount: number, date: string, voided = false): KitchenEntry => ({
  id, type: 'spent', entry_date: date, party_id: null, item_id: null, qty: null, from_qty: null, amount, paid: true, mode: 'cash',
  category: 'Food', note: null, created_by: 'Owner', created_at: `${date}T09:00:00Z`, voided_at: voided ? 'x' : null, void_reason: null,
  replaces_id: null, particular_id, lines: [],
});

describe('kitchen spend utils (task 279)', () => {
  it('places a sub-category under its category and carries what it asks', () => {
    expect(placeOf(categories, 'dairy')?.label).toBe('Food › Dairy');
    expect(placeOf(categories, 'food')?.sub).toBeNull();
    expect(placeOf(categories, 'tr')?.asks).toBe('route');
    expect(placeOf(categories, 'nope')).toBeNull();
  });

  it('builds the tree without archived categories', () => {
    const tree = categoryTree(categories);
    expect(tree.map((t) => t.top.name)).toEqual(['Food', 'Salary advance', 'Transport']);
    expect(tree[0]?.subs.map((s) => s.name)).toEqual(['Dairy', 'Fruits']);
  });

  it('matches names that start with the text first', () => {
    expect(matchParticulars(particulars, 'mil').map((p) => p.name)).toEqual(['Milk', 'Milkmaid', 'Soy milk']);
    expect(matchParticulars(particulars, '  ')).toEqual([]);
    expect(sameParticular(particulars, ' milk ')?.id).toBe('m');
  });

  it('picks the often used ones with the last amount, ignoring voided entries', () => {
    const entries = [spent('1', 'm', 400, '2026-10-01'), spent('2', 'm', 480, '2026-10-05'), spent('3', 'v', 650, '2026-10-06'), spent('4', 'v', 999, '2026-10-07', true)];
    expect(oftenParticulars(entries, particulars).map((o) => [o.particular.name, o.lastAmount])).toEqual([['Milk', 480], ['Van', 650]]);
    expect(lastAmounts(entries).get('v')).toBe(650);
  });
});
