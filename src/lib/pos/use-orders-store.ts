import { create } from 'zustand';

import type { OpenOrder, PosOrderItem, KotTicket } from './order-types';
import { formatPosOrderName } from './order-utils';
import type { Product } from './products-service';
import {
  addOrderItem,
  createOpenOrder,
  fetchOpenOrderById,
  fetchOpenOrders,
  fetchOrderItemCounts,
  removeOrderItem,
  updateOrderItemQuantity,
  clearOpenOrderItems,
  holdOpenOrder,
  resumeHeldOrder,
  fetchKotsForOrders,
  createKot,
  bootstrapSequenceRegistry,
  getNextBillNumber,
  getNextOrderNumber,
  getNextKotNumber,
  getAllOrders,
  settleOrderById,
  repairMissingBills,
  type OpenOrderSummary,
  type OrderItemPreview,
} from './open-orders-service';
import { BRANCH_ID, TENANT_ID, getTenantContext } from './tenant-context';
import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';
import { printerService } from './printer-service';

type OrdersState = {
  orders: OpenOrder[];
  heldOrders: OpenOrder[];
  summaries: OpenOrderSummary[];
  activeOrderId: string | null;
  activeOrderItems: PosOrderItem[];
  itemCountByOrderId: Record<string, number>;
  kotNumbersByOrderId: Record<string, number[]>;
  kotsByOrderId: Record<string, KotTicket[]>;
  billPrintedByOrderId: Record<string, boolean>;
  productNameById: Record<string, string>;
  isLoadingOrders: boolean;
  isLoadingActiveOrder: boolean;
  isMutating: boolean;
  isEditingUnpaid: boolean;
  hasUnsavedChanges: boolean;
  isReadOnlyView: boolean;
  isWorkspaceEmpty: boolean;
  error: string | null;
  loadOrders: () => Promise<void>;
  loadSummaries: (silent?: boolean) => Promise<void>;
  setProductCatalog: (products: Product[]) => void;
  selectOrder: (orderId: string) => Promise<boolean>;
  createOrder: () => Promise<void>;
  addProductToActiveOrder: (product: Product, quantity?: number) => Promise<void>;
  incrementItem: (itemId: string) => Promise<void>;
  decrementItem: (itemId: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  resetCart: () => Promise<void>;
  holdOrder: () => Promise<void>;
  saveKot: () => Promise<boolean>;
  saveAndPrint: () => Promise<boolean>;
  settleBill: (paymentType?: string) => Promise<{ data: OpenOrder | null; error: string | null }>;
  cancelOrder: () => Promise<void>;
  enterEditMode: () => void;
  discardChanges: () => Promise<void>;
  clearError: () => void;
};

function createTempId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getItemCount(items: PosOrderItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

function enrichItems(
  items: PosOrderItem[],
  productNameById: Record<string, string>,
): PosOrderItem[] {
  return items.map((item) => ({
    ...item,
    product_name: productNameById[item.product_id] ?? item.product_name ?? 'Item',
  }));
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  heldOrders: [],
  summaries: [],
  activeOrderId: (typeof window !== 'undefined' && window.localStorage)
    ? window.localStorage.getItem('grovit_active_order_id')
    : null,
  activeOrderItems: [],
  itemCountByOrderId: {},
  kotNumbersByOrderId: {},
  kotsByOrderId: {},
  billPrintedByOrderId: (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('grovit_printed_orders'))
    ? (() => {
        try {
          return JSON.parse(window.localStorage.getItem('grovit_printed_orders') || '{}');
        } catch {
          return {};
        }
      })()
    : {},
  productNameById: {},
  isLoadingOrders: false,
  isLoadingActiveOrder: false,
  isMutating: false,
  isEditingUnpaid: false,
  hasUnsavedChanges: false,
  isReadOnlyView: false,
  isWorkspaceEmpty: true,
  error: null,

  clearError: () => set({ error: null }),

  setProductCatalog: (products) => {
    const productNameById: Record<string, string> = {};
    for (const product of products) {
      productNameById[product.id] = product.name;
    }
    set((state) => ({
      productNameById,
      activeOrderItems: enrichItems(state.activeOrderItems, productNameById),
    }));
  },

  loadOrders: async () => {
    set({ isLoadingOrders: true, error: null });
    const ordersResult = await fetchOpenOrders();

    if (ordersResult.error) {
      set({ isLoadingOrders: false, error: ordersResult.error });
      return;
    }

    const allOrders = ordersResult.data ?? [];
    const orders = allOrders; // Unified store memory retains held/unpaid/kitchen
    const heldOrders = allOrders.filter((order) => order.status === 'held');
    const countsResult = await fetchOrderItemCounts(allOrders.map((order) => order.id));
    const itemCountByOrderId = countsResult.data ?? {};

    // Background execution: Repair missing bills for paid orders in background
    void repairMissingBills();

    // Bootstrapping sequence registry from loaded orders and their KOTs
    let highestKotVal = 0;
    let highestBillVal = 0;
    let highestOrderVal = 0;

    for (const order of allOrders) {
      if (order.invoice_number) {
        const num = parseInt(order.invoice_number.replace(/\D/g, ''), 10);
        if (!isNaN(num)) {
          highestBillVal = Math.max(highestBillVal, num);
        }
      }
      if (order.order_name) {
        const num = parseInt(order.order_name.replace(/\D/g, ''), 10);
        if (!isNaN(num)) {
          highestOrderVal = Math.max(highestOrderVal, num);
        }
      }
    }

    // Load KOT tickets for all open orders once on startup to extract the highest KOT number
    const startOrderIds = allOrders.map((o) => o.id);
    const startKotsResult = await fetchKotsForOrders(startOrderIds);
    const startKotsMap = startKotsResult.data ?? {};
    const kotNumbersByOrderId: Record<string, number[]> = {};

    for (const [orderId, tickets] of Object.entries(startKotsMap)) {
      const numsList: number[] = [];
      for (const t of tickets) {
        numsList.push(t.kot_number);
        highestKotVal = Math.max(highestKotVal, t.kot_number);
      }
      kotNumbersByOrderId[orderId] = numsList;
    }

    // Bootstrap local sequences registry dynamically
    bootstrapSequenceRegistry(highestKotVal, highestBillVal, highestOrderVal);

    // Fetch and populate summaries on startup
    const summariesResult = await getAllOrders();
    const summaries = summariesResult.data ?? [];

    set({
      orders,
      heldOrders,
      summaries,
      itemCountByOrderId,
      kotNumbersByOrderId,
      kotsByOrderId: startKotsMap,
      isLoadingOrders: false,
      error: null,
    });

    if (countsResult.error && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[Grovit] Order item counts unavailable:', countsResult.error);
    }

    // Restore or check working draft ID
    const storedActiveOrderId = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('grovit_active_order_id')
      : null;

    let draftToUse: OpenOrder | null = null;
    const { tenant_id, branch_id } = getTenantContext();

    if (storedActiveOrderId) {
      console.log('[useOrdersStore] loadOrders: restoring active order from localStorage', storedActiveOrderId);
      // Dual-tab stale session guard
      const { data: orderData } = await fetchOpenOrderById(storedActiveOrderId);
      if (orderData && orderData.status === 'draft') {
        draftToUse = orderData;
        console.log('[useOrdersStore] loadOrders: stored active order is valid draft');
      } else {
        console.log('[useOrdersStore] loadOrders: stored order is stale (paid/cancelled/not draft). Clearing localStorage.');
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem('grovit_active_order_id');
        }
      }
    }

    // If no valid draft was restored from localStorage, search for ANY existing draft in the DB
    if (!draftToUse) {
      console.log('[useOrdersStore] loadOrders: no valid localStorage draft. Querying DB for existing draft...');
      const { data: dbDrafts } = await supabase
        .from('open_orders')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });

      if (dbDrafts && dbDrafts.length > 0) {
        draftToUse = dbDrafts[0] as OpenOrder;
        console.log('[useOrdersStore] loadOrders: recovered existing DB draft', draftToUse.id);
      }
    }

    // Enforce selection of the draft order if found
    if (draftToUse) {
      console.log('[useOrdersStore] loadOrders: selecting recovered/restored draft order', draftToUse.id);
      await get().selectOrder(draftToUse.id);
      return;
    }

    console.log('[useOrdersStore] loadOrders: Starting with clean/empty cart.');
    set({ activeOrderId: null, activeOrderItems: [], isWorkspaceEmpty: true });
  },

  loadSummaries: async (silent = false) => {
    if (!silent) set({ isLoadingOrders: true, error: null });
    const result = await getAllOrders();
    if (result.error) {
      set({ error: result.error, isLoadingOrders: false });
    } else {
      const dbSummaries = result.data ?? [];
      set((state) => {
        // Merge dbSummaries into state.summaries.
        // If a local summary has status 'unpaid', 'held', 'cancelled', or 'paid'
        // and the incoming dbSummary has a less progressed status (e.g. 'draft'),
        // we keep the local summary to preserve our optimistic state during background write sync.
        const merged = dbSummaries.map((dbSum) => {
          const localSum = state.summaries.find((s) => s.order.id === dbSum.order.id);
          if (localSum) {
            const dbStatus = dbSum.order.status;
            const localStatus = localSum.order.status;
            if (
              (localStatus === 'unpaid' && dbStatus === 'draft') ||
              (localStatus === 'held' && dbStatus === 'draft') ||
              (localStatus === 'paid' && dbStatus !== 'paid') ||
              (localStatus === 'cancelled' && dbStatus !== 'cancelled')
            ) {
              return localSum;
            }
          }
          return dbSum;
        });

        // Also preserve any newly created optimistic orders that might not be in the DB yet at all!
        const missingFromDb = state.summaries.filter(
          (localSum) => !dbSummaries.some((dbSum) => dbSum.order.id === localSum.order.id)
        );

        return {
          summaries: [...missingFromDb, ...merged],
          isLoadingOrders: false,
        };
      });
    }
  },

  selectOrder: async (orderId) => {
    set({ isLoadingActiveOrder: true, error: null });
    const result = await fetchOpenOrderById(orderId);

    if (result.error || !result.data) {
      set({
        isLoadingActiveOrder: false,
        error: 'Could not open order. Please try again.',
      });
      return false;
    }

    let order = result.data;

    // Determine if this is a read-only inspection (closed order)
    const isReadOnly =
      order.status === 'cancelled' ||
      order.status === 'completed' ||
      order.status === 'paid';

    // Only transition held → draft for editable orders
    if (!isReadOnly && order.status === 'held') {
      const resumeResult = await resumeHeldOrder(orderId);
      if (resumeResult.error) {
        set({
          isLoadingActiveOrder: false,
          error: 'Could not open order. Please try again.',
        });
        return false;
      }
      order = {
        ...order,
        status: 'draft' as const,
        held_at: null,
      };

      set((state) => {
        const exists = state.orders.some((o) => o.id === orderId);
        const updatedOrders: OpenOrder[] = exists
          ? state.orders.map((o) =>
              o.id === orderId ? { ...o, status: 'draft' as const, held_at: null } : o
            )
          : [order as OpenOrder, ...state.orders];
        return {
          orders: updatedOrders,
          heldOrders: state.heldOrders.filter((o) => o.id !== orderId),
        };
      });
    }

    const { productNameById } = get();
    const activeOrderItems = enrichItems(
      order.items.map((item) => ({
        ...item,
        product_name: productNameById[item.product_id] ?? 'Item',
      })),
      productNameById,
    );

    console.log('[useOrdersStore] selectOrder: selected order', orderId);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('grovit_active_order_id', orderId);
    }

    // Fetch KOT numbers for the selected order dynamically
    const kotResult = await fetchKotsForOrders([orderId]);
    const orderKots = (kotResult.data ?? {})[orderId] ?? [];
    const kotNumbers = orderKots.map(k => k.kot_number);

    set((state) => {
      const exists = state.orders.some((o) => o.id === orderId);
      const updatedOrders = exists
        ? state.orders.map((o) => o.id === orderId ? order : o)
        : [order as OpenOrder, ...state.orders];
      return {
        orders: updatedOrders,
        activeOrderId: orderId,
        activeOrderItems,
        kotNumbersByOrderId: {
          ...state.kotNumbersByOrderId,
          [orderId]: kotNumbers,
        },
        kotsByOrderId: {
          ...state.kotsByOrderId,
          [orderId]: orderKots,
        },
        isLoadingActiveOrder: false,
        isEditingUnpaid: !isReadOnly && order.status === 'in_kitchen',
        hasUnsavedChanges: false,
        isReadOnlyView: isReadOnly,
        isWorkspaceEmpty: false,
        itemCountByOrderId: {
          ...state.itemCountByOrderId,
          [orderId]: getItemCount(activeOrderItems),
        },
      };
    });
    return true;
  },

  createOrder: async () => {
    const { activeOrderId, activeOrderItems, orders } = get();
    if (activeOrderId) {
      const activeOrder = orders.find((o) => o.id === activeOrderId);
      if (
        activeOrder &&
        (activeOrder.status === 'draft' || activeOrder.status === 'open') &&
        activeOrderItems.length === 0
      ) {
        // Reuse current empty draft to prevent blank cart spam
        return;
      }
    }
    console.log('[useOrdersStore] createOrder: starting fresh empty draft (clearing activeOrderId)');
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }
    set({
      activeOrderId: null,
      activeOrderItems: [],
      isWorkspaceEmpty: true,
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isReadOnlyView: false,
    });
  },

  addProductToActiveOrder: async (product, quantity = 1) => {
    const activeOrder = get().orders.find((o) => o.id === get().activeOrderId);
    const status = activeOrder?.status ?? 'draft';
    const isEditingUnpaid = get().isEditingUnpaid;
    const canEdit = status === 'draft' || status === 'open' || isEditingUnpaid;
    if (!canEdit) return;

    const snapshot = get();
    let activeOrderId = snapshot.activeOrderId;

    if (!activeOrderId) {
      set({ isMutating: true, error: null });
      const tableLabel = 'Draft Order';

      const result = await createOpenOrder(tableLabel, 'draft');
      if (result.error || !result.data) {
        set({
          isMutating: false,
          error: result.error ?? 'Unable to create order.',
        });
        return;
      }

      const createdOrder = result.data;
      activeOrderId = createdOrder.id;

      console.log('[useOrdersStore] addProductToActiveOrder: created new draft order in DB', createdOrder.id);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('grovit_active_order_id', createdOrder.id);
      }
      set((state) => ({
        orders: [createdOrder, ...state.orders],
        activeOrderId: createdOrder.id,
        isWorkspaceEmpty: false,
        itemCountByOrderId: {
          ...state.itemCountByOrderId,
          [createdOrder.id]: 0,
        },
      }));
    }

    const existingItem = get().activeOrderItems.find(
      (item) => item.product_id === product.id && item.kot_sent === false,
    );

    if (existingItem) {
      const nextQuantity = existingItem.qty + quantity;
      const targetItemId = existingItem.id;

      const nextItems = snapshot.activeOrderItems.map((item) =>
        item.id === targetItemId ? { ...item, qty: nextQuantity } : item,
      );

      set((state) => {
        const nextPrinted = { ...state.billPrintedByOrderId };
        if (activeOrderId) {
          delete nextPrinted[activeOrderId];
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextPrinted));
          }
        }
        return {
          activeOrderItems: nextItems,
          itemCountByOrderId: {
            ...state.itemCountByOrderId,
            [activeOrderId]: getItemCount(nextItems),
          },
          isMutating: true,
          error: null,
          billPrintedByOrderId: nextPrinted,
        };
      });

      if (targetItemId.startsWith('temp-item')) {
        set((state) => ({
          isMutating: false,
          hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
        }));
        return;
      }

      const result = await updateOrderItemQuantity(targetItemId, nextQuantity);
      if (result.error) {
        set({
          activeOrderItems: snapshot.activeOrderItems,
          itemCountByOrderId: snapshot.itemCountByOrderId,
          isMutating: false,
          error: result.error,
        });
      } else {
        set((state) => ({
          isMutating: false,
          hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
        }));
      }
      return;
    }

    const tempItemId = createTempId('temp-item');
    const optimisticItem: PosOrderItem = {
      id: tempItemId,
      open_order_id: activeOrderId,
      product_id: product.id,
      item_name: product.name,
      qty: quantity,
      price: product.price,
      notes: null,
      kot_sent: false,
      product_name: product.name,
    };

    const nextItems = [...snapshot.activeOrderItems, optimisticItem];
    const nextCount = getItemCount(nextItems);

    set((state) => {
      const nextPrinted = { ...state.billPrintedByOrderId };
      if (activeOrderId) {
        delete nextPrinted[activeOrderId];
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextPrinted));
        }
      }
      return {
        activeOrderItems: nextItems,
        itemCountByOrderId: {
          ...state.itemCountByOrderId,
          [activeOrderId]: nextCount,
        },
        isMutating: true,
        error: null,
        billPrintedByOrderId: nextPrinted,
      };
    });

    if (activeOrderId.startsWith('temp-order')) {
      set({ isMutating: false, error: 'Order is still being created. Try again.' });
      return;
    }

    const result = await addOrderItem({
      openOrderId: activeOrderId,
      productId: product.id,
      itemName: product.name,
      quantity: quantity,
      price: product.price,
    });

    if (result.error || !result.data) {
      set({
        activeOrderItems: snapshot.activeOrderItems,
        itemCountByOrderId: snapshot.itemCountByOrderId,
        isMutating: false,
        error: result.error ?? 'Unable to add item.',
      });
      return;
    }

    const savedItem: PosOrderItem = {
      ...result.data,
      product_name: product.name,
    };

    set((state) => ({
      activeOrderItems: state.activeOrderItems.map((item) =>
        item.id === tempItemId ? savedItem : item,
      ),
      hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      isWorkspaceEmpty: false,
      isMutating: false,
    }));
  },

  incrementItem: async (itemId) => {
    const activeOrder = get().orders.find((o) => o.id === get().activeOrderId);
    const status = activeOrder?.status ?? 'draft';
    const isEditingUnpaid = get().isEditingUnpaid;
    const canEdit = status === 'draft' || status === 'open' || isEditingUnpaid;
    if (!canEdit) return;

    const snapshot = get();
    const target = snapshot.activeOrderItems.find((item) => item.id === itemId);
    if (!target || !snapshot.activeOrderId || target.kot_sent) {
      return;
    }

    const nextQuantity = target.qty + 1;
    const nextItems = snapshot.activeOrderItems.map((item) =>
      item.id === itemId ? { ...item, qty: nextQuantity } : item,
    );

    set((state) => {
      const nextPrinted = { ...state.billPrintedByOrderId };
      const activeOrderId = state.activeOrderId;
      if (activeOrderId) {
        delete nextPrinted[activeOrderId];
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextPrinted));
        }
      }
      return {
        activeOrderItems: nextItems,
        itemCountByOrderId: {
          ...state.itemCountByOrderId,
          [activeOrderId || '']: getItemCount(nextItems),
        },
        isMutating: true,
        error: null,
        billPrintedByOrderId: nextPrinted,
      };
    });

    if (itemId.startsWith('temp-item')) {
      set((state) => ({
        isMutating: false,
        hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      }));
      return;
    }

    const result = await updateOrderItemQuantity(itemId, nextQuantity);
    if (result.error) {
      set({
        activeOrderItems: snapshot.activeOrderItems,
        itemCountByOrderId: snapshot.itemCountByOrderId,
        isMutating: false,
        error: result.error,
      });
    } else {
      set((state) => ({
        isMutating: false,
        hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      }));
    }
  },

  decrementItem: async (itemId) => {
    const activeOrder = get().orders.find((o) => o.id === get().activeOrderId);
    const status = activeOrder?.status ?? 'draft';
    const isEditingUnpaid = get().isEditingUnpaid;
    const canEdit = status === 'draft' || status === 'open' || isEditingUnpaid;
    if (!canEdit) return;

    const snapshot = get();
    const target = snapshot.activeOrderItems.find((item) => item.id === itemId);
    if (!target || !snapshot.activeOrderId || target.kot_sent) {
      return;
    }

    if (target.qty <= 1) {
      await get().removeItem(itemId);
      return;
    }

    const nextQuantity = target.qty - 1;
    const nextItems = snapshot.activeOrderItems.map((item) =>
      item.id === itemId ? { ...item, qty: nextQuantity } : item,
    );

    set((state) => {
      const nextPrinted = { ...state.billPrintedByOrderId };
      const activeOrderId = state.activeOrderId;
      if (activeOrderId) {
        delete nextPrinted[activeOrderId];
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextPrinted));
        }
      }
      return {
        activeOrderItems: nextItems,
        itemCountByOrderId: {
          ...state.itemCountByOrderId,
          [activeOrderId || '']: getItemCount(nextItems),
        },
        isMutating: true,
        error: null,
        billPrintedByOrderId: nextPrinted,
      };
    });

    if (itemId.startsWith('temp-item')) {
      set((state) => ({
        isMutating: false,
        hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      }));
      return;
    }

    const result = await updateOrderItemQuantity(itemId, nextQuantity);
    if (result.error) {
      set({
        activeOrderItems: snapshot.activeOrderItems,
        itemCountByOrderId: snapshot.itemCountByOrderId,
        isMutating: false,
        error: result.error,
      });
    } else {
      set((state) => ({
        isMutating: false,
        hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      }));
    }
  },

  removeItem: async (itemId) => {
    const activeOrder = get().orders.find((o) => o.id === get().activeOrderId);
    const status = activeOrder?.status ?? 'draft';
    const isEditingUnpaid = get().isEditingUnpaid;
    const canEdit = status === 'draft' || status === 'open' || isEditingUnpaid;
    if (!canEdit) return;

    const snapshot = get();
    const target = snapshot.activeOrderItems.find((item) => item.id === itemId);
    if (!target || !snapshot.activeOrderId || target.kot_sent) {
      return;
    }

    const nextItems = snapshot.activeOrderItems.filter((item) => item.id !== itemId);
    set((state) => {
      const nextPrinted = { ...state.billPrintedByOrderId };
      const activeOrderId = state.activeOrderId;
      if (activeOrderId) {
        delete nextPrinted[activeOrderId];
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextPrinted));
        }
      }
      return {
        activeOrderItems: nextItems,
        itemCountByOrderId: {
          ...state.itemCountByOrderId,
          [activeOrderId || '']: getItemCount(nextItems),
        },
        isMutating: true,
        error: null,
        billPrintedByOrderId: nextPrinted,
      };
    });

    if (itemId.startsWith('temp-item')) {
      set((state) => ({
        isMutating: false,
        hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      }));
      return;
    }

    const result = await removeOrderItem(itemId);
    if (result.error) {
      set({
        activeOrderItems: snapshot.activeOrderItems,
        itemCountByOrderId: snapshot.itemCountByOrderId,
        isMutating: false,
        error: result.error,
      });
    } else {
      set((state) => ({
        isMutating: false,
        hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      }));
    }
  },

  resetCart: async () => {
    const activeOrder = get().orders.find((o) => o.id === get().activeOrderId);
    const status = activeOrder?.status ?? 'draft';
    const isEditingUnpaid = get().isEditingUnpaid;
    const canEdit = status === 'draft' || status === 'open' || isEditingUnpaid;
    if (!canEdit) return;

    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) return;

    set({ isMutating: true, error: null });

    const result = await clearOpenOrderItems(activeOrderId);
    if (result.error) {
      set({ isMutating: false, error: result.error });
      return;
    }

    set((state) => ({
      activeOrderItems: [],
      itemCountByOrderId: {
        ...state.itemCountByOrderId,
        [activeOrderId]: 0,
      },
      hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
      isWorkspaceEmpty: true,
      isMutating: false,
    }));
  },

  holdOrder: async () => {
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) return;

    const activeOrder = snapshot.orders.find((o) => o.id === activeOrderId);
    if (!activeOrder || (activeOrder.status !== 'draft' && activeOrder.status !== 'open')) {
      return;
    }

    set({ isMutating: true, error: null });

    const heldAt = new Date().toISOString();

    const result = await holdOpenOrder(activeOrderId, heldAt);
    if (result.error) {
      set({
        isMutating: false,
        error: 'Connection issue. Please check internet and try again.',
      });
      return;
    }

    console.log('[useOrdersStore] holdOrder: held order', activeOrderId);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }
    set((state) => {
      const orderItems = state.activeOrderItems;
      const totalAmount = orderItems.reduce((sum, item) => sum + item.qty * (item.price ?? 0), 0);
      const itemCount = orderItems.reduce((sum, item) => sum + item.qty, 0);
      const previewItems = orderItems.slice(0, 3).map((item) => ({
        name: item.product_name || item.item_name || 'Item',
        quantity: item.qty,
      }));
      const remainingItemLines = Math.max(0, orderItems.length - 3);

      const optimisticSummary: OpenOrderSummary = {
        order: { ...activeOrder, status: 'held' as const, held_at: heldAt },
        itemCount,
        created_at: activeOrder.created_at || new Date().toISOString(),
        previewItems,
        remainingItemLines,
        totalAmount,
        kotNumbers: state.kotNumbersByOrderId[activeOrderId] ?? [],
      };

      const existsInSummaries = state.summaries.some((s) => s.order.id === activeOrderId);
      const nextSummaries = existsInSummaries
        ? state.summaries.map((s) => (s.order.id === activeOrderId ? optimisticSummary : s))
        : [optimisticSummary, ...state.summaries];

      return {
        orders: state.orders.map((order) =>
          order.id === activeOrderId
            ? { ...order, status: 'held' as const, held_at: heldAt }
            : order
        ),
        heldOrders: [
          { ...activeOrder, status: 'held' as const, held_at: heldAt },
          ...state.heldOrders.filter((o) => o.id !== activeOrderId),
        ],
        summaries: nextSummaries,
        activeOrderId: null,
        activeOrderItems: [],
        isWorkspaceEmpty: true,
        isMutating: false,
      };
    });
  },

  saveKot: async () => {
    console.time('saveKot_total');
    console.time('saveKot_ui');
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) {
      console.timeEnd('saveKot_ui');
      console.timeEnd('saveKot_total');
      return false;
    }

    if (snapshot.activeOrderItems.length === 0) {
      set({ error: 'Cannot save KOT for an empty cart.' });
      console.timeEnd('saveKot_ui');
      console.timeEnd('saveKot_total');
      return false;
    }

    const activeOrder = snapshot.orders.find((o) => o.id === activeOrderId);
    if (!activeOrder) {
      set({ error: 'Connection issue. Please check internet and try again.' });
      console.timeEnd('saveKot_ui');
      console.timeEnd('saveKot_total');
      return false;
    }

    const wasDraft = activeOrder.status === 'draft' || activeOrder.status === 'open';
    const nextKotNumber = getNextKotNumber();
    const nextOrderName = activeOrder.order_name;

    const unsentItems = snapshot.activeOrderItems.filter((item) => !item.kot_sent);

    if (unsentItems.length === 0) {
      set({ error: 'No changes since last KOT.' });
      console.timeEnd('saveKot_ui');
      console.timeEnd('saveKot_total');
      return false;
    }

    const itemsToSend: { name: string; quantity: number }[] = unsentItems.map((item) => ({
      name: item.product_name || item.item_name,
      quantity: item.qty,
    }));

    // Sim print KOT
    printerService.printKot(nextKotNumber, itemsToSend);

    // Construct optimistic mock KOT ticket
    const mockTicket: KotTicket = {
      id: `kot-uuid-optimistic-${Date.now()}`,
      tenant_id: activeOrder.tenant_id,
      branch_id: activeOrder.branch_id,
      open_order_id: activeOrderId,
      kot_number: nextKotNumber,
      status: 'pending',
      printed_at: null,
      created_at: new Date().toISOString(),
      kot_items: itemsToSend.map((item, idx) => ({
        id: `kot-item-uuid-optimistic-${idx}-${Date.now()}`,
        kot_id: `kot-uuid-optimistic-${Date.now()}`,
        item_name: item.name,
        qty: item.quantity,
        notes: null,
      })),
    };

    const nextKotNumbers = [...(snapshot.kotNumbersByOrderId[activeOrderId] ?? []), nextKotNumber];
    const nextKots = [...(snapshot.kotsByOrderId[activeOrderId] ?? []), mockTicket];

    // Build optimistic OpenOrderSummary (merging duplicate products for clean bill presentation)
    const orderItems = snapshot.activeOrderItems;
    const totalAmount = orderItems.reduce((sum, item) => sum + item.qty * (item.price ?? 0), 0);
    const itemCount = orderItems.reduce((sum, item) => sum + item.qty, 0);
    
    const mergedPreviewsMap: Record<string, number> = {};
    for (const item of orderItems) {
      const name = item.product_name || item.item_name || 'Item';
      mergedPreviewsMap[name] = (mergedPreviewsMap[name] ?? 0) + item.qty;
    }
    const mergedPreviews = Object.entries(mergedPreviewsMap).map(([name, quantity]) => ({
      name,
      quantity,
    }));
    const previewItems = mergedPreviews.slice(0, 3);
    const remainingItemLines = Math.max(0, mergedPreviews.length - 3);

    const optimisticSummary: OpenOrderSummary = {
      order: {
        ...activeOrder,
        status: 'in_kitchen' as const,
        order_name: nextOrderName,
      },
      itemCount,
      created_at: activeOrder.created_at || new Date().toISOString(),
      previewItems,
      remainingItemLines,
      totalAmount,
      kotNumbers: nextKotNumbers,
    };

    const existsInSummaries = snapshot.summaries.some((s) => s.order.id === activeOrderId);
    const nextSummaries = existsInSummaries
      ? snapshot.summaries.map((s) => (s.order.id === activeOrderId ? optimisticSummary : s))
      : [optimisticSummary, ...snapshot.summaries];
    
    // Optimistically transition cart items to kot_sent: true
    const updatedOrderItems = orderItems.map((item) => ({
      ...item,
      kot_sent: true,
    }));

    // OPTIMISTIC UPDATE: transition status, update items inside cart to kot_sent: true, DO NOT CLEAR CART OR DESELECT ORDER!
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === activeOrderId ? { ...o, status: 'unpaid' as const, order_name: nextOrderName } : o
      ),
      summaries: nextSummaries,
      activeOrderItems: updatedOrderItems, // KEEP IN CART BUT MARK KOT_SENT
      isWorkspaceEmpty: false,
      isEditingUnpaid: true, // Keep open editing unpaid
      hasUnsavedChanges: false,
      isMutating: false,
      kotNumbersByOrderId: {
        ...state.kotNumbersByOrderId,
        [activeOrderId]: nextKotNumbers,
      },
      kotsByOrderId: {
        ...state.kotsByOrderId,
        [activeOrderId]: nextKots,
      },
    }));

    console.timeEnd('saveKot_ui');

    // Background Database Persistence (Quiet and non-blocking)
    console.time('saveKot_db');
    (async () => {
      try {
        const createResult = await createKot(activeOrderId, itemsToSend);
        if (createResult.error || !createResult.data) {
          throw new Error(createResult.error ?? 'Database KOT insert failed');
        }

        const unsentItemIds = unsentItems.map((item) => item.id);
        const { error: itemsUpdateError } = await supabase
          .from('open_order_items')
          .update({ kot_sent: true })
          .in('id', unsentItemIds);

        if (itemsUpdateError) {
          throw itemsUpdateError;
        }

        const { tenant_id, branch_id } = getTenantContext();
        const updatePayload: any = { status: 'in_kitchen' };
        if (wasDraft) {
          updatePayload.order_name = nextOrderName;
        }

        const { error: orderError } = await supabase
          .from('open_orders')
          .update(updatePayload)
          .eq('id', activeOrderId)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);

        if (orderError) {
          throw orderError;
        }

        // Replace mock optimistic ticket with final confirmed database ticket
        const dbTicket = createResult.data;
        set((state) => {
          const currentKots = state.kotsByOrderId[activeOrderId] ?? [];
          const cleanedKots = currentKots.map((k) =>
            k.id.includes('optimistic') ? dbTicket : k
          );
          return {
            kotsByOrderId: {
              ...state.kotsByOrderId,
              [activeOrderId]: cleanedKots,
            },
          };
        });

        console.log('[useOrdersStore] Background saveKot success!');
      } catch (dbErr) {
        console.error('[useOrdersStore] Background saveKot failed, rolling back:', dbErr);
        // Rollback both states perfectly
        set({
          orders: snapshot.orders,
          summaries: snapshot.summaries,
          activeOrderId: snapshot.activeOrderId,
          activeOrderItems: snapshot.activeOrderItems,
          isWorkspaceEmpty: snapshot.isWorkspaceEmpty,
          isEditingUnpaid: snapshot.isEditingUnpaid,
          hasUnsavedChanges: snapshot.hasUnsavedChanges,
          kotNumbersByOrderId: snapshot.kotNumbersByOrderId,
          kotsByOrderId: snapshot.kotsByOrderId,
          error: 'Connection issue. KOT was not saved. Please check internet and try again.',
        });
      } finally {
        console.timeEnd('saveKot_db');
        console.timeEnd('saveKot_total');
      }
    })();

    return true;
  },

  saveAndPrint: async () => {
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) {
      return false;
    }

    if (snapshot.activeOrderItems.length === 0) {
      set({ error: 'Cannot Save & Print for an empty cart.' });
      return false;
    }

    const activeOrder = snapshot.orders.find((o) => o.id === activeOrderId);
    if (!activeOrder) {
      set({ error: 'Connection issue. Please check internet and try again.' });
      return false;
    }

    const wasDraft = activeOrder.status === 'draft' || activeOrder.status === 'open';
    const unsentItems = snapshot.activeOrderItems.filter((item) => !item.kot_sent);

    let nextOrderName = activeOrder.order_name;
    let nextOrderNum = 0;
    
    // Scenario 2: No unsent items and already unpaid (legacy) — print bill, mark confirmed, exit
    if (unsentItems.length === 0 && (activeOrder.status === 'unpaid' || activeOrder.status === 'in_kitchen')) {
      const totalAmount = snapshot.activeOrderItems.reduce((sum, item) => sum + item.qty * (item.price ?? 0), 0);
      printerService.printBill(
        activeOrder.order_name,
        activeOrder.invoice_number,
        snapshot.activeOrderItems,
        totalAmount,
        false // provisional bill
      );
      set((state) => {
        const nextPrinted = {
          ...state.billPrintedByOrderId,
          [activeOrderId]: true,
        };
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextPrinted));
        }
        return {
          orders: state.orders.map((o) =>
            o.id === activeOrderId ? { ...o, status: 'confirmed' as const } : o
          ),
          summaries: state.summaries.map((s) =>
            s.order.id === activeOrderId ? { ...s, order: { ...s.order, status: 'confirmed' as const } } : s
          ),
          billPrintedByOrderId: nextPrinted,
          isEditingUnpaid: false,
          hasUnsavedChanges: false,
        };
      });
      // Background DB update: transition to confirmed
      const { tenant_id, branch_id } = getTenantContext();
      void supabase
        .from('open_orders')
        .update({ status: 'confirmed' })
        .eq('id', activeOrderId)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);
      return true;
    }

    // No client-side order number generation here

    // Let's handle KOT if there are unsent items
    let nextKotNumber = 0;
    let itemsToSend: { name: string; quantity: number }[] = [];
    let mockTicket: KotTicket | null = null;
    let nextKotNumbers = snapshot.kotNumbersByOrderId[activeOrderId] ?? [];
    let nextKots = snapshot.kotsByOrderId[activeOrderId] ?? [];

    if (unsentItems.length > 0) {
      nextKotNumber = getNextKotNumber();
      itemsToSend = unsentItems.map((item) => ({
        name: item.product_name || item.item_name,
        quantity: item.qty,
      }));

      // Sim print KOT
      printerService.printKot(nextKotNumber, itemsToSend);

      // Construct optimistic mock KOT ticket
      mockTicket = {
        id: `kot-uuid-optimistic-${Date.now()}`,
        tenant_id: activeOrder.tenant_id,
        branch_id: activeOrder.branch_id,
        open_order_id: activeOrderId,
        kot_number: nextKotNumber,
        status: 'pending',
        printed_at: null,
        created_at: new Date().toISOString(),
        kot_items: itemsToSend.map((item, idx) => ({
          id: `kot-item-uuid-optimistic-${idx}-${Date.now()}`,
          kot_id: `kot-uuid-optimistic-${Date.now()}`,
          item_name: item.name,
          qty: item.quantity,
          notes: null,
        })),
      };

      nextKotNumbers = [...nextKotNumbers, nextKotNumber];
      nextKots = [...nextKots, mockTicket];
    }

    // Prepare billing items (all of them since F3 prints everything provisional)
    const orderItems = snapshot.activeOrderItems;
    const totalAmount = orderItems.reduce((sum, item) => sum + item.qty * (item.price ?? 0), 0);
    const itemCount = orderItems.reduce((sum, item) => sum + item.qty, 0);

    // Sim print provisional bill
    printerService.printBill(
      nextOrderName,
      activeOrder.invoice_number,
      orderItems,
      totalAmount,
      false // provisional
    );

    // Optimistically transition cart items to kot_sent: true
    const updatedOrderItems = orderItems.map((item) => ({
      ...item,
      kot_sent: true,
    }));

    // Build optimistic OpenOrderSummary
    const mergedPreviewsMap: Record<string, number> = {};
    for (const item of updatedOrderItems) {
      const name = item.product_name || item.item_name || 'Item';
      mergedPreviewsMap[name] = (mergedPreviewsMap[name] ?? 0) + item.qty;
    }
    const mergedPreviews = Object.entries(mergedPreviewsMap).map(([name, quantity]) => ({
      name,
      quantity,
    }));
    const previewItems = mergedPreviews.slice(0, 3);
    const remainingItemLines = Math.max(0, mergedPreviews.length - 3);

    const optimisticSummary: OpenOrderSummary = {
      order: {
        ...activeOrder,
        status: 'confirmed' as const,
        order_name: nextOrderName,
      },
      itemCount,
      created_at: activeOrder.created_at || new Date().toISOString(),
      previewItems,
      remainingItemLines,
      totalAmount,
      kotNumbers: nextKotNumbers,
    };

    const existsInSummaries = snapshot.summaries.some((s) => s.order.id === activeOrderId);
    const nextSummaries = existsInSummaries
      ? snapshot.summaries.map((s) => (s.order.id === activeOrderId ? optimisticSummary : s))
      : [optimisticSummary, ...snapshot.summaries];

    // OPTIMISTIC UPDATE: transition status, update items inside cart to kot_sent: true, DO NOT CLEAR CART OR SPAWN DRAFT!
    set((state) => {
      const nextPrinted = {
        ...state.billPrintedByOrderId,
        [activeOrderId]: true,
      };
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextPrinted));
      }
      return {
        orders: state.orders.map((o) =>
          o.id === activeOrderId ? { ...o, status: 'confirmed' as const, order_name: nextOrderName } : o
        ),
        summaries: nextSummaries,
        activeOrderItems: updatedOrderItems, // KEEP IN CART BUT MARK KOT_SENT
        isWorkspaceEmpty: false,
        isEditingUnpaid: false, // Exit edit mode upon printing provisional bill
        hasUnsavedChanges: false,
        isMutating: false,
        kotNumbersByOrderId: {
          ...state.kotNumbersByOrderId,
          [activeOrderId]: nextKotNumbers,
        },
        kotsByOrderId: {
          ...state.kotsByOrderId,
          [activeOrderId]: nextKots,
        },
        billPrintedByOrderId: nextPrinted,
      };
    });

    // Background Database Persistence
    (async () => {
      try {
        if (unsentItems.length > 0) {
          const createResult = await createKot(activeOrderId, itemsToSend);
          if (createResult.error || !createResult.data) {
            throw new Error(createResult.error ?? 'Database KOT insert failed');
          }

          const unsentItemIds = unsentItems.map((item) => item.id);
          const { error: itemsUpdateError } = await supabase
            .from('open_order_items')
            .update({ kot_sent: true })
            .in('id', unsentItemIds);

          if (itemsUpdateError) {
            throw itemsUpdateError;
          }

          // Replace mock optimistic ticket with final confirmed database ticket
          const dbTicket = createResult.data;
          set((state) => {
            const currentKots = state.kotsByOrderId[activeOrderId] ?? [];
            const cleanedKots = currentKots.map((k) =>
              k.id.includes('optimistic') ? dbTicket : k
            );
            return {
              kotsByOrderId: {
                ...state.kotsByOrderId,
                [activeOrderId]: cleanedKots,
              },
            };
          });
        }

        // Only do DB write to order status / order name when coming from draft/open or in_kitchen
        if (wasDraft || activeOrder.status === 'in_kitchen') {
          const { tenant_id, branch_id } = getTenantContext();
          const { error: orderError } = await supabase
            .from('open_orders')
            .update({
              status: 'confirmed',
              order_name: nextOrderName,
            })
            .eq('id', activeOrderId)
            .eq('tenant_id', tenant_id)
            .eq('branch_id', branch_id);

          if (orderError) {
            throw orderError;
          }
        }

        console.log('[useOrdersStore] Background saveAndPrint success!');
      } catch (dbErr) {
        console.error('[useOrdersStore] Background saveAndPrint failed, rolling back:', dbErr);
        // Rollback states
        set({
          orders: snapshot.orders,
          summaries: snapshot.summaries,
          activeOrderId: snapshot.activeOrderId,
          activeOrderItems: snapshot.activeOrderItems,
          isWorkspaceEmpty: snapshot.isWorkspaceEmpty,
          isEditingUnpaid: snapshot.isEditingUnpaid,
          hasUnsavedChanges: snapshot.hasUnsavedChanges,
          kotNumbersByOrderId: snapshot.kotNumbersByOrderId,
          kotsByOrderId: snapshot.kotsByOrderId,
          error: 'Connection issue. Changes were not saved. Please check internet and try again.',
        });
      }
    })();

    return true;
  },

  settleBill: async (paymentType = 'cash') => {
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) {
      return { data: null, error: 'No active order selected.' };
    }

    console.time('settleBill');
    set({ isMutating: true, error: null });

    try {
      // 1. Await database write confirmation
      const result = await settleOrderById(activeOrderId, paymentType);
      
      if (result.error || !result.data) {
        throw new Error(result.error ?? 'Database settlement failed.');
      }

      const settledOrder = result.data;

      // 2. Clear UI & Update summaries
      set((state) => {
        const nextBillPrinted = { ...state.billPrintedByOrderId };
        delete nextBillPrinted[activeOrderId];
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextBillPrinted));
        }
        return {
          orders: state.orders.filter((o) => o.id !== activeOrderId),
          summaries: state.summaries.map((s) =>
            s.order.id === activeOrderId
              ? {
                  ...s,
                  order: settledOrder,
                }
              : s
          ),
          activeOrderId: null,
          activeOrderItems: [],
          isWorkspaceEmpty: true,
          isEditingUnpaid: false,
          hasUnsavedChanges: false,
          isMutating: false,
          billPrintedByOrderId: nextBillPrinted,
        };
      });

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('grovit_active_order_id');
      }

      return { data: settledOrder, error: null };
    } catch (err: any) {
      console.error('[useOrdersStore] Settle bill failed:', err);
      set({ isMutating: false, error: err.message || 'Settlement failed.' });
      return { data: null, error: err.message || 'Settlement failed.' };
    } finally {
      console.timeEnd('settleBill');
    }
  },

  cancelOrder: async () => {
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) return;

    const activeOrder = snapshot.orders.find((o) => o.id === activeOrderId);
    if (!activeOrder) {
      set({ error: 'Connection issue. Please check internet and try again.' });
      return;
    }

    const allowed = ['draft', 'held', 'unpaid', 'open', 'in_kitchen', 'confirmed'].includes(activeOrder.status);
    if (!allowed) {
      set({ error: 'This order status cannot be cancelled.' });
      return;
    }

    set({ isMutating: true, error: null });

    const cancelledAt = new Date().toISOString();

    // OPTIMISTIC UPDATE: filter out from active/held list and set summary as cancelled immediately
    set((state) => {
      const nextBillPrinted = { ...state.billPrintedByOrderId };
      delete nextBillPrinted[activeOrderId];
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('grovit_printed_orders', JSON.stringify(nextBillPrinted));
      }
      return {
        orders: state.orders.filter((o) => o.id !== activeOrderId),
        heldOrders: state.heldOrders.filter((o) => o.id !== activeOrderId),
        summaries: state.summaries.map((s) =>
          s.order.id === activeOrderId
            ? {
                ...s,
                order: {
                  ...s.order,
                  status: 'cancelled' as const,
                  cancelled_at: cancelledAt,
                },
              }
            : s
        ),
        activeOrderId: null,
        activeOrderItems: [],
        isWorkspaceEmpty: true,
        isEditingUnpaid: false,
        hasUnsavedChanges: false,
        isMutating: false,
        billPrintedByOrderId: nextBillPrinted,
      };
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }

    const { tenant_id, branch_id } = getTenantContext();

    // Background Database Persistence
    (async () => {
      try {
        const { error } = await supabase
          .from('open_orders')
          .update({
            status: 'cancelled',
            cancelled_at: cancelledAt,
          })
          .eq('id', activeOrderId)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);

        if (error) {
          throw error;
        }
        console.log('[useOrdersStore] Background cancelOrder success!');
      } catch (dbErr) {
        console.error('[useOrdersStore] Background cancelOrder failed, rolling back:', dbErr);
        // Rollback
        set({
          orders: snapshot.orders,
          heldOrders: snapshot.heldOrders,
          summaries: snapshot.summaries,
          activeOrderId: snapshot.activeOrderId,
          activeOrderItems: snapshot.activeOrderItems,
          isWorkspaceEmpty: snapshot.isWorkspaceEmpty,
          isEditingUnpaid: snapshot.isEditingUnpaid,
          hasUnsavedChanges: snapshot.hasUnsavedChanges,
          error: 'Connection issue. Order was not cancelled. Please try again.',
        });
      }
    })();
  },

  enterEditMode: () => {
    set({
      isEditingUnpaid: true,
      hasUnsavedChanges: false,
    });
  },

  discardChanges: async () => {
    const activeOrderId = get().activeOrderId;
    if (!activeOrderId) return;

    set({ isMutating: true, error: null });
    await get().selectOrder(activeOrderId);
    set({
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isMutating: false,
    });
  },
}));
