import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Refreshes the auth token while the installed app is in the foreground, and
 * stops while it is not.
 *
 * supabase-js refreshes on a timer. A browser tab keeps that timer running, but
 * an app the operating system has backgrounded does not, so the token can
 * expire unnoticed and the first request after the app is reopened fails. This
 * follows Supabase's React Native guidance: start the refresh loop when the app
 * becomes active, stop it when it leaves.
 *
 * On the web this is a no-op, because the default behaviour is already correct.
 */
export function useSupabaseAutoRefresh(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    void supabase.auth.startAutoRefresh();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    });

    return () => {
      subscription.remove();
      void supabase.auth.stopAutoRefresh();
    };
  }, []);
}
