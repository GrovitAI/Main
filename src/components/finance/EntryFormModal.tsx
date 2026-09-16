import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Plus, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { centerFieldOnFocus } from '@/lib/pos/web-style';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect';
import type { CatalogItem, EntryFormErrors, EntryFormValues, FinanceAccount, FinanceEntryInput, FinanceRules, LedgerKind, LedgerMode } from '@/lib/pos/finance-types';
import { LEDGER_KINDS, LEDGER_MODES } from '@/lib/pos/finance-types';
import type { UserRole } from '@/lib/pos/session-context';
import { addDays, formatDateLong, getCurrentBusinessDate } from '@/lib/pos/finance-utils';
import {
  LEDGER_KIND_LABELS,
  LEDGER_MODE_LABELS,
  canTransfer,
  catalogById,
  catalogChildren,
  isFinanceOwner,
  kindCanHavePayer,
  payerLabel,
  resolveCatalogKind,
  suggestCatalog,
  validateEntryForm,
} from '@/lib/pos/finance-ledger-utils';

export type EntryFormModalProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialValues: EntryFormValues;
  accounts: FinanceAccount[];
  catalog: CatalogItem[];
  rules: FinanceRules | null;
  role: UserRole | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (input: FinanceEntryInput) => void;
  /** Create mode only: save, then keep the form open with fresh values. */
  onSubmitAndNext?: (input: FinanceEntryInput) => void;
  onClose: () => void;
};

const FIELD_CLASS = 'min-h-[44px] rounded-xl border border-border bg-white px-3 text-sm text-text-primary';

