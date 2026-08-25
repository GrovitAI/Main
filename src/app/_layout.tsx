import '../../global.css';
import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { ApprovalProvider } from '@/lib/approval/ApprovalContext';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

export default function RootLayout() {
  const [isRestoring, setIsRestoring] = useState(true);
  const session = useSessionStore((state) => state.session);
  const restoreSession = useSessionStore((state) => state.restoreSession);
  const isAuthenticated = !!session;
  const prevAuthRef = useRef<boolean | null>(null);

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

    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    } else {
      router.replace('/(app)');
    }
  }, [isAuthenticated, isRestoring]);

  return (
    <SafeAreaProvider>
      <ApprovalProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
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
