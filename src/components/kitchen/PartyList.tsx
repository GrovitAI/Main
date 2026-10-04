import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useKitchenData } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { formatDayLabel, formatMoney, matchesSearch, sumDues } from '@/lib/pos/kitchen-utils';
import type { KitchenPartyKind } from '@/lib/pos/kitchen-types';
import { Card, Empty, GhostButton, IconButton, KHeader, KScreen, Notice, Row, SearchBox, Skeleton, StatTile } from './ui';
import { PartyDetail } from './PartyDetail';

const COPY = {
  branch: { title: 'Branches', subtitle: 'Who the kitchen sends to, and what each still owes', total: 'Branches yet to pay', add: 'Add a branch', empty: 'No branches yet', emptyBody: 'Add the outlets the kitchen sends to. A name is all it takes.' },
  vendor: { title: 'Vendors', subtitle: 'Who the kitchen buys from, and what it owes each', total: 'We owe vendors', add: 'Add a vendor', empty: 'No vendors yet', emptyBody: 'Add the people the kitchen buys from. A name is all it takes.' },
} as const;

/** Branches or vendors with their running figure; on a tablet the chosen one opens beside the list. */
export function PartyList({ kind }: { kind: KitchenPartyKind }) {
  const data = useKitchenData();
  const { isTablet } = useResponsive();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const copy = COPY[kind];
  const balanceOf = useMemo(() => new Map(data.balances.map((b) => [b.party_id, b])), [data.balances]);
  const rows = useMemo(
    () =>
      data.parties
        .filter((p) => p.kind === kind && matchesSearch(query, p.name, p.phone))
        .map((p) => ({ party: p, balance: balanceOf.get(p.id)?.balance ?? 0, last: balanceOf.get(p.id)?.last_entry_date ?? null }))
        .sort((a, b) => b.balance - a.balance || a.party.name.localeCompare(b.party.name)),
    [data.parties, kind, query, balanceOf],
  );
  const total = sumDues(data.balances, kind);
  const openParty = (id: string) => (isTablet ? setSelected(id) : router.push({ pathname: '/(kitchen)/party/[id]', params: { id } }));
  const addParty = () => router.push({ pathname: '/(kitchen)/party-form', params: { kind } });
  const current = isTablet ? (selected && data.partiesById.has(selected) ? selected : rows[0]?.party.id ?? null) : null;

  const list = (
    <>
      <KHeader title={copy.title} subtitle={copy.subtitle} right={<IconButton icon={Plus} label={copy.add} onPress={addParty} />} />
      {data.error ? <Notice text={data.error} /> : null}
      <View className="flex-row" style={{ gap: 10, marginBottom: 12 }}>
        <StatTile label={copy.total} value={total} tone={total > 0 ? (kind === 'branch' ? 'in' : 'out') : 'neutral'} onPress={() => undefined} />
      </View>
      <SearchBox value={query} onChange={setQuery} placeholder={kind === 'branch' ? 'Search branches' : 'Search vendors'} />
      <Card padded={false} style={{ paddingHorizontal: 14, marginTop: 12 }}>
        {!data.loaded ? (
          <View style={{ paddingVertical: 14, gap: 8 }}><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></View>
        ) : rows.length === 0 ? (
          <Empty title={query ? 'No name matches that' : copy.empty} body={query ? undefined : copy.emptyBody} action={query ? undefined : <GhostButton small icon={Plus} tone="primary" label={copy.add} onPress={addParty} />} />
        ) : (
          rows.map(({ party, balance, last }) => (
            <Row
              key={party.id}
              title={party.name}
              subtitle={last ? `Last entry ${formatDayLabel(last)}` : 'No entries yet'}
              right={formatMoney(Math.abs(balance))}
              rightSub={balance > 0 ? (kind === 'branch' ? 'yet to pay' : 'we owe') : balance < 0 ? (kind === 'branch' ? 'paid ahead' : 'overpaid') : 'settled'}
              tone={balance > 0 ? (kind === 'branch' ? 'in' : 'out') : 'neutral'}
              muted={false}
              selected={isTablet && current === party.id}
              onPress={() => openParty(party.id)}
              accessibilityLabel={`${party.name}, ${balance > 0 ? formatMoney(balance) : 'settled'}`}
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
        {current ? <PartyDetail partyId={current} onRemoved={() => setSelected(null)} /> : <Empty title="Pick a name" body="Its figure and give-and-take open here." />}
      </ScrollView>
    </View>
  );
}
