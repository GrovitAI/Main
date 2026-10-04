import React, { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Pencil, Trash2, MessageCircle } from 'lucide-react-native';
import { setKitchenPartyActive } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { colors, semantic } from '@/lib/pos/brand';
import { entrySubline, formatDayLabel, formatMoney, statementRows, typeLabel, whatsappUrl } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';
import { Card, Empty, GhostButton, IconButton, KHeader, Notice, PrimaryButton, Row, Section } from './ui';
import { EntryActions } from './EntryActions';

type Props = {
  partyId: string;
  standalone?: boolean;
  onRemoved?: () => void;
};

/** One branch or vendor: what it owes or is owed, and the give-and-take behind the figure. */
export function PartyDetail({ partyId, standalone = false, onRemoved }: Props) {
  const data = useKitchenData();
  const party = data.partiesById.get(partyId) ?? null;
  const balance = data.balances.find((b) => b.party_id === partyId)?.balance ?? 0;
  const rows = useMemo(() => (party ? statementRows(data.entries, partyId, party.kind) : []), [data.entries, partyId, party]);
  const [open, setOpen] = useState<KitchenEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!party) {
    return (
      <View>
        {standalone ? <KHeader title="Name" onBack={() => router.back()} /> : null}
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
        else if (standalone) router.back();
      })();
    });
  };

  return (
    <View>
      <KHeader
        title={party.name}
        subtitle={isBranch ? 'Branch' : 'Vendor'}
        onBack={standalone ? () => router.back() : undefined}
        large={!standalone}
        right={
          <View className="flex-row" style={{ gap: 8 }}>
            <IconButton icon={Pencil} label={`Edit ${party.name}`} onPress={() => router.push({ pathname: '/(kitchen)/party-form', params: { id: party.id, kind: party.kind } })} />
            <IconButton icon={Trash2} label={`Remove ${party.name}`} tone="out" onPress={remove} />
          </View>
        }
      />
      <Card>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: -0.8, lineHeight: 46, marginTop: 2, color: tone, fontVariant: ['tabular-nums'] }}>{formatMoney(Math.abs(balance))}</Text>
        {party.phone ? (
          <Pressable onPress={() => void Linking.openURL(whatsappUrl('', party.phone)).catch(() => undefined)} accessibilityRole="link" accessibilityLabel={`WhatsApp ${party.name}`} className="flex-row items-center" style={({ pressed }) => ({ gap: 6, marginTop: 8, minHeight: 32, opacity: pressed ? 0.6 : 1 })}>
            <MessageCircle size={16} color={semantic.success} />
            <Text style={{ color: semantic.success, fontSize: 13, fontWeight: '700' }}>{party.phone}</Text>
          </Pressable>
        ) : null}
        <View className="flex-row" style={{ gap: 10, marginTop: 14 }}>
          {isBranch ? (
            <>
              <View className="flex-1"><PrimaryButton label="Received" tone="in" onPress={() => router.push({ pathname: '/(kitchen)/received', params: { party: party.id } })} /></View>
              <View className="flex-1"><GhostButton label="Send" tone="primary" onPress={() => router.push({ pathname: '/(kitchen)/send', params: { party: party.id } })} /></View>
            </>
          ) : (
            <>
              <View className="flex-1"><PrimaryButton label="Pay" tone="out" onPress={() => router.push({ pathname: '/(kitchen)/spent', params: { party: party.id, kind: 'vendor' } })} /></View>
              <View className="flex-1"><GhostButton label="Bought" tone="buy" onPress={() => router.push({ pathname: '/(kitchen)/bought', params: { party: party.id } })} /></View>
            </>
          )}
        </View>
        {error ? <Notice text={error} /> : null}
      </Card>
      <Section title="Give and take">
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {rows.length === 0 ? (
            <Empty title="Nothing yet" body={isBranch ? 'Sends and payments from this branch will show here, with the figure after each.' : 'Buys and payments to this vendor will show here, with the figure after each.'} />
          ) : (
            rows.map(({ entry, balanceAfter }) => {
              const moneyBack = entry.type === 'received' || entry.type === 'paid';
              return (
                <Row
                  key={entry.id}
                  title={`${typeLabel(entry.type)} · ${formatDayLabel(entry.entry_date)}`}
                  subtitle={entrySubline(entry, data.itemsById)}
                  right={`${moneyBack ? '−' : ''}${formatMoney(entry.amount)}`}
                  rightSub={`then ${formatMoney(balanceAfter)}`}
                  tone={moneyBack ? 'in' : 'neutral'}
                  onPress={() => setOpen(entry)}
                />
              );
            })
          )}
        </Card>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 8 }}>Shows the last three months; the figure above counts everything.</Text>
      </Section>
      <EntryActions entry={open} onClose={() => setOpen(null)} itemsById={data.itemsById} partiesById={data.partiesById} />
    </View>
  );
}
