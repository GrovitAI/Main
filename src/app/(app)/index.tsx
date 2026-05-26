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
import { Search, Plus } from 'lucide-react-native';

import { CategoryTabs } from '@/components/pos/CategoryTabs';
import { Sidebar } from '@/components/pos/Sidebar';
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
    resetCart,
    clearError,
  } = useOrdersStore();

  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [settlementVisible, setSettlementVisible] = useState(false);

  const [timeStr, setTimeStr] = useState('11:42 AM');
  const [dateStr, setDateStr] = useState('20 May 2025');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      setTimeStr(`${hours}:${minutes} ${ampm}`);

      const day = now.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      setDateStr(`${day} ${month} ${year}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

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
      <View className="flex-row items-center" style={{ marginBottom: 12, gap: 8 }}>
        <View style={{ height: 50, borderRadius: 16, paddingHorizontal: 16, backgroundColor: '#FFFFFF', shadowColor: '#0D264C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 1 }} className="flex-1 flex-row items-center">
          <Search color="#9BA8BA" size={16} style={{ opacity: 0.6 }} />
          <TextInput
            placeholder="Search items..."
            placeholderTextColor="#9BA8BA"
            style={{ fontSize: 13, fontWeight: '500', marginLeft: 8, flex: 1, color: '#111', outlineStyle: 'none' as any }}
            editable={false} // Logic placeholder
          />
        </View>
        <View style={{ height: 50, minWidth: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 14, backgroundColor: '#FFFFFF', shadowColor: '#0D264C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>All Items</Text>
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
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ paddingBottom: 10, gap: 12 }}
          renderItem={({ item }) => (
            <View className="flex-1" style={{ maxWidth: isTablet ? '25%' : '50%' }}>
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
      onResetCart={() => void resetCart()}
    />
  );

  return (
    <View className="flex-1 flex-row" style={{ backgroundColor: '#F5F8FC' }}>
      {/* ─── LEFT: Category rail (Full Height) ─── */}
      {isTablet && (
        <Sidebar
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
        />
      )}

      {/* ─── MAIN CONTENT ─── */}
      <View className="flex-1 flex-col" style={{ paddingVertical: 12, paddingRight: 12, paddingLeft: 12, gap: 12 }}>
        {/* ─── Header: Time/Cashier Section + New Order ─── */}
        {isTablet && (
          <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {/* + New Order Button */}
              <Pressable
                onPress={() => void createOrder()}
                style={({ pressed }) => [
                  {
                    height: 34,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: '#013b8c',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    shadowColor: '#013b8c',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.12,
                    shadowRadius: 6,
                    elevation: 2,
                  },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
                ]}
              >
                <Plus color="#FFFFFF" size={14} strokeWidth={2.5} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>New Order</Text>
              </Pressable>

              {/* Subtle Divider */}
              <View style={{ width: 1, height: 20, backgroundColor: '#E2E8F0' }} />

              {/* Clock Area */}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0D2F67' }}>{timeStr}</Text>
                <Text style={{ fontSize: 9, fontWeight: '500', color: '#6B7280', marginTop: 1 }}>{dateStr}</Text>
              </View>
              
              {/* Subtle Divider */}
              <View style={{ width: 1, height: 22, backgroundColor: '#E2E8F0' }} />
              
              {/* Cashier Area */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#0A67C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>AM</Text>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D2F67' }}>Cashier</Text>
                  <Text style={{ fontSize: 8, fontWeight: '500', color: '#10b981' }}>Active</Text>
                </View>
              </View>
            </View>
          </View>
        )}

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
          <View className="min-h-0 flex-1 flex-row" style={{ gap: 12 }}>
            {/* CENTER: Product grid */}
            <View className="min-h-0 flex-1 overflow-hidden" style={{ paddingHorizontal: 4 }}>
              {productGrid}
            </View>

            {/* RIGHT: Billing panel */}
            <View className="min-h-0 overflow-hidden" style={{ width: 390 }}>
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
