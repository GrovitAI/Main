import { View, Text, Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';

export default function PosBillingScreen() {
  return (
    <View className="flex-1 bg-background px-6">
      <View className="flex-1 items-center justify-center">
        <View className="w-full max-w-lg rounded-2xl border border-border bg-background p-8">
          <Text className="text-center text-2xl font-bold text-text-primary">
            POS — Billing
          </Text>
          <Text className="mt-2 text-center text-base text-text-secondary">
            Tap + to create a new order
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new order"
            className="mt-10 h-[88px] w-[88px] min-h-[44px] min-w-[44px] items-center justify-center self-center rounded-full bg-primary"
          >
            <Plus color={colors.background} size={40} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
