/**
 * Formats raw payment method strings into clean, user-friendly Title Case or UPPERCASE strings.
 * E.g.:
 * - 'complimentary' -> 'Complimentary'
 * - 'cash' -> 'Cash'
 * - 'upi' -> 'UPI'
 * - 'card' / 'pos' -> 'Card'
 * - 'cash + upi' -> 'Cash + UPI'
 */
export function formatPaymentMode(mode: string | null | undefined): string {
  if (!mode) return '';
  const trimmed = mode.trim();
  if (!trimmed) return '';

  if (trimmed.includes('+')) {
    return trimmed
      .split('+')
      .map((part) => formatPaymentMode(part.trim()))
      .filter(Boolean)
      .join(' + ');
  }

  const upper = trimmed.toUpperCase();
  if (upper === 'UPI') return 'UPI';
  if (upper === 'POS' || upper === 'CARD') return 'Card';
  if (upper === 'CASH') return 'Cash';
  if (upper === 'COMPLIMENTARY') return 'Complimentary';
  if (upper === 'PAID') return 'Paid';
  if (upper === 'UNPAID') return 'Unpaid';

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
