import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Minus, Plus, Trash2 } from 'lucide-react-native';

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
    ? formatOrderLabel(order.table_label, `Order #${orderIndex + 1}`)
    : 'No active order';

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-lg font-bold text-text-primary">{orderTitle}</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          className="flex-1 px-3"
          contentContainerStyle={{ paddingVertical: 8, flexGrow: 1 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-10">
              <Text className="text-center text-sm text-text-secondary">
                Add items from the menu
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="mb-2 rounded-2xl border border-border bg-background p-3">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-base font-semibold text-text-primary">
                    {item.product_name}
                  </Text>
                  <Text className="mt-1 text-sm text-text-secondary">
                    {formatCurrency(item.unit_price)} each
                  </Text>
                </View>
                <Text className="text-base font-semibold text-text-primary">
                  {formatCurrency(item.quantity * item.unit_price)}
                </Text>
              </View>

              <View className="mt-3 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decrease quantity"
                    disabled={isMutating}
                    onPress={() => onDecrementItem(item.id)}
                    className="h-11 w-11 items-center justify-center rounded-xl border border-border"
                  >
                    <Minus color={colors.textPrimary} size={18} />
                  </Pressable>
                  <Text className="mx-3 min-w-[24px] text-center text-base font-semibold text-text-primary">
                    {item.quantity}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Increase quantity"
                    disabled={isMutating}
                    onPress={() => onIncrementItem(item.id)}
                    className="h-11 w-11 items-center justify-center rounded-xl border border-border"
                  >
                    <Plus color={colors.textPrimary} size={18} />
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove item"
                  disabled={isMutating}
                  onPress={() => onRemoveItem(item.id)}
                  className="h-11 w-11 items-center justify-center rounded-xl border border-border"
                >
                  <Trash2 color={colors.primary} size={18} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <View className="border-t border-border px-4 py-3">
        <View className="flex-row justify-between py-1">
          <Text className="text-sm text-text-secondary">Subtotal</Text>
          <Text className="text-sm font-medium text-text-primary">
            {formatCurrency(subtotal)}
          </Text>
        </View>
        <View className="flex-row justify-between py-1">
          <Text className="text-sm text-text-secondary">Tax (5%)</Text>
          <Text className="text-sm font-medium text-text-primary">
            {formatCurrency(tax)}
          </Text>
        </View>
        <View className="mt-1 flex-row justify-between border-t border-border pt-2">
          <Text className="text-base font-bold text-text-primary">Total</Text>
          <Text className="text-base font-bold text-primary">
            {formatCurrency(total)}
          </Text>
        </View>

        <View className="mt-3 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={!order || items.length === 0 || isMutating}
            onPress={onSendKot}
            className="min-h-[44px] flex-1 items-center justify-center rounded-xl border border-primary bg-background"
          >
            <Text className="text-sm font-semibold text-primary">Send KOT</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!order || items.length === 0 || isMutating}
            onPress={onSettle}
            className="min-h-[44px] flex-1 items-center justify-center rounded-xl bg-primary"
          >
            <Text className="text-sm font-semibold text-white">Settle</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
