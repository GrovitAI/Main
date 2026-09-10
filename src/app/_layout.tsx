import '../../global.css';
import { useEffect, useRef, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { ApprovalProvider } from '@/lib/approval/ApprovalContext';
import { getDefaultHrefForRole } from '@/lib/pos/tab-config';
import { BREAKPOINTS } from '@/lib/pos/useResponsive';
import { useSupabaseAutoRefresh } from '@/lib/pos/use-supabase-auto-refresh';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

export default function RootLayout() {
  const [isRestoring, setIsRestoring] = useState(true);
  const session = useSessionStore((state) => state.session);
  const restoreSession = useSessionStore((state) => state.restoreSession);
  const isAuthenticated = !!session;
  const prevAuthRef = useRef<boolean | null>(null);
  const segments = useSegments();
  const { width } = useWindowDimensions();
  const isPhone = width < BREAKPOINTS.tablet;

  useSupabaseAutoRefresh();

  useEffect(() => {
    async function checkSession() {
      await restoreSession();
      setIsRestoring(false);
    }
    checkSession();
  }, []);

  // Listen to session changes globally to handle navigation redirects reactively ONLY on auth status changes
  useEffect(() => {
    if (isRestoring) return;

    if (prevAuthRef.current === isAuthenticated) return;
    prevAuthRef.current = isAuthenticated;

    const currentGroup = segments[0] as string | undefined;

    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }

    // Already inside the app (e.g. a web deep link) — keep the requested screen.
    if (currentGroup === '(app)' && segments.length > 1) return;

    // Land on the role + device specific default screen (never on a hidden tab).
    const target = session ? getDefaultHrefForRole(session.role, isPhone) : '/(app)';
    router.replace(target as never);
  }, [isAuthenticated, isRestoring]);

  return (
    <SafeAreaProvider>
      <ApprovalProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          {/* Routes mount only after session restore so screens never fetch without tenant context. */}
          {!isRestoring && (
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          )}
          {isRestoring && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: '#004a8d',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 999999,
              }}
            >
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          )}
        </View>
      </ApprovalProvider>
    </SafeAreaProvider>
  );
}
