import React, { useMemo, useState } from 'react';
import { Linking, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { Pencil, Trash2, MessageCircle } from 'lucide-react-native';
import { setKitchenPartyActive } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { colors, semantic } from '@/lib/pos/brand';
import { entrySubline, formatDayLabel, formatMoney, statementRows, typeLabel, whatsappUrl } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';
import { Card, Empty, GhostButton, KHeader, MoreMenu, Notice, PrimaryButton, Row, Section, SPLIT_FROM, stickySide, useDesktopDensity } from './ui';
import { EntryActions } from './EntryActions';

type Props = {
  partyId: string;
  standalone?: boolean;
  onRemoved?: () => void;
};

/** One branch or vendor: what it owes or is owed, and the give-and-take behind the figure. */
export function PartyDetail({ partyId, standalone = false, onRemoved }: Props) {
  const data = useKitchenData();
  const desktop = useDesktopDensity();
  const party = data.partiesById.get(partyId) ?? null;
  const balance = data.balances.find((b) => b.party_id === partyId)?.balance ?? 0;
  const rows = useMemo(() => (party ? statementRows(data.entries, partyId, party.kind, party.opening) : []), [data.entries, partyId, party]);
  const [open, setOpen] = useState<KitchenEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { can, showAmounts } = useKitchenAccess();
  const [width, setWidth] = useState(0);
  const split = desktop && width >= SPLIT_FROM;
  // Both the empty and the loaded view measure, so the width is known from the first render.
  const measure = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  if (!party) {
    return (
      <View onLayout={measure}>
        {standalone ? <KHeader title="Name" onBack={() => backToKitchen()} /> : null}
        <Empty title="This name is no longer in the list" />
      </View>
    );
  }
  const isBranch = party.kind === 'branch';
  const tone = balance > 0 ? (isBranch ? semantic.success : semantic.danger) : colors.textSecondary;
  const label = balance > 0 ? (isBranch ? 'Yet to pay' : 'We owe') : balance < 0 ? (isBranch ? 'Paid ahead' : 'Overpaid') : 'Settled';

  const remove = () => {
    confirmAction('Remove this name?', `${party.name} leaves the list${balance !== 0 ? ` with ${formatMoney(Math.abs(balance))} still ${isBranch ? 'owed' : 'to be paid'}` : ''}. Past entries stay in the history.`, 'Remove', () => {
      void (async () => {
        const res = await setKitchenPartyActive(party.id, false);
        if (res.error) {
          setError(res.error);
          return;
        }
        await data.load(true);
        useKitchenStore.getState().setNotice(`${party.name} removed`);
        if (onRemoved) onRemoved();
        else if (standalone) backToKitchen();
      })();
    });
  };

  const figure = (
    <>
      <Text className={`font-extrabold ${desktop ? 'text-[28px] leading-8' : 'text-[40px] leading-[46px]'}`} style={{ letterSpacing: desktop ? -0.4 : -0.8, color: tone, fontVariant: ['tabular-nums'] }}>{showAmounts ? formatMoney(Math.abs(balance)) : '—'}</Text>
      {party.phone ? (
        <Pressable onPress={() => void Linking.openURL(whatsappUrl('', party.phone)).catch(() => undefined)} accessibilityRole="link" accessibilityLabel={`WhatsApp ${party.name}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 32, opacity: pressed ? 0.6 : 1 })}>
          <MessageCircle size={16} color={semantic.success} />
          <Text style={{ color: semantic.success, fontSize: 13, fontWeight: '700' }}>{party.phone}</Text>
        </Pressable>
      ) : null}
    </>
  );
  const actions = isBranch ? (
    <>
      {can('entries.receive') ? <View className={split ? undefined : 'flex-1'}><PrimaryButton label="Received" onPress={() => router.push({ pathname: '/central-kitchen/received', params: { party: party.id } })} /></View> : null}
      {can('entries.send') ? <View className={split ? undefined : 'flex-1'}><GhostButton label="Send" tone="primary" onPress={() => router.push({ pathname: '/central-kitchen/send', params: { party: party.id } })} /></View> : null}
    </>
  ) : (
    <>
      {can('entries.pay') ? <View className={split ? undefined : 'flex-1'}><PrimaryButton label="Pay" onPress={() => router.push({ pathname: '/central-kitchen/spent', params: { party: party.id, kind: 'vendor' } })} /></View> : null}
      {can('entries.buy') ? <View className={split ? undefined : 'flex-1'}><GhostButton label="Bought" tone="primary" onPress={() => router.push({ pathname: '/central-kitchen/bought', params: { party: party.id } })} /></View> : null}
    </>
  );
  const history = (
    <Section title="Give and take">
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        {rows.length === 0 && party.opening === 0 ? (
          <Empty title="Nothing yet" body={isBranch ? 'Sends and payments from this branch will show here, with the figure after each.' : 'Buys and payments to this vendor will show here, with the figure after each.'} />
        ) : (
          rows.map(({ entry, balanceAfter }) => {
            const moneyBack = entry.type === 'received' || entry.type === 'paid';
            return (
              <Row
                key={entry.id}
                title={`${typeLabel(entry.type)} · ${formatDayLabel(entry.entry_date)}`}
                subtitle={entrySubline(entry, data.itemsById)}
                right={showAmounts ? `${moneyBack ? '−' : ''}${formatMoney(entry.amount)}` : undefined}
                rightSub={showAmounts ? `then ${formatMoney(balanceAfter)}` : undefined}
                tone={moneyBack ? 'in' : 'neutral'}
                onPress={() => setOpen(entry)}
              />
            );
          })
        )}
        {party.opening !== 0 ? (
          // The oldest line: what stood between us before the app, set on the name's edit page.
          <Row
            title="Opening balance"
            subtitle="Before this app started"
            right={showAmounts ? formatMoney(Math.abs(party.opening)) : undefined}
            rightSub={!showAmounts ? undefined : party.opening > 0 ? (isBranch ? 'yet to pay' : 'we owed') : isBranch ? 'paid ahead' : 'overpaid'}
            tone="neutral"
          />
        ) : null}
      </Card>
      <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 8 }}>Shows the last three months; the balance counts everything.</Text>
    </Section>
  );
  const balanceLabel = <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>;

  return (
    <View onLayout={measure}>
      <KHeader
        title={party.name}
        subtitle={isBranch ? 'Branch' : 'Vendor'}
        onBack={standalone ? () => backToKitchen() : undefined}
        large={!standalone}
        right={can('setup.parties') ? <MoreMenu label={`More for ${party.name}`} items={[
          { label: `Edit ${isBranch ? 'branch' : 'vendor'}`, icon: Pencil, onPress: () => router.push({ pathname: '/central-kitchen/party-form', params: { id: party.id, kind: party.kind } }) },
          { label: `Remove ${isBranch ? 'branch' : 'vendor'}`, icon: Trash2, tone: 'out', onPress: remove },
        ]} /> : undefined}
      />
      {split ? (
        // Task 222 (Polaris details layout): the give-and-take takes the wide column; the figure,
        // the two actions and the WhatsApp number sit in a narrow column beside it.
        <View className="flex-row items-start gap-4">
          <View className="min-w-0 flex-1">{history}</View>
          <View className="w-64 shrink-0" style={stickySide}>
            <Section title={label}>
              <Card>
                {figure}
                <View className="mt-3 gap-2">{actions}</View>
                {error ? <Notice text={error} /> : null}
              </Card>
            </Section>
          </View>
        </View>
      ) : (
        <>
          <Card>
            <View className={desktop ? 'flex-row items-center gap-4' : undefined}>
              <View className={desktop ? 'min-w-0 flex-1' : undefined}>
                {balanceLabel}
                <View className="mt-0.5">{figure}</View>
              </View>
              <View className={desktop ? 'w-64 shrink-0 flex-row gap-2' : 'flex-row'} style={desktop ? undefined : { gap: 10, marginTop: 14 }}>{actions}</View>
            </View>
            {error ? <Notice text={error} /> : null}
          </Card>
          {history}
        </>
      )}
      <EntryActions entry={open} onClose={() => setOpen(null)} itemsById={data.itemsById} partiesById={data.partiesById} />
    </View>
  );
}
