import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scale, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { centerFieldOnFocus } from '@/lib/pos/web-style';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type { AccountBalance, CashCount, CashCountInput, FinanceAccount, LedgerMode } from '@/lib/pos/finance-types';
import { LEDGER_MODES } from '@/lib/pos/finance-types';
import { fetchCashCounts } from '@/lib/pos/finance-ledger-service';
import { LEDGER_MODE_LABELS } from '@/lib/pos/finance-ledger-utils';
import { classifyVariance, computeCashVariance, formatDateLabel, formatDateLong, formatINR, getCurrentBusinessDate, parseAmountInput } from '@/lib/pos/finance-utils';

export type CashCountModalProps = {
  /** The account being counted; null hides the dialog. */
  account: FinanceAccount | null;
  /** What the ledger says is in the account right now. */
  balance: AccountBalance | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (input: CashCountInput) => void;
  onClose: () => void;
};

const FIELD_CLASS = 'min-h-[44px] rounded-xl border border-border bg-white px-3 text-sm text-text-primary';

function varianceWords(difference: number, mode: LedgerMode): { text: string; color: string } {
  // To the paisa: a count either matches the ledger or it does not.
  const tone = classifyVariance(difference, 0);
  if (tone === 'balanced') return { text: 'Matches the ledger', color: semantic.success };
  const what = mode === 'cash' ? 'cash box' : 'bank';
  if (tone === 'surplus') return { text: `${formatINR(difference)} more in the ${what} than the ledger says`, color: semantic.warning };
  return { text: `${formatINR(-difference)} short of what the ledger says`, color: semantic.danger };
}

