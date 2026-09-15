import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Pencil,
  Plus,
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type { EntryFormValues, FinanceEntry, FinanceEntryInput, LedgerKind, LedgerSort, LedgerStatusFilter } from '@/lib/pos/finance-types';
import { LEDGER_KINDS, LEDGER_MODES } from '@/lib/pos/finance-types';
import { formatDateLabel, formatDateLong, formatDateTime, formatINR, formatTime, getCurrentBusinessDate } from '@/lib/pos/finance-utils';
import {
  LEDGER_KIND_LABELS,
  LEDGER_MODE_LABELS,
  canEditEntry,
  canSeeBalances,
  canVoidEntry,
  catalogById,
  describeChanges,
  emptyEntryForm,
  entryDirection,
  entryToFormValues,
} from '@/lib/pos/finance-ledger-utils';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { useLedgerStore } from '@/lib/pos/use-ledger-store';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { EntryFormModal } from './EntryFormModal';
import { FinanceEmptyView, FinanceErrorView, FinanceLoadingView, financeContentPadding } from './FinanceStateViews';

type Props = { compact?: boolean };

type FormState = { visible: boolean; mode: 'create' | 'edit'; entry: FinanceEntry | null };

const STATUS_FILTERS: { key: LedgerStatusFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'open', label: 'Open' },
  { key: 'settled', label: 'Settled' },
  { key: 'void', label: 'Void' },
  { key: 'all', label: 'Everything' },
];

const SORTS: { key: LedgerSort; label: string }[] = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'entered_at', label: 'Entered' },
  { key: 'amount', label: 'Amount' },
  { key: 'particulars', label: 'A–Z' },
];

