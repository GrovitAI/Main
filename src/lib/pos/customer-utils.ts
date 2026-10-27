/** Task 288: a customer's number as the till takes it; the database holds the same rule. */

/** Spaces, brackets and dashes are typed for reading; the number is stored as digits with an optional +. */
export function cleanPhone(typed: string): string {
  return typed.replace(/[\s()-]/g, '');
}

export function validPhone(phone: string): boolean {
  return /^\+?[0-9]{6,15}$/.test(phone);
}

/** 98765 43210 for a ten-digit number; anything else as stored. */
export function showPhone(phone: string): string {
  return /^[0-9]{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}
