import { FinanceScreen } from '@/components/finance/FinanceScreen';
import { Redirect, type Href } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { FINANCE_MODULE_ENABLED, getDefaultHrefForSession } from '@/lib/pos/tab-config';
import { useSessionStore } from '@/lib/pos/use-session-store';

/**
 * Retained for future use. Redirect before mounting Finance or its data effects.
 */
export default function Finance() {
  const session = useSessionStore(state => state.session);
  const { width } = useWindowDimensions();
  if (!FINANCE_MODULE_ENABLED) {
    return <Redirect href={(session ? getDefaultHrefForSession(session, width < 768) : '/(auth)/login') as Href} />;
  }
  return <FinanceScreen />;
}
