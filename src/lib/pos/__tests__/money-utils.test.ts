import {
  allocateDiscount,
  calculateDiscountPaise,
  computeBillTotals,
  roundHalfUp,
  toPaise,
} from '../money-utils';

describe('money-utils', () => {
  test('toPaise is immune to binary float artefacts', () => {
    expect(toPaise(0.58)).toBe(58);
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(12.499999999)).toBe(1250);
    expect(toPaise(NaN)).toBe(0);
  });

  test('roundHalfUp rounds .5 away from zero on exact halves', () => {
    expect(roundHalfUp(14.5)).toBe(15);
    expect(roundHalfUp(14.4999)).toBe(14);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });

  test('percent discount on 58 paise at 25% is 15 paise (audit M8 example)', () => {
    expect(calculateDiscountPaise(58, 'percent', 25)).toBe(15);
    expect(calculateDiscountPaise(116, 'percent', 12.5)).toBe(15);
  });

  test('fixed discount never exceeds the subtotal', () => {
    expect(calculateDiscountPaise(1000, 'fixed', 25)).toBe(1000);
    expect(calculateDiscountPaise(1000, 'fixed', 2.5)).toBe(250);
    expect(calculateDiscountPaise(1000, null, 50)).toBe(0);
  });

  test('allocateDiscount sums exactly to the discount (largest remainder)', () => {
    const lines = [333, 333, 334];
    const alloc = allocateDiscount(lines, 100);
    expect(alloc.reduce((s, v) => s + v, 0)).toBe(100);
    expect(alloc).toEqual([33, 33, 34]);
    expect(allocateDiscount([100, 200], 0)).toEqual([0, 0]);
  });

  test('computeBillTotals: lines + tax reconcile to the grand total', () => {
    const totals = computeBillTotals(
      [
        { id: 'a', qty: 3, price: 149.99 },
        { id: 'b', qty: 1, price: 0.58 },
      ],
      { discountType: 'percent', discountValue: 10, taxPercentage: 5 }
    );
    expect(totals.subtotalPaise).toBe(44997 + 58);
    expect(totals.discountPaise).toBe(4506); // 10% of 45055 = 4505.5 → 4506
    expect(totals.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(4506);
    expect(totals.taxPaise).toBe(2027); // 5% of 40549 = 2027.45 → 2027
    expect(totals.grandTotalPaise).toBe(45055 - 4506 + 2027);
    expect(totals.grandTotal).toBeCloseTo(425.76, 2);
  });

  test('complimentary bill zeroes the total and discounts subtotal + tax', () => {
    const totals = computeBillTotals([{ id: 'a', qty: 2, price: 100 }], {
      discountType: null,
      discountValue: 0,
      taxPercentage: 5,
      complimentary: true,
    });
    expect(totals.taxPaise).toBe(1000);
    expect(totals.discountPaise).toBe(21000);
    expect(totals.grandTotalPaise).toBe(0);
    expect(totals.discountPercent).toBe(100);
  });
});
