import type { MenuProduct } from './menu-service';
import type { Category } from './products-service';
import type { ProductValidationSummary } from './menu-import-service';
import { formatMoney, matchesSearch } from './kitchen-utils';

/** The category choice that shows every item. */
export const ALL_CATEGORIES = 'all';

/**
 * A typed price as rupees, or null when it is not a usable price: empty, not a number, below zero,
 * or with more than two decimal places.
 */
export function parsePrice(text: string): number | null {
  const clean = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** A menu price as the till writes it: ₹877, with paise only when there are some (₹877.50). */
export function menuPrice(price: number): string {
  return formatMoney(price);
}

/** Items in a category (or all) whose name or category matches the search, in name order. */
export function filterMenu(products: readonly MenuProduct[], categories: readonly Category[], categoryId: string, query: string): MenuProduct[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return products.filter((p) =>
    (categoryId === ALL_CATEGORIES || p.category_id === categoryId)
    && matchesSearch(query, p.name, p.category_id ? names.get(p.category_id) : null));
}

/** How many items each category holds, with the total under ALL_CATEGORIES. */
export function countByCategory(products: readonly MenuProduct[]): Record<string, number> {
  const counts: Record<string, number> = { [ALL_CATEGORIES]: products.length };
  for (const p of products) if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
  return counts;
}

/** One line of an import preview: a row to fix, a category it will add, or a price it will change. */
export type ImportLine = { key: string; title: string; detail: string; kind: 'fix' | 'category' | 'price' };

/**
 * What an import will do, for its preview (task 276): rows that cannot be imported and why, new
 * categories, and price changes to items already on the menu. Spreadsheet rows count from 2, under
 * the header.
 */
export function importPreview(summary: ProductValidationSummary, products: readonly MenuProduct[]): { priceChanges: number; lines: ImportLine[] } {
  const prices = new Map(products.map((p) => [p.id, p.price]));
  const fixes: ImportLine[] = [];
  const categories: ImportLine[] = [];
  const changes: ImportLine[] = [];
  const newCategories = new Set<string>();
  for (const row of summary.rows) {
    const label = row.productName || 'No name';
    if (row.status === 'invalid') {
      fixes.push({ key: `fix-${row.index}`, title: `Row ${row.index + 2} · ${label}`, detail: row.errors.join(' '), kind: 'fix' });
      continue;
    }
    if (!row.categoryId && row.categoryName && !newCategories.has(row.categoryName.toLowerCase())) {
      newCategories.add(row.categoryName.toLowerCase());
      categories.push({ key: `cat-${row.index}`, title: row.categoryName, detail: 'New category', kind: 'category' });
    }
    const before = row.productId ? prices.get(row.productId) : undefined;
    if (row.action === 'update' && before !== undefined && before !== row.price) {
      changes.push({ key: `price-${row.index}`, title: label, detail: `${menuPrice(before)} → ${menuPrice(row.price)}`, kind: 'price' });
    }
  }
  return { priceChanges: changes.length, lines: [...fixes, ...categories, ...changes] };
}
