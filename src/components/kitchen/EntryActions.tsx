import React, { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { voidKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { confirmAction } from '@/lib/pos/dialogs';
import { colors } from '@/lib/pos/brand';
import { entryAmountText, entryHeadline, entryNames, entrySubline, formatDayLabel, formatMoney, formatQty, modeLabel } from '@/lib/pos/kitchen-utils';
import { historyAuditText, historyDateLabel, historyTimeLabel } from '@/lib/pos/kitchen-history-utils';
import type { KitchenEntry, KitchenItem, KitchenParty } from '@/lib/pos/kitchen-types';
import { GhostButton, Notice, ReceiptLine, Sheet, TextField } from './ui';

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

  const amount = access.showAmounts ? entryAmountText(entry) : '';
  const voided = entry.voided_at !== null;
  // The day and how much is on it; the items themselves are the table below, not a sentence as well.
  const about = entry.lines.length > 0 ? (entry.lines.length === 1 ? '1 item' : `${entry.lines.length} items`)
    : entry.type === 'made' || entry.type === 'count' ? entrySubline({ ...entry, note: null, voided_at: null }, itemsById)
    : entry.type === 'spent' ? (entry.subcategory ? `${entry.category ?? ''} › ${entry.subcategory}` : entry.category ?? '') : '';
  const audit = historyAuditText(entry)?.replace(' IST', '') ?? null;
  const status = voided ? `${audit ?? 'Voided'}. It no longer counts.` : audit;
  const payment = entry.type === 'bought' && !entry.paid ? 'Pay later' : entry.mode ? modeLabel(entry.mode) : null;

  return (
    <Sheet visible onClose={onClose} dirty={reason.trim().length > 0} title={entryHeadline(entry, names)}>
      <View style={{ gap: 14 }}>
        <View>
          <Text className="text-text-secondary" style={{ fontSize: 14, fontWeight: '600' }}>{[formatDayLabel(entry.entry_date, ''), about].filter(Boolean).join(' · ')}</Text>
          {status ? <Notice tone="neutral" text={status} /> : null}
        </View>
        {entry.lines.length > 0 ? (
          <View className="border-t border-border-soft" style={{ paddingTop: 7 }}>
            {entry.lines.map((l) => {
              const it = itemsById.get(l.item_id);
              const qty = formatQty(l.qty, it?.unit ?? '');
              return <ReceiptLine key={l.id} name={it?.name ?? 'Removed item'} detail={access.showAmounts && entry.type !== 'issued' ? `${qty} × ${formatMoney(l.price)}` : qty} amount={access.showAmounts && entry.type !== 'issued' ? formatMoney(l.line_total) : undefined} />;
            })}
          </View>
        ) : null}
        {amount ? (
          <View className="flex-row items-baseline justify-between border-t border-border-soft" style={{ paddingTop: 10 }}>
            <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800' }}>{entry.lines.length > 0 ? 'Total' : 'Amount'}</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: voided ? colors.textSecondary : colors.textPrimary, textDecorationLine: voided ? 'line-through' : 'none', fontVariant: ['tabular-nums'] }}>{amount}</Text>
          </View>
        ) : null}
        <View className="border-t border-border-soft" style={{ paddingTop: 4 }}>
          {payment ? <Meta label="Paid by" value={payment} /> : null}
          <Meta label="Entered" value={`${entry.created_by}, ${historyTimeLabel(entry.created_at).replace(' IST', '')}`} />
          {entry.note ? <Meta label="Note" value={entry.note} /> : null}
        </View>
        {previousEntry ? <View className="gap-1 border-t border-border-soft pt-3">
          <Text className="text-sm font-bold text-text-primary">Before this edit</Text>
          <Text className="text-sm text-text-primary">{entryHeadline(previousEntry, entryNames(previousEntry, partiesById, itemsById))}{access.showAmounts ? ` · ${entryAmountText(previousEntry)}` : ''}</Text>
          <Text className="text-xs leading-4 text-text-secondary" numberOfLines={2}>{entrySubline(previousEntry, itemsById)}</Text>
          <Text className="text-xs leading-4 text-text-secondary">{historyDateLabel(previousEntry.entry_date)} · Entered by {previousEntry.created_by}, {historyTimeLabel(previousEntry.created_at).replace(' IST', '')}</Text>
        </View> : previousEntry === null && entry.replaces_id ? <Text className="text-xs leading-4 text-text-secondary">The earlier version is outside the loaded history.</Text> : null}
        {voided ? null : !mayChange ? (
          <Notice tone="neutral" text={blockedText} />
        ) : (
          <View style={{ gap: 10 }}>
            {ownerLocked ? <Notice tone="neutral" text={`${formatDayLabel(entry.entry_date)} is locked. You can still change it; give a reason.`} /> : null}
            <View className="flex-row" style={{ gap: 10 }}>
              {href ? <View className="flex-1"><GhostButton label="Edit" icon={Pencil} tone="primary" onPress={edit} /></View> : null}
              <View className="flex-1"><GhostButton label="Void…" tone="out" onPress={() => setVoiding((v) => !v)} /></View>
            </View>
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
    <View className="flex-row items-baseline justify-between" style={{ gap: 16, paddingVertical: 6 }}>
      <Text className="text-text-secondary" style={{ fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <Text className="min-w-0 shrink text-right text-text-primary" style={{ fontSize: 14, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
