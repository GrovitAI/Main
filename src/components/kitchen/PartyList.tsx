import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { colors, semantic } from '@/lib/pos/brand';
import { formatDayLabel, formatMoney, matchesSearch, sumDues } from '@/lib/pos/kitchen-utils';
import type { KitchenPartyKind } from '@/lib/pos/kitchen-types';
import { Avatar, Card, Empty, GhostButton, IconButton, KHeader, KScreen, Notice, Row, SearchBox, Skeleton, StatTile, useDesktopDensity } from './ui';
import { PartyDetail } from './PartyDetail';

const COPY = {
  branch: { title: 'Branches', total: 'Branches yet to pay', add: 'Add a branch', empty: 'No branches yet', emptyBody: 'Add the outlets the kitchen sends to. A name is all it takes.' },
  vendor: { title: 'Vendors', total: 'We owe vendors', add: 'Add a vendor', empty: 'No vendors yet', emptyBody: 'Add the people the kitchen buys from. A name is all it takes.' },
} as const;

/** Branches or vendors with their running figure; on a tablet the chosen one opens beside the list. */
export function PartyList({ kind }: { kind: KitchenPartyKind }) {
  const data = useKitchenData();
  const { isTablet } = useResponsive();
  const desktop = useDesktopDensity();
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
  const ofKind = data.parties.filter((p) => p.kind === kind);
  const owing = ofKind.filter((p) => (balanceOf.get(p.id)?.balance ?? 0) > 0).length;
  const openParty = (id: string) => (isTablet ? setSelected(id) : router.push({ pathname: '/central-kitchen/party/[id]', params: { id } }));
  const addParty = () => router.push({ pathname: '/central-kitchen/party-form', params: { kind } });
  const { can, showAmounts } = useKitchenAccess();
  const mayAdd = can('setup.parties');
  const current = isTablet ? (selected && data.partiesById.has(selected) ? selected : rows[0]?.party.id ?? null) : null;

  const list = (
    <>
      <KHeader title={copy.title} right={mayAdd ? <IconButton icon={Plus} label={copy.add} onPress={addParty} /> : undefined} />
      {data.error ? <Notice text={data.error} /> : null}
      {showAmounts ? <Card style={{ marginBottom: 12 }}>
        <View className="flex-row items-start justify-between gap-2">
          <StatTile label={copy.total} value={total} tone={total > 0 ? (kind === 'branch' ? 'in' : 'out') : 'neutral'} />
          {!isTablet && ofKind.length > 0 ? (
            // Task 240: how many still owe, as in the mockup.
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: owing === 0 ? colors.surfaceTint : kind === 'branch' ? semantic.successSoft : semantic.dangerSoft }}>
              <Text className="text-xs font-bold" style={{ color: owing === 0 ? colors.textSecondary : kind === 'branch' ? semantic.success : semantic.danger }}>{owing === 0 ? 'All settled' : `${owing} of ${ofKind.length} ${kind === 'branch' ? (ofKind.length === 1 ? 'branch' : 'branches') : ofKind.length === 1 ? 'vendor' : 'vendors'}`}</Text>
            </View>
          ) : null}
        </View>
      </Card> : null}
      <SearchBox value={query} onChange={setQuery} placeholder={kind === 'branch' ? 'Search branches' : 'Search vendors'} />
      <Card padded={false} style={{ paddingHorizontal: 14, marginTop: 12, overflow: 'hidden' }}>
        {!data.loaded ? (
          <View style={{ paddingVertical: 14, gap: 8 }}><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></View>
        ) : rows.length === 0 ? (
          <Empty title={query ? 'No name matches that' : copy.empty} body={query ? undefined : copy.emptyBody} action={query || !mayAdd ? undefined : <GhostButton small icon={Plus} tone="primary" label={copy.add} onPress={addParty} />} />
        ) : (
          rows.map(({ party, balance, last }) => (
            <Row
              key={party.id}
              title={party.name}
              subtitle={last ? `Last entry ${formatDayLabel(last)}` : 'No entries yet'}
              // Task 303: the card above says what the figures are; a row only says so when it differs.
              right={showAmounts && balance !== 0 ? formatMoney(Math.abs(balance)) : undefined}
              rightSub={!showAmounts || balance > 0 ? undefined : balance < 0 ? (kind === 'branch' ? 'paid ahead' : 'overpaid') : 'Settled'}
              tone="neutral"
              muted={false}
              selected={isTablet && current === party.id}
              onPress={() => openParty(party.id)}
              accessibilityLabel={showAmounts ? `${party.name}, ${balance > 0 ? formatMoney(balance) : 'settled'}` : party.name}
              lead={isTablet ? undefined : <Avatar name={party.name} size={40} />}
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
    <View className={`flex-1 flex-row bg-kitchen-canvas ${desktop ? 'w-full max-w-[1120px] self-center' : ''}`}>
      <ScrollView className={desktop ? 'w-80 flex-none' : 'flex-1'} style={desktop ? undefined : { maxWidth: 420 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>{list}</ScrollView>
      <ScrollView className="flex-1 border-l border-border-soft" contentContainerStyle={{ paddingHorizontal: desktop ? 16 : 20, paddingBottom: 24 }}>
        {current ? <PartyDetail partyId={current} onRemoved={() => setSelected(null)} /> : <Empty title="Pick a name" body="Its figure and give-and-take open here." />}
      </ScrollView>
    </View>
  );
}
