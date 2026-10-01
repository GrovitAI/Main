import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, ChevronDown, ChevronUp, Plus, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { useVisualViewport } from '@/lib/pos/use-visual-viewport';
import { centerFieldOnFocus } from '@/lib/pos/web-style';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect';
import type {
  CatalogItem,
  CounterpartySuggestion,
  EntryFormErrors,
  EntryFormValues,
  FinanceAccount,
  FinanceEntryInput,
  FinanceRules,
  LedgerKind,
  LedgerMode,
} from '@/lib/pos/finance-types';
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
  /** The accounts this user may book an entry to. Defaults to all of them. */
  scopeAccounts?: FinanceAccount[];
  catalog: CatalogItem[];
  rules: FinanceRules | null;
  role: UserRole | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit: (input: FinanceEntryInput) => void;
  /** Create mode only: save, then keep the form open with fresh values. */
  onSubmitAndNext?: (input: FinanceEntryInput) => void;
  onClose: () => void;
  /**
   * The short form: amount, how it was paid, what for and who, with the kind
   * already chosen. Everything else sits behind "More details".
   */
  quick?: boolean;
  /** Heading of the short form, such as "Paid a bill". */
  title?: string;
  /** Names to offer under "Paid to / Received from" as the user types. */
  suggestCounterparties?: (query: string) => Promise<CounterpartySuggestion[]>;
  /**
   * Takes the user to Inventory to record a purchase instead. Offered when
   * the category is the one purchases post into, because an entry typed here
   * never reaches stock.
   */
  onRecordPurchase?: () => void;
};

const FIELD_CLASS = 'min-h-[44px] rounded-xl border border-border bg-white px-3 text-sm text-text-primary';

/** Fields the short form keeps folded away; an error in one of them opens the fold. */
const DETAIL_FIELDS: readonly (keyof EntryFormValues)[] = ['account_id', 'transaction_date', 'reference_no', 'notes'];

const SOURCE_HINTS: Record<CounterpartySuggestion['source'], string> = {
  supplier: 'Supplier',
  staff: 'Staff',
  used: 'Used before',
};

