import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { entryAmountText, entryHeadline, entrySubline, isMoneyIn, isMoneyOut } from '@/lib/pos/kitchen-utils';
import { historyAuditText, historyDateLabel, historyStatus, historyTimeLabel, HISTORY_STATUS_LABELS } from '@/lib/pos/kitchen-history-utils';
import { toneColor } from '@/components/kitchen/ui';

/** History keeps audit information visible without adding it to everyday Home rows. */
export function HistoryEntry({ entry, itemsById, partiesById, onPress }: {
  entry: KitchenEntry; itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>; onPress: () => void;
}) {
  const names = { party: entry.party_id ? partiesById.get(entry.party_id)?.name : null, item: entry.item_id ? itemsById.get(entry.item_id)?.name : null };
  const title = entryHeadline(entry, names);
  const subtitle = entrySubline(entry, itemsById);
  const status = historyStatus(entry);
  const audit = historyAuditText(entry);
  const removed = entry.voided_at !== null;
  const amount = entryAmountText(entry);
  const tone = removed ? 'neutral' : isMoneyIn(entry) ? 'in' : isMoneyOut(entry) ? 'out' : 'neutral';
  return <Pressable testID="kitchen-history-entry" accessibilityRole="button"
    accessibilityLabel={`${title}, ${amount}, ${HISTORY_STATUS_LABELS[status]}. Transaction ${historyDateLabel(entry.entry_date)}. Entered by ${entry.created_by}, ${historyTimeLabel(entry.created_at)}${audit ? '. ' + audit : ''}`}
    onPress={onPress} className="min-h-12 gap-1 border-b border-border-soft bg-surface-elevated px-3 py-2.5 hover:bg-surface-tint active:bg-accent-soft focus:border-primary">
    <View className="flex-row flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <Text className={'min-w-0 flex-1 text-sm font-bold leading-5 ' + (removed ? 'text-text-secondary line-through' : 'text-text-primary')}>{title}</Text>
      {amount ? <Text className="text-sm font-bold leading-5" style={{ color: toneColor[tone], fontVariant: ['tabular-nums'] }}>{amount}</Text> : null}
    </View>
    {subtitle ? <Text className="text-xs leading-4 text-text-secondary" numberOfLines={1}>{subtitle}</Text> : null}
    <View className="gap-1 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      <Text className="text-xs leading-4 text-text-secondary">Entered by <Text className="font-semibold text-text-primary">{entry.created_by}</Text></Text>
      <Text className="text-xs leading-4 text-text-secondary">Transaction <Text className="font-semibold text-text-primary">{historyDateLabel(entry.entry_date)}</Text></Text>
    </View>
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Text className="text-xs leading-4 text-text-secondary">Entry {historyTimeLabel(entry.created_at)}</Text>
      <Text className={'rounded px-1.5 py-0.5 text-xs font-semibold leading-4 ' + (status === 'edited' ? 'bg-accent-soft text-primary' : 'bg-surface-tint text-text-secondary')}>{HISTORY_STATUS_LABELS[status]}</Text>
    </View>
    </View>
    {audit && status !== 'edited' ? <Text className="text-xs leading-4 text-text-secondary">{audit}</Text> : null}
  </Pressable>;
}
