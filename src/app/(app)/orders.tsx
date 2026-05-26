import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { RefreshCw, X } from 'lucide-react-native';

import { OrderCard } from '@/components/orders/OrderCard';
import { BrandedGradient } from '@/components/pos/BrandedGradient';
import { colors } from '@/lib/pos/brand';
import type { OpenOrder } from '@/lib/pos/order-types';
import { formatOrderLabel } from '@/lib/pos/order-utils';
import {
  fetchOpenOrderById,
  getOpenOrders,
  type OpenOrderSummary,
} from '@/lib/pos/open-orders-service';
import { useOrdersStore } from '@/lib/pos/use-orders-store';

const TABLET_BREAKPOINT = 768;
const REFRESH_INTERVAL_MS = 10_000;

type OrderFilter = 'all' | 'dine_in' | 'takeaway' | 'delivery';

const FILTER_OPTIONS: { id: OrderFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dine_in', label: 'Dine In' },
  { id: 'takeaway', label: 'Takeaway' },
  { id: 'delivery', label: 'Delivery' },
];

type OpenOrderWithType = OpenOrder & {
  order_type?: string | null;
};

function getElapsedLabel(createdAt: string): string {
  const createdMs = new Date(createdAt).getTime();
  const minutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60_000));
  if (minutes < 1) {
    return 'Just now';
  }
  return `${minutes} min`;
}

function formatCreatedTime(createdAt: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(createdAt));
}

function matchesFilter(order: OpenOrder, filter: OrderFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  const orderType = (order as OpenOrderWithType).order_type;
  if (!orderType) {
    return true;
  }

  return orderType === filter;
}

function OrdersSkeleton({ count }: { count: number }) {
  const placeholders = Array.from({ length: count }, (_, index) => index);
  return (
    <View className="flex-row flex-wrap px-2 pt-2">
      {placeholders.map((key) => (
        <View key={key} className="m-2 h-52 min-w-[45%] flex-1 rounded-panel bg-border" />
      ))}
    </View>
  );
}

