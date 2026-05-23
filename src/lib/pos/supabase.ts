import { createClient } from '@supabase/supabase-js';

import { logSupabaseError } from './supabase-debug';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const hasValidSupabaseEnv =
  supabaseUrl.length > 0 &&
  supabaseAnonKey.length > 0 &&
  !supabaseUrl.includes('placeholder') &&
  supabaseUrl.startsWith('https://');

if (!hasValidSupabaseEnv && typeof __DEV__ !== 'undefined' && __DEV__) {
  logSupabaseError('supabase.init', {
    message:
      'Missing or invalid EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Check .env and restart Metro with --clear.',
    code: 'ENV_MISSING',
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
