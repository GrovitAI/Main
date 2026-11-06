import { useMemo, useRef, useState } from 'react';
import { Pressable, View, type TextInput as NativeTextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text, TextInput } from '@/components/ui/Typography';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard } from '@/lib/pos/use-leave-guard';
import { postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { cleanTypedNumber, formatDayLabel, formatQty, localDateKey, madeOnDay, matchesSearch } from '@/lib/pos/kitchen-utils';
import { byCategoryThenName, itemCategoryName } from '@/lib/pos/kitchen-spend-utils';
import type { KitchenItem } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { EntryHistory } from '@/components/kitchen/EntryHistory';
import { WhenRow } from '@/components/kitchen/EntryRows';
import { isValidDateKey, useDateGuard } from '@/components/kitchen/forms';
import { Empty, KHeader, KScreen, Notice, PrimaryButton, SearchBox, Segmented, SettingsGroup, useSavedThen } from '@/components/kitchen/ui';
import { buzz } from '@/lib/pos/kitchen-haptics';

type Mode = 'made' | 'count';
type Kind = KitchenItem['item_kind'];

/**
 * Task 299: many items in one go. Create batches lists the finished goods; Count stock lists what
 * is on the shelf, raw materials and finished goods. Type a figure against any item and save them
 * together; an item left blank is not touched. Each still becomes its own entry in History.
 */
export default function StockEntryScreen() {
  const params = useLocalSearchParams<{ mode?: string; kind?: string }>();
  const mode: Mode = params.mode === 'made' ? 'made' : 'count';
  const [kind, setKind] = useState<Kind>(mode === 'made' || params.kind === 'finished_good' ? 'finished_good' : 'raw_material');
  const data = useKitchenData();
  const { can } = useKitchenAccess();
  const [typed, setTyped] = useState<Readonly<Record<string, string>>>({});
  const [query, setQuery] = useState('');
  // Tasks 304 and 306: what was already recorded, to check or correct it.
  const [tab, setTab] = useState<'new' | 'previous'>('new');
  const previous = tab === 'previous';
  // Task 306: a batch can be for an earlier day, for a login allowed to enter one. A count is what is on the shelf now.
  const [date, setDate] = useState(localDateKey());
  const [lockReason, setLockReason] = useState('');
  const dateOk = useDateGuard(date, lockReason);
  const mayBackdate = mode === 'made' && can('entries.backdate');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useSavedThen();
  const allowed = can(mode === 'made' ? 'entries.batch' : 'entries.count');

  const categories = useMemo(() => [...data.purchaseCategories, ...data.goodsCategories], [data.purchaseCategories, data.goodsCategories]);
  const rows = useMemo(() => byCategoryThenName(
    data.items.filter((i) => i.is_active && i.item_kind === kind && matchesSearch(query, i.name, i.unit, itemCategoryName(categories, i.category_id) ?? '')), categories,
  ), [data.items, kind, query, categories]);
  const chosen = useMemo(() => Object.entries(typed)
    .map(([id, text]) => ({ item: data.itemsById.get(id), qty: Number(text), text }))
    .filter((l): l is { item: KitchenItem; qty: number; text: string } => !!l.item && l.text.trim() !== '' && Number.isFinite(l.qty) && (mode === 'made' ? l.qty > 0 : l.qty >= 0)), [typed, data.itemsById, mode]);

  useLeaveGuard(chosen.length > 0 && !done.saved, 'The figures you typed');
  const madeThatDay = useMemo(() => (mode === 'made' ? madeOnDay(data.entries, date) : new Map<string, number>()), [mode, data.entries, date]);
  const dayName = formatDayLabel(date);

  const save = async (): Promise<void> => {
    if (chosen.length === 0 || saving || !allowed || (mode === 'made' && (!isValidDateKey(date) || !dateOk))) return;
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    let firstError: string | null = null;
    for (const line of chosen) {
      const res = await postKitchenEntry({ type: mode, item_id: line.item.id, qty: line.qty, ...(mode === 'made' ? { entry_date: date } : {}) }, mode === 'made' ? lockReason : null);
      if (res.error) {
        failed.push(line.item.id);
        firstError = firstError ?? res.error;
      }
    }
    if (failed.length > 0) {
      // What went through is cleared, so saving again cannot record it twice.
      await data.load(true);
      setTyped(Object.fromEntries(chosen.filter((l) => failed.includes(l.item.id)).map((l) => [l.item.id, l.text])));
      setError(`${chosen.length - failed.length} saved. ${failed.length} did not: ${firstError ?? 'please try again.'}`);
      setSaving(false);
      buzz('error');
      return;
    }
    done.mark();
    await data.load(true);
    setSaving(false);
    const n = chosen.length;
    useKitchenStore.getState().setNotice(`${mode === 'made' ? 'Batches added' : 'Stock counted'} · ${n} ${n === 1 ? 'item' : 'items'}`);
    done.finish(backToKitchen);
  };

  const label = chosen.length === 0 ? 'Save' : `Save · ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}`;
  const whyNot = chosen.length === 0 ? 'Enter a quantity' : mode === 'made' && (!isValidDateKey(date) || !dateOk) ? 'Check the date' : undefined;
  const top = (
    <>
      <KHeader title={mode === 'made' ? 'Create batches' : 'Count stock'} subtitle={previous || mode === 'made' ? undefined : 'What is on the shelf now'} onBack={() => backToKitchen()} />
      <View className="mb-3"><Segmented options={[{ value: 'new', label: 'New' }, { value: 'previous', label: 'Previous' }]} value={tab} onChange={setTab} /></View>
    </>
  );
  if (previous) return <KeyboardAvoider><EntryHistory type={mode} top={top} emptyTitle={mode === 'made' ? 'No batches yet' : 'No counts yet'} /></KeyboardAvoider>;
  return (
    <KeyboardAvoider>
      <KScreen footer={allowed ? <PrimaryButton label={label} onPress={() => void save()} disabled={!!whyNot} loading={saving} done={done.saved} reason={whyNot} /> : undefined}>
        {top}
        {!allowed ? <Notice text="Your login cannot record this. Ask the owner or a kitchen manager." /> : null}
        {mode === 'count' ? <View className="mb-3"><Segmented options={[{ value: 'raw_material', label: 'Raw materials' }, { value: 'finished_good', label: 'Finished goods' }]} value={kind} onChange={setKind} /></View> : null}
        {mayBackdate ? <View className="mb-3"><SettingsGroup><WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} /></SettingsGroup></View> : null}
        <SearchBox value={query} onChange={setQuery} placeholder="Search items" />
        {error ? <View className="mt-3"><Notice text={error} /></View> : null}
        {rows.length === 0 ? <Empty title={query ? 'No item matches that' : 'No items yet'} /> : (
          <View className="mt-3 overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
            {rows.map((it, i) => <QtyRow key={it.id} it={it} first={i === 0} text={typed[it.id] ?? ''} category={itemCategoryName(categories, it.category_id)} already={madeThatDay.get(it.id) ? `${dayName} +${formatQty(madeThatDay.get(it.id) ?? 0, it.unit).trim()}` : null} onChange={(t) => setTyped((all) => ({ ...all, [it.id]: t }))} />)}
          </View>
        )}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}

/** One item and its figure; a tap anywhere on the row puts the cursor in the box. */
function QtyRow({ it, first, text, category, already, onChange }: { it: KitchenItem; first: boolean; text: string; category: string | null; already: string | null; onChange: (t: string) => void }) {
  const input = useRef<NativeTextInput>(null);
  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel={it.name}
      className={`min-h-[60px] flex-row items-center gap-3 px-3.5 py-2 hover:bg-surface-tint ${first ? '' : 'border-t border-border-soft'}`}>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{it.name}</Text>
        <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{already ? <Text className="text-xs font-bold text-primary">{already} · </Text> : null}{[`${formatQty(it.stock, it.unit)} in stock`, category].filter(Boolean).join(' · ')}</Text>
      </View>
      <View className="h-11 flex-row items-center rounded-xl border border-border bg-surface-elevated px-2.5" style={{ width: 112 }}>
        <TextInput ref={input} value={text} onChangeText={(t) => onChange(cleanTypedNumber(t, it.unit === 'pcs' ? 0 : 3))}
          keyboardType="decimal-pad" inputMode="decimal" selectTextOnFocus accessibilityLabel={`${it.name} quantity in ${it.unit}`}
          className="min-w-0 flex-1 text-right text-[15px] font-bold text-text-primary" style={{ padding: 0, fontVariant: ['tabular-nums'] }} />
        <Text className="ml-1 text-[13px] font-bold text-text-secondary">{it.unit}</Text>
      </View>
    </Pressable>
  );
}
