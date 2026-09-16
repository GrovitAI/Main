import { FULL_REFRESH_INTERVAL_MS, shouldRefreshSummaries } from '../orders-refresh-utils';

const DAY = '2026-09-16T06:00:00.000Z';
const last = { stamp: '2026-09-16T08:00:00.000Z', dayStart: DAY, fetchedAt: 1_000_000 };

describe('shouldRefreshSummaries', () => {
  test('always loads when nothing has been loaded yet', () => {
    expect(shouldRefreshSummaries({ stamp: 'x', dayStart: DAY, now: 0 }, null)).toBe(true);
  });

  test('skips the download while the stamp and the day are unchanged', () => {
    expect(shouldRefreshSummaries({ stamp: last.stamp, dayStart: DAY, now: last.fetchedAt + 10_000 }, last)).toBe(false);
  });

  test('reloads when the branch stamp moves', () => {
    expect(shouldRefreshSummaries({ stamp: '2026-09-16T08:00:01.000Z', dayStart: DAY, now: last.fetchedAt + 10_000 }, last)).toBe(true);
  });

  test('reloads when the business day rolls over', () => {
    expect(shouldRefreshSummaries({ stamp: last.stamp, dayStart: '2026-09-17T06:00:00.000Z', now: last.fetchedAt + 10_000 }, last)).toBe(true);
  });

  test('falls back to reloading every poll when the stamp is unavailable', () => {
    expect(shouldRefreshSummaries({ stamp: null, dayStart: DAY, now: last.fetchedAt + 10_000 }, last)).toBe(true);
  });

  test('reloads as a safety net after the full-refresh interval', () => {
    expect(shouldRefreshSummaries({ stamp: last.stamp, dayStart: DAY, now: last.fetchedAt + FULL_REFRESH_INTERVAL_MS - 1 }, last)).toBe(false);
    expect(shouldRefreshSummaries({ stamp: last.stamp, dayStart: DAY, now: last.fetchedAt + FULL_REFRESH_INTERVAL_MS }, last)).toBe(true);
  });
});
