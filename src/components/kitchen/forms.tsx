/**
 * The pieces the four entry forms share: picking a branch or vendor (and
 * adding one on the spot), the item lines of a send or a buy, the payment
 * mode, the date, and the open slips a payment can be set against.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { Banknote, ChevronLeft, ChevronRight, Landmark, Plus, Search, Smartphone } from 'lucide-react-native';
import { useResponsive } from '@/lib/pos/useResponsive';
import { hoverFace, hoverFaceMark } from '@/lib/pos/web-hover';
import { colors } from '@/lib/pos/brand';
import { fetchKitchenOpenDocuments, saveKitchenParty } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { kitchenCalendarDays, kitchenMonthLabel, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { KITCHEN_MODES, formatDayLabel, formatLongDate, formatMoney, formatQty, lineTotal, linesTotal, localDateKey, matchesSearch, stepFor } from '@/lib/pos/kitchen-utils';
import type { KitchenItem, KitchenMode, KitchenOpenDocument, KitchenParty, KitchenPartyBalance, KitchenPartyKind } from '@/lib/pos/kitchen-types';
import { AddChip, Avatar, ChoiceButtons, Chips, Field, Notice, PrimaryButton, QtyStepper, SearchBox, Segmented, TextField, Tick, type ChipOption } from './ui';

// ─── Who ─────────────────────────────────────────────────────────────────────

type PartyPickerProps = {
  kind: KitchenPartyKind;
  parties: readonly KitchenParty[];
  balances: readonly KitchenPartyBalance[];
  value: string | null;
  onChange: (id: string) => void;
};

/** Branches or vendors as chips with their balance, searchable, with "New" inline. */
export function PartyPicker({ kind, parties, balances, value, onChange }: PartyPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const balanceOf = useMemo(() => new Map(balances.map((b) => [b.party_id, b.balance])), [balances]);
  const guard = useKitchenAccess();
  const showAmounts = guard.showAmounts;
  const mayAdd = guard.can('setup.parties');
  const options: ChipOption<string>[] = useMemo(
    () =>
      parties
        .filter((p) => p.kind === kind)
        .map((p) => {
          const bal = balanceOf.get(p.id) ?? 0;
          return { value: p.id, label: p.name, hint: bal > 0 && showAmounts ? formatMoney(bal) : undefined };
        }),
    [parties, kind, balanceOf, showAmounts],
  );
  const noun = kind === 'branch' ? 'branch' : 'vendor';
  const { isTablet } = useResponsive();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const res = await saveKitchenParty({ kind, name: trimmed });
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? `Unable to add the ${noun}.`);
      return;
    }
    await useKitchenStore.getState().load(true);
    onChange(res.data.id);
    setName('');
    setAdding(false);
  };

  // Task 229: a phone picks from a row of initial circles, with search and New at the end.
  if (!isTablet) {
    const shown = query.trim() ? options.filter((o) => matchesSearch(query, o.label) || o.value === value) : options;
    const tool = (key: string, label: string, icon: React.ReactNode, onPress: () => void, on: boolean) => (
      <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: on }} {...hoverFace} className="w-[70px] items-center gap-1 py-1 active:opacity-70">
        <View {...hoverFaceMark} style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceTint, borderWidth: 1.5, borderStyle: 'dashed', borderColor: on ? colors.primary : colors.border }}>{icon}</View>
        <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{label}</Text>
      </Pressable>
    );
    return (
      <View style={{ gap: 10 }}>
        {searching ? <SearchBox value={query} onChange={setQuery} placeholder={`Search ${noun === 'branch' ? 'branches' : 'vendors'}`} autoFocus /> : null}
        {options.length === 0 ? (
          // Task 251: nothing to pick yet; New leads and the hint sits beside it.
          <View className="flex-row items-center" style={{ gap: 6 }}>
            {mayAdd ? tool('new', 'New', <Plus size={20} color={colors.primary} />, () => setAdding((v) => !v), adding) : null}
            <Text className="min-w-0 flex-1 text-[13px] font-semibold text-text-secondary">{`No ${noun === 'branch' ? 'branches' : 'vendors'} yet.${mayAdd ? ' Tap New to add the first one.' : ''}`}</Text>
          </View>
        ) : (
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={shown} keyExtractor={(o) => o.value} contentContainerStyle={{ gap: 4 }}
          ListEmptyComponent={<Text className="py-4 text-[13px] font-semibold text-text-secondary">No match</Text>}
          renderItem={({ item: o }) => (
            <Pressable onPress={() => onChange(o.value)} accessibilityRole="button" aria-selected={o.value === value} accessibilityLabel={o.hint ? `${o.label}, ${o.hint}` : o.label}
              className="w-[70px] items-center gap-1 rounded-2xl py-1 active:opacity-70">
              <Avatar name={o.label} size={46} selected={o.value === value} />
              <Text className={`text-xs ${o.value === value ? 'font-extrabold text-primary' : 'font-semibold text-text-secondary'}`} numberOfLines={1}>{o.label}</Text>
            </Pressable>
          )}
          ListFooterComponent={<View className="flex-row" style={{ gap: 4 }}>
            {options.length > 6 ? tool('search', 'Search', <Search size={20} color={colors.primary} />, () => { setSearching((v) => !v); setQuery(''); }, searching) : null}
            {mayAdd ? tool('new', 'New', <Plus size={20} color={colors.primary} />, () => setAdding((v) => !v), adding) : null}
          </View>} />
        )}
        {adding ? (
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View className="flex-1">
              <TextField value={name} onChange={setName} label={`New ${noun} name`} placeholder={kind === 'branch' ? 'Branch name' : 'Vendor name'} autoFocus />
            </View>
            <View style={{ width: 96 }}>
              <PrimaryButton label="Add" onPress={() => void add()} disabled={!name.trim()} loading={saving} />
            </View>
          </View>
        ) : null}
        {error ? <Notice text={error} /> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Chips
        options={options}
        value={value}
        onChange={onChange}
        searchable
        searchPlaceholder={`Search ${noun === 'branch' ? 'branches' : 'vendors'}`}
        emptyText={options.length === 0 ? `No ${noun === 'branch' ? 'branches' : 'vendors'} yet. Add the first one.` : 'No match'}
        trailing={mayAdd ? <AddChip label="New" onPress={() => setAdding((v) => !v)} /> : undefined}
      />
      {adding ? (
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <View className="flex-1">
            <TextField value={name} onChange={setName} label={`New ${noun} name`} placeholder={kind === 'branch' ? 'Branch name' : 'Vendor name'} autoFocus />
          </View>
          <View style={{ width: 96 }}>
            <PrimaryButton label="Add" onPress={() => void add()} disabled={!name.trim()} loading={saving} />
          </View>
        </View>
      ) : null}
      {error ? <Notice text={error} /> : null}
    </View>
  );
}

