/**
 * What the kitchen screens share: the lists, the balances and the recent
 * entries, loaded together and refreshed after every save. One store so a
 * send recorded on one screen shows on the home and in the history at once.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { create } from 'zustand';
import {
  fetchKitchenBalances,
  fetchKitchenCategories,
  fetchKitchenEntries,
  fetchKitchenItems,
  fetchKitchenParties,
} from './kitchen-service';
import { localDateKey } from './kitchen-utils';
import { fetchKitchenPurchaseCategories } from '@/lib/pos/kitchen-analytics-service';
import { kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { fetchKitchenAccess } from '@/lib/pos/kitchen-access-service';
import { can, canFix, dateBlock, fullAccess, isDayLocked } from '@/lib/pos/kitchen-access-utils';
import type { KitchenAccess, KitchenPermission } from '@/lib/pos/kitchen-access-types';
import { useSessionStore } from '@/lib/pos/use-session-store';
import type { KitchenCategory, KitchenEntry, KitchenItem, KitchenParty, KitchenPartyBalance } from './kitchen-types';

/** How far back the home and history look without asking for more. */
const RECENT_DAYS = 92;

function daysAgoKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateKey(d);
}

type KitchenState = {
  items: KitchenItem[];
  parties: KitchenParty[];
  categories: KitchenCategory[];
  purchaseCategories: KitchenCategory[];
  balances: KitchenPartyBalance[];
  entries: KitchenEntry[];
  /** What this login may do here, and how days are locked. Full until the database answers. */
  access: KitchenAccess;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadedAt: number;
  /** A one-line confirmation shown on whichever kitchen screen is up. */
  notice: string | null;
  setNotice: (text: string | null) => void;
  /** Loads everything. `silent` keeps what is on screen while it refreshes. */
  load: (silent?: boolean) => Promise<void>;
  reset: () => void;
};

const EMPTY = { items: [], parties: [], categories: [], purchaseCategories: [], balances: [], entries: [], access: fullAccess(kitchenToday()), loaded: false, loading: false, error: null, loadedAt: 0, notice: null };

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export const useKitchenStore = create<KitchenState>((set, get) => ({
  ...EMPTY,
  setNotice: (text) => {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice: text });
    if (text) noticeTimer = setTimeout(() => set({ notice: null }), 2800);
  },
  load: async (silent = false) => {
    if (get().loading) return;
    set({ loading: true, error: silent ? get().error : null });
    const [items, parties, categories, balances, entries, purchaseCategories, access] = await Promise.all([
      fetchKitchenItems(),
      fetchKitchenParties(),
      fetchKitchenCategories(),
      fetchKitchenBalances(),
      fetchKitchenEntries({ from: daysAgoKey(RECENT_DAYS), includeVoided: true }),
      fetchKitchenPurchaseCategories(true),
      fetchKitchenAccess(kitchenToday()),
    ]);
    const error = items.error ?? parties.error ?? categories.error ?? balances.error ?? entries.error ?? purchaseCategories.error ?? access.error;
    set({
      items: items.data ?? get().items,
      parties: parties.data ?? get().parties,
      categories: categories.data ?? get().categories,
      purchaseCategories: purchaseCategories.data ?? get().purchaseCategories,
      balances: balances.data ?? get().balances,
      entries: entries.data ?? get().entries,
      access: access.data ?? get().access,
      loaded: true,
      loading: false,
      error,
      loadedAt: Date.now(),
    });
  },
  reset: () => set({ ...EMPTY }),
}));

/**
 * The store, loaded on first use and refreshed each time a screen comes back
 * into view (after a form closes, after the app returns from the background).
 */
export function useKitchenData() {
  const state = useKitchenStore();
  const load = state.load;
  useEffect(() => {
    if (!state.loaded && !state.loading) void load();
  }, [state.loaded, state.loading, load]);
  useFocusEffect(
    useCallback(() => {
      if (useKitchenStore.getState().loaded) void load(true);
    }, [load]),
  );
  const itemsById = useMemo(() => new Map(state.items.map((i) => [i.id, i])), [state.items]);
  const partiesById = useMemo(() => new Map(state.parties.map((p) => [p.id, p])), [state.parties]);
  const refresh = useCallback(() => load(true), [load]);
  return { ...state, itemsById, partiesById, refresh };
}

export type KitchenData = ReturnType<typeof useKitchenData>;

/**
 * This login's permissions in the kitchen, for showing and hiding actions.
 * The database enforces every one of them; this only keeps the screens honest.
 */
export function useKitchenAccess() {
  const access = useKitchenStore((s) => s.access);
  const userId = useSessionStore((s) => s.session?.userId ?? null);
  return useMemo(() => ({
    access,
    isOwner: access.isOwner,
    can: (permission: KitchenPermission): boolean => can(access, permission),
    /** Why this login cannot save on that day, or null. */
    dateBlock: (day: string): string | null => dateBlock(access, day),
    /** The owner is changing a locked day and must give a reason. */
    needsLockReason: (day: string): boolean => access.isOwner && isDayLocked(access, day),
    isLocked: (day: string): boolean => isDayLocked(access, day),
    canFix: (entry: KitchenEntry): boolean => canFix(access, entry, userId, (iso) => kitchenToday(new Date(iso))),
    showAmounts: can(access, 'amounts.view'),
  }), [access, userId]);
}

export type KitchenAccessView = ReturnType<typeof useKitchenAccess>;
