/**
 * Task 280: the item lines of a send or a buy in the owner's chosen layout (output/previews/
 * task-279, round 7). Search or tap an often used item to add it; each line has − and + beside
 * its quantity, and a tap on the quantity or the rate opens the pad at the bottom to type it.
 * Nothing is filled in for the person except the rate: the item's set price on a send, the last
 * price paid on a buy.
 */
import React, { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors, semantic } from '@/lib/pos/brand';
import { hoverFace, hoverFaceMark } from '@/lib/pos/web-hover';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { formatMoney, formatQty, lineTotal, matchesSearch, stepFor } from '@/lib/pos/kitchen-utils';
import type { KitchenItem } from '@/lib/pos/kitchen-types';
import { AmountPanel, Avatar, PrimaryButton, SearchBox } from './ui';
import type { DraftLine, DraftLines } from './forms';

export type LineMode = 'sell' | 'cost';
export type LineField = 'qty' | 'rate';
export type ActiveLine = { itemId: string; field: LineField } | null;

const tabular = { fontVariant: ['tabular-nums' as const] };
/** Finished goods share one colour and raw materials another, so a line says which it is. */
const KIND_TONE = { finished_good: 6, raw_material: 1 } as const;
const kindLabel = (it: KitchenItem) => (it.item_kind === 'finished_good' ? 'Finished' : 'Raw');

/** The rate a new line starts at: the set price on a send, the last price paid on a buy. */
export function startRate(it: KitchenItem, mode: LineMode, lastCost?: ReadonlyMap<string, number>): number | null {
  return mode === 'sell' ? it.sell_price : lastCost?.get(it.id) ?? null;
}

/** What a send or buy may hold: a send takes finished goods and raw materials, a buy raw materials. */
export function offeredItems(items: readonly KitchenItem[], mode: LineMode): KitchenItem[] {
  return items.filter((i) => i.is_active && (mode === 'sell' || i.item_kind === 'raw_material'));
}

/**
 * The search over what can be added, and before anything is typed the often used items as round
 * initials. Picking one adds its line with no quantity yet and opens the pad on it.
 */