// ─── How ─────────────────────────────────────────────────────────────────────

const MODE_ICONS = { cash: Banknote, upi: Smartphone, bank: Landmark } as const;

/** Cash, UPI or Bank as three equal buttons; the line under them says which balance it lands in. */
export function ModePicker({ value, onChange }: { value: KitchenMode; onChange: (m: KitchenMode) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <ChoiceButtons label="Payment mode" options={KITCHEN_MODES.map((m) => ({ value: m.value, label: m.label, icon: MODE_ICONS[m.value] }))} value={value} onChange={onChange} />
      <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600' }}>{value === 'cash' ? 'Counts in Cash in hand.' : 'Counts in the Bank balance.'}</Text>
    </View>
  );
}

// ─── When ────────────────────────────────────────────────────────────────────

type DateChoice = 'today' | 'yesterday' | 'other';

/**
 * True when this login may save on `date`: not a future day, not a locked
 * day (the owner gives a reason instead), and today only without back-dating.
 * `guard` false skips the checks (opening balances are dated, not entries).
 */
export function useDateGuard(date: string, lockReason: string, guard = true): boolean {
  const access = useKitchenAccess();
  if (!guard) return true;
  return access.dateBlock(date) === null && !(access.needsLockReason(date) && !lockReason.trim());
}

type DateFieldProps = {
  value: string;
  onChange: (d: string) => void;
  /** The owner's reason for changing a locked day; the field shows only when needed. */
  lockReason?: string;
  onLockReason?: (reason: string) => void;
  guard?: boolean;
};

