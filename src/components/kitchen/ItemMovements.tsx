import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useResponsive } from '@/lib/pos/useResponsive';
import { kitchenMonthRange, kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { enteredNote, entryHeadline, entryNames, formatDayLabel, formatMoney, formatQty, itemMoveDays } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { ENTRY_ICONS, entryIconTone } from './EntryList';
import { ReportDateRange } from './ReportDateRange';
import { Empty, LinkButton, Row } from './ui';

const signed = (n: number, unit: string): string => (n === 0 ? 'No change' : `${n > 0 ? '+' : '−'}${formatQty(Math.abs(n), unit)}`);

/**
 * Task 301: one item's stock day by day. Each row says what happened and only this item's quantity;
 * the rest of a send is one tap away. Voided and replaced entries stay in History.
 */
export function ItemMovements({ itemId, unit, entries, itemsById, partiesById, showAmounts, onPress }: {
  itemId: string; unit: string; entries: readonly KitchenEntry[]; itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>; showAmounts: boolean; onPress: (entry: KitchenEntry) => void;
}) {
  // Task 306: the movements of chosen dates.
  const [range, setRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const days = useMemo(() => itemMoveDays(entries, itemId).filter((d) => !range || (d.date >= range.startDate && d.date <= range.endDate)), [entries, itemId, range]);
  const phone = !useResponsive().isTablet;
  return (
    <View>
      <View className="flex-row items-center gap-2 pt-3">
        <View className="min-w-0 flex-1"><ReportDateRange outlined label="Movement dates" value={range ?? kitchenMonthRange(kitchenToday().slice(0, 7))} triggerText={range ? undefined : 'Any dates'} onChange={setRange} /></View>
        {range ? <LinkButton label="Clear" onPress={() => setRange(null)} /> : null}
      </View>
      {days.length === 0 ? <Empty title={range ? 'Nothing on these dates' : 'No movements yet'} /> : null}
      {days.map((day) => (
        <View key={day.date}>
          <View className="flex-row items-baseline justify-between" style={{ paddingTop: 12, paddingBottom: 2 }}>
            <Text accessibilityRole="header" className="text-text-primary" style={{ fontSize: 13, fontWeight: '800' }}>{formatDayLabel(day.date)}</Text>
            {day.moves.length > 1 && day.net !== 0 ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{signed(day.net, unit)}</Text> : null}
          </View>
          {day.moves.map(({ entry, change, value }) => {
            const title = entry.type === 'made' ? 'Made' : entry.type === 'count' ? 'Counted' : entry.type === 'issued' ? 'Given to the kitchen' : entryHeadline(entry, entryNames(entry, partiesById, itemsById));
            const when = enteredNote(entry);
            const subtitle = [entry.type === 'count' && entry.qty !== null ? `Now ${formatQty(entry.qty, unit)}` : '', when, entry.note ?? ''].filter(Boolean).join(' · ');
            return (
              <Row key={entry.id} icon={phone ? ENTRY_ICONS[entry.type] : undefined} iconTone={entryIconTone(entry)} title={title} subtitle={subtitle}
                right={signed(change, unit)} rightSub={showAmounts && value !== null ? formatMoney(value) : undefined} tone={change > 0 ? 'in' : 'neutral'}
                onPress={() => onPress(entry)} accessibilityLabel={`${title}, ${signed(change, unit)}`} />
            );
          })}
        </View>
      ))}
    </View>
  );
}
