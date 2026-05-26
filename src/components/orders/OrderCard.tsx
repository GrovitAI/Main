import { Pressable, Text, View } from 'react-native';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import type { OpenOrderSummary } from '@/lib/pos/open-orders-service';
import { formatOrderLabel } from '@/lib/pos/order-utils';

type OrderCardProps = {
  summary: OpenOrderSummary;
  orderIndex: number;
  elapsedLabel: string;
  createdTimeLabel: string;
  onViewOrder: () => void;
  onResumeBilling: () => void;
};

export function OrderCard({
  summary,
  orderIndex,
  elapsedLabel,
  createdTimeLabel,
  onViewOrder,
  onResumeBilling,
}: OrderCardProps) {
  const isTemp = summary.order.status === 'draft' || summary.order.status === 'held' || summary.order.status === 'payment_pending';
  const orderName = isTemp
    ? (summary.order.status === 'held' ? 'Held Order' : 'Draft Order')
    : formatOrderLabel(
        summary.order.order_name,
        `Order #${orderIndex + 1}`,
      );

  return (
    <View className="m-2 flex-1 rounded-panel border border-border-soft bg-surface-elevated p-4 shadow-card">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center flex-wrap gap-2">
            <Text className="text-lg font-bold text-text-primary">{orderName}</Text>
            {summary.order.status === 'held' && (
              <View className="rounded bg-amber-100 border border-amber-200 px-1.5 py-0.5">
                <Text className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">HELD</Text>
              </View>
            )}
          </View>
          <Text className="mt-1 text-sm text-text-secondary">{createdTimeLabel}</Text>
        </View>
        <View className="rounded-full bg-accent-soft px-3 py-1">
          <Text className="text-xs font-bold text-primary-deep">{elapsedLabel}</Text>
        </View>
      </View>

      <View className="mt-4 rounded-2xl bg-surface-tint px-3 py-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'}
        </Text>
        {summary.previewItems.length === 0 ? (
          <Text className="mt-2 text-sm text-text-secondary">No items yet</Text>
        ) : (
          <View className="mt-2">
            {summary.previewItems.map((item, index) => (
              <Text
                key={`${item.name}-${index}`}
                className="mt-1 text-sm font-medium text-text-primary"
              >
                {item.name} ×{item.quantity}
              </Text>
            ))}
            {summary.remainingItemLines > 0 ? (
              <Text className="mt-1 text-sm font-semibold text-primary-mid">
                +{summary.remainingItemLines} more
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View className="mt-4 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          onPress={onViewOrder}
          className="min-h-[44px] flex-1 items-center justify-center rounded-2xl border-2 border-primary-mid bg-surface-elevated"
        >
          <Text className="text-sm font-bold text-primary-mid">View Order</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onResumeBilling}
          className="min-h-[44px] flex-1 overflow-hidden rounded-2xl"
        >
          <BrandedGradient variant="primary" className="min-h-[44px] items-center justify-center">
            <Text className="text-sm font-bold text-text-on-primary">Resume Billing</Text>
          </BrandedGradient>
        </Pressable>
      </View>
    </View>
  );
}