export function ItemSearch({ items, mode, lines, lastCost, picks, showAmounts, onAdd }: {
  items: readonly KitchenItem[]; mode: LineMode; lines: DraftLines; lastCost?: ReadonlyMap<string, number>;
  picks?: readonly { itemId: string; lastQty: number }[]; showAmounts: boolean; onAdd: (it: KitchenItem) => void;
}) {
  const [query, setQuery] = useState('');
  const offered = useMemo(() => offeredItems(items, mode), [items, mode]);
  const matches = useMemo(() => (query.trim() ? offered.filter((i) => matchesSearch(query, i.name, i.unit)).slice(0, 8) : []), [offered, query]);
  const often = useMemo(() => (picks ?? []).map((p) => offered.find((i) => i.id === p.itemId)).filter((i): i is KitchenItem => !!i && !(i.id in lines)), [picks, offered, lines]);
  const add = (it: KitchenItem) => { setQuery(''); onAdd(it); };
  return (
    <View>
      <SearchBox value={query} onChange={setQuery} placeholder={mode === 'sell' ? 'Mousse, milk, sugar…' : 'Milk, sugar, nutella…'} />
      {query.trim() ? (
        <View className="mt-2.5 overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
          {matches.length === 0 ? <Text className="px-3.5 py-4 text-[13px] font-semibold text-text-secondary">No item matches that.</Text> : null}
          {matches.map((it, i) => {
            const rate = startRate(it, mode, lastCost);
            const already = it.id in lines;
            return (
              <Pressable key={it.id} onPress={() => add(it)} accessibilityRole="button" accessibilityLabel={already ? `${it.name}, on the list` : `Add ${it.name}`}
                className={`min-h-[56px] flex-row items-center gap-3 px-3.5 py-2 hover:bg-surface-tint active:bg-surface-tint ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                <Avatar name={it.name} toneIndex={KIND_TONE[it.item_kind]} size={36} ring={false} />
                <View className="min-w-0 flex-1">
                  <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{it.name}</Text>
                  <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>
                    {kindLabel(it)} · {formatQty(it.stock, it.unit)}{showAmounts ? (rate !== null ? ` · ${formatMoney(rate)} / ${it.unit}` : mode === 'sell' ? ' · no price' : '') : ''}
                  </Text>
                </View>
                {already ? <Text className="text-xs font-bold text-primary">On the list</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : often.length ? (
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={often} keyExtractor={(i) => i.id} style={{ marginTop: 12, marginHorizontal: -16 }}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled"
          renderItem={({ item: it }) => (
            <Pressable onPress={() => add(it)} accessibilityRole="button" accessibilityLabel={`Add ${it.name}`} {...hoverFace} style={{ width: 66, alignItems: 'center', gap: 6, paddingVertical: 2 }}>
              <View {...hoverFaceMark} style={{ borderRadius: 30 }}><Avatar name={it.name} toneIndex={KIND_TONE[it.item_kind]} size={52} ring={false} /></View>
              <Text className="text-center text-xs font-bold leading-[15px] text-text-primary" numberOfLines={2}>{it.name}</Text>
            </Pressable>
          )} />
      ) : null}
    </View>
  );
}

/** One line: the item and its total, then its rate and a − qty + control. */
const LineRow = memo(function LineRow({ it, line, active, first, showAmounts, onStep, onOpen }: {
  it: KitchenItem; line: DraftLine; active: LineField | null; first: boolean; showAmounts: boolean;
  onStep: (it: KitchenItem, delta: number) => void; onOpen: (itemId: string, field: LineField) => void;
}) {
  const noRate = line.price === null;
  const total = line.price === null ? null : lineTotal(line.qty, line.price);
  return (
    <View className={`px-3.5 pb-2.5 pt-2.5 ${first ? '' : 'border-t border-border-soft'}`} style={active ? { backgroundColor: colors.surfaceTint } : undefined}>
      <View className="flex-row items-center gap-3">
        <Avatar name={it.name} toneIndex={KIND_TONE[it.item_kind]} size={36} ring={false} />
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{it.name}</Text>
          <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{kindLabel(it)} · {formatQty(it.stock, it.unit)} in stock</Text>
        </View>
        {showAmounts ? <Text className="text-[15px] font-bold text-text-primary" style={tabular}>{total === null ? '—' : formatMoney(total)}</Text> : null}
      </View>
      <View className="mt-2 flex-row items-center justify-between" style={{ marginLeft: 48 }}>
        {showAmounts ? (
          <Pressable onPress={() => onOpen(it.id, 'rate')} accessibilityRole="button" accessibilityLabel={noRate ? `Set ${it.name} rate` : `${it.name} rate ${formatMoney(line.price ?? 0)} per ${it.unit}`}
            className="h-9 justify-center rounded-[10px] border px-2.5 hover:bg-surface-tint"
            style={{ borderColor: active === 'rate' ? colors.primary : noRate ? semantic.dangerSoft : colors.border, backgroundColor: noRate ? semantic.dangerSoft : colors.surfaceElevated }}>
            <Text className="text-[13px] font-bold" style={{ color: noRate ? semantic.danger : colors.textPrimary, ...tabular }}>{noRate ? 'Set rate' : `${formatMoney(line.price ?? 0)} / ${it.unit}`}</Text>
          </Pressable>
        ) : <View />}
        <View className="h-9 flex-row items-center rounded-xl bg-surface-tint">
          <Pressable onPress={() => onStep(it, -1)} accessibilityRole="button" accessibilityLabel={`Less ${it.name}`} hitSlop={4} className="h-9 w-10 items-center justify-center rounded-xl hover:bg-accent-soft">
            <Minus size={16} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => onOpen(it.id, 'qty')} accessibilityRole="button" accessibilityLabel={`${it.name} quantity ${formatQty(line.qty, it.unit)}`}
            className="h-[30px] min-w-[68px] items-center justify-center rounded-[9px] px-2" style={{ backgroundColor: active === 'qty' ? colors.primary : colors.surfaceElevated }}>
            <Text className="text-sm font-bold" style={{ color: active === 'qty' ? colors.textOnPrimary : line.qty > 0 ? colors.textPrimary : colors.textSecondary, ...tabular }}>{formatQty(line.qty, it.unit)}</Text>
          </Pressable>
          <Pressable onPress={() => onStep(it, 1)} accessibilityRole="button" accessibilityLabel={`More ${it.name}`} hitSlop={4} className="h-9 w-10 items-center justify-center rounded-xl hover:bg-accent-soft">
            <Plus size={16} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

/** The lines on the entry, in the order they were added; − on an empty line takes it off. */
export function ItemLines({ items, lines, order, onChange, active, onOpen, showAmounts }: {
  items: ReadonlyMap<string, KitchenItem>; lines: DraftLines; order: readonly string[]; onChange: (lines: DraftLines, order: string[]) => void;
  active: ActiveLine; onOpen: (itemId: string, field: LineField) => void; showAmounts: boolean;
}) {
  const shown = order.filter((id) => id in lines && items.has(id));
  const step = (it: KitchenItem, delta: number) => {
    buzz('select');
    const line = lines[it.id];
    if (!line) return;
    const next = Math.round((line.qty + delta * stepFor(it.unit)) * 1000) / 1000;
    if (next <= 0 && line.qty <= 0) {
      const rest = { ...lines };
      delete rest[it.id];
      onChange(rest, order.filter((id) => id !== it.id));
      return;
    }
    onChange({ ...lines, [it.id]: { ...line, qty: Math.max(0, next) } }, [...order]);
  };
  if (shown.length === 0) return null;
  return (
    <View className="mt-3 overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
      {shown.map((id, i) => {
        const it = items.get(id);
        const line = lines[id];
        if (!it || !line) return null;
        return <LineRow key={id} it={it} line={line} first={i === 0} showAmounts={showAmounts} active={active?.itemId === id ? active.field : null} onStep={step} onOpen={onOpen} />;
      })}
    </View>
  );
}

/** Typed text for a figure on the pad: nothing for zero, so the first key starts it. */
const asTyped = (n: number | null): string => (n === null || n === 0 ? '' : String(n));

/**
 * The pad for one line, in the footer: the item, the line total, a Qty box and (for logins that see
 * amounts) a Rate box; the boxes say which one the keys type into.
 */
export function LinePad({ it, line, field, onField, onChange, onDone, showAmounts }: {
  it: KitchenItem; line: DraftLine; field: LineField; onField: (f: LineField) => void;
  onChange: (line: DraftLine) => void; onDone: () => void; showAmounts: boolean;
}) {
  const [qtyText, setQtyText] = useState(asTyped(line.qty));
  const [rateText, setRateText] = useState(line.price === null ? '' : String(line.price));
  const typing = field === 'rate' && showAmounts ? rateText : qtyText;
  const set = (t: string) => {
    if (field === 'rate' && showAmounts) {
      setRateText(t);
      onChange({ ...line, price: t.trim() === '' ? null : Number(t) });
    } else {
      setQtyText(t);
      onChange({ ...line, qty: t.trim() === '' ? 0 : Number(t) });
    }
  };
  const total = line.price === null ? null : lineTotal(line.qty, line.price);
  const box = (f: LineField, label: string, value: string) => {
    const on = field === f;
    return (
      <Pressable onPress={() => onField(f)} accessibilityRole="button" aria-selected={on} accessibilityState={{ selected: on }} accessibilityLabel={`${label} ${value || 'empty'}`}
        className={`h-11 min-w-0 flex-1 flex-row items-center justify-between rounded-xl px-3 ${on ? '' : 'hover:bg-surface-tint'}`}
        style={{ borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border }}>
        <Text className="text-[13px] font-bold" style={{ color: on ? colors.primary : colors.textSecondary }}>{label}</Text>
        <Text className="text-lg font-bold" style={{ color: value ? colors.textPrimary : colors.border, ...tabular }}>{value || (f === 'rate' ? '₹0' : `0 ${it.unit}`)}</Text>
      </Pressable>
    );
  };
  return (
    <AmountPanel value={typing} onChange={set} top={(
      <View>
        <View className="flex-row items-center gap-3 px-1 pb-2">
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{it.name}</Text>
            <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{formatQty(it.stock, it.unit)} in stock</Text>
          </View>
          {showAmounts ? <Text className="text-[28px] font-extrabold text-text-primary" style={{ letterSpacing: -0.6, ...tabular }}>{total === null ? '—' : formatMoney(total)}</Text> : null}
        </View>
        <View className="mb-2 flex-row" style={{ gap: 6 }}>
          {box('qty', 'Qty', qtyText ? `${qtyText} ${it.unit}` : '')}
          {showAmounts ? box('rate', 'Rate', rateText ? `₹${rateText}` : '') : null}
        </View>
      </View>
    )}>
      <PrimaryButton label="Done" onPress={onDone} />
    </AmountPanel>
  );
}

/** A send's or buy's lines, the order they were added, and which one the pad is on. */
export function useDraftLines() {
  const [lines, setLines] = useState<DraftLines>({});
  const [order, setOrder] = useState<string[]>([]);
  const [active, setActive] = useState<ActiveLine>(null);
  return {
    lines, order, active, setActive,
    /** Replaces everything, as when an edit starts from the saved entry. */
    reset: (next: DraftLines, nextOrder: string[]) => { setLines(next); setOrder(nextOrder); setActive(null); },
    change: (next: DraftLines, nextOrder: string[]) => { setLines(next); setOrder(nextOrder); if (active && !(active.itemId in next)) setActive(null); },
    /** Adds an item with no quantity yet at its starting rate and opens the pad on its quantity. */
    add: (it: KitchenItem, rate: number | null) => {
      if (!(it.id in lines)) {
        setLines({ ...lines, [it.id]: { qty: 0, price: rate } });
        setOrder([...order, it.id]);
      }
      setActive({ itemId: it.id, field: 'qty' });
    },
    update: (itemId: string, line: DraftLine) => setLines((all) => ({ ...all, [itemId]: line })),
  };
}
