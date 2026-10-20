import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { confirmAction } from '@/lib/pos/dialogs';
import { addProduct, archiveProduct, fetchActiveProducts, toggleProductAvailability, updateProduct, type MenuProduct } from '@/lib/pos/menu-service';
import { addCategory, getCategories, type Category } from '@/lib/pos/products-service';
import { fetchRecipes, type InventoryRecipe } from '@/lib/pos/inventory-service';
import { ALL_CATEGORIES, countByCategory, filterMenu, menuPrice } from '@/lib/pos/menu-utils';
import { Card, Empty, KHeader, LinkButton, Notice, PrimaryButton, ScrollPills, SearchBox, Sheet, Skeleton, Toast, usePresence } from '@/components/kitchen/ui';
import { CARD_HEIGHT, MenuCard } from './MenuCard';
import { MenuItemEditor, MenuQuickBody, NewCategory, type MenuItemInput } from './MenuEditor';
import { CAN_IMPORT, MenuImportSheet } from './MenuImportSheet';

/** From this width the editor slides in over the right of the page; narrower screens use a sheet. */
const PANEL_FROM = 900;
const PANEL_WIDTH = 340;
const GAP = 12;
/** A card is never narrower than this on a laptop, so names keep two short lines. */
const MIN_CARD = 190;
const TOAST_MS = 2200;

/** What the editor is open on: an item, or a new one. */
type Editing = { id: string } | { id: null } | null;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Changes whenever the item's saved fields do, so an open editor starts again from them. */
const editorKey = (p: MenuProduct | null) => (p ? [p.id, p.name, p.price, p.is_available, p.category_id, p.recipe_id].join('|') : 'new');

/**
 * The menu (task 276, owner's pick C): the items as cards, the same as on the till. Tap a card
 * for everything about it. A phone holds a card for the quick sheet (price and on sale); a laptop
 * shows those two on the card under the pointer, keeps the categories on the left and opens the
 * editor beside the grid. Import from Excel lives behind a link on a laptop.
 */
