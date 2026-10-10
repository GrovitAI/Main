import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { SlidersHorizontal, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { useKitchenData } from '@/lib/pos/use-kitchen-store';
import { entryAmountText, entryHeadline, entrySubline } from '@/lib/pos/kitchen-utils';
import { kitchenMonthRange, kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { filterKitchenHistory, type HistoryFilters, type HistorySort } from '@/lib/pos/kitchen-history-utils';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';
import { Empty, KHeader, KScreen, Notice, SearchBox, useDesktopDensity } from '@/components/kitchen/ui';
import { HistoryEntry } from '@/components/kitchen/HistoryEntry';
import { EntryActions } from '@/components/kitchen/EntryActions';
import { ReportSelect } from '@/components/kitchen/ReportSelect';
import { ReportDateRange } from '@/components/kitchen/ReportDateRange';

const KINDS = [
  { id: 'sent', label: 'Sent' }, { id: 'received', label: 'Received' },
  { id: 'bought', label: 'Bought' }, { id: 'spent', label: 'Spent / vendor payments' }, { id: 'stock', label: 'Stock' },
] as const;
const STATUSES = [
  { id: 'active', label: 'Active · unedited' }, { id: 'edited', label: 'Edited · current version' },
  { id: 'replaced', label: 'Replaced · earlier version' }, { id: 'voided', label: 'Voided · removed' },
] as const;
const SORTS: readonly { id: HistorySort; label: string }[] = [
  { id: 'transaction-newest', label: 'Transaction date · newest' }, { id: 'transaction-oldest', label: 'Transaction date · oldest' },
  { id: 'recorded-newest', label: 'Entry date · newest' }, { id: 'recorded-oldest', label: 'Entry date · oldest' },
];
const DATE_BASES = [{ id: 'transaction', label: 'Transaction date' }, { id: 'recorded', label: 'Entry date (recorded)' }] as const;
const DEFAULTS: HistoryFilters = { kind: null, status: null, enteredBy: null, dateBasis: 'transaction', range: null, query: '', sort: 'transaction-newest' };
const button = 'min-h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-xl px-3 hover:bg-accent-soft active:opacity-70 focus:border focus:border-primary';

/** Audit history in the existing bounded store window; filtering never makes a request. */
export default function HistoryScreen() {
  const data = useKitchenData();
  const desktop = useDesktopDensity();
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULTS);
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const update = <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const staff = useMemo(() => [...new Set(data.entries.map(entry => entry.created_by))].sort((a, b) => a.localeCompare(b)).map(name => ({ id: name, label: name })), [data.entries]);
  const entriesById = useMemo(() => new Map(data.entries.map(entry => [entry.id, entry])), [data.entries]);
  const open = openId ? entriesById.get(openId) ?? null : null;
  const rows = useMemo(() => filterKitchenHistory(data.entries, filters, entry => {
    const names = { party: entry.party_id ? data.partiesById.get(entry.party_id)?.name : null, item: entry.item_id ? data.itemsById.get(entry.item_id)?.name : null };
    return [entryHeadline(entry, names), entrySubline(entry, data.itemsById), entryAmountText(entry), entry.purchase_category_name, entry.category, entry.note];
  }), [data.entries, data.partiesById, data.itemsById, filters]);
  const filterCount = [filters.kind, filters.status, filters.enteredBy, filters.range].filter(Boolean).length;
  const hasFilters = filterCount > 0 || filters.query.trim().length > 0;
  const reset = () => setFilters(current => ({ ...DEFAULTS, sort: current.sort }));
  const header = <View className="gap-2 pb-3">
    <KHeader title="History" subtitle="Entries, corrections and voids" right={
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh history" accessibilityState={{ disabled: data.loading }} disabled={data.loading} onPress={data.refresh} className={button}>
        {data.loading ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={18} color={colors.primary} />}
      </Pressable>
    } />
    {data.error ? <Notice text={data.error} /> : null}
    <SearchBox value={filters.query} onChange={value => update('query', value)} placeholder="Search staff, items, notes or amounts" />
    <View className="flex-row items-center gap-2">
      <Pressable accessibilityRole="button" accessibilityLabel="History filters" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(value => !value)} className={button + ' bg-surface-elevated'}>
        <SlidersHorizontal size={16} color={colors.primary} /><Text className="text-sm font-bold text-primary">Filters{filterCount ? ` (${filterCount})` : ''}</Text>
      </Pressable>
      <View className={'min-w-0 flex-1 ' + (desktop ? 'max-w-[320px]' : '')}><ReportSelect compact allowEmpty={false} label="Sort by" value={filters.sort} options={SORTS} onChange={value => update('sort', SORTS.find(option => option.id === value)?.id ?? DEFAULTS.sort)} /></View>
    </View>
    {showFilters ? <View testID="kitchen-history-filters" className="gap-2 rounded-xl border border-border-soft bg-surface-elevated p-3">
      <View className={desktop ? 'flex-row gap-2' : 'gap-2'}>
      <View className="flex-row gap-2 md:flex-1">
        <ReportSelect compact label="Type" value={filters.kind} options={KINDS} emptyLabel="All types" onChange={value => update('kind', KINDS.find(option => option.id === value)?.id ?? null)} />
        <ReportSelect compact label="Status" value={filters.status} options={STATUSES} emptyLabel="All statuses" onChange={value => update('status', STATUSES.find(option => option.id === value)?.id ?? null)} />
      </View>
      <View className="flex-row gap-2 md:flex-1">
        <ReportSelect compact label="Entered by" value={filters.enteredBy} options={staff} emptyLabel="All staff" onChange={value => update('enteredBy', value)} />
        <ReportSelect compact allowEmpty={false} label="Date filter uses" value={filters.dateBasis} options={DATE_BASES} onChange={value => update('dateBasis', DATE_BASES.find(option => option.id === value)?.id ?? 'transaction')} />
      </View>
      </View>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <ReportDateRange label="History dates" value={filters.range ?? kitchenMonthRange(kitchenToday().slice(0, 7))} placeholder={filters.range ? undefined : 'Choose date range'} onChange={value => update('range', value)} />
        {filters.range ? <Pressable accessibilityRole="button" onPress={() => update('range', null)} className={button}><Text className="text-sm font-semibold text-primary">Clear dates</Text></Pressable> : null}
      </View>
      <Text className="text-xs leading-4 text-text-secondary">Entry date is when it was recorded. Transaction date is when it happened. Dates use India time.</Text>
    </View> : null}
    <View className="flex-row items-center justify-between gap-2">
      <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 text-xs leading-4 text-text-secondary">{rows.length} of {data.entries.length} loaded entries · includes edits and voids</Text>
      {hasFilters ? <Pressable accessibilityRole="button" onPress={reset} className={button}><Text className="text-sm font-semibold text-primary">Clear filters</Text></Pressable> : null}
    </View>
    <Text className="text-xs leading-4 text-text-secondary">Recent history: up to 500 entries from the last 92 transaction days.{data.entries.length >= 500 ? ' The window is full; older entries may be outside this list.' : ''}</Text>
  </View>;

  return <KScreen scroll={false}>
    <FlatList<KitchenEntry> testID="kitchen-history-list" className={'w-full flex-1 ' + (desktop ? 'max-w-[1120px] self-start' : 'max-w-[720px] self-center')}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} data={data.loaded ? rows : []} keyExtractor={entry => entry.id}
      ListHeaderComponent={header} keyboardShouldPersistTaps="handled" refreshing={data.loading && data.loaded} onRefresh={data.refresh}
      initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
      ListEmptyComponent={!data.loaded ? <View className="items-center py-8"><ActivityIndicator color={colors.primary} accessibilityLabel="Loading history" /></View> :
        <Empty title={hasFilters ? 'Nothing matches' : data.error ? 'History unavailable' : 'Nothing recorded yet'} body={hasFilters ? 'Try another word, staff member, status or date range.' : data.error ? 'Use Refresh history to try again.' : 'Sends, payments, buys and counts will show here.'} action={hasFilters ? <Pressable accessibilityRole="button" onPress={reset} className={button}><Text className="text-sm font-bold text-primary">Clear filters</Text></Pressable> : undefined} />}
      renderItem={({ item }) => <HistoryEntry entry={item} itemsById={data.itemsById} partiesById={data.partiesById} onPress={() => setOpenId(item.id)} />} />
    <EntryActions entry={open} previousEntry={open?.replaces_id ? entriesById.get(open.replaces_id) ?? null : undefined} onClose={() => setOpenId(null)} itemsById={data.itemsById} partiesById={data.partiesById} />
  </KScreen>;
}
