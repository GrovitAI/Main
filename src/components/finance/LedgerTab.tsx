import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  History,
  Paperclip,
  Pencil,
  Plus,
  Repeat,
  Scale,
  ChevronDown,
  ChevronUp,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type {
  CashCountInput,
  EntryFormValues,
  EntryTemplate,
  FinanceEntry,
  FinanceEntryInput,
  LedgerKind,
  LedgerSort,
  LedgerStatusFilter,
  SettleEntryInput,
  StatementSubject,
} from '@/lib/pos/finance-types';
import { LEDGER_KINDS, LEDGER_MODES } from '@/lib/pos/finance-types';
import { formatDateLabel, formatDateLong, formatDateTime, formatINR, formatTime, getCurrentBusinessDate } from '@/lib/pos/finance-utils';
import {
  accountsInScope,
  LEDGER_KIND_LABELS,
  LEDGER_MODE_LABELS,
  LEDGER_SOURCE_LABELS,
  canEditEntry,
  canOffsetEntry,
  canSeeBalances,
  canSettleEntry,
  canTransfer,
  canVoidEntry,
  catalogById,
  catalogChildren,
  counterpartyCaption,
  describeChanges,
  dueStatus,
  emptyEntryForm,
  entryDirection,
  entryToFormValues,
  entryToTemplateInput,
  isFinanceOwner,
  payerCaption,
  remainingAmount,
  summarizeDues,
  summarizeOwedToOthers,
  LEDGER_MAX_ROWS,
  QUICK_ENTRY_PRESETS,
  type DueStatus,
  type QuickEntryKey,
} from '@/lib/pos/finance-ledger-utils';
import { fetchCounterpartyNames, fetchLedgerEntry, fetchPairPosition, fetchReceiptUrl } from '@/lib/pos/finance-ledger-service';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { useLedgerStore } from '@/lib/pos/use-ledger-store';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { CashCountModal } from './CashCountModal';
import { EntryFormModal } from './EntryFormModal';
import { ExportMonthModal } from './ExportMonthModal';
import { RegularsModal } from './RegularsModal';
import { SettleEntryModal } from './SettleEntryModal';
import { StatementModal } from './StatementModal';
import { FinanceEmptyView, FinanceErrorView, FinanceLoadingView, financeContentPadding } from './FinanceStateViews';

type Props = { compact?: boolean };

type FormState = {
  visible: boolean;
  mode: 'create' | 'edit';
  entry: FinanceEntry | null;
  /** Set when a quick action opened the short form; its heading. */
  quickTitle: string | null;
};

/** Names for "Paid to / Received from"; a failure is simply no suggestions. */
async function suggestCounterparties(query: string) {
  const { data } = await fetchCounterpartyNames(query);
  return data ?? [];
}

const STATUS_FILTERS: { key: LedgerStatusFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'open', label: 'Open' },
  { key: 'settled', label: 'Settled' },
  { key: 'void', label: 'Void' },
  { key: 'all', label: 'Everything' },
];

