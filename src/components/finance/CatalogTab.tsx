import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Pencil, Plus, Sparkles, X } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type { CatalogItem, CatalogKind, CatalogLevel } from '@/lib/pos/finance-types';
import {
  CATALOG_LEVEL_LABELS,
  LEDGER_KIND_LABELS,
  catalogById,
  catalogSiblings,
  isFinanceOwner,
  nextSortOrder,
  resolveCatalogKind,
  validateCatalogName,
} from '@/lib/pos/finance-ledger-utils';
import { useLedgerStore } from '@/lib/pos/use-ledger-store';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { FinanceEmptyView, FinanceErrorView, FinanceLoadingView, financeContentPadding } from './FinanceStateViews';

type Props = { compact?: boolean };

const KINDS: CatalogKind[] = ['income', 'expense', 'payable', 'receivable'];

type ItemForm = {
  mode: 'add' | 'edit';
  level: CatalogLevel;
  parentId: string | null;
  /** The item being edited. */
  item: CatalogItem | null;
  name: string;
  /** '' inherits from the parent (never for a category). */
  kind: CatalogKind | '';
};

/**
 * Finance → Catalog: categories, sub-categories and particulars, the tree the
 * entry form offers as you type. Owners add, rename, hide and reorder;
 * nothing is deleted, so old entries keep their names. On a desktop the three
 * levels sit side by side; a phone drills down one level at a time.
 */
