import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { ListChecks } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { fetchKitchenEntries } from '@/lib/pos/kitchen-service';
import { kitchenMonthRange, kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { batchDayTotals, enteredNote, entryDays, formatDayLabel, formatQty, matchesSearch } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenItem } from '@/lib/pos/kitchen-types';
import { EntryActions } from './EntryActions';
import { PickBar, PickRow } from './PickRow';
import { ReportDateRange } from './ReportDateRange';
import { VoidManySheet } from './VoidManySheet';
import { Card, Empty, KScreen, LinkButton, Notice, Row, SearchBox } from './ui';

type HistoryType = 'made' | 'count' | 'issued';
type Range = { startDate: string; endDate: string };

const signed = (n: number, unit: string): string => (n === 0 ? 'No change' : `${n > 0 ? '+' : '−'}${formatQty(Math.abs(n), unit).trim()}`);

/** What a row says: the item or how many, and for a stock entry how far it moved this item. */
function describe(e: KitchenEntry, items: ReadonlyMap<string, KitchenItem>): { title: string; detail: string; right: string | undefined; rising: boolean; search: string } {
  const item = e.item_id ? items.get(e.item_id) : undefined;
  if (e.type === 'made') return { title: item?.name ?? 'Removed item', detail: '', right: signed(e.qty ?? 0, item?.unit ?? ''), rising: true, search: item?.name ?? '' };
  if (e.type === 'count') {
    const change = e.qty === null || e.from_qty === null ? 0 : Math.round((e.qty - e.from_qty) * 1000) / 1000;
    return { title: item?.name ?? 'Removed item', detail: `Now ${formatQty(e.qty ?? 0, item?.unit ?? '').trim()}`, right: signed(change, item?.unit ?? ''), rising: change > 0, search: item?.name ?? '' };
  }
  const names = e.lines.map((l) => items.get(l.item_id)?.name ?? 'Removed item');
  const first = e.lines[0];
  if (e.lines.length === 1 && first) return { title: names[0] ?? '', detail: '', right: signed(-first.qty, items.get(first.item_id)?.unit ?? ''), rising: false, search: names.join(' ') };
  return { title: `${e.lines.length} items`, detail: names.join(', '), right: undefined, rising: false, search: names.join(' ') };
}

/**
 * Tasks 304 and 306: the Previous tab of batches, counts and gives. Day by day, found by a word or
 * by dates; a tap opens one to edit or delete it, and several can be picked and deleted together.
 */
export function EntryHistory({ type, top, emptyTitle }: { type: HistoryType; top: React.ReactNode; emptyTitle: string }) {
  const data = useKitchenData();
  const access = useKitchenAccess();
  const [entries, setEntries] = useState<KitchenEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let current = true;
    setError(null);
    void fetchKitchenEntries({ types: [type], limit: 300, from: range?.startDate, to: range?.endDate }).then((res) => {
      if (!current) return;
      setEntries(res.data ?? []);
      setError(res.error);
    });
    return () => { current = false; };
  }, [type, range, data.loadedAt]);

  const days = useMemo(() => entryDays((entries ?? []).filter((e) => matchesSearch(query, describe(e, data.itemsById).search, e.note ?? '', e.created_by)), [type]), [entries, query, data.itemsById, type]);
  const open = openId ? entries?.find((e) => e.id === openId) ?? null : null;
  const mayPick = (e: KitchenEntry): boolean => access.isOwner || (access.canFix(e) && !access.isLocked(e.entry_date));
  const toggle = (id: string): void => setPicked((now) => { const next = new Set(now); if (!next.delete(id)) next.add(id); return next; });
  const stopPicking = (): void => { setPicking(false); setPicked(new Set()); setConfirming(false); };
  const pickedEntries = (entries ?? []).filter((e) => picked.has(e.id) && mayPick(e));

  return (
    <KScreen footer={picking ? <PickBar count={pickedEntries.length} onDelete={() => setConfirming(true)} /> : undefined}>
      {top}
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1"><SearchBox value={query} onChange={setQuery} placeholder="Search" /></View>
        <Pressable onPress={() => (picking ? stopPicking() : setPicking(true))} accessibilityRole="button" accessibilityLabel={picking ? 'Stop selecting' : 'Select entries'} aria-selected={picking}
          className={'h-11 w-11 items-center justify-center rounded-xl border border-border-soft ' + (picking ? 'bg-accent-soft' : 'bg-surface-elevated hover:bg-surface-tint')}>
          <ListChecks size={18} color={colors.primary} />
        </Pressable>
      </View>
      <View className="mt-2 flex-row items-center gap-2">
        <View className="min-w-0 flex-1"><ReportDateRange outlined label="Dates" value={range ?? kitchenMonthRange(kitchenToday().slice(0, 7))} triggerText={range ? undefined : 'Any dates'} onChange={setRange} /></View>
        {range ? <LinkButton label="Clear" onPress={() => setRange(null)} /> : null}
      </View>
      {error ? <Notice text={error} /> : null}
      {entries === null && !error ? <ActivityIndicator accessibilityLabel="Loading entries" color={colors.primary} className="my-6" /> : null}
      {entries !== null && days.length === 0 && !error ? <Empty title={query || range ? 'Nothing matches that' : emptyTitle} /> : null}
      {days.length > 0 ? (
        <Card padded={false} style={{ paddingHorizontal: 14, marginTop: 12, overflow: 'hidden' }}>
          {days.map((day) => {
            const totals = type === 'made' && day.entries.length > 1 ? batchDayTotals(day.entries, data.itemsById) : '';
            return (
              <View key={day.date}>
                <Text accessibilityRole="header" className="text-text-primary" style={{ fontSize: 13, fontWeight: '800', paddingTop: 12, paddingBottom: 2 }}>{formatDayLabel(day.date)}</Text>
                {totals ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700', paddingBottom: 2 }}>{totals}</Text> : null}
                {day.entries.map((e) => {
                  const d = describe(e, data.itemsById);
                  const subtitle = [e.replaces_id ? 'Edited' : '', d.detail, e.created_by, enteredNote(e), e.note ?? ''].filter(Boolean).join(' · ');
                  const allowed = mayPick(e);
                  const label = `${d.title}, ${d.right ?? ''}, ${formatDayLabel(day.date)}`;
                  const row = <Row title={d.title} subtitle={subtitle} right={d.right} tone={d.rising ? 'in' : 'neutral'} accessibilityLabel={label} onPress={() => { if (!picking) setOpenId(e.id); else if (allowed) toggle(e.id); }} />;
                  return picking ? <PickRow key={e.id} on={picked.has(e.id)} allowed={allowed} onToggle={() => toggle(e.id)}>{row}</PickRow> : <View key={e.id}>{row}</View>;
                })}
              </View>
            );
          })}
        </Card>
      ) : null}
      <View style={{ height: 8 }} />
      <EntryActions entry={open} onClose={() => setOpenId(null)} itemsById={data.itemsById} partiesById={data.partiesById} />
      <VoidManySheet visible={confirming} entries={pickedEntries} onClose={() => setConfirming(false)} onDone={stopPicking} onPartly={(left) => setPicked(new Set(left))} />
    </KScreen>
  );
}
