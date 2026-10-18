import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { fetchKitchenPurchaseCategories, saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import type { KitchenCategory } from '@/lib/pos/kitchen-types';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { Card, Empty, KHeader, KScreen, LinkButton, Notice, PrimaryButton, Row, RowInset, Section, Sheet, SkeletonRows, TextField, Toggle } from '@/components/kitchen/ui';
import { categoryIcon } from '@/components/kitchen/CategoryPicker';

/**
 * The kitchen's one category list, used by Bought and Spent (task 255). Task 262: rows open a
 * sheet to rename or archive, as elsewhere in the kitchen, instead of two buttons on every row;
 * Add shows once a name is typed.
 */
export default function PurchaseCategoriesScreen() {
  const mayEdit = useKitchenAccess().can('setup.categories');
  const [categories, setCategories] = useState<KitchenCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [open, setOpen] = useState<KitchenCategory | null>(null);
  const [rename, setRename] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const result = await fetchKitchenPurchaseCategories(true);
    setLoading(false);
    if (result.error || !result.data) { setError(result.error ?? 'Unable to load categories.'); return; }
    setCategories(result.data);
    useKitchenStore.setState({ purchaseCategories: result.data });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => categories.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  const archived = useMemo(() => categories.filter((c) => !c.is_active).sort((a, b) => a.name.localeCompare(b.name)), [categories]);

  const add = async (): Promise<void> => {
    if (saving || !name.trim()) return;
    setSaving(true); setError(null);
    const result = await saveKitchenPurchaseCategory(name);
    setSaving(false);
    if (result.error || !result.data) { setError(result.error ?? 'Unable to save the category.'); return; }
    setName('');
    useKitchenStore.getState().setNotice(`${result.data.name} added`);
    await load();
  };
  const openSheet = (category: KitchenCategory): void => { setOpen(category); setRename(category.name); setSheetError(null); };
  const save = async (category: KitchenCategory, changes: { name?: string; active?: boolean }): Promise<void> => {
    if (saving) return;
    setSaving(true); setSheetError(null);
    const result = await saveKitchenPurchaseCategory(changes.name ?? category.name, category.id, changes.active ?? category.is_active);
    setSaving(false);
    if (result.error || !result.data) { setSheetError(result.error ?? 'Unable to save the category.'); return; }
    setOpen(null);
    useKitchenStore.getState().setNotice(changes.active === false ? `${category.name} archived` : changes.active === true ? `${category.name} restored` : 'Name saved');
    await load();
  };
  const renamed = !!open && rename.trim().length > 0 && rename.trim() !== open.name;

  const list = (rows: KitchenCategory[]) => (
    <Card padded={false} style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
      <RowInset.Provider value={14}>
        {rows.map((c) => (
          <Row key={c.id} icon={categoryIcon(c.name)} iconTone={c.is_active ? 'primary' : 'neutral'} title={c.name} subtitle={c.is_active ? undefined : 'Archived · kept on saved entries'}
            onPress={mayEdit ? () => openSheet(c) : undefined} accessibilityLabel={mayEdit ? `${c.name}, rename or archive` : c.name} />
        ))}
      </RowInset.Provider>
    </Card>
  );

  return (
    <KScreen refreshing={loading && categories.length > 0} onRefresh={() => void load()}>
      <KHeader title="Categories" subtitle="One list for Bought and Spent" onBack={() => router.back()} />
      {!mayEdit ? <Notice tone="neutral" text="Your login cannot add or change categories. Ask the owner." /> : null}
      {mayEdit ? (
        <View className="mt-3 flex-row items-center gap-2">
          <View className="min-w-0 flex-1"><TextField value={name} onChange={setName} label="New category name" placeholder="Add a category, e.g. Dairy" /></View>
          {name.trim() ? <View className="w-24"><PrimaryButton label="Add" onPress={() => void add()} loading={saving} /></View> : null}
        </View>
      ) : null}
      {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
      <Section title={loading ? 'Categories' : `${active.length} in use`}>
        {loading && categories.length === 0 ? <SkeletonRows count={4} label="Loading categories" />
          : active.length === 0 ? <Card><Empty title="No categories yet" body="Add categories such as Dairy, Gas or Packaging. Buys and spends both use them." /></Card>
          : list(active)}
      </Section>
      {archived.length > 0 ? <Section title="Archived">{list(archived)}</Section> : null}
      <Text className="mt-3 text-xs leading-5 text-text-secondary">Saved buys and spends keep the name they were saved with. A vendor can start each buy with one of these; set it on the vendor.</Text>

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name ?? 'Category'} dirty={renamed}>
        {open ? (
          <View style={{ gap: 12 }}>
            <TextField value={rename} onChange={setRename} label="Category name" placeholder={open.name} />
            {renamed ? <PrimaryButton label="Save name" onPress={() => void save(open, { name: rename })} loading={saving} /> : null}
            <View className="overflow-hidden rounded-2xl border border-border-soft">
              <View style={{ marginTop: -1 }}>
                <Toggle label="Archived" hint={open.is_active ? 'Hides it from Bought and Spent; saved entries keep it' : 'Brings it back to Bought and Spent'} on={!open.is_active} onChange={(on) => void save(open, { active: !on })} disabled={saving} />
              </View>
            </View>
            {sheetError ? <Notice text={sheetError} /> : null}
          </View>
        ) : null}
      </Sheet>
    </KScreen>
  );
}
