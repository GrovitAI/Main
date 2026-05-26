import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { RefreshCw, Search, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  OrderCard,
  getBillIdentifier,
  getStatusConfig,
  getElapsedLabel,
} from '@/components/orders/OrderCard';
import { colors } from '@/lib/pos/brand';
import type { OrderStatus } from '@/lib/pos/order-types';
import {
  fetchOpenOrderById,
  getAllOrders,
  settleOrderById,
  type OpenOrderSummary,
} from '@/lib/pos/open-orders-service';
import { useOrdersStore } from '@/lib/pos/use-orders-store';
import { SettlementModal } from '@/components/pos/SettlementModal';
import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { logSupabaseError } from '@/lib/pos/supabase-debug';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLET_BREAKPOINT = 768;
const REFRESH_INTERVAL_MS = 10_000;
const SEARCH_DEBOUNCE_MS = 200;

// ─── Filter types ─────────────────────────────────────────────────────────────

type OrderFilter = 'active' | 'held' | 'unpaid' | 'paid' | 'cancelled' | 'all';


const EDITABLE_STATUSES: OrderStatus[] = ['draft', 'open', 'held', 'unpaid', 'in_kitchen', 'payment_pending'];
const ACTIVE_STATUSES: OrderStatus[] = ['draft', 'open', 'held', 'unpaid', 'in_kitchen', 'payment_pending'];

function matchesFilter(status: OrderStatus, filter: OrderFilter): boolean {
  switch (filter) {
    case 'active':    return ACTIVE_STATUSES.includes(status);
    case 'held':      return status === 'held';
    case 'unpaid':    return status === 'unpaid' || status === 'payment_pending' || status === 'in_kitchen';
    case 'paid':      return status === 'paid' || status === 'completed';
    case 'cancelled': return status === 'cancelled';
    case 'all':       return true;
  }
}

function matchesSearch(summary: OpenOrderSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const { order, previewItems } = summary;

  if (order.id.toLowerCase().includes(q)) return true;
  if (order.bill_number && String(order.bill_number).toLowerCase().includes(q)) return true;
  if (order.kot_number && String(order.kot_number).toLowerCase().includes(q)) return true;
  if (order.token_number && String(order.token_number).toLowerCase().includes(q)) return true;
  if (order.order_name && order.order_name.toLowerCase().includes(q)) return true;
  if (previewItems.some((item) => item.name.toLowerCase().includes(q))) return true;
  return false;
}

// ─── KPI counts ───────────────────────────────────────────────────────────────

type KpiCounts = {
  active: number;
  unpaid: number;
  held: number;
  paid: number;
  cancelled: number;
  all: number;
};

