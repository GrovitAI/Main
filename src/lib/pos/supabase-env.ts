/**
 * Checks for the two Supabase settings that are baked into every build.
 * scripts/check-build-env.js applies the same rules before a build starts;
 * keep the two in step.
 */

/** A Supabase project URL: https, a host, nothing else (no spaces or control characters). */
export function isSupabaseUrlValid(value: string): boolean {
  return /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:\d+)?\/?$/.test(value) && !value.includes('placeholder');
}

/** A Supabase key is a long run of printable characters; anything shorter was not pasted properly. */
export function isSupabaseAnonKeyValid(value: string): boolean {
  return /^[\x21-\x7e]{20,}$/.test(value) && value !== 'placeholder-key';
}
