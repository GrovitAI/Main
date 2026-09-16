import type { CatalogItem } from '../finance-types';
import {
  catalogSiblings,
  isCatalogUsable,
  moveCatalogSibling,
  nextSortOrder,
  suggestCatalog,
  validateCatalogName,
} from '../finance-ledger-utils';

function item(over: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'level' | 'name'>): CatalogItem {
  return { parent_id: null, default_kind: null, sort_order: 0, is_system: false, is_active: true, ...over };
}

const CATALOG: CatalogItem[] = [
  item({ id: 'util', level: 'category', name: 'Utilities', default_kind: 'expense', sort_order: 10 }),
  item({ id: 'elec', level: 'subcategory', name: 'Electricity', parent_id: 'util', sort_order: 10 }),
  item({ id: 'eb', level: 'particular', name: 'EB bill', parent_id: 'elec', sort_order: 10 }),
  item({ id: 'water', level: 'subcategory', name: 'Water', parent_id: 'util', sort_order: 20 }),
  item({ id: 'old', level: 'category', name: 'Old category', default_kind: 'expense', sort_order: 20, is_active: false }),
  item({ id: 'oldp', level: 'particular', name: 'EB old', parent_id: 'old', sort_order: 10 }),
];

describe('catalog editing helpers', () => {
  test('an item is usable only when it and every parent are active', () => {
    expect(isCatalogUsable(CATALOG, 'eb')).toBe(true);
    expect(isCatalogUsable(CATALOG, 'oldp')).toBe(false);
    expect(isCatalogUsable(CATALOG, 'missing')).toBe(false);
  });

  test('suggestions skip particulars under a hidden category', () => {
    const names = suggestCatalog(CATALOG, 'EB').map((s) => s.item.name);
    expect(names).toEqual(['EB bill']);
  });

  test('siblings are listed in the owner\'s order, hidden ones included', () => {
    expect(catalogSiblings(CATALOG, null).map((c) => c.name)).toEqual(['Utilities', 'Old category']);
    expect(catalogSiblings(CATALOG, 'util').map((c) => c.name)).toEqual(['Electricity', 'Water']);
  });

  test('names must be present, short and unique among siblings, case-insensitively', () => {
    const siblings = catalogSiblings(CATALOG, 'util');
    expect(validateCatalogName('   ', siblings)).toBe('Give it a name.');
    expect(validateCatalogName('x'.repeat(61), siblings)).toContain('60');
    expect(validateCatalogName('electricity', siblings)).toBe('That name is already in use here.');
    expect(validateCatalogName('Electricity', siblings, 'elec')).toBeNull();
    expect(validateCatalogName('Gas', siblings)).toBeNull();
  });

  test('a new item goes after the last sibling', () => {
    expect(nextSortOrder(catalogSiblings(CATALOG, 'util'))).toBe(30);
    expect(nextSortOrder([])).toBe(10);
  });

  test('moving swaps with the neighbour and renumbers; the ends stay put', () => {
    const siblings = catalogSiblings(CATALOG, 'util');
    expect(moveCatalogSibling(siblings, 'water', 'up')).toEqual([
      { id: 'water', sort_order: 10 },
      { id: 'elec', sort_order: 20 },
    ]);
    expect(moveCatalogSibling(siblings, 'elec', 'up')).toBeNull();
    expect(moveCatalogSibling(siblings, 'water', 'down')).toBeNull();
  });
});
