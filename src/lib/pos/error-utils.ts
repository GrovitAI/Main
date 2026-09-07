/**
 * Error helpers shared by the UI layer.
 *
 * Catch clauses are typed `unknown` under TypeScript strict mode, so the
 * message has to be narrowed before it can be shown or logged. Services must
 * still return their own fixed, user-safe strings: use these helpers for
 * logging and for the rare screen-level fallback.
 */

/** Narrows an unknown thrown value to a message string. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  if (err && typeof err === 'object') {
    const maybe = (err as { message?: unknown }).message;
    if (typeof maybe === 'string' && maybe.trim().length > 0) {
      return maybe;
    }
  }
  return fallback;
}
