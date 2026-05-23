import { View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';

export default function LoginScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-3xl font-bold text-text-primary">Grovit</Text>
      <Text className="mt-2 text-base text-text-secondary">Sign in to your restaurant</Text>
      <Link href="/(app)" asChild>
        <Pressable className="mt-8 min-h-[44px] items-center justify-center rounded-xl bg-primary px-8 py-3">
          <Text className="text-base font-semibold text-white">Continue to POS</Text>
        </Pressable>
      </Link>
    </View>
  );
}
