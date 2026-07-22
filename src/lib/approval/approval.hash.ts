import crypto from 'crypto';

/**
 * Computes a secure SHA-256 hash of the plain text approval code.
 * Plaintext codes are NEVER stored in the database.
 */
export function hashApprovalCode(code: string): string {
  const cleanCode = code.trim();
  return crypto.createHash('sha256').update(cleanCode).digest('hex');
}

/**
 * Generates a cryptographically secure 6-digit numeric approval code.
 */
export function generateApprovalCode(): string {
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}
