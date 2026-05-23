import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
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

function CreateOrderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create new order"
      onPress={onPress}
      className="mr-2"
    >
      <BrandedGradient
        variant="primarySoft"
        className="h-12 w-12 items-center justify-center rounded-full border-2 border-border-soft"
      >
        <Plus color={colors.textOnPrimary} size={22} strokeWidth={2.5} />
      </BrandedGradient>
    </Pressable>
  );
}

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
    label: formatOrderLabel(order.order_name, `Order #${index + 1}`),
    itemCount: itemCountByOrderId[order.id] ?? 0,
  }));

  if (isLoading && orders.length === 0) {
    return (
      <View className="px-4 py-4">
        <ActivityIndicator color={colors.primaryMid} />
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View className="flex-row items-center rounded-panel border border-border-soft bg-surface-elevated px-5 py-4 shadow-card">
        <Text className="flex-1 text-base text-text-secondary">
          Tap + to create first order
        </Text>
        <CreateOrderButton onPress={onCreateOrder} />
      </View>
    );
  }

  return (
    <View className="rounded-panel border border-border-soft bg-surface-elevated px-3 py-3 shadow-card">
      <FlatList
        horizontal
        data={chips}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center' }}
        ListHeaderComponent={<CreateOrderButton onPress={onCreateOrder} />}
        renderItem={({ item }) => {
          const isActive = item.id === activeOrderId;

          if (isActive) {
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectOrder(item.id)}
                className="mx-1"
              >
                <BrandedGradient
                  variant="primary"
                  className="min-h-[52px] min-w-[120px] items-center justify-center rounded-full px-5 py-3"
                >
                  <Text className="text-center text-sm font-bold text-text-on-primary">
                    {item.label}
                  </Text>
                  <Text className="mt-0.5 text-center text-xs font-medium text-accent">
                    {item.itemCount} items
                  </Text>
                </BrandedGradient>
              </Pressable>
            );
          }

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectOrder(item.id)}
              className="mx-1 min-h-[52px] min-w-[120px] justify-center rounded-full border border-border-soft bg-surface-tint px-5 py-3"
            >
              <Text className="text-center text-sm font-semibold text-text-primary">
                {item.label}
              </Text>
              <Text className="mt-0.5 text-center text-xs text-text-secondary">
                {item.itemCount} items
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
