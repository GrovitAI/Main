import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { CircleSlash, LayoutGrid, type LucideIcon } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import type { KitchenCategory, KitchenEntry } from '@/lib/pos/kitchen-types';
import { matchesSearch } from '@/lib/pos/kitchen-utils';
import { colors } from '@/lib/pos/brand';
import { saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { ReportSelect } from '@/components/kitchen/ReportSelect';
import { Label, Notice, PrimaryButton, Row, RowInset, SearchBox, Sheet, TextField } from '@/components/kitchen/ui';
import { CategoryTile, categoryIcon } from '@/components/kitchen/CategoryPicker';

export function PurchaseCategoryPicker({ categories, value, onChange, historicalName, tiles, entries = [] }: {
  categories: readonly KitchenCategory[]; value: string | null; onChange: (id: string | null) => void; historicalName?: string | null;
  /** A phone's tiles (task 238): the most-used categories, and More for the rest. */
  tiles?: boolean; entries?: readonly KitchenEntry[];
}) {
  return tiles
    ? <PurchaseCategoryTiles categories={categories} value={value} onChange={onChange} historicalName={historicalName} entries={entries} />
    : <PurchaseCategorySelect categories={categories} value={value} onChange={onChange} historicalName={historicalName} />;
}

function PurchaseCategorySelect({ categories, value, onChange, historicalName }: {
  categories: readonly KitchenCategory[]; value: string | null; onChange: (id: string | null) => void; historicalName?: string | null;
}) {
  const [name, setName] = useState('');
  const mayAdd = useKitchenAccess().can('setup.categories');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    if (saving || !name.trim()) return;
    setSaving(true); setError(null);
    const result = await saveKitchenPurchaseCategory(name);
    setSaving(false);
    if (!result.data || result.error) { setError(result.error ?? 'Unable to save the category.'); return; }
    useKitchenStore.setState(state => ({ purchaseCategories: [...state.purchaseCategories, result.data].filter((category): category is KitchenCategory => category !== null).sort((a, b) => a.name.localeCompare(b.name)) }));
    setName(''); onChange(result.data.id);
  };
  return (
    <View className="gap-2">
      <ReportSelect label="Purchase category" value={value} selectedLabel={historicalName ?? undefined}
        options={categories.filter(category => category.is_active || category.id === value).map(category => ({ id: category.id, label: category.id === value && historicalName ? historicalName : category.name + (!category.is_active ? ' · Archived' : '') }))} onChange={onChange} emptyLabel="Uncategorized" />
      {mayAdd ? <View className="flex-row items-center gap-2">
        <TextInput accessibilityLabel="New purchase category" placeholder="Add a category, e.g. Dairy" placeholderTextColor={colors.textSecondary}
          value={name} onChangeText={setName} maxLength={80} className="min-h-12 min-w-0 flex-1 rounded-xl bg-surface-tint px-3 text-base text-text-primary" />
        <View className="w-20"><PrimaryButton label="Add" onPress={() => void add()} loading={saving} disabled={!name.trim()} /></View>
      </View> : null}
      <Text className="text-xs leading-5 text-text-secondary">Purchase categories are separate from direct expense categories.</Text>
      {error ? <Notice text={error} /> : null}
    </View>
  );
}

/**
 * Bought's purchase category on a phone (task 238, owner's pick): the kitchen's most-used purchase
 * categories as tiles, as on Spent, and More for the whole list, Uncategorized and a new one.
 */
