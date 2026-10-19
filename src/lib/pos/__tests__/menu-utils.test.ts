import { ALL_CATEGORIES, countByCategory, filterMenu, importPreview, parsePrice } from '../menu-utils';
import type { MenuProduct } from '../menu-service';
import type { Category } from '../products-service';
import type { ProductValidationSummary, ValidatedProductRow } from '../menu-import-service';

const cat = (id: string, name: string): Category => ({ id, name, tenant_id: 't', branch_id: 'b' });
const item = (id: string, name: string, category_id: string | null, price = 100): MenuProduct => ({
  id, name, category_id, price, tenant_id: 't', branch_id: 'b', is_available: true, is_active: true,
});

describe('menu utils (task 276)', () => {
  it('reads a typed price', () => {
    expect(parsePrice('877')).toBe(877);
    expect(parsePrice(' ₹1,250.5 ')).toBe(1250.5);
    expect(parsePrice('0')).toBe(0);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('-5')).toBeNull();
    expect(parsePrice('12.345')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
  });

  const categories = [cat('c1', 'Signature'), cat('c2', 'Koushiri')];
  const products = [item('p1', 'Kashka', 'c1'), item('p2', 'Fazea Cake', 'c1'), item('p3', 'Koushiri Bowl', 'c2'), item('p4', 'Loose', null)];

  it('filters by category and searches the name or its category', () => {
    expect(filterMenu(products, categories, 'c1', '').map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(filterMenu(products, categories, ALL_CATEGORIES, 'signature').map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(filterMenu(products, categories, ALL_CATEGORIES, 'cake').map((p) => p.id)).toEqual(['p2']);
    expect(filterMenu(products, categories, 'c2', 'cake')).toEqual([]);
  });

  it('counts items per category with the total under all', () => {
    expect(countByCategory(products)).toEqual({ [ALL_CATEGORIES]: 4, c1: 2, c2: 1 });
  });

  it('previews an import: rows to fix, new categories once, and price changes only', () => {
    const row = (over: Partial<ValidatedProductRow>): ValidatedProductRow => ({
      index: 0, originalRow: {}, productName: 'X', price: 100, categoryName: 'Signature', inventoryTrackingEnabled: false,
      linkedRecipeCode: '', action: 'create', status: 'valid', errors: [], warnings: [], categoryId: 'c1', ...over,
    });
    const summary: ProductValidationSummary = {
      totalRows: 5, validRows: 4, errorRows: 1, createCount: 2, updateCount: 2,
      rows: [
        row({ index: 0, productName: 'Kashka', action: 'update', productId: 'p1', price: 120 }),
        row({ index: 1, productName: 'Fazea Cake', action: 'update', productId: 'p2', price: 100 }),
        row({ index: 2, productName: 'Waffle', categoryName: 'Waffles', categoryId: undefined }),
        row({ index: 3, productName: 'Waffle Two', categoryName: 'waffles', categoryId: undefined }),
        row({ index: 4, productName: '', status: 'invalid', action: 'error', errors: ['Product Name is required.'] }),
      ],
    };
    const { priceChanges, lines } = importPreview(summary, products);
    expect(priceChanges).toBe(1);
    expect(lines.map((l) => [l.kind, l.title, l.detail])).toEqual([
      ['fix', 'Row 6 · No name', 'Product Name is required.'],
      ['category', 'Waffles', 'New category'],
      ['price', 'Kashka', '₹100 → ₹120'],
    ]);
  });
});