export function EntryFormModal({
  visible,
  mode,
  initialValues,
  accounts,
  catalog,
  rules,
  role,
  submitting,
  serverError,
  onSubmit,
  onSubmitAndNext,
  onClose,
}: EntryFormModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const { isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<EntryFormValues>(initialValues);
  const [errors, setErrors] = useState<EntryFormErrors>({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  // The second account picker stays folded away for the everyday case.
  const [payerOpen, setPayerOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setValues(initialValues);
      setErrors({});
      setSuggestionsOpen(false);
      setPayerOpen(initialValues.paid_from_account_id.length > 0);
    }
  }, [visible, initialValues]);

  const setField = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = (andNext = false) => {
    const result = validateEntryForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (andNext && onSubmitAndNext) onSubmitAndNext(result.value);
    else onSubmit(result.value);
  };
  const canSaveAndNext = mode === 'create' && onSubmitAndNext !== undefined;

  const today = getCurrentBusinessDate();
  const quickDates: { label: string; value: string }[] = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: addDays(today, -1) },
  ];

  const isOwner = isFinanceOwner(role);
  const transferAllowed = canTransfer(role, rules);
  const kinds: LedgerKind[] = LEDGER_KINDS.filter((k) => k !== 'transfer' || transferAllowed);
  const isTransfer = values.kind === 'transfer';

  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts]);
  const otherAccounts = useMemo(() => activeAccounts.filter((a) => a.id !== values.account_id), [activeAccounts, values.account_id]);
  const payerAllowed = kindCanHavePayer(values.kind) && otherAccounts.length > 0;
  const forName = activeAccounts.find((a) => a.id === values.account_id)?.name ?? 'this account';

  const pickKind = (k: LedgerKind) => {
    setValues((prev) => ({ ...prev, kind: k, paid_from_account_id: kindCanHavePayer(k) ? prev.paid_from_account_id : '' }));
    if (!kindCanHavePayer(k)) setPayerOpen(false);
  };

  // Built-in categories (Opening Balance, Partners) are the owner's business.
  const categories = useMemo(
    () => catalogChildren(catalog, null).filter((c) => isOwner || !c.is_system),
    [catalog, isOwner],
  );
  const subcategories = useMemo(
    () => (values.category_id ? catalogChildren(catalog, values.category_id) : []),
    [catalog, values.category_id],
  );
  const suggestions = useMemo(
    () => (suggestionsOpen && !isTransfer ? suggestCatalog(catalog, values.particulars) : []),
    [catalog, values.particulars, suggestionsOpen, isTransfer],
  );

  // A phone cannot spare a screen for rows of chips, so there each of these
  // is one line that opens a searchable list: whose books, who paid, and the
  // category with its sub-categories under it.
  const accountLabel = (a: FinanceAccount) => (a.kind === 'partner' ? `${a.name} (partner)` : a.name);
  const accountOptions: SearchSelectOption[] = useMemo(
    () => activeAccounts.map((a) => ({ id: a.id, label: accountLabel(a), hint: a.kind === 'partner' ? 'Partner' : 'Branch' })),
    [activeAccounts],
  );
  const payerOptions: SearchSelectOption[] = useMemo(
    () => [{ id: '', label: forName, hint: 'Same account' }, ...otherAccounts.map((a) => ({ id: a.id, label: accountLabel(a) }))],
    [forName, otherAccounts],
  );
  const categoryOptions: SearchSelectOption[] = useMemo(
    () =>
      categories.flatMap((c) => [
        { id: c.id, label: c.name, hint: c.default_kind ? LEDGER_KIND_LABELS[c.default_kind] : undefined },
        ...catalogChildren(catalog, c.id).map((sub) => ({ id: sub.id, label: sub.name, hint: c.name, nested: true })),
      ]),
    [categories, catalog],
  );
  const pickCategoryOption = (id: string) => {
    const item = catalogById(catalog, id);
    if (!item) return;
    const kind = resolveCatalogKind(catalog, id);
    setValues((prev) => ({
      ...prev,
      category_id: item.level === 'subcategory' ? item.parent_id ?? '' : id,
      subcategory_id: item.level === 'subcategory' ? id : '',
      particular_id: '',
      kind: kind && prev.kind !== 'transfer' ? kind : prev.kind,
    }));
  };

  const pickCategory = (id: string) => {
    const kind = resolveCatalogKind(catalog, id);
    setValues((prev) => ({
      ...prev,
      category_id: id,
      subcategory_id: '',
      particular_id: '',
      kind: kind && prev.kind !== 'transfer' ? kind : prev.kind,
    }));
  };

  const pickSubcategory = (id: string) => {
    const kind = resolveCatalogKind(catalog, id);
    setValues((prev) => ({
      ...prev,
      subcategory_id: prev.subcategory_id === id ? '' : id,
      particular_id: '',
      kind: kind && prev.kind !== 'transfer' ? kind : prev.kind,
    }));
  };

  const pickSuggestion = (item: CatalogItem, category: CatalogItem | null, subcategory: CatalogItem | null) => {
    const kind = resolveCatalogKind(catalog, item.id);
    setValues((prev) => ({
      ...prev,
      particulars: item.level === 'particular' ? item.name : prev.particulars.trim().length > 0 ? prev.particulars : item.name,
      particular_id: item.level === 'particular' ? item.id : '',
      subcategory_id: subcategory?.id ?? '',
      category_id: category?.id ?? '',
      kind: kind ?? prev.kind,
    }));
    setSuggestionsOpen(false);
    setErrors((prev) => ({ ...prev, particulars: undefined }));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider>
      {/* A sheet from the bottom on phones, a centred dialog elsewhere. */}
      <Pressable className={`flex-1 bg-black/40 ${isPhone ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          className={`w-full overflow-hidden bg-white shadow-panel ${isPhone ? 'rounded-t-3xl' : 'max-w-[600px] rounded-3xl'}`}
          style={{ maxHeight: windowHeight * 0.92 }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-border-soft px-5 py-4">
            <View className="flex-1 pr-2">
              <Text className="text-base font-bold text-text-primary">{mode === 'create' ? 'Record an entry' : 'Edit entry'}</Text>
              <Text className="text-xs text-text-secondary">Amounts in rupees. Who recorded it and when is kept automatically.</Text>
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
            {/* Account */}
            <Field label="For" error={errors.account_id}>
              {isPhone ? (
                <SearchSelect
                  value={values.account_id}
                  options={accountOptions}
                  placeholder="Whose books"
                  onChange={(id) => setValues((prev) => ({ ...prev, account_id: id, paid_from_account_id: prev.paid_from_account_id === id ? '' : prev.paid_from_account_id }))}
                  accessibilityLabel="Account"
                />
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {activeAccounts.map((a) => (
                    <SelectChip
                      key={a.id}
                      label={accountLabel(a)}
                      active={values.account_id === a.id}
                      onPress={() => setValues((prev) => ({ ...prev, account_id: a.id, paid_from_account_id: prev.paid_from_account_id === a.id ? '' : prev.paid_from_account_id }))}
                    />
                  ))}
                </View>
              )}
            </Field>

            {/* Paid from / For: whose cash or bank moved, when it was not the account above */}
            {payerAllowed ? (
              <Field
                label={payerLabel(values.kind)}
                hint={payerOpen ? `The money leaves that account; the cost or income stays with ${forName}.` : undefined}
              >
                {payerOpen && isPhone ? (
                  <SearchSelect
                    value={values.paid_from_account_id}
                    options={payerOptions}
                    placeholder={payerLabel(values.kind)}
                    onChange={(id) => setField('paid_from_account_id', id)}
                  />
                ) : payerOpen ? (
                  <View className="flex-row flex-wrap gap-2">
                    <SelectChip label={forName} active={values.paid_from_account_id === ''} onPress={() => setField('paid_from_account_id', '')} />
                    {otherAccounts.map((a) => (
                      <SelectChip
                        key={a.id}
                        label={accountLabel(a)}
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
                    accessibilityLabel="Paid by another account"
                  >
                    <Text className="text-sm font-semibold text-text-primary">
                      {forName} · <Text className="font-bold text-primary">{values.kind === 'income' ? 'received by another account?' : values.kind === 'transfer' ? 'from another account?' : 'paid by another account?'}</Text>
                    </Text>
                  </Pressable>
                )}
              </Field>
            ) : null}

            {/* Kind */}
            <Field label="Kind">
              <View className="flex-row flex-wrap gap-2">
                {kinds.map((k) => (
                  <SelectChip key={k} label={LEDGER_KIND_LABELS[k]} active={values.kind === k} onPress={() => pickKind(k)} />
                ))}
              </View>
              {values.kind === 'payable' || values.kind === 'receivable' ? (
                <Text className="mt-1.5 text-[11px] text-text-secondary">
                  Nothing moves yet: this goes to Outstanding until it is settled.
                </Text>
              ) : null}
            </Field>

            {/* Amount */}
            <Field label="Amount (₹)" error={errors.amount}>
              <TextInput
                value={values.amount}
                onChangeText={(t) => setField('amount', t)}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                className={`${FIELD_CLASS} font-extrabold ${isPhone ? 'min-h-[56px] text-3xl' : 'text-2xl'}`}
                // A new entry starts at the amount with the keypad already up.
                autoFocus={mode === 'create'}
                accessibilityLabel="Amount"
                onFocus={centerFieldOnFocus}
              />
            </Field>

            {/* Mode */}
            {isTransfer ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Field label="From">
                    <View className="flex-row gap-2">
                      {LEDGER_MODES.map((m: LedgerMode) => (
                        <SelectChip key={m} label={LEDGER_MODE_LABELS[m]} active={values.transfer_from === m} onPress={() => setField('transfer_from', m)} />
                      ))}
                    </View>
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="To" error={errors.transfer_to}>
                    <View className="flex-row gap-2">
                      {LEDGER_MODES.map((m: LedgerMode) => (
                        <SelectChip key={m} label={LEDGER_MODE_LABELS[m]} active={values.transfer_to === m} onPress={() => setField('transfer_to', m)} />
                      ))}
                    </View>
                  </Field>
                </View>
              </View>
            ) : (
              <Field label={values.kind === 'income' || values.kind === 'receivable' ? 'Received via' : 'Paid via'}>
                <View className="flex-row gap-2">
                  {LEDGER_MODES.map((m: LedgerMode) => (
                    <SelectChip key={m} label={LEDGER_MODE_LABELS[m]} active={values.mode === m} onPress={() => setField('mode', m)} />
                  ))}
                </View>
                <Text className="mt-1.5 text-[11px] text-text-secondary">UPI and card count as bank.</Text>
              </Field>
            )}

            {/* Date */}
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

            {/* Particulars, with the catalog offering matches as you type */}
            <Field label="Particulars" error={errors.particulars} hint={isTransfer ? undefined : 'Type two letters to pick from the catalog, or write your own.'}>
              <TextInput
                value={values.particulars}
                onChangeText={(t) => {
                  setValues((prev) => ({ ...prev, particulars: t, particular_id: '' }));
                  setSuggestionsOpen(true);
                  if (errors.particulars) setErrors((prev) => ({ ...prev, particulars: undefined }));
                }}
                onFocus={(e) => {
                  centerFieldOnFocus(e);
                  setSuggestionsOpen(true);
                }}
                placeholder={isTransfer ? 'e.g. Cash deposited at bank' : 'What was this for?'}
                placeholderTextColor={colors.textSecondary}
                className={FIELD_CLASS}
                accessibilityLabel="Particulars"
              />
              {suggestions.length > 0 ? (
                <View className="mt-1 overflow-hidden rounded-xl border border-border bg-white">
                  {suggestions.map((s) => (
                    <Pressable
                      key={s.item.id}
                      onPress={() => pickSuggestion(s.item, s.category, s.subcategory)}
                      className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft px-3"
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${s.item.name}`}
                    >
                      <Text className="flex-1 text-sm font-semibold text-text-primary" numberOfLines={1}>{s.item.name}</Text>
                      <Text className="ml-2 text-[11px] text-text-secondary" numberOfLines={1}>{s.path || s.item.level}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Field>

            {/* Category and sub-category */}
            {!isTransfer && isPhone ? (
              <Field label="Category" hint="Sub-categories sit under their category; type a few letters to jump to one.">
                <SearchSelect
                  value={values.subcategory_id || values.category_id || null}
                  options={categoryOptions}
                  placeholder="Pick a category"
                  onChange={pickCategoryOption}
                  accessibilityLabel="Category"
                />
              </Field>
            ) : null}
            {!isTransfer && !isPhone ? (
              <>
                <Field label="Category">
                  <View className="flex-row flex-wrap gap-2">
                    {categories.map((c) => (
                      <SelectChip key={c.id} label={c.name} active={values.category_id === c.id} onPress={() => pickCategory(c.id)} />
                    ))}
                  </View>
                </Field>
                {subcategories.length > 0 ? (
                  <Field label="Sub-category">
                    <View className="flex-row flex-wrap gap-2">
                      {subcategories.map((s) => (
                        <SelectChip key={s.id} label={s.name} active={values.subcategory_id === s.id} onPress={() => pickSubcategory(s.id)} />
                      ))}
                    </View>
                  </Field>
                ) : null}
              </>
            ) : null}

            {/* Counterparty and reference */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label={values.kind === 'income' || values.kind === 'receivable' ? 'Received from' : 'Paid to'} error={errors.counterparty}>
                  <TextInput
                    value={values.counterparty}
                    onChangeText={(t) => setField('counterparty', t)}
                    placeholder="Vendor or person"
                    placeholderTextColor={colors.textSecondary}
                    className={FIELD_CLASS}
                    accessibilityLabel="Counterparty"
                    onFocus={centerFieldOnFocus}
                  />
                </Field>
              </View>
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
            </View>

            {/* Notes */}
            <Field label="Notes" error={errors.notes}>
              <TextInput
                value={values.notes}
                onChangeText={(t) => setField('notes', t)}
                placeholder="Optional"
                placeholderTextColor={colors.textSecondary}
                className={`${FIELD_CLASS} min-h-[64px] py-2`}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Notes"
                onFocus={centerFieldOnFocus}
              />
            </Field>

            {serverError ? (
              <View className="mb-3 rounded-xl px-3 py-2" style={{ backgroundColor: semantic.dangerSoft }}>
                <Text className="text-xs font-semibold" style={{ color: semantic.danger }}>{serverError}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer */}
          <View
            className="border-t border-border-soft px-5 py-3"
            style={isPhone ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}
          >
            {canSaveAndNext ? (
              <Pressable
                onPress={() => handleSubmit(true)}
                disabled={submitting}
                className="mb-2 min-h-[44px] flex-row items-center justify-center rounded-xl border border-primary bg-white px-4"
                style={({ pressed }) => [{ opacity: pressed || submitting ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Save and add another entry"
              >
                <Plus size={15} color={colors.primary} />
                <Text className="ml-1.5 text-sm font-bold text-primary">Save & add another</Text>
              </Pressable>
            ) : null}
            <View className="flex-row items-center justify-end gap-2">
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
                onPress={() => handleSubmit(false)}
                disabled={submitting}
                className="min-h-[44px] min-w-[140px] flex-row items-center justify-center rounded-xl bg-primary px-5"
                style={({ pressed }) => [{ opacity: pressed || submitting ? 0.7 : 1 }]}
                accessibilityRole="button"
              >
                {submitting ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : null}
                <Text className={`text-sm font-bold text-text-on-primary ${submitting ? 'ml-2' : ''}`}>
                  {mode === 'create' ? 'Save entry' : 'Save changes'}
                </Text>
              </Pressable>
            </View>
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
      // The chips wrap in a dense grid, so the 44px target comes from hit slop.
      hitSlop={small ? 6 : 4}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text className={`text-xs font-bold ${active ? 'text-text-on-primary' : 'text-text-primary'}`}>{label}</Text>
    </Pressable>
  );
}
