/**
 * Task 331: the customer's table menu. Pure helpers for the public page: what the menu looks like
 * once searched and grouped, what the order comes to, and the lines that are sent. Prices shown here
 * are only for the customer's eyes; the server prices the order again from its own menu.
 */

export type QrMenuCategory = { id: string; name: string };
export type QrMenuItem = { id: string; name: string; price: number; category_id: string | null };
export type QrMenu = { branch: string; table: string; categories: QrMenuCategory[]; items: QrMenuItem[] };
export type QrMenuSection = { id: string; title: string; items: QrMenuItem[] };
/** What is wanted so far: product id to quantity (1 to MAX_QTY); an item at zero is not in it. */
export type QrCart = Readonly<Record<string, number>>;

export const MAX_QTY = 20;
export const MAX_LINES = 30;

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The menu the server sent, or null when it is not one (so the page never draws half a menu). */
export function parseQrMenu(v: unknown): QrMenu | null {
  if (!record(v) || typeof v.branch !== 'string' || typeof v.table !== 'string') return null;
  const categories = (Array.isArray(v.categories) ? v.categories : []).filter(record)
    .filter((c): c is Record<string, unknown> & { id: string; name: string } => typeof c.id === 'string' && typeof c.name === 'string')
    .map((c) => ({ id: c.id, name: c.name }));
  const items = (Array.isArray(v.items) ? v.items : []).filter(record).flatMap((i): QrMenuItem[] => {
    const price = Number(i.price);
    if (typeof i.id !== 'string' || typeof i.name !== 'string' || !Number.isFinite(price) || price < 0) return [];
    return [{ id: i.id, name: i.name, price, category_id: typeof i.category_id === 'string' ? i.category_id : null }];
  });
  return { branch: v.branch, table: v.table, categories, items };
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** The menu in sections by category (an item with no category goes last under "More"), narrowed by what was typed. */
export function menuSections(menu: QrMenu, query: string): QrMenuSection[] {
  const q = norm(query);
  const shown = q ? menu.items.filter((i) => norm(i.name).includes(q) || norm(menu.categories.find((c) => c.id === i.category_id)?.name ?? '').includes(q)) : menu.items;
  const known = new Set(menu.categories.map((c) => c.id));
  const sections: QrMenuSection[] = menu.categories
    .map((c) => ({ id: c.id, title: c.name, items: shown.filter((i) => i.category_id === c.id) }))
    .filter((s) => s.items.length > 0);
  const rest = shown.filter((i) => i.category_id === null || !known.has(i.category_id));
  if (rest.length > 0) sections.push({ id: 'more', title: 'More', items: rest });
  return sections;
}

/** The cart with one more (or fewer) of an item, capped at MAX_QTY and at MAX_LINES different items. */
export function changeQty(cart: QrCart, id: string, by: number): QrCart {
  const now = cart[id] ?? 0;
  const next = Math.max(0, Math.min(MAX_QTY, now + by));
  if (next === now) return cart;
  if (now === 0 && Object.keys(cart).length >= MAX_LINES) return cart;
  const out: Record<string, number> = { ...cart };
  if (next === 0) delete out[id]; else out[id] = next;
  return out;
}

export type QrCartLine = { item: QrMenuItem; qty: number; amount: number };

/** The cart's lines in menu order. Anything no longer on the menu is left out. */
export function cartLines(menu: QrMenu, cart: QrCart): QrCartLine[] {
  return menu.items.flatMap((item): QrCartLine[] => {
    const qty = cart[item.id] ?? 0;
    return qty > 0 ? [{ item, qty, amount: Math.round(item.price * qty * 100) / 100 }] : [];
  });
}

export function cartTotals(menu: QrMenu, cart: QrCart): { count: number; total: number } {
  const lines = cartLines(menu, cart);
  return { count: lines.reduce((n, l) => n + l.qty, 0), total: Math.round(lines.reduce((t, l) => t + l.amount, 0) * 100) / 100 };
}

/** The lines the server wants: a product and a quantity, nothing else. */
export function orderLines(menu: QrMenu, cart: QrCart): { product_id: string; qty: number }[] {
  return cartLines(menu, cart).map((l) => ({ product_id: l.item.id, qty: l.qty }));
}

/** "₹120" or "₹99.50". */
export function priceText(amount: number): string {
  const whole = Number.isInteger(amount);
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** A fresh key for one attempt to send an order; sending the same key again returns the first order. */
export function newOrderKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export type QrOrderState = 'pending' | 'accepted' | 'declined' | 'expired';
export type QrOrderStatus = { status: QrOrderState; reason: string | null };

export function parseQrStatus(v: unknown): QrOrderStatus | null {
  if (!record(v)) return null;
  const s = v.status;
  if (s !== 'pending' && s !== 'accepted' && s !== 'declined' && s !== 'expired') return null;
  return { status: s, reason: typeof v.reason === 'string' && v.reason ? v.reason : null };
}
