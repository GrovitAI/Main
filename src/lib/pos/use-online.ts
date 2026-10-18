import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type NetState = { isConnected: boolean | null };
type NetInfoModule = { addEventListener: (listener: (state: NetState) => void) => () => void };

/**
 * NetInfo is loaded only on a phone, and only if this build has it: an app
 * installed before it was added has no native part, and importing it there
 * would throw, so the bar then simply never shows.
 */
function loadNetInfo(): NetInfoModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-community/netinfo') as { default?: NetInfoModule };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

/**
 * False while the device has no network. Browsers report it through
 * navigator.onLine; phones through NetInfo. An unknown state counts as online,
 * so the warning never shows by mistake.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine !== false : true));
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const up = (): void => setOnline(true);
      const down = (): void => setOnline(false);
      window.addEventListener('online', up);
      window.addEventListener('offline', down);
      return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
    }
    const netInfo = loadNetInfo();
    if (!netInfo) return;
    try {
      return netInfo.addEventListener((state) => setOnline(state.isConnected !== false));
    } catch {
      return;
    }
  }, []);
  return online;
}
