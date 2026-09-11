import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { logSupabaseError } from './supabase-debug';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://placeholder.supabase.co';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'placeholder-key';

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

/**
 * supabase-js reaches for localStorage to persist a session, and falls back to
 * an in-memory store when there is none. React Native has none, so without an
 * explicit adapter every cold start of the installed app would land on the
 * login screen. AsyncStorage is that adapter.
 *
 * The web app keeps its existing behaviour: no storage override, which leaves
 * localStorage in place, and session detection in the URL stays on because the
 * browser is where an auth redirect can arrive.
 */
const isWeb = Platform.OS === 'web';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isWeb ? undefined : AsyncStorage,
    detectSessionInUrl: isWeb,
    persistSession: true,
    autoRefreshToken: true,
  },
});
