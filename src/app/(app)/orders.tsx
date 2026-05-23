import { View, Text } from 'react-native';

export default function OrdersScreen() {
  return (
    <View className="flex-1 bg-background px-6">
      <View className="flex-1 items-center justify-center">
        <View className="w-full max-w-lg rounded-2xl border border-border bg-background p-8">
          <Text className="text-center text-2xl font-bold text-text-primary">
            Open Orders
          </Text>
          <Text className="mt-2 text-center text-base text-text-secondary">
            Active orders across all tables
          </Text>

          <View className="mt-8 rounded-xl border border-dashed border-border bg-background px-4 py-6">
            <Text className="text-center text-base text-text-secondary">
              No open orders — tap POS to create one
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
