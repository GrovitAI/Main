import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Minus, Plus, Trash2 } from 'lucide-react-native';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import { colors } from '@/lib/pos/brand';
import type { OpenOrder, PosOrderItem } from '@/lib/pos/order-types';
import {
  calculateOrderSubtotal,
  calculateOrderTotal,
  calculateTax,
  formatOrderLabel,
  TAX_RATE,
} from '@/lib/pos/order-utils';
import { formatCurrency } from '@/lib/pos/settlement-utils';

type OrderPanelProps = {
  order: OpenOrder | null;
  items: PosOrderItem[];
  orderIndex: number;
  isLoading: boolean;
  isMutating: boolean;
  onIncrementItem: (itemId: string) => void;
  onDecrementItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onSendKot: () => void;
  onSettle: () => void;
};

export function OrderPanel({
  order,
  items,
  orderIndex,
  isLoading,
  isMutating,
  onIncrementItem,
  onDecrementItem,
  onRemoveItem,
  onSendKot,
  onSettle,
}: OrderPanelProps) {
  const subtotal = calculateOrderSubtotal(items);
  const tax = calculateTax(subtotal, TAX_RATE);
  const total = calculateOrderTotal(subtotal, TAX_RATE);

  const orderTitle = order
    ? formatOrderLabel(order.order_name, `Order #${orderIndex + 1}`)
    : 'No active order';

  return (
    <View className="flex-1 bg-surface-elevated">
      <View className="border-b border-border-soft px-5 py-4">
        <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Current order
        </Text>
        <Text className="mt-1 text-2xl font-bold text-text-primary">{orderTitle}</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primaryMid} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center rounded-2xl border border-dashed border-border-soft bg-surface-tint px-4 py-12">
              <Text className="text-center text-base text-text-secondary">
                Add items from the menu
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="mb-3 rounded-2xl border border-border-soft bg-surface-tint p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-lg font-bold text-text-primary">
                    {item.product_name}
                  </Text>
                  <Text className="mt-1 text-sm text-text-secondary">
                    {formatCurrency(item.price)} each
                  </Text>
                </View>
                <Text className="text-lg font-bold text-primary-mid">
                  {formatCurrency(item.qty * item.price)}
                </Text>
              </View>

              <View className="mt-4 flex-row items-center justify-between">
                <View className="flex-row items-center rounded-2xl border border-border-soft bg-surface-elevated p-1">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decrease quantity"
                    disabled={isMutating}
                    onPress={() => onDecrementItem(item.id)}
                    className="h-12 w-12 items-center justify-center rounded-xl bg-surface-tint"
                  >
                    <Minus color={colors.primaryDeep} size={20} />
                  </Pressable>
                  <Text className="mx-4 min-w-[28px] text-center text-lg font-bold text-text-primary">
                    {item.qty}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Increase quantity"
                    disabled={isMutating}
                    onPress={() => onIncrementItem(item.id)}
                    className="h-12 w-12 items-center justify-center rounded-xl bg-surface-tint"
                  >
                    <Plus color={colors.primaryDeep} size={20} />
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove item"
                  disabled={isMutating}
                  onPress={() => onRemoveItem(item.id)}
                  className="h-12 w-12 items-center justify-center rounded-2xl border border-border-soft bg-surface-elevated"
                >
                  <Trash2 color={colors.primaryMid} size={20} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <View className="border-t border-border-soft bg-surface-tint px-5 py-4">
        <View className="flex-row justify-between py-1.5">
          <Text className="text-sm text-text-secondary">Subtotal</Text>
          <Text className="text-base font-semibold text-text-primary">
            {formatCurrency(subtotal)}
          </Text>
        </View>
        <View className="flex-row justify-between py-1.5">
          <Text className="text-sm text-text-secondary">Tax (5%)</Text>
          <Text className="text-base font-semibold text-text-primary">
            {formatCurrency(tax)}
          </Text>
        </View>
        <View className="mt-2 flex-row items-end justify-between border-t border-border-soft pt-3">
          <Text className="text-base font-semibold text-text-secondary">Total</Text>
          <Text className="text-3xl font-bold text-primary-mid">
            {formatCurrency(total)}
          </Text>
        </View>

        <View className="mt-4 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            disabled={!order || items.length === 0 || isMutating}
            onPress={onSendKot}
            className="min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-primary-mid bg-surface-elevated"
          >
            <Text className="text-sm font-bold text-primary-mid">Send KOT</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!order || items.length === 0 || isMutating}
            onPress={onSettle}
            className="min-h-[48px] flex-1 overflow-hidden rounded-2xl"
          >
            <BrandedGradient variant="primary" className="min-h-[48px] items-center justify-center">
              <Text className="text-sm font-bold text-text-on-primary">Settle</Text>
            </BrandedGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
