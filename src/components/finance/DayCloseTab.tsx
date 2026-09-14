import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Building2, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Lock, LockOpen, Save } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import type { DayClosure } from '@/lib/pos/finance-types';
import {
  addDays,
  classifyVariance,
  computeCashVariance,
  computeExpectedCash,
  formatDateLabel,
  formatDateLong,
  formatDateTime,
  formatINR,
  getCurrentBusinessDate,
  parseAmountInput,
} from '@/lib/pos/finance-utils';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { FinanceErrorView, FinanceLoadingView, FinanceSectionCard, financeContentPadding } from './FinanceStateViews';

type Props = { compact?: boolean };

const FIELD_CLASS = 'min-h-[44px] rounded-xl border border-border bg-white px-3 text-base font-bold text-text-primary';

export function DayCloseTab({ compact = false }: Props) {
  const session = useSessionStore((s) => s.session);
  const filters = useFinanceStore((s) => s.filters);
  const schema = useFinanceStore((s) => s.schema);
  const dayCloseDate = useFinanceStore((s) => s.dayCloseDate);
  const closure = useFinanceStore((s) => s.closure);
  const computation = useFinanceStore((s) => s.computation);
  const recentClosures = useFinanceStore((s) => s.recentClosures);
  const loading = useFinanceStore((s) => s.dayCloseLoading);
  const saving = useFinanceStore((s) => s.dayCloseSaving);
  const error = useFinanceStore((s) => s.dayCloseError);
  const setDayCloseDate = useFinanceStore((s) => s.setDayCloseDate);
  const loadDayClose = useFinanceStore((s) => s.loadDayClose);
  const saveDayClose = useFinanceStore((s) => s.saveDayClose);
  const setBranch = useFinanceStore((s) => s.setBranch);

  const isOwnerOrAdmin = session?.role === 'owner' || session?.role === 'admin';
  const needsBranch = isOwnerOrAdmin && filters.branchId === null;
  const branchName = useMemo(() => {
    const id = filters.branchId ?? session?.branchId ?? null;
    return session?.accessibleBranches.find((b) => b.id === id)?.name ?? session?.branchName ?? 'Branch';
  }, [filters.branchId, session]);

  const [openingDraft, setOpeningDraft] = useState('0');
  const [countedDraft, setCountedDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Sync drafts when the loaded record changes.
  useEffect(() => {
    setOpeningDraft(closure ? closure.opening_cash.toString() : '0');
    setCountedDraft(closure && closure.counted_cash !== null ? closure.counted_cash.toString() : '');
    setNotesDraft(closure?.notes ?? '');
    setFormError(null);
    setSaved(false);
  }, [closure, dayCloseDate]);

  const opening = parseAmountInput(openingDraft) ?? 0;
  const counted = countedDraft.trim().length === 0 ? null : parseAmountInput(countedDraft);
  const expected = computation ? computeExpectedCash(opening, computation) : 0;
  const variance = computeCashVariance(expected, counted);
  const varianceTone = classifyVariance(variance);
  const varianceColor = varianceTone === 'balanced' ? semantic.success : varianceTone === 'surplus' ? semantic.warning : semantic.danger;
  const isClosed = closure?.status === 'closed';
  const today = getCurrentBusinessDate();

  const submit = async (action: 'save' | 'close' | 'reopen') => {
    setFormError(null);
    setSaved(false);
    if (parseAmountInput(openingDraft) === null) {
      setFormError('Opening cash must be a valid amount.');
      return;
    }
    if (countedDraft.trim().length > 0 && counted === null) {
      setFormError('Counted cash must be a valid amount.');
      return;
    }
    if (action === 'close' && counted === null) {
      setFormError('Enter the counted cash before closing the day.');
      return;
    }
    const result = await saveDayClose(
      { business_date: dayCloseDate, opening_cash: opening, counted_cash: counted, notes: notesDraft.trim().length > 0 ? notesDraft.trim() : null },
      action,
    );
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setSaved(true);
  };

  if (needsBranch) {
    // The branch filter lives in a sheet on phones, so the choice is offered
    // right here rather than pointing at a bar the user cannot see.
    const branchChoices = (session?.accessibleBranches ?? []).filter((b) => b.is_active);
    return (
      <View className="flex-1 items-center justify-center px-6 py-16">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
          <Building2 size={22} color={colors.primary} />
        </View>
        <Text className="mt-3 text-center text-sm font-bold text-text-primary">Pick a branch to close a day</Text>
        <Text className="mt-1 max-w-[360px] text-center text-xs text-text-secondary">
          Cash is counted per branch. Pick the till to reconcile.
        </Text>
        <View className="mt-4 flex-row flex-wrap justify-center gap-2">
          {branchChoices.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setBranch(b.id)}
              className="min-h-[44px] flex-row items-center rounded-full border border-primary bg-white px-4"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Close the day for ${b.name}`}
            >
              <Building2 size={14} color={colors.primary} />
              <Text className="ml-1.5 text-xs font-bold text-primary">{b.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={financeContentPadding(compact)} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Date navigation */}
      <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-border/60 bg-white px-3 py-2 shadow-sm">
        <Pressable
          onPress={() => setDayCloseDate(addDays(dayCloseDate, -1))}
          className="h-[44px] w-[44px] items-center justify-center rounded-full"
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <ChevronLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={() => setPickerOpen(true)} className="min-h-[44px] flex-1 flex-row items-center justify-center" accessibilityRole="button" accessibilityLabel="Pick a business date">
          <Calendar size={15} color={colors.primary} />
          <View className="ml-2 items-center">
            <Text className="text-sm font-bold text-text-primary">{formatDateLong(dayCloseDate)}</Text>
            <Text className="text-[11px] text-text-secondary">{branchName}{dayCloseDate === today ? ' · today' : ''}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setDayCloseDate(addDays(dayCloseDate, 1))}
          disabled={dayCloseDate >= today}
          className="h-[44px] w-[44px] items-center justify-center rounded-full"
          style={({ pressed }) => [{ opacity: pressed || dayCloseDate >= today ? 0.4 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <ChevronRight size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {error ? <FinanceErrorView message={error} onRetry={loadDayClose} /> : null}
      {loading && !computation ? <FinanceLoadingView /> : null}

      {computation ? (
        <View className={compact ? '' : 'flex-row gap-4'}>
          {/* Reconciliation card */}
          <FinanceSectionCard
            title={isClosed ? 'Day closed' : 'Cash reconciliation'}
            subtitle={isClosed && closure?.closed_at ? `Closed ${formatDateTime(closure.closed_at)}` : 'Compare the till against recorded cash movement'}
            icon={isClosed ? <Lock size={16} color={semantic.success} /> : <LockOpen size={16} color={colors.primary} />}
            className={compact ? 'mb-4' : 'flex-1'}
            right={loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          >
            <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Opening cash (float)</Text>
            <TextInput
              value={openingDraft}
              onChangeText={setOpeningDraft}
              editable={!isClosed}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              className={`${FIELD_CLASS} ${isClosed ? 'opacity-60' : ''}`}
              accessibilityLabel="Opening cash"
            />

            <View className="mt-4 rounded-xl bg-surface-tint px-3 py-2">
              <ReconRow label="Opening cash" value={opening} />
              <ReconRow label={`Cash sales (${computation.cashSettlementCount})`} value={computation.cashSales} sign="+" />
              <ReconRow label="Cash refunds" value={computation.cashRefunds} sign="−" />
              <ReconRow label={`Cash expenses (${computation.cashExpenseCount})`} value={computation.cashExpenses} sign="−" />
              <View className="my-1.5 h-px bg-border" />
              <ReconRow label="Expected in till" value={expected} strong />
            </View>

            <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Counted cash</Text>
            <TextInput
              value={countedDraft}
              onChangeText={setCountedDraft}
              editable={!isClosed}
              keyboardType="decimal-pad"
              placeholder="Count the drawer and enter the total"
              placeholderTextColor={colors.textSecondary}
              className={`${FIELD_CLASS} ${isClosed ? 'opacity-60' : ''}`}
              accessibilityLabel="Counted cash"
            />

            <View className="mt-3 flex-row items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: varianceColor, backgroundColor: variance === null ? colors.background : varianceTone === 'balanced' ? semantic.successSoft : varianceTone === 'surplus' ? semantic.warningSoft : semantic.dangerSoft }}>
              <Text className="text-xs font-bold text-text-primary">
                {variance === null ? 'Variance' : varianceTone === 'balanced' ? 'Balanced' : varianceTone === 'surplus' ? 'Surplus' : 'Shortage'}
              </Text>
              <Text className="text-base font-extrabold" style={{ color: variance === null ? colors.textSecondary : varianceColor }}>
                {variance === null ? '—' : formatINR(variance, { signed: true })}
              </Text>
            </View>

            <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Notes</Text>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              editable={!isClosed}
              placeholder="Anything unusual about today's cash?"
              placeholderTextColor={colors.textSecondary}
              className={`min-h-[64px] rounded-xl border border-border bg-white px-3 py-2 text-sm text-text-primary ${isClosed ? 'opacity-60' : ''}`}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Day close notes"
            />

            {formError ? <Text className="mt-3 text-xs font-semibold" style={{ color: semantic.danger }}>{formError}</Text> : null}
            {saved && !formError ? (
              <View className="mt-3 flex-row items-center">
                <CheckCircle2 size={14} color={semantic.success} />
                <Text className="ml-1.5 text-xs font-semibold" style={{ color: semantic.success }}>Saved</Text>
              </View>
            ) : null}
            {!schema?.dayClosuresTable ? (
              <Text className="mt-3 text-[11px] text-text-secondary">Saving needs the finance schema migration; the figures above are live regardless.</Text>
            ) : null}

            <View className="mt-4 flex-row justify-end gap-2">
              {isClosed ? (
                <ActionButton label="Reopen day" icon={<LockOpen size={15} color={colors.primary} />} variant="outline" busy={saving} onPress={() => submit('reopen')} />
              ) : (
                <>
                  <ActionButton label="Save draft" icon={<Save size={15} color={colors.primary} />} variant="outline" busy={saving} onPress={() => submit('save')} />
                  <ActionButton label="Close day" icon={<Lock size={15} color={colors.textOnPrimary} />} variant="primary" busy={saving} disabled={counted === null} onPress={() => submit('close')} />
                </>
              )}
            </View>
          </FinanceSectionCard>

          {/* Recent closures */}
          <FinanceSectionCard title="Recent day closes" subtitle={filters.branchId === null ? 'All branches' : branchName} icon={<Calendar size={16} color={colors.primary} />} className={compact ? '' : 'w-[360px]'}>
            {recentClosures.length === 0 ? (
              <Text className="py-6 text-center text-xs text-text-secondary">No day closes recorded yet</Text>
            ) : (
              <FlatList
                data={recentClosures}
                keyExtractor={(c) => c.id}
                scrollEnabled={false}
                renderItem={({ item }) => <ClosureRow closure={item} active={item.business_date === dayCloseDate} onPress={() => setDayCloseDate(item.business_date)} />}
              />
            )}
          </FinanceSectionCard>
        </View>
      ) : null}

      <DatePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        startDate={dayCloseDate}
        endDate={dayCloseDate}
        onApply={(start) => {
          if (start <= today) setDayCloseDate(start);
        }}
      />
    </ScrollView>
  );
}

function ReconRow({ label, value, sign, strong = false }: { label: string; value: number; sign?: '+' | '−'; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className={`text-xs ${strong ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>{label}</Text>
      <Text className={`text-xs ${strong ? 'text-sm font-extrabold text-text-primary' : 'font-semibold text-text-primary'}`}>
        {sign ? `${sign} ` : ''}{formatINR(value)}
      </Text>
    </View>
  );
}

type ActionButtonProps = { label: string; icon: React.ReactNode; variant: 'primary' | 'outline'; busy: boolean; disabled?: boolean; onPress: () => void };

function ActionButton({ label, icon, variant, busy, disabled = false, onPress }: ActionButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      className={`min-h-[44px] flex-row items-center justify-center rounded-xl px-4 ${isPrimary ? 'bg-primary' : 'border border-primary bg-white'}`}
      style={({ pressed }) => [{ opacity: pressed || busy || disabled ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? <ActivityIndicator size="small" color={isPrimary ? colors.textOnPrimary : colors.primary} /> : icon}
      <Text className={`ml-1.5 text-sm font-bold ${isPrimary ? 'text-text-on-primary' : 'text-primary'}`}>{label}</Text>
    </Pressable>
  );
}

function ClosureRow({ closure, active, onPress }: { closure: DayClosure; active: boolean; onPress: () => void }) {
  const tone = classifyVariance(closure.variance);
  const color = tone === 'balanced' ? semantic.success : tone === 'surplus' ? semantic.warning : semantic.danger;
  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${active ? 'border-primary bg-accent-soft' : 'border-border/60 bg-white'}`}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Day close ${formatDateLabel(closure.business_date, true)}`}
    >
      <View>
        <Text className="text-xs font-bold text-text-primary">{formatDateLabel(closure.business_date, true)}</Text>
        <Text className="text-[11px] text-text-secondary">
          Expected {formatINR(closure.expected_cash)} · Counted {closure.counted_cash === null ? '—' : formatINR(closure.counted_cash)}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-xs font-extrabold" style={{ color: closure.variance === null ? colors.textSecondary : color }}>
          {closure.variance === null ? '—' : formatINR(closure.variance, { signed: true })}
        </Text>
        <Text className="text-[10px] font-bold uppercase" style={{ color: closure.status === 'closed' ? semantic.success : semantic.warning }}>
          {closure.status}
        </Text>
      </View>
    </Pressable>
  );
}