export function LedgerTab({ compact = false }: Props) {
  const session = useSessionStore((s) => s.session);
  const role = session?.role ?? null;
  const staffId = session?.staffId ?? null;
  const { isDesktop } = useResponsive();
  const compactMoney = compact || !isDesktop;

  const financeFilters = useFinanceStore((s) => s.filters);

  const initialized = useLedgerStore((s) => s.initialized);
  const initialize = useLedgerStore((s) => s.initialize);
  const initError = useLedgerStore((s) => s.initError);
  const accounts = useLedgerStore((s) => s.accounts);
  const catalog = useLedgerStore((s) => s.catalog);
  const rules = useLedgerStore((s) => s.rules);
  const filters = useLedgerStore((s) => s.filters);
  const entries = useLedgerStore((s) => s.entries);
  const total = useLedgerStore((s) => s.total);
  const loading = useLedgerStore((s) => s.loading);
  const error = useLedgerStore((s) => s.error);
  const mutating = useLedgerStore((s) => s.mutating);
  const selected = useLedgerStore((s) => s.selected);
  const revisions = useLedgerStore((s) => s.revisions);
  const revisionsLoading = useLedgerStore((s) => s.revisionsLoading);
  const balances = useLedgerStore((s) => s.balances);
  const newEntryRequested = useLedgerStore((s) => s.newEntryRequested);
  const loadEntries = useLedgerStore((s) => s.loadEntries);
  const setFilters = useLedgerStore((s) => s.setFilters);
  const addEntry = useLedgerStore((s) => s.addEntry);
  const editEntry = useLedgerStore((s) => s.editEntry);
  const voidEntry = useLedgerStore((s) => s.voidEntry);
  const openEntry = useLedgerStore((s) => s.openEntry);
  const clearNewEntryRequest = useLedgerStore((s) => s.clearNewEntryRequest);

  const [form, setForm] = useState<FormState>({ visible: false, mode: 'create', entry: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<EntryFormValues>(() => emptyEntryForm('', getCurrentBusinessDate()));
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<FinanceEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(filters.search);
  // The filter rows fold away: the start page shows the search, the active
  // filters as removable chips, and the entries. Open the panel to change them.
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (session) void initialize();
  }, [session, initialize]);

  // The date range is the one the Finance filter bar (or the phone sheet) sets.
  useEffect(() => {
    if (!initialized) return;
    if (filters.startDate === financeFilters.startDate && filters.endDate === financeFilters.endDate) return;
    setFilters({ startDate: financeFilters.startDate, endDate: financeFilters.endDate });
  }, [initialized, financeFilters.startDate, financeFilters.endDate, filters.startDate, filters.endDate, setFilters]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchDraft !== filters.search) setFilters({ search: searchDraft });
    }, 350);
    return () => clearTimeout(handle);
  }, [searchDraft, filters.search, setFilters]);

  useEffect(() => {
    if (!savedNotice) return;
    const handle = setTimeout(() => setSavedNotice(null), 3500);
    return () => clearTimeout(handle);
  }, [savedNotice]);

  // The default account for a new entry: the user's own branch, else the first.
  const defaultAccountId = useMemo(() => {
    const active = accounts.filter((a) => a.is_active);
    const own = active.find((a) => a.branch_id === session?.branchId);
    return (own ?? active[0])?.id ?? '';
  }, [accounts, session?.branchId]);

  const openCreate = useCallback(() => {
    setFormError(null);
    setInitialValues(emptyEntryForm(defaultAccountId, getCurrentBusinessDate()));
    setForm({ visible: true, mode: 'create', entry: null });
  }, [defaultAccountId]);

  // The phone shell's quick-add button lands here with the form already open.
  useEffect(() => {
    if (!newEntryRequested || !initialized) return;
    clearNewEntryRequest();
    openCreate();
  }, [newEntryRequested, initialized, clearNewEntryRequest, openCreate]);

  const openEdit = (entry: FinanceEntry) => {
    setFormError(null);
    setInitialValues(entryToFormValues(entry));
    setForm({ visible: true, mode: 'edit', entry });
  };
  const closeForm = () => setForm((prev) => ({ ...prev, visible: false }));

  const handleSubmit = async (input: FinanceEntryInput, keepOpen: boolean) => {
    setFormError(null);
    const result = form.mode === 'edit' && form.entry ? await editEntry(form.entry.id, input) : await addEntry(input);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSavedNotice(`Saved ${LEDGER_KIND_LABELS[input.kind].toLowerCase()} ${formatINR(input.amount)} · ${input.particulars}`);
    if (keepOpen) {
      // End-of-day entry is a run of receipts; the form stays up, same account and date.
      setInitialValues({ ...emptyEntryForm(input.account_id, input.transaction_date), kind: input.kind, mode: input.mode ?? 'cash' });
      return;
    }
    closeForm();
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    setVoidError(null);
    const result = await voidEntry(voidTarget.id, voidReason);
    if (!result.ok) {
      setVoidError(result.error);
      return;
    }
    setVoidTarget(null);
    setVoidReason('');
  };

  const accountName = useCallback((id: string) => accounts.find((a) => a.id === id)?.name ?? 'Account', [accounts]);
  const showBalances = canSeeBalances(role, rules) && balances.length > 0;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const firstIndex = total === 0 ? 0 : filters.page * filters.pageSize + 1;
  const lastIndex = Math.min(total, (filters.page + 1) * filters.pageSize);

  const pageTotals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const e of entries) {
      if (e.status === 'void' || e.kind === 'transfer' || e.kind === 'payable' || e.kind === 'receivable') continue;
      if (e.kind === 'income') inSum += e.amount;
      else outSum += e.amount;
    }
    return { inSum, outSum };
  }, [entries]);

  const renderItem = useCallback(
    ({ item }: { item: FinanceEntry }) => (
      <EntryRow
        item={item}
        compact={compact}
        accountName={accountName(item.account_id)}
        categoryPath={[catalogById(catalog, item.category_id)?.name, catalogById(catalog, item.subcategory_id)?.name].filter(Boolean).join(' › ')}
        onPress={() => void openEntry(item)}
      />
    ),
    [compact, accountName, catalog, openEntry],
  );

  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.accountId) activeFilterChips.push({ key: 'account', label: accountName(filters.accountId), clear: () => setFilters({ accountId: null }) });
  if (filters.kind) activeFilterChips.push({ key: 'kind', label: LEDGER_KIND_LABELS[filters.kind], clear: () => setFilters({ kind: null }) });
  if (filters.mode) activeFilterChips.push({ key: 'mode', label: LEDGER_MODE_LABELS[filters.mode], clear: () => setFilters({ mode: null }) });
  if (filters.enteredBy) activeFilterChips.push({ key: 'mine', label: 'Mine', clear: () => setFilters({ enteredBy: null }) });
  if (filters.status !== 'active') {
    activeFilterChips.push({
      key: 'status',
      label: STATUS_FILTERS.find((s) => s.key === filters.status)?.label ?? filters.status,
      clear: () => setFilters({ status: 'active' }),
    });
  }
  const sortLabel = `${SORTS.find((s) => s.key === filters.sort)?.label ?? 'Date'} ${filters.sortDir === 'desc' ? '↓' : '↑'}`;
  const clearAllFilters = () => setFilters({ accountId: null, kind: null, mode: null, enteredBy: null, status: 'active' });

  const balanceCards = balances.map((b) => (
    <View key={b.account_id} className={`rounded-2xl border border-border/60 bg-white p-3 shadow-sm ${compact ? 'min-w-[200px]' : 'min-w-[220px] flex-1'}`}>
      <Text className="text-[11px] font-bold uppercase tracking-wide text-text-secondary" numberOfLines={1}>{accountName(b.account_id)}</Text>
      <View className="mt-1 flex-row items-end justify-between">
        <View>
          <Text className="text-[10px] text-text-secondary">Cash</Text>
          <Text className="text-base font-extrabold text-text-primary">{formatINR(b.cash, { compact: compactMoney })}</Text>
        </View>
        <View className="items-end">
          <Text className="text-[10px] text-text-secondary">Bank</Text>
          <Text className="text-base font-extrabold text-text-primary">{formatINR(b.bank, { compact: compactMoney })}</Text>
        </View>
      </View>
    </View>
  ));

  const header = (
    <View className="mb-3">
      {showBalances ? (
        compact ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: 2 }}>
            {balanceCards}
          </ScrollView>
        ) : (
          <View className="mb-3 flex-row flex-wrap gap-3">{balanceCards}</View>
        )
      ) : null}

      {/* Toolbar: search, the filter toggle, record */}
      <View className={compact ? 'gap-2' : 'flex-row items-center gap-2'}>
        <View className="min-h-[44px] flex-1 flex-row items-center rounded-xl border border-border bg-white px-3">
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search particulars, payee, reference…"
            placeholderTextColor={colors.textSecondary}
            className="ml-2 flex-1 text-sm text-text-primary"
            accessibilityLabel="Search the ledger"
          />
          {searchDraft.length > 0 ? (
            <Pressable onPress={() => setSearchDraft('')} className="h-[36px] w-[36px] items-center justify-center" hitSlop={4} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={14} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => setFiltersOpen((v) => !v)}
            className={`min-h-[44px] flex-row items-center justify-center rounded-xl border px-3 ${filtersOpen || activeFilterChips.length > 0 ? 'border-primary bg-accent-soft' : 'border-border bg-white'}`}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={filtersOpen ? 'Hide filters' : 'Show filters'}
            accessibilityState={{ expanded: filtersOpen }}
          >
            <SlidersHorizontal size={15} color={colors.primary} />
            <Text className="ml-1.5 text-xs font-bold text-primary">
              Filters{activeFilterChips.length > 0 ? ` · ${activeFilterChips.length}` : ''}
            </Text>
            <View className="ml-1">{filtersOpen ? <ChevronUp size={14} color={colors.primary} /> : <ChevronDown size={14} color={colors.primary} />}</View>
          </Pressable>
          <Pressable
            onPress={openCreate}
            disabled={!initialized}
            className={`min-h-[44px] flex-row items-center justify-center rounded-xl bg-primary px-4 ${compact ? 'flex-1' : ''}`}
            style={({ pressed }) => [{ opacity: pressed || !initialized ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Record an entry"
          >
            <Plus size={16} color={colors.textOnPrimary} />
            <Text className="ml-1.5 text-sm font-bold text-text-on-primary">Record entry</Text>
          </Pressable>
        </View>
      </View>

      {/* What is filtering the list right now, each removable with a tap */}
      {activeFilterChips.length > 0 && !filtersOpen ? (
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          {activeFilterChips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={chip.clear}
              className="min-h-[36px] flex-row items-center rounded-full border border-primary bg-accent-soft px-3"
              hitSlop={4}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
            >
              <Text className="text-xs font-bold text-primary">{chip.label}</Text>
              <View className="ml-1"><X size={12} color={colors.primary} /></View>
            </Pressable>
          ))}
          <Pressable onPress={clearAllFilters} className="min-h-[36px] justify-center px-2" hitSlop={4} accessibilityRole="button" accessibilityLabel="Clear all filters">
            <Text className="text-xs font-bold text-text-secondary">Clear all</Text>
          </Pressable>
        </View>
      ) : null}

      {filtersOpen ? (
        <View className="mt-3 rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
          <FilterRow label="Account" compact={compact}>
            <FilterChip label="All accounts" active={filters.accountId === null} onPress={() => setFilters({ accountId: null })} />
            {accounts.filter((a) => a.is_active).map((a) => (
              <FilterChip key={a.id} label={a.name} active={filters.accountId === a.id} onPress={() => setFilters({ accountId: filters.accountId === a.id ? null : a.id })} />
            ))}
          </FilterRow>
          <FilterRow label="Kind" compact={compact}>
            <FilterChip label="Any kind" active={filters.kind === null} onPress={() => setFilters({ kind: null })} />
            {LEDGER_KINDS.map((k: LedgerKind) => (
              <FilterChip key={k} label={LEDGER_KIND_LABELS[k]} active={filters.kind === k} onPress={() => setFilters({ kind: filters.kind === k ? null : k })} />
            ))}
          </FilterRow>
          <FilterRow label="Paid via" compact={compact}>
            <FilterChip label="Cash or bank" active={filters.mode === null} onPress={() => setFilters({ mode: null })} />
            {LEDGER_MODES.map((m) => (
              <FilterChip key={m} label={LEDGER_MODE_LABELS[m]} active={filters.mode === m} onPress={() => setFilters({ mode: filters.mode === m ? null : m })} />
            ))}
          </FilterRow>
          <FilterRow label="Entered by" compact={compact}>
            <FilterChip label="Anyone" active={filters.enteredBy === null} onPress={() => setFilters({ enteredBy: null })} />
            <FilterChip label="Me" active={filters.enteredBy !== null} onPress={() => setFilters({ enteredBy: staffId })} />
          </FilterRow>
          <FilterRow label="Status" compact={compact}>
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s.key} label={s.label} active={filters.status === s.key} onPress={() => setFilters({ status: s.key })} />
            ))}
          </FilterRow>
          <FilterRow label="Sort" compact={compact} last>
            {SORTS.map((s) => (
              <FilterChip
                key={s.key}
                label={filters.sort === s.key ? `${s.label} ${filters.sortDir === 'desc' ? '↓' : '↑'}` : s.label}
                active={filters.sort === s.key}
                onPress={() => setFilters(filters.sort === s.key ? { sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' } : { sort: s.key, sortDir: 'desc' })}
              />
            ))}
          </FilterRow>
        </View>
      ) : null}

      {savedNotice ? (
        <View className="mt-3 flex-row items-center rounded-xl px-3 py-2" style={{ backgroundColor: semantic.successSoft }} accessibilityLiveRegion="polite">
          <Text className="text-xs font-bold" style={{ color: semantic.success }} numberOfLines={1}>{savedNotice}</Text>
        </View>
      ) : null}

      {/* Summary strip */}
      <View className="mt-3 flex-row items-center justify-between rounded-xl bg-surface-tint px-3 py-2">
        <Text className="text-xs font-semibold text-text-secondary">
          {total === 0 ? 'No entries' : `Showing ${firstIndex}–${lastIndex} of ${total}`} · {sortLabel}
        </Text>
        <Text className="text-xs font-bold text-text-primary">
          <Text style={{ color: semantic.success }}>{formatINR(pageTotals.inSum, { signed: true, compact: compactMoney })}</Text>
          {'  '}
          <Text style={{ color: semantic.danger }}>{formatINR(-pageTotals.outSum, { compact: compactMoney })}</Text>
        </Text>
      </View>

      {initError ? <View className="mt-3"><FinanceErrorView message={initError} compact /></View> : null}
      {error ? <View className="mt-3"><FinanceErrorView message={error} onRetry={() => loadEntries(filters.page)} compact /></View> : null}
      {loading && entries.length > 0 ? <FinanceLoadingView inline label="Updating…" /> : null}
    </View>
  );

  const footer =
    total > filters.pageSize ? (
      <View className="mt-3 flex-row items-center justify-center gap-3 py-2">
        <Pressable
          onPress={() => loadEntries(filters.page - 1)}
          disabled={filters.page === 0 || loading}
          className="h-[44px] w-[44px] items-center justify-center rounded-full border border-border bg-white"
          style={({ pressed }) => [{ opacity: filters.page === 0 || loading || pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
        >
          <ChevronLeft size={18} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-xs font-semibold text-text-secondary">Page {filters.page + 1} of {pageCount}</Text>
        <Pressable
          onPress={() => loadEntries(filters.page + 1)}
          disabled={filters.page + 1 >= pageCount || loading}
          className="h-[44px] w-[44px] items-center justify-center rounded-full border border-border bg-white"
          style={({ pressed }) => [{ opacity: filters.page + 1 >= pageCount || loading || pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Next page"
        >
          <ChevronRight size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
    ) : null;

  const selectedEditable = selected ? canEditEntry(selected, role, staffId, rules) : false;
  const selectedVoidable = selected ? selected.status !== 'void' && canVoidEntry(role, rules) && (canEditEntry(selected, role, staffId, rules) || canVoidEntry(role, null)) : false;

  return (
    <View className="flex-1">
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          loading || !initialized ? (
            <FinanceLoadingView label="Loading the ledger…" />
          ) : error ? null : (
            <FinanceEmptyView
              title="No entries in this range"
              subtitle="Income, expenses, payables and receivables you record appear here, newest first."
              action={{ label: 'Record the first entry', onPress: openCreate }}
            />
          )
        }
        contentContainerStyle={financeContentPadding(compact)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      <EntryFormModal
        visible={form.visible}
        mode={form.mode}
        initialValues={initialValues}
        accounts={accounts}
        catalog={catalog}
        rules={rules}
        role={role}
        submitting={mutating}
        serverError={formError}
        onSubmit={(input) => void handleSubmit(input, false)}
        onSubmitAndNext={(input) => void handleSubmit(input, true)}
        onClose={closeForm}
      />

      <EntryDetailSheet
        entry={selected}
        compact={compact}
        accountName={selected ? accountName(selected.account_id) : ''}
        categoryPath={selected ? [catalogById(catalog, selected.category_id)?.name, catalogById(catalog, selected.subcategory_id)?.name].filter(Boolean).join(' › ') : ''}
        revisions={revisions}
        revisionsLoading={revisionsLoading}
        canEdit={selectedEditable}
        canVoid={selectedVoidable}
        onEdit={() => {
          if (!selected) return;
          void openEntry(null);
          openEdit(selected);
        }}
        onVoid={() => {
          if (!selected) return;
          setVoidReason('');
          setVoidError(null);
          setVoidTarget(selected);
          void openEntry(null);
        }}
        onClose={() => void openEntry(null)}
        describe={(changes) => describeChanges(changes, { catalog, accounts }, (r) => formatINR(r))}
      />

      {/* Void confirmation */}
      <Modal visible={voidTarget !== null} transparent animationType="fade" onRequestClose={() => setVoidTarget(null)}>
        <KeyboardAvoider>
        <Pressable className="flex-1 items-center justify-center bg-black/40 px-4" onPress={() => setVoidTarget(null)}>
          <Pressable onPress={() => undefined} className="w-full max-w-[440px] rounded-3xl bg-white p-5 shadow-panel">
            <Text className="text-base font-bold text-text-primary">Void this entry?</Text>
            {voidTarget ? (
              <Text className="mt-1 text-xs text-text-secondary">
                {LEDGER_KIND_LABELS[voidTarget.kind]} · {formatINR(voidTarget.amount)} · {voidTarget.particulars} on {formatDateLabel(voidTarget.transaction_date, true)}.
                The row stays in the ledger and the history, marked void, and stops counting.
              </Text>
            ) : null}
            <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Reason</Text>
            <TextInput
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="Why is this being voided?"
              placeholderTextColor={colors.textSecondary}
              className="min-h-[44px] rounded-xl border border-border bg-white px-3 text-sm text-text-primary"
              accessibilityLabel="Void reason"
            />
            {voidError ? <Text className="mt-2 text-xs font-semibold" style={{ color: semantic.danger }}>{voidError}</Text> : null}
            <View className="mt-4 flex-row justify-end gap-2">
              <Pressable
                onPress={() => setVoidTarget(null)}
                className="min-h-[44px] items-center justify-center rounded-xl border border-border px-4"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-text-secondary">Keep</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmVoid()}
                disabled={mutating || voidReason.trim().length === 0}
                className="min-h-[44px] min-w-[120px] flex-row items-center justify-center rounded-xl px-4"
                style={({ pressed }) => [{ backgroundColor: semantic.danger, opacity: pressed || mutating || voidReason.trim().length === 0 ? 0.6 : 1 }]}
                accessibilityRole="button"
              >
                {mutating ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <Ban size={15} color={colors.textOnPrimary} />}
                <Text className="ml-1.5 text-sm font-bold text-text-on-primary">Void entry</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoider>
      </Modal>
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

type FilterRowProps = { label: string; compact: boolean; last?: boolean; children: React.ReactNode };

function FilterRow({ label, compact, last = false, children }: FilterRowProps) {
  return (
    <View className={`${last ? '' : 'mb-2'} ${compact ? '' : 'flex-row items-center'}`}>
      <Text className={`text-[11px] font-bold uppercase tracking-wide text-text-secondary ${compact ? 'mb-1.5' : 'w-[96px]'}`}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerStyle={{ alignItems: 'center' }}>
        {children}
      </ScrollView>
    </View>
  );
}

type FilterChipProps = { label: string; active: boolean; onPress: () => void };

function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 min-h-[40px] items-center justify-center rounded-full border px-3.5 ${active ? 'border-primary bg-accent-soft' : 'border-border bg-white'}`}
      hitSlop={2}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text className={`text-xs font-bold ${active ? 'text-primary' : 'text-text-secondary'}`}>{label}</Text>
    </Pressable>
  );
}

function kindTone(kind: LedgerKind): { color: string; soft: string; Icon: typeof ArrowDownLeft } {
  const direction = entryDirection(kind);
  if (direction === 'in') return { color: semantic.success, soft: semantic.successSoft, Icon: ArrowDownLeft };
  if (direction === 'move') return { color: colors.primary, soft: colors.accentSoft, Icon: ArrowLeftRight };
  return { color: semantic.danger, soft: semantic.dangerSoft, Icon: ArrowUpRight };
}

function signedAmount(entry: FinanceEntry, compactMoney = false): string {
  const direction = entryDirection(entry.kind);
  if (direction === 'move') return formatINR(entry.amount, { compact: compactMoney });
  return formatINR(direction === 'in' ? entry.amount : -entry.amount, { signed: true, compact: compactMoney });
}

function StatusPill({ status }: { status: FinanceEntry['status'] }) {
  if (status === 'recorded') return null;
  const palette =
    status === 'void'
      ? { bg: semantic.neutralSoft, fg: semantic.neutral }
      : status === 'open'
        ? { bg: semantic.warningSoft, fg: semantic.warning }
        : { bg: semantic.successSoft, fg: semantic.success };
  return (
    <Text className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: palette.bg, color: palette.fg }}>
      {status}
    </Text>
  );
}

type EntryRowProps = { item: FinanceEntry; compact: boolean; accountName: string; categoryPath: string; onPress: () => void };

function EntryRow({ item, compact, accountName, categoryPath, onPress }: EntryRowProps) {
  const voided = item.status === 'void';
  const tone = kindTone(item.kind);
  const meta = [accountName, categoryPath || LEDGER_KIND_LABELS[item.kind], item.counterparty].filter(Boolean).join(' · ');
  const who = `${formatDateLabel(item.transaction_date)} · ${item.mode ? LEDGER_MODE_LABELS[item.mode] : `${item.transfer_from} → ${item.transfer_to}`} · ${item.entered_by_name ?? 'Staff'} ${formatTime(item.entered_at)}`;

  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 flex-row items-center rounded-2xl border border-border/60 bg-white ${compact ? 'p-3' : 'px-4 py-3'} ${voided ? 'opacity-60' : ''}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : voided ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${LEDGER_KIND_LABELS[item.kind]} ${formatINR(item.amount)} ${item.particulars}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: tone.soft }}>
        <tone.Icon size={16} color={tone.color} />
      </View>
      <View className="flex-1 px-3">
        <Text className="text-sm font-bold text-text-primary" numberOfLines={1}>{item.particulars}</Text>
        <Text className="text-[11px] text-text-secondary" numberOfLines={1}>{meta}</Text>
        <Text className="text-[11px] text-text-secondary" numberOfLines={1}>{who}</Text>
      </View>
      <View className="items-end">
        <Text className="text-sm font-extrabold" style={{ color: tone.color, textDecorationLine: voided ? 'line-through' : 'none' }}>
          {signedAmount(item, compact)}
        </Text>
        <StatusPill status={item.status} />
      </View>
    </Pressable>
  );
}

type EntryDetailSheetProps = {
  entry: FinanceEntry | null;
  compact: boolean;
  accountName: string;
  categoryPath: string;
  revisions: ReturnType<typeof useLedgerStore.getState>['revisions'];
  revisionsLoading: boolean;
  canEdit: boolean;
  canVoid: boolean;
  onEdit: () => void;
  onVoid: () => void;
  onClose: () => void;
  describe: (changes: Record<string, { from: unknown; to: unknown }>) => { field: string; label: string; from: string; to: string }[];
};

function EntryDetailSheet({ entry, compact, accountName, categoryPath, revisions, revisionsLoading, canEdit, canVoid, onEdit, onVoid, onClose, describe }: EntryDetailSheetProps) {
  const insets = useSafeAreaInsets();
  if (!entry) return null;
  const tone = kindTone(entry.kind);
  const rows: { label: string; value: string }[] = [
    { label: 'Account', value: accountName },
    { label: 'Kind', value: LEDGER_KIND_LABELS[entry.kind] },
    { label: entry.kind === 'transfer' ? 'Moved' : entryDirection(entry.kind) === 'in' ? 'Received via' : 'Paid via', value: entry.mode ? LEDGER_MODE_LABELS[entry.mode] : `${entry.transfer_from} → ${entry.transfer_to}` },
    { label: 'Transaction date', value: formatDateLong(entry.transaction_date) },
    { label: 'Category', value: categoryPath || '—' },
    { label: entryDirection(entry.kind) === 'in' ? 'Received from' : 'Paid to', value: entry.counterparty ?? '—' },
    { label: 'Reference', value: entry.reference_no ?? '—' },
    { label: 'Notes', value: entry.notes ?? '—' },
    { label: 'Entered', value: `${entry.entered_by_name ?? 'Staff'} · ${formatDateTime(entry.entered_at)}` },
  ];
  if (entry.status === 'void') rows.push({ label: 'Voided', value: `${entry.void_reason ?? ''}${entry.voided_at ? ` · ${formatDateTime(entry.voided_at)}` : ''}` });

  return (
    <Modal visible transparent animationType={compact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <Pressable className={`flex-1 bg-black/40 ${compact ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          className={`w-full overflow-hidden bg-white shadow-panel ${compact ? 'max-h-[88%] rounded-t-3xl' : 'max-h-[88%] max-w-[560px] rounded-3xl'}`}
        >
          <View className="flex-row items-center border-b border-border-soft px-5 py-4">
            <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: tone.soft }}>
              <tone.Icon size={18} color={tone.color} />
            </View>
            <View className="flex-1 px-3">
              <Text className="text-base font-bold text-text-primary" numberOfLines={2}>{entry.particulars}</Text>
              <Text className="text-xl font-extrabold" style={{ color: tone.color }}>{signedAmount(entry)}</Text>
            </View>
            <StatusPill status={entry.status} />
            <Pressable onPress={onClose} className="ml-1 h-[44px] w-[44px] items-center justify-center rounded-full" style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-3" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            {rows.map((row) => (
              <View key={row.label} className="flex-row items-start justify-between border-b border-border-soft py-2">
                <Text className="w-[130px] text-[11px] font-bold uppercase tracking-wide text-text-secondary">{row.label}</Text>
                <Text className="flex-1 text-right text-sm text-text-primary">{row.value}</Text>
              </View>
            ))}

            <View className="mt-4 flex-row items-center">
              <History size={14} color={colors.textSecondary} />
              <Text className="ml-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">History</Text>
            </View>
            {revisionsLoading ? (
              <FinanceLoadingView inline label="Loading history…" />
            ) : revisions.length === 0 ? (
              <Text className="py-3 text-xs text-text-secondary">No history recorded.</Text>
            ) : (
              revisions.map((rev) => {
                const lines = rev.action === 'create' ? [] : describe(rev.changes);
                return (
                  <View key={rev.id} className="mt-2 rounded-xl bg-surface-tint px-3 py-2">
                    <View className="flex-row items-center">
                      <Clock size={12} color={colors.textSecondary} />
                      <Text className="ml-1.5 flex-1 text-xs font-bold text-text-primary">
                        {rev.action === 'create' ? 'Recorded' : rev.action === 'void' ? 'Voided' : rev.action === 'settle' ? 'Settled' : 'Edited'} by {rev.changed_by_name ?? 'Staff'}
                      </Text>
                      <Text className="text-[11px] text-text-secondary">{formatDateTime(rev.changed_at)}</Text>
                    </View>
                    {lines.map((line) => (
                      <Text key={line.field} className="mt-1 text-[11px] text-text-secondary">
                        {line.label}: <Text className="text-text-primary">{line.from}</Text> → <Text className="font-bold text-text-primary">{line.to}</Text>
                      </Text>
                    ))}
                  </View>
                );
              })
            )}
          </ScrollView>

          {canEdit || canVoid ? (
            <View className="flex-row items-center justify-end gap-2 border-t border-border-soft px-5 py-3" style={compact ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}>
              {canVoid ? (
                <Pressable onPress={onVoid} className="min-h-[44px] flex-row items-center justify-center rounded-xl border px-4" style={({ pressed }) => [{ borderColor: semantic.danger, opacity: pressed ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel="Void entry">
                  <Ban size={15} color={semantic.danger} />
                  <Text className="ml-1.5 text-sm font-bold" style={{ color: semantic.danger }}>Void</Text>
                </Pressable>
              ) : null}
              {canEdit ? (
                <Pressable onPress={onEdit} className="min-h-[44px] min-w-[120px] flex-row items-center justify-center rounded-xl bg-primary px-4" style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]} accessibilityRole="button" accessibilityLabel="Edit entry">
                  <Pencil size={15} color={colors.textOnPrimary} />
                  <Text className="ml-1.5 text-sm font-bold text-text-on-primary">Edit</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View className="border-t border-border-soft px-5 py-3" style={compact ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}>
              <Text className="text-center text-[11px] text-text-secondary">
                {entry.status === 'void' ? 'Voided entries cannot be changed.' : 'This entry can no longer be edited by you.'}
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
