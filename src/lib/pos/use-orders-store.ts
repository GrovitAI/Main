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
  createOrUpdateBill,
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
  discountType: 'percent' | 'fixed' | null;
  discountPercent: number;
  discountAmount: number;
  setDiscount: (type: 'percent' | 'fixed' | null, value: number) => Promise<void>;
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

function calculateDiscountLocal(
  subtotal: number,
  type: 'percent' | 'fixed' | null,
  percent: number,
  amount: number
) {
  if (!type) {
    return { percent: 0, amount: 0 };
  }
  if (type === 'percent') {
    const p = Math.min(100, Math.max(0, percent));
    const a = Math.round((subtotal * p / 100.0) * 100) / 100;
    return { percent: p, amount: a };
  } else {
    const a = Math.min(subtotal, Math.max(0, amount));
    const p = subtotal > 0 ? Math.min(100, Math.max(0, (a / subtotal) * 100)) : 0;
    return { percent: p, amount: a };
  }
}

async function syncActiveOrderDiscountInDb(
  orderId: string,
  type: 'percent' | 'fixed' | null,
  value: number,
  amount: number
) {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    await supabase
      .from('open_orders')
      .update({
        discount_type: type,
        discount_value: value,
        discount_amount: amount
      })
      .eq('id', orderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);
  } catch (err) {
    console.error('[syncActiveOrderDiscountInDb] Failed to update discount:', err);
  }
}

function updateDiscountStateAndDb(
  state: any,
  nextItems: PosOrderItem[],
  activeOrderId: string
) {
  const nextSubtotal = nextItems.reduce((acc, item) => acc + (item.qty * (item.price || 0)), 0);
  const { percent, amount } = calculateDiscountLocal(
    nextSubtotal,
    state.discountType,
    state.discountPercent,
    state.discountAmount
  );
  void syncActiveOrderDiscountInDb(
    activeOrderId,
    state.discountType,
    state.discountType === 'percent' ? percent : amount,
    amount
  );
  return { percent, amount };
}

