import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { CategoryTabs } from '@/components/pos/CategoryTabs';
import { OpenOrdersStrip } from '@/components/pos/OpenOrdersStrip';
import { OrderPanel } from '@/components/pos/OrderPanel';
import { ProductCard } from '@/components/pos/ProductCard';
import { SettlementModal } from '@/components/pos/SettlementModal';
import { colors } from '@/lib/pos/brand';
import {
  calculateOrderSubtotal,
  calculateOrderTotal,
  TAX_RATE,
} from '@/lib/pos/order-utils';
import {
  getCategories,
  getProducts,
  type Category,
  type Product,
} from '@/lib/pos/products-service';
import { useOrdersStore } from '@/lib/pos/use-orders-store';
import { seedDevDatabase } from '@/lib/pos/dev-seed';

const TABLET_BREAKPOINT = 768;

export default function PosBillingScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const productColumns = isTablet ? 3 : 2;

  const {
    orders,
    activeOrderId,
    activeOrderItems,
    itemCountByOrderId,
    isLoadingOrders,
    isLoadingActiveOrder,
    isMutating,
    error: ordersError,
    loadOrders,
    setProductCatalog,
    selectOrder,
    createOrder,
    addProductToActiveOrder,
    incrementItem,
    decrementItem,
    removeItem,
    clearError,
  } = useOrdersStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [settlementVisible, setSettlementVisible] = useState(false);

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === activeOrderId) ?? null,
    [orders, activeOrderId],
  );

  const activeOrderIndex = useMemo(
    () => orders.findIndex((order) => order.id === activeOrderId),
    [orders, activeOrderId],
  );

  const visibleProducts = useMemo(() => {
    const activeOnly = allProducts.filter((product) => product.is_available !== false);
    if (!selectedCategoryId) {
      return activeOnly;
    }
    return activeOnly.filter((product) => product.category_id === selectedCategoryId);
  }, [allProducts, selectedCategoryId]);

  const orderTotal = useMemo(() => {
    const subtotal = calculateOrderSubtotal(activeOrderItems);
    return calculateOrderTotal(subtotal, TAX_RATE);
  }, [activeOrderItems]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);

    const [categoriesResult, productsResult] = await Promise.all([
      getCategories(),
      getProducts(),
    ]);

    if (categoriesResult.error) {
      setCatalogError(categoriesResult.error);
    } else {
      setCategories(categoriesResult.data ?? []);
    }

    if (productsResult.error) {
      setCatalogError(productsResult.error);
    } else {
      const products = productsResult.data ?? [];
      setAllProducts(products);
      setProductCatalog(products);
    }

    setCatalogLoading(false);
  }, [setProductCatalog]);

  useEffect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[Grovit] Running DEV seed');
      void (async () => {
        await seedDevDatabase();
        void loadOrders();
        void loadCatalog();
      })();
    } else {
      void loadOrders();
      void loadCatalog();
    }
  }, [loadOrders, loadCatalog]);

  const handleRetry = () => {
    clearError();
    setCatalogError(null);
    void loadOrders();
    void loadCatalog();
  };

  const isInitialLoading =
    (isLoadingOrders && orders.length === 0) || (catalogLoading && allProducts.length === 0);

  if (isInitialLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tint">
        <ActivityIndicator size="large" color={colors.primaryMid} />
        <Text className="mt-4 text-base font-medium text-text-secondary">Loading POS…</Text>
      </View>
    );
  }

  if ((ordersError || catalogError) && orders.length === 0 && allProducts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tint px-6">
        <View className="w-full max-w-md rounded-panel border border-border-soft bg-surface-elevated p-8 shadow-panel">
          <Text className="text-center text-lg font-semibold text-text-primary">
            {ordersError ?? catalogError ?? 'Something went wrong.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleRetry}
            className="mt-6 min-h-[48px] items-center justify-center overflow-hidden rounded-2xl bg-primary-mid px-6"
          >
            <Text className="font-bold text-text-on-primary">Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const catalogSection = (
    <View className="min-h-0 flex-1">
      <CategoryTabs
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
      />

      {catalogLoading ? (
        <View className="flex-1 items-center justify-center py-10">
          <ActivityIndicator color={colors.primaryMid} size="large" />
        </View>
      ) : catalogError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-base text-text-secondary">{catalogError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadCatalog()}
            className="mt-4 min-h-[48px] items-center justify-center rounded-2xl border-2 border-primary-mid px-5"
          >
            <Text className="font-bold text-primary-mid">Retry catalog</Text>
          </Pressable>
        </View>
      ) : visibleProducts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="rounded-2xl border border-dashed border-border-soft bg-surface-elevated px-6 py-8">
            <Text className="text-center text-base text-text-secondary">
              No products found. Add products in Settings.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={visibleProducts}
          key={productColumns}
          numColumns={productColumns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <View className="flex-1">
              <ProductCard
                product={item}
                disabled={isMutating}
                onAdd={(product) => void addProductToActiveOrder(product)}
              />
            </View>
          )}
        />
      )}
    </View>
  );

  const orderPanel = (
    <OrderPanel
      order={activeOrder}
      items={activeOrderItems}
      orderIndex={activeOrderIndex >= 0 ? activeOrderIndex : 0}
      isLoading={isLoadingActiveOrder}
      isMutating={isMutating}
      onIncrementItem={(itemId) => void incrementItem(itemId)}
      onDecrementItem={(itemId) => void decrementItem(itemId)}
      onRemoveItem={(itemId) => void removeItem(itemId)}
      onSendKot={() => undefined}
      onSettle={() => setSettlementVisible(true)}
    />
  );

  return (
    <View className="flex-1 bg-surface-tint">
      <View className="px-3 pb-2 pt-3 md:px-5 md:pt-4">
        <OpenOrdersStrip
          orders={orders}
          activeOrderId={activeOrderId}
          itemCountByOrderId={itemCountByOrderId}
          isLoading={isLoadingOrders}
          onSelectOrder={(orderId) => void selectOrder(orderId)}
          onCreateOrder={() => void createOrder()}
        />
      </View>

      {(ordersError || catalogError) && (
        <View className="mx-4 mb-2 rounded-2xl border border-border-soft bg-accent-soft px-4 py-2">
          <Text className="text-center text-xs font-medium text-primary-deep">
            {ordersError ?? catalogError}
          </Text>
        </View>
      )}

      {isTablet ? (
        <View className="min-h-0 flex-1 flex-row gap-4 px-4 pb-4 md:px-5">
          <View className="min-h-0 flex-1 overflow-hidden rounded-panel border border-border-soft bg-surface-tint shadow-panel">
            {catalogSection}
          </View>
          <View className="h-full w-[400px] min-h-0 overflow-hidden rounded-panel border border-border-soft bg-surface-elevated shadow-panel">
            {orderPanel}
          </View>
        </View>
      ) : (
        <View className="min-h-0 flex-1 px-3 pb-3">
          <View className="min-h-0 flex-[0.56] overflow-hidden rounded-panel border border-border-soft bg-surface-tint shadow-card">
            {catalogSection}
          </View>
          <View className="mt-3 min-h-[300px] max-h-[44%] overflow-hidden rounded-panel border border-border-soft bg-surface-elevated shadow-panel">
            {orderPanel}
          </View>
        </View>
      )}

      <SettlementModal
        visible={settlementVisible}
        total={orderTotal}
        onClose={() => setSettlementVisible(false)}
      />
    </View>
  );
}
