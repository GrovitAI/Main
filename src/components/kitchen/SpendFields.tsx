/**
 * Task 279: the pieces of Spent by particular (owner's picks in output/previews/task-279): the
 * particular search with the often used ones as round initials, and the pickers its rows open.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Check, ChevronRight, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { hoverFace, hoverFaceMark } from '@/lib/pos/web-hover';
import { formatMoney } from '@/lib/pos/kitchen-utils';
import { categoryTree, lastAmounts, matchParticulars, oftenParticulars, placeOf } from '@/lib/pos/kitchen-spend-utils';
import type { KitchenCategory, KitchenEntry, KitchenParticular, KitchenParty, KitchenRouteDir, KitchenUnit } from '@/lib/pos/kitchen-types';
import { KITCHEN_UNITS } from '@/lib/pos/kitchen-types';
import { Avatar, LinkButton, Notice, PrimaryButton, SearchBox, Segmented, Sheet, TextField } from './ui';

/**
 * A particular's circle takes its top category's colour, so Food items share one colour. Each top
 * category takes the next colour in list order, so two categories side by side never match.
 */
export function toneOfParticular(categories: readonly KitchenCategory[], categoryId: string | null | undefined): number | undefined {
  const top = placeOf(categories, categoryId)?.top.id;
  if (!top) return undefined;
  const index = categoryTree(categories, true).findIndex((t) => t.top.id === top);
  return index >= 0 ? index : undefined;
}

/** What the search hands back: a particular in the list, or a new name to file. */
export type PickedParticular = { id: string | null; name: string; category_id: string | null };

/**
 * Type what it was for; matches show with their category and last amount. Before anything is
 * typed, the often used particulars sit in one row of round initials that scrolls sideways.
 */
