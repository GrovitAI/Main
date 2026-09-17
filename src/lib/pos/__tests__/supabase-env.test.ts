import { isSupabaseAnonKeyValid, isSupabaseUrlValid } from '@/lib/pos/supabase-env';

describe('supabase env checks', () => {
  it('accepts a real project URL', () => {
    expect(isSupabaseUrlValid('https://abcdefghijkl.supabase.co')).toBe(true);
    expect(isSupabaseUrlValid('https://abcdefghijkl.supabase.co/')).toBe(true);
  });

  it('rejects what a failed paste leaves behind', () => {
    // Ctrl+V typed into a terminal prompt is stored as this control character.
    expect(isSupabaseUrlValid('')).toBe(false);
    expect(isSupabaseUrlValid('')).toBe(false);
    expect(isSupabaseUrlValid(' ')).toBe(false);
    expect(isSupabaseUrlValid('http://abcdefghijkl.supabase.co')).toBe(false);
    expect(isSupabaseUrlValid('https://placeholder.supabase.co')).toBe(false);
    expect(isSupabaseUrlValid('"https://abcdefghijkl.supabase.co"')).toBe(false);
  });

  it('accepts a long printable key and rejects a stub', () => {
    expect(isSupabaseAnonKeyValid('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature')).toBe(true);
    expect(isSupabaseAnonKeyValid('')).toBe(false);
    expect(isSupabaseAnonKeyValid('')).toBe(false);
    expect(isSupabaseAnonKeyValid('placeholder-key')).toBe(false);
    expect(isSupabaseAnonKeyValid('short')).toBe(false);
  });
});
