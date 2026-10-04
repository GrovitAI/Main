import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { editKitchenEntry, postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { balanceFromEntries, formatMoney, lastCostByItem, linesTotal, localDateKey } from '@/lib/pos/kitchen-utils';
import type { KitchenEntryType, KitchenMode, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, TextField } from '@/components/kitchen/ui';
import { DateField, LinesEditor, ModePicker, PartyPicker, draftToLines, isValidDateKey, type DraftLines } from '@/components/kitchen/forms';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

const EDITABLE: readonly KitchenEntryType[] = ['bought'];

/** From a vendor. Stock goes up; paid on the spot, or on the vendor's tab. */
export default function BoughtScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [paidNow, setPaidNow] = useState<'later' | 'now'>('later');
  const [mode, setMode] = useState<KitchenMode>('cash');
  const [date, setDate] = useState(localDateKey());
  const [lines, setLines] = useState<DraftLines>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  // Editing: the form starts from the buy as it was saved.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setPartyId(editing.party_id);
    setPaidNow(editing.paid ? 'now' : 'later');
    setMode(editing.mode ?? 'cash');
    setDate(editing.entry_date);
    setLines(Object.fromEntries(editing.lines.map((l) => [l.item_id, { qty: l.qty, price: l.price }])));
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const defaultCost = useMemo(() => lastCostByItem(data.entries), [data.entries]);
  const chosen = useMemo(() => draftToLines(lines), [lines]);
  const total = useMemo(() => linesTotal(Object.values(lines).filter((l) => l.qty > 0).map((l) => ({ qty: l.qty, price: l.price ?? 0 }))), [lines]);
  const hasQty = Object.values(lines).some((l) => l.qty > 0);
  const canSave = !missing && !!partyId && hasQty && chosen !== null && chosen.length > 0 && isValidDateKey(date);
  const owe = partyId ? balanceFromEntries(data.entries, partyId, 'vendor') : 0;

  const save = async () => {
    if (!partyId || !chosen || chosen.length === 0 || missing) return;
    setSaving(true);
    setError(null);
    const paid = paidNow === 'now';
    const input: PostEntryInput = { type: 'bought', party_id: partyId, entry_date: date, lines: chosen, paid, mode: paid ? mode : null, note: note.trim() || null };
    const res = editing ? await editKitchenEntry(editing.id, input) : await postKitchenEntry(input);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await data.load(true);
    if (editing) {
      useKitchenStore.getState().setNotice('Changes saved');
    } else {
      const after = balanceFromEntries(useKitchenStore.getState().entries, partyId, 'vendor');
      useKitchenStore.getState().setNotice(paid ? `Bought ${formatMoney(total)} from ${party?.name ?? 'the vendor'}, paid` : `Bought ${formatMoney(total)} from ${party?.name ?? 'the vendor'} · we owe ${formatMoney(after)}`);
    }
    backToKitchen();
  };

  return (
    <KeyboardAvoider>
      <KScreen
        footer={
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="flex-1">
              <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }}>Total</Text>
              <Text className="text-text-primary" style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] }}>{formatMoney(total)}</Text>
            </View>
            <View style={{ flex: 1.2 }}>
              <PrimaryButton label={editing ? 'Save changes' : paidNow === 'now' ? 'Save, paid' : 'Save, pay later'} onPress={() => void save()} disabled={!canSave} loading={saving} />
            </View>
          </View>
        }
      >
        <KHeader
          title={editing ? 'Edit buy' : 'Bought from a vendor'}
          subtitle={editing ? 'The earlier entry is voided; this one takes its place' : "Stock goes up; paid now, or on the vendor's tab"}
          onBack={() => backToKitchen()}
        />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a buy." /> : null}
        <Field label="Vendor">
          <PartyPicker kind="vendor" parties={data.parties} balances={data.balances} value={partyId} onChange={setPartyId} />
        </Field>
        {party ? (
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
            {owe > 0 ? `We owe ${party.name} ${formatMoney(owe)}.` : `${party.name} is settled up.`}
          </Text>
        ) : null}
        <Field label="Payment">
          <Segmented options={[{ value: 'later', label: 'Pay later' }, { value: 'now', label: 'Paid now' }]} value={paidNow} onChange={setPaidNow} />
        </Field>
        {paidNow === 'now' ? (
          <Field label="Mode">
            <ModePicker value={mode} onChange={setMode} />
          </Field>
        ) : null}
        <DateField value={date} onChange={setDate} />
        <Field label="Items" hint={hasQty && chosen === null ? 'Every line with a quantity needs a cost.' : 'The cost comes pre-filled from the last buy; change it when the price moved.'}>
          <LinesEditor items={data.items} lines={lines} onChange={setLines} mode="cost" defaultCost={defaultCost} />
        </Field>
        <Field label="Note">
          <TextField value={note} onChange={setNote} label="Note" placeholder="Bill number, or anything to remember" />
        </Field>
        {error ? <Notice text={error} /> : null}
      </KScreen>
    </KeyboardAvoider>
  );
}
