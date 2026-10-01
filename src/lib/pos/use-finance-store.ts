/**
 * Finance module — Zustand store.
 *
 * Owns filters, per-area loading/error state and all service calls so the
 * screen components stay declarative. Each area (overview, cash book, day
 * close) tracks its own request id so a slow response can never overwrite a
 * newer one. The Ledger tab has its own store, use-ledger-store.ts.
 */
import { create } from 'zustand';

import {
  computeDayClose,
  detectFinanceSchema,
  fetchDayClosure,
  fetchFinanceOverview,
  fetchLedger,
  fetchRecentDayClosures,
  saveDayClosure,
  type DayCloseAction,
} from './finance-service';
import type {
  DayCloseComputation,
  DayClosure,
  DayClosureInput,
  FinanceDailyPoint,
  FinanceFilters,
  FinancePreset,
  FinanceSchemaStatus,
  FinanceSummary,
  FinanceTab,
  LedgerEntry,
} from './finance-types';
import { getCurrentBusinessDate, getPresetDateRange } from './finance-utils';

type Area = 'overview' | 'ledger' | 'dayclose';

type MutationResult = { ok: true } | { ok: false; error: string };

type FinanceState = {
  // ── Global ──
  initialized: boolean;
  schema: FinanceSchemaStatus | null;
  activeTab: FinanceTab;
  filters: FinanceFilters;
  /** Areas whose data no longer matches the current filters. */
  stale: Record<Area, boolean>;

  // ── Overview ──
  summary: FinanceSummary | null;
  series: FinanceDailyPoint[];
  overviewDegraded: boolean;
  overviewLoading: boolean;
  overviewError: string | null;

  // ── Cash book ──
  ledger: LedgerEntry[];
  ledgerLoading: boolean;
  ledgerError: string | null;

  // ── Day close ──
  dayCloseDate: string;
  closure: DayClosure | null;
  computation: DayCloseComputation | null;
  recentClosures: DayClosure[];
  dayCloseLoading: boolean;
  dayCloseSaving: boolean;
  dayCloseError: string | null;

  // ── Actions ──
  initialize: () => Promise<void>;
  setTab: (tab: FinanceTab) => void;
  setPreset: (preset: Exclude<FinancePreset, 'custom'>) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  setBranch: (branchId: string | null) => void;
  refreshActive: () => Promise<void>;

  loadOverview: () => Promise<void>;

  loadLedger: () => Promise<void>;

  setDayCloseDate: (date: string) => void;
  loadDayClose: () => Promise<void>;
  saveDayClose: (input: DayClosureInput, action: DayCloseAction) => Promise<MutationResult>;
};

const requestIds: Record<Area, number> = { overview: 0, ledger: 0, dayclose: 0 };

function nextRequest(area: Area): number {
  requestIds[area] += 1;
  return requestIds[area];
}

function isCurrent(area: Area, id: number): boolean {
  return requestIds[area] === id;
}

const ALL_STALE: Record<Area, boolean> = { overview: true, ledger: true, dayclose: true };

function initialFilters(): FinanceFilters {
  const range = getPresetDateRange('7days');
  return { preset: '7days', startDate: range.startDate, endDate: range.endDate, branchId: null };
}