const SORTS: { key: LedgerSort; label: string }[] = [
  { key: 'transaction_date', label: 'Date' },
  { key: 'due_date', label: 'Due' },
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
  const loadingMore = useLedgerStore((s) => s.loadingMore);
  const error = useLedgerStore((s) => s.error);
  const mutating = useLedgerStore((s) => s.mutating);
  const selected = useLedgerStore((s) => s.selected);
  const revisions = useLedgerStore((s) => s.revisions);
  const revisionsLoading = useLedgerStore((s) => s.revisionsLoading);
  const balances = useLedgerStore((s) => s.balances);
  const positions = useLedgerStore((s) => s.positions);
  const dues = useLedgerStore((s) => s.dues);
  const newEntryRequested = useLedgerStore((s) => s.newEntryRequested);
  const loadEntries = useLedgerStore((s) => s.loadEntries);
  const loadMore = useLedgerStore((s) => s.loadMore);
  const setFilters = useLedgerStore((s) => s.setFilters);
  const addEntry = useLedgerStore((s) => s.addEntry);
  const editEntry = useLedgerStore((s) => s.editEntry);
  const voidEntry = useLedgerStore((s) => s.voidEntry);
  const settleEntry = useLedgerStore((s) => s.settleEntry);
  const countCash = useLedgerStore((s) => s.countCash);
  const templates = useLedgerStore((s) => s.templates);
  const templatesLoading = useLedgerStore((s) => s.templatesLoading);
  const loadTemplates = useLedgerStore((s) => s.loadTemplates);
  const saveTemplate = useLedgerStore((s) => s.saveTemplate);
  const removeTemplate = useLedgerStore((s) => s.removeTemplate);
  const recordTemplates = useLedgerStore((s) => s.recordTemplates);
  const attachReceipt = useLedgerStore((s) => s.attachReceipt);
  const openEntry = useLedgerStore((s) => s.openEntry);
  const openEntryById = useLedgerStore((s) => s.openEntryById);
  const clearNewEntryRequest = useLedgerStore((s) => s.clearNewEntryRequest);
  const settleRequestId = useLedgerStore((s) => s.settleRequestId);
  const clearSettleRequest = useLedgerStore((s) => s.clearSettleRequest);

  const [form, setForm] = useState<FormState>({ visible: false, mode: 'create', entry: null, quickTitle: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<EntryFormValues>(() => emptyEntryForm('', getCurrentBusinessDate()));
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<FinanceEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [settleTarget, setSettleTarget] = useState<FinanceEntry | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleOwed, setSettleOwed] = useState<number | undefined>(undefined);
  const [statement, setStatement] = useState<{ visible: boolean; subject: StatementSubject | null }>({ visible: false, subject: null });
  const [countTarget, setCountTarget] = useState<string | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);
  const [regularsOpen, setRegularsOpen] = useState(false);
  const [regularsError, setRegularsError] = useState<string | null>(null);
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

  // The default account for a new entry is the primary books, the account
  // whose profit the partners share (the Central Kitchen), because that is
  // what the ledger is kept for. Failing that, the user's own branch.
  // The accounts this user keeps books for: all of them for the owner, their
  // own branch's account for anyone else.
  const myAccounts = useMemo(() => accountsInScope(accounts, role, session?.branchId), [accounts, role, session?.branchId]);

  const defaultAccountId = useMemo(() => {
    const active = myAccounts.filter((a) => a.is_active);
    const primary = active.find((a) => a.counts_in_partner_profit);
    const own = active.find((a) => a.branch_id === session?.branchId);
    return (primary ?? own ?? active[0])?.id ?? '';
  }, [myAccounts, session?.branchId]);

  const openCreate = useCallback(() => {
    setFormError(null);
    setInitialValues(emptyEntryForm(defaultAccountId, getCurrentBusinessDate()));
    setForm({ visible: true, mode: 'create', entry: null, quickTitle: null });
  }, [defaultAccountId]);

  // A quick action: the same sheet with the kind chosen and four fields showing.
  const openQuick = useCallback(
    (key: QuickEntryKey) => {
      const preset = QUICK_ENTRY_PRESETS.find((p) => p.key === key);
      if (!preset) return;
      setFormError(null);
      setInitialValues({ ...emptyEntryForm(defaultAccountId, getCurrentBusinessDate()), kind: preset.kind });
      setForm({ visible: true, mode: 'create', entry: null, quickTitle: preset.title });
    },
    [defaultAccountId],
  );

  // The phone shell's quick-add button lands here with the form already open.
  useEffect(() => {
    if (!newEntryRequested || !initialized) return;
    clearNewEntryRequest();
    openCreate();
  }, [newEntryRequested, initialized, clearNewEntryRequest, openCreate]);

  // "Pay now" on a purchase in Inventory lands here with its payable to settle.
  useEffect(() => {
    if (!settleRequestId || !initialized) return;
    const id = settleRequestId;
    clearSettleRequest();
    let cancelled = false;
    void fetchLedgerEntry(id).then(({ data }) => {
      if (cancelled || !data) return;
      if (canSettleEntry(data, role)) {
        setSettleError(null);
        setSettleTarget(data);
      } else {
        // Already paid, or not this user's to settle: show it instead.
        void openEntry(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settleRequestId, initialized, clearSettleRequest, role, openEntry]);

  const openEdit = (entry: FinanceEntry) => {
    setFormError(null);
    setInitialValues(entryToFormValues(entry));
    setForm({ visible: true, mode: 'edit', entry, quickTitle: null });
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

  const openSettle = (entry: FinanceEntry) => {
    setSettleError(null);
    setSettleTarget(entry);
  };

  // What the entry's account owes the branch it is collecting from, from money
  // already moved between them: the most a receivable can be offset by. The
  // database answers 0 for anyone who may not see the accounts, so for a
  // clerk the offset option never appears.
  useEffect(() => {
    const other = settleTarget?.counterparty_account_id;
    // An offset is the owner's, in the books that hold the receivable.
    const mayOffset = isFinanceOwner(role) && settleTarget !== null && myAccounts.some((a) => a.id === settleTarget.account_id);
    if (!settleTarget || !other || !canOffsetEntry(settleTarget) || !mayOffset) {
      setSettleOwed(undefined);
      return;
    }
    let cancelled = false;
    setSettleOwed(undefined);
    void fetchPairPosition(settleTarget.account_id, other).then(({ data }) => {
      if (!cancelled) setSettleOwed(data ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [settleTarget, role, myAccounts]);

  const handleSettle = async (input: SettleEntryInput) => {
    setSettleError(null);
    const result = await settleEntry(input);
    if (!result.ok) {
      setSettleError(result.error);
      return;
    }
    setSettleTarget(null);
    setSavedNotice(`Recorded ${formatINR(input.amount)} ${settleTarget?.kind === 'receivable' ? 'received' : 'paid'} · ${settleTarget?.particulars ?? ''}`);
  };

  const openRegulars = () => {
    setRegularsError(null);
    setRegularsOpen(true);
    void loadTemplates();
  };

  const handleRecordRegulars = async (picks: { template: EntryTemplate; amount: number }[], date: string) => {
    setRegularsError(null);
    const result = await recordTemplates(picks, date);
    if (!result.ok) {
      setRegularsError(result.error);
      return;
    }
    setRegularsOpen(false);
    setSavedNotice(`Recorded ${result.recorded} ${result.recorded === 1 ? 'regular' : 'regulars'}`);
  };

  const handleSaveRegular = async (entry: FinanceEntry) => {
    const input = entryToTemplateInput(entry);
    if (!input) return;
    const result = await saveTemplate(input);
    void openEntry(null);
    setSavedNotice(result.ok ? `Saved to the regulars · ${entry.particulars}` : result.error);
  };

  // A photo or PDF of the bill, picked from the device and tied to the entry.
  const handleAttachReceipt = async (entry: FinanceEntry) => {
    setReceiptNotice(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || picked.assets.length === 0) return;
      const asset = picked.assets[0];
      const result = await attachReceipt(entry.id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? null,
        size: asset.size ?? null,
        file: asset.file ?? null,
      });
      setReceiptNotice(result.ok ? 'Bill attached.' : result.error);
    } catch {
      setReceiptNotice('Unable to open the file picker.');
    }
  };

  const handleViewReceipt = async (entry: FinanceEntry) => {
    if (!entry.receipt_path) return;
    setReceiptNotice(null);
    const { data, error: failure } = await fetchReceiptUrl(entry.receipt_path);
    if (failure || !data) {
      setReceiptNotice(failure ?? 'Unable to open the bill.');
      return;
    }
    void Linking.openURL(data).catch(() => setReceiptNotice('Unable to open the bill.'));
  };

  const openCount = (accountId: string) => {
    setCountError(null);
    setCountTarget(accountId);
  };

  const handleCount = async (input: CashCountInput) => {
    setCountError(null);
    const result = await countCash(input);
    if (!result.ok) {
      setCountError(result.error);
      return;
    }
    setCountTarget(null);
    setSavedNotice(`Count saved · ${input.mode === 'cash' ? 'cash box' : 'bank'} ${formatINR(input.counted)}`);
  };

  const accountName = useCallback((id: string) => accounts.find((a) => a.id === id)?.name ?? 'Account', [accounts]);
  // A due in another account's books with the user's own branch on the other
  // side: goods the kitchen sent this branch. They read it as "you owe".
  const isOwedByMe = useCallback(
    (entry: FinanceEntry) =>
      entry.kind === 'receivable' &&
      entry.counterparty_account_id !== null &&
      !myAccounts.some((a) => a.id === entry.account_id) &&
      myAccounts.some((a) => a.id === entry.counterparty_account_id),
    [myAccounts],
  );
  const today = getCurrentBusinessDate();
  const showBalances = canSeeBalances(role, rules) && balances.length > 0;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  // The phone appends pages, so its "showing" runs from the first row.
  const firstIndex = total === 0 ? 0 : compact ? 1 : filters.page * filters.pageSize + 1;
  const lastIndex = compact ? Math.min(total, entries.length) : Math.min(total, (filters.page + 1) * filters.pageSize);
  const atCap = compact && entries.length >= LEDGER_MAX_ROWS && entries.length < total;

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
        payer={payerCaption(item, accountName)}
        other={isOwedByMe(item) ? `You owe ${accountName(item.account_id)}` : counterpartyCaption(item, accountName)}
        payingSide={isOwedByMe(item)}
        due={dueStatus(item, today)}
        categoryPath={[catalogById(catalog, item.category_id)?.name, catalogById(catalog, item.subcategory_id)?.name].filter(Boolean).join(' › ')}
        onPress={() => void openEntry(item)}
        onSettle={canSettleEntry(item, role) ? () => openSettle(item) : undefined}
      />
    ),
    [compact, accountName, catalog, openEntry, role, today, isOwedByMe],
  );

  const activeFilterChips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.accountId) activeFilterChips.push({ key: 'account', label: accountName(filters.accountId), clear: () => setFilters({ accountId: null }) });
  if (filters.kind) activeFilterChips.push({ key: 'kind', label: LEDGER_KIND_LABELS[filters.kind], clear: () => setFilters({ kind: null }) });
  if (filters.mode) activeFilterChips.push({ key: 'mode', label: LEDGER_MODE_LABELS[filters.mode], clear: () => setFilters({ mode: null }) });
  if (filters.categoryId) {
    activeFilterChips.push({ key: 'category', label: catalogById(catalog, filters.categoryId)?.name ?? 'Category', clear: () => setFilters({ categoryId: null }) });
  }
  if (filters.counterparty) activeFilterChips.push({ key: 'counterparty', label: filters.counterparty, clear: () => setFilters({ counterparty: null }) });
  if (filters.enteredBy) activeFilterChips.push({ key: 'mine', label: 'Mine', clear: () => setFilters({ enteredBy: null }) });
  if (filters.status !== 'active') {
    activeFilterChips.push({
      key: 'status',
      label: STATUS_FILTERS.find((s) => s.key === filters.status)?.label ?? filters.status,
      clear: () => setFilters({ status: 'active' }),
    });
  }
  const sortLabel = `${SORTS.find((s) => s.key === filters.sort)?.label ?? 'Date'} ${filters.sortDir === 'desc' ? '↓' : '↑'}`;
  const clearAllFilters = () => setFilters({ accountId: null, kind: null, mode: null, categoryId: null, counterparty: null, enteredBy: null, status: 'active' });
  // Built-in categories (Opening Balance, Partners) are the owner's business.
  const filterCategories = catalogChildren(catalog, null).filter((c) => isFinanceOwner(role) || !c.is_system);
  const quickActions = QUICK_ENTRY_PRESETS.filter((p) => p.kind !== 'transfer' || canTransfer(role, rules));

  const balanceCards = balances.map((b) => (
    <View key={b.account_id} className={`rounded-2xl border border-border/60 bg-white p-3 shadow-sm ${compact ? 'min-w-[200px]' : 'min-w-[220px] flex-1'}`}>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary" numberOfLines={1}>{accountName(b.account_id)}</Text>
        {/* Check the cash box or the bank statement against these figures. */}
        <Pressable
          onPress={() => openCount(b.account_id)}
          className="ml-2 min-h-[28px] flex-row items-center rounded-full border border-border bg-white px-2"
          hitSlop={8}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Count ${accountName(b.account_id)}`}
        >
          <Scale size={11} color={colors.primary} />
          <Text className="ml-1 text-[10px] font-bold text-primary">Count</Text>
        </Pressable>
      </View>
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

  // Outstanding: what is still to be paid and collected as of today, across
  // the accounts this user keeps books for, with what is already late.
  const outstanding = useMemo(() => summarizeDues(dues, myAccounts.map((a) => a.id)), [dues, myAccounts]);
  // For a branch: what it owes the kitchen (and any other account) for goods received.
  const owedToOthers = useMemo(() => summarizeOwedToOthers(dues, myAccounts.map((a) => a.id)), [dues, myAccounts]);
  const showOutstanding = outstanding.payables.total > 0 || outstanding.receivables.total > 0;
  const outstandingActive = filters.status === 'open';
  // The list of dues opens with the soonest due first; undated ones follow.
  const showOutstandingList = () =>
    setFilters(outstandingActive ? { status: 'active', sort: 'transaction_date', sortDir: 'desc' } : { status: 'open', kind: null, sort: 'due_date', sortDir: 'asc' });

  const outstandingCard = showOutstanding ? (
    <Pressable
      key="outstanding"
      onPress={showOutstandingList}
      className={`rounded-2xl border bg-white p-3 shadow-sm ${outstandingActive ? 'border-primary' : 'border-border/60'} ${compact ? 'min-w-[200px]' : 'min-w-[220px] flex-1'}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={outstandingActive ? 'Show all entries' : 'Show outstanding payables and receivables'}
      accessibilityState={{ selected: outstandingActive }}
    >
      <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color: semantic.warning }} numberOfLines={1}>Outstanding</Text>
      <View className="mt-1 flex-row items-end justify-between">
        <View>
          <Text className="text-[10px] text-text-secondary">To pay</Text>
          <Text className="text-base font-extrabold" style={{ color: semantic.danger }}>{formatINR(outstanding.payables.total, { compact: compactMoney })}</Text>
          <DueLine totals={outstanding.payables} compactMoney={compactMoney} />
        </View>
        <View className="items-end">
          <Text className="text-[10px] text-text-secondary">To collect</Text>
          <Text className="text-base font-extrabold" style={{ color: semantic.success }}>{formatINR(outstanding.receivables.total, { compact: compactMoney })}</Text>
          <DueLine totals={outstanding.receivables} compactMoney={compactMoney} />
        </View>
      </View>
    </Pressable>
  ) : null;

  // Each line opens the statement between the two: what built the figure up.
  const positionLines = positions.map((p) => {
    const home = p.owed_by === defaultAccountId || p.owed_to === defaultAccountId ? defaultAccountId : p.owed_to;
    const other = home === p.owed_by ? p.owed_to : p.owed_by;
    return (
      <Pressable
        key={`${p.owed_by}-${p.owed_to}`}
        onPress={() => setStatement({ visible: true, subject: { type: 'account', accountId: other, homeAccountId: home } })}
        className="min-h-[32px] flex-row items-center justify-between"
        hitSlop={6}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`Statement between ${accountName(p.owed_by)} and ${accountName(p.owed_to)}`}
      >
        <Text className="flex-1 text-xs text-text-primary">
          <Text className="font-bold">{accountName(p.owed_by)}</Text> owes <Text className="font-bold">{accountName(p.owed_to)}</Text> {formatINR(p.amount, { compact: compactMoney })}
        </Text>
        <Text className="ml-2 text-[11px] font-bold text-primary">Statement</Text>
      </Pressable>
    );
  });

  const header = (
    <View className="mb-3">
      {showBalances || showOutstanding ? (
        compact ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 12, paddingVertical: 4, paddingHorizontal: 2 }}>
            {showBalances ? balanceCards : null}
            {outstandingCard}
          </ScrollView>
        ) : (
          <View className="mb-3 flex-row flex-wrap gap-3">
            {showBalances ? balanceCards : null}
            {outstandingCard}
          </View>
        )
      ) : null}

      {/* A branch's own dues: what it owes the kitchen for goods received */}
      {owedToOthers.length > 0 ? (
        <View className="mb-3 rounded-2xl border bg-white px-3 py-2 shadow-sm" style={{ borderColor: semantic.warning }}>
          <Text className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: semantic.warning }}>You owe</Text>
          {owedToOthers.map((o) => (
            <Pressable
              key={o.account_id}
              onPress={() => setFilters({ status: 'open', kind: 'receivable', accountId: o.account_id, sort: 'due_date', sortDir: 'asc' })}
              className="min-h-[44px] flex-row items-center justify-between"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`See what is owed to ${accountName(o.account_id)}`}
            >
              <Text className="flex-1 text-xs text-text-primary">
                <Text className="font-bold">{accountName(o.account_id)}</Text> {formatINR(o.total, { compact: compactMoney })}
                {o.overdue > 0 ? <Text style={{ color: semantic.danger }}> · overdue {formatINR(o.overdue, { compact: compactMoney })}</Text> : null}
              </Text>
              <Text className="ml-2 text-[11px] font-bold text-primary">See and pay</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Between accounts: built up from every entry one account paid for another */}
      {positions.length > 0 ? (
        <View className="mb-3 rounded-2xl border border-border/60 bg-white px-3 py-2 shadow-sm">
          <Text className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Between accounts</Text>
          <View className="gap-0.5">{positionLines}</View>
        </View>
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
            onPress={() => setStatement({ visible: true, subject: null })}
            disabled={!initialized}
            className="min-h-[44px] flex-row items-center justify-center rounded-xl border border-border bg-white px-3"
            style={({ pressed }) => [{ opacity: pressed || !initialized ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Open a statement"
          >
            <FileText size={15} color={colors.primary} />
            {compact ? null : <Text className="ml-1.5 text-xs font-bold text-primary">Statement</Text>}
          </Pressable>
          <Pressable
            onPress={() => setExportOpen(true)}
            disabled={!initialized || myAccounts.length === 0}
            className="min-h-[44px] flex-row items-center justify-center rounded-xl border border-border bg-white px-3"
            style={({ pressed }) => [{ opacity: pressed || !initialized ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Month-end workbook"
          >
            <FileSpreadsheet size={15} color={colors.primary} />
            {compact ? null : <Text className="ml-1.5 text-xs font-bold text-primary">Month end</Text>}
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

      {/* The everyday entries, one tap each: the short form with the kind chosen */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        {/* Rent, salaries and the like: saved once, recorded each month with a tick */}
        <Pressable
          onPress={openRegulars}
          disabled={!initialized}
          className="min-h-[40px] flex-row items-center justify-center rounded-full border border-primary bg-accent-soft px-3.5"
          hitSlop={2}
          style={({ pressed }) => [{ opacity: pressed || !initialized ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Open the regulars"
        >
          <Repeat size={14} color={colors.primary} />
          <Text className="ml-1.5 text-xs font-bold text-primary">Regulars</Text>
        </Pressable>
        {quickActions.map((action) => (
          <Pressable
            key={action.key}
            onPress={() => openQuick(action.key)}
            disabled={!initialized}
            className="min-h-[40px] flex-row items-center justify-center rounded-full border border-border bg-white px-3.5"
            hitSlop={2}
            style={({ pressed }) => [{ opacity: pressed || !initialized ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={action.title}
          >
            <QuickIcon kind={action.kind} />
            <Text className="ml-1.5 text-xs font-bold text-text-primary">{action.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

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
            {myAccounts.length > 1 ? (
              <FilterChip label="All accounts" active={filters.accountId === null} onPress={() => setFilters({ accountId: null })} />
            ) : null}
            {myAccounts.filter((a) => a.is_active).map((a) => (
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
          <FilterRow label="Category" compact={compact}>
            <FilterChip label="Any category" active={filters.categoryId === null} onPress={() => setFilters({ categoryId: null })} />
            {filterCategories.map((c) => (
              <FilterChip key={c.id} label={c.name} active={filters.categoryId === c.id} onPress={() => setFilters({ categoryId: filters.categoryId === c.id ? null : c.id })} />
            ))}
          </FilterRow>
          {filters.counterparty ? (
            <FilterRow label="Paid to / from" compact={compact}>
              <FilterChip label="Anyone" active={false} onPress={() => setFilters({ counterparty: null })} />
              <FilterChip label={filters.counterparty} active onPress={() => setFilters({ counterparty: null })} />
            </FilterRow>
          ) : null}
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
        <Text className="flex-1 text-xs font-semibold text-text-secondary" numberOfLines={1}>
          {total === 0 ? 'No entries' : `Showing ${firstIndex}–${lastIndex} of ${total}`} · {sortLabel}
          {outstandingActive ? ' · all open dues, whatever the date range' : ''}
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

  const footer = compact ? (
    loadingMore ? (
      <FinanceLoadingView inline label="Loading more…" />
    ) : atCap ? (
      <Text className="py-4 text-center text-xs text-text-secondary">
        Showing the first {LEDGER_MAX_ROWS.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}. Narrow the date range or filters to see the rest.
      </Text>
    ) : null
  ) : total > filters.pageSize ? (
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
        // A phone scrolls on; a desktop pages. Either way only the rows in
        // view are mounted, and native drops the ones scrolled far away.
        onEndReached={compact ? () => void loadMore() : undefined}
        onEndReachedThreshold={0.6}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
      />

      <EntryFormModal
        visible={form.visible}
        mode={form.mode}
        initialValues={initialValues}
        accounts={accounts}
        scopeAccounts={myAccounts}
        catalog={catalog}
        rules={rules}
        role={role}
        submitting={mutating}
        serverError={formError}
        onSubmit={(input) => void handleSubmit(input, false)}
        onSubmitAndNext={(input) => void handleSubmit(input, true)}
        onClose={closeForm}
        quick={form.quickTitle !== null}
        title={form.quickTitle ?? undefined}
        suggestCounterparties={suggestCounterparties}
        onRecordPurchase={() => {
          closeForm();
          router.push({ pathname: '/inventory', params: { tab: 'record_purchase' } });
        }}
      />

      <EntryDetailSheet
        entry={selected}
        compact={compact}
        accountName={selected ? accountName(selected.account_id) : ''}
        payerName={selected?.paid_from_account_id ? accountName(selected.paid_from_account_id) : null}
        otherName={selected?.counterparty_account_id ? accountName(selected.counterparty_account_id) : null}
        due={selected ? dueStatus(selected, today) : null}
        onShowCounterparty={() => {
          const name = selected?.counterparty?.trim();
          if (!name) return;
          void openEntry(null);
          // Everything with this vendor or person, whenever it was recorded in the range.
          setFilters({ counterparty: name, status: 'active' });
        }}
        onShowStatement={() => {
          if (!selected) return;
          const other = selected.counterparty_account_id;
          const name = selected.counterparty?.trim();
          // Between two of our accounts when the other side is one; by name otherwise.
          const subject: StatementSubject | null = other
            ? { type: 'account', accountId: other, homeAccountId: selected.account_id }
            : name
              ? { type: 'name', name }
              : null;
          if (!subject) return;
          void openEntry(null);
          setStatement({ visible: true, subject });
        }}
        onSaveRegular={
          selected && entryToTemplateInput(selected) && myAccounts.some((a) => a.id === selected.account_id)
            ? () => void handleSaveRegular(selected)
            : undefined
        }
        onViewReceipt={selected?.receipt_path ? () => void handleViewReceipt(selected) : undefined}
        onAttachReceipt={
          selected && selected.status !== 'void' && myAccounts.some((a) => a.id === selected.account_id)
            ? () => void handleAttachReceipt(selected)
            : undefined
        }
        receiptBusy={mutating}
        receiptNotice={receiptNotice}
        canSettle={selected ? canSettleEntry(selected, role) : false}
        onSettle={() => {
          if (!selected) return;
          const target = selected;
          void openEntry(null);
          openSettle(target);
        }}
        onViewSettled={() => {
          if (selected?.settles_entry_id) void openEntryById(selected.settles_entry_id);
        }}
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

      <StatementModal
        visible={statement.visible}
        initialSubject={statement.subject}
        accounts={accounts}
        homeAccountId={defaultAccountId}
        otherAccounts={accounts.filter((a) => a.is_active && a.id !== defaultAccountId)}
        compact={compact}
        onOpenEntry={(entry) => {
          setStatement({ visible: false, subject: null });
          void openEntry(entry);
        }}
        onClose={() => setStatement({ visible: false, subject: null })}
      />

      <ExportMonthModal
        visible={exportOpen}
        accounts={accounts}
        scopeAccounts={myAccounts}
        defaultAccountId={defaultAccountId}
        catalog={catalog}
        compact={compact}
        onClose={() => setExportOpen(false)}
      />

      <RegularsModal
        visible={regularsOpen}
        templates={templates}
        loading={templatesLoading}
        accounts={accounts}
        submitting={mutating}
        serverError={regularsError}
        compact={compact}
        onRecord={(picks, date) => void handleRecordRegulars(picks, date)}
        onRemove={(template) => {
          void removeTemplate(template.id).then((result) => {
            if (!result.ok) setRegularsError(result.error);
          });
        }}
        onClose={() => setRegularsOpen(false)}
      />

      <CashCountModal
        account={countTarget ? accounts.find((a) => a.id === countTarget) ?? null : null}
        balance={countTarget ? balances.find((b) => b.account_id === countTarget) ?? null : null}
        submitting={mutating}
        serverError={countError}
        onSubmit={(input) => void handleCount(input)}
        onClose={() => setCountTarget(null)}
      />

      <SettleEntryModal
        entry={settleTarget}
        accounts={accounts}
        owedToCounterparty={settleOwed}
        payingSide={settleTarget ? isOwedByMe(settleTarget) : false}
        submitting={mutating}
        serverError={settleError}
        onSubmit={(input) => void handleSettle(input)}
        onClose={() => setSettleTarget(null)}
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

/** "Overdue ₹12,000" or "₹5,000 due this week" under a figure on the Outstanding card. */
function DueLine({ totals, compactMoney }: { totals: { overdue: number; week: number }; compactMoney: boolean }) {
  if (totals.overdue > 0) {
    return (
      <Text className="text-[10px] font-bold" style={{ color: semantic.danger }} numberOfLines={1}>
        Overdue {formatINR(totals.overdue, { compact: compactMoney })}
      </Text>
    );
  }
  if (totals.week > 0) {
    return (
      <Text className="text-[10px] font-bold" style={{ color: semantic.warning }} numberOfLines={1}>
        {formatINR(totals.week, { compact: compactMoney })} this week
      </Text>
    );
  }
  return null;
}

function dueColor(due: DueStatus): string {
  if (due.bucket === 'overdue') return semantic.danger;
  if (due.bucket === 'week') return semantic.warning;
  return colors.textSecondary;
}

function QuickIcon({ kind }: { kind: LedgerKind }) {
  const tone = kindTone(kind);
  const Icon = kind === 'payable' || kind === 'receivable' ? Clock : tone.Icon;
  return <Icon size={14} color={tone.color} />;
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

type EntryRowProps = {
  item: FinanceEntry;
  compact: boolean;
  accountName: string;
  /** "Paid by X · for Y" when another account paid; null otherwise. */
  payer: string | null;
  /** "Owed by X" or "Owed to X" when the other side is one of our own accounts. */
  other: string | null;
  /** How soon an open payable or receivable is due; null for anything else. */
  due: DueStatus | null;
  /** The user's branch is the one that owes this due: they pay it, not collect it. */
  payingSide: boolean;
  categoryPath: string;
  onPress: () => void;
  /** Present when the user may settle this open payable or receivable. */
  onSettle?: () => void;
};

function EntryRow({ item, compact, accountName, payer, other, due, payingSide, categoryPath, onPress, onSettle }: EntryRowProps) {
  const voided = item.status === 'void';
  const tone = kindTone(item.kind);
  const meta = [payer ?? accountName, categoryPath || LEDGER_KIND_LABELS[item.kind], other ?? item.counterparty].filter(Boolean).join(' · ');
  const progress =
    (item.kind === 'payable' || item.kind === 'receivable') && item.status !== 'void' && item.settled > 0
      ? `${formatINR(item.settled)} of ${formatINR(item.amount)} settled`
      : item.settles_entry_id
        ? `Settles a ${item.kind === 'income' ? 'receivable' : 'payable'} recorded earlier`
        : null;
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
        {progress ? <Text className="text-[11px] font-semibold text-text-secondary" numberOfLines={1}>{progress}</Text> : null}
        {due && due.bucket !== 'undated' ? (
          <Text className="text-[11px] font-bold" style={{ color: dueColor(due) }} numberOfLines={1}>{due.label}</Text>
        ) : null}
        {item.source_type ?<Text className="text-[11px] font-semibold text-primary" numberOfLines={1}>{LEDGER_SOURCE_LABELS[item.source_type]}</Text> : null}
      </View>
      <View className="items-end">
        <Text className="text-sm font-extrabold" style={{ color: tone.color, textDecorationLine: voided ? 'line-through' : 'none' }}>
          {signedAmount(item, compact)}
        </Text>
        {onSettle ? (
          <Pressable
            onPress={onSettle}
            className="mt-1 min-h-[36px] flex-row items-center justify-center rounded-full border border-primary bg-accent-soft px-3"
            hitSlop={4}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={payingSide ? `Pay ${item.particulars}` : item.kind === 'receivable' ? `Collect ${item.particulars}` : `Settle ${item.particulars}`}
          >
            <CheckCircle2 size={13} color={colors.primary} />
            <Text className="ml-1 text-[11px] font-bold text-primary">{payingSide ? 'Pay' : item.kind === 'receivable' ? 'Collect' : 'Settle'}</Text>
          </Pressable>
        ) : (
          <StatusPill status={item.status} />
        )}
      </View>
    </Pressable>
  );
}

type EntryDetailSheetProps = {
  entry: FinanceEntry | null;
  compact: boolean;
  accountName: string;
  /** The account whose cash or bank moved, when not accountName's. */
  payerName: string | null;
  /** The other one of our own accounts this payable or receivable is with. */
  otherName: string | null;
  /** How soon an open payable or receivable is due. */
  due: DueStatus | null;
  /** Filters the ledger to everything with this entry's vendor or person. */
  onShowCounterparty: () => void;
  /** Opens the statement with this entry's vendor, person or other account. */
  onShowStatement: () => void;
  /** Saves this entry as a regular; absent when it cannot be one. */
  onSaveRegular?: () => void;
  /** Opens the attached bill; absent when there is none. */
  onViewReceipt?: () => void;
  /** Picks a photo or PDF of the bill; absent when the user may not attach one. */
  onAttachReceipt?: () => void;
  receiptBusy: boolean;
  /** What the last attach or open came to. */
  receiptNotice: string | null;
  canSettle: boolean;
  onSettle: () => void;
  /** Opens the payable or receivable this payment settles. */
  onViewSettled: () => void;
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

function EntryDetailSheet({ entry, compact, accountName, payerName, otherName, due, onShowCounterparty, onShowStatement, onSaveRegular, onViewReceipt, onAttachReceipt, receiptBusy, receiptNotice, canSettle, onSettle, onViewSettled, categoryPath, revisions, revisionsLoading, canEdit, canVoid, onEdit, onVoid, onClose, describe }: EntryDetailSheetProps) {
  const insets = useSafeAreaInsets();
  if (!entry) return null;
  const tone = kindTone(entry.kind);
  const isOutstandingKind = entry.kind === 'payable' || entry.kind === 'receivable';
  const rows: { label: string; value: string }[] = [
    { label: entry.kind === 'transfer' ? 'To account' : 'For', value: accountName },
    ...(payerName ? [{ label: entry.kind === 'income' ? 'Received by' : entry.kind === 'transfer' ? 'From account' : 'Paid from', value: payerName }] : []),
    ...(otherName ? [{ label: entry.kind === 'receivable' ? 'Owed by' : entry.kind === 'payable' ? 'Owed to' : 'Other account', value: otherName }] : []),
    { label: 'Kind', value: LEDGER_KIND_LABELS[entry.kind] },
    ...(entry.source_type ? [{ label: 'Source', value: LEDGER_SOURCE_LABELS[entry.source_type] }] : []),
    ...(isOutstandingKind && entry.status !== 'void'
      ? [{ label: 'Settled', value: `${formatINR(entry.settled)} of ${formatINR(entry.amount)} · ${formatINR(remainingAmount(entry))} remaining${entry.settled_at ? ` · closed ${formatDateTime(entry.settled_at)}` : ''}` }]
      : []),
    { label: entry.kind === 'transfer' ? 'Moved' : entryDirection(entry.kind) === 'in' ? 'Received via' : 'Paid via', value: entry.mode ? LEDGER_MODE_LABELS[entry.mode] : `${entry.transfer_from} → ${entry.transfer_to}` },
    { label: 'Transaction date', value: formatDateLong(entry.transaction_date) },
    ...(isOutstandingKind && entry.due_date
      ? [{ label: entry.kind === 'payable' ? 'Pay by' : 'Collect by', value: `${formatDateLong(entry.due_date)}${due && due.bucket !== 'later' && due.bucket !== 'undated' ? ` · ${due.label}` : ''}` }]
      : []),
    { label: 'Category', value: categoryPath || '—' },
    ...(entry.counterparty ? [] : [{ label: entryDirection(entry.kind) === 'in' ? 'Received from' : 'Paid to', value: '—' }]),
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
            {entry.counterparty ? (
              <Pressable
                onPress={onShowCounterparty}
                className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft py-2"
                accessibilityRole="button"
                accessibilityLabel={`Show every entry with ${entry.counterparty}`}
              >
                <Text className="w-[130px] text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                  {entryDirection(entry.kind) === 'in' ? 'Received from' : 'Paid to'}
                </Text>
                <Text className="flex-1 text-right text-sm text-text-primary">
                  {entry.counterparty} · <Text className="font-bold text-primary">All entries</Text>
                </Text>
              </Pressable>
            ) : null}
            {entry.counterparty || entry.counterparty_account_id ? (
              <Pressable
                onPress={onShowStatement}
                className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft py-2"
                accessibilityRole="button"
                accessibilityLabel="Open the statement"
              >
                <Text className="w-[130px] text-[11px] font-bold uppercase tracking-wide text-text-secondary">Statement</Text>
                <Text className="flex-1 text-right text-sm text-text-primary">
                  Bills, payments and the balance with {otherName ?? entry.counterparty} · <Text className="font-bold text-primary">Open</Text>
                </Text>
              </Pressable>
            ) : null}
            {onViewReceipt || onAttachReceipt ? (
              <View className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft py-2">
                <Text className="w-[130px] text-[11px] font-bold uppercase tracking-wide text-text-secondary">Bill</Text>
                <View className="flex-1 flex-row items-center justify-end gap-2">
                  {receiptBusy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                  {!onViewReceipt && !receiptBusy ? <Text className="text-sm text-text-secondary">None attached</Text> : null}
                  {onViewReceipt ? (
                    <Pressable
                      onPress={onViewReceipt}
                      className="min-h-[36px] flex-row items-center rounded-full border border-primary bg-accent-soft px-3"
                      hitSlop={4}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Open the attached bill"
                    >
                      <Paperclip size={13} color={colors.primary} />
                      <Text className="ml-1 text-xs font-bold text-primary">View</Text>
                    </Pressable>
                  ) : null}
                  {onAttachReceipt ? (
                    <Pressable
                      onPress={onAttachReceipt}
                      disabled={receiptBusy}
                      className="min-h-[36px] flex-row items-center rounded-full border border-border bg-white px-3"
                      hitSlop={4}
                      style={({ pressed }) => [{ opacity: pressed || receiptBusy ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel={onViewReceipt ? 'Replace the bill' : 'Attach a photo or PDF of the bill'}
                    >
                      <Text className="text-xs font-bold text-text-primary">{onViewReceipt ? 'Replace' : 'Attach photo or PDF'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
            {receiptNotice ? <Text className="py-1 text-right text-[11px] font-semibold text-text-secondary">{receiptNotice}</Text> : null}
            {onSaveRegular ? (
              <Pressable
                onPress={onSaveRegular}
                className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft py-2"
                accessibilityRole="button"
                accessibilityLabel="Save as a regular"
              >
                <Text className="w-[130px] text-[11px] font-bold uppercase tracking-wide text-text-secondary">Every month?</Text>
                <Text className="flex-1 text-right text-sm text-text-primary">
                  Record it again with one tick · <Text className="font-bold text-primary">Save as a regular</Text>
                </Text>
              </Pressable>
            ) : null}
            {entry.settles_entry_id ? (
              <Pressable
                onPress={onViewSettled}
                className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft py-2"
                accessibilityRole="button"
                accessibilityLabel="Open the entry this settles"
              >
                <Text className="w-[130px] text-[11px] font-bold uppercase tracking-wide text-text-secondary">Settles</Text>
                <Text className="flex-1 text-right text-sm font-bold text-primary">
                  {entry.kind === 'income' ? 'A receivable' : 'A payable'} recorded earlier · View
                </Text>
              </Pressable>
            ) : null}

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

          {canEdit || canVoid || canSettle ? (
            <View className="flex-row items-center justify-end gap-2 border-t border-border-soft px-5 py-3" style={compact ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}>
              {canSettle ? (
                <Pressable onPress={onSettle} className="min-h-[44px] flex-row items-center justify-center rounded-xl border border-primary bg-accent-soft px-4" style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel={entry.kind === 'receivable' ? 'Collect' : 'Settle'}>
                  <CheckCircle2 size={15} color={colors.primary} />
                  <Text className="ml-1.5 text-sm font-bold text-primary">{entry.kind === 'receivable' ? 'Collect' : 'Settle'}</Text>
                </Pressable>
              ) : null}
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
