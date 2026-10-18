import '../../global.css';
import { useEffect, useRef, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { ApprovalProvider } from '@/lib/approval/ApprovalContext';
import { getDefaultHrefForSession } from '@/lib/pos/tab-config';
import { BREAKPOINTS } from '@/lib/pos/useResponsive';
import { useSupabaseAutoRefresh } from '@/lib/pos/use-supabase-auto-refresh';
import { TestDatabaseBanner } from '@/components/ui/TestDatabaseBanner';
import { AppFontProvider } from '@/components/ui/Typography';
import { useAppFonts } from '@/lib/pos/use-app-fonts';
import { useWebHover } from '@/lib/pos/web-hover';
import { installNativePressableStyles } from '@/lib/pos/native-pressable-styles';

// Before the first render: phones get Pressable function styles back (task 249).
installNativePressableStyles();

// A render error in an installed app would otherwise close it; this shows the message instead.
export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

export default function RootLayout() {
  const { loaded: fontsLoaded } = useAppFonts();
  const [isRestoring, setIsRestoring] = useState(true);
  const session = useSessionStore((state) => state.session);
  const restoreSession = useSessionStore((state) => state.restoreSession);
  const isAuthenticated = !!session;
  const prevAuthRef = useRef<boolean | null>(null);
  const segments = useSegments();
  const { width } = useWindowDimensions();
  const isPhone = width < BREAKPOINTS.tablet;

  useSupabaseAutoRefresh();
  // A hover highlight on everything clickable in a browser (task 225).
  useWebHover();

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
    if ((currentGroup === '(app)' || currentGroup === 'central-kitchen') && segments.length > 1) return;

    // Land on the role + device specific default screen (never on a hidden tab).
    const target = session ? getDefaultHrefForSession(session, isPhone) : '/(app)';
    router.replace(target as never);
  }, [isAuthenticated, isRestoring]);

  return (
    <SafeAreaProvider>
      <AppFontProvider value={fontsLoaded}>
        <ApprovalProvider>
          <StatusBar style="dark" />
          <View style={{ flex: 1 }}>
            {/* Routes mount only after session restore so screens never fetch without tenant context. */}
            {!isRestoring && (
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(app)" />
                <Stack.Screen name="central-kitchen" />
              </Stack>
            )}
            {/* Only on the staging copy of the database; a small tag drawn over the screens. */}
            <TestDatabaseBanner />
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
      </AppFontProvider>
    </SafeAreaProvider>
  );
}