export function CashCountModal({ account, balance, submitting, serverError, onSubmit, onClose }: CashCountModalProps) {
  const { isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mode, setMode] = useState<LedgerMode>('cash');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [adjust, setAdjust] = useState(true);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [counts, setCounts] = useState<CashCount[]>([]);
  const [countsLoading, setCountsLoading] = useState(false);

  const accountId = account?.id ?? null;
  useEffect(() => {
    if (!accountId) return;
    setMode('cash');
    setCounted('');
    setNote('');
    setAdjust(true);
    setAmountError(null);
    let cancelled = false;
    setCountsLoading(true);
    void fetchCashCounts(accountId, 6).then(({ data }) => {
      if (cancelled) return;
      setCounts(data ?? []);
      setCountsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!account) return null;

  const today = getCurrentBusinessDate();
  const expected = balance ? (mode === 'cash' ? balance.cash : balance.bank) : null;
  const parsed = parseAmountInput(counted);
  const difference = expected !== null && parsed !== null ? computeCashVariance(expected, parsed) : null;
  const words = difference !== null ? varianceWords(difference, mode) : null;
  const differs = difference !== null && classifyVariance(difference, 0) !== 'balanced';

  const handleSubmit = () => {
    if (parsed === null || (mode === 'cash' && parsed < 0)) {
      setAmountError('Enter what was counted, like 35400 or 35400.50.');
      return;
    }
    onSubmit({ account_id: account.id, mode, counted: parsed, counted_on: today, note: note.trim().length > 0 ? note.trim() : null, adjust });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider>
        <Pressable className={`flex-1 bg-black/40 ${isPhone ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
          <Pressable
            onPress={() => undefined}
            className={`w-full overflow-hidden bg-white shadow-panel ${isPhone ? 'rounded-t-3xl' : 'max-w-[520px] rounded-3xl'}`}
            style={{ maxHeight: height * 0.92 }}
          >
            <View className="flex-row items-center justify-between border-b border-border-soft px-5 py-4">
              <View className="flex-1 pr-2">
                <Text className="text-base font-bold text-text-primary">Count {account.name}</Text>
                <Text className="text-xs text-text-secondary">{formatDateLong(today)} · what is really there, against what the ledger expects</Text>
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

            <ScrollView className="px-5 py-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">What was counted</Text>
              <View className="mb-4 flex-row gap-2">
                {LEDGER_MODES.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    className={`min-h-[40px] items-center justify-center rounded-full border px-4 ${mode === m ? 'border-primary bg-primary' : 'border-border bg-white'}`}
                    hitSlop={2}
                    style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === m }}
                  >
                    <Text className={`text-xs font-bold ${mode === m ? 'text-text-on-primary' : 'text-text-primary'}`}>
                      {m === 'cash' ? 'Cash box' : 'Bank balance'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="mb-4 rounded-2xl bg-surface-tint px-3 py-3">
                <Text className="text-[11px] font-bold uppercase tracking-wide text-text-secondary">The ledger expects</Text>
                <Text className="text-xl font-extrabold text-text-primary">{expected === null ? '—' : formatINR(expected)}</Text>
                <Text className="text-[11px] text-text-secondary">
                  {mode === 'cash' ? 'Opening cash, plus cash received, less cash paid out.' : 'Opening bank, plus bank receipts, less bank payments.'}
                </Text>
              </View>

              <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                {mode === 'cash' ? 'Cash counted (₹)' : 'Balance on the bank statement (₹)'}
              </Text>
              <TextInput
                value={counted}
                onChangeText={(t) => {
                  setCounted(t);
                  setAmountError(null);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                className={`${FIELD_CLASS} font-extrabold ${isPhone ? 'min-h-[56px] text-3xl' : 'text-2xl'}`}
                accessibilityLabel="Amount counted"
                onFocus={centerFieldOnFocus}
              />
              {amountError ? <Text className="mt-1 text-xs font-semibold" style={{ color: semantic.danger }}>{amountError}</Text> : null}
              {words ? (
                <View className="mt-2 flex-row items-center">
                  <Scale size={14} color={words.color} />
                  <Text className="ml-1.5 flex-1 text-xs font-bold" style={{ color: words.color }}>{words.text}</Text>
                </View>
              ) : null}

              {differs ? (
                <Pressable
                  onPress={() => setAdjust((v) => !v)}
                  className="mt-4 min-h-[44px] flex-row items-center rounded-xl border border-border bg-white px-3"
                  style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: adjust }}
                  accessibilityLabel="Post the difference to the ledger"
                >
                  <View className={`h-5 w-5 items-center justify-center rounded border ${adjust ? 'border-primary bg-primary' : 'border-border bg-white'}`}>
                    {adjust ? <Text className="text-[11px] font-extrabold text-text-on-primary">✓</Text> : null}
                  </View>
                  <View className="ml-2 flex-1">
                    <Text className="text-xs font-bold text-text-primary">Post the difference to the ledger</Text>
                    <Text className="text-[11px] text-text-secondary">
                      {difference !== null && difference < 0 ? 'An expense' : 'An income'} under Cash Over / Short, so the books match the count.
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Note</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={differs ? 'What explains the difference?' : 'Optional'}
                placeholderTextColor={colors.textSecondary}
                className={FIELD_CLASS}
                maxLength={300}
                accessibilityLabel="Note"
                onFocus={centerFieldOnFocus}
              />

              {serverError ? (
                <View className="mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: semantic.dangerSoft }}>
                  <Text className="text-xs font-semibold" style={{ color: semantic.danger }}>{serverError}</Text>
                </View>
              ) : null}

              <Text className="mb-1.5 mt-5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Earlier counts</Text>
              {countsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : counts.length === 0 ? (
                <Text className="pb-2 text-xs text-text-secondary">No count recorded for this account yet.</Text>
              ) : (
                counts.map((c) => {
                  const tone = classifyVariance(c.difference, 0);
                  const color = tone === 'balanced' ? semantic.success : tone === 'surplus' ? semantic.warning : semantic.danger;
                  return (
                    <View key={c.id} className="flex-row items-center justify-between border-b border-border-soft py-2">
                      <View className="flex-1 pr-2">
                        <Text className="text-xs font-bold text-text-primary">
                          {formatDateLabel(c.counted_on, true)} · {LEDGER_MODE_LABELS[c.mode]} · {formatINR(c.counted)}
                        </Text>
                        <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
                          {[c.counted_by_name, c.note, c.adjustment_entry_id ? 'difference posted' : null].filter(Boolean).join(' · ') || 'Counted'}
                        </Text>
                      </View>
                      <Text className="text-xs font-extrabold" style={{ color }}>
                        {tone === 'balanced' ? 'Matched' : formatINR(c.difference, { signed: true })}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View
              className="flex-row items-center justify-end gap-2 border-t border-border-soft px-5 py-3"
              style={isPhone ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}
            >
              <Pressable
                onPress={onClose}
                disabled={submitting}
                className="min-h-[44px] items-center justify-center rounded-xl border border-border px-4"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
              >
                <Text className="text-sm font-bold text-text-secondary">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                className="min-h-[44px] min-w-[140px] flex-row items-center justify-center rounded-xl bg-primary px-5"
                style={({ pressed }) => [{ opacity: pressed || submitting ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Save the count"
              >
                {submitting ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : null}
                <Text className={`text-sm font-bold text-text-on-primary ${submitting ? 'ml-2' : ''}`}>Save count</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}
