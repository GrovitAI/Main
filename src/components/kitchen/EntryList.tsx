import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { ArrowUpRight, ArrowDownLeft, ShoppingBag, ArrowUp, Receipt, CookingPot, ClipboardList, type LucideIcon } from 'lucide-react-native';
import type { KitchenEntry, KitchenEntryType, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { entryAmountText, entryHeadline, entrySubline, formatDayLabel, formatEnteredAt, isMoneyIn, isMoneyOut, newestFirst } from '@/lib/pos/kitchen-utils';
import { Row, type Tone } from './ui';

const ICONS: Record<KitchenEntryType, LucideIcon> = {
  sent: ArrowUpRight,
  received: ArrowDownLeft,
  bought: ShoppingBag,
  paid: ArrowUp,
  spent: Receipt,
  made: CookingPot,
  count: ClipboardList,
};

function iconTone(e: KitchenEntry): Tone {
  if (e.type === 'sent') return 'primary';
  if (e.type === 'bought') return 'buy';
  if (isMoneyIn(e)) return 'in';
  if (isMoneyOut(e)) return 'out';
  return 'neutral';
}

function amountTone(e: KitchenEntry): Tone {
  if (isMoneyIn(e)) return 'in';
  if (isMoneyOut(e)) return 'out';
  return 'neutral';
}

type Props = {
  entries: readonly KitchenEntry[];
  itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>;
  /** Day headings between days; off inside a card that is already one day. */
  grouped?: boolean;
  onPress?: (entry: KitchenEntry) => void;
};

/**
 * Entries newest first, each a row with who, what and how much. The day
 * heading is the date the thing happened; under the amount sits when it was
 * keyed in, so a back-dated entry shows both.
 */
export function EntryList({ entries, itemsById, partiesById, grouped = true, onPress }: Props) {
  const ordered = useMemo(() => newestFirst(entries), [entries]);
  let lastDay = '';
  return (
    <View>
      {ordered.map((e) => {
        const names = { party: e.party_id ? partiesById.get(e.party_id)?.name : null, item: e.item_id ? itemsById.get(e.item_id)?.name : null };
        const heading = grouped && e.entry_date !== lastDay ? e.entry_date : null;
        lastDay = e.entry_date;
        return (
          <React.Fragment key={e.id}>
            {heading ? (
              <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingTop: 16, paddingBottom: 4 }}>
                {formatDayLabel(heading)}
              </Text>
            ) : null}
            <Row
              icon={ICONS[e.type]}
              iconTone={e.voided_at ? 'neutral' : iconTone(e)}
              title={entryHeadline(e, names)}
              subtitle={entrySubline(e, itemsById)}
              right={entryAmountText(e) || undefined}
              rightSub={formatEnteredAt(e.created_at)}
              tone={amountTone(e)}
              muted={e.voided_at !== null}
              onPress={onPress ? () => onPress(e) : undefined}
              accessibilityLabel={`${entryHeadline(e, names)}, ${entryAmountText(e) || entrySubline(e, itemsById)}${e.voided_at ? ', voided' : ''}`}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
}
