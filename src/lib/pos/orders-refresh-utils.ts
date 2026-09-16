/** How long the Orders tab may go without a full reload even when nothing has changed. */
export const FULL_REFRESH_INTERVAL_MS = 10 * 60_000;

/** What the last full load of the day's orders was based on. */
export type SummariesMarker = {
  /** The branch's orders_changed_at stamp at that load, or null when it was not available. */
  stamp: string | null;
  /** Start of the business day the load covered. */
  dayStart: string;
  /** When the load happened, in milliseconds since the epoch. */
  fetchedAt: number;
};

/**
 * Decides whether a background poll needs to download the day's orders again.
 *
 * It does when there is no previous load, when the change stamp could not be
 * read (the migration may not be applied, so fall back to the old behaviour),
 * when the business day has rolled over, when the stamp moved, or as a
 * safety net once every FULL_REFRESH_INTERVAL_MS.
 */
export function shouldRefreshSummaries(
  current: { stamp: string | null; dayStart: string; now: number },
  last: SummariesMarker | null,
): boolean {
  if (!last) return true;
  if (current.stamp === null) return true;
  if (current.dayStart !== last.dayStart) return true;
  if (current.stamp !== last.stamp) return true;
  return current.now - last.fetchedAt >= FULL_REFRESH_INTERVAL_MS;
}
