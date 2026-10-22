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
  entries: readonly (Pick<KitchenEntry, 'type' | 'category' | 'voided_at'> & { purchase_category_name?: string | null })[],
): T[] {
  // Task 255: Spent and Bought share one list, so a category counts its uses on both.
  const uses = new Map<string, number>();
  for (const e of entries) {
    if (e.voided_at !== null) continue;
    const name = e.type === 'spent' ? e.category : e.type === 'bought' ? e.purchase_category_name ?? null : null;
    if (!name) continue;
    const key = name.trim().toLowerCase();
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

/** The running figure: the opening balance plus every posted entry's effect. */
export function balanceFromEntries(entries: readonly KitchenEntry[], partyId: string, kind: KitchenPartyKind, opening = 0): number {
  let bal = opening;
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
/** Newest first, each with the figure after it; the running figure starts at the opening balance. */
export function statementRows(entries: readonly KitchenEntry[], partyId: string, kind: KitchenPartyKind, opening = 0): StatementRow[] {
  let bal = Math.round(opening * 100) / 100;
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

/** "₹1,12,000 · 1.12 lakh" for a typed 112000; nothing below ₹1,000 or for text that is not a number. */
export function amountReadBack(text: string): string | null {
  const value = Number(text.replace(/,/g, '').trim());
  if (!text.trim() || !Number.isFinite(value) || Math.abs(value) < 1000) return null;
  const grouped = formatMoney(value);
  const abs = Math.abs(value);
  const short = (n: number): string => String(Number(n.toFixed(2)));
  if (abs >= 1_00_00_000) return `${grouped} · ${short(abs / 1_00_00_000)} crore`;
  if (abs >= 1_00_000) return `${grouped} · ${short(abs / 1_00_000)} lakh`;
  return grouped;
}

/**
 * How much cash in hand and the bank changed on one day, in rupees (task 237): money received in,
 * money paid out, transfers between the two, and money moved into the owners' drawings or put back
 * (task 289), by the same rules as kitchen_money_summary (cash, or no mode, is Cash; UPI and bank
 * are Bank). Voided entries do not count.
 */
export function moneyChangeOn(
  entries: readonly KitchenEntry[],
  moves: readonly { move_date: string; from_account: 'cash' | 'bank'; amount_paise: number }[],
  day: string,
  drawings: readonly { draw_date: string; kind: 'in' | 'back'; account: 'cash' | 'bank'; amount_paise: number }[] = [],
): { cash: number; bank: number } {
  const out = { cash: 0, bank: 0 };
  for (const e of entries) {
    if (e.entry_date !== day || !isPosted(e)) continue;
    const sign = isMoneyIn(e) ? 1 : isMoneyOut(e) ? -1 : 0;
    if (sign === 0) continue;
    out[e.mode === 'upi' || e.mode === 'bank' ? 'bank' : 'cash'] += sign * e.amount;
  }
  for (const m of moves) {
    if (m.move_date !== day) continue;
    const rupees = m.amount_paise / 100;
    if (m.from_account === 'cash') { out.cash -= rupees; out.bank += rupees; } else { out.bank -= rupees; out.cash += rupees; }
  }
  for (const d of drawings) {
    if (d.draw_date === day) out[d.account] += (d.kind === 'in' ? -1 : 1) * d.amount_paise / 100;
  }
  return { cash: Math.round(out.cash * 100) / 100, bank: Math.round(out.bank * 100) / 100 };
}

/** A key on a phone's amount pad (task 235). */
export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'del';

/**
 * The amount text after a key on the pad: up to nine rupee digits, one decimal point and two
 * paise digits. A point first reads as "0."; a key that would break the amount is ignored.
 */
export function padPress(value: string, key: PadKey): string {
  if (key === 'del') return value.slice(0, -1);
  const [rupees = '', paise] = value.split('.');
  if (key === '.') return paise !== undefined ? value : (rupees || '0') + '.';
  if (paise !== undefined) return paise.length >= 2 ? value : value + key;
  if (rupees === '0') return key;
  return rupees.length >= 9 ? value : value + key;
}

/** The pad's amount as typed, grouped the Indian way: "₹1,12,000", "₹12." and "₹1,234.5". */
export function padDisplay(value: string): string {
  const [rupees = '', paise] = value.split('.');
  const whole = Number(rupees || '0');
  return formatMoney(Number.isFinite(whole) ? whole : 0) + (paise !== undefined ? '.' + paise : '');
}

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

export type KitchenNames = { party?: string | null; item?: string | null; /** Task 279: the branch on a Transport expense's route. */ route?: string | null };

/** The names an entry's lines show: its branch or vendor, its item, and a Transport expense's route branch. */
export function entryNames(e: KitchenEntry, partiesById: ReadonlyMap<string, { name: string }>, itemsById: ReadonlyMap<string, { name: string }>): KitchenNames {
  return {
    party: e.party_id ? partiesById.get(e.party_id)?.name ?? null : null,
    item: e.item_id ? itemsById.get(e.item_id)?.name ?? null : null,
    route: e.route_party_id ? partiesById.get(e.route_party_id)?.name ?? 'a removed branch' : null,
  };
}

export function typeLabel(type: KitchenEntryType): string {
  switch (type) {
    case 'sent': return 'Sent';
    case 'received': return 'Received';
    case 'bought': return 'Bought';
    case 'paid': return 'Paid';
    case 'spent': return 'Spent';
    case 'made': return 'Made';
    case 'count': return 'Counted';
    case 'issued': return 'Given to kitchen';
  }
}

export function entryHeadline(e: KitchenEntry, names: KitchenNames): string {
  // Task 268: the lists hold active names only, so a removed branch, vendor or item says so.
  const party = names.party ?? (e.type === 'sent' || e.type === 'received' ? 'a removed branch' : 'a removed vendor');
  const item = names.item ?? 'a removed item';
  switch (e.type) {
    case 'sent': return `Sent to ${party}`;
    case 'received': return `Received from ${party}`;
    case 'bought': return `Bought from ${party}`;
    case 'paid': return `Paid ${party}`;
    // Task 279: an expense by particular reads as the particular, with the route for Transport.
    case 'spent': return e.particular_id && e.note
      ? (e.route_dir && names.route ? `${e.note} · ${e.route_dir === 'from' ? 'From' : 'To'} ${names.route}` : e.note)
      : e.category ?? 'Spent';
    case 'made': return `Made ${item}`;
    case 'count': return `Counted ${item}`;
    case 'issued': return 'Given to the kitchen';
  }
}

export function linesSummary(e: Pick<KitchenEntry, 'lines'>, itemsById: ReadonlyMap<string, KitchenItem>): string {
  return e.lines
    .map((l) => {
      const it = itemsById.get(l.item_id);
      // Task 268: the kitchen loads active items only, so a removed item is named as one rather than a bare number.
      return it ? `${it.name} ${formatQty(l.qty, it.unit)}` : `Removed item ${formatQty(l.qty, '').trim()}`;
    })
    .join(', ');
}

export function entrySubline(e: KitchenEntry, itemsById: ReadonlyMap<string, KitchenItem>): string {
  const parts: string[] = [];
  if (e.type === 'sent' || e.type === 'bought' || e.type === 'issued') parts.push(linesSummary(e, itemsById));
  if (e.type === 'bought') parts.push(e.paid ? `paid${e.mode ? ` · ${modeLabel(e.mode)}` : ''}` : 'pay later');
  if (e.type === 'spent' && e.particular_id) {
    parts.push(e.subcategory ? `${e.category ?? ''} › ${e.subcategory}` : e.category ?? '');
    if (e.qty !== null && e.qty_unit) parts.push(formatQty(e.qty, e.qty_unit));
  }
  if (e.type === 'received' || e.type === 'paid' || e.type === 'spent') parts.push(modeLabel(e.mode));
  if (e.type === 'made' || e.type === 'count') {
    const it = e.item_id ? itemsById.get(e.item_id) : undefined;
    const unit = it?.unit ?? '';
    if (e.type === 'made' && e.qty !== null) parts.push(`+${formatQty(e.qty, unit)}`);
    if (e.type === 'count' && e.qty !== null) parts.push(`${e.from_qty !== null ? `was ${formatQty(e.from_qty, unit)}, ` : ''}now ${formatQty(e.qty, unit)}`);
  }
  // The particular is the headline already, so it is not repeated as a note.
  if (e.note && !(e.type === 'spent' && e.particular_id)) parts.push(e.note);
  if (e.voided_at) parts.push('voided');
  return parts.filter((p) => p.length > 0).join(' · ');
}

/** Signed money text for a list row; empty for a stock-only entry. */
export function entryAmountText(e: KitchenEntry): string {
  if (e.type === 'made' || e.type === 'count' || e.type === 'issued') return '';
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
/** Words for a permission or day-lock refusal from the database, or null for any other error. */
export function describeAccessError(message: string | null | undefined): string | null {
  const m = message ?? '';
  if (m.includes('KITCHEN_DAY_LOCKED')) return 'That day is locked. Ask the owner to make the change.';
  if (m.includes('KITCHEN_BACKDATE_NOT_ALLOWED')) return 'This login records today’s entries only.';
  if (m.includes('KITCHEN_FUTURE_DATE')) return 'Entries cannot be dated in the future.';
  if (m.includes('KITCHEN_NOT_ALLOWED') || m.includes('row-level security')) return 'Your login is not allowed to do this. Ask the owner.';
  return null;
}

/** Said when a load never reached the server, even after it was tried again (task 256). */
export const OFFLINE_LOAD_TEXT = 'Can’t reach the server right now. Check the internet connection and try again.';

/** True for a request that died on the device (no connection, or the app was waking up). */
export function isOfflineError(message: string | null | undefined): boolean {
  return /failed to fetch|network request failed|networkerror|load failed|network connection was lost/i.test(message ?? '');
}

export function describeKitchenError(message: string | null | undefined, fallback: string): string {
  const m = message ?? '';
  const access = describeAccessError(m);
  if (access) return access;
  // Only a load says "no connection"; a save that lost its answer may still have been made.
  if (isOfflineError(m) && fallback.startsWith('Unable to load')) return OFFLINE_LOAD_TEXT;
  if (m.includes('KITCHEN_FORBIDDEN') || m.includes('42501')) return 'This login cannot write the kitchen’s books.';
  if (m.includes('KITCHEN_PARTY_NOT_FOUND')) return 'That branch or vendor is no longer in the list.';
  if (m.includes('KITCHEN_ITEM_NOT_FOUND')) return 'That item is no longer in the list.';
  if (m.includes('KITCHEN_FINISHED_GOODS_ONLY')) return 'Batches can only be recorded for finished goods.';
  if (m.includes('KITCHEN_DELIVERY_INVOICED')) return 'Cancel the invoice before editing or deleting this delivery.';
  if (m.includes('KITCHEN_INVALID_LINE')) return 'Every line needs a quantity and a price.';
  if (m.includes('KITCHEN_INVALID_MATCH')) return 'The matched amounts are more than what is open, or more than the money paid.';
  if (m.includes('KITCHEN_ROUTE_REQUIRED')) return 'Choose the route: from or to which branch.';
  if (m.includes('KITCHEN_PERSON_REQUIRED')) return 'Choose who took the advance.';
  if (m.includes('KITCHEN_PARTICULAR_NOT_FOUND')) return 'That particular is no longer in the list.';
  if (m.includes('KITCHEN_CATEGORY_NOT_FOUND')) return 'That category is no longer in the list.';
  if (m.includes('KITCHEN_INVALID')) return 'Check the amount, the mode and who it is for.';
  if (m.includes('kitchen_items_name_key')) return 'An item with that name already exists.';
  if (m.includes('kitchen_parties_name_key')) return 'That name is already in the list.';
  if (m.includes('kitchen_categories_name_key')) return 'That category is already in the list.';
  return fallback;
}

/**
 * The items sent most often to one branch in the loaded entries, with the
 * quantity sent the last time (task 216). Voided sends do not count. Ties go
 * to the item sent most recently.
 */
export function oftenSent(entries: readonly KitchenEntry[], partyId: string, limit = 6): { itemId: string; times: number; lastQty: number }[] {
  const seen = new Map<string, { itemId: string; times: number; lastQty: number; lastAt: string }>();
  for (const entry of entries) {
    if (entry.type !== 'sent' || entry.party_id !== partyId || entry.voided_at) continue;
    const at = entry.entry_date + ' ' + entry.created_at;
    for (const line of entry.lines) {
      if (!(line.qty > 0)) continue;
      const row = seen.get(line.item_id) ?? { itemId: line.item_id, times: 0, lastQty: line.qty, lastAt: '' };
      row.times += 1;
      if (at > row.lastAt) { row.lastAt = at; row.lastQty = line.qty; }
      seen.set(line.item_id, row);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.times - a.times || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit)
    .map(({ itemId, times, lastQty }) => ({ itemId, times, lastQty }));
}

/** The raw materials most often given to the kitchen, with the last quantity (task 242). */
export function oftenGiven(entries: readonly KitchenEntry[], limit = 6): { itemId: string; times: number; lastQty: number }[] {
  const seen = new Map<string, { itemId: string; times: number; lastQty: number; lastAt: string }>();
  for (const entry of entries) {
    if (entry.type !== 'issued' || entry.voided_at) continue;
    const at = entry.entry_date + ' ' + entry.created_at;
    for (const line of entry.lines) {
      if (!(line.qty > 0)) continue;
      const row = seen.get(line.item_id) ?? { itemId: line.item_id, times: 0, lastQty: line.qty, lastAt: '' };
      row.times += 1;
      if (at > row.lastAt) { row.lastAt = at; row.lastQty = line.qty; }
      seen.set(line.item_id, row);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.times - a.times || b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit)
    .map(({ itemId, times, lastQty }) => ({ itemId, times, lastQty }));
}

// ─── Stock levels (task 230) ─────────────────────────────────────────────────

export type StockLevel = {
  /** What the bar measures against: the latest count, or more if stock has since grown past it. */
  ref: number | null;
  /** The day of the latest count, or null when the item has never been counted. */
  countedOn: string | null;
  state: 'out' | 'low' | 'ok' | 'unknown';
  /** Stock as a share of `ref`, from 0 to 1, when there is a count. */
  share: number;
};

/** Below this share of its last count an item shows as low. */
export const LOW_STOCK_SHARE = 0.25;

/**
 * Each item's level against its latest stock count (task 230). Nothing at or below zero is out;
 * at or under a quarter of the last count is low. An item never counted has no bar, only "out"
 * when it is at zero.
 */
export function stockLevels(entries: readonly KitchenEntry[], items: readonly { id: string; stock: number }[]): Map<string, StockLevel> {
  const latest = new Map<string, KitchenEntry>();
  for (const e of entries) {
    if (e.type !== 'count' || e.voided_at !== null || e.item_id === null || e.qty === null) continue;
    const seen = latest.get(e.item_id);
    if (!seen || e.entry_date > seen.entry_date || (e.entry_date === seen.entry_date && e.created_at > seen.created_at)) latest.set(e.item_id, e);
  }
  const out = new Map<string, StockLevel>();
  for (const item of items) {
    const count = latest.get(item.id);
    const counted = count?.qty ?? null;
    const ref = counted === null ? null : Math.max(counted, item.stock);
    const share = ref && ref > 0 ? Math.min(1, Math.max(0, item.stock / ref)) : 0;
    const state: StockLevel['state'] = item.stock <= 0 ? 'out' : ref === null || ref <= 0 ? 'unknown' : share <= LOW_STOCK_SHARE ? 'low' : 'ok';
    out.set(item.id, { ref, countedOn: count?.entry_date ?? null, state, share });
  }
  return out;
}

/**
 * The fresh list, or the one already held when nothing in it changed (task 250), so screens that
 * depend on it do not redraw or recompute after a reload that found nothing new.
 */
/**
 * A big figure's font size from its length (task 260): full size while it fits `fits` characters,
 * then smaller in step with its length, never below `min`. iOS's own shrink-to-fit
 * (adjustsFontSizeToFit) drew some amounts clipped or blank on phones, so the app sizes them itself.
 */
export function figureSize(text: string, size: number, fits: number, min = Math.round(size * 0.6)): number {
  const length = Array.from(text).length;
  if (length <= fits) return size;
  return Math.max(min, Math.floor((size * fits) / length));
}

export function keepIfSame<T>(previous: T, next: T | null | undefined): T {
  if (next === null || next === undefined) return previous;
  return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
}

