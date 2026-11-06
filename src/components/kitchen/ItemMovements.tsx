import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useResponsive } from '@/lib/pos/useResponsive';
import { enteredNote, entryHeadline, entryNames, formatDayLabel, formatMoney, formatQty, itemMoveDays } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { ENTRY_ICONS, entryIconTone } from './EntryList';
import { Empty, Row } from './ui';

const signed = (n: number, unit: string): string => (n === 0 ? 'No change' : `${n > 0 ? '+' : '−'}${formatQty(Math.abs(n), unit)}`);

/**
 * Task 301: one item's stock day by day. Each row says what happened and only this item's quantity;
 * the rest of a send is one tap away. Voided and replaced entries stay in History.
 */
export function ItemMovements({ itemId, unit, entries, itemsById, partiesById, showAmounts, onPress }: {
  itemId: string; unit: string; entries: readonly KitchenEntry[]; itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>; showAmounts: boolean; onPress: (entry: KitchenEntry) => void;
}) {
  const days = useMemo(() => itemMoveDays(entries, itemId), [entries, itemId]);
  const phone = !useResponsive().isTablet;
  if (days.length === 0) return <Empty title="No movements yet" />;
  return (
    <View>
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
