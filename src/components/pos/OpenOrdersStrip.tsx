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

function CreateOrderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create new order"
      onPress={onPress}
      className="ml-2 h-[36px] min-w-[70px] items-center justify-center rounded-xl border border-dashed border-primary-mid bg-surface-elevated px-3 py-1"
    >
      <Plus color={colors.primaryMid} size={14} strokeWidth={2.5} />
      <Text className="mt-0.5 text-[9px] font-semibold text-primary-mid">New Order</Text>
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
      <View className="min-h-[56px] flex-row items-center rounded-xl bg-surface-elevated px-2">
        <ActivityIndicator color={colors.primaryMid} size="small" />
      </View>
    );
  }

  return (
    <View className="min-h-[56px] flex-row items-center rounded-xl bg-surface-elevated">
      <View className="mr-5 justify-center">
        <Text className="text-[9px] font-bold uppercase tracking-wider text-text-secondary">
          Active Orders
        </Text>
      </View>

      <FlatList
        horizontal
        data={chips}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center' }}
        ListFooterComponent={<CreateOrderButton onPress={onCreateOrder} />}
        renderItem={({ item }) => {
          const isActive = item.id === activeOrderId;

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectOrder(item.id)}
              className="mr-2"
            >
              <View
                className={
                  isActive
                    ? 'h-[36px] min-w-[80px] items-center justify-center rounded-xl bg-primary-mid px-3 shadow-sm'
                    : 'h-[36px] min-w-[80px] items-center justify-center rounded-xl border border-border-soft bg-surface-elevated px-3'
                }
              >
                <Text
                  className={
                    isActive
                      ? 'text-[13px] font-bold text-text-on-primary'
                      : 'text-[13px] font-bold text-text-primary'
                  }
                >
                  {item.label}
                </Text>
                <Text
                  className={
                    isActive
                      ? 'mt-0.5 text-[10px] font-medium text-text-on-primary/80'
                      : 'mt-0.5 text-[10px] font-medium text-text-secondary'
                  }
                >
                  {item.itemCount} items
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
