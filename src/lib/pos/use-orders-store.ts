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
} from './open-orders-service';
import { BRANCH_ID, TENANT_ID, getTenantContext } from './tenant-context';
import { supabase } from './supabase';
import { logSupabaseError } from './supabase-debug';

type OrdersState = {
  orders: OpenOrder[];
  heldOrders: OpenOrder[];
  activeOrderId: string | null;
  activeOrderItems: PosOrderItem[];
  itemCountByOrderId: Record<string, number>;
  kotNumbersByOrderId: Record<string, number[]>;
  kotsByOrderId: Record<string, KotTicket[]>;
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
  settleBill: () => Promise<boolean>;
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
  activeOrderId: (typeof window !== 'undefined' && window.localStorage)
    ? window.localStorage.getItem('grovit_active_order_id')
    : null,
  activeOrderItems: [],
  itemCountByOrderId: {},
  kotNumbersByOrderId: {},
  kotsByOrderId: {},
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

    // Bootstrapping sequence registry from loaded orders and their KOTs
    let highestKotVal = 0;
    let highestBillVal = 0;
    let highestOrderVal = 0;

    for (const order of allOrders) {
      if (order.bill_number) {
        const num = parseInt(order.bill_number.replace(/\D/g, ''), 10);
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

    set({
      orders,
      heldOrders,
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
        isEditingUnpaid: false,
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
      (item) => item.product_id === product.id,
    );

    if (existingItem) {
      const nextQuantity = existingItem.qty + quantity;
      const targetItemId = existingItem.id;

      const nextItems = snapshot.activeOrderItems.map((item) =>
        item.id === targetItemId ? { ...item, qty: nextQuantity } : item,
      );

      set({
        activeOrderItems: nextItems,
        itemCountByOrderId: {
          ...snapshot.itemCountByOrderId,
          [activeOrderId]: getItemCount(nextItems),
        },
        isMutating: true,
        error: null,
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

    set({
      activeOrderItems: nextItems,
      itemCountByOrderId: {
        ...snapshot.itemCountByOrderId,
        [activeOrderId]: nextCount,
      },
      isMutating: true,
      error: null,
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
    if (!target || !snapshot.activeOrderId) {
      return;
    }

    const nextQuantity = target.qty + 1;
    const nextItems = snapshot.activeOrderItems.map((item) =>
      item.id === itemId ? { ...item, qty: nextQuantity } : item,
    );

    set({
      activeOrderItems: nextItems,
      itemCountByOrderId: {
        ...snapshot.itemCountByOrderId,
        [snapshot.activeOrderId]: getItemCount(nextItems),
      },
      isMutating: true,
      error: null,
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
    if (!target || !snapshot.activeOrderId) {
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

    set({
      activeOrderItems: nextItems,
      itemCountByOrderId: {
        ...snapshot.itemCountByOrderId,
        [snapshot.activeOrderId]: getItemCount(nextItems),
      },
      isMutating: true,
      error: null,
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
    if (!snapshot.activeOrderId) {
      return;
    }

    const nextItems = snapshot.activeOrderItems.filter((item) => item.id !== itemId);
    set({
      activeOrderItems: nextItems,
      itemCountByOrderId: {
        ...snapshot.itemCountByOrderId,
        [snapshot.activeOrderId]: getItemCount(nextItems),
      },
      isMutating: true,
      error: null,
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
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === activeOrderId
          ? { ...order, status: 'held' as const, held_at: heldAt }
          : order
      ),
      heldOrders: [
        { ...activeOrder, status: 'held' as const, held_at: heldAt },
        ...state.heldOrders.filter((o) => o.id !== activeOrderId),
      ],
      activeOrderId: null,
      activeOrderItems: [],
      isWorkspaceEmpty: true,
      isMutating: false,
    }));
  },

  saveKot: async () => {
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) return false;

    if (snapshot.activeOrderItems.length === 0) {
      set({ error: 'Cannot save KOT for an empty cart.' });
      return false;
    }

    const activeOrder = snapshot.orders.find((o) => o.id === activeOrderId);
    if (!activeOrder) {
      set({ error: 'Connection issue. Please check internet and try again.' });
      return false;
    }

    console.time('saveKot');
    const wasDraft = activeOrder.status === 'draft' || activeOrder.status === 'open';
    const nextKotNumber = getNextKotNumber();

    let nextOrderNum = 0;
    let nextOrderName = activeOrder.order_name;
    if (wasDraft) {
      nextOrderNum = getNextOrderNumber();
      nextOrderName = `Order #${nextOrderNum}`;
    }

    // Retrieve KOTs from Zustand local cache
    const existingTickets = snapshot.kotsByOrderId[activeOrderId] ?? [];

    const alreadySentQty: Record<string, number> = {};
    for (const ticket of existingTickets) {
      const ticketItems = ticket.kot_items ?? [];
      for (const item of ticketItems) {
        alreadySentQty[item.item_name] = (alreadySentQty[item.item_name] ?? 0) + item.qty;
      }
    }

    const itemsToSend: { name: string; quantity: number }[] = [];
    for (const cartItem of snapshot.activeOrderItems) {
      const itemName = cartItem.product_name || cartItem.item_name;
      const previouslySent = alreadySentQty[itemName] ?? 0;
      const unsentQty = Math.max(0, cartItem.qty - previouslySent);
      if (unsentQty > 0) {
        itemsToSend.push({
          name: itemName,
          quantity: unsentQty,
        });
      }
    }

    if (itemsToSend.length === 0) {
      set({ error: 'No changes since last KOT.' });
      console.timeEnd('saveKot');
      return false;
    }

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
    
    // OPTIMISTIC UPDATE: transition status, order name, and clear cart instantly
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === activeOrderId ? { ...o, status: 'unpaid' as const, order_name: nextOrderName } : o
      ),
      activeOrderId: null,
      activeOrderItems: [],
      isWorkspaceEmpty: true,
      isEditingUnpaid: false,
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

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }

    // Background Database Persistence
    (async () => {
      try {
        const createResult = await createKot(activeOrderId, itemsToSend);
        if (createResult.error || !createResult.data) {
          throw new Error(createResult.error ?? 'Database KOT insert failed');
        }

        const { tenant_id, branch_id } = getTenantContext();
        const updatePayload: any = { status: 'unpaid' };
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
        // Rollback
        set({
          orders: snapshot.orders,
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
        console.timeEnd('saveKot');
      }
    })();

    return true;
  },

  settleBill: async () => {
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) return false;

    console.time('settleBill');
    set({ isMutating: true, error: null });

    const { tenant_id, branch_id } = getTenantContext();
    const paidAt = new Date().toISOString();
    const generatedBillNumber = getNextBillNumber();

    // OPTIMISTIC UPDATE: remove settled order and reset cart immediately
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== activeOrderId),
      activeOrderId: null,
      activeOrderItems: [],
      isWorkspaceEmpty: true,
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isMutating: false,
    }));

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }

    // Background Database Persistence
    (async () => {
      try {
        const { error } = await supabase
          .from('open_orders')
          .update({
            status: 'paid',
            paid_at: paidAt,
            bill_number: generatedBillNumber,
          })
          .eq('id', activeOrderId)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);

        if (error) {
          throw error;
        }
        console.log('[useOrdersStore] Background settleBill success!');
      } catch (dbErr) {
        console.error('[useOrdersStore] Background settleBill failed, rolling back:', dbErr);
        // Rollback
        set({
          orders: snapshot.orders,
          activeOrderId: snapshot.activeOrderId,
          activeOrderItems: snapshot.activeOrderItems,
          isWorkspaceEmpty: snapshot.isWorkspaceEmpty,
          isEditingUnpaid: snapshot.isEditingUnpaid,
          hasUnsavedChanges: snapshot.hasUnsavedChanges,
          error: 'Connection issue. Bill was not settled. Please check internet and try again.',
        });
      } finally {
        console.timeEnd('settleBill');
      }
    })();

    return true;
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

    const allowed = ['draft', 'held', 'unpaid', 'open'].includes(activeOrder.status);
    if (!allowed) {
      set({ error: 'This order status cannot be cancelled.' });
      return;
    }

    set({ isMutating: true, error: null });

    // OPTIMISTIC UPDATE: filter out immediately
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== activeOrderId),
      heldOrders: state.heldOrders.filter((o) => o.id !== activeOrderId),
      activeOrderId: null,
      activeOrderItems: [],
      isWorkspaceEmpty: true,
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isMutating: false,
    }));

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }

    const cancelledAt = new Date().toISOString();
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
