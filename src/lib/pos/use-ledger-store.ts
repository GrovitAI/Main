/**
 * Finance ledger — Zustand store.
 *
 * Owns the reference data (accounts, catalog, rules), the filtered page of
 * entries, the entry the user has opened with its edit history, and the
 * balances the owner sees. A request counter per area keeps a slow response
 * from overwriting a newer one, as in use-finance-store.ts.
 */
import { create } from 'zustand';

import {
  createCatalogItem,
  createLedgerEntry,
  fetchAccountBalances,
  fetchEntryRevisions,
  fetchFinanceAccounts,
  fetchFinanceCatalog,
  fetchFinanceRules,
  fetchFreeTextParticulars,
  fetchInterAccountPositions,
  fetchLedgerEntries,
  fetchLedgerEntry,
  fetchLedgerSummary,
  reorderCatalogItems,
  settleLedgerEntry,
  updateCatalogItem,
  updateFinanceRules,
  updateLedgerEntry,
  voidLedgerEntry,
} from './finance-ledger-service';
import type {
  AccountBalance,
  CatalogItem,
  CatalogItemInput,
  CatalogItemPatch,
  EntryRevision,
  FinanceAccount,
  FinanceEntry,
  FinanceEntryInput,
  FinanceRules,
  FreeTextParticular,
  InterAccountPosition,
  LedgerAccountSummary,
  LedgerFilters,
  SettleEntryInput,
} from './finance-types';
import { LEDGER_MAX_ROWS, catalogSiblings, initialLedgerFilters, moveCatalogSibling } from './finance-ledger-utils';

type MutationResult = { ok: true } | { ok: false; error: string };

type LedgerState = {
  initialized: boolean;
  initializing: boolean;
  initError: string | null;

  accounts: FinanceAccount[];
  catalog: CatalogItem[];
  rules: FinanceRules | null;

  filters: LedgerFilters;
  entries: FinanceEntry[];
  total: number;
  loading: boolean;
  /** A further page is being appended (phone scrolling). */
  loadingMore: boolean;
  error: string | null;
  mutating: boolean;

  /** The entry opened in the detail sheet, with its history. */
  selected: FinanceEntry | null;
  revisions: EntryRevision[];
  revisionsLoading: boolean;

  balances: AccountBalance[];
  balancesLoading: boolean;
  /** Who owes whom across accounts; empty for a clerk who may not see balances. */
  positions: InterAccountPosition[];
  /** Per-account ledger income, expenses and open amounts for the current range. */
  summary: LedgerAccountSummary[];

  /** Free-text particulars under the category the Catalog screen is looking at. */
  freeText: FreeTextParticular[];
  freeTextLoading: boolean;

  /** Set by the phone's quick-add button; the ledger opens a blank form and clears it. */
  newEntryRequested: boolean;

  initialize: () => Promise<void>;
  refreshReference: () => Promise<void>;
  loadEntries: (page?: number, options?: { append?: boolean }) => Promise<void>;
  /** Appends the next page, for a scrolling list. No-op at the end or the cap. */
  loadMore: () => Promise<void>;
  setFilters: (patch: Partial<LedgerFilters>) => void;
  addEntry: (input: FinanceEntryInput) => Promise<MutationResult>;
  editEntry: (id: string, input: FinanceEntryInput) => Promise<MutationResult>;
  voidEntry: (id: string, reason: string) => Promise<MutationResult>;
  /** Records a payment against an open payable or receivable. */
  settleEntry: (input: SettleEntryInput) => Promise<MutationResult>;
  openEntry: (entry: FinanceEntry | null) => Promise<void>;
  /** Opens an entry that may not be on the current page, such as the one a payment settles. */
  openEntryById: (id: string) => Promise<void>;
  loadBalances: () => Promise<void>;
  saveRules: (patch: Partial<Omit<FinanceRules, 'tenant_id'>>) => Promise<MutationResult>;
  /** Catalog (owner): add, change, hide or show, and reorder. Nothing is deleted. */
  addCatalogItem: (input: CatalogItemInput) => Promise<MutationResult>;
  changeCatalogItem: (id: string, patch: CatalogItemPatch) => Promise<MutationResult>;
  moveCatalogItem: (id: string, direction: 'up' | 'down') => Promise<MutationResult>;
  loadFreeText: (categoryId: string | null, subcategoryId: string | null) => Promise<void>;
  requestNewEntry: () => void;
  clearNewEntryRequest: () => void;
};

