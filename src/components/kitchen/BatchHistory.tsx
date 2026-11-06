import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { fetchKitchenEntries } from '@/lib/pos/kitchen-service';
import { useKitchenData } from '@/lib/pos/use-kitchen-store';
import { batchDays, enteredNote, formatDayLabel, formatQty, matchesSearch } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenItem } from '@/lib/pos/kitchen-types';
import { EntryActions } from './EntryActions';
import { Card, Empty, Notice, Row, SearchBox } from './ui';

const nameOf = (e: KitchenEntry, items: ReadonlyMap<string, KitchenItem>): string => (e.item_id ? items.get(e.item_id)?.name : undefined) ?? 'Removed item';

/** Task 304: the batches made, newest day first. A tap opens one to edit or void it. */
export function BatchHistory() {
  const data = useKitchenData();
  const [entries, setEntries] = useState<KitchenEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void fetchKitchenEntries({ types: ['made'], limit: 300 }).then((res) => {
      if (!current) return;
      setEntries(res.data ?? []);
      setError(res.error);
    });
    return () => { current = false; };
  }, [data.loadedAt]);

  const days = useMemo(() => batchDays((entries ?? []).filter((e) => matchesSearch(query, nameOf(e, data.itemsById), e.note ?? ''))), [entries, query, data.itemsById]);
  const open = openId ? entries?.find((e) => e.id === openId) ?? null : null;

  return (
    <View>
      <SearchBox value={query} onChange={setQuery} placeholder="Search batches" />
      {error ? <Notice text={error} /> : null}
      {entries === null && !error ? <ActivityIndicator accessibilityLabel="Loading batches" color={colors.primary} className="my-6" /> : null}
      {entries !== null && days.length === 0 && !error ? <Empty title={query ? 'No batch matches that' : 'No batches yet'} /> : null}
      {days.length > 0 ? (
        <Card padded={false} style={{ paddingHorizontal: 14, marginTop: 12, overflow: 'hidden' }}>
          {days.map((day) => (
            <View key={day.date}>
              <Text accessibilityRole="header" className="text-text-primary" style={{ fontSize: 13, fontWeight: '800', paddingTop: 12, paddingBottom: 2 }}>{formatDayLabel(day.date)}</Text>
              {day.entries.map((e) => {
                const unit = (e.item_id ? data.itemsById.get(e.item_id)?.unit : undefined) ?? '';
                const name = nameOf(e, data.itemsById);
                const qty = `+${formatQty(e.qty ?? 0, unit).trim()}`;
                return <Row key={e.id} title={name} subtitle={[e.replaces_id ? 'Edited' : '', e.created_by, enteredNote(e), e.note ?? ''].filter(Boolean).join(' · ')} right={qty} tone="in"
                  onPress={() => setOpenId(e.id)} accessibilityLabel={`${name}, ${qty}, ${formatDayLabel(day.date)}`} />;
              })}
            </View>
          ))}
        </Card>
      ) : null}
      <EntryActions entry={open} onClose={() => setOpenId(null)} itemsById={data.itemsById} partiesById={data.partiesById} />
    </View>
  );
}
