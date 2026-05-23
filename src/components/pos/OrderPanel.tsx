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
    : 'New Order';

  const hasItems = items.length > 0;
  const ctaDisabled = !order || !hasItems || isMutating;

  return (
    <View className="flex-1 bg-surface-elevated">
      {/* Header — compact single row */}
      <View className="border-b border-border-soft px-4 py-2.5">
        <Text className="text-base font-bold text-text-primary">{orderTitle}</Text>
      </View>

      {/* Items list */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primaryMid} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-3 py-4">
              <View className="w-full rounded-xl border border-dashed border-border-soft bg-surface-tint px-4 py-8">
                <Text className="text-center text-sm text-text-secondary">
                  Add items from the menu
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center border-b border-border-soft px-3 py-2.5">
              {/* Name + unit price */}
              <View className="min-w-0 flex-1 pr-2">
                <Text className="text-sm font-semibold text-text-primary" numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text className="text-[11px] text-text-secondary">
                  {formatCurrency(item.price)} each
                </Text>
              </View>

              {/* Qty controls */}
              <View className="flex-row items-center rounded-lg bg-surface-tint">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  disabled={isMutating}
                  onPress={() => onDecrementItem(item.id)}
                  className="h-7 w-7 items-center justify-center"
                >
                  <Minus color={colors.primaryDeep} size={14} />
                </Pressable>
                <Text className="mx-2 min-w-[20px] text-center text-sm font-bold text-text-primary">
                  {item.qty}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  disabled={isMutating}
                  onPress={() => onIncrementItem(item.id)}
                  className="h-7 w-7 items-center justify-center"
                >
                  <Plus color={colors.primaryDeep} size={14} />
                </Pressable>
              </View>

              {/* Line total */}
              <Text className="ml-3 min-w-[60px] text-right text-sm font-bold text-primary-mid">
                {formatCurrency(item.qty * item.price)}
              </Text>

              {/* Remove */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove item"
                disabled={isMutating}
                onPress={() => onRemoveItem(item.id)}
                className="ml-2 h-6 w-6 items-center justify-center"
              >
                <Trash2 color={colors.textSecondary} size={14} />
              </Pressable>
            </View>
          )}
        />
      )}

      {/* Totals + CTAs */}
      <View className="border-t border-border-soft bg-surface-tint px-4 py-3">
        <View className="flex-row justify-between py-1">
          <Text className="text-xs text-text-secondary">Subtotal</Text>
          <Text className="text-sm font-semibold text-text-primary">
            {formatCurrency(subtotal)}
          </Text>
        </View>
        <View className="flex-row justify-between py-1">
          <Text className="text-xs text-text-secondary">Tax (5%)</Text>
          <Text className="text-sm font-semibold text-text-primary">
            {formatCurrency(tax)}
          </Text>
        </View>
        <View className="mt-1.5 flex-row items-end justify-between border-t border-border-soft pt-2">
          <Text className="text-sm font-bold text-text-primary">Total</Text>
          <Text className="text-2xl font-bold text-primary-mid">
            {formatCurrency(total)}
          </Text>
        </View>

        <View className="mt-3 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={ctaDisabled}
            onPress={onSendKot}
            className="min-h-[44px] flex-1 items-center justify-center rounded-xl border-2 border-primary-mid bg-surface-elevated"
          >
            <Text className="text-xs font-bold text-primary-mid">Send KOT</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={ctaDisabled}
            onPress={onSettle}
            className="min-h-[44px] flex-[1.6] overflow-hidden rounded-xl"
          >
            <BrandedGradient variant="primary" className="min-h-[44px] items-center justify-center">
              <Text className="text-sm font-bold text-text-on-primary">Settle</Text>
            </BrandedGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
