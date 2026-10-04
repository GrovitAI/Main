/**
 * Pure helpers for the kitchen's books: sums, balances, labels and the send
 * slip. Nothing here touches the database, so all of it is unit-tested.
 */
import { formatINR } from './finance-utils';
import type {
  CoverInput,
  KitchenEntry,
  KitchenEntryType,
  KitchenItem,
  KitchenMode,
  KitchenOpenDocument,
  KitchenPartyBalance,
  KitchenPartyKind,
  KitchenUnit,
} from './kitchen-types';

/** The categories a new kitchen starts with; it adds its own from the Spent screen. */
export const DEFAULT_KITCHEN_CATEGORIES: readonly string[] = ['Salaries', 'Gas', 'Electricity', 'Rent', 'Transport', 'Packaging', 'Repairs', 'Cleaning', 'Other'];

/** How many expense categories the Spent screen shows before "More". */
export const SHOWN_CATEGORIES = 5;

/**
 * Categories in the order the kitchen uses them: the ones with the most
 * expenses first, then the list's own order, then the name. Inactive ones are
 * left out. A chosen name that is not among the first few is pulled into them,
 * so the selection is always on screen.
 */
export function orderCategories<T extends { name: string; sort_order: number; is_active: boolean }>(
  categories: readonly T[],
  entries: readonly Pick<KitchenEntry, 'type' | 'category' | 'voided_at'>[],
): T[] {
  const uses = new Map<string, number>();
  for (const e of entries) {
    if (e.type !== 'spent' || e.voided_at !== null || !e.category) continue;
    const key = e.category.trim().toLowerCase();
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  return categories
    .filter((c) => c.is_active)
    .slice()
    .sort((a, b) => (uses.get(b.name.trim().toLowerCase()) ?? 0) - (uses.get(a.name.trim().toLowerCase()) ?? 0) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function shownCategories<T extends { name: string }>(ordered: readonly T[], chosen: string | null, count = SHOWN_CATEGORIES): T[] {
  const top = ordered.slice(0, count);
  if (!chosen || top.some((c) => c.name === chosen)) return top;
  const picked = ordered.find((c) => c.name === chosen);
  if (!picked) return top;
  return [...top.slice(0, Math.max(0, count - 1)), picked];
}

export const KITCHEN_MODES: readonly { value: KitchenMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
];

export function modeLabel(mode: KitchenMode | null): string {
  return KITCHEN_MODES.find((m) => m.value === mode)?.label ?? '';
}

// ─── Dates ───────────────────────────────────────────────────────────────────

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The device's local date as 'YYYY-MM-DD'. */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' string. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function formatDayLabel(dateKey: string, today: string = localDateKey()): string {
  if (dateKey === today) return 'Today';
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatLongDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** When an entry was keyed in, as "4 Oct, 11:32 pm"; the entry date says when the thing happened. */
export function formatEnteredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}, ${time}`;
}

// ─── Money and quantities ────────────────────────────────────────────────────

export const isPosted = (e: Pick<KitchenEntry, 'voided_at'>): boolean => e.voided_at === null;

/** Money came in: a branch paid. */
export function isMoneyIn(e: Pick<KitchenEntry, 'type'>): boolean {
  return e.type === 'received';
}

/** Money went out: a vendor paid, a bill paid, or a buy paid on the spot. */
export function isMoneyOut(e: Pick<KitchenEntry, 'type' | 'paid'>): boolean {
  return e.type === 'paid' || e.type === 'spent' || (e.type === 'bought' && e.paid);
}

export type KitchenMonthTotals = { moneyIn: number; moneyOut: number; sent: number; bought: number };

/** The month's figures from posted entries; voided ones are skipped. */
export function monthTotals(entries: readonly KitchenEntry[], monthKey: string): KitchenMonthTotals {
  const t: KitchenMonthTotals = { moneyIn: 0, moneyOut: 0, sent: 0, bought: 0 };
  for (const e of entries) {
    if (!isPosted(e) || monthKeyOf(e.entry_date) !== monthKey) continue;
    if (isMoneyIn(e)) t.moneyIn += e.amount;
    if (isMoneyOut(e)) t.moneyOut += e.amount;
    if (e.type === 'sent') t.sent += e.amount;
    if (e.type === 'bought') t.bought += e.amount;
  }
  return t;
}

/**
 * What an entry does to a party's give-and-take. For a branch: a send adds,
 * money received takes away. For a vendor: a pay-later buy adds, a payment
 * takes away. A buy paid on the spot never touches the vendor's figure.
 */
export function partyEffect(e: Pick<KitchenEntry, 'type' | 'paid' | 'amount'>, kind: KitchenPartyKind): number {
  if (kind === 'branch') {
    if (e.type === 'sent') return e.amount;
    if (e.type === 'received') return -e.amount;
    return 0;
  }
  if (e.type === 'bought' && !e.paid) return e.amount;
  if (e.type === 'paid') return -e.amount;
  return 0;
}

export function balanceFromEntries(entries: readonly KitchenEntry[], partyId: string, kind: KitchenPartyKind): number {
  let bal = 0;
  for (const e of entries) {
    if (e.party_id === partyId && isPosted(e)) bal += partyEffect(e, kind);
  }
  return Math.round(bal * 100) / 100;
}

/** Oldest first by date, then by the order they were recorded. */
export function chronological<T extends Pick<KitchenEntry, 'entry_date' | 'created_at'>>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    a.entry_date === b.entry_date ? a.created_at.localeCompare(b.created_at) : a.entry_date < b.entry_date ? -1 : 1,
  );
}

export function newestFirst<T extends Pick<KitchenEntry, 'entry_date' | 'created_at'>>(entries: readonly T[]): T[] {
  return chronological(entries).reverse();
}

/** Rupees typed by hand: commas and spaces tolerated, anything else is 0. */
export function parseAmount(text: string): number {
  const n = Number(text.replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

/** The last price the kitchen paid for each item, from its buys. */
export function lastCostByItem(entries: readonly KitchenEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of newestFirst(entries)) {
    if (e.type !== 'bought' || !isPosted(e)) continue;
    for (const l of e.lines) if (!out.has(l.item_id)) out.set(l.item_id, l.price);
  }
  return out;
}

export type StatementRow = { entry: KitchenEntry; balanceAfter: number };

/** A party's give-and-take, newest first, with the figure after each line. */
export function statementRows(entries: readonly KitchenEntry[], partyId: string, kind: KitchenPartyKind): StatementRow[] {
  let bal = 0;
  const rows: StatementRow[] = [];
  for (const e of chronological(entries)) {
    if (e.party_id !== partyId || !isPosted(e)) continue;
    const effect = partyEffect(e, kind);
    if (effect === 0 && e.type !== 'bought') continue;
    bal = Math.round((bal + effect) * 100) / 100;
    rows.push({ entry: e, balanceAfter: bal });
  }
  return rows.reverse();
}

/** What all branches still owe, or what the kitchen owes all vendors. Negatives (overpaid) are left out. */
export function sumDues(balances: readonly KitchenPartyBalance[], kind: KitchenPartyKind): number {
  let total = 0;
  for (const b of balances) if (b.kind === kind && b.balance > 0) total += b.balance;
  return Math.round(total * 100) / 100;
}

export function lineTotal(qty: number, price: number): number {
  return Math.round(qty * price * 100) / 100;
}

export function linesTotal(lines: readonly { qty: number; price: number }[]): number {
  let total = 0;
  for (const l of lines) total += lineTotal(l.qty, l.price);
  return Math.round(total * 100) / 100;
}

export function formatQty(qty: number, unit: KitchenUnit | string): string {
  const safe = Number.isFinite(qty) ? qty : 0;
  const rounded = Math.round(safe * 1000) / 1000;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${text} ${unit}`;
}

/** How much one tap on + or − moves a quantity. */
export function stepFor(unit: KitchenUnit): number {
  return unit === 'pcs' ? 1 : 0.5;
}

export const formatMoney = (amount: number): string => formatINR(amount);

// ─── Matching money to buys and sends ────────────────────────────────────────

/**
 * Spreads an amount over the chosen open documents, oldest first, each taking
 * no more than what is still open on it. What is left over stays unmatched.
 */
export function allocateAcross(docs: readonly KitchenOpenDocument[], amount: number): CoverInput[] {
  const covers: CoverInput[] = [];
  let left = Math.round(amount * 100);
  const ordered = [...docs].sort((a, b) => (a.entry_date === b.entry_date ? 0 : a.entry_date < b.entry_date ? -1 : 1));
  for (const d of ordered) {
    if (left <= 0) break;
    const open = Math.round(d.open * 100);
    if (open <= 0) continue;
    const take = Math.min(open, left);
    covers.push({ entry_id: d.entry_id, amount: take / 100 });
    left -= take;
  }
  return covers;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export type KitchenNames = { party?: string | null; item?: string | null };

export function typeLabel(type: KitchenEntryType): string {
  switch (type) {
    case 'sent': return 'Sent';
    case 'received': return 'Received';
    case 'bought': return 'Bought';
    case 'paid': return 'Paid';
    case 'spent': return 'Spent';
    case 'made': return 'Made';
    case 'count': return 'Counted';
  }
}

export function entryHeadline(e: KitchenEntry, names: KitchenNames): string {
  const party = names.party ?? 'someone';
  const item = names.item ?? 'an item';
  switch (e.type) {
    case 'sent': return `Sent to ${party}`;
    case 'received': return `Received from ${party}`;
    case 'bought': return `Bought from ${party}`;
    case 'paid': return `Paid ${party}`;
    case 'spent': return e.category ?? 'Spent';
    case 'made': return `Made ${item}`;
    case 'count': return `Counted ${item}`;
  }
}

export function linesSummary(e: Pick<KitchenEntry, 'lines'>, itemsById: ReadonlyMap<string, KitchenItem>): string {
  return e.lines
    .map((l) => {
      const it = itemsById.get(l.item_id);
      return it ? `${it.name} ${formatQty(l.qty, it.unit)}` : formatQty(l.qty, '');
    })
    .join(', ');
}

export function entrySubline(e: KitchenEntry, itemsById: ReadonlyMap<string, KitchenItem>): string {
  const parts: string[] = [];
  if (e.type === 'sent' || e.type === 'bought') parts.push(linesSummary(e, itemsById));
  if (e.type === 'bought') parts.push(e.paid ? `paid${e.mode ? ` · ${modeLabel(e.mode)}` : ''}` : 'pay later');
  if (e.type === 'received' || e.type === 'paid' || e.type === 'spent') parts.push(modeLabel(e.mode));
  if (e.type === 'made' || e.type === 'count') {
    const it = e.item_id ? itemsById.get(e.item_id) : undefined;
    const unit = it?.unit ?? '';
    if (e.type === 'made' && e.qty !== null) parts.push(`+${formatQty(e.qty, unit)}`);
    if (e.type === 'count' && e.qty !== null) parts.push(`${e.from_qty !== null ? `was ${formatQty(e.from_qty, unit)}, ` : ''}now ${formatQty(e.qty, unit)}`);
  }
  if (e.note) parts.push(e.note);
  if (e.voided_at) parts.push('voided');
  return parts.filter((p) => p.length > 0).join(' · ');
}

/** Signed money text for a list row; empty for a stock-only entry. */
export function entryAmountText(e: KitchenEntry): string {
  if (e.type === 'made' || e.type === 'count') return '';
  if (isMoneyIn(e)) return formatINR(e.amount, { signed: true });
  if (isMoneyOut(e)) return formatINR(-e.amount);
  return formatINR(e.amount);
}

// ─── The send slip ───────────────────────────────────────────────────────────

export type SlipArgs = {
  kitchenName: string;
  partyName: string;
  entry: KitchenEntry;
  itemsById: ReadonlyMap<string, KitchenItem>;
  balanceAfter: number;
};

export function slipText({ kitchenName, partyName, entry, itemsById, balanceAfter }: SlipArgs): string {
  const lines = entry.lines.map((l) => {
    const it = itemsById.get(l.item_id);
    const name = it?.name ?? 'Item';
    const qty = formatQty(l.qty, it?.unit ?? '');
    return `${name}  ${qty} × ${formatINR(l.price)} = ${formatINR(l.line_total)}`;
  });
  return [
    kitchenName,
    `Sent to ${partyName} · ${formatDayLabel(entry.entry_date, '')}`,
    '',
    ...lines,
    '',
    `Total ${formatINR(entry.amount)}`,
    `${partyName} yet to pay: ${formatINR(balanceAfter)}`,
  ].join('\n');
}

/** A WhatsApp link that opens a chat (with the number, when known) with the text filled in. */
export function whatsappUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  const to = digits.length >= 10 ? (digits.length === 10 ? `91${digits}` : digits) : '';
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

// ─── Search and errors ───────────────────────────────────────────────────────

/** Case-insensitive match of every word in the query against the fields. */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;
  const hay = fields.filter((f): f is string => typeof f === 'string').join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Turns the database's short codes into a sentence the kitchen can act on. */
export function describeKitchenError(message: string | null | undefined, fallback: string): string {
  const m = message ?? '';
  if (m.includes('KITCHEN_FORBIDDEN') || m.includes('42501')) return 'This login cannot write the kitchen’s books.';
  if (m.includes('KITCHEN_PARTY_NOT_FOUND')) return 'That branch or vendor is no longer in the list.';
  if (m.includes('KITCHEN_ITEM_NOT_FOUND')) return 'That item is no longer in the list.';
  if (m.includes('KITCHEN_INVALID_LINE')) return 'Every line needs a quantity and a price.';
  if (m.includes('KITCHEN_INVALID_MATCH')) return 'The matched amounts are more than what is open, or more than the money paid.';
  if (m.includes('KITCHEN_INVALID')) return 'Check the amount, the mode and who it is for.';
  if (m.includes('kitchen_items_name_key')) return 'An item with that name already exists.';
  if (m.includes('kitchen_parties_name_key')) return 'That name is already in the list.';
  if (m.includes('kitchen_categories_name_key')) return 'That category is already in the list.';
  return fallback;
}
