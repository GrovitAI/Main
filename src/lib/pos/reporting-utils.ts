/**
 * Reporting & Business Day Utilities
 *
 * Centralized, branch-configurable helper module for calculating:
 * 1. Effective reporting timestamps (settled_at for paid bills, created_at for unpaid/draft bills)
 * 2. Business day dates based on branch operating hours (default: 11:30 AM -> 2:30 AM IST cutoff)
 * 3. ISO timestamp bounds for date presets (today, yesterday, 7days, 30days, custom)
 */

export interface BranchBusinessDayConfig {
  business_day_start_time: string; // e.g. "11:30" (11:30 AM)
  business_day_end_time: string;   // e.g. "02:30" (2:30 AM next calendar day)
  timezone: string;                // e.g. "Asia/Kolkata"
}

export const DEFAULT_BUSINESS_DAY_CONFIG: BranchBusinessDayConfig = {
  business_day_start_time: '11:30',
  business_day_end_time: '02:30',
  timezone: 'Asia/Kolkata',
};

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

/**
 * Normalizes an ISO timestamp into a business day date string ("YYYY-MM-DD").
 *
 * Business Day Rules (Default 11:30 AM -> 2:30 AM):
 * - Transactions between 12:00 AM and 02:30 AM belong to the PREVIOUS business day.
 * - Transactions between 11:30 AM and 11:59 PM belong to the CURRENT business day.
 */
export function getBusinessDate(
  timestamp: string,
  config: Partial<BranchBusinessDayConfig> = {}
): string {
  const cfg = { ...DEFAULT_BUSINESS_DAY_CONFIG, ...config };
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';

  const [endH, endM] = cfg.business_day_end_time.split(':').map(Number);
  const endVal = endH * 60 + endM; // e.g., 2 * 60 + 30 = 150 mins

  const localH = d.getHours();
  const localM = d.getMinutes();
  const timeVal = localH * 60 + localM;

  // If time falls in 00:00 -> cutoff window (e.g. 00:00 -> 02:30), shift to previous calendar day
  if (timeVal <= endVal) {
    d.setDate(d.getDate() - 1);
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Helper to format a Date into local calendar string "YYYY-MM-DD"
 */
function formatCalendarDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes deterministic ISO UTC timestamps for a given business day operating window.
 * Default timezone is Asia/Kolkata (IST = UTC+05:30).
 */
function createUtcIsoString(
  dateStr: string,
  hours: number,
  minutes: number,
  dayOffset = 0,
  tzOffsetHours = 5.5
): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const totalMinutes = hours * 60 + minutes - Math.round(tzOffsetHours * 60);
  const utcDate = new Date(Date.UTC(y, m - 1, d + dayOffset, 0, totalMinutes, 0, 0));
  return utcDate.toISOString();
}

/**
 * Computes ISO startTimestamp and endTimestamp bounds for date presets based on
 * the branch business day operating window (11:30 AM -> 02:30 AM next day).
 */
export function getBusinessDayBounds(
  preset: 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'custom' | string,
  fromDate?: string | Date,
  toDate?: string | Date,
  config: Partial<BranchBusinessDayConfig> = {}
): { startTimestamp: string; endTimestamp: string } {
  const cfg = { ...DEFAULT_BUSINESS_DAY_CONFIG, ...config };
  const [startH, startM] = cfg.business_day_start_time.split(':').map(Number); // 11:30
  const [endH, endM] = cfg.business_day_end_time.split(':').map(Number);       // 02:30

  const now = new Date();
  let currentBizDate = new Date(now);

  const localH = now.getHours();
  const localM = now.getMinutes();
  const timeVal = localH * 60 + localM;
  const endVal = endH * 60 + endM;

  // If current local time is past midnight before 2:30 AM, current business date is yesterday
  if (timeVal <= endVal) {
    currentBizDate.setDate(currentBizDate.getDate() - 1);
  }

  let startDateStr = formatCalendarDate(currentBizDate);
  let endDateStr = formatCalendarDate(currentBizDate);

  if (preset === 'today') {
    startDateStr = formatCalendarDate(currentBizDate);
    endDateStr = formatCalendarDate(currentBizDate);
  } else if (preset === 'yesterday') {
    const yest = new Date(currentBizDate);
    yest.setDate(currentBizDate.getDate() - 1);
    startDateStr = formatCalendarDate(yest);
    endDateStr = formatCalendarDate(yest);
  } else if (preset === '7days') {
    const sevenDaysAgo = new Date(currentBizDate);
    sevenDaysAgo.setDate(currentBizDate.getDate() - 6);
    startDateStr = formatCalendarDate(sevenDaysAgo);
    endDateStr = formatCalendarDate(currentBizDate);
  } else if (preset === '30days') {
    const thirtyDaysAgo = new Date(currentBizDate);
    thirtyDaysAgo.setDate(currentBizDate.getDate() - 29);
    startDateStr = formatCalendarDate(thirtyDaysAgo);
    endDateStr = formatCalendarDate(currentBizDate);
  } else if (preset === 'month') {
    const monthStart = new Date(currentBizDate.getFullYear(), currentBizDate.getMonth(), 1);
    startDateStr = formatCalendarDate(monthStart);
    endDateStr = formatCalendarDate(currentBizDate);
  } else if (preset === 'custom' || fromDate || toDate) {
    const parseToStr = (input?: string | Date): string => {
      if (!input) return formatCalendarDate(currentBizDate);
      if (input instanceof Date) return formatCalendarDate(input);
      if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return input;
      }
      const parsed = new Date(input);
      return isNaN(parsed.getTime()) ? formatCalendarDate(currentBizDate) : formatCalendarDate(parsed);
    };

    startDateStr = parseToStr(fromDate);
    endDateStr = parseToStr(toDate);
  }

  // Ensure startDateStr <= endDateStr
  if (startDateStr > endDateStr) {
    const temp = startDateStr;
    startDateStr = endDateStr;
    endDateStr = temp;
  }

  return {
    startTimestamp: createUtcIsoString(startDateStr, startH, startM, 0),
    endTimestamp: createUtcIsoString(endDateStr, endH, endM, 1),
  };
}
