import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { entryAmountText, entryHeadline, entrySubline, isMoneyIn, isMoneyOut } from '@/lib/pos/kitchen-utils';
import { historyAuditText, historyDateLabel, historyStatus, historyTimeLabel, HISTORY_STATUS_LABELS } from '@/lib/pos/kitchen-history-utils';
import { toneColor, useDesktopDensity } from '@/components/kitchen/ui';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';

/** History keeps audit information visible without adding it to everyday Home rows. */
export function HistoryEntry({ entry, itemsById, partiesById, onPress }: {
  entry: KitchenEntry; itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>; onPress: () => void;
}) {
  const desktop = useDesktopDensity();
  const names = { party: entry.party_id ? partiesById.get(entry.party_id)?.name : null, item: entry.item_id ? itemsById.get(entry.item_id)?.name : null };
  const title = entryHeadline(entry, names);
  const subtitle = entrySubline(entry, itemsById);
  const status = historyStatus(entry);
  const audit = historyAuditText(entry);
  const removed = entry.voided_at !== null;
  const { showAmounts } = useKitchenAccess();
  const amount = showAmounts ? entryAmountText(entry) : '';
  const tone = removed ? 'neutral' : isMoneyIn(entry) ? 'in' : isMoneyOut(entry) ? 'out' : 'neutral';
  return <Pressable testID="kitchen-history-entry" accessibilityRole="button"
    accessibilityLabel={`${title}, ${amount}, ${HISTORY_STATUS_LABELS[status]}. Transaction ${historyDateLabel(entry.entry_date)}. Entered by ${entry.created_by}, ${historyTimeLabel(entry.created_at)}${audit ? '. ' + audit : ''}`}
    onPress={onPress} className={`min-h-12 gap-2 border-b border-border-soft bg-surface-elevated px-3 py-3 hover:bg-surface-tint active:bg-accent-soft focus:border-primary ${desktop ? 'flex-row gap-5' : ''}`}>
    <View className={`min-w-0 flex-row items-start gap-3 ${desktop ? 'w-[58%]' : ''}`}>
      <View className="min-w-0 flex-1 gap-1">
        <Text className={'text-sm font-bold leading-5 ' + (removed ? 'text-text-secondary line-through' : 'text-text-primary')}>{title}</Text>
        {subtitle ? <Text className="text-xs leading-4 text-text-secondary" numberOfLines={desktop ? 1 : 2}>{subtitle}</Text> : null}
        {desktop ? <Text className="text-xs leading-4 text-text-secondary">Transaction <Text className="font-semibold text-text-primary">{historyDateLabel(entry.entry_date)}</Text></Text> : null}
      </View>
      <View className={`shrink-0 items-end gap-1 ${desktop ? 'w-[156px]' : 'max-w-[42%]'}`}>
        {amount ? <Text className="text-right text-sm font-bold leading-5" style={{ color: toneColor[tone], fontVariant: ['tabular-nums'] }}>{amount}</Text> : null}
        <Text className={'rounded px-1.5 py-0.5 text-xs font-semibold leading-4 ' + (status === 'edited' ? 'bg-accent-soft text-primary' : 'bg-surface-tint text-text-secondary')}>{HISTORY_STATUS_LABELS[status]}</Text>
      </View>
    </View>
    <View className={`min-w-0 gap-1 ${desktop ? 'flex-1 border-l border-border-soft pl-5' : 'border-t border-border-soft pt-2'}`}>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        <Text className="text-xs leading-4 text-text-secondary">Entered by <Text className="font-semibold text-text-primary">{entry.created_by}</Text></Text>
        {!desktop ? <Text className="text-xs leading-4 text-text-secondary">Transaction <Text className="font-semibold text-text-primary">{historyDateLabel(entry.entry_date)}</Text></Text> : null}
      </View>
      <Text className="text-xs leading-4 text-text-secondary">Entry {historyTimeLabel(entry.created_at)}</Text>
    {audit && status !== 'edited' ? <Text className="text-xs leading-4 text-text-secondary">{audit}</Text> : null}
    </View>
  </Pressable>;
}
