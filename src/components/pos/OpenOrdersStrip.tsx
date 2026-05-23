import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
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

/* eslint-disable @typescript-eslint/no-require-imports */
const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

function LogoHeader() {
  return (
    <View className="mr-3 items-center justify-center">
      <Image
        source={leLabanLogo}
        className="h-7 w-16"
        resizeMode="contain"
        accessibilityLabel="Le Leban logo"
      />
      <Text className="mt-0.5 text-[10px] font-medium text-accent">
        Main Branch
      </Text>
    </View>
  );
}

function CreateOrderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create new order"
      onPress={onPress}
      className="ml-1"
    >
      <View className="h-8 w-8 items-center justify-center rounded-full border border-primary-light/40 bg-primary-light/30">
        <Plus color={colors.textOnPrimary} size={16} strokeWidth={2.5} />
      </View>
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
    label: formatOrderLabel(order.order_name, `#${index + 1}`),
    itemCount: itemCountByOrderId[order.id] ?? 0,
  }));

  if (isLoading && orders.length === 0) {
    return (
      <BrandedGradient variant="strip" className="min-h-[44px] flex-row items-center justify-center rounded-xl px-3 py-2">
        <LogoHeader />
        <ActivityIndicator color={colors.accent} size="small" />
      </BrandedGradient>
    );
  }

  if (orders.length === 0) {
    return (
      <BrandedGradient variant="strip" className="min-h-[44px] flex-row items-center rounded-xl px-3 py-2">
        <LogoHeader />
        <Text className="flex-1 text-xs text-accent">
          Tap + to create first order
        </Text>
        <CreateOrderButton onPress={onCreateOrder} />
      </BrandedGradient>
    );
  }

  return (
    <BrandedGradient variant="strip" className="min-h-[44px] rounded-xl px-2 py-1.5">
      <FlatList
        horizontal
        data={chips}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center' }}
        ListHeaderComponent={<LogoHeader />}
        ListFooterComponent={<CreateOrderButton onPress={onCreateOrder} />}
        renderItem={({ item }) => {
          const isActive = item.id === activeOrderId;

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectOrder(item.id)}
              className="mx-1"
            >
              <View
                className={
                  isActive
                    ? 'min-h-[36px] min-w-[80px] items-center justify-center rounded-lg border border-primary-light/50 bg-primary-light/25 px-3 py-1'
                    : 'min-h-[36px] min-w-[80px] items-center justify-center rounded-lg bg-text-on-primary/10 px-3 py-1'
                }
              >
                <Text
                  className={
                    isActive
                      ? 'text-center text-xs font-bold text-text-on-primary'
                      : 'text-center text-xs font-semibold text-accent'
                  }
                >
                  {item.label}
                </Text>
                <Text
                  className={
                    isActive
                      ? 'text-center text-[10px] text-accent'
                      : 'text-center text-[10px] text-text-on-primary/60'
                  }
                >
                  {item.itemCount} items
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </BrandedGradient>
  );
}
