import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Pencil, Trash2 } from 'lucide-react-native';
import { fetchKitchenItemEntries, postKitchenEntry, setKitchenItemActive } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { formatMoney, formatQty } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';
import { Card, Empty, GhostButton, IconButton, KHeader, Notice, PrimaryButton, Section, Skeleton, TextField } from './ui';
import { EntryList } from './EntryList';
import { EntryActions } from './EntryActions';

type Props = {
  itemId: string;
  /** On its own screen (with a back button) rather than in a tablet's right pane. */
  standalone?: boolean;
  onRemoved?: () => void;
};

/** One item: its stock, its price, a batch made or a count, and every entry that touched it. */
export function ItemDetail({ itemId, standalone = false, onRemoved }: Props) {
  const data = useKitchenData();
  const item = data.itemsById.get(itemId) ?? null;
  const [moves, setMoves] = useState<KitchenEntry[] | null>(null);
  const [panel, setPanel] = useState<'made' | 'count' | null>(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<KitchenEntry | null>(null);

  const loadMoves = useCallback(async () => {
    const res = await fetchKitchenItemEntries(itemId);
    if (res.data) setMoves(res.data);
    if (res.error) setError(res.error);
  }, [itemId]);

  useEffect(() => {
    setMoves(null);
    setPanel(null);
    setQty('');
    void loadMoves();
  }, [loadMoves, data.loadedAt]);

  if (!item) {
    return (
      <View>
        {standalone ? <KHeader title="Item" onBack={() => router.back()} /> : null}
        <Empty title="This item is no longer in the list" />
      </View>
    );
  }

  const submitPanel = async () => {
    const n = Number(qty.replace(/[,\s]/g, ''));
    if (!panel || !Number.isFinite(n) || n < 0 || (panel === 'made' && n <= 0)) {
      setError(panel === 'made' ? 'Enter how much was made.' : 'Enter what is on the shelf now.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postKitchenEntry({ type: panel, item_id: item.id, qty: n });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await data.load(true);
    useKitchenStore.getState().setNotice(panel === 'made' ? `${formatQty(n, item.unit)} ${item.name} added to stock` : `${item.name} set to ${formatQty(n, item.unit)}`);
    setPanel(null);
    setQty('');
  };

  const remove = () => {
    confirmAction('Remove this item?', `${item.name} leaves the lists. Its past entries stay in the history.`, 'Remove', () => {
      void (async () => {
        const res = await setKitchenItemActive(item.id, false);
        if (res.error) {
          setError(res.error);
          return;
        }
        await data.load(true);
        useKitchenStore.getState().setNotice(`${item.name} removed`);
        if (onRemoved) onRemoved();
        else if (standalone) router.back();
      })();
    });
  };

  return (
    <View>
      <KHeader
        title={item.name}
        subtitle={item.sell_price !== null ? `Sells at ${formatMoney(item.sell_price)} per ${item.unit}` : 'Raw material · not sold to branches'}
        onBack={standalone ? () => router.back() : undefined}
        large={!standalone}
        right={
          <View className="flex-row" style={{ gap: 8 }}>
            <IconButton icon={Pencil} label={`Edit ${item.name}`} onPress={() => router.push({ pathname: '/(kitchen)/item-form', params: { id: item.id } })} />
            <IconButton icon={Trash2} label={`Remove ${item.name}`} tone="out" onPress={remove} />
          </View>
        }
      />
      <Card>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>In stock</Text>
        <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: -0.8, lineHeight: 46, marginTop: 2, color: item.stock < 0 ? '#b91c1c' : undefined, fontVariant: ['tabular-nums'] }} className="text-text-primary">
          {formatQty(item.stock, item.unit)}
        </Text>
        {item.stock < 0 ? <Text style={{ color: '#b91c1c', fontSize: 13, fontWeight: '700', marginTop: 4 }}>More has gone out than came in. A count sets it right.</Text> : null}
        <View className="flex-row" style={{ gap: 10, marginTop: 14 }}>
          <View className="flex-1"><GhostButton label="Made a batch" tone="primary" onPress={() => { setPanel(panel === 'made' ? null : 'made'); setQty(''); setError(null); }} /></View>
          <View className="flex-1"><GhostButton label="Count stock" onPress={() => { setPanel(panel === 'count' ? null : 'count'); setQty(''); setError(null); }} /></View>
        </View>
        {panel ? (
          <View className="flex-row items-center" style={{ gap: 8, marginTop: 10 }}>
            <View className="flex-1">
              <TextField value={qty} onChange={setQty} label={panel === 'made' ? 'Quantity made' : 'Counted quantity'} placeholder={panel === 'made' ? `How much was made (${item.unit})` : `What is on the shelf now (${item.unit})`} keyboardType="decimal-pad" autoFocus />
            </View>
            <View style={{ width: 96 }}><PrimaryButton label={panel === 'made' ? 'Add' : 'Set'} onPress={() => void submitPanel()} loading={busy} /></View>
          </View>
        ) : null}
        {error ? <Notice text={error} /> : null}
      </Card>
      <Section title="Movements">
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {moves === null ? (
            <View style={{ paddingVertical: 14, gap: 8 }}><Skeleton height={40} /><Skeleton height={40} /></View>
          ) : moves.length === 0 ? (
            <Empty title="No movements yet" body="Buys, sends, batches and counts of this item will show here." />
          ) : (
            <EntryList entries={moves} itemsById={data.itemsById} partiesById={data.partiesById} onPress={setOpen} />
          )}
        </Card>
      </Section>
      <EntryActions entry={open} onClose={() => { setOpen(null); void loadMoves(); }} itemsById={data.itemsById} partiesById={data.partiesById} />
    </View>
  );
}
