import React, { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { voidKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { entryAmountText, entryHeadline, entryNames, entrySubline, formatDayLabel, formatMoney, formatQty, modeLabel, typeLabel } from '@/lib/pos/kitchen-utils';
import { historyAuditText, historyDateLabel, historyTimeLabel } from '@/lib/pos/kitchen-history-utils';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { GhostButton, Notice, Sheet, TextField } from './ui';

type Props = {
  entry: KitchenEntry | null;
  onClose: () => void;
  itemsById: ReadonlyMap<string, KitchenItem>;
  partiesById: ReadonlyMap<string, KitchenParty>;
  /** History passes the original when it is present in the loaded window. */
  previousEntry?: KitchenEntry | null;
};

/** The form that corrects an entry of this kind; stock-only entries are redone from the item instead. */
function editHref(entry: KitchenEntry): { pathname: string; params: Record<string, string> } | null {
  switch (entry.type) {
    case 'sent': return { pathname: '/central-kitchen/send', params: { edit: entry.id } };
    case 'received': return { pathname: '/central-kitchen/received', params: { edit: entry.id } };
    case 'bought': return { pathname: '/central-kitchen/bought', params: { edit: entry.id } };
    case 'paid': return { pathname: '/central-kitchen/spent', params: { edit: entry.id, kind: 'vendor' } };
    case 'spent': return { pathname: '/central-kitchen/spent', params: { edit: entry.id, kind: 'expense' } };
    case 'issued': return { pathname: '/central-kitchen/give', params: { edit: entry.id } };
    default: return null;
  }
}

/** One entry in full, and what can be done to it: edit it, or void it. */
export function EntryActions({ entry, onClose, itemsById, partiesById, previousEntry }: Props) {
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const access = useKitchenAccess();
  if (!entry) return null;
  const locked = access.isLocked(entry.entry_date);
  // Who may change it: the owner always (a locked day needs a reason); others by permission, never on a locked day.
  const mayChange = access.isOwner || (access.canFix(entry) && !locked);
  const ownerLocked = locked && access.isOwner;
  const blockedText = locked ? `${formatDayLabel(entry.entry_date)} is locked. Ask the owner to correct this entry.` : 'Your login cannot change this entry. Ask the owner or a kitchen manager.';
  const names = entryNames(entry, partiesById, itemsById);
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
    <Sheet visible onClose={onClose} dirty={reason.trim().length > 0} title={`${typeLabel(entry.type)} · ${formatDayLabel(entry.entry_date)}`}>
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
          {entryAmountText(entry) && access.showAmounts ? <Meta label="Amount" value={entryAmountText(entry)} /> : null}
          {entry.mode ? <Meta label="Mode" value={modeLabel(entry.mode)} /> : null}
          <Meta label="Transaction date" value={historyDateLabel(entry.entry_date)} />
          <Meta label="Entered by" value={entry.created_by} />
          <Meta label="Entry date" value={historyTimeLabel(entry.created_at)} />
          {entry.replaces_id ? <Meta label="Edited" value="Replaces an earlier entry" /> : null}
          {entry.note ? <Meta label="Note" value={entry.note} /> : null}
        </View>
        {historyAuditText(entry) ? <Notice tone="neutral" text={historyAuditText(entry) ?? ''} /> : null}
        {previousEntry ? <View className="gap-1 border-t border-border-soft pt-3">
          <Text className="text-sm font-bold text-text-primary">Before this edit</Text>
          <Text className="text-sm text-text-primary">{entryHeadline(previousEntry, entryNames(previousEntry, partiesById, itemsById))} · {entryAmountText(previousEntry)}</Text>
          <Text className="text-xs leading-4 text-text-secondary">{entrySubline(previousEntry, itemsById)}</Text>
          <Text className="text-xs leading-4 text-text-secondary">Transaction {historyDateLabel(previousEntry.entry_date)} · Entered by {previousEntry.created_by} · {historyTimeLabel(previousEntry.created_at)}</Text>
        </View> : previousEntry === null && entry.replaces_id ? <Text className="text-xs leading-4 text-text-secondary">The earlier version is outside the loaded history window.</Text> : null}
        {entry.voided_at ? (
          <Notice tone="neutral" text={entry.void_reason === 'Edited' ? 'Edited: a corrected entry took its place. This one no longer counts anywhere.' : `Voided${entry.void_reason ? `: ${entry.void_reason}` : ''}. It no longer counts anywhere.`} />
        ) : !mayChange ? (
          <Notice tone="neutral" text={blockedText} />
        ) : (
          <View style={{ gap: 10, marginTop: 4 }}>
            {ownerLocked ? <Notice tone="neutral" text={`${formatDayLabel(entry.entry_date)} is locked. As the owner you can still change it; give a reason, which is kept in the change log.`} /> : null}
            <View className="flex-row" style={{ gap: 10 }}>
              {href ? <View className="flex-1"><GhostButton label="Edit" icon={Pencil} tone="primary" onPress={edit} /></View> : null}
              <View className="flex-1"><GhostButton label="Void…" tone="out" onPress={() => setVoiding((v) => !v)} /></View>
            </View>
            {!href ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600' }}>A batch or a count is corrected by voiding it and recording it again from the item.</Text> : null}
            {voiding ? (
              // The reason belongs to the void alone, so it opens with it.
              <View className="border-t border-border-soft" style={{ gap: 10, paddingTop: 12 }}>
                <TextField value={reason} onChange={setReason} label="Reason for voiding" placeholder={ownerLocked ? 'Why it is being voided (needed for a locked day)' : 'Why it is being voided (optional)'} autoFocus />
                <GhostButton label={busy ? 'Voiding…' : 'Void this entry'} tone="out" onPress={doVoid} disabled={ownerLocked && !reason.trim()} />
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
