import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Repeat, Trash2, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { centerFieldOnFocus } from '@/lib/pos/web-style';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type { EntryTemplate, FinanceAccount } from '@/lib/pos/finance-types';
import { LEDGER_KIND_LABELS, LEDGER_MODE_LABELS, templateDueDate, templateRecordedInMonth } from '@/lib/pos/finance-ledger-utils';
import { formatDateLabel, formatDateLong, formatINR, getCurrentBusinessDate, parseAmountInput } from '@/lib/pos/finance-utils';
import { FinanceEmptyView, FinanceLoadingView } from './FinanceStateViews';

export type RegularsModalProps = {
  visible: boolean;
  templates: EntryTemplate[];
  loading: boolean;
  accounts: FinanceAccount[];
  submitting: boolean;
  serverError: string | null;
  compact: boolean;
  /** Records one entry per pick, dated today. */
  onRecord: (picks: { template: EntryTemplate; amount: number }[], date: string) => void;
  /** Switches a regular off. */
  onRemove: (template: EntryTemplate) => void;
  onClose: () => void;
};

/**
 * The regulars: saved entries such as rent and salaries, recorded again each
 * month. Tick the ones to record, adjust an amount if it changed, save.
 */
export function RegularsModal({ visible, templates, loading, accounts, submitting, serverError, compact, onRecord, onRemove, onClose }: RegularsModalProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const today = getCurrentBusinessDate();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [amountError, setAmountError] = useState<string | null>(null);

  // On opening, everything not yet recorded this month is ticked.
  useEffect(() => {
    if (!visible) return;
    const nextPicked: Record<string, boolean> = {};
    const nextAmounts: Record<string, string> = {};
    for (const t of templates) {
      nextPicked[t.id] = !templateRecordedInMonth(t, today);
      nextAmounts[t.id] = t.amount > 0 ? t.amount.toString() : '';
    }
    setPicked(nextPicked);
    setAmounts(nextAmounts);
    setAmountError(null);
    // The list is re-read only when the dialog opens or its rows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, templates.length]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Account';
  const chosen = useMemo(() => templates.filter((t) => picked[t.id]), [templates, picked]);
  const total = useMemo(() => {
    let sum = 0;
    for (const t of chosen) sum += parseAmountInput(amounts[t.id] ?? '') ?? 0;
    return Math.round(sum * 100) / 100;
  }, [chosen, amounts]);

  if (!visible) return null;

  const handleRecord = () => {
    const picks: { template: EntryTemplate; amount: number }[] = [];
    for (const t of chosen) {
      const amount = parseAmountInput(amounts[t.id] ?? '');
      if (amount === null || amount <= 0) {
        setAmountError(`Enter the amount for ${t.particulars}.`);
        return;
      }
      picks.push({ template: t, amount });
    }
    if (picks.length === 0) return;
    setAmountError(null);
    onRecord(picks, today);
  };

  const renderItem = ({ item }: { item: EntryTemplate }) => {
    const on = picked[item.id] === true;
    const done = templateRecordedInMonth(item, today);
    const isDue = item.kind === 'payable' || item.kind === 'receivable';
    const due = isDue ? templateDueDate(item.due_day, today) : null;
    const meta = [
      accountName(item.account_id),
      LEDGER_KIND_LABELS[item.kind],
      !isDue && item.mode ? LEDGER_MODE_LABELS[item.mode] : null,
      item.counterparty,
      due ? `due ${formatDateLabel(due, true)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <View className="flex-row items-center border-b border-border-soft py-2">
        <Pressable
          onPress={() => setPicked((prev) => ({ ...prev, [item.id]: !on }))}
          className="h-[44px] w-[44px] items-center justify-center"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on }}
          accessibilityLabel={`Record ${item.particulars}`}
        >
          <View className={`h-6 w-6 items-center justify-center rounded-md border ${on ? 'border-primary bg-primary' : 'border-border bg-white'}`}>
            {on ? <Check size={14} color={colors.textOnPrimary} /> : null}
          </View>
        </Pressable>
        <View className="flex-1 px-1">
          <Text className="text-sm font-bold text-text-primary" numberOfLines={1}>{item.particulars}</Text>
          <Text className="text-[11px] text-text-secondary" numberOfLines={1}>{meta}</Text>
          {done && item.last_recorded_on ? (
            <Text className="text-[11px] font-semibold" style={{ color: semantic.success }}>
              Recorded this month on {formatDateLabel(item.last_recorded_on, true)}
            </Text>
          ) : null}
        </View>
        <TextInput
          value={amounts[item.id] ?? ''}
          onChangeText={(t) => {
            setAmounts((prev) => ({ ...prev, [item.id]: t }));
            setAmountError(null);
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          className="min-h-[44px] w-[104px] rounded-xl border border-border bg-white px-2 text-right text-sm font-extrabold text-text-primary"
          accessibilityLabel={`Amount for ${item.particulars}`}
          onFocus={centerFieldOnFocus}
        />
        <Pressable
          onPress={() => onRemove(item)}
          className="ml-1 h-[44px] w-[40px] items-center justify-center"
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.particulars} from the regulars`}
        >
          <Trash2 size={15} color={colors.textSecondary} />
        </Pressable>
      </View>
    );
  };

  return (
    <Modal visible transparent animationType={compact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <KeyboardAvoider>
        <Pressable className={`flex-1 bg-black/40 ${compact ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
          <Pressable
            onPress={() => undefined}
            className={`w-full overflow-hidden bg-white shadow-panel ${compact ? 'rounded-t-3xl' : 'max-w-[620px] rounded-3xl'}`}
            style={{ maxHeight: height * 0.9 }}
          >
            <View className="flex-row items-center border-b border-border-soft px-5 py-4">
              <Repeat size={18} color={colors.primary} />
              <View className="flex-1 px-3">
                <Text className="text-base font-bold text-text-primary">Regulars</Text>
                <Text className="text-xs text-text-secondary">Tick what to record for {formatDateLong(today)}; change an amount if it differs this month.</Text>
              </View>
              <Pressable
                onPress={onClose}
                className="h-[44px] w-[44px] items-center justify-center rounded-full"
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {loading && templates.length === 0 ? (
              <View className="px-5 py-6"><FinanceLoadingView label="Loading the regulars…" /></View>
            ) : (
              <FlatList
                data={templates}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 8 }}
                ListEmptyComponent={
                  <FinanceEmptyView
                    title="No regulars yet"
                    subtitle="Open an entry such as the rent or a salary and choose Save as a regular. It then appears here every month, ready to record."
                  />
                }
              />
            )}

            {amountError || serverError ? (
              <View className="mx-5 mb-2 rounded-xl px-3 py-2" style={{ backgroundColor: semantic.dangerSoft }}>
                <Text className="text-xs font-semibold" style={{ color: semantic.danger }}>{amountError ?? serverError}</Text>
              </View>
            ) : null}

            <View
              className="flex-row items-center justify-between gap-2 border-t border-border-soft px-5 py-3"
              style={compact ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}
            >
              <Text className="flex-1 text-xs font-semibold text-text-secondary">
                {chosen.length === 0 ? 'Nothing ticked' : `${chosen.length} ${chosen.length === 1 ? 'entry' : 'entries'} · ${formatINR(total)}`}
              </Text>
              <Pressable
                onPress={handleRecord}
                disabled={submitting || chosen.length === 0}
                className="min-h-[44px] min-w-[150px] flex-row items-center justify-center rounded-xl bg-primary px-5"
                style={({ pressed }) => [{ opacity: pressed || submitting || chosen.length === 0 ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Record the ticked regulars"
              >
                {submitting ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : null}
                <Text className={`text-sm font-bold text-text-on-primary ${submitting ? 'ml-2' : ''}`}>Record</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}
