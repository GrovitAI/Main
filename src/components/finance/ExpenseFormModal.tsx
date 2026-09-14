import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Check, Plus, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type { ExpenseCategory, ExpenseFormErrors, ExpenseFormValues, ExpenseInput, ExpensePaymentMethod } from '@/lib/pos/finance-types';
import { EXPENSE_PAYMENT_METHODS } from '@/lib/pos/finance-types';
import { PAYMENT_METHOD_LABELS, addDays, formatDateLong, getCurrentBusinessDate, validateExpenseForm } from '@/lib/pos/finance-utils';

export type ExpenseFormModalProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialValues: ExpenseFormValues;
  categories: ExpenseCategory[];
  canAddCategory: boolean;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (input: ExpenseInput) => void;
  onAddCategory: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onClose: () => void;
};

const FIELD_CLASS = 'min-h-[44px] rounded-xl border border-border bg-white px-3 text-sm text-text-primary';

/** Categories shown on a phone before the user asks for the rest. */
const PHONE_CATEGORY_LIMIT = 6;

export function ExpenseFormModal({
  visible,
  mode,
  initialValues,
  categories,
  canAddCategory,
  submitting,
  serverError,
  onSubmit,
  onAddCategory,
  onClose,
}: ExpenseFormModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const { isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [values, setValues] = useState<ExpenseFormValues>(initialValues);
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    if (visible) {
      setValues(initialValues);
      setErrors({});
      setNewCategoryOpen(false);
      setNewCategoryName('');
      setNewCategoryError(null);
      setShowAllCategories(false);
    }
  }, [visible, initialValues]);

  const setField = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = () => {
    const result = validateExpenseForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.value);
  };

  const handleAddCategory = async () => {
    setAddingCategory(true);
    setNewCategoryError(null);
    const result = await onAddCategory(newCategoryName);
    setAddingCategory(false);
    if (!result.ok) {
      setNewCategoryError(result.error);
      return;
    }
    setField('category', newCategoryName.trim());
    setNewCategoryName('');
    setNewCategoryOpen(false);
  };

  const today = getCurrentBusinessDate();
  const quickDates: { label: string; value: string }[] = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: addDays(today, -1) },
  ];

  const categoryNames = categories.map((c) => c.name);
  const hasCustomCategory = values.category.length > 0 && !categoryNames.includes(values.category);

  // A phone cannot spare a screen for eighteen chips. It gets the first few,
  // whichever one is already chosen, and a chip that reveals the rest.
  const canCollapseCategories = isPhone && categories.length > PHONE_CATEGORY_LIMIT;
  const collapsed = canCollapseCategories && !showAllCategories;
  const visibleCategories = collapsed
    ? categories.filter((c, index) => index < PHONE_CATEGORY_LIMIT || c.name === values.category)
    : categories;
  const hiddenCategoryCount = categories.length - visibleCategories.length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider>
      {/* A sheet from the bottom on phones, a centred dialog elsewhere. */}
      <Pressable className={`flex-1 bg-black/40 ${isPhone ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          className={`w-full overflow-hidden bg-white shadow-panel ${isPhone ? 'rounded-t-3xl' : 'max-w-[560px] rounded-3xl'}`}
          style={{ maxHeight: windowHeight * 0.92 }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-border-soft px-5 py-4">
            <View>
              <Text className="text-base font-bold text-text-primary">{mode === 'create' ? 'Add expense' : 'Edit expense'}</Text>
              <Text className="text-xs text-text-secondary">Amounts are recorded in rupees, inclusive of tax.</Text>
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
            {/* Amount */}
            <Field label="Amount (₹)" error={errors.amount}>
              <TextInput
                value={values.amount}
                onChangeText={(t) => setField('amount', t)}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                className={`${FIELD_CLASS} font-extrabold ${isPhone ? 'min-h-[56px] text-3xl' : 'text-2xl'}`}
                accessibilityLabel="Amount"
              />
            </Field>

            {/* Category */}
            <Field label="Category" error={errors.category}>
              <View className="flex-row flex-wrap gap-2">
                {hasCustomCategory ? <SelectChip label={values.category} active onPress={() => undefined} /> : null}
                {visibleCategories.map((c) => (
                  <SelectChip key={c.id} label={c.name} active={values.category === c.name} onPress={() => setField('category', c.name)} />
                ))}
                {collapsed ? (
                  <SelectChip label={`${hiddenCategoryCount} more…`} active={false} onPress={() => setShowAllCategories(true)} />
                ) : null}
                {canCollapseCategories && showAllCategories ? (
                  <SelectChip label="Fewer" active={false} onPress={() => setShowAllCategories(false)} />
                ) : null}
                {canAddCategory ? (
                  <Pressable
                    onPress={() => setNewCategoryOpen((v) => !v)}
                    className="min-h-[36px] flex-row items-center rounded-full border border-dashed border-primary px-3"
                    hitSlop={4}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Add a new category"
                  >
                    <Plus size={13} color={colors.primary} />
                    <Text className="ml-1 text-xs font-bold text-primary">New</Text>
                  </Pressable>
                ) : null}
              </View>
              {newCategoryOpen ? (
                <View className="mt-3">
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={newCategoryName}
                      onChangeText={setNewCategoryName}
                      placeholder="Category name"
                      placeholderTextColor={colors.textSecondary}
                      className={`${FIELD_CLASS} flex-1`}
                      autoFocus
                      accessibilityLabel="New category name"
                    />
                    <Pressable
                      onPress={handleAddCategory}
                      disabled={addingCategory || newCategoryName.trim().length === 0}
                      className="h-[44px] w-[44px] items-center justify-center rounded-xl bg-primary"
                      style={({ pressed }) => [{ opacity: pressed || addingCategory || newCategoryName.trim().length === 0 ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Save category"
                    >
                      {addingCategory ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : <Check size={18} color={colors.textOnPrimary} />}
                    </Pressable>
                  </View>
                  {newCategoryError ? <Text className="mt-1 text-xs" style={{ color: semantic.danger }}>{newCategoryError}</Text> : null}
                </View>
              ) : null}
            </Field>

            {/* Payment method */}
            <Field label="Paid via" error={errors.payment_method}>
              <View className="flex-row flex-wrap gap-2">
                {EXPENSE_PAYMENT_METHODS.map((m: ExpensePaymentMethod) => (
                  <SelectChip key={m} label={PAYMENT_METHOD_LABELS[m]} active={values.payment_method === m} onPress={() => setField('payment_method', m)} />
                ))}
              </View>
            </Field>

            {/* Date */}
            <Field label="Expense date" error={errors.expense_date} hint={formatDateLong(values.expense_date)}>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={values.expense_date}
                  onChangeText={(t) => setField('expense_date', t)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  className={`${FIELD_CLASS} flex-1`}
                  autoCapitalize="none"
                  accessibilityLabel="Expense date"
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
                  <SelectChip key={q.value} label={q.label} active={values.expense_date === q.value} onPress={() => setField('expense_date', q.value)} small />
                ))}
              </View>
            </Field>

            {/* Payee & reference */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Paid to" error={errors.payee}>
                  <TextInput
                    value={values.payee}
                    onChangeText={(t) => setField('payee', t)}
                    placeholder="Vendor or person"
                    placeholderTextColor={colors.textSecondary}
                    className={FIELD_CLASS}
                    accessibilityLabel="Paid to"
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
                  />
                </Field>
              </View>
            </View>

            {/* Description */}
            <Field label="Description" error={errors.description}>
              <TextInput
                value={values.description}
                onChangeText={(t) => setField('description', t)}
                placeholder="What was this for?"
                placeholderTextColor={colors.textSecondary}
                className={FIELD_CLASS}
                accessibilityLabel="Description"
              />
            </Field>

            {/* Notes */}
            <Field label="Notes" error={errors.notes}>
              <TextInput
                value={values.notes}
                onChangeText={(t) => setField('notes', t)}
                placeholder="Optional internal note"
                placeholderTextColor={colors.textSecondary}
                className={`${FIELD_CLASS} min-h-[72px] py-2`}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Notes"
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
            >
              {submitting ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : null}
              <Text className={`text-sm font-bold text-text-on-primary ${submitting ? 'ml-2' : ''}`}>
                {mode === 'create' ? 'Save expense' : 'Save changes'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoider>

      <DatePickerModal
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        startDate={values.expense_date}
        endDate={values.expense_date}
        onApply={(start) => setField('expense_date', start)}
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
      // The chips wrap in a dense grid, so the 44px target comes from hit slop
      // rather than height.
      hitSlop={small ? 6 : 4}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text className={`text-xs font-bold ${active ? 'text-text-on-primary' : 'text-text-primary'}`}>{label}</Text>
    </Pressable>
  );
}
