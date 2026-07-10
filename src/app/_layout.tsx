import '../../global.css';
import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { useSessionStore } from '@/lib/pos/use-session-store';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

export default function RootLayout() {
  const [isRestoring, setIsRestoring] = useState(true);
  const { restoreSession, session } = useSessionStore();

  useEffect(() => {
    async function checkSession() {
      await restoreSession();
      setIsRestoring(false);
    }
    checkSession();
  }, []);

  // Listen to session changes globally to handle navigation redirects reactively
  useEffect(() => {
    if (isRestoring) return;

    if (!session) {
      router.replace('/(auth)/login');
    } else {
      router.replace('/(app)');
    }
  }, [session, isRestoring]);

  if (isRestoring) {
    return (
      <View style={{ flex: 1, backgroundColor: '#004a8d', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}
