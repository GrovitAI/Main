import { Stack } from 'expo-router';

import { colors } from '@/lib/pos/brand';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.primaryDeep },
      }}
    >
      <Stack.Screen name="login" />
    </Stack>
  );
}
