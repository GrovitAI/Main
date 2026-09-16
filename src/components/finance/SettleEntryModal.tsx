import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, CheckCircle2, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { centerFieldOnFocus } from '@/lib/pos/web-style';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect';
import type { FinanceAccount, FinanceEntry, LedgerMode, SettleEntryInput, SettleFormErrors, SettleFormValues } from '@/lib/pos/finance-types';
import { LEDGER_MODES } from '@/lib/pos/finance-types';
import { addDays, formatDateLabel, formatDateLong, formatINR, getCurrentBusinessDate } from '@/lib/pos/finance-utils';
import { LEDGER_MODE_LABELS, emptySettleForm, remainingAmount, validateSettleForm } from '@/lib/pos/finance-ledger-utils';

export type SettleEntryModalProps = {
  /** The open payable or receivable being paid; null hides the sheet. */
  entry: FinanceEntry | null;
  accounts: FinanceAccount[];
  submitting: boolean;
  serverError: string | null;
  onSubmit: (input: SettleEntryInput) => void;
  onClose: () => void;
};

const FIELD_CLASS = 'min-h-[44px] rounded-xl border border-border bg-white px-3 text-sm text-text-primary';

/**
 * Records the payment of a payable or the collection of a receivable. The
 * amount starts at what remains, so the common case is one tap on Settle; a
 * smaller amount leaves the entry open with the rest.
 */