export default function OrdersScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const listColumns = isTablet ? 2 : 1;

  const selectOrder = useOrdersStore((state) => state.selectOrder);

  const [summaries, setSummaries] = useState<OpenOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<OrderFilter>('all');
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [viewingItems, setViewingItems] = useState<
    { name: string; qty: number }[]
  >([]);
  const [viewLoading, setViewLoading] = useState(false);

  const loadOpenOrders = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const result = await getOpenOrders();
    if (result.error) {
      setError(result.error);
      if (!silent) {
        setSummaries([]);
      }
    } else {
      setSummaries(result.data ?? []);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadOpenOrders();
    const intervalId = setInterval(() => {
      void loadOpenOrders(true);
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadOpenOrders]);

  const filteredSummaries = useMemo(
    () =>
      summaries.filter((summary) => matchesFilter(summary.order, activeFilter)),
    [summaries, activeFilter],
  );

  const handleRefresh = () => {
    void loadOpenOrders(true);
    void useOrdersStore.getState().loadOrders();
  };

  const handleResumeBilling = async (orderId: string) => {
    await selectOrder(orderId);
    router.push('/');
  };

  const handleViewOrder = async (summary: OpenOrderSummary) => {
    setViewingOrderId(summary.order.id);
    setViewLoading(true);
    setViewingItems([]);

    const result = await fetchOpenOrderById(summary.order.id);
    setViewLoading(false);

    if (result.error || !result.data) {
      setViewingItems(
        summary.previewItems.map((item) => ({
          name: item.name,
          qty: item.quantity,
        })),
      );
      return;
    }

    const productNameById = useOrdersStore.getState().productNameById;
    setViewingItems(
      result.data.items.map((item) => ({
        name: productNameById[item.product_id] ?? 'Item',
        qty: item.qty,
      })),
    );
  };

  const closeViewModal = () => {
    setViewingOrderId(null);
    setViewingItems([]);
  };

  const viewingSummary = summaries.find((entry) => entry.order.id === viewingOrderId);
  const viewingOrderIndex = summaries.findIndex((entry) => entry.order.id === viewingOrderId);

  if (isLoading) {
    return (
      <View className="flex-1 bg-surface-tint">
        <View className="border-b border-border-soft bg-surface-elevated px-5 py-5">
          <Text className="text-2xl font-bold text-text-primary">Open Orders</Text>
          <Text className="mt-1 text-sm text-text-secondary">Loading…</Text>
        </View>
        <OrdersSkeleton count={listColumns * 2} />
      </View>
    );
  }

  if (error && summaries.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tint px-6">
        <View className="w-full max-w-md rounded-panel border border-border-soft bg-surface-elevated p-8 shadow-panel">
          <Text className="text-center text-lg font-semibold text-text-primary">
            Unable to load open orders
          </Text>
          <Text className="mt-2 text-center text-sm text-text-secondary">{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadOpenOrders()}
            className="mt-6 min-h-[48px] overflow-hidden rounded-2xl"
          >
            <BrandedGradient variant="primary" className="min-h-[48px] items-center justify-center">
              <Text className="font-bold text-text-on-primary">Retry</Text>
            </BrandedGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-tint">
      <View className="border-b border-border-soft bg-surface-elevated px-5 py-4 shadow-card">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-2xl font-bold text-text-primary">Open Orders</Text>
            <Text className="mt-1 text-sm font-medium text-text-secondary">
              {filteredSummaries.length} Active{' '}
              {filteredSummaries.length === 1 ? 'Order' : 'Orders'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh open orders"
            onPress={handleRefresh}
            className="h-12 w-12 items-center justify-center rounded-2xl border border-border-soft bg-surface-tint"
          >
            {isRefreshing ? (
              <ActivityIndicator color={colors.primaryMid} size="small" />
            ) : (
              <RefreshCw color={colors.primaryMid} size={22} />
            )}
          </Pressable>
        </View>

        <FlatList
          horizontal
          data={FILTER_OPTIONS}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          className="mt-4"
          contentContainerStyle={{ gap: 10 }}
          renderItem={({ item }) => {
            const isActive = activeFilter === item.id;
            if (isActive) {
              return (
                <Pressable accessibilityRole="button" onPress={() => setActiveFilter(item.id)}>
                  <BrandedGradient
                    variant="primary"
                    className="min-h-[40px] items-center justify-center rounded-full px-5 py-2"
                  >
                    <Text className="text-sm font-bold text-text-on-primary">{item.label}</Text>
                  </BrandedGradient>
                </Pressable>
              );
            }
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => setActiveFilter(item.id)}
                className="min-h-[40px] items-center justify-center rounded-full border border-border-soft bg-surface-tint px-5 py-2"
              >
                <Text className="text-sm font-semibold text-text-secondary">{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {error ? (
        <View className="mx-4 mt-3 rounded-2xl border border-border-soft bg-accent-soft px-4 py-2">
          <Text className="text-center text-xs font-medium text-primary-deep">{error}</Text>
        </View>
      ) : null}

      {filteredSummaries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-full max-w-md rounded-panel border border-border-soft bg-surface-elevated p-10 shadow-panel">
            <Text className="text-center text-2xl font-bold text-text-primary">
              No active orders
            </Text>
            <Text className="mt-2 text-center text-base text-text-secondary">
              New orders will appear here
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={filteredSummaries}
          key={listColumns}
          numColumns={listColumns}
          keyExtractor={(item) => item.order.id}
          contentContainerStyle={{ padding: 8, paddingBottom: 24 }}
          renderItem={({ item, index }) => (
            <View className="flex-1">
              <OrderCard
                summary={item}
                orderIndex={index}
                elapsedLabel={getElapsedLabel(item.created_at)}
                createdTimeLabel={formatCreatedTime(item.created_at)}
                onViewOrder={() => void handleViewOrder(item)}
                onResumeBilling={() => void handleResumeBilling(item.order.id)}
              />
            </View>
          )}
        />
      )}

      <Modal
        visible={viewingOrderId !== null}
        animationType="slide"
        transparent
        onRequestClose={closeViewModal}
      >
        <View className="flex-1 justify-end bg-primary-deep/40">
          <View className="max-h-[80%] rounded-t-panel border-t border-border-soft bg-surface-elevated px-5 pb-8 pt-4">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-xl font-bold text-text-primary">
                {viewingSummary
                  ? (viewingSummary.order.status === 'draft' || viewingSummary.order.status === 'held' || viewingSummary.order.status === 'payment_pending'
                      ? (viewingSummary.order.status === 'held' ? 'Held Order' : 'Draft Order')
                      : formatOrderLabel(
                          viewingSummary.order.order_name,
                          `Order #${viewingOrderIndex + 1}`,
                        ))
                  : 'Order details'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={closeViewModal}
                className="h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-surface-tint"
              >
                <X color={colors.primaryDeep} size={20} />
              </Pressable>
            </View>

            {viewLoading ? (
              <ActivityIndicator color={colors.primaryMid} className="py-8" />
            ) : (
              <FlatList
                data={viewingItems}
                keyExtractor={(item, idx) => `${item.name}-${idx}`}
                renderItem={({ item }) => (
                  <View className="mb-2 flex-row justify-between rounded-2xl bg-surface-tint px-4 py-3">
                    <Text className="text-base font-medium text-text-primary">{item.name}</Text>
                    <Text className="text-base font-bold text-primary-mid">×{item.qty}</Text>
                  </View>
                )}
                ListEmptyComponent={
                  <Text className="py-6 text-center text-text-secondary">No items</Text>
                }
              />
            )}

            {viewingOrderId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  closeViewModal();
                  void handleResumeBilling(viewingOrderId);
                }}
                className="mt-4 min-h-[48px] overflow-hidden rounded-2xl"
              >
                <BrandedGradient
                  variant="primary"
                  className="min-h-[48px] items-center justify-center"
                >
                  <Text className="font-bold text-text-on-primary">Resume Billing</Text>
                </BrandedGradient>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
