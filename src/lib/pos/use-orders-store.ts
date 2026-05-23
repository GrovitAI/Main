import { create } from 'zustand';

import type { OpenOrder } from './order-types';
import { fetchOpenOrders } from './open-orders-service';

type OrdersState = {
  orders: OpenOrder[];
  isLoading: boolean;
  error: string | null;
  loadOrders: () => Promise<void>;
  clearError: () => void;
};

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  isLoading: false,
  error: null,
  loadOrders: async () => {
    set({ isLoading: true, error: null });
    const result = await fetchOpenOrders();
    if (result.error) {
      set({ isLoading: false, error: result.error });
      return;
    }
    set({ orders: result.data ?? [], isLoading: false, error: null });
  },
  clearError: () => set({ error: null }),
}));