export function DateField({ value, onChange, lockReason = '', onLockReason, guard = true }: DateFieldProps) {
  const access = useKitchenAccess();
  const todayOnly = guard && !access.can('entries.backdate');
  const block = guard ? access.dateBlock(value) : null;
  const askReason = guard && !!onLockReason && access.needsLockReason(value);
  const today = localDateKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = localDateKey(y);
  const choice: DateChoice = value === today ? 'today' : value === yesterday ? 'yesterday' : 'other';
  const [other, setOther] = useState(choice === 'other');
  if (todayOnly) {
    return (
      <Field label="When" hint="This login records today’s entries only.">
        <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '700' }}>{value === today ? `Today · ${formatDayLabel(today, '')}` : formatDayLabel(value, '')}</Text>
        {block ? <View style={{ marginTop: 8 }}><Notice text={block} /></View> : null}
      </Field>
    );
  }
  return (
    <Field label="When">
      <Segmented
        options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'other', label: 'Date' }]}
        value={other ? 'other' : choice}
        onChange={(c) => {
          if (c === 'today') { setOther(false); onChange(today); }
          else if (c === 'yesterday') { setOther(false); onChange(yesterday); }
          else setOther(true);
        }}
      />
      {other ? <MiniCalendar value={value} onChange={onChange} today={today} isBlocked={guard ? (day) => access.dateBlock(day) !== null : undefined} /> : null}
      {block ? <View style={{ marginTop: 8 }}><Notice text={block} /></View> : null}
      {askReason && onLockReason ? (
        <View style={{ marginTop: 10, gap: 4 }}>
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600' }}>This day is locked. As the owner you can still change it; the reason is kept in the change log.</Text>
          <TextField value={lockReason} onChange={onLockReason} label="Reason for changing a locked day" placeholder="For example: late bill from the vendor" />
        </View>
      ) : null}
    </Field>
  );
}

