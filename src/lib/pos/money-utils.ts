/**
 * Integer-paise money math shared by the cart, provisional bills and receipts.
 *
 * Mirrors the arithmetic of the `settle_order` PostgreSQL function
 * (supabase/migrations/20260907000200_sequences_and_settle_order_v2.sql) so the
 * amount shown on screen / printed provisionally is exactly the amount settled.
 *
 * Rules
 *   * Every intermediate value is an integer number of paise.
 *   * Percent discounts round half-up on the integer subtotal.
 *   * Line-level discounts are allocated with the largest-remainder method,
 *     so Σ(line discounts) === bill discount, always.
 */

export type DiscountType = 'percent' | 'fixed' | null;

export type MoneyLineInput = {
  id: string;
  qty: number;
  /** Unit price in rupees (may carry float noise, e.g. 12.499999). */
  price: number;
};

export type MoneyLine = MoneyLineInput & {
  pricePaise: number;
  linePaise: number;
  discountPaise: number;
};

export type BillTotals = {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  grandTotalPaise: number;
  /** Paise added to reach a whole rupee at GST branches; 0 elsewhere. */
  roundOffPaise: number;
  /** Effective discount percentage (0–100), derived for display. */
  discountPercent: number;
  lines: MoneyLine[];
  // Rupee views (for legacy call sites and display)
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  roundOff: number;
};

/** Half-up rounding that is immune to binary float artefacts (0.145 → 0.15). */
export function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // Nudge by a tiny epsilon relative to magnitude before flooring.
  return sign * Math.floor(abs + 0.5 + Number.EPSILON * Math.max(1, abs));
}

/** Rupees → integer paise. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return roundHalfUp(rupees * 100);
}

/** Integer paise → rupees with at most 2 decimals. */
export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export function calculateSubtotalPaise(lines: MoneyLineInput[]): number {
  return lines.reduce((sum, line) => sum + roundHalfUp(line.qty * toPaise(line.price)), 0);
}

/**
 * Computes the discount in paise for the given type / value.
 *   percent → value is 0–100
 *   fixed   → value is rupees
 */
export function calculateDiscountPaise(subtotalPaise: number, type: DiscountType, value: number): number {
  if (!type || subtotalPaise <= 0) return 0;
  if (type === 'percent') {
    const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
    return roundHalfUp((subtotalPaise * pct) / 100);
  }
  const fixed = Math.max(0, toPaise(Number.isFinite(value) ? value : 0));
  return Math.min(subtotalPaise, fixed);
}

/**
 * Largest-remainder allocation of `discountPaise` across lines proportionally
 * to their line amounts. Returns per-line discount in paise (same order).
 */
export function allocateDiscount(linePaise: number[], discountPaise: number): number[] {
  const subtotal = linePaise.reduce((s, v) => s + v, 0);
  if (subtotal <= 0 || discountPaise <= 0) {
    return linePaise.map(() => 0);
  }
  const base = linePaise.map((lp) => Math.floor((discountPaise * lp) / subtotal));
  const remainders = linePaise.map((lp, i) => ({ i, rem: (discountPaise * lp) % subtotal }));
  let leftover = discountPaise - base.reduce((s, v) => s + v, 0);
  remainders.sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of remainders) {
    if (leftover <= 0) break;
    base[i] += 1;
    leftover -= 1;
  }
  return base;
}

export type ComputeBillTotalsOptions = {
  discountType: DiscountType;
  /** Percent (0–100) for 'percent', rupees for 'fixed'. */
  discountValue: number;
  /** Branch tax percentage, e.g. 5 for 5% GST. Defaults to 0. */
  taxPercentage?: number;
  /** Complimentary bills: 100% discount on subtotal + tax, total 0. */
  complimentary?: boolean;
};

/**
 * The single source of truth for cart / bill totals on the client.
 */
export function computeBillTotals(lines: MoneyLineInput[], options: ComputeBillTotalsOptions): BillTotals {
  const taxPct = Number.isFinite(options.taxPercentage ?? 0) ? (options.taxPercentage ?? 0) : 0;

  const pricedLines = lines.map((line) => {
    const pricePaise = toPaise(line.price);
    return { ...line, pricePaise, linePaise: roundHalfUp(line.qty * pricePaise) };
  });
  const subtotalPaise = pricedLines.reduce((s, l) => s + l.linePaise, 0);

  let discountPaise: number;
  let taxPaise: number;
  let grandTotalPaise: number;

  if (options.complimentary) {
    taxPaise = roundHalfUp((subtotalPaise * taxPct) / 100);
    discountPaise = subtotalPaise + taxPaise;
    grandTotalPaise = 0;
  } else {
    discountPaise = calculateDiscountPaise(subtotalPaise, options.discountType, options.discountValue);
    taxPaise = roundHalfUp(((subtotalPaise - discountPaise) * taxPct) / 100);
    grandTotalPaise = subtotalPaise - discountPaise + taxPaise;
  }

  // A GST branch settles in whole rupees: the payable total rounds up and the
  // difference prints as Round Off. The taxable value and the tax stay exact,
  // which is what GST records need. A branch without GST keeps exact paise.
  let roundOffPaise = 0;
  if (taxPct > 0 && grandTotalPaise > 0) {
    const roundedPaise = Math.ceil(grandTotalPaise / 100) * 100;
    roundOffPaise = roundedPaise - grandTotalPaise;
    grandTotalPaise = roundedPaise;
  }

  const allocated = allocateDiscount(
    pricedLines.map((l) => l.linePaise),
    Math.min(discountPaise, subtotalPaise)
  );

  const discountPercent = subtotalPaise > 0 ? Math.min(100, (Math.min(discountPaise, subtotalPaise) / subtotalPaise) * 100) : 0;

  return {
    subtotalPaise,
    discountPaise,
    taxPaise,
    grandTotalPaise,
    roundOffPaise,
    discountPercent,
    lines: pricedLines.map((l, i) => ({ ...l, discountPaise: allocated[i] })),
    subtotal: fromPaise(subtotalPaise),
    discountAmount: fromPaise(discountPaise),
    taxAmount: fromPaise(taxPaise),
    grandTotal: fromPaise(grandTotalPaise),
    roundOff: fromPaise(roundOffPaise),
  };
}
