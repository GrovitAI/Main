import { useMemo, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { ChevronRight, Plus, RefreshCw } from 'lucide-react-native';
import { chart, colors, semantic } from '@/lib/pos/brand';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import type { KitchenItem, KitchenItemKind } from '@/lib/pos/kitchen-types';
import { formatDayLabel, formatMoney, formatQty, matchesSearch, stockLevels, type StockLevel } from '@/lib/pos/kitchen-utils';
import { Chips, Empty, GhostButton, IconButton, KHeader, Notice, Row, SearchBox, Segmented, QtyFigure, toneColor, toneSoft, useDesktopDensity, useEnterOnChange } from '@/components/kitchen/ui';
import { ItemDetail } from '@/components/kitchen/ItemDetail';
import { stockActions } from '@/components/kitchen/record-actions';

type LevelFilter = 'all' | 'low' | 'out';

/**
 * A phone's stock row (task 230): the item, its price line and when it was last counted, the
 * quantity with "of 56" or Low or Out, and a level bar against the last count.
 */
function StockRow({ item, level, subtitle, onPress, first, last }: { item: KitchenItem; level: StockLevel | undefined; subtitle: string; onPress: () => void; first: boolean; last: boolean }) {
  const state = level?.state ?? 'unknown';
  const tone = state === 'out' ? semantic.danger : state === 'low' ? semantic.warning : colors.textPrimary;
  const side = state === 'out' ? 'Out' : state === 'low' ? 'Low' : level?.ref ? `of ${formatQty(level.ref, item.unit)}` : 'in stock';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.name}, ${formatQty(item.stock, item.unit)} in stock${state === 'low' ? ', low' : state === 'out' ? ', out' : ''}`}
      className={`border-x border-b border-border-soft bg-surface-elevated px-3.5 py-3 active:opacity-70 ${first ? 'rounded-t-[20px] border-t' : ''} ${last ? 'rounded-b-[20px]' : ''}`}>
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-text-primary" numberOfLines={2}>{item.name}</Text>
          <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{subtitle}{level?.countedOn ? ` · counted ${formatDayLabel(level.countedOn)}` : ' · not counted yet'}</Text>
        </View>
        <View className="items-end">
          <QtyFigure qty={item.stock} unit={item.unit} size={16} color={tone} />
          <Text className="text-xs font-bold" style={{ color: state === 'ok' || state === 'unknown' ? colors.textSecondary : tone }}>{side}</Text>
        </View>
      </View>
      {level?.ref ? (
        <View className="mt-2.5 h-[7px] overflow-hidden rounded-full" style={{ backgroundColor: chart.grid }}>
          <View className="h-full rounded-full" style={{ width: `${Math.round(level.share * 100)}%`, backgroundColor: state === 'low' ? chart.pending : colors.primary }} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Each kind shares the incumbent stock list and tablet master/detail pattern. */
export function StockItems({ kind: routeKind }: { kind: KitchenItemKind }) {
  const data = useKitchenData();
  const { isTablet } = useResponsive();
  // On a phone both kinds share one Stock tab: the switch changes the list in
  // place, so its highlight slides and the rows come in from the side chosen.
  // The rail opens each kind as its own section.
  const [phoneKind, setPhoneKind] = useState(routeKind);
  const kind = isTablet ? routeKind : phoneKind;
  const listEnter = useEnterOnChange(kind === 'finished_good' ? '1' : '0', 'x');
  const desktop = useDesktopDensity();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const finished = kind === 'finished_good';
  const title = finished ? 'Finished goods' : 'Raw materials';
  const kindItems = useMemo(() => data.items.filter(i => i.item_kind === kind && matchesSearch(query, i.name, i.unit)), [data.items, kind, query]);
  // Task 230: a phone filters by level, with each item's level against its last count.
  const levels = useMemo(() => stockLevels(data.entries, data.items), [data.entries, data.items]);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const lowCount = kindItems.filter(i => levels.get(i.id)?.state === 'low').length;
  const outCount = kindItems.filter(i => levels.get(i.id)?.state === 'out').length;
  const rows = useMemo(() => isTablet || levelFilter === 'all' ? kindItems : kindItems.filter(i => levels.get(i.id)?.state === levelFilter), [kindItems, levels, levelFilter, isTablet]);
  const current = isTablet ? rows.find(i => i.id === selected)?.id ?? rows[0]?.id ?? null : null;
  const addItem = () => router.push({ pathname: '/central-kitchen/item-form', params: { kind } });
  const { can, showAmounts } = useKitchenAccess();
  const mayAdd = can('setup.items');
  // Task 242: raw materials leave the store when they are given to the kitchen.
  const give = finished ? null : stockActions(can)[0] ?? null;
  const header = <View className="pb-3">
    <KHeader title={title} subtitle={finished ? 'Create batches, then send goods to branches' : 'Purchased and stored as they are · no batches'} right={mayAdd ? <IconButton icon={Plus} label={finished ? 'Add a finished good' : 'Add a raw material'} onPress={addItem} /> : undefined} />
    {!isTablet ? <View className="mb-3"><Segmented options={[{ value: 'raw_material', label: 'Raw materials' }, { value: 'finished_good', label: 'Finished goods' }]} value={kind} onChange={setPhoneKind} /></View> : null}
    {data.error ? <Notice text={data.error} /> : null}
    {give ? <Pressable onPress={() => router.push(give.href as never)} accessibilityRole="button" accessibilityLabel={`${give.label}: ${give.caption}`}
      className="mb-3 min-h-[56px] flex-row items-center gap-3 rounded-2xl border border-border-soft bg-surface-elevated px-3.5 py-2.5 hover:bg-surface-tint active:bg-surface-tint">
      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: toneSoft[give.tone] }}><give.icon size={18} color={toneColor[give.tone]} /></View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-bold text-text-primary">{give.label}</Text>
        <Text className="text-xs font-semibold text-text-secondary">{give.caption}</Text>
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable> : null}
    <SearchBox value={query} onChange={setQuery} placeholder={`Search ${title.toLowerCase()}`} />
    {!isTablet ? <View className="mt-2"><Chips options={[{ value: 'all', label: 'All', hint: String(kindItems.length) }, { value: 'low', label: 'Low', hint: String(lowCount) }, { value: 'out', label: 'Out', hint: String(outCount) }]} value={levelFilter} onChange={setLevelFilter} /></View> : null}
  </View>;
  return <View className={`flex-1 bg-kitchen-canvas ${isTablet ? 'flex-row' : ''} ${desktop ? 'w-full max-w-[1120px] self-center' : ''}`}>
    <FlatList
      className={isTablet ? desktop ? 'w-80 flex-none' : 'flex-1' : 'flex-1'}
      style={isTablet && !desktop ? { maxWidth: 420 } : undefined}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      data={rows} keyExtractor={item => item.id} extraData={`${current}-${kind}-${levelFilter}`}
      ListHeaderComponent={header}
      refreshing={data.loading && data.loaded} onRefresh={data.refresh}
      ListEmptyComponent={!data.loaded ? <ActivityIndicator accessibilityLabel="Loading stock" color={colors.primary} className="my-6" /> : data.error ? <Empty title="Stock unavailable" body="Retry to load the stock list. Existing items have not been removed." /> : <Empty title={query ? 'No item matches that' : `No ${title.toLowerCase()} yet`} body={query ? undefined : finished ? 'Add a finished good and record the quantity produced in each batch.' : 'Add a raw material with opening stock. Purchases add to its stock.'} action={query || mayAdd ? <GhostButton small tone="primary" label={query ? 'Clear search' : finished ? 'Add a finished good' : 'Add a raw material'} onPress={query ? () => setQuery('') : addItem} /> : undefined} />}
      ListFooterComponent={data.error ? <GhostButton icon={RefreshCw} label="Retry stock" onPress={data.refresh} /> : null}
      renderItem={({ item, index }) => <Animated.View style={listEnter}>{!isTablet ? <StockRow first={index === 0} last={index === rows.length - 1} item={item} level={levels.get(item.id)} subtitle={finished && showAmounts ? (item.sell_price === null ? 'Price on each send' : `${formatMoney(item.sell_price)} per ${item.unit}`) : `Stored in ${item.unit}`} onPress={() => router.push({ pathname: '/central-kitchen/item/[id]', params: { id: item.id } })} /> : <View className="bg-surface-elevated px-3.5"><Row title={item.name} titleLines={2} subtitle={finished && showAmounts ? `${item.sell_price === null ? 'Selling price entered on each send' : `${formatMoney(item.sell_price)} per ${item.unit}`}${item.cost_price === null ? ' · no cost set' : ` · costs ${formatMoney(item.cost_price)}`}` : `Stored in ${item.unit}`} right={formatQty(item.stock, item.unit)} rightSub="in stock" tone={item.stock < 0 ? 'out' : 'neutral'} selected={current === item.id} onPress={() => isTablet ? setSelected(item.id) : router.push({ pathname: '/central-kitchen/item/[id]', params: { id: item.id } })} accessibilityLabel={`${item.name}, ${formatQty(item.stock, item.unit)} in stock`} /></View>}</Animated.View>}
    />
    {isTablet ? <ScrollView className="flex-1 border-l border-border-soft" contentContainerStyle={{ paddingHorizontal: desktop ? 16 : 20, paddingBottom: 24 }}>{current ? <ItemDetail key={current} itemId={current} onRemoved={() => setSelected(null)} /> : <Empty title="Pick an item" body="Its stock and movements open here." />}</ScrollView> : null}
  </View>;
}
