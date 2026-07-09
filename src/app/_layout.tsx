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
  const { restoreSession } = useSessionStore();

  useEffect(() => {
    async function checkSession() {
      const restored = await restoreSession();
      setIsRestoring(false);
      if (restored) {
        router.replace('/(app)');
      } else {
        router.replace('/(auth)/login');
      }
    }
    checkSession();
  }, []);

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