export function EntryFormModal({
  visible,
  mode,
  initialValues,
  accounts,
  scopeAccounts,
  catalog,
  rules,
  role,
  submitting,
  serverError,
  onSubmit,
  onSubmitAndNext,
  onClose,
  quick = false,
  title,
  suggestCounterparties,
  onRecordPurchase,
}: EntryFormModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  // On a phone browser the sheet must fit above the keyboard, not the page.
  const { height: visibleHeight } = useVisualViewport();
  const sheetMaxHeight = Math.min(windowHeight, visibleHeight) * 0.92;
  const { isPhone } = useResponsive();
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<EntryFormValues>(initialValues);
  const [errors, setErrors] = useState<EntryFormErrors>({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [duePickerOpen, setDuePickerOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  // The second account picker stays folded away for the everyday case.
  const [payerOpen, setPayerOpen] = useState(false);
  // The short form shows four fields; this unfolds the rest.
  const [detailsOpen, setDetailsOpen] = useState(!quick);
  const [namesOpen, setNamesOpen] = useState(false);
  const [names, setNames] = useState<CounterpartySuggestion[]>([]);

  useEffect(() => {
    if (visible) {
      setValues(initialValues);
      setErrors({});
      setSuggestionsOpen(false);
      setNamesOpen(false);
      setNames([]);
      setPayerOpen(initialValues.paid_from_account_id.length > 0);
      setDetailsOpen(!quick);
    }
  }, [visible, initialValues, quick]);

  const isTransfer = values.kind === 'transfer';
  const isDue = values.kind === 'payable' || values.kind === 'receivable';

  // Names for "Paid to": asked for a moment after the typing stops.
  useEffect(() => {
    if (!visible || !namesOpen || !suggestCounterparties || isTransfer) {
      setNames([]);
      return;
    }
    const query = values.counterparty.trim();
    let cancelled = false;
    const handle = setTimeout(() => {
      void suggestCounterparties(query).then((list) => {
        if (cancelled) return;
        const lower = query.toLowerCase();
        setNames(list.filter((s) => s.name.toLowerCase() !== lower).slice(0, 6));
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [visible, namesOpen, values.counterparty, suggestCounterparties, isTransfer]);

  const setField = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = (andNext = false) => {
    const result = validateEntryForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      // A problem in a folded field must be seen to be fixed.
      if (DETAIL_FIELDS.some((field) => result.errors[field])) setDetailsOpen(true);
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
  const dueBase = /^\d{4}-\d{2}-\d{2}$/.test(values.transaction_date) ? values.transaction_date : today;
  const quickDues: { label: string; value: string }[] = [
    { label: 'In 7 days', value: addDays(dueBase, 7) },
    { label: 'In 15 days', value: addDays(dueBase, 15) },
    { label: 'In 30 days', value: addDays(dueBase, 30) },
    { label: 'No date', value: '' },
  ];

  const isOwner = isFinanceOwner(role);
  const transferAllowed = canTransfer(role, rules);
  const kinds: LedgerKind[] = LEDGER_KINDS.filter((k) => k !== 'transfer' || transferAllowed);

  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts]);
  // "For" is limited to the user's own books; the payer may be any account.
  const forAccounts = useMemo(() => (scopeAccounts ?? accounts).filter((a) => a.is_active), [scopeAccounts, accounts]);
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
    () => forAccounts.map((a) => ({ id: a.id, label: accountLabel(a), hint: a.kind === 'partner' ? 'Partner' : 'Branch' })),
    [forAccounts],
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
  // The short form keeps the kind its button chose; a category never changes it there.
  const followCatalogKind = (prevKind: LedgerKind, kind: LedgerKind | null): LedgerKind =>
    kind && prevKind !== 'transfer' && !quick ? kind : prevKind;

  const pickCategoryOption = (id: string) => {
    const item = catalogById(catalog, id);
    if (!item) return;
    const kind = resolveCatalogKind(catalog, id);
    setValues((prev) => ({
      ...prev,
      category_id: item.level === 'subcategory' ? item.parent_id ?? '' : id,
      subcategory_id: item.level === 'subcategory' ? id : '',
      particular_id: '',
      kind: followCatalogKind(prev.kind, kind),
    }));
  };

  const pickCategory = (id: string) => {
    const kind = resolveCatalogKind(catalog, id);
    setValues((prev) => ({
      ...prev,
      category_id: id,
      subcategory_id: '',
      particular_id: '',
      kind: followCatalogKind(prev.kind, kind),
    }));
  };

  const pickSubcategory = (id: string) => {
    const kind = resolveCatalogKind(catalog, id);
    setValues((prev) => ({
      ...prev,
      subcategory_id: prev.subcategory_id === id ? '' : id,
      particular_id: '',
      kind: followCatalogKind(prev.kind, kind),
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
      kind: quick ? prev.kind : kind ?? prev.kind,
    }));
    setSuggestionsOpen(false);
    setErrors((prev) => ({ ...prev, particulars: undefined }));
  };

  const pickName = (name: string) => {
    setField('counterparty', name);
    setNamesOpen(false);
  };

  const receiving = values.kind === 'income' || values.kind === 'receivable';
  const categoryName = catalogById(catalog, values.subcategory_id || values.category_id)?.name ?? null;

  // ── Fields ────────────────────────────────────────────────────────────────

  const forField = (
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
          {forAccounts.map((a) => (
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
  );

  // Paid from / For: whose cash or bank moved, when it was not the account above.
  const payerField = payerAllowed ? (
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
  ) : null;

  const kindField = (
    <Field label="Kind">
      <View className="flex-row flex-wrap gap-2">
        {kinds.map((k) => (
          <SelectChip key={k} label={LEDGER_KIND_LABELS[k]} active={values.kind === k} onPress={() => pickKind(k)} />
        ))}
      </View>
      {isDue ? (
        <Text className="mt-1.5 text-[11px] text-text-secondary">
          Nothing moves yet: this goes to Outstanding until it is settled.
        </Text>
      ) : null}
    </Field>
  );

  const amountField = (
    <Field label="Amount (₹)" error={errors.amount}>
      <TextInput
        value={values.amount}
        onChangeText={(t) => setField('amount', t)}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textSecondary}
        className={`${FIELD_CLASS} font-extrabold ${isPhone ? 'min-h-[56px] text-3xl' : 'text-2xl'}`}
        // On a desktop a new entry starts at the amount, ready for typing.
        // On a phone the sheet opens at rest, in the app and the browser
        // alike: the keypad would cover half the form before the user has
        // seen it, so they tap the field they want first.
        autoFocus={mode === 'create' && !isPhone}
        accessibilityLabel="Amount"
        onFocus={centerFieldOnFocus}
      />
    </Field>
  );

  const modeField = isTransfer ? (
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
  ) : isDue && quick ? null : (
    <Field label={receiving ? 'Received via' : 'Paid via'}>
      <View className="flex-row gap-2">
        {LEDGER_MODES.map((m: LedgerMode) => (
          <SelectChip key={m} label={LEDGER_MODE_LABELS[m]} active={values.mode === m} onPress={() => setField('mode', m)} />
        ))}
      </View>
      <Text className="mt-1.5 text-[11px] text-text-secondary">UPI and card count as bank.</Text>
    </Field>
  );

  const dateField = (
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
  );

  // When it is to be paid or collected. Only something still owed has one.
  const dueField = isDue ? (
    <Field
      label={values.kind === 'payable' ? 'Pay by' : 'Collect by'}
      error={errors.due_date}
      hint={values.due_date ? formatDateLong(values.due_date) : 'Optional. Outstanding shows what is overdue and what falls due this week.'}
    >
      <View className="flex-row items-center gap-2">
        <TextInput
          value={values.due_date}
          onChangeText={(t) => setField('due_date', t)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textSecondary}
          className={`${FIELD_CLASS} flex-1`}
          autoCapitalize="none"
          accessibilityLabel="Due date"
          onFocus={centerFieldOnFocus}
        />
        <Pressable
          onPress={() => setDuePickerOpen(true)}
          className="h-[44px] w-[44px] items-center justify-center rounded-xl border border-border bg-white"
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Pick a due date"
        >
          <Calendar size={18} color={colors.primary} />
        </Pressable>
      </View>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {quickDues.map((q) => (
          <SelectChip key={q.label} label={q.label} active={values.due_date === q.value} onPress={() => setField('due_date', q.value)} small />
        ))}
      </View>
    </Field>
  ) : null;

  // Particulars, with the catalog offering matches as you type.
  const particularsField = (
    <Field
      label="Particulars"
      error={errors.particulars}
      hint={isTransfer ? undefined : quick && categoryName ? `Category: ${categoryName}` : 'Type two letters to pick from the catalog, or write your own.'}
    >
      <TextInput
        value={values.particulars}
        onChangeText={(t) => {
          setValues((prev) => ({ ...prev, particulars: t, particular_id: '' }));
          setSuggestionsOpen(true);
          setNamesOpen(false);
          if (errors.particulars) setErrors((prev) => ({ ...prev, particulars: undefined }));
        }}
        onFocus={(e) => {
          centerFieldOnFocus(e);
          setSuggestionsOpen(true);
          setNamesOpen(false);
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
  );

  const categoryFields = isTransfer ? null : isPhone ? (
    <Field label="Category" hint="Sub-categories sit under their category; type a few letters to jump to one.">
      <SearchSelect
        value={values.subcategory_id || values.category_id || null}
        options={categoryOptions}
        placeholder="Pick a category"
        onChange={pickCategoryOption}
        accessibilityLabel="Category"
      />
    </Field>
  ) : (
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
  );

  // Raw materials belong in Inventory: a purchase there raises stock and
  // writes this entry itself. Typed here, the money is recorded but the stock
  // and the costing never hear of it.
  const isPurchaseCategory = catalogById(catalog, values.category_id)?.system_key === 'purchases';
  const purchaseNudge =
    onRecordPurchase && mode === 'create' && isPurchaseCategory && (values.kind === 'expense' || values.kind === 'payable') ? (
      <View className="mb-4 rounded-xl px-3 py-2" style={{ backgroundColor: semantic.warningSoft }}>
        <Text className="text-xs font-semibold" style={{ color: semantic.warning }}>
          Raw materials are recorded as a purchase in Inventory: stock goes up and this entry is written for you. Typed here, it never reaches stock.
        </Text>
        <Pressable
          onPress={onRecordPurchase}
          className="mt-2 min-h-[40px] items-center justify-center self-start rounded-xl border border-primary bg-white px-3"
          hitSlop={2}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Record as a purchase in Inventory"
        >
          <Text className="text-xs font-bold text-primary">Record as a purchase instead</Text>
        </Pressable>
      </View>
    ) : null;

  // Who was paid or who paid, with the names already known offered as you type
  // so one vendor stays one name.
  const counterpartyField = isTransfer ? null : (
    <Field label={receiving ? 'Received from' : 'Paid to'} error={errors.counterparty}>
      <TextInput
        value={values.counterparty}
        onChangeText={(t) => {
          setField('counterparty', t);
          setNamesOpen(true);
          setSuggestionsOpen(false);
        }}
        onFocus={(e) => {
          centerFieldOnFocus(e);
          setNamesOpen(true);
          setSuggestionsOpen(false);
        }}
        placeholder="Vendor or person"
        placeholderTextColor={colors.textSecondary}
        className={FIELD_CLASS}
        accessibilityLabel="Counterparty"
      />
      {namesOpen && names.length > 0 ? (
        <View className="mt-1 overflow-hidden rounded-xl border border-border bg-white">
          {names.map((n) => (
            <Pressable
              key={n.name}
              onPress={() => pickName(n.name)}
              className="min-h-[44px] flex-row items-center justify-between border-b border-border-soft px-3"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Use ${n.name}`}
            >
              <Text className="flex-1 text-sm font-semibold text-text-primary" numberOfLines={1}>{n.name}</Text>
              <Text className="ml-2 text-[11px] text-text-secondary" numberOfLines={1}>
                {n.source === 'used' && n.uses > 0 ? `Used ${n.uses}×` : SOURCE_HINTS[n.source]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Field>
  );

  const referenceField = isTransfer ? null : (
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
  );

  const notesField = (
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
  );

  const heading = title ?? (mode === 'create' ? 'Record an entry' : 'Edit entry');
  const subheading = quick
    ? `For ${forName} · ${formatDateLong(values.transaction_date)}`
    : 'Amounts in rupees. Who recorded it and when is kept automatically.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider>
      {/* A sheet from the bottom on phones, a centred dialog elsewhere. */}
      <Pressable className={`flex-1 bg-black/40 ${isPhone ? 'justify-end' : 'items-center justify-center px-4'}`} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          className={`w-full overflow-hidden bg-white shadow-panel ${isPhone ? 'rounded-t-3xl' : 'max-w-[600px] rounded-3xl'}`}
          style={{ maxHeight: sheetMaxHeight }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-border-soft px-5 py-4">
            <View className="flex-1 pr-2">
              <Text className="text-base font-bold text-text-primary">{heading}</Text>
              <Text className="text-xs text-text-secondary" numberOfLines={2}>{subheading}</Text>
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
            {quick ? (
              <>
                {amountField}
                {modeField}
                {particularsField}
                {purchaseNudge}
                {counterpartyField}
                {dueField}
                <Pressable
                  onPress={() => setDetailsOpen((open) => !open)}
                  className="mb-4 min-h-[44px] flex-row items-center justify-between rounded-xl border border-border bg-white px-3"
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={detailsOpen ? 'Hide more details' : 'Show more details'}
                  accessibilityState={{ expanded: detailsOpen }}
                >
                  <Text className="text-xs font-bold text-primary">
                    {detailsOpen ? 'Fewer details' : 'More details: account, date, category, reference, notes'}
                  </Text>
                  {detailsOpen ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.primary} />}
                </Pressable>
                {detailsOpen ? (
                  <>
                    {forField}
                    {payerField}
                    {dateField}
                    {categoryFields}
                    {referenceField}
                    {notesField}
                  </>
                ) : null}
              </>
            ) : (
              <>
                {forField}
                {payerField}
                {kindField}
                {amountField}
                {modeField}
                {dateField}
                {dueField}
                {particularsField}
                {categoryFields}
                {purchaseNudge}
                {counterpartyField}
                {referenceField}
                {notesField}
              </>
            )}

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
      <DatePickerModal
        visible={duePickerOpen}
        onClose={() => setDuePickerOpen(false)}
        startDate={values.due_date || dueBase}
        endDate={values.due_date || dueBase}
        mode="single"
        onApply={(start) => setField('due_date', start)}
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
