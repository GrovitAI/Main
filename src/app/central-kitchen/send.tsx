import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { MessageCircle } from 'lucide-react-native';
import { editKitchenEntry, postKitchenEntry, kitchenBranch, saveKitchenItem } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { balanceFromEntries, formatDayLabel, formatMoney, formatQty, linesTotal, localDateKey, oftenSent, slipText, whatsappUrl } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenEntryType, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, GhostButton, KHeader, KScreen, Notice, PrimaryButton, SettingsGroup, Sheet } from '@/components/kitchen/ui';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { useDateGuard, PartyPicker, draftToLines, isValidDateKey, typedLines } from '@/components/kitchen/forms';
import { NoteRow, TotalBar, WhenRow, WhoRow } from '@/components/kitchen/EntryRows';
import { ItemLines, ItemSearch, LinePad, startRate, useDraftLines } from '@/components/kitchen/EntryLines';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

const EDITABLE: readonly KitchenEntryType[] = ['sent'];

/**
 * Items to a branch (task 280, owner's layout): who it goes to as round circles, then rows, then
 * the items with − and + and a rate on each. Finished goods and raw materials both go. The rate
 * starts at the item's set price; an item without one asks for it, and the rate typed becomes
 * its price for next time. Stock goes down; the branch owes the total.
 */
