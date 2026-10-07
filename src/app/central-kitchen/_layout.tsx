import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { isCentralKitchenSession } from '@/lib/pos/tab-config';
import { colors } from '@/lib/pos/brand';
import { Toast } from '@/components/kitchen/ui';

/**
 * The Central Kitchen's own screens. A kitchen login at the Central Kitchen
 * branch lands here and sees nothing else; the owner and admins may open it
 * from Settings. Anyone else, a restaurant's kitchen display included, is
 * sent back to the app.
 */
export default function KitchenLayout() {
  const session = useSessionStore((state) => state.session);
  const notice = useKitchenStore((state) => state.notice);
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!isCentralKitchenSession(session) && session.role !== 'owner' && session.role !== 'admin') {
    return <Redirect href="/(app)" />;
  }
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surfaceTint } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <Toast text={notice} />
    </View>
  );
}
