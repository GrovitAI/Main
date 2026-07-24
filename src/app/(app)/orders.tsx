import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
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
import { fetchOpenOrderById, getAllOrders, getOrders, settleOrderById, type OpenOrderSummary } from '@/lib/pos/open-orders-service';
import { useApprovalFlow } from '@/lib/approval/use-approval-flow';
import { ApprovalAction } from '@/lib/approval/approval.types';
import { useOrdersStore } from '@/lib/pos/use-orders-store';
import { SettlementModal } from '@/components/pos/SettlementModal';
import { supabase } from '@/lib/pos/supabase';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { logSupabaseError } from '@/lib/pos/supabase-debug';
import { printReceipt, buildReceiptText } from '@/services/printService';
import { useSessionStore } from '@/lib/pos/use-session-store';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLET_BREAKPOINT = 768;
const REFRESH_INTERVAL_MS = 10_000;
const SEARCH_DEBOUNCE_MS = 200;

// ─── Filter types ─────────────────────────────────────────────────────────────

type OrderFilter = 'held' | 'unpaid' | 'paid' | 'cancelled' | 'draft' | 'all';

const EDITABLE_STATUSES: OrderStatus[] = ['draft', 'open', 'held', 'unpaid', 'in_kitchen', 'payment_pending'];

function matchesFilter(status: OrderStatus, filter: OrderFilter): boolean {
  switch (filter) {
    case 'held':      return status === 'held';
    case 'unpaid':    return status === 'unpaid' || status === 'payment_pending' || status === 'in_kitchen';
    case 'paid':      return status === 'paid' || status === 'completed';
    case 'cancelled': return status === 'cancelled';
    case 'draft':     return status === 'draft';
    case 'all':       return true;
  }
}

function matchesSearch(summary: OpenOrderSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const { order, previewItems, kotNumbers } = summary;

  if (order.id.toLowerCase().includes(q)) return true;
  if (order.invoice_number && String(order.invoice_number).toLowerCase().includes(q)) return true;
  if (kotNumbers && kotNumbers.some((num) => String(num).toLowerCase().includes(q))) return true;
  if (order.token_number && String(order.token_number).toLowerCase().includes(q)) return true;
  if (order.order_name && order.order_name.toLowerCase().includes(q)) return true;
  if (previewItems.some((item) => item.name.toLowerCase().includes(q))) return true;
  return false;
}

// ─── KPI counts ───────────────────────────────────────────────────────────────

type KpiCounts = {
  unpaid: number;
  held: number;
  paid: number;
  cancelled: number;
  draft: number;
  all: number;
};

