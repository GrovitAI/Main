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
    const activeOnly = allProducts.filter((product) => product.is_active !== false);
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
    void loadOrders();
    void loadCatalog();
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
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-3 text-sm text-text-secondary">Loading POS…</Text>
      </View>
    );
  }

  if ((ordersError || catalogError) && orders.length === 0 && allProducts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-center text-base text-text-primary">
          {ordersError ?? catalogError ?? 'Something went wrong.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          className="mt-4 min-h-[44px] items-center justify-center rounded-xl bg-primary px-6"
        >
          <Text className="font-semibold text-white">Try again</Text>
        </Pressable>
      </View>
    );
  }

  const catalogSection = (
    <View className="flex-1 min-h-0">
      <CategoryTabs
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
      />

      {catalogLoading ? (
        <View className="flex-1 items-center justify-center py-8">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : catalogError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-text-secondary">{catalogError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadCatalog()}
            className="mt-3 min-h-[44px] items-center justify-center rounded-xl border border-primary px-4"
          >
            <Text className="font-semibold text-primary">Retry catalog</Text>
          </Pressable>
        </View>
      ) : visibleProducts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-text-secondary">
            No products found. Add products in Settings.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleProducts}
          key={productColumns}
          numColumns={productColumns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 8, paddingBottom: 16 }}
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
    <View className="flex-1 bg-background">
      <OpenOrdersStrip
        orders={orders}
        activeOrderId={activeOrderId}
        itemCountByOrderId={itemCountByOrderId}
        isLoading={isLoadingOrders}
        onSelectOrder={(orderId) => void selectOrder(orderId)}
        onCreateOrder={() => void createOrder()}
      />

      {(ordersError || catalogError) && (
        <View className="border-b border-border bg-accent/30 px-4 py-2">
          <Text className="text-center text-xs text-text-primary">
            {ordersError ?? catalogError}
          </Text>
        </View>
      )}

      {isTablet ? (
        <View className="min-h-0 flex-1 flex-row">
          <View className="min-h-0 flex-1 border-r border-border">{catalogSection}</View>
          <View className="w-[380px] min-h-0">{orderPanel}</View>
        </View>
      ) : (
        <View className="min-h-0 flex-1">
          <View className="min-h-0 flex-[0.58]">{catalogSection}</View>
          <View className="min-h-[280px] max-h-[42%] border-t border-border">
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
