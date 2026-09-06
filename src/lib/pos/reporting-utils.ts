/**
 * Reporting & Business Day Utilities
 *
 * Centralized, branch-configurable helper module for calculating:
 * 1. Effective reporting timestamps (settled_at for paid bills, created_at for unpaid/draft bills)
 * 2. Business day dates based on the branch operating window
 * 3. ISO timestamp bounds for date presets (today, yesterday, 7days, 30days, month, custom)
 *
 * Design (audit item H6)
 *   * A business day starts at `business_day_end_time` (02:30 by default) and
 *     runs for exactly 24 hours, so EVERY transaction belongs to exactly one
 *     business day. The 11:30 opening time is informational only; sales made
 *     before opening (deliveries, early prep) are no longer invisible.
 *   * "Now" is always evaluated in the branch timezone (Asia/Kolkata), never in
 *     the device timezone, so a browser abroad reports the same day as the
 *     terminal in the restaurant.
 */

export interface BranchBusinessDayConfig {
  business_day_start_time: string; // e.g. "11:30" (opening time, informational)
  business_day_end_time: string;   // e.g. "02:30" (cutoff: the business day rolls over here)
  timezone: string;                // IANA zone, e.g. "Asia/Kolkata"
}

export const DEFAULT_BUSINESS_DAY_CONFIG: BranchBusinessDayConfig = {
  business_day_start_time: '11:30',
  business_day_end_time: '02:30',
  timezone: 'Asia/Kolkata',
};

export type DatePreset = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'custom';

/**
 * Returns the effective reporting timestamp for a bill.
 * - Paid bills with valid settled_at -> use settled_at
 * - Unpaid / Draft / Cancelled bills -> use created_at
 */
export function getEffectiveReportingTimestamp(bill: {
  status?: string | null;
  settled_at?: string | null;
  created_at: string;
}): string {
  if (bill.status === 'paid' && bill.settled_at && bill.settled_at.trim().length > 0) {
    return bill.settled_at;
  }
  return bill.created_at;
}

// ─── Timezone helpers ────────────────────────────────────────────────────────

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Wall-clock parts of `date` in the given IANA timezone. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  try {
    const parts = getPartsFormatter(timeZone).formatToParts(date);
    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
    const hour = get('hour');
    return { year: get('year'), month: get('month'), day: get('day'), hour: hour === 24 ? 0 : hour, minute: get('minute') };
  } catch {
    // Unknown timezone on this runtime: fall back to fixed IST (+05:30).
    const shifted = new Date(date.getTime() + 330 * 60_000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
    };
  }
}

/** Offset (minutes east of UTC) of `timeZone` at the given instant. */
function getZoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

/**
 * Converts a wall-clock time in `timeZone` to an ISO UTC instant.
 * Handles DST-shifting zones by resolving the offset at the target instant.
 */
export function zonedTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string
): string {
  const naive = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const guess = new Date(naive - getZoneOffsetMinutes(new Date(naive), timeZone) * 60_000);
  const corrected = new Date(naive - getZoneOffsetMinutes(guess, timeZone) * 60_000);
  return corrected.toISOString();
}

function parseHm(value: string): { h: number; m: number } {
  const [h, m] = value.split(':').map(Number);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Adds `days` to a calendar date (no timezone involved). */
export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return formatYmd(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

// ─── Business day resolution ─────────────────────────────────────────────────

/**
 * Normalizes an instant into its business day ("YYYY-MM-DD") for the branch.
 * Times before the cutoff (default 02:30) belong to the PREVIOUS calendar day.
 */
export function getBusinessDate(
  timestamp: string | Date,
  config: Partial<BranchBusinessDayConfig> = {}
): string {
  const cfg = { ...DEFAULT_BUSINESS_DAY_CONFIG, ...config };
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';

  const cutoff = parseHm(cfg.business_day_end_time);
  const p = getZonedParts(d, cfg.timezone);
  const minutes = p.hour * 60 + p.minute;
  const calendar = formatYmd(p.year, p.month, p.day);

  return minutes < cutoff.h * 60 + cutoff.m ? addCalendarDays(calendar, -1) : calendar;
}

/** The current business date in the branch timezone. */
export function getCurrentBusinessDate(
  config: Partial<BranchBusinessDayConfig> = {},
  now: Date = new Date()
): string {
  return getBusinessDate(now, config);
}

/**
 * UTC instants delimiting a business day: [cutoff on `ymd`, cutoff on `ymd + 1`).
 */
export function getBusinessDayWindow(
  ymd: string,
  config: Partial<BranchBusinessDayConfig> = {}
): { startTimestamp: string; endTimestamp: string } {
  const cfg = { ...DEFAULT_BUSINESS_DAY_CONFIG, ...config };
  const cutoff = parseHm(cfg.business_day_end_time);
  const [y, m, d] = ymd.split('-').map(Number);
  const next = addCalendarDays(ymd, 1);
  const [ny, nm, nd] = next.split('-').map(Number);
  return {
    startTimestamp: zonedTimeToUtcIso(y, m, d, cutoff.h, cutoff.m, cfg.timezone),
    endTimestamp: zonedTimeToUtcIso(ny, nm, nd, cutoff.h, cutoff.m, cfg.timezone),
  };
}

function toCalendarDate(input: string | Date | undefined, fallback: string, timeZone: string): string {
  if (!input) return fallback;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const parsed = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(parsed.getTime())) return fallback;
  const p = getZonedParts(parsed, timeZone);
  return formatYmd(p.year, p.month, p.day);
}

/**
 * Computes ISO startTimestamp / endTimestamp bounds for a preset, covering
 * whole business days (cutoff → next cutoff) in the branch timezone.
 */
export function getBusinessDayBounds(
  preset: DatePreset | string,
  fromDate?: string | Date,
  toDate?: string | Date,
  config: Partial<BranchBusinessDayConfig> = {},
  now: Date = new Date()
): { startTimestamp: string; endTimestamp: string } {
  const cfg = { ...DEFAULT_BUSINESS_DAY_CONFIG, ...config };
  const today = getCurrentBusinessDate(cfg, now);

  let startDate = today;
  let endDate = today;

  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      startDate = addCalendarDays(today, -1);
      endDate = startDate;
      break;
    case '7days':
      startDate = addCalendarDays(today, -6);
      break;
    case '30days':
      startDate = addCalendarDays(today, -29);
      break;
    case 'month':
      startDate = `${today.slice(0, 8)}01`;
      break;
    default:
      if (preset === 'custom' || fromDate || toDate) {
        startDate = toCalendarDate(fromDate, today, cfg.timezone);
        endDate = toCalendarDate(toDate, today, cfg.timezone);
      }
  }

  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  return {
    startTimestamp: getBusinessDayWindow(startDate, cfg).startTimestamp,
    endTimestamp: getBusinessDayWindow(endDate, cfg).endTimestamp,
  };
}