function calculateKotCancellations(
  kots: KotTicket[],
  activeOrderItems: PosOrderItem[]
): { name: string; quantity: number; notes: string }[] {
  const sentQuantities: Record<string, number> = {};
  for (const kot of kots) {
    if (kot.kot_items) {
      for (const item of kot.kot_items) {
        sentQuantities[item.item_name] = (sentQuantities[item.item_name] ?? 0) + item.qty;
      }
    }
  }

  const currentQuantities: Record<string, number> = {};
  for (const item of activeOrderItems) {
    const name = item.product_name || item.item_name;
    currentQuantities[name] = (currentQuantities[name] ?? 0) + item.qty;
  }

  const itemsToCancel: { name: string; quantity: number; notes: string }[] = [];
  for (const [name, qty] of Object.entries(sentQuantities)) {
    const currQty = currentQuantities[name] ?? 0;
    if (currQty < qty) {
      const diff = qty - currQty;
      const reason = currQty === 0 ? 'Item Removed' : 'Quantity Reduced';
      itemsToCancel.push({ name, quantity: -diff, notes: reason });
    }
  }
  return itemsToCancel;
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
  discountType: null,
  discountPercent: 0,
  discountAmount: 0,

  clearError: () => set({ error: null }),

  setDiscount: async (type, value) => {
    const { activeOrderId, activeOrderItems } = get();
    if (!activeOrderId) return;

    const subtotal = activeOrderItems.reduce((acc, item) => acc + (item.qty * (item.price || 0)), 0);
    
    let percent = 0;
    let amount = 0;

    if (type === 'percent') {
      percent = Math.min(100, Math.max(0, value));
      amount = Math.round((subtotal * percent / 100.0) * 100) / 100;
    } else if (type === 'fixed') {
      amount = Math.min(subtotal, Math.max(0, value));
      percent = subtotal > 0 ? Math.min(100, Math.max(0, (amount / subtotal) * 100)) : 0;
    }

    set((state) => ({
      discountType: type,
      discountPercent: percent,
      discountAmount: amount,
      hasUnsavedChanges: state.isEditingUnpaid ? true : state.hasUnsavedChanges,
    }));

    const valInDb = type === 'percent' ? percent : amount;
    void syncActiveOrderDiscountInDb(activeOrderId, type, valInDb, amount);
  },

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
      const isRestorable = orderData &&
        orderData.status !== 'paid' &&
        orderData.status !== 'completed' &&
        orderData.status !== 'cancelled';

      if (isRestorable) {
        draftToUse = orderData;
        console.log('[useOrdersStore] loadOrders: stored active order is restorable:', orderData.status);
      } else {
        console.log('[useOrdersStore] loadOrders: stored order is stale (paid/completed/cancelled). Clearing localStorage.');
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
              ((localStatus === 'unpaid' || localStatus === 'in_kitchen') && dbStatus === 'draft') ||
              (localStatus === 'unpaid' && dbStatus === 'in_kitchen') ||
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

    const subtotal = activeOrderItems.reduce((acc, item) => acc + (item.qty * (item.price || 0)), 0);
    const discountType = order.discount_type || null;
    const discountValue = Number(order.discount_value) || 0;
    const discountAmountVal = Number(order.discount_amount) || 0;

    let discountPercent = 0;
    if (discountType === 'percent') {
      discountPercent = discountValue;
    } else if (discountType === 'fixed') {
      discountPercent = subtotal > 0 ? (discountAmountVal / subtotal) * 100 : 0;
    }

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
        discountType,
        discountPercent,
        discountAmount: discountAmountVal,
        kotNumbersByOrderId: {
          ...state.kotNumbersByOrderId,
          [orderId]: kotNumbers,
        },
        kotsByOrderId: {
          ...state.kotsByOrderId,
          [orderId]: orderKots,
        },
        isLoadingActiveOrder: false,
        isEditingUnpaid: !isReadOnly && (order.status === 'in_kitchen' || order.status === 'unpaid' || order.status === 'payment_pending'),
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
      discountType: null,
      discountPercent: 0,
      discountAmount: 0,
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
        const { percent, amount } = updateDiscountStateAndDb(state, nextItems, activeOrderId);
        return {
          activeOrderItems: nextItems,
          discountPercent: percent,
          discountAmount: amount,
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
      const { percent, amount } = updateDiscountStateAndDb(state, nextItems, activeOrderId);
      return {
        activeOrderItems: nextItems,
        discountPercent: percent,
        discountAmount: amount,
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
      const { percent, amount } = updateDiscountStateAndDb(state, nextItems, activeOrderId || '');
      return {
        activeOrderItems: nextItems,
        discountPercent: percent,
        discountAmount: amount,
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
    if (!target || !snapshot.activeOrderId || (target.kot_sent && !isEditingUnpaid)) {
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
      const { percent, amount } = updateDiscountStateAndDb(state, nextItems, activeOrderId || '');
      return {
        activeOrderItems: nextItems,
        discountPercent: percent,
        discountAmount: amount,
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
    if (!activeOrder) return;

    const status = activeOrder.status;
    const isEditingUnpaid = get().isEditingUnpaid;
    const canEdit = status === 'draft' || status === 'open' || isEditingUnpaid;
    if (!canEdit) return;

    const snapshot = get();
    const target = snapshot.activeOrderItems.find((item) => item.id === itemId);
    if (!target || !snapshot.activeOrderId || (target.kot_sent && !isEditingUnpaid)) {
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
      const { percent, amount } = updateDiscountStateAndDb(state, nextItems, activeOrderId || '');
      return {
        activeOrderItems: nextItems,
        discountPercent: percent,
        discountAmount: amount,
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
      if (activeOrder.status === 'unpaid' && nextItems.length === 0) {
        await get().cancelOrder();
        return;
      }
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

    if (activeOrder && activeOrder.status === 'unpaid') {
      await get().cancelOrder();
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
    const needsOrderNumber = !activeOrder.order_name || activeOrder.order_name.toLowerCase().includes('draft');
    let nextOrderName = activeOrder.order_name;
    if (needsOrderNumber) {
      const nextOrderNum = getNextOrderNumber();
      nextOrderName = `Order #${nextOrderNum}`;
    }

    const unsentItems = snapshot.activeOrderItems.filter((item) => !item.kot_sent);
    const itemsToCancel = calculateKotCancellations(
      snapshot.kotsByOrderId[activeOrderId] ?? [],
      snapshot.activeOrderItems
    );

    if (unsentItems.length === 0 && itemsToCancel.length === 0) {
      set({ error: 'No changes since last KOT.' });
      console.timeEnd('saveKot_ui');
      console.timeEnd('saveKot_total');
      return false;
    }

    const itemsToSend: { name: string; quantity: number }[] = unsentItems.map((item) => ({
      name: item.product_name || item.item_name,
      quantity: item.qty,
    }));

    let printedRegular = false;
    let nextKotNumber = 0;
    if (unsentItems.length > 0) {
      nextKotNumber = getNextKotNumber();
      await printerService.printKot(nextKotNumber, itemsToSend);
      printedRegular = true;
    }

    let printedCancel = false;
    let cancelKotNumber = 0;
    if (itemsToCancel.length > 0) {
      cancelKotNumber = getNextKotNumber();
      await printerService.printKot(cancelKotNumber, itemsToCancel, true);
      printedCancel = true;
    }

    const nextKotNumbers = [...(snapshot.kotNumbersByOrderId[activeOrderId] ?? [])];
    const nextKots = [...(snapshot.kotsByOrderId[activeOrderId] ?? [])];

    if (printedRegular) {
      nextKotNumbers.push(nextKotNumber);
      nextKots.push({
        id: `kot-uuid-optimistic-reg-${Date.now()}`,
        tenant_id: activeOrder.tenant_id,
        branch_id: activeOrder.branch_id,
        open_order_id: activeOrderId,
        kot_number: nextKotNumber,
        status: 'pending',
        printed_at: null,
        created_at: new Date().toISOString(),
        kot_items: itemsToSend.map((item, idx) => ({
          id: `kot-item-uuid-optimistic-reg-${idx}-${Date.now()}`,
          kot_id: `kot-uuid-optimistic-reg-${Date.now()}`,
          item_name: item.name,
          qty: item.quantity,
          notes: null,
        })),
      });
    }

    if (printedCancel) {
      nextKotNumbers.push(cancelKotNumber);
      nextKots.push({
        id: `kot-uuid-optimistic-cancel-${Date.now()}`,
        tenant_id: activeOrder.tenant_id,
        branch_id: activeOrder.branch_id,
        open_order_id: activeOrderId,
        kot_number: cancelKotNumber,
        status: 'pending',
        printed_at: null,
        created_at: new Date().toISOString(),
        kot_items: itemsToCancel.map((item, idx) => ({
          id: `kot-item-uuid-optimistic-cancel-${idx}-${Date.now()}`,
          kot_id: `kot-uuid-optimistic-cancel-${Date.now()}`,
          item_name: item.name,
          qty: item.quantity,
          notes: item.notes,
        })),
      });
    }

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

    const nextStatus = activeOrder.status === 'unpaid' ? 'unpaid' : 'in_kitchen';

    const optimisticSummary: OpenOrderSummary = {
      order: {
        ...activeOrder,
        status: nextStatus,
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
        o.id === activeOrderId ? { ...o, status: nextStatus, order_name: nextOrderName } : o
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
        let finalRegTicket = null;
        let finalCancelTicket = null;

        if (unsentItems.length > 0) {
          const createResult = await createKot(activeOrderId, itemsToSend);
          if (createResult.error || !createResult.data) {
            throw new Error(createResult.error ?? 'Database KOT insert failed');
          }
          finalRegTicket = createResult.data;

          const unsentItemIds = unsentItems.map((item) => item.id);
          const { error: itemsUpdateError } = await supabase
            .from('open_order_items')
            .update({ kot_sent: true })
            .in('id', unsentItemIds);

          if (itemsUpdateError) {
            throw itemsUpdateError;
          }
        }

        if (itemsToCancel.length > 0) {
          const cancelResult = await createKot(activeOrderId, itemsToCancel);
          if (cancelResult.error || !cancelResult.data) {
            throw new Error(cancelResult.error ?? 'Database Cancel KOT insert failed');
          }
          finalCancelTicket = cancelResult.data;
        }

        const { tenant_id, branch_id } = getTenantContext();
        const updatePayload: any = { status: nextStatus };
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
        set((state) => {
          const currentKots = state.kotsByOrderId[activeOrderId] ?? [];
          const cleanedKots = currentKots.map((k) => {
            if (k.id.includes('reg') && finalRegTicket) {
              return finalRegTicket;
            }
            if (k.id.includes('cancel') && finalCancelTicket) {
              return finalCancelTicket;
            }
            return k;
          });
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
    if (snapshot.isMutating) {
      return false;
    }
    set({ isMutating: true, error: null });
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) {
      set({ isMutating: false, error: 'No active order selected.' });
      return false;
    }

    if (snapshot.activeOrderItems.length === 0) {
      set({ isMutating: false, error: 'Cannot Save & Print for an empty cart.' });
      return false;
    }

    const activeOrder = snapshot.orders.find((o) => o.id === activeOrderId);
    if (!activeOrder) {
      set({ error: 'Connection issue. Please check internet and try again.' });
      return false;
    }

    // Concurrency Guard: Check if the bill has already been settled in the DB
    if (activeOrder.status === 'unpaid') {
      const { data: dbBill, error: dbBillErr } = await supabase
        .from('bills')
        .select('status, payment_status')
        .eq('open_order_id', activeOrderId)
        .maybeSingle();

      if (dbBill && (dbBill.status === 'paid' || dbBill.payment_status === 'paid')) {
        set({ error: 'This bill has already been settled and can no longer be edited.' });
        return false;
      }
    }

    const wasDraft = activeOrder.status === 'draft' || activeOrder.status === 'open';
    const unsentItems = snapshot.activeOrderItems.filter((item) => !item.kot_sent);
    const itemsToCancel = calculateKotCancellations(
      snapshot.kotsByOrderId[activeOrderId] ?? [],
      snapshot.activeOrderItems
    );

    const needsOrderNumber = !activeOrder.order_name || activeOrder.order_name.toLowerCase().includes('draft');
    let nextOrderName = activeOrder.order_name;
    if (needsOrderNumber) {
      const nextOrderNum = getNextOrderNumber();
      nextOrderName = `Order #${nextOrderNum}`;
    }
    
    // Scenario A: No unsent items and no cancelled items, order already unpaid or in_kitchen — generate bill number, print bill, save
    if (unsentItems.length === 0 && itemsToCancel.length === 0 && (activeOrder.status === 'unpaid' || activeOrder.status === 'in_kitchen')) {
      const totalAmount = snapshot.activeOrderItems.reduce((sum, item) => sum + item.qty * (item.price ?? 0), 0);
      const billNumber = activeOrder.invoice_number || getNextBillNumber();

      const discountType = snapshot.discountType;
      const discountPercent = snapshot.discountPercent;
      const discountAmount = snapshot.discountAmount;
      const discountedSubtotal = Math.max(0, totalAmount - discountAmount);
      const taxAmount = 0; // GST disabled
      const grandTotal = discountedSubtotal + taxAmount;
      const discountValue = discountType === 'percent' ? discountPercent : discountAmount;

      await printerService.printBill(
        activeOrder.order_name,
        billNumber,
        snapshot.activeOrderItems,
        totalAmount,
        false, // provisional bill
        null,  // paymentMethod
        snapshot.kotsByOrderId[activeOrderId] ?? [],
        discountAmount,
        discountType,
        discountValue
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
            o.id === activeOrderId ? { ...o, status: 'unpaid' as const, invoice_number: billNumber } : o
          ),
          summaries: state.summaries.map((s) =>
            s.order.id === activeOrderId
              ? { ...s, order: { ...s.order, status: 'unpaid' as const, invoice_number: billNumber } }
              : s
          ),
          billPrintedByOrderId: nextPrinted,
          isEditingUnpaid: false,
          hasUnsavedChanges: false,
        };
      });

      // Awaited DB persistence (Phase 0: No fire-and-forget background tasks)
      const { tenant_id, branch_id } = getTenantContext();
      await supabase
        .from('open_orders')
        .update({
          status: 'unpaid',
          invoice_number: billNumber,
          discount_type: discountType,
          discount_value: discountValue,
          discount_amount: discountAmount,
        })
        .eq('id', activeOrderId)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);

      await createOrUpdateBill(
        activeOrderId,
        billNumber,
        totalAmount,
        taxAmount,
        discountAmount,
        grandTotal,
        'unpaid',
        discountType,
        discountValue,
        snapshot.activeOrderItems
      );

      set({ isMutating: false });
      return true;
    }

    // Scenario B: Has unsent items, cancelled items, or is a fresh draft — generate KOT(s) + bill number + print all

    // Generate the bill number now. This is the permanent number on the receipt.
    // Settlement must NOT generate or overwrite this.
    const billNumber = activeOrder.invoice_number || getNextBillNumber();

    // Handle KOT if there are unsent items
    let nextKotNumber = 0;
    let itemsToSend: { name: string; quantity: number }[] = [];
    let nextKotNumbers = snapshot.kotNumbersByOrderId[activeOrderId] ?? [];
    let nextKots = snapshot.kotsByOrderId[activeOrderId] ?? [];
    let printedRegular = false;

    if (unsentItems.length > 0) {
      nextKotNumber = getNextKotNumber();
      itemsToSend = unsentItems.map((item) => ({
        name: item.product_name || item.item_name,
        quantity: item.qty,
      }));

      // Sim print KOT
      await printerService.printKot(nextKotNumber, itemsToSend);
      printedRegular = true;
    }

    // Handle Cancel KOT if there are cancelled items
    let cancelKotNumber = 0;
    let printedCancel = false;

    if (itemsToCancel.length > 0) {
      cancelKotNumber = getNextKotNumber();
      // Sim print Cancel KOT
      await printerService.printKot(cancelKotNumber, itemsToCancel, true);
      printedCancel = true;
    }

    if (printedRegular) {
      nextKotNumbers = [...nextKotNumbers, nextKotNumber];
      nextKots = [...nextKots, {
        id: `kot-uuid-optimistic-reg-${Date.now()}`,
        tenant_id: activeOrder.tenant_id,
        branch_id: activeOrder.branch_id,
        open_order_id: activeOrderId,
        kot_number: nextKotNumber,
        status: 'pending',
        printed_at: null,
        created_at: new Date().toISOString(),
        kot_items: itemsToSend.map((item, idx) => ({
          id: `kot-item-uuid-optimistic-reg-${idx}-${Date.now()}`,
          kot_id: `kot-uuid-optimistic-reg-${Date.now()}`,
          item_name: item.name,
          qty: item.quantity,
          notes: null,
        })),
      }];
    }

    if (printedCancel) {
      nextKotNumbers = [...nextKotNumbers, cancelKotNumber];
      nextKots = [...nextKots, {
        id: `kot-uuid-optimistic-cancel-${Date.now()}`,
        tenant_id: activeOrder.tenant_id,
        branch_id: activeOrder.branch_id,
        open_order_id: activeOrderId,
        kot_number: cancelKotNumber,
        status: 'pending',
        printed_at: null,
        created_at: new Date().toISOString(),
        kot_items: itemsToCancel.map((item, idx) => ({
          id: `kot-item-uuid-optimistic-cancel-${idx}-${Date.now()}`,
          kot_id: `kot-uuid-optimistic-cancel-${Date.now()}`,
          item_name: item.name,
          qty: item.quantity,
          notes: item.notes,
        })),
      }];
    }

    // Prepare billing items (all of them since F3 prints everything provisional)
    const orderItems = snapshot.activeOrderItems;
    const totalAmount = orderItems.reduce((sum, item) => sum + item.qty * (item.price ?? 0), 0);
    const itemCount = orderItems.reduce((sum, item) => sum + item.qty, 0);

    const discountType = snapshot.discountType;
    const discountPercent = snapshot.discountPercent;
    const discountAmount = snapshot.discountAmount;
    const discountedSubtotal = Math.max(0, totalAmount - discountAmount);
    const taxAmount = 0; // GST disabled
    const grandTotal = discountedSubtotal + taxAmount;
    const discountValue = discountType === 'percent' ? discountPercent : discountAmount;

    // Print the customer bill with the generated bill number
    await printerService.printBill(
      nextOrderName,
      billNumber,
      orderItems,
      totalAmount,
      false, // provisional
      null,  // paymentMethod
      nextKots,  // includes the KOTs
      discountAmount,
      discountType,
      discountValue
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
        status: 'unpaid' as const,
        order_name: nextOrderName,
        invoice_number: billNumber,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
      },
      itemCount,
      created_at: activeOrder.created_at || new Date().toISOString(),
      previewItems,
      remainingItemLines,
      totalAmount: grandTotal,
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
          o.id === activeOrderId
            ? { ...o, status: 'unpaid' as const, order_name: nextOrderName, invoice_number: billNumber }
            : o
        ),
        summaries: nextSummaries,
        activeOrderItems: updatedOrderItems, // KEEP IN CART BUT MARK KOT_SENT
        isWorkspaceEmpty: false,
        isEditingUnpaid: false, // Exit edit mode upon printing provisional bill
        hasUnsavedChanges: false,
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

    // Awaited Database Persistence (Phase 0: No fire-and-forget background tasks)
    try {
      let finalRegTicket = null;
      let finalCancelTicket = null;

      if (unsentItems.length > 0) {
        const createResult = await createKot(activeOrderId, itemsToSend);
        if (createResult.error || !createResult.data) {
          throw new Error(createResult.error ?? 'Database KOT insert failed');
        }
        finalRegTicket = createResult.data;

        const unsentItemIds = unsentItems.map((item) => item.id);
        const { error: itemsUpdateError } = await supabase
          .from('open_order_items')
          .update({ kot_sent: true })
          .in('id', unsentItemIds);

        if (itemsUpdateError) {
          throw itemsUpdateError;
        }
      }

      if (itemsToCancel.length > 0) {
        const cancelResult = await createKot(activeOrderId, itemsToCancel);
        if (cancelResult.error || !cancelResult.data) {
          throw new Error(cancelResult.error ?? 'Database Cancel KOT insert failed');
        }
        finalCancelTicket = cancelResult.data;
      }

      // Replace mock optimistic ticket with final database tickets
      set((state) => {
        const currentKots = state.kotsByOrderId[activeOrderId] ?? [];
        const cleanedKots = currentKots.map((k) => {
          if (k.id.includes('reg') && finalRegTicket) {
            return finalRegTicket;
          }
          if (k.id.includes('cancel') && finalCancelTicket) {
            return finalCancelTicket;
          }
          return k;
        });
        return {
          kotsByOrderId: {
            ...state.kotsByOrderId,
            [activeOrderId]: cleanedKots,
          },
        };
      });

      // Always write order status + bill number + discount metadata to DB
      const { tenant_id, branch_id } = getTenantContext();
      const { error: orderError } = await supabase
        .from('open_orders')
        .update({
          status: 'unpaid',
          order_name: nextOrderName,
          invoice_number: billNumber,
          discount_type: discountType,
          discount_value: discountValue,
          discount_amount: discountAmount,
        })
        .eq('id', activeOrderId)
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id);

      if (orderError) {
        throw orderError;
      }

      // Call createOrUpdateBill to save/update bill and sync bill items
      const billResult = await createOrUpdateBill(
        activeOrderId,
        billNumber,
        totalAmount,
        taxAmount,
        discountAmount,
        grandTotal,
        'unpaid',
        discountType,
        discountValue,
        orderItems
      );

      if (billResult.error) {
        throw new Error(billResult.error);
      }

      console.log('[useOrdersStore] Awaited saveAndPrint success!');
    } catch (dbErr) {
      console.error('[useOrdersStore] Awaited saveAndPrint failed, rolling back:', dbErr);
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
        billPrintedByOrderId: snapshot.billPrintedByOrderId,
        error: 'Connection issue. Bill was not saved. Please check internet and try again.',
      });
      return false;
    } finally {
      set({ isMutating: false });
    }

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

    const allowed = ['draft', 'held', 'unpaid', 'open', 'in_kitchen'].includes(activeOrder.status);
    if (!allowed) {
      set({ error: 'This order status cannot be cancelled.' });
      return;
    }

    // Calculate all items previously sent to the kitchen
    const sentQuantities: Record<string, number> = {};
    const kots = snapshot.kotsByOrderId[activeOrderId] ?? [];
    for (const kot of kots) {
      if (kot.kot_items) {
        for (const item of kot.kot_items) {
          sentQuantities[item.item_name] = (sentQuantities[item.item_name] ?? 0) + item.qty;
        }
      }
    }

    const itemsToCancel: { name: string; quantity: number; notes: string }[] = [];
    for (const [name, qty] of Object.entries(sentQuantities)) {
      if (qty > 0) {
        itemsToCancel.push({ name, quantity: -qty, notes: 'Order Cancelled' });
      }
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
        if (itemsToCancel.length > 0) {
          const cancelKotNumber = getNextKotNumber();
          await printerService.printKot(cancelKotNumber, itemsToCancel, true);

          const cancelResult = await createKot(activeOrderId, itemsToCancel);
          if (cancelResult.error) {
            console.error('[cancelOrder] failed to create Cancel KOT in DB:', cancelResult.error);
          }
        }

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

        // Centralized createOrUpdateBill call to cancel existing bill if set
        if (activeOrder.invoice_number) {
          await createOrUpdateBill(
            activeOrderId,
            activeOrder.invoice_number,
            0,
            0,
            0,
            0,
            'cancelled'
          );
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
