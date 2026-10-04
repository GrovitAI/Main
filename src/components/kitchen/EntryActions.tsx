import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { voidKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { entryAmountText, entryHeadline, entrySubline, formatDayLabel, formatMoney, formatQty, modeLabel, typeLabel } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { GhostButton, Notice, Sheet, TextField } from './ui';

type Props = {
  entry: KitchenEntry | null;
  onClose: () => void;
  itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>;
};

/** One entry in full, and the one thing that can be done to it: void it. */
export function EntryActions({ entry, onClose, itemsById, partiesById }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!entry) return null;
  const names = { party: entry.party_id ? partiesById.get(entry.party_id)?.name : null, item: entry.item_id ? itemsById.get(entry.item_id)?.name : null };

  const doVoid = () => {
    confirmAction(
      'Void this entry?',
      `${entryHeadline(entry, names)} of ${formatDayLabel(entry.entry_date)} stays in the history, marked void, and any stock it moved goes back.`,
      'Void',
      () => {
        void (async () => {
          setBusy(true);
          setError(null);
          const res = await voidKitchenEntry(entry.id, reason.trim() || null);
          setBusy(false);
          if (res.error) {
            setError(res.error);
            return;
          }
          await useKitchenStore.getState().load(true);
          useKitchenStore.getState().setNotice('Entry voided');
          setReason('');
          onClose();
        })();
      },
    );
  };

  return (
    <Sheet visible onClose={onClose} title={`${typeLabel(entry.type)} · ${formatDayLabel(entry.entry_date)}`}>
      <View style={{ gap: 12 }}>
        <View>
          <Text className="text-text-primary" style={{ fontSize: 17, fontWeight: '800' }}>{entryHeadline(entry, names)}</Text>
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 2 }}>{entrySubline(entry, itemsById) || ' '}</Text>
        </View>
        {entry.lines.length > 0 ? (
          <View className="rounded-2xl border border-border-soft bg-surface-tint" style={{ padding: 12, gap: 6 }}>
            {entry.lines.map((l) => {
              const it = itemsById.get(l.item_id);
              return (
                <View key={l.id} className="flex-row justify-between" style={{ gap: 10 }}>
                  <Text className="flex-1 text-text-primary" style={{ fontSize: 13, fontWeight: '600' }}>{it?.name ?? 'Item'} · {formatQty(l.qty, it?.unit ?? '')} × {formatMoney(l.price)}</Text>
                  <Text className="text-text-primary" style={{ fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(l.line_total)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        <View className="flex-row flex-wrap" style={{ gap: 14 }}>
          {entryAmountText(entry) ? <Meta label="Amount" value={entryAmountText(entry)} /> : null}
          {entry.mode ? <Meta label="Mode" value={modeLabel(entry.mode)} /> : null}
          <Meta label="Recorded by" value={entry.created_by} />
          {entry.note ? <Meta label="Note" value={entry.note} /> : null}
        </View>
        {entry.voided_at ? (
          <Notice tone="neutral" text={`Voided${entry.void_reason ? `: ${entry.void_reason}` : ''}. It no longer counts anywhere.`} />
        ) : (
          <View style={{ gap: 10, marginTop: 4 }}>
            <TextField value={reason} onChange={setReason} label="Reason for voiding" placeholder="Why it is being voided (optional)" />
            <GhostButton label={busy ? 'Voiding…' : 'Void this entry'} tone="out" onPress={doVoid} />
            {error ? <Notice text={error} /> : null}
          </View>
        )}
      </View>
    </Sheet>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-text-secondary" style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <Text className="text-text-primary" style={{ fontSize: 14, fontWeight: '700', marginTop: 2 }}>{value}</Text>
    </View>
  );
}