export default function SendScreen() {
  const data = useKitchenData();
  const access = useKitchenAccess();
  const { showAmounts } = access;
  const params = useLocalSearchParams<{ party?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [date, setDate] = useState(localDateKey());
  const draft = useDraftLines();
  const { lines, order, active } = draft;
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<KitchenEntry | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const phone = !useResponsive().isTablet;

  // Editing: the form starts from the send as it was saved.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setPartyId(editing.party_id);
    setDate(editing.entry_date);
    draft.reset(Object.fromEntries(editing.lines.map((l) => [l.item_id, { qty: l.qty, price: l.price }])), editing.lines.map((l) => l.item_id));
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled, draft]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const chosen = useMemo(() => draftToLines(lines), [lines]);
  const withQty = Object.entries(lines).filter(([, l]) => l.qty > 0);
  const total = useMemo(() => linesTotal(Object.values(lines).filter((l) => l.qty > 0).map((l) => ({ qty: l.qty, price: l.price ?? 0 }))), [lines]);
  const unpriced = withQty.find(([, l]) => l.price === null);
  const unpricedName = unpriced ? data.itemsById.get(unpriced[0])?.name ?? 'an item' : null;
  // The items this branch usually gets, as round initials before anything is typed (task 216); none while editing.
  const picks = useMemo(() => (partyId && !editing ? oftenSent(data.entries, partyId) : []), [data.entries, partyId, editing]);
  const dateOk = useDateGuard(date, lockReason);
  const balanceNow = partyId ? balanceFromEntries(data.entries, partyId, 'branch', party?.opening ?? 0) : 0;
  const reason = !partyId ? 'Choose a branch'
    : withQty.length === 0 ? 'Add a quantity'
    : unpricedName ? (showAmounts ? `Set ${unpricedName}’s rate` : `${unpricedName} has no price yet`)
    : !isValidDateKey(date) || !dateOk ? 'Check the date' : undefined;
  const canSave = !missing && !reason && chosen !== null && chosen.length > 0;

  // Task 221: Back asks first once items or a note are typed; never after the save.
  const typed = useTypedChanges(JSON.stringify({ lines: typedLines(lines), note: note.trim() }), prefilled);
  useLeaveGuard(typed && saved === null, 'The items you typed');
  const save = async () => {
    if (!partyId || !chosen || chosen.length === 0 || missing) return;
    setSaving(true);
    setError(null);
    const input: PostEntryInput = { type: 'sent', party_id: partyId, entry_date: date, lines: chosen, note: note.trim() || null };
    const res = editing ? await editKitchenEntry(editing.id, input, lockReason) : await postKitchenEntry(input, lockReason);
    if (res.error || !res.data) {
      setSaving(false);
      setError(res.error ?? 'Unable to save the send.');
      buzz('error');
      return;
    }
    // Owner's ask: a rate typed for an item that had no price becomes its price for next time.
    if (access.can('setup.items')) {
      await Promise.all(chosen.map((l) => {
        const it = data.itemsById.get(l.item_id);
        return it && it.sell_price === null && l.price > 0 ? saveKitchenItem({ name: it.name, unit: it.unit, sell_price: l.price }, it.id) : Promise.resolve(null);
      }));
    }
    setSaving(false);
    buzz('success');
    await data.load(true);
    setSaved({ ...res.data, lines: chosen.map((l, i) => ({ id: String(i), item_id: l.item_id, qty: l.qty, price: l.price, line_total: Math.round(l.qty * l.price * 100) / 100 })) });
  };

  const balanceAfter = party ? balanceFromEntries(useKitchenStore.getState().entries, party.id, 'branch', party.opening) : 0;
  // The branch is usually named "Le Laban Central Kitchen" already; only add the brand when it is not.
  const kitchenName = /le\s*laban/i.test(kitchenBranch().name) ? kitchenBranch().name : `Le Laban ${kitchenBranch().name}`;
  const slip = saved && party ? slipText({ kitchenName, partyName: party.name, entry: saved, itemsById: data.itemsById, balanceAfter }) : '';

  const share = async () => {
    if (!slip) return;
    const url = whatsappUrl(slip, party?.phone);
    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(url);
      } else {
        const can = await Linking.canOpenURL(url);
        if (can) await Linking.openURL(url);
        else await Share.share({ message: slip });
      }
    } catch {
      await Share.share({ message: slip }).catch(() => undefined);
    }
  };

  const done = () => {
    useKitchenStore.getState().setNotice(editing ? 'Changes saved' : `Sent to ${party?.name ?? 'the branch'}${showAmounts ? ` · ${formatMoney(saved?.amount ?? total)}` : ''}`);
    setSaved(null);
    backToKitchen();
  };

  const activeItem = active ? data.itemsById.get(active.itemId) ?? null : null;
  const activeLine = active ? lines[active.itemId] ?? null : null;
  const pad = activeItem && activeLine && active ? (
    <LinePad key={activeItem.id} it={activeItem} line={activeLine} field={active.field} showAmounts={showAmounts}
      onField={(f) => draft.setActive({ itemId: activeItem.id, field: f })} onChange={(l) => draft.update(activeItem.id, l)} onDone={() => draft.setActive(null)} />
  ) : null;
  const caption = !party ? 'No items yet' : withQty.length === 0 ? 'No items yet' : `${party.name} will owe`;
  const footer = phone && pad ? pad : (
    <TotalBar caption={caption} total={formatMoney(total)} showTotal={showAmounts && withQty.length > 0}>
      <PrimaryButton label={editing ? 'Save changes' : showAmounts && total > 0 ? `Send · ${formatMoney(total)}` : 'Send'} onPress={() => void save()} disabled={!canSave} loading={saving} reason={reason} />
    </TotalBar>
  );

  const who = party ? (
    <SettingsGroup>
      <WhoRow name={party.name} sub={showAmounts ? (balanceNow > 0 ? `Owes ${formatMoney(balanceNow)}` : balanceNow < 0 ? `${formatMoney(-balanceNow)} in credit` : 'Settled up') : undefined}
        onChange={editing ? undefined : () => setPartyId(null)} />
      <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
      <NoteRow value={note} onChange={setNote} />
    </SettingsGroup>
  ) : (
    <Field label="To">
      <PartyPicker kind="branch" parties={data.parties} balances={data.balances} value={partyId} onChange={setPartyId} />
    </Field>
  );
  const items = (
    <Field label={withQty.length ? `Items · ${withQty.length}` : 'Items'}>
      <ItemSearch items={data.items} mode="sell" lines={lines} picks={picks} showAmounts={showAmounts} onAdd={(it) => draft.add(it, startRate(it, 'sell'))} />
      <ItemLines items={data.itemsById} lines={lines} order={order} onChange={draft.change} active={active} showAmounts={showAmounts}
        onOpen={(itemId, field) => draft.setActive({ itemId, field })} />
    </Field>
  );

  return (
    <KeyboardAvoider>
      <KScreen footer={footer}>
        <KHeader title={editing ? 'Edit send' : 'Send'} onBack={() => backToKitchen()} />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a send." /> : null}
        {phone ? <>{who}{items}</> : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View style={{ width: 340 }}>{who}</View>
            <View className="min-w-0 flex-1" style={{ marginTop: party ? -10 : 0 }}>{items}</View>
          </View>
        )}
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>

      {/* A laptop types a line's quantity and rate in a small window. */}
      {!phone ? <Sheet visible={!!pad} onClose={() => draft.setActive(null)} title="Quantity and rate">{pad}</Sheet> : null}

      <Sheet visible={saved !== null} onClose={done} title={editing ? 'Send corrected' : 'Sent'}>
        {saved && party ? (
          <View style={{ gap: 14 }}>
            {/* The slip is the sheet's own content: hairlines, no box inside the box. */}
            <View>
              <Text className="text-text-primary" style={{ fontSize: 16, fontWeight: '800' }}>{kitchenName}</Text>
              <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 2 }}>To {party.name} · {formatDayLabel(saved.entry_date, '')}</Text>
              <View className="border-t border-border-soft" style={{ marginTop: 12, paddingTop: 10, gap: 8 }}>
                {saved.lines.map((l) => {
                  const it = data.itemsById.get(l.item_id);
                  return (
                    <View key={l.id} className="flex-row justify-between" style={{ gap: 10 }}>
                      <Text className="flex-1 text-text-primary" style={{ fontSize: 14, fontWeight: '600' }}>{it?.name ?? 'Item'} · {formatQty(l.qty, it?.unit ?? '')} × {formatMoney(l.price)}</Text>
                      <Text className="text-text-primary" style={{ fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(l.line_total)}</Text>
                    </View>
                  );
                })}
              </View>
              <View className="flex-row justify-between border-t border-border-soft" style={{ marginTop: 12, paddingTop: 10 }}>
                <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800' }}>Total</Text>
                <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(saved.amount)}</Text>
              </View>
              <View className="flex-row justify-between" style={{ marginTop: 4 }}>
                <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600' }}>{party.name} yet to pay</Text>
                <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatMoney(balanceAfter)}</Text>
              </View>
            </View>
            <View className="flex-row" style={{ gap: 10 }}>
              <View className="flex-1"><GhostButton label="WhatsApp" icon={MessageCircle} tone="primary" onPress={() => void share()} /></View>
              <View className="flex-1"><PrimaryButton label="Done" onPress={done} /></View>
            </View>
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoider>
  );
}
