import React, { useCallback, useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { ClipboardCheck, PackagePlus, Pencil, Trash2 } from 'lucide-react-native';
import { fetchKitchenItemEntries, postKitchenEntry, setKitchenItemActive } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { formatMoney, formatQty, stockLevels } from '@/lib/pos/kitchen-utils';
import { useResponsive } from '@/lib/pos/useResponsive';
import { chart, colors, semantic } from '@/lib/pos/brand';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';
import { Card, Empty, GhostButton, KHeader, MoreMenu, Notice, PrimaryButton, QtyFigure, Section, Skeleton, SPLIT_FROM, stickySide, TextField, useDesktopDensity } from './ui';
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
  const desktop = useDesktopDensity();
  const item = data.itemsById.get(itemId) ?? null;
  const [moves, setMoves] = useState<KitchenEntry[] | null>(null);
  const [panel, setPanel] = useState<'made' | 'count' | null>(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<KitchenEntry | null>(null);
  const { can, showAmounts } = useKitchenAccess();
  const [width, setWidth] = useState(0);
  const split = desktop && width >= SPLIT_FROM;
  const phone = !useResponsive().isTablet;
  // Both the empty and the loaded view measure, so the width is known from the first render.
  const measure = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);

  const loadMoves = useCallback(async () => {
    const res = await fetchKitchenItemEntries(itemId);
    setMoves(res.data ?? []);
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
      <View onLayout={measure}>
        {standalone ? <KHeader title="Item" onBack={() => backToKitchen()} /> : null}
        <Empty title="This item is no longer in the list" />
      </View>
    );
  }

  const submitPanel = async () => {
    const n = Number(qty.replace(/[,\s]/g, ''));
    if (!panel || !qty.trim() || !Number.isFinite(n) || n < 0 || (panel === 'made' && n <= 0)) {
      setError(panel === 'made' ? 'Enter how much was made.' : 'Enter what is on the shelf now.');
      return;
    }
    if (panel === 'made' && item.item_kind !== 'finished_good') {
      setError('Batches can only be recorded for finished goods.');
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
        else if (standalone) backToKitchen();
      })();
    });
  };

  const level = stockLevels(data.entries, [item]).get(item.id);
  const figure = (
    <>
      <QtyFigure qty={item.stock} unit={item.unit} size={desktop ? 28 : 40} color={item.stock < 0 ? semantic.danger : colors.textPrimary} />
      {item.stock < 0 ? <Text style={{ color: semantic.danger, fontSize: 13, fontWeight: '700', marginTop: 4 }}>More has gone out than came in. A count sets it right.</Text> : null}
      {phone && level?.ref ? (
        // Task 233: the same level bar as the phone's stock list.
        <View style={{ marginTop: 8 }}>
          <Text className="text-[13px] font-semibold text-text-secondary">of {formatQty(level.ref, item.unit)} at the last count{level.state === 'low' ? ' · low' : ''}</Text>
          <View className="mt-2 h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: chart.grid }}>
            <View className="h-full rounded-full" style={{ width: `${Math.round(level.share * 100)}%`, backgroundColor: level.state === 'low' ? chart.pending : colors.primary }} />
          </View>
        </View>
      ) : null}
    </>
  );
  const actions = (
    <>
      {item.item_kind === 'finished_good' && can('entries.batch') ? <View className={split ? undefined : 'flex-1'}><GhostButton label="Create batch" tone="primary" icon={phone ? PackagePlus : undefined} disabled={busy} onPress={() => { setPanel(panel === 'made' ? null : 'made'); setQty(''); setError(null); }} /></View> : null}
      {can('entries.count') ? <View className={split ? undefined : 'flex-1'}><GhostButton label="Count stock" icon={phone ? ClipboardCheck : undefined} disabled={busy} onPress={() => { setPanel(panel === 'count' ? null : 'count'); setQty(''); setError(null); }} /></View> : null}
    </>
  );
  const field = panel ? <TextField value={qty} onChange={value => { setQty(value); setError(null); }} label={panel === 'made' ? 'Quantity made' : 'Counted quantity'} placeholder={panel === 'made' ? `Quantity made (${item.unit})` : `Count on the shelf (${item.unit})`} keyboardType="decimal-pad" autoFocus /> : null;
  const submit = <PrimaryButton label={panel === 'made' ? 'Add' : 'Set'} onPress={() => void submitPanel()} loading={busy} />;
  // In the narrow column the field and its button stack; elsewhere they share a line.
  const form = panel ? (
    <View>
      {panel === 'made' ? <Text className="mt-3 text-sm text-text-secondary">Record quantity produced. Raw material stock stays unchanged.</Text> : null}
      {split ? (
        <View style={{ gap: 8, marginTop: 10 }}>{field}{submit}</View>
      ) : (
        <View className="flex-row items-center" style={{ gap: 8, marginTop: 10 }}>
          <View className="flex-1">{field}</View>
          <View style={{ width: 96 }}>{submit}</View>
        </View>
      )}
    </View>
  ) : null;
  const history = (
    <Section title="Movements">
      <Card padded={false} style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
        {moves === null ? (
          <View style={{ paddingVertical: 14, gap: 8 }}><Skeleton height={40} /><Skeleton height={40} /></View>
        ) : moves.length === 0 ? (
          <Empty title="No movements yet" body={item.item_kind === 'finished_good' ? 'Batches, sends and stock counts will show here.' : 'Purchases and stock counts will show here.'} />
        ) : (
          <EntryList entries={moves} itemsById={data.itemsById} partiesById={data.partiesById} onPress={setOpen} />
        )}
      </Card>
    </Section>
  );

  return (
    <View onLayout={measure}>
      <KHeader
        title={item.name}
        subtitle={item.item_kind === 'raw_material' ? 'Raw material · stored as purchased' : !showAmounts ? 'Finished good' : `${item.sell_price !== null ? `Sells at ${formatMoney(item.sell_price)} per ${item.unit}` : 'Finished good · price entered on each send'}${item.cost_price !== null ? ` · costs ${formatMoney(item.cost_price)}` : ' · no cost set'}`}
        onBack={standalone ? () => backToKitchen() : undefined}
        large={!standalone}
        right={can('setup.items') ? <MoreMenu label={`More for ${item.name}`} items={[
          { label: 'Edit item', icon: Pencil, onPress: () => router.push({ pathname: '/central-kitchen/item-form', params: { id: item.id } }) },
          { label: 'Remove item', icon: Trash2, tone: 'out', onPress: remove },
        ]} /> : undefined}
      />
      {split ? (
        // Task 222 (Polaris details layout): movements take the wide column; the stock figure,
        // its two actions and their quantity box sit in a narrow column beside it.
        <View className="flex-row items-start gap-4">
          <View className="min-w-0 flex-1">{history}</View>
          <View className="w-64 shrink-0" style={stickySide}>
            <Section title="In stock">
              <Card>
                {figure}
                <View className="mt-3 gap-2">{actions}</View>
                {form}
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
                <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>In stock</Text>
                <View className="mt-0.5">{figure}</View>
              </View>
              <View className={desktop ? 'w-64 shrink-0 flex-row gap-2' : 'flex-row'} style={desktop ? undefined : { gap: 10, marginTop: 14 }}>{actions}</View>
            </View>
            {form}
            {error ? <Notice text={error} /> : null}
          </Card>
          {history}
        </>
      )}
      <EntryActions entry={open} onClose={() => { setOpen(null); void loadMoves(); }} itemsById={data.itemsById} partiesById={data.partiesById} />
    </View>
  );
}