function computeKpi(summaries: OpenOrderSummary[]): KpiCounts {
  let unpaid = 0, held = 0, paid = 0, cancelled = 0, draft = 0;
  for (const s of summaries) {
    const st = s.order.status;
    if (st === 'unpaid' || st === 'payment_pending' || st === 'in_kitchen') unpaid++;
    if (st === 'held') held++;
    if (st === 'paid' || st === 'completed') paid++;
    if (st === 'cancelled') cancelled++;
    if (st === 'draft') draft++;
  }
  return { unpaid, held, paid, cancelled, draft, all: summaries.length };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function OrdersSkeleton({ count }: { count: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            margin: 8,
            flex: 1,
            minWidth: '44%',
            height: 176,
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

  // ── Zustand State cache-first connection ─────────────────────────────────────
  const summaries = useOrdersStore((state) => state.summaries);
  const isLoading = useOrdersStore((state) => state.isLoadingOrders);
  const storeError = useOrdersStore((state) => state.error);
  const loadSummaries = useOrdersStore((state) => state.loadSummaries);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const session = useSessionStore((s) => s.session);
  const currentBranch = useMemo(() => {
    return session?.accessibleBranches?.find((b) => b.id === session.branchId) || null;
  }, [session]);
  const error = storeError;

  // ── UI state ────────────────────────────────────────────────────────────────
  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<OrderFilter>('unpaid');
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'custom'>('today');
  const [customFromDate, setCustomFromDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [customToDate, setCustomToDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'upi' | 'card' | 'complimentary'>('all');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pagination State ────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 50;

  // Reset page to 1 whenever any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [datePreset, customFromDate, customToDate, paymentFilter, searchQuery]);

  // ── Detail modal state ───────────────────────────────────────────────────────
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [viewingItems, setViewingItems] = useState<{ name: string; qty: number }[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [modalFooterIndex, setModalFooterIndex] = useState(0);

  // ── Settlement state ────────────────────────────────────────────────────────
  const [settlingOrder, setSettlingOrder] = useState<OpenOrderSummary | null>(null);
  const [isSettlingMutating, setIsSettlingMutating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const navigation = useNavigation();
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    });
    return unsubscribe;
  }, [navigation]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // ── History Tab Data State ──────────────────────────────────────────────────
  const [historySummaries, setHistorySummaries] = useState<OpenOrderSummary[]>([]);
  const [historyMetrics, setHistoryMetrics] = useState({
    grossSales: 0,
    discountsGiven: 0,
    complimentarySales: 0,
    netCollected: 0,
  });

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async (silent = false) => {
    if (activeTab === 'active') {
      if (!silent) {
        await loadSummaries(false);
      } else {
        setIsRefreshing(true);
        await loadSummaries(true);
        setIsRefreshing(false);
      }
    } else {
      if (!silent) setIsRefreshing(true);
      const res = await getOrders({
        targetTable: 'bills',
        preset: datePreset,
        fromDate: customFromDate,
        toDate: customToDate,
        paymentMethod: paymentFilter,
        search: searchQuery,
        page: currentPage,
        pageSize,
      });
      if (res.data) {
        if (res.data.metadata.source !== 'bills') {
          console.warn('[Orders] History query returned unexpected source:', res.data.metadata.source);
        }
        setHistorySummaries(res.data.summaries);
        setHistoryMetrics(res.data.metrics);
        setTotalCount(res.data.metadata.totalCount);
        setTotalPages(res.data.metadata.totalPages);
      }
      setIsRefreshing(false);
    }
  }, [activeTab, datePreset, customFromDate, customToDate, paymentFilter, searchQuery, currentPage, loadSummaries]);

  useEffect(() => {
    void loadOrders();
    const id = setInterval(() => void loadOrders(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadOrders]);

  // ── Search handler ──────────────────────────────────────────────────────────
  const handleSearchSubmit = useCallback(() => {
    setSearchQuery(searchInputValue.trim());
  }, [searchInputValue]);

  const clearSearch = useCallback(() => {
    setSearchInputValue('');
    setSearchQuery('');
  }, []);

  // ── KPI counts ───────────────────────────────────────────────────────────────
  const kpi = useMemo(() => computeKpi(summaries), [summaries]);

  // ── Dynamic header subtext ───────────────────────────────────────────────────
  const headerSubtext = useMemo(() => {
    const parts: string[] = [];
    if (kpi.unpaid > 0) parts.push(`${kpi.unpaid} unpaid`);
    if (kpi.draft > 0) parts.push(`${kpi.draft} drafts`);
    if (kpi.held > 0) parts.push(`${kpi.held} held`);
    return parts.length > 0 ? parts.join(' • ') : 'No open orders';
  }, [kpi]);

  // ── Filtered + searched results ──────────────────────────────────────────────
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (activeTab === 'active') {
        if (!matchesFilter(s.order.status, activeFilter)) return false;
      }

      if (activeTab === 'history') {
        if (paymentFilter !== 'all') {
          const pm = (s.order.payment_method || '').toLowerCase();
          if (pm !== paymentFilter) return false;
        }

        const orderDate = new Date(s.order.created_at);
        const now = new Date();
        if (datePreset === 'today') {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (orderDate < startOfToday) return false;
        } else if (datePreset === 'yesterday') {
          const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
          if (orderDate < startOfYesterday || orderDate > endOfYesterday) return false;
        } else if (datePreset === '7days') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (orderDate < sevenDaysAgo) return false;
        } else if (datePreset === '30days') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (orderDate < thirtyDaysAgo) return false;
        } else if (datePreset === 'custom') {
          const dFrom = new Date(customFromDate);
          dFrom.setHours(0, 0, 0, 0);
          const dTo = new Date(customToDate);
          dTo.setHours(23, 59, 59, 999);
          if (orderDate < dFrom || orderDate > dTo) return false;
        }
      }

      return true;
    });
  }, [summaries, activeTab, activeFilter, paymentFilter, datePreset, customFromDate, customToDate]);

  const displayedSummaries = useMemo(() => {
    if (activeTab === 'history') {
      return historySummaries;
    }
    return filteredSummaries.filter((s) => matchesSearch(s, searchQuery));
  }, [activeTab, historySummaries, filteredSummaries, searchQuery]);

  // ── Revenue Analytics Metrics Calculation ─────────────────────────────
  const analyticsMetrics = useMemo(() => {
    if (activeTab === 'history') {
      return historyMetrics;
    }

    let grossSales = 0;
    let discountsGiven = 0;
    let complimentarySales = 0;
    let netCollected = 0;

    for (const s of displayedSummaries) {
      const subtotal = s.totalAmount || 0;
      const disc = s.order.discount_amount || 0;
      const isComp = (s.order.payment_method || '').toLowerCase() === 'complimentary';

      grossSales += subtotal;
      discountsGiven += disc;

      if (isComp) {
        complimentarySales += subtotal;
      } else if (s.order.status === 'paid' || s.order.status === 'completed') {
        netCollected += Math.max(0, subtotal - disc);
      }
    }

    return { grossSales, discountsGiven, complimentarySales, netCollected };
  }, [activeTab, historyMetrics, displayedSummaries]);

  // ── CSV Export Engine with Metadata Header ───────────────────────────
  const handleExportCsv = useCallback(() => {
    if (displayedSummaries.length === 0) {
      showToast('No orders available to export.');
      return;
    }

    const exportTime = new Date().toLocaleString('en-IN');
    const branchName = currentBranch?.name || 'Main Branch';
    const filterLabel = activeTab === 'active' ? activeFilter.toUpperCase() : datePreset.toUpperCase();

    const metadataHeader = [
      `Grovit AI POS - Sales & Order History Export`,
      `Export Generated:,${exportTime}`,
      `Branch Name:,${branchName}`,
      `Sub-View Tab:,${activeTab === 'active' ? 'Active Orders' : 'Sales History'}`,
      `Filter Preset:,${filterLabel}`,
      `Total Orders Count:,${displayedSummaries.length}`,
      `Gross Sales (INR):,${analyticsMetrics.grossSales.toFixed(2)}`,
      `Total Discounts Given (INR):,${analyticsMetrics.discountsGiven.toFixed(2)}`,
      `Complimentary Sales (INR):,${analyticsMetrics.complimentarySales.toFixed(2)}`,
      `Net Revenue Collected (INR):,${analyticsMetrics.netCollected.toFixed(2)}`,
      `---------------------------------------------------------------------------------`,
    ].join('\n');

    const columnHeaders = 'Invoice Number,Order ID,Status,Created Date,Created Time,Cashier,Payment Method,Items Breakdown,Total Items,Subtotal (INR),Discount (INR),Grand Total (INR)';

    const rows = displayedSummaries.map((s) => {
      const inv = s.order.invoice_number || 'N/A';
      const id = s.order.id;
      const st = s.order.status.toUpperCase();
      const dt = new Date(s.order.created_at);
      const dateStr = dt.toLocaleDateString('en-IN');
      const timeStr = dt.toLocaleTimeString('en-IN');
      const cashier = s.order.created_by || 'Cashier';
      const payMode = (s.order.payment_method || 'UNPAID').toUpperCase();
      const itemsStr = `"${s.previewItems.map((i) => `${i.name} (${i.quantity})`).join('; ')}"`;
      const count = s.itemCount;
      const subtotal = s.totalAmount || 0;
      const disc = s.order.discount_amount || 0;
      const grandTotal = Math.max(0, subtotal - disc);

      return `${inv},${id},${st},${dateStr},${timeStr},${cashier},${payMode},${itemsStr},${count},${subtotal.toFixed(2)},${disc.toFixed(2)},${grandTotal.toFixed(2)}`;
    });

    const csvContent = `${metadataHeader}\n${columnHeaders}\n${rows.join('\n')}`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Grovit_Sales_Export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported ${displayedSummaries.length} orders to CSV.`);
    } else {
      showToast('CSV Export available on Web browser.');
    }
  }, [activeTab, activeFilter, datePreset, displayedSummaries, analyticsMetrics, currentBranch, showToast]);

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
    const mergedMap: Record<string, { qty: number; price: number }> = {};
    for (const item of result.data.items) {
      const name = item.item_name || productNameById[item.product_id] || 'Item';
      if (mergedMap[name]) {
        mergedMap[name].qty += item.qty;
      } else {
        mergedMap[name] = { qty: item.qty, price: item.price ?? 0 };
      }
    }
    const mergedItems = Object.entries(mergedMap).map(([name, val]) => ({
      name,
      qty: val.qty,
      price: val.price,
    }));
    setViewingItems(mergedItems);
  }, []);

  const closeViewModal = useCallback(() => {
    setViewingOrderId(null);
    setViewingItems([]);
    setModalFooterIndex(0);
  }, []);

  const viewingSummary = useMemo(
    () => summaries.find((s) => s.order.id === viewingOrderId),
    [summaries, viewingOrderId],
  );

  const { requestApproval } = useApprovalFlow();

  const doReprintPreviousBill = useCallback(async () => {
    if (!viewingSummary) return;
    try {
      const orderName = viewingSummary.order.order_name || `Order #${viewingSummary.order.id}`;
      const invoiceNumber = viewingSummary.order.invoice_number;
      const totalAmount = viewingSummary.totalAmount;
      const paymentMethod = viewingSummary.order.payment_method;

      const printerName = typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem('billingPrinter')
        : null;

      if (!printerName) {
        showToast('Please configure a billing printer in Settings first.');
        return;
      }

      // Format items for print
      const printItems = viewingItems.map((item) => ({
        name: item.name,
        qty: item.qty,
        price: (item as any).price ?? 0,
      }));

      const receiptText = buildReceiptText(orderName, invoiceNumber, printItems, totalAmount, paymentMethod, currentBranch);
      const printResult = await printReceipt(printerName, receiptText);
      if (printResult.success) {
        showToast('Bill reprinted successfully.');
      } else {
        showToast(`Reprint failed: ${printResult.error || 'unknown error'}`);
      }
    } catch (err) {
      console.warn('[Reprint] Failed to reprint bill:', err);
      showToast('Failed to reprint bill.');
    }
  }, [viewingSummary, viewingItems, currentBranch, showToast]);

  const handleReprintPreviousBill = useCallback(() => {
    if (!viewingSummary) return;
    requestApproval({
      action: ApprovalAction.REPRINT_BILL,
      actionTitle: 'Reprint Bill',
      resourceType: 'bill',
      resourceId: viewingSummary.order.invoice_number || viewingSummary.order.id,
      onApproved: () => {
        void doReprintPreviousBill();
      },
    });
  }, [viewingSummary, requestApproval, doReprintPreviousBill]);

  // ── Modal footer keyboard navigation ────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || !viewingOrderId || !viewingSummary) return;

    const status = viewingSummary.order.status;
    const isDraftOrActive = status === 'draft' || status === 'payment_pending' || status === 'in_kitchen';
    const isUnpaidBill = status === 'unpaid';
    const isHeld = status === 'held';
    
    // Compute number of buttons
    let buttonCount = 1;
    if (isDraftOrActive) {
      buttonCount = 2;
    } else if (isUnpaidBill) {
      buttonCount = 3;
    } else if (isHeld) {
      buttonCount = 2;
    } else if (status === 'paid' || status === 'completed') {
      buttonCount = 2; // Close + Reprint
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setModalFooterIndex((prev) => (prev + 1) % buttonCount);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setModalFooterIndex((prev) => (prev - 1 + buttonCount) % buttonCount);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (isDraftOrActive) {
          if (modalFooterIndex === 0) {
            closeViewModal();
            void handleOpenBill(viewingOrderId);
          } else {
            setSettlingOrder(viewingSummary);
          }
        } else if (isUnpaidBill) {
          if (modalFooterIndex === 0) {
            void handleReprintPreviousBill();
          } else if (modalFooterIndex === 1) {
            closeViewModal();
            // Open in POS and enter edit mode
            void (async () => {
              const success = await selectOrder(viewingOrderId);
              if (success) {
                useOrdersStore.getState().enterEditMode();
                router.push('/');
              }
            })();
          } else {
            setSettlingOrder(viewingSummary);
          }
        } else if (isHeld) {
          if (modalFooterIndex === 0) {
            closeViewModal();
          } else {
            closeViewModal();
            void handleOpenBill(viewingOrderId);
          }
        } else {
          const showReprint = status === 'paid' || status === 'completed';
          if (showReprint && modalFooterIndex === 1) {
            void handleReprintPreviousBill();
          } else {
            closeViewModal();
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeViewModal();
        return;
      }
    };

    setModalFooterIndex(0);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewingOrderId, viewingSummary, modalFooterIndex, closeViewModal, handleOpenBill]);

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
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 14,
          height: 84,
          justifyContent: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#E2E8F0', fontFamily: 'Outfit, "Avenir Next", system-ui, sans-serif', letterSpacing: -0.5 }}>
              Orders Management
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#E0F2FE', marginTop: 1, opacity: 0.9 }}>
              {headerSubtext}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh orders"
            onPress={handleRefresh}
            style={({ pressed }: any) => [
              {
                width: 36,
                height: 36,
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
              : <RefreshCw color="#FFFFFF" size={16} />
            }
          </Pressable>
        </View>
      </LinearGradient>

      {/* ── Control Bar (Search + Sub-Nav + Filters + Export) ── */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEF2F7', paddingHorizontal: 20, paddingVertical: 10 }}>
        {/* Top Row: Sub-Nav View Toggle + Export CSV Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
          {/* Sub-Nav Banner Pills */}
          <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 8, padding: 3 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveTab('active')}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: activeTab === 'active' ? '#FFFFFF' : 'transparent',
                shadowColor: activeTab === 'active' ? '#0F172A' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 2,
                elevation: activeTab === 'active' ? 2 : 0,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: activeTab === 'active' ? '700' : '600', color: activeTab === 'active' ? '#0066b2' : '#64748B' }}>
                Active Orders
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveTab('history')}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: activeTab === 'history' ? '#FFFFFF' : 'transparent',
                shadowColor: activeTab === 'history' ? '#0F172A' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 2,
                elevation: activeTab === 'history' ? 2 : 0,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: activeTab === 'history' ? '700' : '600', color: activeTab === 'history' ? '#0066b2' : '#64748B' }}>
                Sales & Order History
              </Text>
            </Pressable>
          </View>

          {/* Export CSV Action Button (Shown on Sales & Order History tab) */}
          {activeTab === 'history' && (
            <Pressable
              accessibilityRole="button"
              onPress={handleExportCsv}
              style={({ pressed }: any) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#0066b2',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  gap: 6,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Export CSV</Text>
            </Pressable>
          )}
        </View>

        {/* Revenue Analytics Cards (Shown on Sales & Order History tab) */}
        {activeTab === 'history' && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <View style={{ flex: 1, minWidth: 0, backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }} numberOfLines={1}>Gross Sales</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0F172A', marginTop: 2 }} numberOfLines={1}>₹{analyticsMetrics.grossSales.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#FCA5A5', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#991B1B', textTransform: 'uppercase' }} numberOfLines={1}>Discounts</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#DC2626', marginTop: 2 }} numberOfLines={1}>₹{analyticsMetrics.discountsGiven.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#86EFAC', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534', textTransform: 'uppercase' }} numberOfLines={1}>Complimentary</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#16A34A', marginTop: 2 }} numberOfLines={1}>₹{analyticsMetrics.complimentarySales.toLocaleString('en-IN')}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, backgroundColor: '#E0F2FE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#7DD3FC', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#075985', textTransform: 'uppercase' }} numberOfLines={1}>Net Revenue</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0284C7', marginTop: 2 }} numberOfLines={1}>₹{analyticsMetrics.netCollected.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        )}

        {/* Search bar with explicit Search action button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 10, height: 36 }}>
            <Search color="#94A3B8" size={15} />
            <TextInput
              ref={searchInputRef}
              id="orders-search-input"
              placeholder="Search invoice no, order ID, item name, token..."
              placeholderTextColor="#94A3B8"
              value={searchInputValue}
              onChangeText={setSearchInputValue}
              onSubmitEditing={handleSearchSubmit}
              style={{ flex: 1, fontSize: 13.5, fontWeight: '500', color: '#0F172A', marginLeft: 8, outlineStyle: 'none' } as any}
              returnKeyType="search"
            />
            {searchInputValue.length > 0 && (
              <Pressable accessibilityRole="button" onPress={clearSearch} style={{ padding: 4 }}>
                <X color="#94A3B8" size={15} />
              </Pressable>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleSearchSubmit}
            style={({ pressed }: any) => [
              {
                backgroundColor: '#0066b2',
                borderRadius: 8,
                paddingHorizontal: 14,
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>Search</Text>
          </Pressable>
        </View>

        {/* Date Preset Filter Bar (Shown on Sales & Order History tab) */}
        {activeTab === 'history' && (
          <View style={{ marginTop: 6, marginBottom: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Date Range</Text>
            <FlatList
              horizontal
              data={[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7days', label: 'Last 7 Days' },
                { id: '30days', label: 'Last 30 Days' },
                { id: 'custom', label: 'Custom Range' },
              ]}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
              renderItem={({ item }) => {
                const isActive = datePreset === item.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDatePreset(item.id as any)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: isActive ? '#0066b2' : '#CBD5E1',
                      backgroundColor: isActive ? '#E8F2FA' : '#FFFFFF',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: isActive ? '700' : '600', color: isActive ? '#0066b2' : '#475569' }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />

            {/* Custom Date Inputs (Shown when Custom Range is selected) */}
            {datePreset === 'custom' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748B' }}>From:</Text>
                  <TextInput
                    id="from-date-input"
                    value={customFromDate}
                    onChangeText={setCustomFromDate}
                    placeholder="YYYY-MM-DD"
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: '#0F172A',
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      outlineStyle: 'none',
                    } as any}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748B' }}>To:</Text>
                  <TextInput
                    id="to-date-input"
                    value={customToDate}
                    onChangeText={setCustomToDate}
                    placeholder="YYYY-MM-DD"
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: '#0F172A',
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      outlineStyle: 'none',
                    } as any}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Payment Method Filter Bar (Shown on Sales & Order History tab) */}
        {activeTab === 'history' && (
          <View style={{ marginTop: 4, marginBottom: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Payment Method</Text>
            <FlatList
              horizontal
              data={[
                { id: 'all', label: 'All Payments' },
                { id: 'cash', label: 'Cash' },
                { id: 'upi', label: 'UPI' },
                { id: 'card', label: 'Card' },
                { id: 'complimentary', label: 'Complimentary' },
              ]}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
              renderItem={({ item }) => {
                const isActive = paymentFilter === item.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPaymentFilter(item.id as any)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: isActive ? '#16A34A' : '#CBD5E1',
                      backgroundColor: isActive ? '#F0FDF4' : '#FFFFFF',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: isActive ? '700' : '600', color: isActive ? '#166534' : '#475569' }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        {/* Active Tab Order Status Filter Pills */}
        {activeTab === 'active' && (
          <FlatList
            horizontal
            data={[
              { id: 'unpaid'    as OrderFilter, label: 'Unpaid',    count: kpi.unpaid,    color: '#F97316', bg: '#FFF4EC' },
              { id: 'draft'     as OrderFilter, label: 'Draft',     count: kpi.draft,     color: '#475569', bg: '#F1F5F9' },
              { id: 'held'      as OrderFilter, label: 'Held',      count: kpi.held,      color: '#D97706', bg: '#FEF3C7' },
              { id: 'paid'      as OrderFilter, label: 'Paid',      count: kpi.paid,      color: '#16A34A', bg: '#F0FDF4' },
              { id: 'cancelled' as OrderFilter, label: 'Cancelled', count: kpi.cancelled, color: '#64748B', bg: '#F1F5F9' },
              { id: 'all'       as OrderFilter, label: 'All',       count: kpi.all,       color: '#64748B', bg: '#F1F5F9' },
            ]}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 6 }}
            contentContainerStyle={{ gap: 8 }}
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
        )}
      </View>

      {/* ── Inline error banner ── */}
      {error && (
        <View style={{ marginHorizontal: 20, marginTop: 10, backgroundColor: '#FFF7EC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#FED7AA' }}>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#C2410C', textAlign: 'center' }}>{error}</Text>
        </View>
      )}

      {/* ── List / Table ── */}
      {displayedSummaries.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, width: '100%', maxWidth: 400, borderWidth: 1, borderColor: '#EEF2F7', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f2744', textAlign: 'center' }}>
              {searchQuery ? 'No matching orders' : 'No orders'}
            </Text>
            <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 6 }}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : activeTab === 'active'
                  ? 'No active orders right now'
                  : 'No order history records found for selected filters'}
            </Text>
          </View>
        </View>
      ) : activeTab === 'history' ? (
        /* ── Row-Wise Report Data Table View ── */
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', flex: 1 }}>
            {/* Table Header Row */}
            <View style={{ flexDirection: 'row', backgroundColor: '#F8FAFC', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', alignItems: 'center' }}>
              <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Invoice / Order</Text>
              <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Date & Time</Text>
              <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Status</Text>
              <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>Items Breakdown</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Total (₹)</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase', textAlign: 'center' }}>Actions</Text>
            </View>

            {/* Table Body FlatList */}
            <FlatList
              data={displayedSummaries}
              keyExtractor={(item) => item.order.id}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item, index }) => {
                const inv = item.order.invoice_number || `Order #${item.order.id.slice(0, 6)}`;
                const dateStr = new Date(item.order.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const st = item.order.status;
                const statusCfg = getStatusConfig(st);
                const payMode = (item.order.payment_method || '').toUpperCase();
                const isEven = index % 2 === 0;

                return (
                  <View
                    style={{
                      flexDirection: 'row',
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: isEven ? '#FFFFFF' : '#FAFCFF',
                      borderBottomWidth: 1,
                      borderBottomColor: '#F1F5F9',
                    }}
                  >
                    <View style={{ flex: 1.5 }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F172A' }}>{inv}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '500', color: '#64748B' }}>#{item.order.id.slice(0, 8)}</Text>
                    </View>
                    <Text style={{ flex: 1.5, fontSize: 11.5, fontWeight: '500', color: '#334155' }}>{dateStr}</Text>
                    <View style={{ flex: 1.2 }}>
                      <View style={{ alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: statusCfg.bg }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: statusCfg.text, letterSpacing: 0.5 }}>{statusCfg.label}{payMode ? ` (${payMode})` : ''}</Text>
                      </View>
                    </View>
                    <Text style={{ flex: 2, fontSize: 11.5, fontWeight: '500', color: '#475569' }} numberOfLines={1}>
                      {item.previewItems.map(i => `${i.name} ×${i.quantity}`).join(', ')}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '800', color: '#0F172A', textAlign: 'right' }}>
                      ₹{item.totalAmount.toLocaleString('en-IN')}
                    </Text>
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void handleViewOrder(item)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#E8F2FA' }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#0066b2' }}>View</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />

            {/* Table Pagination Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569' }}>
                {totalCount === 0
                  ? 'Showing 0 of 0 transactions'
                  : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalCount)} of ${totalCount} transactions`}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={currentPage <= 1}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: currentPage <= 1 ? '#CBD5E1' : '#0066b2',
                    backgroundColor: currentPage <= 1 ? '#F1F5F9' : '#FFFFFF',
                    opacity: currentPage <= 1 ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: currentPage <= 1 ? '#94A3B8' : '#0066b2' }}>
                    ← Previous
                  </Text>
                </Pressable>

                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                  Page {currentPage} of {totalPages}
                </Text>

                <Pressable
                  accessibilityRole="button"
                  disabled={currentPage >= totalPages}
                  onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: currentPage >= totalPages ? '#CBD5E1' : '#0066b2',
                    backgroundColor: currentPage >= totalPages ? '#F1F5F9' : '#FFFFFF',
                    opacity: currentPage >= totalPages ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: currentPage >= totalPages ? '#94A3B8' : '#0066b2' }}>
                    Next →
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : (
        /* ── Active Orders Grid Card View ── */
        <FlatList
          data={displayedSummaries}
          key={listColumns}
          numColumns={listColumns}
          keyExtractor={(item) => item.order.id}
          contentContainerStyle={{ padding: 10, paddingBottom: 28 }}
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
              const isDraftOrKitchen = status === 'draft' || status === 'payment_pending' || status === 'in_kitchen';
              const isUnpaidBill = status === 'unpaid';
              const isHeld = status === 'held';

              // Draft / Kitchen — open in POS to continue working
              if (isDraftOrKitchen) {
                return (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open in POS"
                      onPress={() => {
                        closeViewModal();
                        void handleOpenBill(viewingOrderId);
                      }}
                      onHoverIn={() => setModalFooterIndex(0)}
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
                        modalFooterIndex === 0 && Platform.OS === 'web' && {
                          borderColor: '#0066b2',
                          backgroundColor: '#E8F2FA',
                          shadowColor: '#0066b2',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.15,
                          shadowRadius: 10,
                          elevation: 4,
                          transform: [{ scale: 1.02 }],
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: modalFooterIndex === 0 ? '#0066b2' : '#64748B' }}>
                        Open in POS
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Settle Bill"
                      onPress={() => { setSettlingOrder(viewingSummary); }}
                      onHoverIn={() => setModalFooterIndex(1)}
                      style={({ pressed }: any) => [
                        { flex: 1.5, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                        modalFooterIndex === 1 && Platform.OS === 'web' && {
                          borderWidth: 2, borderColor: '#4ADE80',
                          shadowColor: '#16a34a', shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
                          transform: [{ scale: 1.02 }],
                        },
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

              // Unpaid Bill — Reprint + Edit + Settle
              if (isUnpaidBill) {
                return (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reprint Bill"
                      onPress={handleReprintPreviousBill}
                      onHoverIn={() => setModalFooterIndex(0)}
                      style={({ pressed }: any) => [
                        { flex: 1, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                        modalFooterIndex === 0 && Platform.OS === 'web' && {
                          borderWidth: 2, borderColor: '#0284c7',
                          shadowColor: '#0284c7', shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
                          transform: [{ scale: 1.02 }],
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={['#0369a1', '#0284c7']}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>
                          Reprint Bill
                        </Text>
                      </LinearGradient>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Edit Bill"
                      onPress={async () => {
                        closeViewModal();
                        const success = await selectOrder(viewingOrderId);
                        if (success) {
                          useOrdersStore.getState().enterEditMode();
                          router.push('/');
                        }
                      }}
                      onHoverIn={() => setModalFooterIndex(1)}
                      style={({ pressed }: any) => [
                        { flex: 1, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                        modalFooterIndex === 1 && Platform.OS === 'web' && {
                          borderWidth: 2, borderColor: '#d97706',
                          shadowColor: '#d97706', shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
                          transform: [{ scale: 1.02 }],
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={['#f59e0b', '#d97706']}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>
                          Edit Bill
                        </Text>
                      </LinearGradient>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Settle Bill"
                      onPress={() => { setSettlingOrder(viewingSummary); }}
                      onHoverIn={() => setModalFooterIndex(2)}
                      style={({ pressed }: any) => [
                        { flex: 1.5, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                        modalFooterIndex === 2 && Platform.OS === 'web' && {
                          borderWidth: 2, borderColor: '#4ADE80',
                          shadowColor: '#16a34a', shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
                          transform: [{ scale: 1.02 }],
                        },
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
                      onHoverIn={() => setModalFooterIndex(0)}
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
                        modalFooterIndex === 0 && Platform.OS === 'web' && {
                          borderColor: '#0066b2',
                          backgroundColor: '#E8F2FA',
                          shadowColor: '#0066b2',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.15,
                          shadowRadius: 10,
                          elevation: 4,
                          transform: [{ scale: 1.02 }],
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: modalFooterIndex === 0 ? '#0066b2' : '#64748B' }}>
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
                      onHoverIn={() => setModalFooterIndex(1)}
                      style={({ pressed }: any) => [
                        { flex: 1.5, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                        modalFooterIndex === 1 && Platform.OS === 'web' && {
                          borderWidth: 2,
                          borderColor: '#80B3FF',
                          shadowColor: '#0066b2',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.25,
                          shadowRadius: 12,
                          elevation: 6,
                          transform: [{ scale: 1.02 }],
                        },
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
              const showReprint = status === 'paid' || status === 'completed';
              return (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={closeViewModal}
                    style={({ pressed, hovered }: any) => [
                      {
                        flex: showReprint ? 1 : 1.5,
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

                  {showReprint && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reprint Bill"
                      onPress={handleReprintPreviousBill}
                      style={({ pressed }) => [
                        { flex: 1.5, height: 40, overflow: 'hidden', borderRadius: 10 },
                        pressed && { transform: [{ scale: 0.98 }] },
                      ]}
                    >
                      <LinearGradient
                        colors={['#10b981', '#059669']}
                        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>
                          Reprint Bill
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  )}
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
          onConfirm={async (paymentMethod) => {
            if (!settlingOrder) return false;
            setIsSettlingMutating(true);
            try {
              // Perform DB write
              const result = await settleOrderById(settlingOrder.order.id, paymentMethod);
              if (result.error) {
                showToast('Connection issue. Please check internet and try again.');
                return false;
              }

              showToast('Bill settled successfully.');
              setViewingOrderId(null); // Close the preview layover
              void loadOrders(true); // Asynchronously reload the orders queue
              return true;
            } catch (err) {
              console.error('[Settlement] Settle failed:', err);
              showToast('Settlement failed. Please try again.');
              return false;
            } finally {
              setIsSettlingMutating(false);
            }
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
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 14,
        height: 84,
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#E2E8F0', fontFamily: 'Outfit, "Avenir Next", system-ui, sans-serif', letterSpacing: -0.5 }}>
            Orders Management
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#E0F2FE', marginTop: 1, opacity: 0.9 }}>
            {subtext}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onRefresh}
          style={({ pressed }: any) => [
            {
              width: 36,
              height: 36,
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
            : <RefreshCw color="#FFFFFF" size={16} />
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
          { overflow: 'hidden', borderRadius: 99, height: 30 },
          pressed && { transform: [{ scale: 0.97 }] }
        ]}
      >
        <LinearGradient
          colors={['#0251B8', '#013B8C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: 30, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' }}>{label}</Text>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 99, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{count}</Text>
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
          height: 30,
          paddingHorizontal: 12,
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
      <Text style={{ fontSize: 11.5, fontWeight: '600', color }}>{label}</Text>
      <View style={{ backgroundColor: color, borderRadius: 99, minWidth: 17, height: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
        <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{count}</Text>
      </View>
    </Pressable>
  );
}
