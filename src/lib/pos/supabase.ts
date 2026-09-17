import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { isSupabaseAnonKeyValid, isSupabaseUrlValid } from './supabase-env';
import { logSupabaseError } from './supabase-debug';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

const configuredUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ''
).trim();

const configuredAnonKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

/**
 * Whether the build carries usable Supabase settings. The values are baked in
 * when the app is built, so a bad one (a stray control character pasted into
 * the build service, for instance) cannot be corrected on the device.
 */
export const isSupabaseConfigured =
  isSupabaseUrlValid(configuredUrl) && isSupabaseAnonKeyValid(configuredAnonKey);

// createClient throws on a malformed URL, and it runs while the first screen
// loads, so a bad value would close the installed app before anything shows.
// Falling back keeps the app open; the login screen explains what is wrong.
const supabaseUrl = isSupabaseConfigured ? configuredUrl : PLACEHOLDER_URL;
const supabaseAnonKey = isSupabaseConfigured ? configuredAnonKey : PLACEHOLDER_KEY;

const hasValidSupabaseEnv = isSupabaseConfigured;

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