function computeKpi(summaries: OpenOrderSummary[]): KpiCounts {
  let active = 0, unpaid = 0, held = 0, paid = 0, cancelled = 0;
  for (const s of summaries) {
    const st = s.order.status;
    if (ACTIVE_STATUSES.includes(st)) active++;
    if (st === 'unpaid' || st === 'payment_pending' || st === 'in_kitchen') unpaid++;
    if (st === 'held') held++;
    if (st === 'paid' || st === 'completed') paid++;
    if (st === 'cancelled') cancelled++;
  }
  return { active, unpaid, held, paid, cancelled, all: summaries.length };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function OrdersSkeleton({ count }: { count: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 6 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            margin: 6,
            flex: 1,
            minWidth: '44%',
            height: 160,
            borderRadius: 16,
            backgroundColor: '#EEF2F7',
          }}
        />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const { width } = useWindowDimensions();
  const listColumns = useMemo(() => {
    if (width >= 1200) return 4;
    if (width >= 992) return 3;
    if (width >= 768) return 2;
    return 1;
  }, [width]);

  const selectOrder = useOrdersStore((state) => state.selectOrder);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [summaries, setSummaries] = useState<OpenOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<OrderFilter>('active');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Detail modal state ──────────────────────────────────────────────────────
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [viewingItems, setViewingItems] = useState<{ name: string; qty: number }[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  // ── Settlement state ────────────────────────────────────────────────────────
  const [settlingOrder, setSettlingOrder] = useState<OpenOrderSummary | null>(null);
  const [isSettlingMutating, setIsSettlingMutating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    const result = await getAllOrders();
    if (result.error) {
      setError(result.error);
      if (!silent) setSummaries([]);
    } else {
      setSummaries(result.data ?? []);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void loadOrders();
    const id = setInterval(() => void loadOrders(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadOrders]);

  // ── Search debounce ──────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchInputValue(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(text);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInputValue('');
    setSearchQuery('');
  }, []);

  // ── KPI counts ───────────────────────────────────────────────────────────────
  const kpi = useMemo(() => computeKpi(summaries), [summaries]);

  // ── Dynamic header subtext ───────────────────────────────────────────────────
  const headerSubtext = useMemo(() => {
    const parts: string[] = [];
    if (kpi.active > 0) parts.push(`${kpi.active} active`);
    if (kpi.unpaid > 0) parts.push(`${kpi.unpaid} unpaid`);
    if (kpi.held > 0) parts.push(`${kpi.held} held`);
    return parts.length > 0 ? parts.join(' • ') : 'No active orders';
  }, [kpi]);

  // ── Filtered + searched results ──────────────────────────────────────────────
  const filteredSummaries = useMemo(
    () => summaries.filter((s) => matchesFilter(s.order.status, activeFilter)),
    [summaries, activeFilter],
  );

  const displayedSummaries = useMemo(
    () => filteredSummaries.filter((s) => matchesSearch(s, searchQuery)),
    [filteredSummaries, searchQuery],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    void loadOrders(true);
    void useOrdersStore.getState().loadOrders();
  }, [loadOrders]);

  const handleOpenBill = useCallback(async (orderId: string) => {
    const success = await selectOrder(orderId);
    if (success) {
      router.push('/');
    }
  }, [selectOrder]);

  const handleViewOrder = useCallback(async (summary: OpenOrderSummary) => {
    setViewingOrderId(summary.order.id);
    setViewLoading(true);
    setViewingItems([]);

    const result = await fetchOpenOrderById(summary.order.id);
    setViewLoading(false);

    if (result.error || !result.data) {
      setViewingItems(summary.previewItems.map((item) => ({ name: item.name, qty: item.quantity })));
      return;
    }

    const productNameById = useOrdersStore.getState().productNameById;
    setViewingItems(
      result.data.items.map((item) => ({
        name: productNameById[item.product_id] ?? 'Item',
        qty: item.qty,
      })),
    );
  }, []);

  const closeViewModal = useCallback(() => {
    setViewingOrderId(null);
    setViewingItems([]);
  }, []);

  const viewingSummary = useMemo(
    () => summaries.find((s) => s.order.id === viewingOrderId),
    [summaries, viewingOrderId],
  );

  const createdTime = useMemo(() => {
    if (!viewingSummary) return '';
    return new Date(viewingSummary.order.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, [viewingSummary]);

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F8FC' }}>
        <HeaderSection
          subtext="Loading…"
          onRefresh={handleRefresh}
          isRefreshing={false}
        />
        <OrdersSkeleton count={listColumns * 2} />
      </View>
    );
  }

  // ── Error (full-page) ─────────────────────────────────────────────────────────
  if (error && summaries.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F8FC', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f2744', textAlign: 'center' }}>
            Unable to load orders
          </Text>
          <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8 }}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadOrders()}
            style={{ marginTop: 20, overflow: 'hidden', borderRadius: 14, height: 48 }}
          >
            <LinearGradient colors={['#0D6CE0', '#004a8d']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Retry</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F8FC' }}>
      {/* ── Branded Top Header Surface ── */}
      <LinearGradient
        colors={['#024db1', '#01389e']}
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 10,
          height: 76,
          justifyContent: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#E2E8F0', fontFamily: 'Outfit, "Avenir Next", system-ui, sans-serif', letterSpacing: -0.5 }}>
              Orders Management
            </Text>
            <Text style={{ fontSize: 11.5, fontWeight: '500', color: '#E0F2FE', marginTop: 1, opacity: 0.9 }}>
              {headerSubtext}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh orders"
            onPress={handleRefresh}
            style={({ pressed }: any) => [
              {
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            {isRefreshing
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <RefreshCw color="#FFFFFF" size={14} />
            }
          </Pressable>
        </View>
      </LinearGradient>

      {/* ── Control Bar (Search + Filters) ── */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEF2F7', paddingHorizontal: 16, paddingVertical: 6 }}>
        {/* Search bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 10, height: 32 }}>
          <Search color="#94A3B8" size={13} />
          <TextInput
            placeholder="Search orders..."
            placeholderTextColor="#94A3B8"
            value={searchInputValue}
            onChangeText={handleSearchChange}
            style={{ flex: 1, fontSize: 12, fontWeight: '500', color: '#0F172A', marginLeft: 8, outlineStyle: 'none' } as any}
            returnKeyType="search"
          />
          {searchInputValue.length > 0 && (
            <Pressable accessibilityRole="button" onPress={clearSearch} style={{ padding: 4 }}>
              <X color="#94A3B8" size={13} />
            </Pressable>
          )}
        </View>

        {/* Filter pills — single row, tap to filter, count badge built-in */}
        <FlatList
          horizontal
          data={[
            { id: 'active'    as OrderFilter, label: 'Active',    count: kpi.active,    color: '#0066b2', bg: '#E8F2FA' },
            { id: 'unpaid'    as OrderFilter, label: 'Unpaid',    count: kpi.unpaid,    color: '#F97316', bg: '#FFF4EC' },
            { id: 'held'      as OrderFilter, label: 'Held',      count: kpi.held,      color: '#D97706', bg: '#FEF3C7' },
            { id: 'paid'      as OrderFilter, label: 'Paid',      count: kpi.paid,      color: '#16A34A', bg: '#F0FDF4' },
            { id: 'cancelled' as OrderFilter, label: 'Cancelled', count: kpi.cancelled, color: '#64748B', bg: '#F1F5F9' },
            { id: 'all'       as OrderFilter, label: 'All',       count: kpi.all,       color: '#64748B', bg: '#F1F5F9' },
          ]}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 6 }}
          contentContainerStyle={{ gap: 6 }}
          renderItem={({ item }) => (
            <FilterPill
              label={item.label}
              count={item.count}
              color={item.color}
              bg={item.bg}
              isActive={activeFilter === item.id}
              onPress={() => setActiveFilter(item.id)}
            />
          )}
        />
      </View>

      {/* ── Inline error banner ── */}
      {error && (
        <View style={{ marginHorizontal: 16, marginTop: 10, backgroundColor: '#FFF7EC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#FED7AA' }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#C2410C', textAlign: 'center' }}>{error}</Text>
        </View>
      )}

      {/* ── List ── */}
      {displayedSummaries.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#EEF2F7', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f2744', textAlign: 'center' }}>
              {searchQuery ? 'No matching orders' : 'No orders'}
            </Text>
            <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6 }}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : activeFilter === 'active'
                  ? 'No active orders right now'
                  : `No ${activeFilter} orders today`}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={displayedSummaries}
          key={listColumns}
          numColumns={listColumns}
          keyExtractor={(item) => item.order.id}
          contentContainerStyle={{ padding: 8, paddingBottom: 24 }}
          renderItem={({ item, index }) => {
            const isEditable = EDITABLE_STATUSES.includes(item.order.status);
            return (
              <View style={{ width: `${100 / listColumns}%` }}>
                <OrderCard
                  summary={item}
                  orderIndex={index}
                  isEditable={isEditable}
                  onViewOrder={() => void handleViewOrder(item)}
                  onOpenBill={() => void handleOpenBill(item.order.id)}
                />
              </View>
            );
          }}
        />
      )}

      {/* ── Detail modal ── */}
      <Modal
        visible={viewingOrderId !== null}
        animationType="fade"
        transparent
        onRequestClose={closeViewModal}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(15, 39, 68, 0.35)',
            padding: 16,
          }}
          onPress={closeViewModal}
        >
          <Pressable
            style={{
              width: '100%',
              maxWidth: 440,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#E8EFF6',
              paddingHorizontal: 20,
              paddingBottom: 20,
              paddingTop: 18,
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 10,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f2744' }}>
                  {viewingSummary ? getBillIdentifier(viewingSummary, summaries.indexOf(viewingSummary)) : 'Order Details'}
                </Text>
                {viewingSummary && (
                  <View
                    style={{
                      borderRadius: 5,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      backgroundColor: getStatusConfig(viewingSummary.order.status).bg,
                    }}
                  >
                    <Text style={{ fontSize: 8.5, fontWeight: '800', color: getStatusConfig(viewingSummary.order.status).text, letterSpacing: 0.6 }}>
                      {getStatusConfig(viewingSummary.order.status).label}
                    </Text>
                  </View>
                )}
                {viewingSummary && (
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8' }}>
                    {getElapsedLabel(viewingSummary.order.created_at)}
                  </Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                onPress={closeViewModal}
                style={({ pressed, hovered }: any) => [
                  {
                    width: 30,
                    height: 30,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#EEF2F7',
                    backgroundColor: '#F8FAFC',
                  },
                  hovered && { backgroundColor: '#F1F5F9' },
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <X color="#475569" size={16} />
              </Pressable>
            </View>

            {/* Order Summary dashboard row */}
            {viewingSummary && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: '#F1F5F9',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Created</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#334155', marginTop: 1.5 }}>{createdTime}</Text>
                </View>
                <View style={{ width: 1, height: 24, backgroundColor: '#E2E8F0', marginHorizontal: 12 }} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Items</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#334155', marginTop: 1.5 }}>{viewingSummary.itemCount}</Text>
                </View>
                <View style={{ width: 1, height: 24, backgroundColor: '#E2E8F0', marginHorizontal: 12 }} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0F172A', marginTop: 1 }}>
                    ₹{viewingSummary.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              </View>
            )}

            {/* Items list scrollable */}
            <View style={{ maxHeight: 200, marginBottom: 4 }}>
              {viewLoading ? (
                <ActivityIndicator color={colors.primaryMid} style={{ paddingVertical: 24 }} />
              ) : (
                <FlatList
                  data={viewingItems}
                  keyExtractor={(item, idx) => `${item.name}-${idx}`}
                  scrollEnabled={viewingItems.length > 4}
                  contentContainerStyle={{ paddingVertical: 2 }}
                  renderItem={({ item }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: '#F1F5F9',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: '500',
                          color: '#1E293B',
                          flex: 1,
                          marginRight: 16,
                        }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0066b2', fontVariant: ['tabular-nums'] }}>
                        ×{item.qty}
                      </Text>
                    </View>
                  )}
                  ListEmptyComponent={
                    <Text style={{ textAlign: 'center', color: '#9CA3AF', paddingVertical: 20, fontSize: 12 }}>No items</Text>
                  }
                />
              )}
            </View>

            {/* Footer Actions */}
            {viewingOrderId && viewingSummary && (() => {
              const status = viewingSummary.order.status;
              const isUnpaidOrActive = status === 'draft' || status === 'unpaid' || status === 'payment_pending' || status === 'in_kitchen';
              const isHeld = status === 'held';

              if (isUnpaidOrActive) {
                return (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open in POS"
                      onPress={() => {
                        closeViewModal();
                        void handleOpenBill(viewingOrderId);
                      }}
                      style={({ pressed, hovered }: any) => [
                        {
                          flex: 1,
                          height: 40,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: '#E2E8F0',
                          backgroundColor: '#FFFFFF',
                        },
                        hovered && { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                        pressed && { transform: [{ scale: 0.98 }] },
                      ]}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#64748B' }}>
                        Open in POS
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Settle Bill"
                      onPress={() => {
                        setSettlingOrder(viewingSummary);
                      }}
                      style={({ pressed }: any) => [
                        { flex: 1.5, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                      ]}
                    >
                      <LinearGradient
                        colors={['#16a34a', '#15803d']}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>
                          Settle Bill
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                );
              }

              if (isHeld) {
                return (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      onPress={closeViewModal}
                      style={({ pressed, hovered }: any) => [
                        {
                          flex: 1,
                          height: 40,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: '#E2E8F0',
                          backgroundColor: '#FFFFFF',
                        },
                        hovered && { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
                        pressed && { transform: [{ scale: 0.98 }] },
                      ]}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#64748B' }}>
                        Close
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Resume Billing"
                      onPress={() => {
                        closeViewModal();
                        void handleOpenBill(viewingOrderId);
                      }}
                      style={({ pressed }: any) => [
                        { flex: 1.5, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                      ]}
                    >
                      <LinearGradient
                        colors={['#0D6CE0', '#004a8d']}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>
                          Resume Billing
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                );
              }

              // Paid / Completed / Cancelled (Read-only)
              return (
                <View style={{ marginTop: 16 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={closeViewModal}
                    style={({ pressed, hovered }: any) => [
                      {
                        width: '100%',
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: '#E2E8F0',
                        backgroundColor: '#F8FAFC',
                      },
                      hovered && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
                      pressed && { transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#64748B' }}>
                      Close
                    </Text>
                  </Pressable>
                </View>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settle Bill Confirmation overlay (direct DB settlement, no active cart state mutation) */}
      {settlingOrder && (
        <SettlementModal
          visible={settlingOrder !== null}
          total={settlingOrder.totalAmount}
          onClose={() => setSettlingOrder(null)}
          onConfirm={async () => {
            setIsSettlingMutating(true);
            const result = await settleOrderById(settlingOrder.order.id);
            setIsSettlingMutating(false);

            if (result.error) {
              showToast('Connection issue. Please check internet and try again.');
              return false;
            }

            showToast('Bill settled successfully.');
            setViewingOrderId(null); // Close the preview layover
            void loadOrders(true); // Asynchronously reload the orders queue
            return true;
          }}
          isMutating={isSettlingMutating}
        />
      )}

      {/* Premium Root Toast Notification Alert */}
      {toastMessage && (
        <View style={{ position: 'absolute', bottom: 32, left: '10%', right: '10%', backgroundColor: '#0f2744', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 6, zIndex: 99999 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeaderSection({
  subtext,
  onRefresh,
  isRefreshing,
}: {
  subtext: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <LinearGradient
      colors={['#024db1', '#01389e']}
      style={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
        height: 76,
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#E2E8F0', fontFamily: 'Outfit, "Avenir Next", system-ui, sans-serif', letterSpacing: -0.5 }}>
            Orders Management
          </Text>
          <Text style={{ fontSize: 11.5, fontWeight: '500', color: '#E0F2FE', marginTop: 1, opacity: 0.9 }}>
            {subtext}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onRefresh}
          style={({ pressed }: any) => [
            {
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          {isRefreshing
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <RefreshCw color="#FFFFFF" size={14} />
          }
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function FilterPill({
  label,
  count,
  color,
  bg,
  isActive,
  onPress,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
  isActive: boolean;
  onPress: () => void;
}) {
  if (isActive) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }: any) => [
          { overflow: 'hidden', borderRadius: 99, height: 26 },
          pressed && { transform: [{ scale: 0.97 }] }
        ]}
      >
        <LinearGradient
          colors={['#0251B8', '#013B8C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 26, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#FFFFFF' }}>{label}</Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 99, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>{count}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        {
          height: 26,
          paddingHorizontal: 10,
          borderRadius: 99,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          borderWidth: 1,
          borderColor: 'rgba(0,0,0,0.03)',
        },
        hovered && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <Text style={{ fontSize: 10.5, fontWeight: '600', color }}>{label}</Text>
      <View style={{ backgroundColor: color, borderRadius: 99, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
        <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>{count}</Text>
      </View>
    </Pressable>
  );
}
