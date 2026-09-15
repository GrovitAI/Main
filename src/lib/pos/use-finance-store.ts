/**
 * Finance module — Zustand store.
 *
 * Owns filters, per-area loading/error state and all service calls so the
 * screen components stay declarative. Each area (overview, expenses, ledger,
 * day close) tracks its own request id so a slow response can never overwrite
 * a newer one.
 */
import { create } from 'zustand';

import {
  computeDayClose,
  createExpense,
  createExpenseCategory,
  detectFinanceSchema,
  fetchDayClosure,
  fetchExpenseCategories,
  fetchExpenses,
  fetchFinanceOverview,
  fetchLedger,
  fetchRecentDayClosures,
  saveDayClosure,
  updateExpense,
  voidExpense,
  type DayCloseAction,
} from './finance-service';
import type {
  DayCloseComputation,
  DayClosure,
  DayClosureInput,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpensePaymentMethod,
  FinanceDailyPoint,
  FinanceFilters,
  FinancePreset,
  FinanceSchemaStatus,
  FinanceSummary,
  FinanceTab,
  LedgerEntry,
} from './finance-types';
import { getCurrentBusinessDate, getPresetDateRange } from './finance-utils';

type Area = 'overview' | 'expenses' | 'ledger' | 'dayclose';

export type ExpenseListState = {
  category: string | null;
  paymentMethod: ExpensePaymentMethod | null;
  search: string;
  includeVoid: boolean;
};

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

  // ── Expenses ──
  expenses: Expense[];
  expensesTotal: number;
  expensesPage: number;
  expensesPageSize: number;
  expenseList: ExpenseListState;
  expensesLoading: boolean;
  expensesError: string | null;
  expenseMutating: boolean;
  /** Set by the phone's quick-add button; the Expenses tab opens its form and clears this. */
  newExpenseRequested: boolean;
  categories: ExpenseCategory[];
  categoriesLoading: boolean;

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

  loadExpenses: (page?: number) => Promise<void>;
  setExpenseList: (patch: Partial<ExpenseListState>) => void;
  requestNewExpense: () => void;
  clearNewExpenseRequest: () => void;
  addExpense: (input: ExpenseInput) => Promise<MutationResult>;
  editExpense: (id: string, input: ExpenseInput) => Promise<MutationResult>;
  removeExpense: (id: string, reason: string) => Promise<MutationResult>;
  loadCategories: () => Promise<void>;
  addCategory: (name: string) => Promise<MutationResult>;

  loadLedger: () => Promise<void>;

  setDayCloseDate: (date: string) => void;
  loadDayClose: () => Promise<void>;
  saveDayClose: (input: DayClosureInput, action: DayCloseAction) => Promise<MutationResult>;
};

const requestIds: Record<Area, number> = { overview: 0, expenses: 0, ledger: 0, dayclose: 0 };

function nextRequest(area: Area): number {
  requestIds[area] += 1;
  return requestIds[area];
}

function isCurrent(area: Area, id: number): boolean {
  return requestIds[area] === id;
}

const ALL_STALE: Record<Area, boolean> = { overview: true, expenses: true, ledger: true, dayclose: true };

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
      case 'expenses':
        if (stale.expenses) await get().loadExpenses(0);
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

    expenses: [],
    expensesTotal: 0,
    expensesPage: 0,
    expensesPageSize: 50,
    expenseList: { category: null, paymentMethod: null, search: '', includeVoid: false },
    expensesLoading: false,
    expensesError: null,
    expenseMutating: false,
    newExpenseRequested: false,
    categories: [],
    categoriesLoading: false,

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
      await Promise.all([get().loadCategories(), loadForTab(get().activeTab)]);
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
        case 'expenses':
          return get().loadExpenses(get().expensesPage);
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

    // ── Expenses ────────────────────────────────────────────────────────────
    loadExpenses: async (page = 0) => {
      const id = nextRequest('expenses');
      const { filters, expenseList, expensesPageSize } = get();
      set({ expensesLoading: true, expensesError: null });
      const { data, error } = await fetchExpenses({
        startDate: filters.startDate,
        endDate: filters.endDate,
        branchId: filters.branchId,
        category: expenseList.category,
        paymentMethod: expenseList.paymentMethod,
        search: expenseList.search,
        includeVoid: expenseList.includeVoid,
        page,
        pageSize: expensesPageSize,
      });
      if (!isCurrent('expenses', id)) return;
      if (error || !data) {
        set({ expensesLoading: false, expensesError: error ?? 'Unable to load expenses.' });
        return;
      }
      set({
        expenses: data.rows,
        expensesTotal: data.total,
        expensesPage: data.page,
        expensesLoading: false,
        expensesError: null,
        stale: { ...get().stale, expenses: false },
      });
    },

    setExpenseList: (patch) => {
      set({ expenseList: { ...get().expenseList, ...patch } });
      void get().loadExpenses(0);
    },

    requestNewExpense: () => {
      set({ newExpenseRequested: true });
      get().setTab('expenses');
    },

    clearNewExpenseRequest: () => set({ newExpenseRequested: false }),

    addExpense: async (input) => {
      set({ expenseMutating: true });
      const { data, error } = await createExpense(input, get().filters.branchId);
      set({ expenseMutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to save the expense.' };
      // Money moved: every derived view is now out of date.
      set({ stale: { overview: true, expenses: true, ledger: true, dayclose: true } });
      await get().loadExpenses(0);
      return { ok: true };
    },

    editExpense: async (id, input) => {
      set({ expenseMutating: true });
      const { data, error } = await updateExpense(id, input);
      set({ expenseMutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to update the expense.' };
      set({
        expenses: get().expenses.map((e) => (e.id === id ? data : e)),
        stale: { ...get().stale, overview: true, ledger: true, dayclose: true },
      });
      return { ok: true };
    },

    removeExpense: async (id, reason) => {
      set({ expenseMutating: true });
      const { data, error } = await voidExpense(id, reason);
      set({ expenseMutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to void the expense.' };
      const { expenseList, expenses } = get();
      set({
        expenses: expenseList.includeVoid ? expenses.map((e) => (e.id === id ? data : e)) : expenses.filter((e) => e.id !== id),
        expensesTotal: expenseList.includeVoid ? get().expensesTotal : Math.max(0, get().expensesTotal - 1),
        stale: { ...get().stale, overview: true, ledger: true, dayclose: true },
      });
      return { ok: true };
    },

    loadCategories: async () => {
      set({ categoriesLoading: true });
      const { data } = await fetchExpenseCategories();
      set({ categories: data ?? [], categoriesLoading: false });
    },

    addCategory: async (name) => {
      const { data, error } = await createExpenseCategory(name);
      if (error || !data) return { ok: false, error: error ?? 'Unable to create the category.' };
      const merged = [...get().categories.filter((c) => c.id !== data.id), data].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
      set({ categories: merged });
      return { ok: true };
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
