import { create } from 'zustand';

import type { OpenOrder, PosOrderItem } from './order-types';
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
  productNameById: Record<string, string>;
  isLoadingOrders: boolean;
  isLoadingActiveOrder: boolean;
  isMutating: boolean;
  isEditingUnpaid: boolean;
  hasUnsavedChanges: boolean;
  isReadOnlyView: boolean;
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
  productNameById: {},
  isLoadingOrders: false,
  isLoadingActiveOrder: false,
  isMutating: false,
  isEditingUnpaid: false,
  hasUnsavedChanges: false,
  isReadOnlyView: false,
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

    set({
      orders,
      heldOrders,
      itemCountByOrderId,
      isLoadingOrders: false,
      error: null,
    });

    if (countsResult.error && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[Grovit] Order item counts unavailable:', countsResult.error);
    }

    const { activeOrderId } = get();
    console.log('[useOrdersStore] loadOrders: activeOrderId in state/storage is', activeOrderId);
    if (activeOrderId && orders.some((order) => order.id === activeOrderId)) {
      console.log('[useOrdersStore] loadOrders: restoring active order', activeOrderId);
      await get().selectOrder(activeOrderId);
      return;
    }

    if (activeOrderId) {
      console.log('[useOrdersStore] loadOrders: activeOrderId', activeOrderId, 'not found in loaded orders. Clearing active session.');
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('grovit_active_order_id');
      }
    }

    console.log('[useOrdersStore] loadOrders: Starting with clean/empty cart.');
    set({ activeOrderId: null, activeOrderItems: [] });
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
    set({
      activeOrderId: orderId,
      activeOrderItems,
      isLoadingActiveOrder: false,
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isReadOnlyView: isReadOnly,
      itemCountByOrderId: {
        ...get().itemCountByOrderId,
        [orderId]: getItemCount(activeOrderItems),
      },
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
      const orderNumber = snapshot.orders.length + 1;
      const tableLabel = formatPosOrderName(orderNumber);

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

    set({ isMutating: true, error: null });

    if (activeOrder.status === 'unpaid') {
      set({
        isEditingUnpaid: false,
        hasUnsavedChanges: false,
        isMutating: false,
      });
      return true;
    }

    const { tenant_id, branch_id } = getTenantContext();
    const { error } = await supabase
      .from('open_orders')
      .update({ status: 'unpaid' })
      .eq('id', activeOrderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      logSupabaseError('saveKot', error);
      set({
        isMutating: false,
        error: 'Connection issue. Please check internet and try again.',
      });
      return false;
    }

    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === activeOrderId ? { ...o, status: 'unpaid' as const } : o
      ),
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isMutating: false,
    }));
    return true;
  },

  settleBill: async () => {
    const snapshot = get();
    const activeOrderId = snapshot.activeOrderId;
    if (!activeOrderId) return false;

    const activeOrder = snapshot.orders.find((o) => o.id === activeOrderId);
    if (!activeOrder) {
      set({ error: 'Connection issue. Please check internet and try again.' });
      return false;
    }

    if (activeOrder.status === 'paid') {
      set({ error: 'Bill already settled.' });
      return false;
    }

    set({ isMutating: true, error: null });

    const { tenant_id, branch_id } = getTenantContext();
    const paidAt = new Date().toISOString();
    const { error } = await supabase
      .from('open_orders')
      .update({
        status: 'paid',
        paid_at: paidAt,
      })
      .eq('id', activeOrderId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      logSupabaseError('settleBill', error);
      set({
        isMutating: false,
        error: 'Connection issue. Please check internet and try again.',
      });
      return false;
    }

    console.log('[useOrdersStore] settleBill: settled order', activeOrderId);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== activeOrderId),
      activeOrderId: null,
      activeOrderItems: [],
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isMutating: false,
    }));
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

    const cancelledAt = new Date().toISOString();
    const { tenant_id, branch_id } = getTenantContext();
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
      logSupabaseError('cancelOrder', error);
      set({
        isMutating: false,
        error: 'Connection issue. Please check internet and try again.',
      });
      return;
    }

    console.log('[useOrdersStore] cancelOrder: cancelled order', activeOrderId);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('grovit_active_order_id');
    }
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== activeOrderId),
      heldOrders: state.heldOrders.filter((o) => o.id !== activeOrderId),
      activeOrderId: null,
      activeOrderItems: [],
      isEditingUnpaid: false,
      hasUnsavedChanges: false,
      isMutating: false,
    }));
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
