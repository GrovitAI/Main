import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useKitchenData } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { formatMoney, formatQty, matchesSearch } from '@/lib/pos/kitchen-utils';
import { Card, Empty, GhostButton, IconButton, KHeader, KScreen, Notice, Row, SearchBox, Skeleton } from '@/components/kitchen/ui';
import { ItemDetail } from '@/components/kitchen/ItemDetail';

/** What the kitchen makes and buys, with the stock figure of each. */
export default function ItemsScreen() {
  const data = useKitchenData();
  const { isTablet } = useResponsive();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => data.items.filter((i) => matchesSearch(query, i.name, i.unit)), [data.items, query]);
  const openItem = (id: string) => (isTablet ? setSelected(id) : router.push({ pathname: '/(kitchen)/item/[id]', params: { id } }));
  const addItem = () => router.push('/(kitchen)/item-form');
  const current = isTablet ? (selected && data.itemsById.has(selected) ? selected : rows[0]?.id ?? null) : null;

  const list = (
    <>
      <KHeader title="Items" subtitle="What the kitchen makes and buys, and how much is there" right={<IconButton icon={Plus} label="Add an item" onPress={addItem} />} />
      {data.error ? <Notice text={data.error} /> : null}
      <SearchBox value={query} onChange={setQuery} placeholder="Search items" />
      <Card padded={false} style={{ paddingHorizontal: 14, marginTop: 12 }}>
        {!data.loaded ? (
          <View style={{ paddingVertical: 14, gap: 8 }}><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></View>
        ) : rows.length === 0 ? (
          <Empty
            title={query ? 'No item matches that' : 'No items yet'}
            body={query ? undefined : 'Add what the kitchen makes (with the price a branch pays) and what it buys (no price).'}
            action={query ? undefined : <GhostButton small icon={Plus} tone="primary" label="Add an item" onPress={addItem} />}
          />
        ) : (
          rows.map((it) => (
            <Row
              key={it.id}
              title={it.name}
              subtitle={it.sell_price !== null ? `Sells at ${formatMoney(it.sell_price)} per ${it.unit}` : 'Raw material'}
              right={formatQty(it.stock, it.unit)}
              rightSub="in stock"
              tone={it.stock < 0 ? 'out' : 'neutral'}
              selected={isTablet && current === it.id}
              onPress={() => openItem(it.id)}
              accessibilityLabel={`${it.name}, ${formatQty(it.stock, it.unit)} in stock`}
            />
          ))
        )}
      </Card>
    </>
  );

  if (!isTablet) {
    return <KScreen refreshing={data.loading && data.loaded} onRefresh={data.refresh}>{list}</KScreen>;
  }
  return (
    <View className="flex-1 flex-row bg-surface-tint">
      <ScrollView className="flex-1" style={{ maxWidth: 420 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>{list}</ScrollView>
      <ScrollView className="flex-1 border-l border-border-soft" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {current ? <ItemDetail itemId={current} onRemoved={() => setSelected(null)} /> : <Empty title="Pick an item" body="Its stock and movements open here." />}
      </ScrollView>
    </View>
  );
}
