import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import type { OpenOrder } from '@/lib/pos/order-types';
import { formatOrderLabel } from '@/lib/pos/order-utils';

type OpenOrdersStripProps = {
  orders: OpenOrder[];
  activeOrderId: string | null;
  itemCountByOrderId: Record<string, number>;
  isLoading: boolean;
  onSelectOrder: (orderId: string) => void;
  onCreateOrder: () => void;
};

type OrderChip = {
  id: string;
  label: string;
  itemCount: number;
};

export function OpenOrdersStrip({
  orders,
  activeOrderId,
  itemCountByOrderId,
  isLoading,
  onSelectOrder,
  onCreateOrder,
}: OpenOrdersStripProps) {
  const chips: OrderChip[] = orders.map((order, index) => ({
    id: order.id,
    label: formatOrderLabel(order.table_label, `Order #${index + 1}`),
    itemCount: itemCountByOrderId[order.id] ?? 0,
  }));

  if (isLoading && orders.length === 0) {
    return (
      <View className="border-b border-border bg-background px-3 py-3">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View className="flex-row items-center border-b border-border bg-background px-3 py-3">
        <Text className="flex-1 text-sm text-text-secondary">
          Tap + to create first order
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create first order"
          onPress={onCreateOrder}
          className="h-11 w-11 items-center justify-center rounded-full bg-primary"
        >
          <Plus color={colors.background} size={22} />
        </Pressable>
      </View>
    );
  }

  return (
    <View className="border-b border-border bg-background py-2">
      <FlatList
        horizontal
        data={chips}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center', gap: 8 }}
        ListHeaderComponent={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new order"
            onPress={onCreateOrder}
            className="mr-1 h-11 w-11 items-center justify-center rounded-full border border-border bg-background"
          >
            <Plus color={colors.primary} size={22} />
          </Pressable>
        }
        renderItem={({ item }) => {
          const isActive = item.id === activeOrderId;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectOrder(item.id)}
              className={`min-h-[44px] justify-center rounded-full px-4 py-2 ${
                isActive ? 'bg-primary' : 'border border-border bg-background'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  isActive ? 'text-white' : 'text-text-primary'
                }`}
              >
                {item.label}
              </Text>
              <Text
                className={`mt-0.5 text-xs ${
                  isActive ? 'text-accent' : 'text-text-secondary'
                }`}
              >
                {item.itemCount} items
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
