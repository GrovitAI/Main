/**
 * Tasks 316-318: pure helpers for what is still open with a branch or vendor. The open amounts come
 * from kitchen_party_dues (matches by hand first, then the rest of the money clears the oldest
 * bills); these helpers age them, find the oldest, and preview what a new payment would clear by the
 * same oldest-first rule. Nothing here touches the database.
 */
import type { KitchenAgeBucket, KitchenAgeing, KitchenDue, KitchenFifoClear, KitchenMonthCloseParty } from './kitchen-dues-types';

const toPaise = (rupees: number): number => Math.round(rupees * 100);
const fromPaise = (paise: number): number => paise / 100;

/** Whole days from one 'YYYY-MM-DD' to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Which age bucket a bill falls in as of a day; the opening balance (no date) is the oldest. */
export function ageBucket(entryDate: string | null, asOf: string): KitchenAgeBucket {
  if (entryDate === null) return 'over60';
  const days = daysBetween(entryDate, asOf);
  return days <= 30 ? 'upTo30' : days <= 60 ? 'upTo60' : 'over60';
}

/** What is still open, split by age as of a day. */
export function ageingOf(dues: readonly KitchenDue[], asOf: string): KitchenAgeing {
  const out = { upTo30: 0, upTo60: 0, over60: 0 };
  for (const d of dues) if (d.open > 0) out[ageBucket(d.entry_date, asOf)] += toPaise(d.open);
  return { upTo30: fromPaise(out.upTo30), upTo60: fromPaise(out.upTo60), over60: fromPaise(out.over60) };
}

/** The oldest bill still open: its date, or null for the opening balance; undefined when nothing is open. */
export function oldestOpen(dues: readonly KitchenDue[]): string | null | undefined {
  let oldest: string | null | undefined;
  for (const d of dues) {
    if (d.open <= 0) continue;
    if (d.entry_date === null) return null;
    if (oldest === undefined || (oldest !== null && d.entry_date < oldest)) oldest = d.entry_date;
  }
  return oldest;
}

/** Oldest first: the opening balance, then by date, then as listed. */
function oldestFirst(dues: readonly KitchenDue[]): KitchenDue[] {
  return dues
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      if (a.d.entry_date === b.d.entry_date) return a.i - b.i;
      if (a.d.entry_date === null) return -1;
      if (b.d.entry_date === null) return 1;
      return a.d.entry_date < b.d.entry_date ? -1 : 1;
    })
    .map(({ d }) => d);
}

/**
 * What an amount paid now would clear, oldest open bill first, each up to what is open on it, and
 * what would be left over as paid ahead. The same rule the database applies to unmatched money.
 */
export function fifoClear(dues: readonly KitchenDue[], amount: number): KitchenFifoClear {
  let left = Math.max(0, toPaise(amount));
  const cleared: KitchenFifoClear['cleared'] = [];
  for (const due of oldestFirst(dues)) {
    if (left <= 0) break;
    const open = toPaise(due.open);
    if (open <= 0) continue;
    const take = Math.min(open, left);
    cleared.push({ due, take: fromPaise(take), left: fromPaise(open - take) });
    left -= take;
  }
  return { cleared, ahead: fromPaise(left) };
}

/** A bill's state: cleared, partly open, or open in full. */
export type DueState = { kind: 'cleared' } | { kind: 'part'; left: number } | { kind: 'open' };
export function dueState(due: Pick<KitchenDue, 'amount' | 'open'>): DueState {
  if (due.open <= 0) return { kind: 'cleared' };
  if (toPaise(due.open) < toPaise(due.amount)) return { kind: 'part', left: due.open };
  return { kind: 'open' };
}

/** "since 12 Oct" (or "from before the app" for the opening balance) for the oldest open bill. */
export function sinceLabel(oldest: string | null | undefined): string | null {
  if (oldest === undefined) return null;
  if (oldest === null) return 'from before the app';
  const d = new Date(`${oldest}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return `since ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

/** Month close: which parties to list. Settled ones (nothing at the start, in the month or at the end) only when asked. */
export function monthCloseRows(
  parties: readonly KitchenMonthCloseParty[],
  { show, query, settled, matches }: { show: 'all' | 'branch' | 'vendor'; query: string; settled: boolean; matches: (query: string, name: string) => boolean },
): KitchenMonthCloseParty[] {
  return parties.filter((p) => {
    if (show !== 'all' && p.kind !== show) return false;
    if (!settled && p.atStart === 0 && p.bills === 0 && p.paid === 0 && p.atEnd === 0) return false;
    return matches(query, p.name);
  });
}

/** The month close's pending totals per side, from its rows: what each side stood at, start and end. */
export function monthCloseSums(parties: readonly KitchenMonthCloseParty[]): { atStart: number; bills: number; paid: number; atEnd: number } {
  const t = { atStart: 0, bills: 0, paid: 0, atEnd: 0 };
  for (const p of parties) {
    t.atStart += toPaise(p.atStart);
    t.bills += toPaise(p.bills);
    t.paid += toPaise(p.paid);
    t.atEnd += toPaise(p.atEnd);
  }
  return { atStart: fromPaise(t.atStart), bills: fromPaise(t.bills), paid: fromPaise(t.paid), atEnd: fromPaise(t.atEnd) };
}

/** Task 317: the open amounts once the bills picked by hand take their part of a payment. */
export function withCovers(dues: readonly KitchenDue[] | null, covers: readonly { entry_id: string; amount: number }[]): KitchenDue[] | null {
  if (dues === null) return null;
  if (covers.length === 0) return [...dues];
  const taken = new Map<string, number>();
  for (const c of covers) taken.set(c.entry_id, (taken.get(c.entry_id) ?? 0) + toPaise(c.amount));
  return dues.map((d) => {
    const t = d.entry_id ? taken.get(d.entry_id) : undefined;
    return t ? { ...d, open: fromPaise(Math.max(0, toPaise(d.open) - t)) } : d;
  });
}