export const useFinanceStore = create<FinanceState>((set, get) => {
  const loadForTab = async (tab: FinanceTab): Promise<void> => {
    const { stale } = get();
    switch (tab) {
      case 'overview':
        if (stale.overview) await get().loadOverview();
        return;
      case 'cashbook':
        if (stale.ledger) await get().loadLedger();
        return;
      case 'dayclose':
        if (stale.dayclose) await get().loadDayClose();
        return;
      default:
        return;
    }
  };

  const applyFilters = (filters: FinanceFilters): void => {
    set({ filters, stale: { ...ALL_STALE } });
    void loadForTab(get().activeTab);
  };

  return {
    initialized: false,
    schema: null,
    activeTab: 'overview',
    filters: initialFilters(),
    stale: { ...ALL_STALE },

    summary: null,
    series: [],
    overviewDegraded: false,
    overviewLoading: false,
    overviewError: null,

    ledger: [],
    ledgerLoading: false,
    ledgerError: null,

    dayCloseDate: getCurrentBusinessDate(),
    closure: null,
    computation: null,
    recentClosures: [],
    dayCloseLoading: false,
    dayCloseSaving: false,
    dayCloseError: null,

    // ── Global ──────────────────────────────────────────────────────────────
    initialize: async () => {
      const schema = await detectFinanceSchema();
      set({ schema, initialized: true });
      await loadForTab(get().activeTab);
    },

    setTab: (tab) => {
      if (get().activeTab === tab) return;
      set({ activeTab: tab });
      void loadForTab(tab);
    },

    setPreset: (preset) => {
      const range = getPresetDateRange(preset);
      applyFilters({ ...get().filters, preset, startDate: range.startDate, endDate: range.endDate });
    },

    setCustomRange: (startDate, endDate) => {
      const range = getPresetDateRange('custom', { startDate, endDate });
      applyFilters({ ...get().filters, preset: 'custom', startDate: range.startDate, endDate: range.endDate });
    },

    setBranch: (branchId) => {
      if (get().filters.branchId === branchId) return;
      applyFilters({ ...get().filters, branchId });
    },

    refreshActive: async () => {
      const { activeTab } = get();
      switch (activeTab) {
        case 'overview':
          return get().loadOverview();
        case 'cashbook':
          return get().loadLedger();
        case 'dayclose':
          return get().loadDayClose();
        default:
          return;
      }
    },

    // ── Overview ────────────────────────────────────────────────────────────
    loadOverview: async () => {
      const id = nextRequest('overview');
      set({ overviewLoading: true, overviewError: null });
      const { data, error } = await fetchFinanceOverview(get().filters);
      if (!isCurrent('overview', id)) return;
      if (error || !data) {
        set({ overviewLoading: false, overviewError: error ?? 'Unable to load the finance overview.' });
        return;
      }
      set({
        summary: data.summary,
        series: data.series,
        overviewDegraded: data.degraded,
        overviewLoading: false,
        overviewError: null,
        stale: { ...get().stale, overview: false },
      });
    },

    // ── Cash book ───────────────────────────────────────────────────────────
    loadLedger: async () => {
      const id = nextRequest('ledger');
      set({ ledgerLoading: true, ledgerError: null });
      const { data, error } = await fetchLedger(get().filters);
      if (!isCurrent('ledger', id)) return;
      if (error || !data) {
        set({ ledgerLoading: false, ledgerError: error ?? 'Unable to load the cash book.' });
        return;
      }
      set({ ledger: data, ledgerLoading: false, ledgerError: null, stale: { ...get().stale, ledger: false } });
    },

    // ── Day close ───────────────────────────────────────────────────────────
    setDayCloseDate: (date) => {
      if (get().dayCloseDate === date) return;
      set({ dayCloseDate: date, stale: { ...get().stale, dayclose: true } });
      void get().loadDayClose();
    },

    loadDayClose: async () => {
      const id = nextRequest('dayclose');
      const { dayCloseDate, filters } = get();
      set({ dayCloseLoading: true, dayCloseError: null });
      const [computationRes, closureRes, recentRes] = await Promise.all([
        computeDayClose(dayCloseDate, filters.branchId),
        fetchDayClosure(dayCloseDate, filters.branchId),
        fetchRecentDayClosures(filters.branchId),
      ]);
      if (!isCurrent('dayclose', id)) return;
      const error = computationRes.error ?? closureRes.error ?? recentRes.error;
      if (error) {
        set({ dayCloseLoading: false, dayCloseError: error });
        return;
      }
      set({
        computation: computationRes.data,
        closure: closureRes.data,
        recentClosures: recentRes.data ?? [],
        dayCloseLoading: false,
        dayCloseError: null,
        stale: { ...get().stale, dayclose: false },
      });
    },

    saveDayClose: async (input, action) => {
      const { computation, filters } = get();
      if (!computation) return { ok: false, error: 'Day figures are still loading.' };
      set({ dayCloseSaving: true });
      const { data, error } = await saveDayClosure(input, computation, action, filters.branchId);
      set({ dayCloseSaving: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to save the day close.' };
      const recent = get().recentClosures.filter((c) => c.id !== data.id);
      set({
        closure: data,
        recentClosures: [data, ...recent].sort((a, b) => (a.business_date < b.business_date ? 1 : -1)),
      });
      return { ok: true };
    },
  };
});
