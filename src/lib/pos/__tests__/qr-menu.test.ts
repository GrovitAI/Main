import { cartLines, cartTotals, changeQty, menuSections, MAX_LINES, MAX_QTY, orderLines, parseQrMenu, parseQrStatus, priceText, type QrMenu } from '@/lib/pos/qr-menu-utils';

const menu: QrMenu = {
  branch: 'Kolathur', table: 'T4',
  categories: [{ id: 'c1', name: 'Desserts' }, { id: 'c2', name: 'Drinks' }],
  items: [
    { id: 'a', name: 'Cheese bomb', price: 182, category_id: 'c1' },
    { id: 'b', name: 'Kunafa cup', price: 160, category_id: 'c1' },
    { id: 'c', name: 'Mango lassi', price: 99.5, category_id: 'c2' },
    { id: 'd', name: 'Filter coffee', price: 40, category_id: null },
    { id: 'e', name: 'Old special', price: 10, category_id: 'gone' },
  ],
};

describe('parseQrMenu', () => {
  it('keeps what is a menu and drops what is not', () => {
    const parsed = parseQrMenu({ branch: 'K', table: '1', categories: [{ id: 'c', name: 'X' }, { id: 1 }], items: [{ id: 'i', name: 'N', price: '12.5', category_id: 'c' }, { id: 'j', name: 'Bad', price: -1 }, { name: 'No id', price: 1 }] });
    expect(parsed?.categories).toEqual([{ id: 'c', name: 'X' }]);
    expect(parsed?.items).toEqual([{ id: 'i', name: 'N', price: 12.5, category_id: 'c' }]);
    expect(parseQrMenu(null)).toBeNull();
    expect(parseQrMenu({ branch: 'K' })).toBeNull();
  });
});

describe('menuSections', () => {
  it('groups by category, with items of no known category under More', () => {
    expect(menuSections(menu, '').map((s) => [s.title, s.items.map((i) => i.id)])).toEqual([['Desserts', ['a', 'b']], ['Drinks', ['c']], ['More', ['d', 'e']]]);
  });
  it('narrows by what was typed, in the name or the category', () => {
    expect(menuSections(menu, '  KUNAFA ').flatMap((s) => s.items.map((i) => i.id))).toEqual(['b']);
    expect(menuSections(menu, 'drinks').flatMap((s) => s.items.map((i) => i.id))).toEqual(['c']);
    expect(menuSections(menu, 'zzz')).toEqual([]);
  });
});

describe('the cart', () => {
  it('changes a quantity, never below none or above the most', () => {
    expect(changeQty({}, 'a', 1)).toEqual({ a: 1 });
    expect(changeQty({ a: 1 }, 'a', -1)).toEqual({});
    expect(changeQty({}, 'a', -1)).toEqual({});
    expect(changeQty({ a: MAX_QTY }, 'a', 1)).toEqual({ a: MAX_QTY });
  });
  it('holds at most 30 different items', () => {
    const full = Object.fromEntries(Array.from({ length: MAX_LINES }, (_, n) => [`p${n}`, 1]));
    expect(changeQty(full, 'new', 1)).toBe(full);
    expect(changeQty(full, 'p0', 1)).toEqual({ ...full, p0: 2 });
  });
  it('prices the order from the menu, and leaves out what is no longer on it', () => {
    const cart = { a: 2, c: 1, ghost: 3 };
    expect(cartLines(menu, cart).map((l) => [l.item.id, l.qty, l.amount])).toEqual([['a', 2, 364], ['c', 1, 99.5]]);
    expect(cartTotals(menu, cart)).toEqual({ count: 3, total: 463.5 });
    expect(orderLines(menu, cart)).toEqual([{ product_id: 'a', qty: 2 }, { product_id: 'c', qty: 1 }]);
  });
});

describe('priceText and status', () => {
  it('shows whole rupees plainly and others with paise', () => {
    expect(priceText(120)).toBe('₹120');
    expect(priceText(99.5)).toBe('₹99.50');
    expect(priceText(12345)).toBe('₹12,345');
  });
  it('reads an order status and nothing else', () => {
    expect(parseQrStatus({ status: 'declined', reason: 'Sold out' })).toEqual({ status: 'declined', reason: 'Sold out' });
    expect(parseQrStatus({ status: 'accepted', reason: null })).toEqual({ status: 'accepted', reason: null });
    expect(parseQrStatus({ status: 'weird' })).toBeNull();
    expect(parseQrStatus('x')).toBeNull();
  });
});