function PurchaseCategoryTiles({ categories, value, onChange, historicalName, entries }: {
  categories: readonly KitchenCategory[]; value: string | null; onChange: (id: string | null) => void; historicalName?: string | null; entries: readonly KitchenEntry[];
}) {
  const mayAdd = useKitchenAccess().can('setup.categories');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelOf = (c: KitchenCategory): string => c.id === value && historicalName ? historicalName : c.name + (!c.is_active ? ' · Archived' : '');
  const ordered = useMemo(() => {
    const uses = new Map<string, number>();
    for (const e of entries) if (e.type === 'bought' && e.purchase_category_id) uses.set(e.purchase_category_id, (uses.get(e.purchase_category_id) ?? 0) + 1);
    return categories.filter(c => c.is_active || c.id === value).sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [categories, entries, value]);
  // Five tiles and More; the chosen category always shows, even when it is not among the most used.
  const top = ordered.slice(0, 5);
  const chosen = ordered.find(c => c.id === value);
  const shown = chosen && !top.includes(chosen) ? [...top.slice(0, 4), chosen] : top;
  const rest = ordered.length - shown.length;
  const filtered = ordered.filter(c => matchesSearch(query, labelOf(c)));
  const choose = (id: string | null): void => { onChange(id); setOpen(false); setQuery(''); };
  const add = async (): Promise<void> => {
    const candidate = name.trim() || query.trim();
    if (saving || !candidate) return;
    setSaving(true); setError(null);
    const result = await saveKitchenPurchaseCategory(candidate);
    setSaving(false);
    if (!result.data || result.error) { setError(result.error ?? 'Unable to save the category.'); return; }
    useKitchenStore.setState(state => ({ purchaseCategories: [...state.purchaseCategories, result.data].filter((category): category is KitchenCategory => category !== null).sort((a, b) => a.name.localeCompare(b.name)) }));
    setName(''); choose(result.data.id);
  };
  type Tile = { key: string; label: string; icon: LucideIcon; on: boolean; onPress: () => void; more?: boolean };
  const tiles: Tile[] = [
    ...shown.map((c): Tile => ({ key: c.id, label: labelOf(c), icon: categoryIcon(c.name), on: c.id === value, onPress: () => onChange(c.id) })),
    { key: 'more', label: rest > 0 ? `More · ${rest}` : 'More', icon: LayoutGrid, on: false, onPress: () => setOpen(true), more: true },
  ];
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));
  const newName = name.trim() || (filtered.length === 0 ? query.trim() : '');
  return (
    <View className="gap-2">
      {rows.map((row, i) => (
        <View key={i} className="flex-row gap-2">
          {row.map(({ key, ...tile }) => <CategoryTile key={key} {...tile} />)}
          {row.length < 3 ? Array.from({ length: 3 - row.length }, (_, j) => <View key={`pad-${j}`} className="flex-1" />) : null}
        </View>
      ))}
      {value === null ? <Text className="px-1 text-xs font-semibold text-text-secondary">Uncategorized. Choose a tile, or More for the full list.</Text> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} dirty={name.trim().length > 0} title="What for">
        <View className="gap-3.5">
          <SearchBox value={query} onChange={setQuery} placeholder="Search purchase categories" autoFocus />
          <RowInset.Provider value={18}>
            <View>
              {!query.trim() ? <Row icon={CircleSlash} title="Uncategorized" selected={value === null} onPress={() => choose(null)} /> : null}
              {filtered.map(c => <Row key={c.id} icon={categoryIcon(c.name)} iconTone="primary" title={labelOf(c)} selected={c.id === value} onPress={() => choose(c.id)} />)}
              {filtered.length === 0 ? <Text className="py-3 text-[13px] font-semibold text-text-secondary">{mayAdd ? 'No category called that yet. Add it below and it stays in the list.' : 'No category called that yet. Ask the owner to add it.'}</Text> : null}
            </View>
          </RowInset.Provider>
          {mayAdd ? <View>
            <Label>New purchase category</Label>
            <View className="flex-row items-center gap-2">
              <View className="flex-1"><TextField value={name} onChange={setName} label="New purchase category name" placeholder={filtered.length === 0 && query.trim() ? query.trim() : 'e.g. Dairy'} /></View>
              <View className="w-24"><PrimaryButton label="Add" onPress={() => void add()} disabled={!newName} loading={saving} /></View>
            </View>
            {error ? <Notice text={error} /> : null}
          </View> : null}
          <Text className="text-xs leading-5 text-text-secondary">Purchase categories are separate from direct expense categories.</Text>
        </View>
      </Sheet>
    </View>
  );
}
