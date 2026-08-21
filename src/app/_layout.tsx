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

  if (isRestoring) {
    return (
      <View style={{ flex: 1, backgroundColor: '#004a8d', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ApprovalProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </ApprovalProvider>
    </SafeAreaProvider>
  );
}
