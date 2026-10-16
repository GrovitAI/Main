import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from 'react-native';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, SlidersHorizontal, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { useKitchenData } from '@/lib/pos/use-kitchen-store';
import { entryAmountText, entryHeadline, entrySubline } from '@/lib/pos/kitchen-utils';
import { kitchenMonthRange, kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { filterKitchenHistory, historySections, type HistoryFilters, type HistoryListItem, type HistorySort } from '@/lib/pos/kitchen-history-utils';
import { Empty, KHeader, KScreen, Notice, Reveal, ScrollPills, SearchBox, SkeletonRows, useDesktopDensity } from '@/components/kitchen/ui';
import { HistoryEntry } from '@/components/kitchen/HistoryEntry';
import { EntryActions } from '@/components/kitchen/EntryActions';
import { ReportSelect } from '@/components/kitchen/ReportSelect';
import { ReportDateRange } from '@/components/kitchen/ReportDateRange';
import { HistoryFilterSheet } from '@/components/kitchen/HistoryFilterSheet';

const KINDS = [
  { id: 'sent', label: 'Sent' }, { id: 'received', label: 'Received' },
  { id: 'bought', label: 'Bought' }, { id: 'spent', label: 'Spent / vendor payments' }, { id: 'stock', label: 'Stock' },
] as const;
const STATUSES = [
  { id: 'current', label: 'Current · what counts now' }, { id: 'edited', label: 'Edited · with the earlier version' },
  { id: 'voided', label: 'Voided · removed' },
] as const;
const SORTS: readonly { id: HistorySort; label: string }[] = [
  { id: 'transaction-newest', label: 'Transaction date · newest' }, { id: 'transaction-oldest', label: 'Transaction date · oldest' },
  { id: 'recorded-newest', label: 'Entry date · newest' }, { id: 'recorded-oldest', label: 'Entry date · oldest' },
];
const DATE_BASES = [{ id: 'transaction', label: 'Transaction date' }, { id: 'recorded', label: 'Entry date (recorded)' }] as const;
/** A phone's quick type filter (task 233); the filter sheet still holds every filter. */
const QUICK_KINDS = [{ value: 'all', label: 'All' }, { value: 'sent', label: 'Sent' }, { value: 'received', label: 'Received' }, { value: 'bought', label: 'Bought' }, { value: 'spent', label: 'Spent' }, { value: 'stock', label: 'Stock' }] as const;
const DEFAULTS: HistoryFilters = { kind: null, status: null, enteredBy: null, dateBasis: 'transaction', range: null, query: '', sort: 'transaction-newest' };
const button = 'min-h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-xl px-3 hover:bg-accent-soft active:opacity-70 focus:border focus:border-primary';

/** Audit history in the existing bounded store window; filtering never makes a request. */
export default function HistoryScreen() {
  const data = useKitchenData();
  const desktop = useDesktopDensity();
  const phone = useWindowDimensions().width < 640;
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
  // Task 216: a heading for each day, pinned at the top while its entries scroll.
  const sections = useMemo(() => historySections(rows, filters.sort), [rows, filters.sort]);
  // Once the toolbar has scrolled away, a bar above the list names the day of the
  // topmost entry. (The list's own sticky headers misplace rows in the browser.)
  const dayOf = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    let day: { label: string; count: number } | null = null;
    for (const item of sections.items) { if (item.kind === 'day') day = { label: item.label, count: item.count }; if (day) map.set(item.key, day); }
    return map;
  }, [sections]);
  const dayRef = useRef(dayOf);
  dayRef.current = dayOf;
  const [pinnedDay, setPinnedDay] = useState<{ label: string; count: number } | null>(null);
  const headerHeight = useRef(0);
  const pastHeader = useRef(false);
  const topKey = useRef<string | null>(null);
  const syncPinned = useRef(() => setPinnedDay(pastHeader.current && topKey.current ? dayRef.current.get(topKey.current) ?? null : null)).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<HistoryListItem>[] }) => { topKey.current = viewableItems[0]?.key ?? null; syncPinned(); }).current;
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const past = event.nativeEvent.contentOffset.y > headerHeight.current;
    if (past !== pastHeader.current) { pastHeader.current = past; syncPinned(); }
  };
  const filterCount = [filters.kind, filters.status, filters.enteredBy, filters.range].filter(Boolean).length;
  const hasFilters = filterCount > 0 || filters.query.trim().length > 0;
  const reset = () => setFilters(current => ({ ...DEFAULTS, sort: current.sort }));
  const header = <View className="gap-2 pb-3" onLayout={event => { headerHeight.current = event.nativeEvent.layout.height; }}>
    <KHeader title="History" subtitle="Entries, corrections and voids" right={
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh history" accessibilityState={{ disabled: data.loading }} disabled={data.loading} onPress={data.refresh} className={button}>
        {data.loading ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={18} color={colors.primary} />}
      </Pressable>
    } />
    {data.error ? <Notice text={data.error} /> : null}
    <View testID="kitchen-history-toolbar" className={'gap-2 ' + (desktop ? 'flex-row items-center' : '')}>
      <View className="min-w-0 flex-1"><SearchBox value={filters.query} onChange={value => update('query', value)} placeholder="Search staff, items, notes or amounts" /></View>
      <View className={'flex-row items-center gap-2 ' + (desktop ? 'shrink-0' : '')}>
      <Pressable accessibilityRole="button" accessibilityLabel="History filters" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(value => !value)} className={button + ' border border-border ' + (showFilters || filterCount ? 'bg-accent-soft' : 'bg-surface-elevated')}>
        <SlidersHorizontal size={16} color={colors.primary} /><Text className="text-sm font-bold text-primary">Filters{filterCount ? ` (${filterCount})` : ''}</Text>
      </Pressable>
      <View className={'min-w-0 ' + (desktop ? 'w-[220px]' : 'flex-1')}><ReportSelect toolbar allowEmpty={false} label="Sort by" value={filters.sort} options={SORTS} triggerText={filters.sort.startsWith('transaction') ? desktop ? 'Transaction date' : 'Transaction' : 'Entry date'} triggerIcon={filters.sort.endsWith('newest') ? ArrowDownWideNarrow : ArrowUpWideNarrow} onChange={value => update('sort', SORTS.find(option => option.id === value)?.id ?? DEFAULTS.sort)} /></View>
      </View>
    </View>
    {phone ? <ScrollPills label="Entry type" options={QUICK_KINDS} value={filters.kind ?? 'all'} onChange={value => update('kind', value === 'all' ? null : value)} /> : null}
    {!phone ? <Reveal open={showFilters}><View testID="kitchen-history-filters" className={'rounded-xl border border-border-soft bg-surface-elevated ' + (phone ? 'gap-2 p-2' : 'gap-4 p-3 ') + (desktop ? 'flex-row' : '')}>
      <View className={'min-w-0 ' + (phone ? 'gap-1.5 ' : 'gap-3 ') + (desktop ? 'flex-1' : '')}>
        {!phone ? <Text accessibilityRole="header" className="text-base font-semibold text-text-primary">Entry details</Text> : null}
        <View className={phone ? 'gap-1.5' : 'gap-3 sm:flex-row'}>
          <ReportSelect outlined inlineLabel={phone ? 'Type' : undefined} label="Type" value={filters.kind} options={KINDS} emptyLabel="All types" onChange={value => update('kind', KINDS.find(option => option.id === value)?.id ?? null)} />
          <ReportSelect outlined inlineLabel={phone ? 'Status' : undefined} label="Status" value={filters.status} options={STATUSES} triggerText={STATUSES.find(option => option.id === filters.status)?.label.split(' · ')[0]} emptyLabel="All entries" onChange={value => update('status', STATUSES.find(option => option.id === value)?.id ?? null)} />
          <ReportSelect outlined inlineLabel={phone ? 'Entered by' : undefined} label="Entered by" value={filters.enteredBy} options={staff} emptyLabel="All staff" onChange={value => update('enteredBy', value)} />
        </View>
      </View>
      <View className={'border-border-soft ' + (phone ? 'gap-1.5 border-t pt-2' : 'gap-3 ') + (desktop ? 'w-[400px] shrink-0 border-l pl-4' : phone ? '' : 'border-t pt-3')}>
        {!phone ? <Text accessibilityRole="header" className="text-base font-semibold text-text-primary">Dates</Text> : null}
        <View className={phone ? 'gap-1.5' : 'gap-3 sm:flex-row'}>
        <ReportSelect outlined inlineLabel={phone ? 'Date basis' : undefined} allowEmpty={false} label="Date filter uses" value={filters.dateBasis} options={DATE_BASES} onChange={value => update('dateBasis', DATE_BASES.find(option => option.id === value)?.id ?? 'transaction')} />
        <View className="min-w-0 flex-1 gap-1">{!phone ? <Text className="text-xs font-bold text-text-secondary">Date range</Text> : null}<ReportDateRange outlined inlineLabel={phone ? 'Date range' : undefined} triggerText={phone && !filters.range ? 'Any dates' : undefined} label="History dates" value={filters.range ?? kitchenMonthRange(kitchenToday().slice(0, 7))} placeholder={filters.range ? undefined : 'Choose date range'} onChange={value => update('range', value)} /></View>
        </View>
        {filters.range ? <Pressable accessibilityRole="button" onPress={() => update('range', null)} className={button}><Text className="text-sm font-semibold text-primary">Clear dates</Text></Pressable> : null}
        <Text className="text-xs leading-4 text-text-secondary">{phone ? 'Transaction: happened · Entry: recorded · India time.' : 'Transaction date: when it happened. Entry date: when it was recorded. India time.'}</Text>
      </View>
    </View></Reveal> : null}
    <View className="flex-row items-center justify-between gap-2">
      <Text accessibilityLiveRegion="polite" className="min-w-0 flex-1 text-xs leading-4 text-text-secondary">{rows.length} of {data.entries.length} loaded entries · includes edits and voids</Text>
      {hasFilters ? <Pressable accessibilityRole="button" onPress={reset} className={button}><Text className="text-sm font-semibold text-primary">Clear filters</Text></Pressable> : null}
    </View>
    <Text className="text-xs leading-4 text-text-secondary">Recent history: up to 500 entries from the last 92 transaction days.{data.entries.length >= 500 ? ' The window is full; older entries may be outside this list.' : ''}</Text>
  </View>;

  return <KScreen scroll={false}>
    <View className={'w-full flex-1 ' + (desktop ? 'max-w-[1120px] self-center' : 'max-w-[720px] self-center')}>
    <FlatList<HistoryListItem> testID="kitchen-history-list" className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} data={data.loaded ? sections.items : []} keyExtractor={item => item.key}
      onScroll={onScroll} scrollEventThrottle={16} onViewableItemsChanged={onViewable}
      ListHeaderComponent={header} keyboardShouldPersistTaps="handled" refreshing={data.loading && data.loaded} onRefresh={data.refresh}
      initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
      ListEmptyComponent={!data.loaded ? <SkeletonRows count={6} height={64} label="Loading history" /> :
        <Empty title={hasFilters ? 'Nothing matches' : data.error ? 'History unavailable' : 'Nothing recorded yet'} body={hasFilters ? 'Try another word, staff member, status or date range.' : data.error ? 'Use Refresh history to try again.' : 'Sends, payments, buys and counts will show here.'} action={hasFilters ? <Pressable accessibilityRole="button" onPress={reset} className={button}><Text className="text-sm font-bold text-primary">Clear filters</Text></Pressable> : undefined} />}
      renderItem={({ item }) => item.kind === 'day'
        ? <DayHeading label={item.label} count={item.count} />
        : <HistoryEntry entry={item.entry} itemsById={data.itemsById} partiesById={data.partiesById} onPress={() => setOpenId(item.entry.id)} />} />
    {pinnedDay && data.loaded ? <View pointerEvents="none" testID="kitchen-history-pinned-day" style={{ position: 'absolute', top: 0, left: 16, right: 16 }}><DayHeading label={pinnedDay.label} count={pinnedDay.count} /></View> : null}
    </View>
    {phone ? <HistoryFilterSheet visible={showFilters} onClose={() => setShowFilters(false)} onReset={reset}
      fields={[
        <ReportSelect key="kind" compact outlined label="Type" value={filters.kind} options={KINDS} emptyLabel="All types" onChange={value => update('kind', KINDS.find(option => option.id === value)?.id ?? null)} />,
        <ReportSelect key="status" compact outlined label="Status" value={filters.status} options={STATUSES} triggerText={STATUSES.find(option => option.id === filters.status)?.label.split(' · ')[0]} emptyLabel="All entries" onChange={value => update('status', STATUSES.find(option => option.id === value)?.id ?? null)} />,
        <ReportSelect key="staff" compact outlined label="Entered by" value={filters.enteredBy} options={staff} emptyLabel="All staff" onChange={value => update('enteredBy', value)} />,
        <ReportSelect key="basis" compact outlined allowEmpty={false} label="Date filter uses" triggerText={filters.dateBasis === 'transaction' ? 'Transaction' : 'Entry date'} value={filters.dateBasis} options={DATE_BASES} onChange={value => update('dateBasis', DATE_BASES.find(option => option.id === value)?.id ?? 'transaction')} />,
      ]}
      dates={<>
        <ReportDateRange outlined inlineLabel="Date range" triggerText={!filters.range ? 'Any dates' : undefined} label="History dates" value={filters.range ?? kitchenMonthRange(kitchenToday().slice(0, 7))} placeholder={filters.range ? undefined : 'Choose date range'} onChange={value => update('range', value)} />
        {filters.range ? <Pressable accessibilityRole="button" onPress={() => update('range', null)} className={button}><Text className="text-sm font-semibold text-primary">Clear dates</Text></Pressable> : null}
        <Text className="text-xs leading-4 text-text-secondary">Transaction: happened · Entry: recorded · India time.</Text>
      </>} /> : null}
    <EntryActions entry={open} previousEntry={open?.replaces_id ? entriesById.get(open.replaces_id) ?? null : undefined} onClose={() => setOpenId(null)} itemsById={data.itemsById} partiesById={data.partiesById} />
  </KScreen>;
}

function DayHeading({ label, count }: { label: string; count: number }) {
  return <View accessibilityRole="header" className="flex-row items-baseline gap-2 border-b border-border-soft px-1 pb-1.5 pt-3" style={{ backgroundColor: colors.kitchenCanvas }}>
    <Text className="text-sm font-bold text-primary">{label}</Text>
    <Text className="text-xs text-text-secondary">{count} {count === 1 ? 'entry' : 'entries'}</Text>
  </View>;
}
