import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { editKitchenEntry, postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { balanceFromEntries, formatMoney, parseAmount } from '@/lib/pos/kitchen-utils';
import type { KitchenEntryType, KitchenPartyKind, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, SettingsGroup, TextField, useSavedThen } from '@/components/kitchen/ui';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { PartyPicker, isValidDateKey, useDateGuard } from '@/components/kitchen/forms';
import { AmountPad, AmountRow, NoteRow, WhenRow, WhoRow } from '@/components/kitchen/EntryRows';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

const EDITABLE: readonly KitchenEntryType[] = ['carried'];

/**
 * Task 314: Pending from earlier. What a branch owed the kitchen, or the kitchen owed a vendor, as
 * of a day, entered as one amount: last month's bills that were never entered one by one, so the
 * month closes with them. It counts in that month's sales or purchases, moves no money, and money
 * paid later clears it oldest first. The day is always chosen (no date is filled in).
 */
export default function CarriedScreen() {
  const data = useKitchenData();
  const access = useKitchenAccess();
  const params = useLocalSearchParams<{ party?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const startParty = params.party ? data.partiesById.get(params.party) ?? null : null;
  const mayBranch = access.can('entries.receive');
  const mayVendor = access.can('entries.buy');
  const [kind, setKind] = useState<KitchenPartyKind>(startParty?.kind ?? (mayBranch ? 'branch' : 'vendor'));
  const [partyId, setPartyId] = useState<string | null>(startParty?.id ?? null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [padOpen, setPadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const done = useSavedThen();
  const phone = !useResponsive().isTablet;

  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    const p = editing.party_id ? data.partiesById.get(editing.party_id) : undefined;
    if (p) setKind(p.kind);
    setPartyId(editing.party_id);
    setAmountText(String(editing.amount));
    setDate(editing.entry_date);
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled, data.partiesById]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const amount = parseAmount(amountText);
  const isBranch = kind === 'branch';
  // While editing, the entry's own amount is taken out so the figure reads as before it.
  const now = partyId ? balanceFromEntries(data.entries, partyId, kind, party?.opening ?? 0) - (editing?.amount ?? 0) : 0;
  const dateOk = useDateGuard(date, lockReason);
  const allowed = isBranch ? mayBranch : mayVendor;
  const reason = !partyId ? `Choose a ${isBranch ? 'branch' : 'vendor'}`
    : amount <= 0 ? 'Enter the amount'
    : !isValidDateKey(date) ? 'Choose the date'
    : !dateOk ? 'Check the date'
    : undefined;
  const canSave = !missing && allowed && !reason;

  const typed = useTypedChanges(JSON.stringify({ amountText: amountText.trim(), note: note.trim(), date }), prefilled);
  useLeaveGuard(typed && !done.saved, 'What you entered');

  const save = async () => {
    if (!canSave || !partyId) return;
    setSaving(true);
    setError(null);
    const input: PostEntryInput = { type: 'carried', party_id: partyId, entry_date: date, amount, note: note.trim() || null };
    const res = editing ? await editKitchenEntry(editing.id, input, lockReason) : await postKitchenEntry(input, lockReason);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      buzz('error');
      return;
    }
    done.mark();
    await data.load(true);
    const after = balanceFromEntries(useKitchenStore.getState().entries, partyId, kind, party?.opening ?? 0);
    useKitchenStore.getState().setNotice(editing ? 'Changes saved' : `${party?.name ?? 'Saved'} · ${formatMoney(after)} pending`);
    done.finish(backToKitchen);
  };

  const onAmount = (t: string) => setAmountText(t);
  const pending = (n: number): string => (n < 0 ? `${formatMoney(-n)} paid ahead` : `${formatMoney(n)} pending`);
  const afterLine = party && amount > 0 && access.showAmounts ? (
    <Text className="mt-1.5 text-xs font-semibold text-text-secondary">{`${party.name}: ${pending(now)} → ${pending(now + amount)}`}</Text>
  ) : null;
  const saveButton = <PrimaryButton label={editing ? 'Save changes' : amount > 0 ? `Save · ${formatMoney(amount)}` : 'Save'} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved} reason={reason} />;

  const rows = party ? (
    <>
      <SettingsGroup>
        <WhoRow name={party.name} sub={access.showAmounts ? pending(now) : undefined} onChange={editing ? undefined : () => setPartyId(null)} />
        {phone ? <AmountRow amount={amount} open={padOpen} onPress={() => setPadOpen((o) => !o)} /> : null}
        <WhenRow label="As of" date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} required />
        <NoteRow value={note} onChange={setNote} placeholder="October bills" />
      </SettingsGroup>
      {phone ? afterLine : null}
    </>
  ) : (
    <Field label={isBranch ? 'Branch' : 'Vendor'}>
      <PartyPicker kind={kind} parties={data.parties} balances={data.balances} value={partyId} onChange={setPartyId} />
    </Field>
  );

  return (
    <KeyboardAvoider>
      <KScreen footer={phone && padOpen && !!party ? <AmountPad value={amountText} onChange={onAmount} onDone={() => setPadOpen(false)} save={canSave ? saveButton : undefined} /> : saveButton}>
        <KHeader title={editing ? 'Edit pending from earlier' : 'Pending from earlier'} onBack={() => backToKitchen()} />
        {missing ? <Notice text="That entry cannot be edited here: it is deleted, older than three months, or not a pending from earlier." /> : null}
        {!mayBranch && !mayVendor ? <Notice text="Your login cannot record this. Ask the owner." /> : null}
        {editing || !mayBranch || !mayVendor ? null : (
          <View style={{ marginTop: 4, marginBottom: 6 }}>
            <Segmented options={[{ value: 'branch', label: 'Branch owed us' }, { value: 'vendor', label: 'We owed a vendor' }]} value={kind}
              onChange={(k) => { setKind(k); setPartyId(null); }} />
          </View>
        )}
        {phone ? rows : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View className="min-w-0 flex-1">{rows}</View>
            <View className="min-w-0 flex-1">
              <Field label="Amount">
                <TextField value={amountText} onChange={onAmount} label="Amount" placeholder="0" keyboardType="decimal-pad" prefix="₹" big />
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