export function ParticularSearch({ particulars, categories, entries, query, onQuery, onPick, showAmounts }: {
  particulars: readonly KitchenParticular[];
  categories: readonly KitchenCategory[];
  entries: readonly KitchenEntry[];
  query: string;
  onQuery: (q: string) => void;
  onPick: (picked: PickedParticular) => void;
  showAmounts: boolean;
}) {
  const matches = useMemo(() => matchParticulars(particulars, query), [particulars, query]);
  const often = useMemo(() => oftenParticulars(entries, particulars), [entries, particulars]);
  const last = useMemo(() => lastAmounts(entries), [entries]);
  const typed = query.trim();
  const exact = matches.some((p) => p.name.trim().toLocaleLowerCase() === typed.toLocaleLowerCase());
  return (
    <View>
      <SearchBox value={query} onChange={onQuery} placeholder="Milk, gas, van…" />
      {typed ? (
        <View className="mt-2.5 overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
          {matches.map((p, i) => {
            const place = placeOf(categories, p.category_id);
            const amount = last.get(p.id);
            return (
              <Pressable key={p.id} onPress={() => onPick({ id: p.id, name: p.name, category_id: p.category_id })} accessibilityRole="button" accessibilityLabel={place ? `${p.name}, ${place.label}` : p.name}
                className={`min-h-[56px] flex-row items-center gap-3 px-3.5 py-2 hover:bg-surface-tint active:bg-surface-tint ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                <Avatar name={p.name} toneIndex={toneOfParticular(categories, p.category_id)} size={36} ring={false} />
                <View className="min-w-0 flex-1">
                  <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{p.name}</Text>
                  {place ? <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{place.label}</Text> : null}
                </View>
                {showAmounts && amount !== undefined ? <Text className="text-[13px] font-bold text-text-secondary">{formatMoney(amount)}</Text> : null}
              </Pressable>
            );
          })}
          {exact ? null : (
            <Pressable onPress={() => onPick({ id: null, name: typed, category_id: null })} accessibilityRole="button" accessibilityLabel={`Add ${typed} as new`}
              className={`min-h-[52px] flex-row items-center gap-3 px-3.5 py-2 hover:bg-surface-tint active:bg-surface-tint ${matches.length ? 'border-t border-border-soft' : ''}`}>
              <View className="h-9 w-9 items-center justify-center rounded-full border border-dashed border-border"><Plus size={16} color={colors.primary} /></View>
              <Text className="min-w-0 flex-1 text-[15px] font-bold text-primary" numberOfLines={1}>Add “{typed}” as new</Text>
            </Pressable>
          )}
        </View>
      ) : often.length ? (
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={often} keyExtractor={(o) => o.particular.id} style={{ marginTop: 12, marginHorizontal: -16 }}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled"
          renderItem={({ item: { particular: p } }) => (
            <Pressable onPress={() => onPick({ id: p.id, name: p.name, category_id: p.category_id })} accessibilityRole="button" accessibilityLabel={p.name} {...hoverFace}
              style={{ width: 66, alignItems: 'center', gap: 6, paddingVertical: 2 }}>
              <View {...hoverFaceMark} style={{ borderRadius: 30 }}><Avatar name={p.name} toneIndex={toneOfParticular(categories, p.category_id)} size={52} ring={false} /></View>
              <Text className="text-center text-xs font-bold leading-[15px] text-text-primary" numberOfLines={2}>{p.name}</Text>
            </Pressable>
          )} />
      ) : null}
    </View>
  );
}

/**
 * Where a new particular is filed: a category, then (if it has them) one of its sub-categories or
 * just the category. Owners with the set-up permission can add either from here.
 */
export function CategorySheet({ visible, onClose, categories, value, onPick, onAdd, title = 'Category', onNone, noneLabel = 'Uncategorized' }: {
  visible: boolean; onClose: () => void; categories: readonly KitchenCategory[]; value: string | null;
  onPick: (categoryId: string) => void;
  /** Present when this login may add categories; resolves to the new one or an error. */
  onAdd?: (name: string, parentId: string | null) => Promise<KitchenCategory | string>;
  title?: string;
  /** Task 280 (Bought): a first choice for no category at all. */
  onNone?: () => void;
  noneLabel?: string;
}) {
  const tree = useMemo(() => categoryTree(categories), [categories]);
  const [openTop, setOpenTop] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branch = openTop ? tree.find((t) => t.top.id === openTop) ?? null : null;
  const close = () => { setOpenTop(null); setAdding(null); setError(null); onClose(); };
  const pick = (id: string) => { setOpenTop(null); setAdding(null); onPick(id); };
  const add = async () => {
    if (!onAdd || !adding?.trim() || busy) return;
    setBusy(true);
    const made = await onAdd(adding.trim(), branch?.top.id ?? null);
    setBusy(false);
    if (typeof made === 'string') { setError(made); return; }
    setAdding(null);
    setError(null);
    pick(made.id);
  };
  const row = (c: KitchenCategory, hasSubs: boolean, onPress: () => void, label = c.name) => {
    const on = c.id === value;
    return (
      <Pressable key={c.id + label} onPress={onPress} accessibilityRole="button" aria-selected={on} accessibilityState={{ selected: on }} accessibilityLabel={label}
        className={`min-h-[52px] flex-row items-center gap-3 border-t border-border-soft px-3.5 py-2 ${on ? 'bg-surface-tint' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
        <Text className={`min-w-0 flex-1 text-[15px] ${on ? 'font-bold text-primary' : 'font-semibold text-text-primary'}`} numberOfLines={1}>{label}</Text>
        {hasSubs ? <ChevronRight size={16} color={colors.textSecondary} /> : on ? <Check size={18} color={colors.primary} /> : null}
      </Pressable>
    );
  };
  return (
    <Sheet visible={visible} onClose={close} title={branch ? branch.top.name : title}>
      {branch ? <View className="mb-1 items-start"><LinkButton label="All categories" onPress={() => { setOpenTop(null); setAdding(null); }} /></View> : null}
      <View className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
        <View style={{ marginTop: -1 }}>
          {branch
            ? [row(branch.top, false, () => pick(branch.top.id), `Just ${branch.top.name}`), ...branch.subs.map((s) => row(s, false, () => pick(s.id)))]
            : [
              ...(onNone ? [(
                <Pressable key="none" onPress={() => { setOpenTop(null); onNone(); }} accessibilityRole="button" aria-selected={value === null} accessibilityState={{ selected: value === null }} accessibilityLabel={noneLabel}
                  className={`min-h-[52px] flex-row items-center gap-3 border-t border-border-soft px-3.5 py-2 ${value === null ? 'bg-surface-tint' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
                  <Text className={`min-w-0 flex-1 text-[15px] ${value === null ? 'font-bold text-primary' : 'font-semibold text-text-primary'}`}>{noneLabel}</Text>
                  {value === null ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              )] : []),
              ...tree.map(({ top, subs }) => row(top, subs.length > 0, () => (subs.length ? setOpenTop(top.id) : pick(top.id)))),
            ]}
        </View>
      </View>
      {onAdd ? (
        adding === null ? (
          <View className="mt-1 items-start"><LinkButton label={branch ? 'New sub-category' : 'New category'} onPress={() => setAdding('')} /></View>
        ) : (
          <View className="mt-2 flex-row items-center gap-3">
            <View className="min-w-0 flex-1"><TextField label={branch ? 'New sub-category' : 'New category'} value={adding} onChange={setAdding} placeholder="Name" autoFocus /></View>
            {adding.trim() ? <LinkButton label={busy ? 'Adding…' : 'Add'} onPress={() => void add()} /> : <LinkButton label="Cancel" onPress={() => setAdding(null)} />}
          </View>
        )
      ) : null}
      {error ? <Notice text={error} /> : null}
    </Sheet>
  );
}

/** Transport's route: from or to one of the branches. */
export function RouteSheet({ visible, onClose, branches, dir, partyId, onPick }: {
  visible: boolean; onClose: () => void; branches: readonly KitchenParty[];
  dir: KitchenRouteDir | null; partyId: string | null; onPick: (dir: KitchenRouteDir, partyId: string) => void;
}) {
  const [direction, setDirection] = useState<KitchenRouteDir>(dir ?? 'from');
  const shown = branches.filter((b) => b.kind === 'branch' && b.is_active);
  return (
    <Sheet visible={visible} onClose={onClose} title="Route">
      <Segmented options={[{ value: 'from', label: 'From a branch' }, { value: 'to', label: 'To a branch' }]} value={direction} onChange={setDirection} />
      <View className="mt-3 overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
        <View style={{ marginTop: -1 }}>
          {shown.map((b) => {
            const on = b.id === partyId && direction === dir;
            return (
              <Pressable key={b.id} onPress={() => onPick(direction, b.id)} accessibilityRole="button" aria-selected={on} accessibilityState={{ selected: on }} accessibilityLabel={`${direction === 'from' ? 'From' : 'To'} ${b.name}`}
                className={`min-h-[52px] flex-row items-center gap-3 border-t border-border-soft px-3.5 py-2 ${on ? 'bg-surface-tint' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
                <Avatar name={b.name} size={32} ring={false} />
                <Text className={`min-w-0 flex-1 text-[15px] ${on ? 'font-bold text-primary' : 'font-semibold text-text-primary'}`} numberOfLines={1}>{b.name}</Text>
                {on ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
      {shown.length === 0 ? <Notice text="Add the branches under More › Branches first." /> : null}
    </Sheet>
  );
}

/** An optional quantity and its unit. */
export function QtySheet({ visible, onClose, qty, unit, onDone }: {
  visible: boolean; onClose: () => void; qty: string; unit: KitchenUnit | null; onDone: (qty: string, unit: KitchenUnit | null) => void;
}) {
  const [text, setText] = useState(qty);
  const [u, setU] = useState<KitchenUnit | null>(unit);
  const valid = /^\d+(\.\d{1,3})?$/.test(text.trim()) && Number(text) > 0 && u !== null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Qty">
      <TextField label="Qty" value={text} onChange={setText} keyboardType="decimal-pad" placeholder="Qty" autoFocus />
      <View className="mt-3"><Segmented options={KITCHEN_UNITS.map((k) => ({ value: k, label: k }))} value={u ?? ('' as KitchenUnit)} onChange={setU} /></View>
      <View className="mt-4"><PrimaryButton label="Done" onPress={() => onDone(text.trim(), u)} disabled={!valid} reason={!u ? 'Choose the unit' : 'Enter the qty'} /></View>
      {qty ? <View className="mt-1 items-center"><LinkButton label="Remove qty" onPress={() => onDone('', null)} /></View> : null}
    </Sheet>
  );
}