export function CatalogTab({ compact = false }: Props) {
  const session = useSessionStore((s) => s.session);
  const isOwner = isFinanceOwner(session?.role);

  const initialized = useLedgerStore((s) => s.initialized);
  const initialize = useLedgerStore((s) => s.initialize);
  const initError = useLedgerStore((s) => s.initError);
  const catalog = useLedgerStore((s) => s.catalog);
  const mutating = useLedgerStore((s) => s.mutating);
  const freeText = useLedgerStore((s) => s.freeText);
  const freeTextLoading = useLedgerStore((s) => s.freeTextLoading);
  const addCatalogItem = useLedgerStore((s) => s.addCatalogItem);
  const changeCatalogItem = useLedgerStore((s) => s.changeCatalogItem);
  const moveCatalogItem = useLedgerStore((s) => s.moveCatalogItem);
  const loadFreeText = useLedgerStore((s) => s.loadFreeText);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // On a phone, which level is on screen.
  const [phoneLevel, setPhoneLevel] = useState<CatalogLevel>('category');

  useEffect(() => {
    if (session) void initialize();
  }, [session, initialize]);

  const categories = useMemo(() => catalogSiblings(catalog, null), [catalog]);
  const subcategories = useMemo(() => (categoryId ? catalogSiblings(catalog, categoryId) : []), [catalog, categoryId]);
  const particulars = useMemo(() => (subcategoryId ? catalogSiblings(catalog, subcategoryId) : []), [catalog, subcategoryId]);
  const category = catalogById(catalog, categoryId);
  const subcategory = catalogById(catalog, subcategoryId);

  // A selection that no longer exists (after a reload) falls back.
  useEffect(() => {
    if (categoryId && !category) setCategoryId(null);
    if (subcategoryId && !subcategory) setSubcategoryId(null);
  }, [categoryId, category, subcategoryId, subcategory]);

  useEffect(() => {
    void loadFreeText(subcategoryId ? categoryId : null, subcategoryId);
  }, [categoryId, subcategoryId, loadFreeText]);

  const pickCategory = (id: string) => {
    setCategoryId(id);
    setSubcategoryId(null);
    if (compact) setPhoneLevel('subcategory');
  };
  const pickSubcategory = (id: string) => {
    setSubcategoryId(id);
    if (compact) setPhoneLevel('particular');
  };

  const openAdd = (level: CatalogLevel, parentId: string | null, prefill = '') => {
    setFormError(null);
    setForm({ mode: 'add', level, parentId, item: null, name: prefill, kind: level === 'category' ? 'expense' : '' });
  };
  const openEdit = (item: CatalogItem) => {
    setFormError(null);
    setForm({ mode: 'edit', level: item.level, parentId: item.parent_id, item, name: item.name, kind: item.default_kind ?? '' });
  };

  const submitForm = async () => {
    if (!form) return;
    const siblings = catalogSiblings(catalog, form.parentId);
    const nameError = validateCatalogName(form.name, siblings, form.item?.id ?? null);
    if (nameError) {
      setFormError(nameError);
      return;
    }
    if (form.level === 'category' && !form.kind) {
      setFormError('A category needs a kind, so every entry under it starts with one.');
      return;
    }
    const kind = form.kind === '' ? null : form.kind;
    const result =
      form.mode === 'add'
        ? await addCatalogItem({ level: form.level, parent_id: form.parentId, name: form.name.trim(), default_kind: kind, sort_order: nextSortOrder(siblings) })
        : form.item
          ? await changeCatalogItem(form.item.id, { name: form.name.trim(), default_kind: kind })
          : { ok: false as const, error: 'Nothing to save.' };
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setForm(null);
  };

  const toggleActive = async (item: CatalogItem) => {
    setActionError(null);
    const result = await changeCatalogItem(item.id, { is_active: !item.is_active });
    if (!result.ok) setActionError(result.error);
  };
  const move = async (item: CatalogItem, direction: 'up' | 'down') => {
    setActionError(null);
    const result = await moveCatalogItem(item.id, direction);
    if (!result.ok) setActionError(result.error);
  };

  const inheritedKind = (item: CatalogItem): string => {
    if (item.default_kind) return LEDGER_KIND_LABELS[item.default_kind];
    const resolved = resolveCatalogKind(catalog, item.id);
    return resolved ? `${LEDGER_KIND_LABELS[resolved]} (inherited)` : '—';
  };

  const renderRow = useCallback(
    (item: CatalogItem, siblings: CatalogItem[], selected: boolean, onOpen?: () => void) => {
      const index = siblings.findIndex((s) => s.id === item.id);
      const locked = item.is_system;
      return (
        <View
          className={`mb-2 flex-row items-center rounded-2xl border bg-white ${compact ? 'p-2.5' : 'px-3 py-2'} ${selected ? 'border-primary' : 'border-border/60'} ${item.is_active ? '' : 'opacity-60'}`}
        >
          <Pressable
            onPress={onOpen}
            disabled={!onOpen}
            className="min-h-[44px] flex-1 flex-row items-center pr-2"
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole={onOpen ? 'button' : undefined}
            accessibilityLabel={onOpen ? `Open ${item.name}` : item.name}
          >
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-sm font-bold text-text-primary" numberOfLines={1}>{item.name}</Text>
                {locked ? <View className="ml-1.5"><Lock size={12} color={colors.textSecondary} /></View> : null}
                {!item.is_active ? (
                  <Text className="ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: semantic.neutralSoft, color: semantic.neutral }}>Hidden</Text>
                ) : null}
              </View>
              <Text className="text-[11px] text-text-secondary" numberOfLines={1}>{inheritedKind(item)}</Text>
            </View>
            {onOpen ? <ChevronRight size={16} color={colors.textSecondary} /> : null}
          </Pressable>
          {isOwner && !locked ? (
            <View className="flex-row items-center">
              <IconButton label={`Move ${item.name} up`} disabled={index <= 0 || mutating} onPress={() => void move(item, 'up')}>
                <ArrowUp size={15} color={colors.textSecondary} />
              </IconButton>
              <IconButton label={`Move ${item.name} down`} disabled={index >= siblings.length - 1 || mutating} onPress={() => void move(item, 'down')}>
                <ArrowDown size={15} color={colors.textSecondary} />
              </IconButton>
              <IconButton label={`Rename ${item.name}`} disabled={mutating} onPress={() => openEdit(item)}>
                <Pencil size={15} color={colors.primary} />
              </IconButton>
              <IconButton label={item.is_active ? `Hide ${item.name}` : `Show ${item.name}`} disabled={mutating} onPress={() => void toggleActive(item)}>
                {item.is_active ? <EyeOff size={15} color={colors.textSecondary} /> : <Eye size={15} color={semantic.success} />}
              </IconButton>
            </View>
          ) : null}
        </View>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compact, isOwner, mutating, catalog],
  );

  if (!initialized) return initError ? <FinanceErrorView message={initError} /> : <FinanceLoadingView label="Loading the catalog…" />;

  const columnHeader = (level: CatalogLevel, parent: CatalogItem | null, count: number, canAdd: boolean, parentId: string | null) => (
    <View className="mb-2 flex-row items-center justify-between">
      <View className="flex-1 pr-2">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-text-secondary" numberOfLines={1}>
          {level === 'category' ? 'Categories' : level === 'subcategory' ? 'Sub-categories' : 'Particulars'}
          {parent ? ` of ${parent.name}` : ''}
        </Text>
        <Text className="text-[11px] text-text-secondary">{count === 0 ? 'None yet' : `${count} ${count === 1 ? 'item' : 'items'}`}</Text>
      </View>
      {isOwner && canAdd ? (
        <Pressable
          onPress={() => openAdd(level, parentId)}
          disabled={mutating}
          className="min-h-[40px] flex-row items-center justify-center rounded-xl bg-primary px-3"
          style={({ pressed }) => [{ opacity: pressed || mutating ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`Add a ${CATALOG_LEVEL_LABELS[level].toLowerCase()}`}
        >
          <Plus size={14} color={colors.textOnPrimary} />
          <Text className="ml-1 text-xs font-bold text-text-on-primary">Add</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const emptyFor = (level: CatalogLevel, parent: CatalogItem | null) =>
    level === 'category' ? (
      <FinanceEmptyView title="No categories yet" subtitle="Add the first category; sub-categories and particulars hang off it." />
    ) : !parent ? (
      <Text className="py-6 text-center text-xs text-text-secondary">
        {level === 'subcategory' ? 'Pick a category to see its sub-categories.' : 'Pick a sub-category to see its particulars.'}
      </Text>
    ) : (
      <Text className="py-6 text-center text-xs text-text-secondary">
        {level === 'subcategory' ? `No sub-categories under ${parent.name} yet.` : `No particulars under ${parent.name} yet.`}
      </Text>
    );

  // Free-text particulars typed under the selected sub-category: one tap
  // promotes each into the catalog so the next entry autofills.
  const suggestionsBlock =
    subcategory && isOwner ? (
      <View className="mt-2 rounded-2xl border border-dashed border-border bg-surface-tint px-3 py-2">
        <View className="flex-row items-center">
          <Sparkles size={13} color={colors.primary} />
          <Text className="ml-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">From recent entries</Text>
        </View>
        {freeTextLoading ? (
          <FinanceLoadingView inline label="Looking…" />
        ) : freeText.filter((f) => !particulars.some((p) => p.name.toLowerCase() === f.name.toLowerCase())).length === 0 ? (
          <Text className="mt-1 text-[11px] text-text-secondary">Nothing typed by hand under {subcategory.name} that is not already here.</Text>
        ) : (
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {freeText
              .filter((f) => !particulars.some((p) => p.name.toLowerCase() === f.name.toLowerCase()))
              .map((f) => (
                <Pressable
                  key={f.name}
                  onPress={() => openAdd('particular', subcategory.id, f.name)}
                  className="min-h-[36px] flex-row items-center rounded-full border border-primary bg-white px-3"
                  hitSlop={4}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${f.name} as a particular`}
                >
                  <Plus size={12} color={colors.primary} />
                  <Text className="ml-1 text-xs font-bold text-primary" numberOfLines={1}>{f.name}</Text>
                  <Text className="ml-1 text-[11px] text-text-secondary">×{f.count}</Text>
                </Pressable>
              ))}
          </View>
        )}
      </View>
    ) : null;

  const categoryList = (
    <FlatList
      data={categories}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderRow(item, categories, item.id === categoryId, () => pickCategory(item.id))}
      ListHeaderComponent={columnHeader('category', null, categories.length, true, null)}
      ListEmptyComponent={emptyFor('category', null)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
  const subcategoryList = (
    <FlatList
      data={subcategories}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderRow(item, subcategories, item.id === subcategoryId, () => pickSubcategory(item.id))}
      ListHeaderComponent={columnHeader('subcategory', category, subcategories.length, category !== null && !category.is_system, categoryId)}
      ListEmptyComponent={emptyFor('subcategory', category)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
  const particularList = (
    <FlatList
      data={particulars}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderRow(item, particulars, false)}
      ListHeaderComponent={columnHeader('particular', subcategory, particulars.length, subcategory !== null && !subcategory.is_system, subcategoryId)}
      ListEmptyComponent={emptyFor('particular', subcategory)}
      ListFooterComponent={suggestionsBlock}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );

  const notices = (
    <>
      {!isOwner ? (
        <Text className="mb-2 text-[11px] text-text-secondary">The catalog is managed by the owner. Entries can still use every item shown here.</Text>
      ) : null}
      {actionError ? <View className="mb-2"><FinanceErrorView message={actionError} compact /></View> : null}
    </>
  );

  const body = compact ? (
    <View className="flex-1">
      {/* Breadcrumb: where the phone is in the tree, each part a step back */}
      <View className="mb-2 flex-row items-center">
        {phoneLevel !== 'category' ? (
          <Pressable
            onPress={() => setPhoneLevel(phoneLevel === 'particular' ? 'subcategory' : 'category')}
            className="mr-1 h-[44px] w-[44px] items-center justify-center rounded-full"
            hitSlop={4}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={20} color={colors.primary} />
          </Pressable>
        ) : null}
        <Text className="flex-1 text-xs font-bold text-text-primary" numberOfLines={1}>
          {phoneLevel === 'category' ? 'All categories' : phoneLevel === 'subcategory' ? category?.name ?? '' : `${category?.name ?? ''} › ${subcategory?.name ?? ''}`}
        </Text>
      </View>
      {notices}
      {phoneLevel === 'category' ? categoryList : phoneLevel === 'subcategory' ? subcategoryList : particularList}
    </View>
  ) : (
    <View className="flex-1">
      {notices}
      <View className="flex-1 flex-row gap-3">
        <View className="flex-1">{categoryList}</View>
        <View className="flex-1">{subcategoryList}</View>
        <View className="flex-1">{particularList}</View>
      </View>
    </View>
  );

  return (
    <View className="flex-1" style={financeContentPadding(compact)}>
      {body}
      <ItemFormModal form={form} error={formError} submitting={mutating} parentName={form ? catalogById(catalog, form.parentId)?.name ?? null : null} onChange={setForm} onSubmit={() => void submitForm()} onClose={() => setForm(null)} />
    </View>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

type IconButtonProps = { label: string; disabled?: boolean; onPress: () => void; children: React.ReactNode };

function IconButton({ label, disabled = false, onPress, children }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="h-[44px] w-[40px] items-center justify-center"
      hitSlop={2}
      style={({ pressed }) => [{ opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      {children}
    </Pressable>
  );
}

type ItemFormModalProps = {
  form: ItemForm | null;
  error: string | null;
  submitting: boolean;
  parentName: string | null;
  onChange: (form: ItemForm) => void;
  onSubmit: () => void;
  onClose: () => void;
};

function ItemFormModal({ form, error, submitting, parentName, onChange, onSubmit, onClose }: ItemFormModalProps) {
  const insets = useSafeAreaInsets();
  if (!form) return null;
  const levelLabel = CATALOG_LEVEL_LABELS[form.level];
  const title = form.mode === 'add' ? `Add a ${levelLabel.toLowerCase()}` : `Change ${form.item?.name ?? levelLabel.toLowerCase()}`;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoider>
        <Pressable className="flex-1 items-center justify-center bg-black/40 px-4" onPress={onClose}>
          <Pressable onPress={() => undefined} className="w-full max-w-[460px] rounded-3xl bg-white shadow-panel" style={{ paddingBottom: Math.max(0, insets.bottom - 12) }}>
            <View className="flex-row items-center justify-between border-b border-border-soft px-5 py-4">
              <View className="flex-1 pr-2">
                <Text className="text-base font-bold text-text-primary">{title}</Text>
                {parentName ? <Text className="text-xs text-text-secondary">Under {parentName}</Text> : null}
              </View>
              <Pressable onPress={onClose} className="h-[44px] w-[44px] items-center justify-center rounded-full" style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView className="px-5 py-4" keyboardShouldPersistTaps="handled">
              <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Name</Text>
              <TextInput
                value={form.name}
                onChangeText={(t) => onChange({ ...form, name: t })}
                placeholder={form.level === 'category' ? 'e.g. Utilities' : form.level === 'subcategory' ? 'e.g. Electricity' : 'e.g. EB bill — Central Kitchen'}
                placeholderTextColor={colors.textSecondary}
                className="min-h-[44px] rounded-xl border border-border bg-white px-3 text-sm text-text-primary"
                autoFocus
                onSubmitEditing={onSubmit}
                accessibilityLabel={`${levelLabel} name`}
              />
              <Text className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-text-secondary">Kind</Text>
              <View className="flex-row flex-wrap gap-2">
                {form.level !== 'category' ? (
                  <KindChip label="Same as parent" active={form.kind === ''} onPress={() => onChange({ ...form, kind: '' })} />
                ) : null}
                {KINDS.map((k) => (
                  <KindChip key={k} label={LEDGER_KIND_LABELS[k]} active={form.kind === k} onPress={() => onChange({ ...form, kind: k })} />
                ))}
              </View>
              <Text className="mt-1.5 text-[11px] text-text-secondary">
                The kind an entry starts with when this is picked. It can still be changed on the entry.
              </Text>
              {error ? (
                <View className="mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: semantic.dangerSoft }}>
                  <Text className="text-xs font-semibold" style={{ color: semantic.danger }}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>
            <View className="flex-row items-center justify-end gap-2 border-t border-border-soft px-5 py-3">
              <Pressable onPress={onClose} disabled={submitting} className="min-h-[44px] items-center justify-center rounded-xl border border-border px-4" style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]} accessibilityRole="button">
                <Text className="text-sm font-bold text-text-secondary">Cancel</Text>
              </Pressable>
              <Pressable onPress={onSubmit} disabled={submitting} className="min-h-[44px] min-w-[120px] flex-row items-center justify-center rounded-xl bg-primary px-5" style={({ pressed }) => [{ opacity: pressed || submitting ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel={form.mode === 'add' ? 'Add' : 'Save'}>
                {submitting ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : null}
                <Text className={`text-sm font-bold text-text-on-primary ${submitting ? 'ml-2' : ''}`}>{form.mode === 'add' ? 'Add' : 'Save'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}

type KindChipProps = { label: string; active: boolean; onPress: () => void };

function KindChip({ label, active, onPress }: KindChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`min-h-[36px] items-center justify-center rounded-full border px-3.5 ${active ? 'border-primary bg-primary' : 'border-border bg-white'}`}
      hitSlop={4}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text className={`text-xs font-bold ${active ? 'text-text-on-primary' : 'text-text-primary'}`}>{label}</Text>
    </Pressable>
  );
}
