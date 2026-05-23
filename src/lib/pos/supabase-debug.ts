type SupabaseErrorShape = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function logSupabaseError(context: string, error: SupabaseErrorShape | null): void {
  if (!error) {
    return;
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[Grovit Supabase] ${context}`, {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }
}

export function isMissingColumnError(error: SupabaseErrorShape | null): boolean {
  if (!error) {
    return false;
  }
  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    message.includes('column') ||
    message.includes('does not exist')
  );
}
