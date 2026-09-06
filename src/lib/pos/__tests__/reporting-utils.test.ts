import {
  getBusinessDate,
  getBusinessDayBounds,
  getBusinessDayWindow,
  getCurrentBusinessDate,
  zonedTimeToUtcIso,
} from '../reporting-utils';

describe('reporting-utils (IST business day, 02:30 cutoff)', () => {
  test('zonedTimeToUtcIso converts IST wall clock to UTC', () => {
    expect(zonedTimeToUtcIso(2026, 9, 7, 2, 30, 'Asia/Kolkata')).toBe('2026-09-06T21:00:00.000Z');
    expect(zonedTimeToUtcIso(2026, 9, 7, 11, 30, 'Asia/Kolkata')).toBe('2026-09-07T06:00:00.000Z');
  });

  test('transactions before 02:30 IST belong to the previous business day', () => {
    expect(getBusinessDate('2026-09-07T20:29:00.000Z')).toBe('2026-09-07'); // 01:59 IST on the 8th
    expect(getBusinessDate('2026-09-07T21:00:00.000Z')).toBe('2026-09-08'); // 02:30 IST on the 8th
    expect(getBusinessDate('2026-09-08T03:00:00.000Z')).toBe('2026-09-08'); // 08:30 IST — no blind spot
  });

  test('a business day window covers a full 24 hours with no gap', () => {
    const w = getBusinessDayWindow('2026-09-08');
    expect(w.startTimestamp).toBe('2026-09-07T21:00:00.000Z');
    expect(w.endTimestamp).toBe('2026-09-08T21:00:00.000Z');
    const next = getBusinessDayWindow('2026-09-09');
    expect(next.startTimestamp).toBe(w.endTimestamp);
  });

  test('"today" is decided in IST, not in the device timezone', () => {
    // 22:00 UTC on Sep 7 = 03:30 IST on Sep 8 (after cutoff) → business date Sep 8,
    // even though it is still Sep 7 in New York or London.
    const now = new Date('2026-09-07T22:00:00.000Z');
    expect(getCurrentBusinessDate({}, now)).toBe('2026-09-08');
    const bounds = getBusinessDayBounds('today', undefined, undefined, {}, now);
    expect(bounds.startTimestamp).toBe('2026-09-07T21:00:00.000Z');
    expect(bounds.endTimestamp).toBe('2026-09-08T21:00:00.000Z');
  });

  test('presets produce contiguous ranges', () => {
    const now = new Date('2026-09-10T10:00:00.000Z'); // 15:30 IST Sep 10
    const seven = getBusinessDayBounds('7days', undefined, undefined, {}, now);
    expect(seven.startTimestamp).toBe(getBusinessDayWindow('2026-09-04').startTimestamp);
    expect(seven.endTimestamp).toBe(getBusinessDayWindow('2026-09-10').endTimestamp);

    const yesterday = getBusinessDayBounds('yesterday', undefined, undefined, {}, now);
    expect(yesterday.startTimestamp).toBe(getBusinessDayWindow('2026-09-09').startTimestamp);

    const custom = getBusinessDayBounds('custom', '2026-09-03', '2026-09-01', {}, now);
    expect(custom.startTimestamp).toBe(getBusinessDayWindow('2026-09-01').startTimestamp);
    expect(custom.endTimestamp).toBe(getBusinessDayWindow('2026-09-03').endTimestamp);
  });
});
