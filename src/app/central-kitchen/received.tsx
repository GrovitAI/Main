import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { allocateAcross, balanceFromEntries, formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import type { KitchenMode, KitchenOpenDocument } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, TextField } from '@/components/kitchen/ui';
import { DateField, ModePicker, OpenDocsPicker, PartyPicker, isValidDateKey } from '@/components/kitchen/forms';

/** Money from a branch. Any amount; it comes off what the branch owes. */
export default function ReceivedScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string }>();
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [amountText, setAmountText] = useState('');
  const [amountTyped, setAmountTyped] = useState(false);
  const [mode, setMode] = useState<KitchenMode>('upi');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [docs, setDocs] = useState<KitchenOpenDocument[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const amount = parseAmount(amountText);
  const balanceNow = partyId ? balanceFromEntries(data.entries, partyId, 'branch') : 0;
  const tickedDocs = useMemo(() => docs.filter((d) => ticked.has(d.entry_id)), [docs, ticked]);
  const covers = useMemo(() => allocateAcross(tickedDocs, amount), [tickedDocs, amount]);
  const canSave = !!partyId && amount > 0 && isValidDateKey(date);

  const onTick = (list: KitchenOpenDocument[], next: Set<string>) => {
    setDocs(list);
    setTicked(next);
    // Ticking fills the amount until the user types one of their own.
    if (!amountTyped) {
      const sum = list.filter((d) => next.has(d.entry_id)).reduce((a, d) => a + d.open, 0);
      setAmountText(sum > 0 ? String(Math.round(sum * 100) / 100) : '');
    }
  };

  const save = async () => {
    if (!partyId || amount <= 0) return;
    setSaving(true);
    setError(null);
    const res = await postKitchenEntry({ type: 'received', party_id: partyId, entry_date: date, amount, mode, note: note.trim() || null, covers });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await data.load(true);
    const after = balanceFromEntries(useKitchenStore.getState().entries, partyId, 'branch');
    useKitchenStore.getState().setNotice(`Received ${formatMoney(amount)} from ${party?.name ?? 'the branch'} · now ${formatMoney(Math.max(0, after))} to pay`);
    backToKitchen();
  };

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label="Save" tone="in" onPress={() => void save()} disabled={!canSave} loading={saving} />}>
        <KHeader title="Received from a branch" subtitle="Any amount; it comes off what they owe" onBack={() => backToKitchen()} />
        <Field label="Branch">
          <PartyPicker kind="branch" parties={data.parties} balances={data.balances} value={partyId} onChange={(id) => { setPartyId(id); setTicked(new Set()); }} />
        </Field>
        <Field label="Amount">
          <TextField value={amountText} onChange={(t) => { setAmountText(t); setAmountTyped(t.trim().length > 0); }} label="Amount" placeholder="0" keyboardType="decimal-pad" prefix="₹" big autoFocus={!!params.party} />
          {party ? (
            <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
              {party.name}: {formatMoney(balanceNow)} yet to pay{amount > 0 ? ` → after this ${formatMoney(balanceNow - amount)}` : ''}
            </Text>
          ) : null}
        </Field>
        <Field label="Mode">
          <ModePicker value={mode} onChange={setMode} />
        </Field>
        <DateField value={date} onChange={setDate} />
        {partyId ? (
          <Field label="Against which sends (optional)" hint="Tick what this money is for and the amount fills itself. Leave them all unticked and it simply comes off the balance.">
            <OpenDocsPicker partyId={partyId} kind="branch" itemsById={data.itemsById} ticked={ticked} onChange={onTick} />
          </Field>
        ) : null}
        <Field label="Note">
          <TextField value={note} onChange={setNote} label="Note" placeholder="Optional" />
        </Field>
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}