export const useLedgerStore = create<LedgerState>((set, get) => {
  let entriesRequest = 0;
  let revisionsRequest = 0;

  return {
    initialized: false,
    initializing: false,
    initError: null,

    accounts: [],
    catalog: [],
    rules: null,

    filters: initialLedgerFilters(),
    entries: [],
    total: 0,
    loading: false,
    loadingMore: false,
    error: null,
    mutating: false,

    selected: null,
    revisions: [],
    revisionsLoading: false,

    balances: [],
    balancesLoading: false,
    positions: [],
    summary: [],

    freeText: [],
    freeTextLoading: false,

    newEntryRequested: false,

    initialize: async () => {
      if (get().initialized || get().initializing) return;
      set({ initializing: true, initError: null });
      await get().refreshReference();
      set({ initialized: true, initializing: false });
      await Promise.all([get().loadEntries(0), get().loadBalances()]);
    },

    refreshReference: async () => {
      const [accounts, catalog, rules] = await Promise.all([fetchFinanceAccounts(), fetchFinanceCatalog(), fetchFinanceRules()]);
      const firstError = accounts.error ?? catalog.error ?? rules.error;
      set({
        accounts: accounts.data ?? get().accounts,
        catalog: catalog.data ?? get().catalog,
        rules: rules.data ?? get().rules,
        initError: firstError,
      });
    },

    loadEntries: async (page, options) => {
      const requestId = ++entriesRequest;
      const append = options?.append === true;
      const filters = { ...get().filters, page: page ?? get().filters.page };
      set({ loading: !append, loadingMore: append, error: null, filters });
      // The count is asked for on the first page only; later pages reuse it.
      const { data, error } = await fetchLedgerEntries(filters, { withCount: filters.page === 0 });
      if (requestId !== entriesRequest) return;
      if (error || !data) {
        set({ loading: false, loadingMore: false, error: error ?? 'Unable to load the ledger.' });
        return;
      }
      set({
        loading: false,
        loadingMore: false,
        entries: append ? [...get().entries, ...data.rows] : data.rows,
        total: data.total ?? get().total,
        filters: { ...get().filters, page: data.page },
      });
    },

    loadMore: async () => {
      const { filters, entries, total, loading, loadingMore } = get();
      if (loading || loadingMore) return;
      if (entries.length >= total || entries.length >= LEDGER_MAX_ROWS) return;
      await get().loadEntries(filters.page + 1, { append: true });
    },

    setFilters: (patch) => {
      const before = get().filters;
      set({ filters: { ...before, ...patch, page: 0 } });
      void get().loadEntries(0);
      if ((patch.startDate && patch.startDate !== before.startDate) || (patch.endDate && patch.endDate !== before.endDate)) {
        void get().loadBalances();
      }
    },

    addEntry: async (input) => {
      set({ mutating: true });
      const { data, error } = await createLedgerEntry(input);
      set({ mutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to save the entry.' };
      await Promise.all([get().loadEntries(0), get().loadBalances()]);
      return { ok: true };
    },

    editEntry: async (id, input) => {
      set({ mutating: true });
      const { data, error } = await updateLedgerEntry(id, input);
      set({ mutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to update the entry.' };
      set({
        entries: get().entries.map((e) => (e.id === id ? data : e)),
        selected: get().selected?.id === id ? data : get().selected,
      });
      await Promise.all([get().openEntry(get().selected), get().loadBalances()]);
      return { ok: true };
    },

    voidEntry: async (id, reason) => {
      set({ mutating: true });
      const { data, error } = await voidLedgerEntry(id, reason);
      set({ mutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to void the entry.' };
      set({
        entries: get().entries.map((e) => (e.id === id ? data : e)),
        selected: get().selected?.id === id ? data : get().selected,
      });
      await Promise.all([get().openEntry(get().selected), get().loadBalances()]);
      return { ok: true };
    },

    settleEntry: async (input) => {
      set({ mutating: true });
      const { data, error } = await settleLedgerEntry(input);
      set({ mutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to settle the entry.' };
      // The original's status and settled amount changed on the server too.
      await Promise.all([get().loadEntries(0), get().loadBalances()]);
      const refreshed = get().entries.find((e) => e.id === input.entry_id) ?? null;
      if (get().selected?.id === input.entry_id) await get().openEntry(refreshed);
      return { ok: true };
    },

    openEntry: async (entry) => {
      const requestId = ++revisionsRequest;
      set({ selected: entry, revisions: [], revisionsLoading: entry !== null });
      if (!entry) return;
      const { data } = await fetchEntryRevisions(entry.id);
      if (requestId !== revisionsRequest) return;
      set({ revisions: data ?? [], revisionsLoading: false });
    },

    openEntryById: async (id) => {
      const onPage = get().entries.find((e) => e.id === id);
      if (onPage) {
        await get().openEntry(onPage);
        return;
      }
      const { data } = await fetchLedgerEntry(id);
      if (data) await get().openEntry(data);
    },

    loadBalances: async () => {
      const ids = get().accounts.filter((a) => a.is_active).map((a) => a.id);
      if (ids.length === 0) {
        set({ balances: [], positions: [], summary: [] });
        return;
      }
      set({ balancesLoading: true });
      const { startDate, endDate } = get().filters;
      const [balances, positions, summary] = await Promise.all([
        fetchAccountBalances(ids),
        fetchInterAccountPositions(),
        fetchLedgerSummary(startDate, endDate),
      ]);
      set({
        balances: balances.data ?? [],
        positions: positions.data ?? [],
        summary: summary.data ?? [],
        balancesLoading: false,
      });
    },

    saveRules: async (patch) => {
      const { data, error } = await updateFinanceRules(patch);
      if (error || !data) return { ok: false, error: error ?? 'Unable to save the finance rules.' };
      set({ rules: data });
      return { ok: true };
    },

    addCatalogItem: async (input) => {
      set({ mutating: true });
      const { data, error } = await createCatalogItem(input);
      set({ mutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to add to the catalog.' };
      set({ catalog: [...get().catalog, data] });
      return { ok: true };
    },

    changeCatalogItem: async (id, patch) => {
      set({ mutating: true });
      const { data, error } = await updateCatalogItem(id, patch);
      set({ mutating: false });
      if (error || !data) return { ok: false, error: error ?? 'Unable to update the catalog.' };
      set({ catalog: get().catalog.map((c) => (c.id === id ? data : c)) });
      return { ok: true };
    },

    moveCatalogItem: async (id, direction) => {
      const item = get().catalog.find((c) => c.id === id);
      if (!item) return { ok: false, error: 'That item is no longer in the catalog.' };
      const orders = moveCatalogSibling(catalogSiblings(get().catalog, item.parent_id), id, direction);
      if (!orders) return { ok: true };
      set({ mutating: true });
      const { error } = await reorderCatalogItems(orders);
      set({ mutating: false });
      if (error) return { ok: false, error };
      const byId = new Map(orders.map((o) => [o.id, o.sort_order]));
      set({ catalog: get().catalog.map((c) => (byId.has(c.id) ? { ...c, sort_order: byId.get(c.id) ?? c.sort_order } : c)) });
      return { ok: true };
    },

    loadFreeText: async (categoryId, subcategoryId) => {
      if (!categoryId) {
        set({ freeText: [], freeTextLoading: false });
        return;
      }
      set({ freeTextLoading: true });
      const { data } = await fetchFreeTextParticulars(categoryId, subcategoryId);
      set({ freeText: data ?? [], freeTextLoading: false });
    },

    requestNewEntry: () => set({ newEntryRequested: true }),
    clearNewEntryRequest: () => set({ newEntryRequested: false }),
  };
});
