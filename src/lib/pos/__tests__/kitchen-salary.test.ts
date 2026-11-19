import { PAID_OFFS_PER_MONTH, SALARY_DAY_BASIS, parseSalaryMonth, salaryDays, salaryFigures, type SalaryPerson } from '../kitchen-salary-utils';

// Task 327: the owner's salary rules.
const person = (over: Partial<SalaryPerson> = {}): SalaryPerson => ({
  rosterId: 'r', name: 'Ravi', jobTitle: 'Cook', isActive: true, monthlySalary: 24000,
  present: 24, halfDay: 2, leave: 3, absent: 2, advances: 2000, paid: 5000, ...over,
});

describe('salary for a month', () => {
  it('uses salary ÷ 30 a day, pays two leave days, halves a half day and takes off advances and payments', () => {
    expect(SALARY_DAY_BASIS).toBe(30);
    expect(PAID_OFFS_PER_MONTH).toBe(2);
    const f = salaryFigures(person(), 31);
    expect([f.paidOffs, f.unpaidOffs, f.unmarked, f.unpaidDays, f.payableDays, f.dayRate]).toEqual([2, 1, 0, 4, 27, 800]);
    expect(f.earned).toBe(20800);
    expect(f.due).toBe(13800);
  });

  it('pays the full salary when every day is worked or a paid off, whatever the month length', () => {
    expect(salaryFigures(person({ present: 26, halfDay: 0, leave: 2, absent: 0, advances: 0, paid: 0 }), 28).earned).toBe(24000);
    expect(salaryFigures(person({ present: 29, halfDay: 0, leave: 2, absent: 0, advances: 0, paid: 0 }), 31).earned).toBe(24000);
  });

  it('counts days not marked as unpaid, never below nothing, and shows what was paid ahead', () => {
    const f = salaryFigures(person({ present: 5, halfDay: 0, leave: 0, absent: 0, advances: 0, paid: 0 }), 31);
    expect(f.unmarked).toBe(26);
    expect(f.earned).toBe(24000 - 800 * 26);
    expect(salaryFigures(person({ present: 0, halfDay: 0, leave: 0, absent: 31, advances: 1000, paid: 0 }), 31)).toMatchObject({ earned: 0, due: -1000 });
  });

  it('leaves the money out until a salary is set', () => {
    expect(salaryFigures(person({ monthlySalary: null }), 31)).toMatchObject({ earned: null, due: null, payableDays: 27 });
  });

  it('covers a past month whole and this month up to today', () => {
    expect(salaryDays('2026-10-01', '2026-10-31', '2026-11-19')).toBe(31);
    expect(salaryDays('2026-11-01', '2026-11-30', '2026-11-19')).toBe(19);
    expect(salaryDays('2026-12-01', '2026-12-31', '2026-11-19')).toBe(0);
  });

  it('reads the database answer in rupees', () => {
    const m = parseSalaryMonth({ from: '2026-10-01', to: '2026-10-31', unassigned_paid_paise: 150000, staff: [
      { roster_id: 'r', name: 'Ravi', job_title: 'Cook', is_active: true, monthly_salary_paise: 2400000, present: 10, half_day: 2, leave: 3, absent: 1, advances_paise: 200000, paid_paise: 500000 },
      { roster_id: 's', name: 'Selvam', job_title: '', is_active: false, monthly_salary_paise: null, present: 0, half_day: 0, leave: 0, absent: 0, advances_paise: 0, paid_paise: 0 },
    ] });
    expect(m.unassignedPaid).toBe(1500);
    expect(m.staff[0]).toMatchObject({ monthlySalary: 24000, halfDay: 2, advances: 2000, paid: 5000 });
    expect(m.staff[1]?.monthlySalary).toBeNull();
    expect(() => parseSalaryMonth({ staff: [{ name: 'x' }] })).toThrow();
  });
});
