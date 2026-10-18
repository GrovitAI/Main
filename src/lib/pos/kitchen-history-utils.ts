import { kitchenToday, type KitchenDateRange } from '@/lib/pos/kitchen-analytics-utils';
import { isMoneyIn, isMoneyOut, matchesSearch } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';

export type HistoryStatus = 'active' | 'edited' | 'replaced' | 'voided';
/**
 * The three questions people ask of History (task 207): what counts now
 * (unedited and corrected entries), what was corrected (each correction with
 * the version it replaced), and what was removed.
 */
export type HistoryStatusFilter = 'current' | 'edited' | 'voided';
const STATUS_FILTER_MATCHES: Readonly<Record<HistoryStatusFilter, readonly HistoryStatus[]>> = {
  current: ['active', 'edited'], edited: ['edited', 'replaced'], voided: ['voided'],
};
export type HistoryKind = 'sent' | 'received' | 'bought' | 'spent' | 'stock';
export type HistoryDateBasis = 'transaction' | 'recorded';
export type HistorySort = 'transaction-newest' | 'transaction-oldest' | 'recorded-newest' | 'recorded-oldest';
export type HistoryFilters = {
  kind: HistoryKind | null;
  status: HistoryStatusFilter | null;
  enteredBy: string | null;
  dateBasis: HistoryDateBasis;
  range: KitchenDateRange | null;
  query: string;
  sort: HistorySort;
};

export function historyStatus(entry: KitchenEntry): HistoryStatus {
  if (entry.voided_at) return entry.void_reason === 'Edited' ? 'replaced' : 'voided';
  return entry.replaces_id ? 'edited' : 'active';
}

export const HISTORY_STATUS_LABELS: Readonly<Record<HistoryStatus, string>> = {
  active: 'Active', edited: 'Edited', replaced: 'Replaced', voided: 'Voided',
};

/** Recorded dates and times are always India time, regardless of device timezone. */
export function historyRecordedDay(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? kitchenToday(date) : '';
}

export function historyDateLabel(day: string): string {
  const date = new Date(day + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  }) : day;
}

export function historyTimeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata',
  }) + ' IST' : 'Time unavailable';
}

export function historyAuditText(entry: KitchenEntry): string | null {
  if (entry.voided_at) {
    const replaced = historyStatus(entry) === 'replaced';
    const actor = entry.voided_by?.trim();
    return `${replaced ? 'Replaced after edit' : 'Voided'}${actor ? ' by ' + actor : ' · staff not recorded'} · ${historyTimeLabel(entry.voided_at)}${!replaced && entry.void_reason ? ' · ' + entry.void_reason : ''}`;
  }
  if (entry.replaces_id) return `Edited by ${entry.created_by} · ${historyTimeLabel(entry.created_at)}`;
  return null;
}

/** Sort only the loaded window; do not mutate the shared store or regroup by another date. */
export function filterKitchenHistory(
  entries: readonly KitchenEntry[], filters: HistoryFilters,
  searchableText: (entry: KitchenEntry) => readonly (string | null | undefined)[],
): KitchenEntry[] {
  const result = entries.filter(entry => {
    if (filters.status && !STATUS_FILTER_MATCHES[filters.status].includes(historyStatus(entry))) return false;
    if (filters.enteredBy !== null && entry.created_by !== filters.enteredBy) return false;
    if (filters.kind === 'stock' && entry.type !== 'made' && entry.type !== 'count' && entry.type !== 'issued') return false;
    if (filters.kind === 'spent' && entry.type !== 'spent' && entry.type !== 'paid') return false;
    if (filters.kind && filters.kind !== 'stock' && filters.kind !== 'spent' && entry.type !== filters.kind) return false;
    if (filters.range) {
      const day = filters.dateBasis === 'transaction' ? entry.entry_date : historyRecordedDay(entry.created_at);
      if (!day || day < filters.range.startDate || day > filters.range.endDate) return false;
    }
    return !filters.query.trim() || matchesSearch(filters.query, ...searchableText(entry), entry.created_by,
      entry.voided_by, entry.void_reason, HISTORY_STATUS_LABELS[historyStatus(entry)], entry.entry_date, historyTimeLabel(entry.created_at));
  });
  const direction = filters.sort.endsWith('oldest') ? 1 : -1;
  const recorded = filters.sort.startsWith('recorded');
  return result.sort((a, b) => {
    const timestamps = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    const safeTimestamps = Number.isFinite(timestamps) ? timestamps : a.created_at.localeCompare(b.created_at);
    const dates = a.entry_date.localeCompare(b.entry_date);
    return direction * ((recorded ? safeTimestamps : dates) || (recorded ? dates : safeTimestamps) || a.id.localeCompare(b.id));
  });
}

export type HistoryListItem =
  | { kind: 'day'; key: string; label: string; count: number; net: number }
  | { kind: 'entry'; key: string; entry: KitchenEntry };

/** "Today", "Yesterday", then "Mon, 13 Oct" (with the year once it is not this year). */
export function historyDayHeading(day: string, today: string = kitchenToday()): string {
  if (day === today) return 'Today';
  const yesterday = new Date(today + 'T12:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  const date = new Date(day + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime())) return day;
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }), timeZone: 'UTC' });
}

/**
 * Sorted History rows with a heading before each new day (task 216): the
 * transaction date, or the India-time day it was recorded for the entry-date
 * sorts.
 */
export function historySections(entries: readonly KitchenEntry[], sort: HistorySort, today: string = kitchenToday()): { items: HistoryListItem[] } {
  const recorded = sort.startsWith('recorded');
  const items: HistoryListItem[] = [];
  let heading: { kind: 'day'; key: string; label: string; count: number; net: number } | null = null;
  for (const entry of entries) {
    const day = recorded ? historyRecordedDay(entry.created_at) : entry.entry_date;
    if (!heading || heading.key !== 'day:' + day) {
      heading = { kind: 'day', key: 'day:' + day, label: historyDayHeading(day, today), count: 0, net: 0 };
      items.push(heading);
    }
    heading.count += 1;
    // Task 236: the day's money in less money out, from the entries that still count.
    if (!entry.voided_at) heading.net += isMoneyIn(entry) ? entry.amount : isMoneyOut(entry) ? -entry.amount : 0;
    items.push({ kind: 'entry', key: entry.id, entry });
  }
  return { items };
}