export function SettleEntryModal({ entry, accounts, submitting, serverError, onSubmit, onClose }: SettleEntryModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const { isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  const today = getCurrentBusinessDate();
  const [values, setValues] = useState<SettleFormValues>(() => (entry ? emptySettleForm(entry, today) : emptySettleForm({ amount: 0, settled: 0 } as FinanceEntry, today)));
  const [errors, setErrors] = useState<SettleFormErrors>({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [payerOpen, setPayerOpen] = useState(false);

  useEffect(() => {
    if (entry) {
      setValues(emptySettleForm(entry, getCurrentBusinessDate()));
      setErrors({});
      setPayerOpen(false);
    }
  }, [entry]);

  const otherAccounts = useMemo(
    () => accounts.filter((a) => a.is_active && a.id !== entry?.account_id),
    [accounts, entry?.account_id],
  );

  if (!entry) return null;

  const isPayable = entry.kind === 'payable';
  const remaining = remainingAmount(entry);
  const ownerName = accounts.find((a) => a.id === entry.account_id)?.name ?? 'this account';
  // On a phone the payer is one line that opens a searchable list.
  const payerOptions: SearchSelectOption[] = [
    { id: '', label: ownerName, hint: 'Same account' },
    ...otherAccounts.map((a) => ({ id: a.id, label: a.kind === 'partner' ? `${a.name} (partner)` : a.name })),
  ];

  const setField = <K extends keyof SettleFormValues>(key: K, value: SettleFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = () => {
    const result = validateSettleForm(values, entry);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.value);
  };

  const quickDates: { label: string; value: string }[] = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: addDays(today, -1) },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider>
        <Pressable className={`flex-1 bg-black/40 ${isPhone ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
          <Pressable
            onPress={() => undefined}
            className={`w-full overflow-hidden bg-white shadow-panel ${isPhone ? 'rounded-t-3xl' : 'max-w-[520px] rounded-3xl'}`}
            style={{ maxHeight: windowHeight * 0.92 }}
          >
            <View className="flex-row items-center justify-between border-b border-border-soft px-5 py-4">
              <View className="flex-1 pr-2">
                <Text className="text-base font-bold text-text-primary">{isPayable ? 'Settle payable' : 'Collect receivable'}</Text>
                <Text className="text-xs text-text-secondary" numberOfLines={2}>
                  {entry.particulars} · {formatDateLabel(entry.transaction_date, true)} · {formatINR(remaining)} of {formatINR(entry.amount)} remaining
                </Text>
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
              <Field label={isPayable ? 'Amount paid (₹)' : 'Amount received (₹)'} error={errors.amount} hint={`Less than ${formatINR(remaining)} keeps the entry open for the rest.`}>
                <TextInput
                  value={values.amount}
                  onChangeText={(t) => setField('amount', t)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  className={`${FIELD_CLASS} font-extrabold ${isPhone ? 'min-h-[56px] text-3xl' : 'text-2xl'}`}
                  selectTextOnFocus
                  accessibilityLabel="Amount"
                  onFocus={centerFieldOnFocus}
                />
              </Field>

              <Field label={isPayable ? 'Paid via' : 'Received via'}>
                <View className="flex-row gap-2">
                  {LEDGER_MODES.map((m: LedgerMode) => (
                    <SelectChip key={m} label={LEDGER_MODE_LABELS[m]} active={values.mode === m} onPress={() => setField('mode', m)} />
                  ))}
                </View>
                <Text className="mt-1.5 text-[11px] text-text-secondary">UPI and card count as bank.</Text>
              </Field>

              <Field label="Transaction date" error={errors.transaction_date} hint={formatDateLong(values.transaction_date)}>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={values.transaction_date}
                    onChangeText={(t) => setField('transaction_date', t)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                    className={`${FIELD_CLASS} flex-1`}
                    autoCapitalize="none"
                    accessibilityLabel="Transaction date"
                    onFocus={centerFieldOnFocus}
                  />
                  <Pressable
                    onPress={() => setDatePickerOpen(true)}
                    className="h-[44px] w-[44px] items-center justify-center rounded-xl border border-border bg-white"
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Pick a date"
                  >
                    <Calendar size={18} color={colors.primary} />
                  </Pressable>
                </View>
                <View className="mt-2 flex-row gap-2">
                  {quickDates.map((q) => (
                    <SelectChip key={q.value} label={q.label} active={values.transaction_date === q.value} onPress={() => setField('transaction_date', q.value)} small />
                  ))}
                </View>
              </Field>

              {/* Who actually paid, when it was not the account whose books carry the entry */}
              {otherAccounts.length > 0 ? (
                <Field label={isPayable ? 'Paid from' : 'Received by'} hint={payerOpen ? `The money leaves that account; the cost stays with ${ownerName}.` : undefined}>
                  {payerOpen && isPhone ? (
                    <SearchSelect
                      value={values.paid_from_account_id}
                      options={payerOptions}
                      placeholder={isPayable ? 'Paid from' : 'Received by'}
                      onChange={(id) => setField('paid_from_account_id', id)}
                    />
                  ) : payerOpen ? (
                    <View className="flex-row flex-wrap gap-2">
                      <SelectChip label={ownerName} active={values.paid_from_account_id === ''} onPress={() => setField('paid_from_account_id', '')} />
                      {otherAccounts.map((a) => (
                        <SelectChip
                          key={a.id}
                          label={a.kind === 'partner' ? `${a.name} (partner)` : a.name}
                          active={values.paid_from_account_id === a.id}
                          onPress={() => setField('paid_from_account_id', a.id)}
                        />
                      ))}
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setPayerOpen(true)}
                      className="min-h-[44px] justify-center"
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={isPayable ? 'Paid by another account' : 'Received by another account'}
                    >
                      <Text className="text-sm font-semibold text-text-primary">
                        {ownerName} · <Text className="font-bold text-primary">{isPayable ? 'paid by another account?' : 'received by another account?'}</Text>
                      </Text>
                    </Pressable>
                  )}
                </Field>
              ) : null}

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Field label="Reference" error={errors.reference_no}>
                    <TextInput
                      value={values.reference_no}
                      onChangeText={(t) => setField('reference_no', t)}
                      placeholder="Bill / UPI ref"
                      placeholderTextColor={colors.textSecondary}
                      className={FIELD_CLASS}
                      autoCapitalize="characters"
                      accessibilityLabel="Reference number"
                      onFocus={centerFieldOnFocus}
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Notes" error={errors.notes}>
                    <TextInput
                      value={values.notes}
                      onChangeText={(t) => setField('notes', t)}
                      placeholder="Optional"
                      placeholderTextColor={colors.textSecondary}
                      className={FIELD_CLASS}
                      accessibilityLabel="Notes"
                      onFocus={centerFieldOnFocus}
                    />
                  </Field>
                </View>
              </View>

              {serverError ? (
                <View className="mb-3 rounded-xl px-3 py-2" style={{ backgroundColor: semantic.dangerSoft }}>
                  <Text className="text-xs font-semibold" style={{ color: semantic.danger }}>{serverError}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View className="flex-row items-center justify-end gap-2 border-t border-border-soft px-5 py-3" style={isPhone ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}>
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
                className="min-h-[44px] min-w-[150px] flex-row items-center justify-center rounded-xl bg-primary px-5"
                style={({ pressed }) => [{ opacity: pressed || submitting ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={isPayable ? 'Record payment' : 'Record receipt'}
              >
                {submitting ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <CheckCircle2 size={16} color={colors.textOnPrimary} />}
                <Text className="ml-1.5 text-sm font-bold text-text-on-primary">{isPayable ? 'Record payment' : 'Record receipt'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoider>

      <DatePickerModal
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        startDate={values.transaction_date}
        endDate={values.transaction_date}
        mode="single"
        onApply={(start) => setField('transaction_date', start)}
      />
    </Modal>
  );
}

type FieldProps = { label: string; error?: string; hint?: string; children: React.ReactNode };

function Field({ label, error, hint, children }: FieldProps) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">{label}</Text>
      {children}
      {error ? (
        <Text className="mt-1 text-xs font-semibold" style={{ color: semantic.danger }}>
          {error}
        </Text>
      ) : hint ? (
        <Text className="mt-1 text-[11px] text-text-secondary">{hint}</Text>
      ) : null}
    </View>
  );
}

type SelectChipProps = { label: string; active: boolean; onPress: () => void; small?: boolean };

function SelectChip({ label, active, onPress, small = false }: SelectChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`items-center justify-center rounded-full border ${small ? 'min-h-[32px] px-3' : 'min-h-[36px] px-3.5'} ${
        active ? 'border-primary bg-primary' : 'border-border bg-white'
      }`}
      hitSlop={small ? 6 : 4}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text className={`text-xs font-bold ${active ? 'text-text-on-primary' : 'text-text-primary'}`}>{label}</Text>
    </Pressable>
  );
}
