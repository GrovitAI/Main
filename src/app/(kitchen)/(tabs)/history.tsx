import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useKitchenData } from '@/lib/pos/use-kitchen-store';
import { entryAmountText, entryHeadline, entrySubline, matchesSearch } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';
import { Card, Chips, Empty, KHeader, KScreen, Notice, SearchBox, Skeleton } from '@/components/kitchen/ui';
import { EntryList } from '@/components/kitchen/EntryList';
import { EntryActions } from '@/components/kitchen/EntryActions';

type Filter = 'all' | 'sent' | 'received' | 'bought' | 'spent' | 'stock' | 'voided';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
  { value: 'bought', label: 'Bought' },
  { value: 'spent', label: 'Spent' },
  { value: 'stock', label: 'Stock' },
  { value: 'voided', label: 'Voided' },
];

function passes(e: KitchenEntry, f: Filter): boolean {
  if (f === 'voided') return e.voided_at !== null;
  if (e.voided_at !== null) return false;
  switch (f) {
    case 'all': return true;
    case 'sent': return e.type === 'sent';
    case 'received': return e.type === 'received';
    case 'bought': return e.type === 'bought';
    case 'spent': return e.type === 'spent' || e.type === 'paid';
    case 'stock': return e.type === 'made' || e.type === 'count';
  }
}

/** Everything the kitchen recorded in the last three months, searchable. */
export default function HistoryScreen() {
  const data = useKitchenData();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<KitchenEntry | null>(null);
  const rows = useMemo(
    () =>
      data.entries.filter((e) => {
        if (!passes(e, filter)) return false;
        if (!query.trim()) return true;
        const names = { party: e.party_id ? data.partiesById.get(e.party_id)?.name : null, item: e.item_id ? data.itemsById.get(e.item_id)?.name : null };
        return matchesSearch(query, entryHeadline(e, names), entrySubline(e, data.itemsById), entryAmountText(e), e.category, e.note, e.created_by);
      }),
    [data.entries, data.partiesById, data.itemsById, filter, query],
  );

  return (
    <KScreen refreshing={data.loading && data.loaded} onRefresh={data.refresh}>
      <KHeader title="History" subtitle="Everything the kitchen recorded, newest first" />
      {data.error ? <Notice text={data.error} /> : null}
      <SearchBox value={query} onChange={setQuery} placeholder="Search names, items, notes, amounts" />
      <View style={{ marginTop: 10 }}>
        <Chips options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      <Card padded={false} style={{ paddingHorizontal: 14, marginTop: 12 }}>
        {!data.loaded ? (
          <View style={{ paddingVertical: 14, gap: 8 }}><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></View>
        ) : rows.length === 0 ? (
          <Empty title={query || filter !== 'all' ? 'Nothing matches' : 'Nothing recorded yet'} body={query || filter !== 'all' ? 'Try another word or filter.' : 'Sends, payments, buys and counts will show here.'} />
        ) : (
          <View style={{ paddingBottom: 6 }}>
            <EntryList entries={rows} itemsById={data.itemsById} partiesById={data.partiesById} onPress={setOpen} />
          </View>
        )}
      </Card>
      <EntryActions entry={open} onClose={() => setOpen(null)} itemsById={data.itemsById} partiesById={data.partiesById} />
    </KScreen>
  );
}
