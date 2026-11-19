/**
 * Task 327: salary details. The owner's rules: a day is the monthly salary ÷ 30; two days of Leave
 * a month are paid offs; a half day is half; Absent, leave beyond the two, and days not marked are
 * unpaid; the month's advances come off in full, and so does what was already paid as salary.
 */
export const SALARY_DAY_BASIS = 30;
export const PAID_OFFS_PER_MONTH = 2;

export type SalaryPerson = {
  rosterId: string; name: string; jobTitle: string; isActive: boolean;
  /** Rupees a month, or null when not set yet. */
  monthlySalary: number | null;
  present: number; halfDay: number; leave: number; absent: number;
  advances: number; paid: number;
};
export type SalaryMonth = { from: string; to: string; staff: SalaryPerson[]; unassignedPaid: number };

export type SalaryFigures = {
  /** Days of the period the attendance should cover (up to today in the current month). */
  days: number; unmarked: number; paidOffs: number; unpaidOffs: number;
  unpaidDays: number; payableDays: number; dayRate: number;
  /** What the month's attendance earns, before advances and payments; null without a salary. */
  earned: number | null;
  /** What is still to be paid (negative when more was given than earned); null without a salary. */
  due: number | null;
};

const paise = (n: number): number => Math.round(n * 100) / 100;

/** The month for one person under the owner's rules. */
export function salaryFigures(p: SalaryPerson, days: number): SalaryFigures {
  const marked = p.present + p.halfDay + p.leave + p.absent;
  const unmarked = Math.max(0, days - marked);
  const paidOffs = Math.min(p.leave, PAID_OFFS_PER_MONTH);
  const unpaidOffs = p.leave - paidOffs;
  const unpaidDays = Math.min(days, p.absent + p.halfDay * 0.5 + unpaidOffs + unmarked);
  const payableDays = Math.max(0, days - unpaidDays);
  if (p.monthlySalary === null) return { days, unmarked, paidOffs, unpaidOffs, unpaidDays, payableDays, dayRate: 0, earned: null, due: null };
  const dayRate = p.monthlySalary / SALARY_DAY_BASIS;
  const earned = paise(Math.max(0, p.monthlySalary - dayRate * unpaidDays));
  return { days, unmarked, paidOffs, unpaidOffs, unpaidDays, payableDays, dayRate: paise(dayRate), earned, due: paise(earned - p.advances - p.paid) };
}

/** How many days of a month the attendance covers: all of a past month, up to today in this one. */
export function salaryDays(from: string, to: string, today: string): number {
  const end = to < today ? to : today;
  if (end < from) return 0;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): number => { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw Error('Invalid count'); return n; };
const rupees = (v: unknown): number => { const n = Number(v); if (!Number.isFinite(n)) throw Error('Invalid amount'); return n / 100; };

export function parseSalaryMonth(v: unknown): SalaryMonth {
  if (!record(v) || !Array.isArray(v.staff)) throw Error('Invalid salary month');
  return {
    from: String(v.from), to: String(v.to), unassignedPaid: rupees(v.unassigned_paid_paise ?? 0),
    staff: v.staff.map((row) => {
      if (!record(row) || typeof row.roster_id !== 'string') throw Error('Invalid salary row');
      return {
        rosterId: row.roster_id, name: String(row.name ?? ''), jobTitle: String(row.job_title ?? ''), isActive: row.is_active === true,
        monthlySalary: row.monthly_salary_paise === null || row.monthly_salary_paise === undefined ? null : rupees(row.monthly_salary_paise),
        present: count(row.present), halfDay: count(row.half_day), leave: count(row.leave), absent: count(row.absent),
        advances: rupees(row.advances_paise), paid: rupees(row.paid_paise),
      };
    }),
  };
}
