import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { EXPENSE_PAYMENT_METHODS, type Expense, type ExpenseFormValues, type ExpenseInput, type ExpensePaymentMethod } from '@/lib/pos/finance-types';
import {
  PAYMENT_METHOD_LABELS,
  buildExpensesCsv,
  emptyExpenseForm,
  expenseToFormValues,
  formatDateLabel,
  formatINR,
  formatPaymentMethod,
  sumExpenses,
} from '@/lib/pos/finance-utils';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { ExpenseFormModal } from './ExpenseFormModal';
import { FinanceEmptyView, FinanceErrorView, FinanceLoadingView, financeContentPadding } from './FinanceStateViews';

type Props = { compact?: boolean };

type FormState = { visible: boolean; mode: 'create' | 'edit'; expense: Expense | null };

export function ExpensesTab({ compact = false }: Props) {
  const expenses = useFinanceStore((s) => s.expenses);
  const total = useFinanceStore((s) => s.expensesTotal);
  const page = useFinanceStore((s) => s.expensesPage);
  const pageSize = useFinanceStore((s) => s.expensesPageSize);
  const listState = useFinanceStore((s) => s.expenseList);
  const loading = useFinanceStore((s) => s.expensesLoading);
  const error = useFinanceStore((s) => s.expensesError);
  const mutating = useFinanceStore((s) => s.expenseMutating);
  const categories = useFinanceStore((s) => s.categories);
  const schema = useFinanceStore((s) => s.schema);
  const loadExpenses = useFinanceStore((s) => s.loadExpenses);
  const setExpenseList = useFinanceStore((s) => s.setExpenseList);
  const addExpense = useFinanceStore((s) => s.addExpense);
  const editExpense = useFinanceStore((s) => s.editExpense);
  const removeExpense = useFinanceStore((s) => s.removeExpense);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const newExpenseRequested = useFinanceStore((s) => s.newExpenseRequested);
  const clearNewExpenseRequest = useFinanceStore((s) => s.clearNewExpenseRequest);

  const extended = schema?.expensesExtended ?? false;

  const [form, setForm] = useState<FormState>({ visible: false, mode: 'create', expense: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(listState.search);
  const [initialValues, setInitialValues] = useState<ExpenseFormValues>(() => emptyExpenseForm());
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // The phone shell's quick-add button lands here with the form already open.
  useEffect(() => {
    if (!newExpenseRequested) return;
    clearNewExpenseRequest();
    setFormError(null);
    setInitialValues(emptyExpenseForm());
    setForm({ visible: true, mode: 'create', expense: null });
  }, [newExpenseRequested, clearNewExpenseRequest]);

  useEffect(() => {
    if (!savedNotice) return;
    const handle = setTimeout(() => setSavedNotice(null), 3500);
    return () => clearTimeout(handle);
  }, [savedNotice]);

  // Debounced search → store
  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchDraft !== listState.search) setExpenseList({ search: searchDraft });
    }, 350);
    return () => clearTimeout(handle);
  }, [searchDraft, listState.search, setExpenseList]);

  const openCreate = () => {
    setFormError(null);
    setInitialValues(emptyExpenseForm());
    setForm({ visible: true, mode: 'create', expense: null });
  };
  const openEdit = (expense: Expense) => {
    setFormError(null);
    setInitialValues(expenseToFormValues(expense));
    setForm({ visible: true, mode: 'edit', expense });
  };
  const closeForm = () => setForm((prev) => ({ ...prev, visible: false }));

  const handleSubmit = async (input: ExpenseInput, keepOpen: boolean) => {
    setFormError(null);
    const result = form.mode === 'edit' && form.expense ? await editExpense(form.expense.id, input) : await addExpense(input);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSavedNotice(`Saved ${formatINR(input.amount)} · ${input.category}`);
    if (keepOpen) {
      // End-of-day entry is a run of receipts; the form stays up for the next one.
      setInitialValues(emptyExpenseForm());
      return;
    }
    closeForm();
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    setVoidError(null);
    const result = await removeExpense(voidTarget.id, voidReason);
    if (!result.ok) {
      setVoidError(result.error);
      return;
    }
    setVoidTarget(null);
    setVoidReason('');
  };

  const exportCsv = useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const csv = buildExpensesCsv(expenses);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `grovit-expenses-page${page + 1}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [expenses, page]);

  const pageTotal = useMemo(() => sumExpenses(expenses), [expenses]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstIndex = total === 0 ? 0 : page * pageSize + 1;
  const lastIndex = Math.min(total, (page + 1) * pageSize);

  const renderItem = useCallback(
    ({ item }: { item: Expense }) => (
      <ExpenseRow item={item} compact={compact} extended={extended} onEdit={openEdit} onVoid={(e) => { setVoidReason(''); setVoidError(null); setVoidTarget(e); }} />
    ),
    [compact, extended],
  );

  const header = (
    <View className="mb-3">
      {/* Toolbar */}
      <View className={compact ? 'gap-2' : 'flex-row items-center gap-2'}>
        <View className="min-h-[44px] flex-1 flex-row items-center rounded-xl border border-border bg-white px-3">
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Search description, category, payee…"
            placeholderTextColor={colors.textSecondary}
            className="ml-2 flex-1 text-sm text-text-primary"
            accessibilityLabel="Search expenses"
          />
          {searchDraft.length > 0 ? (
            <Pressable onPress={() => setSearchDraft('')} className="h-[36px] w-[36px] items-center justify-center" hitSlop={4} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={14} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          {Platform.OS === 'web' && !compact ? (
            <Pressable
              onPress={exportCsv}
              disabled={expenses.length === 0}
              className="min-h-[44px] flex-row items-center justify-center rounded-xl border border-border bg-white px-3"
              style={({ pressed }) => [{ opacity: pressed || expenses.length === 0 ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Export this page as CSV"
            >
              <Download size={15} color={colors.primary} />
              <Text className="ml-1.5 text-xs font-bold text-primary">CSV</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={openCreate}
            className={`min-h-[44px] flex-row items-center justify-center rounded-xl bg-primary px-4 ${compact ? 'flex-1' : ''}`}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Add expense"
          >
            <Plus size={16} color={colors.textOnPrimary} />
            <Text className="ml-1.5 text-sm font-bold text-text-on-primary">Add expense</Text>
          </Pressable>
        </View>
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ alignItems: 'center' }}>
        <FilterChip label="All categories" active={listState.category === null} onPress={() => setExpenseList({ category: null })} />
        {categories.map((c) => (
          <FilterChip key={c.id} label={c.name} active={listState.category === c.name} onPress={() => setExpenseList({ category: listState.category === c.name ? null : c.name })} />
        ))}
      </ScrollView>

      {/* Payment method + void toggle */}
      <View className="mt-2 flex-row items-center">
        {extended ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerStyle={{ alignItems: 'center' }}>
            <FilterChip label="Any method" active={listState.paymentMethod === null} onPress={() => setExpenseList({ paymentMethod: null })} />
            {EXPENSE_PAYMENT_METHODS.map((m: ExpensePaymentMethod) => (
              <FilterChip
                key={m}
                label={PAYMENT_METHOD_LABELS[m]}
                active={listState.paymentMethod === m}
                onPress={() => setExpenseList({ paymentMethod: listState.paymentMethod === m ? null : m })}
              />
            ))}
          </ScrollView>
        ) : (
          <View className="flex-1" />
        )}
        {extended ? (
          <View className="ml-2 flex-row items-center">
            <Text className="mr-2 text-xs font-semibold text-text-secondary">Show voided</Text>
            <Switch
              value={listState.includeVoid}
              onValueChange={(v) => setExpenseList({ includeVoid: v })}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={colors.background}
              accessibilityLabel="Show voided expenses"
            />
          </View>
        ) : null}
      </View>

      {savedNotice ? (
        <View className="mt-3 flex-row items-center rounded-xl px-3 py-2" style={{ backgroundColor: semantic.successSoft }} accessibilityLiveRegion="polite">
          <CheckCircle2 size={14} color={semantic.success} />
          <Text className="ml-2 text-xs font-bold" style={{ color: semantic.success }}>{savedNotice}</Text>
        </View>
      ) : null}

      {/* Summary strip */}
      <View className="mt-3 flex-row items-center justify-between rounded-xl bg-surface-tint px-3 py-2">
        <Text className="text-xs font-semibold text-text-secondary">
          {total === 0 ? 'No expenses' : `Showing ${firstIndex}–${lastIndex} of ${total}`}
        </Text>
        <Text className="text-xs font-bold text-text-primary">Page total {formatINR(pageTotal)}</Text>
      </View>

      {error ? <View className="mt-3"><FinanceErrorView message={error} onRetry={() => loadExpenses(page)} compact /></View> : null}
      {loading && expenses.length > 0 ? <FinanceLoadingView inline label="Updating…" /> : null}

      {!compact && expenses.length > 0 ? (
        <View className="mt-2 flex-row items-center border-b border-border/60 px-3 py-2">
          <Text className="w-[80px] text-[11px] font-bold uppercase text-text-secondary">Date</Text>
          <Text className="w-[150px] text-[11px] font-bold uppercase text-text-secondary">Category</Text>
          <Text className="flex-1 text-[11px] font-bold uppercase text-text-secondary">Description</Text>
          {extended ? <Text className="w-[110px] text-[11px] font-bold uppercase text-text-secondary">Paid via</Text> : null}
          <Text className="w-[110px] text-right text-[11px] font-bold uppercase text-text-secondary">Amount</Text>
          <View className="w-[92px]" />
        </View>
      ) : null}
    </View>
  );

  const footer =
    total > pageSize ? (
      <View className="mt-3 flex-row items-center justify-center gap-3 py-2">
        <Pressable
          onPress={() => loadExpenses(page - 1)}
          disabled={page === 0 || loading}
          className="h-[44px] w-[44px] items-center justify-center rounded-full border border-border bg-white"
          style={({ pressed }) => [{ opacity: page === 0 || loading || pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
        >
          <ChevronLeft size={18} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-xs font-semibold text-text-secondary">
          Page {page + 1} of {pageCount}
        </Text>
        <Pressable
          onPress={() => loadExpenses(page + 1)}
          disabled={page + 1 >= pageCount || loading}
          className="h-[44px] w-[44px] items-center justify-center rounded-full border border-border bg-white"
          style={({ pressed }) => [{ opacity: page + 1 >= pageCount || loading || pressed ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Next page"
        >
          <ChevronRight size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
    ) : null;

  return (
    <View className="flex-1">
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          loading ? (
            <FinanceLoadingView />
          ) : error ? null : (
            <FinanceEmptyView
              title="No expenses in this range"
              subtitle="Record rent, salaries, supplies and petty cash here to see them flow into the P&L."
              action={{ label: 'Add first expense', onPress: openCreate }}
            />
          )
        }
        contentContainerStyle={financeContentPadding(compact)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      <ExpenseFormModal
        visible={form.visible}
        mode={form.mode}
        initialValues={initialValues}
        categories={categories}
        canAddCategory={schema?.categoriesTable ?? false}
        submitting={mutating}
        serverError={formError}
        onSubmit={(input) => void handleSubmit(input, false)}
        onSubmitAndNext={(input) => void handleSubmit(input, true)}
        onAddCategory={addCategory}
        onClose={closeForm}
      />

      {/* Void confirmation */}
      <Modal visible={voidTarget !== null} transparent animationType="fade" onRequestClose={() => setVoidTarget(null)}>
        <KeyboardAvoider>
        <Pressable className="flex-1 items-center justify-center bg-black/40 px-4" onPress={() => setVoidTarget(null)}>
          <Pressable onPress={() => undefined} className="w-full max-w-[440px] rounded-3xl bg-white p-5 shadow-panel">
            <Text className="text-base font-bold text-text-primary">Void this expense?</Text>
            {voidTarget ? (
              <Text className="mt-1 text-xs text-text-secondary">
                {voidTarget.category} · {formatINR(voidTarget.amount)} on {formatDateLabel(voidTarget.expense_date, true)}. The entry stays in the audit
                trail but stops counting towards totals.
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
                onPress={confirmVoid}
                disabled={mutating || voidReason.trim().length === 0}
                className="min-h-[44px] min-w-[120px] flex-row items-center justify-center rounded-xl px-4"
                style={({ pressed }) => [{ backgroundColor: semantic.danger, opacity: pressed || mutating || voidReason.trim().length === 0 ? 0.6 : 1 }]}
                accessibilityRole="button"
              >
                {mutating ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <Ban size={15} color={colors.textOnPrimary} />}
                <Text className="ml-1.5 text-sm font-bold text-text-on-primary">Void expense</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoider>
      </Modal>
    </View>
  );
}

type FilterChipProps = { label: string; active: boolean; onPress: () => void };

function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 min-h-[44px] items-center justify-center rounded-full border px-3.5 ${active ? 'border-primary bg-accent-soft' : 'border-border bg-white'}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text className={`text-xs font-bold ${active ? 'text-primary' : 'text-text-secondary'}`}>{label}</Text>
    </Pressable>
  );
}

type ExpenseRowProps = {
  item: Expense;
  compact: boolean;
  extended: boolean;
  onEdit: (expense: Expense) => void;
  onVoid: (expense: Expense) => void;
};

function ExpenseRow({ item, compact, extended, onEdit, onVoid }: ExpenseRowProps) {
  const voided = item.status === 'void';
  const amountColor = voided ? colors.textSecondary : semantic.danger;

  if (compact) {
    return (
      <Pressable
        onPress={() => (voided ? undefined : onEdit(item))}
        className={`mb-2 rounded-2xl border border-border/60 bg-white p-3 ${voided ? 'opacity-60' : ''}`}
        style={({ pressed }) => [{ opacity: pressed ? 0.8 : voided ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${item.category} ${formatINR(item.amount)}`}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-text-primary" numberOfLines={1}>{item.category}</Text>
            <Text className="mt-0.5 text-xs text-text-secondary" numberOfLines={2}>
              {item.description ?? item.payee ?? 'No description'}
            </Text>
            <Text className="mt-1 text-[11px] text-text-secondary">
              {formatDateLabel(item.expense_date)} · {formatPaymentMethod(item.payment_method)}
              {item.reference_no ? ` · ${item.reference_no}` : ''}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-base font-extrabold" style={{ color: amountColor, textDecorationLine: voided ? 'line-through' : 'none' }}>
              {formatINR(item.amount)}
            </Text>
            {voided ? (
              <Text className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: semantic.neutralSoft, color: semantic.neutral }}>VOID</Text>
            ) : extended ? (
              <Pressable onPress={() => onVoid(item)} className="mt-1 h-[44px] w-[44px] items-center justify-center" accessibilityRole="button" accessibilityLabel="Void expense">
                <Ban size={15} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View className={`flex-row items-center border-b border-border/40 px-3 py-2.5 ${voided ? 'opacity-60' : ''}`}>
      <Text className="w-[80px] text-xs font-semibold text-text-secondary">{formatDateLabel(item.expense_date)}</Text>
      <Text className="w-[150px] pr-2 text-xs font-bold text-text-primary" numberOfLines={1}>{item.category}</Text>
      <View className="flex-1 pr-2">
        <Text className="text-xs text-text-primary" numberOfLines={1}>{item.description ?? '—'}</Text>
        {item.payee || item.reference_no ? (
          <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
            {[item.payee, item.reference_no].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {voided && item.void_reason ? <Text className="text-[11px] italic text-text-secondary" numberOfLines={1}>Void: {item.void_reason}</Text> : null}
      </View>
      {extended ? <Text className="w-[110px] text-xs text-text-secondary">{formatPaymentMethod(item.payment_method)}</Text> : null}
      <Text className="w-[110px] text-right text-sm font-extrabold" style={{ color: amountColor, textDecorationLine: voided ? 'line-through' : 'none' }}>
        {formatINR(item.amount)}
      </Text>
      <View className="w-[92px] flex-row items-center justify-end">
        {voided ? (
          <Text className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: semantic.neutralSoft, color: semantic.neutral }}>VOID</Text>
        ) : (
          <>
            <Pressable onPress={() => onEdit(item)} className="h-[44px] w-[44px] items-center justify-center rounded-full" style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Edit expense">
              <Pencil size={15} color={colors.primary} />
            </Pressable>
            {extended ? (
              <Pressable onPress={() => onVoid(item)} className="h-[44px] w-[44px] items-center justify-center rounded-full" style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Void expense">
                <Ban size={15} color={semantic.danger} />
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