export function MenuBoard() {
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { width } = useWindowDimensions();
  const panel = !isPhone && width >= PANEL_FROM;

  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickDirty, setQuickDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Handlers read the latest items through a ref, so the cards' callbacks never change.
  const productsRef = useRef(products);
  productsRef.current = products;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true); else setLoading(true);
    const [prod, cats, recs] = await Promise.all([fetchActiveProducts(), getCategories(), fetchRecipes()]);
    if (prod.data) setProducts(prod.data);
    if (cats.data) setCategories(cats.data);
    if (recs.data) setRecipes(recs.data);
    setLoadError(prod.error || cats.error ? 'The menu could not load. Check the connection.' : null);
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const replace = (next: MenuProduct) => setProducts((list) => list.map((p) => (p.id === next.id ? next : p)));
  const patch = (id: string, fields: Partial<MenuProduct>) => setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...fields } : p)));

  /** On sale or sold out, at once; put back if the server says no. */
  const toggle = useCallback(async (id: string, next: boolean) => {
    const item = productsRef.current.find((p) => p.id === id);
    if (!item) return;
    patch(id, { is_available: next });
    const res = await toggleProductAvailability(id, next);
    if (res.error) {
      patch(id, { is_available: item.is_available });
      say(`${item.name} did not change. Try again.`);
      return;
    }
    say(next ? `${item.name} on sale` : `${item.name} sold out`);
  }, [say]);

  /** A new price, keeping everything else the item has. */
  const savePrice = useCallback(async (id: string, price: number): Promise<boolean> => {
    const item = productsRef.current.find((p) => p.id === id);
    if (!item) return false;
    const res = await updateProduct(id, {
      name: item.name, price, category_id: item.category_id, is_available: item.is_available,
      inventory_tracking_enabled: item.inventory_tracking_enabled ?? false, recipe_id: item.recipe_id ?? null,
    }, { previousName: item.name });
    if (!res.data) { say(res.error ?? 'The price did not save. Try again.'); return false; }
    replace(res.data);
    say(`${item.name} ${menuPrice(price)}`);
    return true;
  }, [say]);

  const editingProduct = editing?.id ? products.find((p) => p.id === editing.id) ?? null : null;
  const quickProduct = quickId ? products.find((p) => p.id === quickId) ?? null : null;
  // An item removed from under the editor closes it.
  useEffect(() => { if (editing?.id && !editingProduct && !loading) setEditing(null); }, [editing, editingProduct, loading]);

  /** Leaves the open item, asking first when it has changes that were not saved. */
  const leaveEditor = useCallback((next: () => void) => {
    if (!editorDirty) { next(); return; }
    confirmAction('Discard the changes?', 'What you changed on this item is not saved.', 'Discard', () => { setEditorDirty(false); next(); });
  }, [editorDirty]);

  const openCard = useCallback((id: string) => {
    if (editing?.id === id) return;
    leaveEditor(() => setEditing({ id }));
  }, [editing, leaveEditor]);
  const holdCard = useCallback((id: string) => setQuickId(id), []);
  const newItem = () => leaveEditor(() => setEditing({ id: null }));
  const closeEditor = () => leaveEditor(() => setEditing(null));

  const saveItem = async (input: MenuItemInput): Promise<string | null> => {
    const item = editingProduct;
    if (item) {
      const res = await updateProduct(item.id, { ...input, inventory_tracking_enabled: item.inventory_tracking_enabled ?? false }, { previousName: item.name });
      if (!res.data) return res.error ?? 'Not saved. Try again.';
      replace(res.data);
      say('Saved');
    } else {
      const res = await addProduct({ ...input, inventory_tracking_enabled: false });
      if (!res.data) return res.error ?? 'Not added. Try again.';
      const added = res.data;
      setProducts((list) => [...list, added].sort(byName));
      say(`${added.name} added`);
      if (panel) { setEditorDirty(false); setEditing({ id: added.id }); return null; }
    }
    setEditorDirty(false);
    if (!panel) setEditing(null);
    return null;
  };

  const removeItem = () => {
    const item = editingProduct;
    if (!item) return;
    confirmAction(`Remove ${item.name}?`, 'It comes off the till menu.', 'Remove', () => {
      void archiveProduct(item.id).then((res) => {
        if (res.error) { say(res.error); return; }
        setEditorDirty(false);
        setEditing(null);
        setProducts((list) => list.filter((p) => p.id !== item.id));
        say(`${item.name} removed`);
      });
    });
  };

  const newCategory = useCallback(async (name: string): Promise<Category | string> => {
    const same = categories.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (same) return same;
    const res = await addCategory(name);
    if (!res.data) return res.error ?? 'Not added. Try again.';
    const made = res.data;
    setCategories((list) => [...list, made].sort(byName));
    return made;
  }, [categories]);

  const counts = useMemo(() => countByCategory(products), [products]);
  const shown = useMemo(() => filterMenu(products, categories, categoryId, query), [products, categories, categoryId, query]);
  const categoryName = useCallback((id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? null : null), [categories]);

  // Laptop columns follow the grid's width; the last row is filled out so its cards keep their size.
  const cols = isPhone ? 2 : Math.max(2, Math.min(5, Math.floor((gridWidth + GAP) / (MIN_CARD + GAP))));
  const cells = useMemo<(MenuProduct | null)[]>(() => {
    const rest = shown.length % cols;
    return rest === 0 ? shown : [...shown, ...Array<null>(cols - rest).fill(null)];
  }, [shown, cols]);
  const selectedId = panel ? editing?.id ?? null : null;

  const renderCell = useCallback(({ item }: { item: MenuProduct | null }) => (
    item ? (
      <MenuCard product={item} selected={item.id === selectedId} quick={!isPhone} onOpen={openCard} onHold={isPhone ? holdCard : undefined} onToggle={toggle} onSavePrice={savePrice} />
    ) : <View style={{ flex: 1 }} />
  ), [selectedId, isPhone, openCard, holdCard, toggle, savePrice]);

  const empty = loading ? (
    <View style={{ gap: GAP }} accessible accessibilityRole="progressbar" accessibilityLabel="Loading the menu">
      {[0, 1, 2].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap: GAP }}>
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} height={CARD_HEIGHT} style={{ flex: 1, borderRadius: 18 }} />)}
        </View>
      ))}
    </View>
  ) : loadError ? null : query.trim() ? (
    <Empty title={`Nothing matches “${query.trim()}”`} />
  ) : (
    <Empty title="No items here yet" action={<PrimaryButton label="New item" icon={Plus} onPress={newItem} />} />
  );

  const errorNotice = loadError ? <Notice text={loadError} action={<LinkButton label="Try again" onPress={() => void load()} />} /> : null;

  const grid = (
    <FlatList
      key={`cols-${cols}`}
      data={loading ? [] : cells}
      numColumns={cols}
      keyExtractor={(item, i) => item?.id ?? `fill-${i}`}
      renderItem={renderCell}
      extraData={selectedId}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={{ gap: GAP, paddingBottom: 120, ...(isPhone ? { paddingHorizontal: 16 } : {}) }}
      ListEmptyComponent={empty}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={isPhone ? <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.primary} /> : undefined}
    />
  );

  const editor = (
    <MenuItemEditor
      key={editorKey(editingProduct)}
      product={editingProduct}
      categories={categories}
      recipes={recipes}
      initialCategoryId={categoryId === ALL_CATEGORIES ? '' : categoryId}
      onSave={saveItem}
      onRemove={removeItem}
      onAddCategory={newCategory}
      onDirtyChange={setEditorDirty}
      panel={panel}
    />
  );
  const editorTitle = editingProduct?.name ?? 'New item';
  // While the drawer slides out it keeps showing the item it closed on.
  const drawer = usePresence(panel && editing !== null, 220);
  const lastDrawerBody = useRef<React.ReactNode>(null);
  if (editing) {
    lastDrawerBody.current = (
      <>
        <View className="mb-1 flex-row items-center gap-2">
          <Text accessibilityRole="header" className="min-w-0 flex-1 text-xl font-bold text-text-primary" numberOfLines={2}>{editorTitle}</Text>
          <Pressable onPress={closeEditor} accessibilityRole="button" accessibilityLabel="Close" className="h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-tint active:bg-surface-tint">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        {editor}
      </>
    );
  }
  const drawerBody = lastDrawerBody.current;
  // Phones and narrow laptops edit in a sheet; a sheet guards its own unsaved changes.
  const editorSheet = !panel ? (
    <Sheet visible={editing !== null} onClose={() => { setEditorDirty(false); setEditing(null); }} title={editorTitle} dirty={editorDirty}>{editor}</Sheet>
  ) : null;

  const sheets = (
    <>
      {editorSheet}
      <Sheet visible={quickProduct !== null} onClose={() => { setQuickDirty(false); setQuickId(null); }} title={quickProduct?.name ?? ''} dirty={quickDirty}>
        {quickProduct ? (
          <MenuQuickBody
            key={quickProduct.id}
            product={quickProduct}
            categoryName={categoryName(quickProduct.category_id)}
            onToggle={(next) => void toggle(quickProduct.id, next)}
            onSavePrice={async (price) => { const ok = await savePrice(quickProduct.id, price); if (ok) { setQuickDirty(false); setQuickId(null); } return ok; }}
            onEdit={() => { const id = quickProduct.id; setQuickDirty(false); setQuickId(null); setEditing({ id }); }}
            onDirtyChange={setQuickDirty}
          />
        ) : null}
      </Sheet>
      {CAN_IMPORT && !isPhone ? (
        <MenuImportSheet visible={importOpen} onClose={() => setImportOpen(false)} products={products}
          onImported={(count) => { setImportOpen(false); say(`${count} ${count === 1 ? 'item' : 'items'} imported`); void load(); }} />
      ) : null}
      <Toast text={toast} />
    </>
  );

  const categoryOptions = useMemo(() => [
    { value: ALL_CATEGORIES, label: 'All', count: counts[ALL_CATEGORIES] ?? 0 },
    ...categories.map((c) => ({ value: c.id, label: c.name, count: counts[c.id] ?? 0 })),
  ], [categories, counts]);

  if (isPhone) {
    return (
      <View className="flex-1 bg-kitchen-canvas">
        <View className="px-4">
          <KHeader title="Menu" subtitle="Hold a card to change price or sale"
            right={(
              <Pressable onPress={newItem} accessibilityRole="button" accessibilityLabel="New item"
                className="h-11 w-11 items-center justify-center rounded-2xl bg-primary active:bg-primary-deep">
                <Plus size={22} color={colors.textOnPrimary} />
              </Pressable>
            )} />
          <SearchBox value={query} onChange={setQuery} placeholder="Search the menu" />
          <View className="-mx-4 mb-1 mt-2"><ScrollPills label="Category" value={categoryId} onChange={setCategoryId} options={categoryOptions} inset={16} /></View>
          {errorNotice ? <View className="mb-3">{errorNotice}</View> : null}
        </View>
        {grid}
        {sheets}
      </View>
    );
  }

  const onGridLayout = (e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width);

  return (
    <View className="flex-1 bg-kitchen-canvas" style={{ paddingTop: insets.top }}>
      <View className="w-full flex-1 flex-row self-center px-6 pt-6" style={{ maxWidth: 1360, gap: 20 }}>
        <ScrollView style={{ width: 210, flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 120 }}>
          <Text accessibilityRole="header" className="text-[28px] font-bold text-text-primary" style={{ letterSpacing: -0.5 }}>Menu</Text>
          <Text className="mb-3.5 mt-0.5 text-sm font-semibold text-text-secondary">{loading ? ' ' : `${products.length} ${products.length === 1 ? 'item' : 'items'}`}</Text>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {categoryOptions.map((o, i) => {
              const on = o.value === categoryId;
              return (
                <Pressable key={o.value} onPress={() => setCategoryId(o.value)} accessibilityRole="button" aria-selected={on} accessibilityState={{ selected: on }} accessibilityLabel={`${o.label}, ${o.count}`}
                  className={`min-h-[48px] flex-row items-center gap-2 px-3.5 py-2 ${i > 0 ? 'border-t border-border-soft' : ''} ${on ? 'bg-surface-tint' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
                  <Text className={`min-w-0 flex-1 text-[15px] font-bold ${on ? 'text-primary' : 'text-text-primary'}`} numberOfLines={1}>{o.label}</Text>
                  <Text className="text-[13px] font-semibold text-text-secondary" style={{ fontVariant: ['tabular-nums'] }}>{o.count}</Text>
                </Pressable>
              );
            })}
          </Card>
          <NewCategory onAdd={newCategory} onAdded={(c) => setCategoryId(c.id)} />
        </ScrollView>

        <View className="min-w-0 flex-1" onLayout={onGridLayout}>
          <View className="mb-3.5 flex-row items-center gap-3">
            <View className="min-w-0 flex-1"><SearchBox value={query} onChange={setQuery} placeholder="Search the menu" /></View>
            {CAN_IMPORT ? <LinkButton label="Import" onPress={() => setImportOpen(true)} /> : null}
            <PrimaryButton label="New item" icon={Plus} onPress={newItem} />
          </View>
          {errorNotice ? <View className="mb-3">{errorNotice}</View> : null}
          {gridWidth > 0 ? grid : null}
        </View>

        {/* Task 277: the editor slides in over the right of the page rather than taking a column, so the
            grid keeps its columns and nothing re-flows when an item opens or closes. */}
        {panel && drawer.mounted ? (
          <Animated.View style={{ position: 'absolute', top: 82, right: 24, bottom: 96, width: PANEL_WIDTH, opacity: drawer.progress,
            transform: [{ translateX: drawer.progress.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
            shadowColor: colors.primaryNavy, shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 8 }}>
            <View className="flex-1 overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
              <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">{drawerBody}</ScrollView>
            </View>
          </Animated.View>
        ) : null}
      </View>
      {sheets}
    </View>
  );
}
