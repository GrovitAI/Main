import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Search } from 'lucide-react-native';

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
  const productColumns = isTablet ? 4 : 2;

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

  // ─── Loading state ───
  if (isInitialLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tint">
        <ActivityIndicator size="large" color={colors.primaryMid} />
        <Text className="mt-4 text-base font-medium text-text-secondary">Loading POS…</Text>
      </View>
    );
  }

  // ─── Error state ───
  if ((ordersError || catalogError) && orders.length === 0 && allProducts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-tint px-6">
        <View className="w-full max-w-md rounded-xl border border-border-soft bg-surface-elevated p-8 shadow-panel">
          <Text className="text-center text-lg font-semibold text-text-primary">
            {ordersError ?? catalogError ?? 'Something went wrong.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleRetry}
            className="mt-6 min-h-[48px] items-center justify-center overflow-hidden rounded-xl bg-primary-mid px-6"
          >
            <Text className="font-bold text-text-on-primary">Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Product grid (used in both layouts) ───
  const productGrid = (
    <View className="min-h-0 flex-1">
      {/* Search Bar Area */}
      <View className="mb-3 flex-row items-center gap-2">
        <View className="h-[38px] flex-1 flex-row items-center rounded-xl border border-border-soft bg-surface-elevated px-3 shadow-sm">
          <Search color={colors.textSecondary} size={16} />
          <TextInput
            placeholder="Search items..."
            placeholderTextColor={colors.textSecondary}
            className="ml-2 flex-1 text-[13px] text-text-primary outline-none"
            editable={false} // Logic placeholder
          />
        </View>
        <View className="h-[38px] min-w-[90px] items-center justify-center rounded-xl border border-border-soft bg-surface-elevated px-3 shadow-sm">
          <Text className="text-[13px] font-medium text-text-primary">All Items</Text>
        </View>
      </View>

      {catalogLoading ? (
        <View className="flex-1 items-center justify-center py-10">
          <ActivityIndicator color={colors.primaryMid} size="large" />
        </View>
      ) : catalogError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-text-secondary">{catalogError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadCatalog()}
            className="mt-4 min-h-[44px] items-center justify-center rounded-xl border-2 border-primary-mid px-5"
          >
            <Text className="text-xs font-bold text-primary-mid">Retry catalog</Text>
          </Pressable>
        </View>
      ) : visibleProducts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="rounded-xl border border-dashed border-border-soft bg-surface-elevated px-6 py-8">
            <Text className="text-center text-sm text-text-secondary">
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
          contentContainerStyle={{ paddingBottom: 16 }}
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

  // ─── Order panel (used in both layouts) ───
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
    <View className="flex-1 flex-row bg-surface-tint">
      {/* ─── LEFT: Category rail (Full Height) ─── */}
      {isTablet && (
        <View className="w-[140px]">
          <CategoryTabs
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            vertical
          />
        </View>
      )}

      {/* ─── MAIN CONTENT ─── */}
      <View className="flex-1 flex-col">
        {/* ─── Order strip ─── */}
        <View className="bg-surface-elevated px-3 py-1.5 border-b border-border-soft">
          <OpenOrdersStrip
            orders={orders}
            activeOrderId={activeOrderId}
            itemCountByOrderId={itemCountByOrderId}
            isLoading={isLoadingOrders}
            onSelectOrder={(orderId) => void selectOrder(orderId)}
            onCreateOrder={() => void createOrder()}
          />
        </View>

      {/* ─── Inline error bar ─── */}
      {(ordersError || catalogError) ? (
        <View className="mx-2 mb-1 rounded-lg border border-border-soft bg-accent-soft px-3 py-1.5">
          <Text className="text-center text-[11px] font-medium text-primary-deep">
            {ordersError ?? catalogError}
          </Text>
        </View>
      ) : null}

        {/* ─── Main workspace ─── */}
        {isTablet ? (
          /* ═══ TABLET: Product Grid & Billing Panel ═══ */
          <View className="min-h-0 flex-1 flex-row gap-3 px-3 pb-3 pt-3">
            {/* CENTER: Product grid */}
            <View className="min-h-0 flex-1 overflow-hidden">
              {productGrid}
            </View>

            {/* RIGHT: Billing panel */}
            <View className="w-[320px] min-h-0 overflow-hidden rounded-xl bg-surface-elevated shadow-panel border border-border-soft">
              {orderPanel}
            </View>
          </View>
        ) : (
          /* ═══ MOBILE: Stacked layout ═══ */
          <View className="min-h-0 flex-1 px-2 pb-2">
            {/* Horizontal category tabs */}
            <CategoryTabs
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />

            {/* Product grid */}
            <View className="min-h-0 flex-[0.56] overflow-hidden rounded-xl border border-border-soft bg-surface-tint shadow-card">
              {productGrid}
            </View>

            {/* Billing panel */}
            <View className="mt-2 min-h-[280px] max-h-[44%] overflow-hidden rounded-xl border border-border-soft bg-surface-elevated shadow-panel">
              {orderPanel}
            </View>
          </View>
        )}
      </View>

      <SettlementModal
        visible={settlementVisible}
        total={orderTotal}
        onClose={() => setSettlementVisible(false)}
      />
    </View>
  );
}
