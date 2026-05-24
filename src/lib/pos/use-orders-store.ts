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
} from './open-orders-service';
import { BRANCH_ID, TENANT_ID } from './tenant-context';

type OrdersState = {
  orders: OpenOrder[];
  activeOrderId: string | null;
  activeOrderItems: PosOrderItem[];
  itemCountByOrderId: Record<string, number>;
  productNameById: Record<string, string>;
  isLoadingOrders: boolean;
  isLoadingActiveOrder: boolean;
  isMutating: boolean;
  error: string | null;
  loadOrders: () => Promise<void>;
  setProductCatalog: (products: Product[]) => void;
  selectOrder: (orderId: string) => Promise<void>;
  createOrder: () => Promise<void>;
  addProductToActiveOrder: (product: Product) => Promise<void>;
  incrementItem: (itemId: string) => Promise<void>;
  decrementItem: (itemId: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
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
  activeOrderId: null,
  activeOrderItems: [],
  itemCountByOrderId: {},
  productNameById: {},
  isLoadingOrders: false,
  isLoadingActiveOrder: false,
  isMutating: false,
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

    const orders = ordersResult.data ?? [];
    const countsResult = await fetchOrderItemCounts(orders.map((order) => order.id));
    const itemCountByOrderId = countsResult.data ?? {};

    set({
      orders,
      itemCountByOrderId,
      isLoadingOrders: false,
      error: null,
    });

    if (countsResult.error && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[Grovit] Order item counts unavailable:', countsResult.error);
    }

    const { activeOrderId } = get();
    if (activeOrderId && orders.some((order) => order.id === activeOrderId)) {
      await get().selectOrder(activeOrderId);
      return;
    }

    if (orders.length > 0) {
      await get().selectOrder(orders[0].id);
      return;
    }

    set({ activeOrderId: null, activeOrderItems: [] });
  },

  selectOrder: async (orderId) => {
    set({ activeOrderId: orderId, isLoadingActiveOrder: true, error: null });
    const result = await fetchOpenOrderById(orderId);

    if (result.error || !result.data) {
      set({ isLoadingActiveOrder: false, error: result.error ?? 'Unable to load order.' });
      return;
    }

    const { productNameById } = get();
    const activeOrderItems = enrichItems(
      result.data.items.map((item) => ({
        ...item,
        product_name: productNameById[item.product_id] ?? 'Item',
      })),
      productNameById,
    );

    set({
      activeOrderItems,
      isLoadingActiveOrder: false,
      itemCountByOrderId: {
        ...get().itemCountByOrderId,
        [orderId]: getItemCount(activeOrderItems),
      },
    });
  },

  createOrder: async () => {
    // Putting the cashier in a "Fresh Cart" state without creating a DB row immediately
    set({ activeOrderId: null, activeOrderItems: [] });
  },

  addProductToActiveOrder: async (product) => {
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
      await get().incrementItem(existingItem.id);
      return;
    }

    const tempItemId = createTempId('temp-item');
    const optimisticItem: PosOrderItem = {
      id: tempItemId,
      open_order_id: activeOrderId,
      product_id: product.id,
      item_name: product.name,
      qty: 1,
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
      quantity: 1,
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
      isMutating: false,
    }));
  },

  incrementItem: async (itemId) => {
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
      set({ isMutating: false });
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
      set({ isMutating: false });
    }
  },

  decrementItem: async (itemId) => {
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
      set({ isMutating: false });
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
      set({ isMutating: false });
    }
  },

  removeItem: async (itemId) => {
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
      set({ isMutating: false });
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
      set({ isMutating: false });
    }
  },
}));
