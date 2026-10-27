/**
 * Task 279: Spent by particular. A particular (Milk) is filed under a category or a sub-category
 * (Food › Dairy); these helpers find its place, match what is typed, and pick the often used ones.
 */
import type { KitchenCategory, KitchenCategoryAsks, KitchenEntry, KitchenParticular } from './kitchen-types';

export type CategoryPlace = {
  /** The top-level category. */
  top: KitchenCategory;
  /** The sub-category, when the particular is filed under one. */
  sub: KitchenCategory | null;
  /** "Food › Dairy", or "Food". */
  label: string;
  /** What an entry under it must name. */
  asks: KitchenCategoryAsks | null;
};

/** Where a category or sub-category sits; null when it is not in the list. */
export function placeOf(categories: readonly KitchenCategory[], categoryId: string | null | undefined): CategoryPlace | null {
  if (!categoryId) return null;
  const picked = categories.find((c) => c.id === categoryId);
  if (!picked) return null;
  const parent = picked.parent_id ? categories.find((c) => c.id === picked.parent_id) ?? null : null;
  if (parent) return { top: parent, sub: picked, label: `${parent.name} › ${picked.name}`, asks: picked.asks ?? parent.asks ?? null };
  return { top: picked, sub: null, label: picked.name, asks: picked.asks ?? null };
}

/** Top-level categories in name order, each with its sub-categories; archived ones left out. */
export function categoryTree(categories: readonly KitchenCategory[], includeArchived = false): { top: KitchenCategory; subs: KitchenCategory[] }[] {
  const shown = categories.filter((c) => includeArchived || c.is_active);
  const byName = (a: KitchenCategory, b: KitchenCategory) => a.name.localeCompare(b.name);
  const ids = new Set(shown.map((c) => c.id));
  // A sub-category whose category is archived (or gone) shows at the top level instead of vanishing.
  return shown.filter((c) => !c.parent_id || !ids.has(c.parent_id)).sort(byName)
    .map((top) => ({ top, subs: shown.filter((c) => c.parent_id === top.id).sort(byName) }));
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

/** Particulars matching what is typed: names that start with it first, then names that contain it. */
export function matchParticulars(particulars: readonly KitchenParticular[], query: string, limit = 6): KitchenParticular[] {
  const q = norm(query);
  if (!q) return [];
  const starts: KitchenParticular[] = [];
  const contains: KitchenParticular[] = [];
  for (const p of particulars) {
    const n = norm(p.name);
    if (n.startsWith(q)) starts.push(p);
    else if (n.includes(q)) contains.push(p);
  }
  const byName = (a: KitchenParticular, b: KitchenParticular) => a.name.localeCompare(b.name);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** True when the typed name is already a particular (case and spaces aside). */
export function sameParticular(particulars: readonly KitchenParticular[], name: string): KitchenParticular | null {
  const n = norm(name);
  return particulars.find((p) => norm(p.name) === n) ?? null;
}

/**
 * The particulars used most in the loaded Spent entries, most used first (ties to the most recent),
 * with the amount paid the last time. Voided entries do not count.
 */
export function oftenParticulars(entries: readonly KitchenEntry[], particulars: readonly KitchenParticular[], limit = 8): { particular: KitchenParticular; lastAmount: number }[] {
  const byId = new Map(particulars.map((p) => [p.id, p]));
  const seen = new Map<string, { times: number; lastAt: string; lastAmount: number }>();
  for (const e of entries) {
    if (e.type !== 'spent' || e.voided_at || !e.particular_id || !byId.has(e.particular_id)) continue;
    const at = `${e.entry_date} ${e.created_at}`;
    const row = seen.get(e.particular_id) ?? { times: 0, lastAt: '', lastAmount: e.amount };
    row.times += 1;
    if (at > row.lastAt) { row.lastAt = at; row.lastAmount = e.amount; }
    seen.set(e.particular_id, row);
  }
  return [...seen.entries()]
    .sort(([, a], [, b]) => b.times - a.times || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit)
    .flatMap(([id, row]) => {
      const particular = byId.get(id);
      return particular ? [{ particular, lastAmount: row.lastAmount }] : [];
    });
}

/** The amount paid the last time for each particular in the loaded entries. */
export function lastAmounts(entries: readonly KitchenEntry[]): Map<string, number> {
  const last = new Map<string, { at: string; amount: number }>();
  for (const e of entries) {
    if (e.type !== 'spent' || e.voided_at || !e.particular_id) continue;
    const at = `${e.entry_date} ${e.created_at}`;
    const prev = last.get(e.particular_id);
    if (!prev || at > prev.at) last.set(e.particular_id, { at, amount: e.amount });
  }
  return new Map([...last.entries()].map(([id, v]) => [id, v.amount]));
}
