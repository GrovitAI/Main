import { Redirect, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { isCentralKitchenSession } from '@/lib/pos/tab-config';
import { colors } from '@/lib/pos/brand';
import { useKitchenTitle, useKitchenWebPolish } from '@/lib/pos/kitchen-web';
import { OfflineBar, ScreenEnter, Toast } from '@/components/kitchen/ui';

/**
 * Task 269: a form opened by a link or a reload has the kitchen's tabs beneath it, so Back and the
 * return after a save land on kitchen Home. Without this the root's (auth) group sat beneath and a
 * phone owner was sent to the main app's Analytics.
 */
export const unstable_settings = { initialRouteName: '(tabs)' };

/** Each kitchen screen's name for the browser tab (task 221). */
const SCREEN_NAMES: Record<string, string> = {
  home: 'Kitchen', analytics: 'Analytics', items: 'Raw materials', 'finished-goods': 'Finished goods',
  attendance: 'Attendance', branches: 'Branches', invoices: 'Invoices', vendors: 'Vendors', history: 'History',
  send: 'Send', received: 'Received', bought: 'Bought', spent: 'Spent', money: 'Cash and bank',
  team: 'Team and day lock', 'purchase-categories': 'Categories',
};

function useScreenName(): string {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ id?: string; kind?: string }>();
  // The loaded lists only: reading them here must not start another load.
  const items = useKitchenStore((state) => state.items);
  const parties = useKitchenStore((state) => state.parties);
  const [, , section = 'home', id] = pathname.split('/');
  if (section === 'item' && id) return items.find((i) => i.id === id)?.name ?? 'Item';
  if (section === 'party' && id) return parties.find((p) => p.id === id)?.name ?? 'Branch or vendor';
  if (section === 'item-form') return params.id ? 'Edit item' : 'New item';
  if (section === 'party-form') return `${params.id ? 'Edit' : 'New'} ${params.kind === 'vendor' ? 'vendor' : 'branch'}`;
  return SCREEN_NAMES[section] ?? 'Kitchen';
}

/**
 * The Central Kitchen's own screens. A kitchen login at the Central Kitchen
 * branch lands here and sees nothing else; the owner and admins may open it
 * from Settings. Anyone else, a restaurant's kitchen display included, is
 * sent back to the app.
 */
export default function KitchenLayout() {
  const session = useSessionStore((state) => state.session);
  const notice = useKitchenStore((state) => state.notice);
  useKitchenWebPolish();
  useKitchenTitle(useScreenName());
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!isCentralKitchenSession(session) && session.role !== 'owner' && session.role !== 'admin') {
    return <Redirect href="/(app)" />;
  }
  return (
    <View style={{ flex: 1 }}>
      <OfflineBar />
      {/* Task 216: a screen opened from a list slides in. The phone app's navigation already
          does this; in a browser each opened screen (not the tabs) gets a short slide-in. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.kitchenCanvas } }}
        screenLayout={Platform.OS === 'web' ? ({ children, route }) => (route.name === '(tabs)' ? children : <ScreenEnter>{children}</ScreenEnter>) : undefined}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <Toast text={notice} />
    </View>
  );
}
