import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { editKitchenEntry, postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { allocateAcross, balanceFromEntries, formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import type { KitchenEntryType, KitchenMode, KitchenOpenDocument, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { AmountPanel, Field, KHeader, KScreen, Notice, PrimaryButton, SelectRow, SettingsGroup, TextField, useSavedThen } from '@/components/kitchen/ui';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { useDateGuard, OpenDocsPicker, PartyPicker, isValidDateKey } from '@/components/kitchen/forms';
import { AmountRow, NoteRow, WhenRow, WhoRow } from '@/components/kitchen/EntryRows';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

const EDITABLE: readonly KitchenEntryType[] = ['received'];
const PAID_IN: readonly { value: KitchenMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
];

/**
 * Money from a branch (task 280, owner's layout): the branch as round circles, then rows (paid
 * in, when, note), the sends it is for if any, and the amount in a panel at the bottom on a phone.
 * Any amount; it comes off what the branch owes.
 */
export default function ReceivedScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [amountText, setAmountText] = useState('');
  const [amountTyped, setAmountTyped] = useState(false);
  const [mode, setMode] = useState<KitchenMode>('upi');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [docs, setDocs] = useState<KitchenOpenDocument[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // Task 283: the number pad comes up only when the amount row is tapped.
  const [padOpen, setPadOpen] = useState(false);
  const done = useSavedThen();
  const phone = !useResponsive().isTablet;
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  // Editing: the form starts from the entry as it was saved.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setPartyId(editing.party_id);
    setAmountText(String(editing.amount));
    setAmountTyped(true);
    setMode(editing.mode ?? 'upi');
    setDate(editing.entry_date);
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const amount = parseAmount(amountText);
  const balanceNow = partyId ? balanceFromEntries(data.entries, partyId, 'branch', party?.opening ?? 0) : 0;
  const tickedDocs = useMemo(() => docs.filter((d) => ticked.has(d.entry_id)), [docs, ticked]);
  const covers = useMemo(() => allocateAcross(tickedDocs, amount), [tickedDocs, amount]);
  const dateOk = useDateGuard(date, lockReason);
  const reason = !partyId ? 'Choose a branch' : amount <= 0 ? 'Enter the amount' : !isValidDateKey(date) || !dateOk ? 'Check the date' : undefined;
  const canSave = !missing && !reason;
  const after = balanceNow - amount;

  const onTick = (list: KitchenOpenDocument[], next: Set<string>) => {
    setDocs(list);
    setTicked(next);
    // Ticking fills the amount until the user types one of their own.
    if (!amountTyped) {
      const sum = list.filter((d) => next.has(d.entry_id)).reduce((a, d) => a + d.open, 0);
      setAmountText(sum > 0 ? String(Math.round(sum * 100) / 100) : '');
    }
  };
  const onAmount = (t: string) => { setAmountText(t); setAmountTyped(t.trim().length > 0); };

  // Task 221: Back asks first once an amount or a note is typed; never after the save.
  const typed = useTypedChanges(JSON.stringify({ amountText: amountText.trim(), note: note.trim() }), prefilled);
  useLeaveGuard(typed && !done.saved, 'The amount you typed');
  const save = async () => {
    if (!partyId || amount <= 0 || missing) return;
    setSaving(true);
    setError(null);
    const input: PostEntryInput = { type: 'received', party_id: partyId, entry_date: date, amount, mode, note: note.trim() || null, covers };
    const res = editing ? await editKitchenEntry(editing.id, input, lockReason) : await postKitchenEntry(input, lockReason);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      buzz('error');
      return;
    }
    done.mark();
    await data.load(true);
    if (editing) {
      useKitchenStore.getState().setNotice('Changes saved');
    } else {
      const left = balanceFromEntries(useKitchenStore.getState().entries, partyId, 'branch', party?.opening ?? 0);
      useKitchenStore.getState().setNotice(`Received ${formatMoney(amount)} from ${party?.name ?? 'the branch'} · now ${formatMoney(Math.max(0, left))} to pay`);
    }
    done.finish(backToKitchen);
  };

  const saveButton = <PrimaryButton label={editing ? 'Save changes' : amount > 0 ? `Save · ${formatMoney(amount)}` : 'Save'} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved} reason={reason} />;
  const afterLine = party && amount > 0 && !editing ? (
    <Text className="mt-1.5 text-xs font-semibold text-text-secondary">{after < 0 ? `${formatMoney(-after)} paid ahead after this` : after === 0 ? 'Settled up after this' : `${formatMoney(after)} still owed after this`}</Text>
  ) : null;

  const rows = party ? (
    <>
      <SettingsGroup>
        <WhoRow name={party.name} sub={balanceNow > 0 ? `Owes ${formatMoney(balanceNow)}` : balanceNow < 0 ? `${formatMoney(-balanceNow)} in credit` : 'Settled up'} onChange={editing ? undefined : () => { setPartyId(null); setTicked(new Set()); }} />
        {phone ? <AmountRow amount={amount} open={padOpen} onPress={() => setPadOpen(true)} /> : null}
        <SelectRow label="Paid in" value={mode} options={PAID_IN} onChange={setMode} />
        <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
        <NoteRow value={note} onChange={setNote} />
      </SettingsGroup>
      {phone ? afterLine : null}
      <Field label="Against which sends" optional>
        <OpenDocsPicker partyId={partyId} kind="branch" itemsById={data.itemsById} ticked={ticked} onChange={onTick} reopenPaymentId={editing?.id} />
      </Field>
    </>
  ) : (
    <Field label="From">
      <PartyPicker kind="branch" parties={data.parties} balances={data.balances} value={partyId} onChange={(id) => { setPartyId(id); setTicked(new Set()); }} />
    </Field>
  );

  return (
    <KeyboardAvoider>
      <KScreen footer={phone && padOpen && !!party ? <AmountPanel value={amountText} onChange={onAmount}><PrimaryButton label="Done" onPress={() => setPadOpen(false)} /></AmountPanel> : saveButton}>
        <KHeader title={editing ? 'Edit receipt' : 'Received'} onBack={() => backToKitchen()} />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a receipt." /> : null}
        {phone ? rows : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View className="min-w-0 flex-1">{rows}</View>
            <View className="min-w-0 flex-1">
              <Field label="Amount">
                <TextField value={amountText} onChange={onAmount} label="Amount" placeholder="0" keyboardType="decimal-pad" prefix="₹" big autoFocus={!!params.party} />
                {afterLine}
              </Field>
            </View>
          </View>
        )}
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}
