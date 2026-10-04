import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { voidKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { entryAmountText, entryHeadline, entrySubline, formatDayLabel, formatEnteredAt, formatLongDate, formatMoney, formatQty, modeLabel, typeLabel } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { GhostButton, Notice, Sheet, TextField } from './ui';

type Props = {
  entry: KitchenEntry | null;
  onClose: () => void;
  itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>;
};

/** The form that corrects an entry of this kind; stock-only entries are redone from the item instead. */
function editHref(entry: KitchenEntry): { pathname: string; params: Record<string, string> } | null {
  switch (entry.type) {
    case 'sent': return { pathname: '/central-kitchen/send', params: { edit: entry.id } };
    case 'received': return { pathname: '/central-kitchen/received', params: { edit: entry.id } };
    case 'bought': return { pathname: '/central-kitchen/bought', params: { edit: entry.id } };
    case 'paid': return { pathname: '/central-kitchen/spent', params: { edit: entry.id, kind: 'vendor' } };
    case 'spent': return { pathname: '/central-kitchen/spent', params: { edit: entry.id, kind: 'expense' } };
    default: return null;
  }
}

/** One entry in full, and what can be done to it: edit it, or void it. */
export function EntryActions({ entry, onClose, itemsById, partiesById }: Props) {
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!entry) return null;
  const names = { party: entry.party_id ? partiesById.get(entry.party_id)?.name : null, item: entry.item_id ? itemsById.get(entry.item_id)?.name : null };
  const href = editHref(entry);

  const edit = () => {
    if (!href) return;
    onClose();
    router.push(href as never);
  };

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
          setVoiding(false);
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
          <View className="border-t border-b border-border-soft" style={{ paddingVertical: 10, gap: 6 }}>
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
          <Meta label="On" value={formatLongDate(entry.entry_date)} />
          <Meta label="Entered" value={`${formatEnteredAt(entry.created_at)} · ${entry.created_by}`} />
          {entry.replaces_id ? <Meta label="Edited" value="Replaces an earlier entry" /> : null}
          {entry.note ? <Meta label="Note" value={entry.note} /> : null}
        </View>
        {entry.voided_at ? (
          <Notice tone="neutral" text={entry.void_reason === 'Edited' ? 'Edited: a corrected entry took its place. This one no longer counts anywhere.' : `Voided${entry.void_reason ? `: ${entry.void_reason}` : ''}. It no longer counts anywhere.`} />
        ) : (
          <View style={{ gap: 10, marginTop: 4 }}>
            <View className="flex-row" style={{ gap: 10 }}>
              {href ? <View className="flex-1"><GhostButton label="Edit" icon={Pencil} tone="primary" onPress={edit} /></View> : null}
              <View className="flex-1"><GhostButton label="Void…" tone="out" onPress={() => setVoiding((v) => !v)} /></View>
            </View>
            {!href ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600' }}>A batch or a count is corrected by voiding it and recording it again from the item.</Text> : null}
            {voiding ? (
              // The reason belongs to the void alone, so it opens with it.
              <View className="border-t border-border-soft" style={{ gap: 10, paddingTop: 12 }}>
                <TextField value={reason} onChange={setReason} label="Reason for voiding" placeholder="Why it is being voided (optional)" autoFocus />
                <GhostButton label={busy ? 'Voiding…' : 'Void this entry'} tone="out" onPress={doVoid} />
              </View>
            ) : null}
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
      <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <Text className="text-text-primary" style={{ fontSize: 14, fontWeight: '700', marginTop: 2 }}>{value}</Text>
    </View>
  );
}
