import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Plus, RefreshCw } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import type { KitchenItemKind } from '@/lib/pos/kitchen-types';
import { formatMoney, formatQty, matchesSearch } from '@/lib/pos/kitchen-utils';
import { Empty, GhostButton, IconButton, KHeader, Notice, Row, SearchBox, Segmented, useDesktopDensity } from '@/components/kitchen/ui';
import { ItemDetail } from '@/components/kitchen/ItemDetail';

/** Each kind shares the incumbent stock list and tablet master/detail pattern. */
export function StockItems({ kind }: { kind: KitchenItemKind }) {
  const data = useKitchenData();
  const { isTablet } = useResponsive();
  const desktop = useDesktopDensity();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const finished = kind === 'finished_good';
  const title = finished ? 'Finished goods' : 'Raw materials';
  const rows = useMemo(() => data.items.filter(i => i.item_kind === kind && matchesSearch(query, i.name, i.unit)), [data.items, kind, query]);
  const current = isTablet ? rows.find(i => i.id === selected)?.id ?? rows[0]?.id ?? null : null;
  const addItem = () => router.push({ pathname: '/central-kitchen/item-form', params: { kind } });
  const { can, showAmounts } = useKitchenAccess();
  const mayAdd = can('setup.items');
  const header = <View className="pb-3">
    <KHeader title={title} subtitle={finished ? 'Create batches, then send goods to branches' : 'Purchased and stored as they are · no batches'} right={mayAdd ? <IconButton icon={Plus} label={finished ? 'Add a finished good' : 'Add a raw material'} onPress={addItem} /> : undefined} />
    {!isTablet ? <View className="mb-3"><Segmented options={[{ value: 'raw_material', label: 'Raw materials' }, { value: 'finished_good', label: 'Finished goods' }]} value={kind} onChange={value => router.replace(value === 'finished_good' ? '/central-kitchen/finished-goods' : '/central-kitchen/items')} /></View> : null}
    {data.error ? <Notice text={data.error} /> : null}
    <SearchBox value={query} onChange={setQuery} placeholder={`Search ${title.toLowerCase()}`} />
  </View>;
  return <View className={`flex-1 bg-kitchen-canvas ${isTablet ? 'flex-row' : ''} ${desktop ? 'w-full max-w-[1120px] self-center' : ''}`}>
    <FlatList
      className={isTablet ? desktop ? 'w-80 flex-none' : 'flex-1' : 'flex-1'}
      style={isTablet && !desktop ? { maxWidth: 420 } : undefined}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      data={rows} keyExtractor={item => item.id} extraData={current}
      ListHeaderComponent={header}
      refreshing={data.loading && data.loaded} onRefresh={data.refresh}
      ListEmptyComponent={!data.loaded ? <ActivityIndicator accessibilityLabel="Loading stock" color={colors.primary} className="my-6" /> : data.error ? <Empty title="Stock unavailable" body="Retry to load the stock list. Existing items have not been removed." /> : <Empty title={query ? 'No item matches that' : `No ${title.toLowerCase()} yet`} body={query ? undefined : finished ? 'Add a finished good and record the quantity produced in each batch.' : 'Add a raw material with opening stock. Purchases add to its stock.'} action={query || mayAdd ? <GhostButton small tone="primary" label={query ? 'Clear search' : finished ? 'Add a finished good' : 'Add a raw material'} onPress={query ? () => setQuery('') : addItem} /> : undefined} />}
      ListFooterComponent={data.error ? <GhostButton icon={RefreshCw} label="Retry stock" onPress={data.refresh} /> : null}
      renderItem={({ item }) => <View className="bg-surface-elevated px-3.5"><Row title={item.name} subtitle={finished && showAmounts ? item.sell_price === null ? 'Selling price entered on each send' : `${formatMoney(item.sell_price)} per ${item.unit}` : `Stored in ${item.unit}`} right={formatQty(item.stock, item.unit)} rightSub="in stock" tone={item.stock < 0 ? 'out' : 'neutral'} selected={current === item.id} onPress={() => isTablet ? setSelected(item.id) : router.push({ pathname: '/central-kitchen/item/[id]', params: { id: item.id } })} accessibilityLabel={`${item.name}, ${formatQty(item.stock, item.unit)} in stock`} /></View>}
    />
    {isTablet ? <ScrollView className="flex-1 border-l border-border-soft" contentContainerStyle={{ paddingHorizontal: desktop ? 16 : 20, paddingBottom: 24 }}>{current ? <ItemDetail key={current} itemId={current} onRemoved={() => setSelected(null)} /> : <Empty title="Pick an item" body="Its stock and movements open here." />}</ScrollView> : null}
  </View>;
}
