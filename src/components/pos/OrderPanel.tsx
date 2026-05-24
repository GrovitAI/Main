import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Minus, MoreHorizontal, Plus, Trash2 } from 'lucide-react-native';

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
      {/* Header — matching reference image exactly */}
      <View className="border-b border-border-soft px-4 py-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-text-primary">{orderTitle}</Text>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-tint">
            <MoreHorizontal color={colors.textSecondary} size={16} />
          </View>
        </View>
        <View className="mt-1.5 flex-row items-center justify-between">
          <View className="rounded-full bg-primary-light/10 px-2.5 py-0.5">
            <Text className="text-[10px] font-bold text-primary-mid">Dine In</Text>
          </View>
          <Text className="text-[11px] text-text-secondary">{items.length} items</Text>
        </View>
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
            <View className="flex-1 items-center justify-center px-4">
              <View className="w-full rounded-xl border border-dashed border-border-soft bg-surface-tint px-4 py-10">
                <Text className="text-center text-sm text-text-secondary">
                  Add items from the menu
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center justify-between border-b border-border-soft px-3 py-2.5">
              {/* Name + unit price */}
              <View className="min-w-0 flex-[1.2] pr-2">
                <Text className="text-[12px] font-bold text-text-primary" numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text className="mt-0.5 text-[10px] font-medium text-text-secondary">
                  {formatCurrency(item.price)} each
                </Text>
              </View>

              {/* Qty controls - exactly like reference [-] 1 [+] with borders */}
              <View className="flex-row items-center rounded-lg border border-border-soft bg-surface-elevated">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  disabled={isMutating}
                  onPress={() => onDecrementItem(item.id)}
                  className="h-7 w-7 items-center justify-center border-r border-border-soft"
                >
                  <Minus color={colors.textSecondary} size={14} />
                </Pressable>
                <Text className="w-6 text-center text-[13px] font-bold text-text-primary">
                  {item.qty}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  disabled={isMutating}
                  onPress={() => onIncrementItem(item.id)}
                  className="h-7 w-7 items-center justify-center border-l border-border-soft"
                >
                  <Plus color={colors.textSecondary} size={14} />
                </Pressable>
              </View>

              {/* Line total */}
              <Text className="ml-3 min-w-[50px] text-right text-[12px] font-bold text-text-primary">
                {formatCurrency(item.qty * item.price)}
              </Text>

              {/* Remove */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove item"
                disabled={isMutating}
                onPress={() => onRemoveItem(item.id)}
                className="ml-2 h-7 w-7 items-center justify-center"
              >
                <Trash2 color="#ef4444" size={14} />
              </Pressable>
            </View>
          )}
        />
      )}

      {/* Totals + CTAs */}
      <View className="border-t border-border-soft bg-surface-elevated px-4 py-3">
        <View className="flex-row justify-between py-1">
          <Text className="text-[12px] font-medium text-text-secondary">Subtotal</Text>
          <Text className="text-[12px] font-bold text-text-primary">
            {formatCurrency(subtotal)}
          </Text>
        </View>
        <View className="flex-row justify-between py-1">
          <Text className="text-[12px] font-medium text-text-secondary">Tax (5%)</Text>
          <Text className="text-[12px] font-bold text-text-primary">
            {formatCurrency(tax)}
          </Text>
        </View>
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-[13px] font-bold tracking-widest text-text-primary uppercase">Total</Text>
          <Text className="text-2xl font-bold text-primary-mid">
            {formatCurrency(total)}
          </Text>
        </View>

        <View className="mt-4 flex-row gap-2.5">
          <Pressable
            accessibilityRole="button"
            disabled={ctaDisabled}
            onPress={onSendKot}
            className="h-[40px] flex-[1] items-center justify-center rounded-xl border border-primary-mid bg-surface-elevated"
          >
            <View className="flex-row items-center">
              <Text className="text-[12px] font-bold text-primary-mid">Send KOT</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={ctaDisabled}
            onPress={onSettle}
            className="h-[40px] flex-[1.5] overflow-hidden rounded-xl"
          >
            <BrandedGradient variant="primary" className="h-full w-full flex-row items-center justify-center">
              <Text className="text-[14px] font-bold text-text-on-primary">Settle</Text>
            </BrandedGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