export const isValidDateKey = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T00:00:00`).getTime());

// ─── What: the lines of a send or a buy ──────────────────────────────────────

export type DraftLine = { qty: number; price: number | null };
export type DraftLines = Record<string, DraftLine>;

type LinesEditorProps = {
  items: readonly KitchenItem[];
  lines: DraftLines;
  onChange: (lines: DraftLines) => void;
  /**
   * Selling to a branch (price from the item) or buying from a vendor (price from the last buy);
   * or, quantities only (task 242), giving raw materials from the store to the kitchen ('issue').
   */
  mode: 'sell' | 'cost' | 'issue';
  defaultCost?: ReadonlyMap<string, number>;
  /**
   * Items to offer as one-tap chips before any search, with the quantity used
   * last time (task 216). A tap adds the item at zero: the quantity is always
   * typed, never guessed.
   */
  picks?: readonly { itemId: string; lastQty: number }[];
  picksTitle?: string;
};

// Task 258: the rest of the form (payment mode, date, note) changes without redrawing the lines.
export const LinesEditor = React.memo(function LinesEditor({ items, lines, onChange, mode, defaultCost, picks, picksTitle }: LinesEditorProps) {
  const [query, setQuery] = useState('');
  const [pinned, setPinned] = useState<readonly string[]>([]);
  const lastQty = useMemo(() => new Map((picks ?? []).map((p) => [p.itemId, p.lastQty])), [picks]);
  const { showAmounts } = useKitchenAccess();
  const kind = mode === 'sell' ? 'finished_good' : 'raw_material';
  const qtyOnly = mode === 'issue';
  const onHand = (it: KitchenItem): string => `${formatQty(it.stock, it.unit)} ${qtyOnly ? 'in the store' : 'in stock'}`;
  const offered = useMemo(() => items.filter((i) => i.item_kind === kind), [items, kind]);
  // Search first: the list holds the items already on this entry, then whatever
  // matches the search. A match keeps its place when it gets a quantity, so rows
  // do not jump under the finger. Selected historical lines stay even after an
  // item is reclassified.
  const ordered = useMemo(() => {
    const matches = query.trim() ? offered.filter((i) => matchesSearch(query, i.name, i.unit)) : [];
    if (mode === 'sell') matches.sort((a, b) => Number(a.sell_price === null) - Number(b.sell_price === null) || a.name.localeCompare(b.name));
    const matchIds = new Set(matches.map((i) => i.id));
    const chosenElsewhere = items.filter((i) => ((lines[i.id]?.qty ?? 0) > 0 || pinned.includes(i.id)) && !matchIds.has(i.id));
    return [...chosenElsewhere, ...matches];
  }, [items, offered, query, lines, mode, pinned]);
  const shownPicks = useMemo(() => (query.trim() ? [] : (picks ?? [])
    .map((p) => offered.find((i) => i.id === p.itemId && i.is_active))
    .filter((i): i is KitchenItem => !!i && !pinned.includes(i.id) && !((lines[i.id]?.qty ?? 0) > 0))), [picks, offered, pinned, lines, query]);
  const defaultPrice = (it: KitchenItem): number | null => (mode === 'sell' ? it.sell_price : defaultCost?.get(it.id) ?? null);
  const setLine = (it: KitchenItem, patch: Partial<DraftLine>) => {
    const current = lines[it.id] ?? { qty: 0, price: defaultPrice(it) };
    onChange({ ...lines, [it.id]: { ...current, ...patch } });
  };
  const chosen = Object.values(lines).filter((l) => l.qty > 0);
  const total = linesTotal(chosen.map((l) => ({ qty: l.qty, price: l.price ?? 0 })));
  const phone = !useResponsive().isTablet;

  return (
    <View style={{ gap: 10 }}>
      <SearchBox value={query} onChange={setQuery} placeholder={mode === 'sell' ? 'Search finished goods to add' : 'Search raw materials to add'} />
      {/* Task 231: on a phone the often-used items are rows with Add; the quantity is still typed. */}
      {phone && shownPicks.length > 0 ? (
        <View style={{ gap: 6 }}>
          {picksTitle ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{picksTitle}</Text> : null}
          <View className="overflow-hidden rounded-2xl border border-border-soft bg-surface-elevated">
            {shownPicks.map((it, i) => {
              const unitPrice = mode === 'sell' ? it.sell_price : defaultCost?.get(it.id) ?? null;
              return (
                <View key={it.id} className={`flex-row items-center gap-3 px-3.5 py-2.5 ${i === 0 ? '' : 'border-t border-border-soft'}`}>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{it.name}</Text>
                    <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{onHand(it)}{unitPrice !== null && showAmounts && !qtyOnly ? ` · ${formatMoney(unitPrice)}/${it.unit}` : ''}{lastQty.has(it.id) ? ` · last time ${formatQty(lastQty.get(it.id) ?? 0, it.unit)}` : ''}</Text>
                  </View>
                  <Pressable onPress={() => setPinned((p) => [...p, it.id])} accessibilityRole="button" accessibilityLabel={`Add ${it.name}`}
                    className="h-10 flex-row items-center gap-1 rounded-xl border border-border bg-surface-elevated px-3.5 hover:bg-surface-tint active:bg-surface-tint">
                    <Plus size={15} color={colors.primary} /><Text className="text-sm font-bold text-primary">Add</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      {!phone && shownPicks.length > 0 ? (
        <View style={{ gap: 2 }}>
          {picksTitle ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }}>{picksTitle}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 }}>
            {shownPicks.map((it) => <AddChip key={it.id} label={it.name} onPress={() => setPinned((p) => [...p, it.id])} />)}
          </View>
        </View>
      ) : null}
      <View className="rounded-2xl border border-border-soft bg-surface-elevated" style={{ paddingHorizontal: 14 }}>
        {ordered.length === 0 ? (
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', paddingVertical: 18, textAlign: 'center' }}>
            {offered.length === 0
              ? mode === 'sell' ? 'No finished goods yet. Add them under Stock first.' : 'No raw materials yet. Add them under Stock first.'
              : query.trim() ? 'No item matches that.' : shownPicks.length > 0 ? 'Search above, or tap an item you often send.' : 'Search above, then set a quantity on each item you need.'}
          </Text>
        ) : null}
        {ordered.map((it) => {
          const line = lines[it.id];
          const qty = line?.qty ?? 0;
          const price = line ? line.price : defaultPrice(it);
          const unitPrice = mode === 'sell' ? it.sell_price : defaultCost?.get(it.id) ?? null;
          return (
            <View key={it.id} className="border-b border-border-soft" style={{ paddingVertical: 10 }}>
              <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '700' }} numberOfLines={2}>{it.name}</Text>
              <View className="flex-row items-center" style={{ gap: 10, marginTop: 4 }}>
                <Text className="flex-1 text-text-secondary" style={{ fontSize: 12, fontWeight: '600', minWidth: 0 }} numberOfLines={2}>
                  {onHand(it)}{qtyOnly ? '' : unitPrice !== null ? (showAmounts ? ` · ${formatMoney(unitPrice)}/${it.unit}` : '') : mode === 'sell' ? ' · no price yet' : ''}{lastQty.has(it.id) ? ` · last time ${formatQty(lastQty.get(it.id) ?? 0, it.unit)}` : ''}
                </Text>
                <QtyStepper value={qty} onChange={(q) => setLine(it, { qty: q })} step={stepFor(it.unit)} unit={it.unit} label={it.name} />
              </View>
              {qty > 0 && !qtyOnly && !showAmounts && price === null ? (
                <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 8 }}>This item has no price yet. Ask the owner to set one before sending it.</Text>
              ) : null}
              {qty > 0 && showAmounts && !qtyOnly ? (
                <View className="flex-row items-center justify-between" style={{ marginTop: 8, gap: 10 }}>
                  <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }}>{mode === 'sell' ? 'Price' : 'Cost'} per {it.unit}</Text>
                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    <View style={{ width: 120 }}>
                      <TextField
                        value={price === null ? '' : String(price)}
                        onChange={(t) => {
                          const n = Number(t.replace(/[,\s]/g, ''));
                          setLine(it, { price: t.trim() === '' ? null : Number.isFinite(n) && n >= 0 ? n : 0 });
                        }}
                        label={`${it.name} ${mode === 'sell' ? 'price' : 'cost'} per ${it.unit}`}
                        keyboardType="decimal-pad"
                        prefix="₹"
                        placeholder="0"
                        flat
                      />
                    </View>
                    <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800', minWidth: 72, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                      {formatMoney(lineTotal(qty, price ?? 0))}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {chosen.length > 0 && !phone ? (
        <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '700', textAlign: 'right' }}>
          {chosen.length} {chosen.length === 1 ? 'item' : 'items'}{showAmounts && !qtyOnly ? ` · ${formatMoney(total)}` : ''}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * What a form has that would be lost on leaving (task 252): only lines with a quantity. A line
 * set back to 0 is the same as never added, so Back does not ask about it.
 */
export function typedLines(lines: DraftLines): DraftLines {
  return Object.fromEntries(Object.entries(lines).filter(([, l]) => l.qty > 0).sort(([a], [b]) => a.localeCompare(b)));
}

/** The lines worth saving: a quantity and a price on each. */
export function draftToLines(lines: DraftLines): { item_id: string; qty: number; price: number }[] | null {
  const out: { item_id: string; qty: number; price: number }[] = [];
  for (const [item_id, l] of Object.entries(lines)) {
    if (l.qty <= 0) continue;
    if (l.price === null || l.price < 0) return null;
    out.push({ item_id, qty: l.qty, price: l.price });
  }
  return out;
}

// ─── Against what: the open slips a payment covers ───────────────────────────

type OpenDocsPickerProps = {
  partyId: string | null;
  kind: KitchenPartyKind;
  itemsById: ReadonlyMap<string, KitchenItem>;
  ticked: ReadonlySet<string>;
  onChange: (docs: KitchenOpenDocument[], ticked: Set<string>) => void;
  /** The payment being edited: what it covers is offered again, ticked. */
  reopenPaymentId?: string;
};

/**
 * The pay-later buys (for a vendor) or the sends (for a branch) still open.
 * Ticking one tells the form what this money is for; the form fills the amount.
 */
export function OpenDocsPicker({ partyId, kind, itemsById, ticked, onChange, reopenPaymentId }: OpenDocsPickerProps) {
  const [docs, setDocs] = useState<KitchenOpenDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const entries = useKitchenStore((s) => s.entries);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  useEffect(() => {
    let cancelled = false;
    if (!partyId) {
      setDocs([]);
      onChange([], new Set());
      return;
    }
    setLoading(true);
    void fetchKitchenOpenDocuments(partyId, reopenPaymentId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      const list = res.data ?? [];
      setDocs(list);
      // Editing a payment: what it already covered starts ticked.
      onChange(list, new Set(list.filter((d) => d.reopened > 0).map((d) => d.entry_id)));
    });
    return () => {
      cancelled = true;
    };
    // The form owns `ticked`; only the party (and the payment being edited) decide which slips are offered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, reopenPaymentId]);

  if (!partyId) return null;
  const noun = kind === 'vendor' ? 'buys' : 'sends';
  if (!loading && docs.length === 0) {
    return <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600' }}>No open {noun}.</Text>;
  }
  return (
    <View className="rounded-2xl border border-border-soft bg-surface-elevated" style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
      {loading ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', paddingVertical: 14 }}>Looking up open {noun}…</Text> : null}
      {docs.map((d) => {
        const on = ticked.has(d.entry_id);
        const e = entryById.get(d.entry_id);
        const what = e ? e.lines.map((l) => itemsById.get(l.item_id)?.name ?? 'item').join(', ') : '';
        return (
          <Pressable
            key={d.entry_id}
            onPress={() => {
              const next = new Set(ticked);
              if (on) next.delete(d.entry_id);
              else next.add(d.entry_id);
              onChange(docs, next);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${d.type === 'bought' ? 'Buy' : 'Send'} of ${formatDayLabel(d.entry_date)}, ${formatMoney(d.open)} open`}
            // Task 226: the row reaches the card edges so its hover does; the divider stays inset.
            style={({ pressed }) => ({ marginHorizontal: -14, paddingHorizontal: 14, opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.borderSoft, gap: 12, paddingVertical: 12, minHeight: 58 }}>
            <Tick on={on} />
            <View className="flex-1" style={{ minWidth: 0 }}>
              <Text className="text-text-primary" style={{ fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
                {d.type === 'bought' ? 'Bought' : 'Sent'} · {formatDayLabel(d.entry_date)}
              </Text>
              {what ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{what}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(d.open)}</Text>
              {d.covered > 0 ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }}>of {formatMoney(d.amount)}</Text> : null}
            </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

/**
 * A small month under the When bar (task 241, owner's ask): one tap picks the day. Each day is a
 * full 44 px cell with no gaps between them; future days and days this login may not change are
 * greyed out. The chosen day is filled blue, today has a blue ring, and the month moves with the
 * arrows (never past this month).
 */
export function MiniCalendar({ value, onChange, today, isBlocked }: { value: string; onChange: (day: string) => void; today: string; isBlocked?: (day: string) => boolean }) {
  const [month, setMonth] = useState((isValidDateKey(value) ? value : today).slice(0, 7));
  const atLatest = month >= today.slice(0, 7);
  const cells = kitchenCalendarDays(month);
  const weeks: (typeof cells[number])[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const arrow = 'h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-tint active:bg-surface-tint';
  return (
    <View className="mt-2 rounded-2xl border border-border-soft bg-surface-elevated px-1.5 pb-1.5 pt-1" testID="kitchen-mini-calendar">
      <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(shiftKitchenMonth(month, -1))} className={arrow}>
          <ChevronLeft size={20} color={colors.primary} />
        </Pressable>
        <Text accessibilityLiveRegion="polite" className="text-[15px] font-bold text-text-primary">{kitchenMonthLabel(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={atLatest} accessibilityState={{ disabled: atLatest }} onPress={() => setMonth(shiftKitchenMonth(month, 1))} className={arrow} style={{ opacity: atLatest ? 0.3 : 1 }}>
          <ChevronRight size={20} color={colors.primary} />
        </Pressable>
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((d) => <Text key={d} className="flex-1 py-1 text-center text-xs font-bold text-text-secondary">{d}</Text>)}
      </View>
      {weeks.map((week, w) => (
        <View key={w} className="flex-row">
          {week.map((cell) => {
            if (!cell.date) return <View key={cell.key} className="h-11 flex-1" />;
            const day = cell.date;
            const on = day === value;
            const off = day > today || (isBlocked ? isBlocked(day) : false);
            return (
              <Pressable key={cell.key} {...(on || off ? {} : hoverFace)} disabled={off} onPress={() => onChange(day)}
                accessibilityRole="button" accessibilityLabel={formatLongDate(day)} aria-selected={on} accessibilityState={{ selected: on, disabled: off }}
                className="h-11 flex-1 items-center justify-center">
                <View {...(on || off ? {} : hoverFaceMark)} className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: on ? colors.primary : 'transparent', borderWidth: day === today && !on ? 1.5 : 0, borderColor: colors.primary, opacity: off ? 0.3 : 1 }}>
                  <Text className="text-sm font-bold" style={{ color: on ? colors.textOnPrimary : colors.textPrimary, fontVariant: ['tabular-nums'] }}>{Number(day.slice(8))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text className="px-2 pb-1 pt-1.5 text-[13px] font-semibold text-text-secondary">{isValidDateKey(value) ? formatLongDate(value) : 'Pick a day'}</Text>
    </View>
  );
}
