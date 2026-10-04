import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { balanceFromEntries, formatMoney, lastCostByItem, linesTotal, localDateKey } from '@/lib/pos/kitchen-utils';
import type { KitchenMode } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, TextField } from '@/components/kitchen/ui';
import { DateField, LinesEditor, ModePicker, PartyPicker, draftToLines, isValidDateKey, type DraftLines } from '@/components/kitchen/forms';

/** From a vendor. Stock goes up; paid on the spot, or on the vendor's tab. */
export default function BoughtScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string }>();
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [paidNow, setPaidNow] = useState<'later' | 'now'>('later');
  const [mode, setMode] = useState<KitchenMode>('cash');
  const [date, setDate] = useState(localDateKey());
  const [lines, setLines] = useState<DraftLines>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const defaultCost = useMemo(() => lastCostByItem(data.entries), [data.entries]);
  const chosen = useMemo(() => draftToLines(lines), [lines]);
  const total = useMemo(() => linesTotal(Object.values(lines).filter((l) => l.qty > 0).map((l) => ({ qty: l.qty, price: l.price ?? 0 }))), [lines]);
  const hasQty = Object.values(lines).some((l) => l.qty > 0);
  const canSave = !!partyId && hasQty && chosen !== null && chosen.length > 0 && isValidDateKey(date);
  const owe = partyId ? balanceFromEntries(data.entries, partyId, 'vendor') : 0;

  const save = async () => {
    if (!partyId || !chosen || chosen.length === 0) return;
    setSaving(true);
    setError(null);
    const paid = paidNow === 'now';
    const res = await postKitchenEntry({ type: 'bought', party_id: partyId, entry_date: date, lines: chosen, paid, mode: paid ? mode : null, note: note.trim() || null });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await data.load(true);
    const after = balanceFromEntries(useKitchenStore.getState().entries, partyId, 'vendor');
    useKitchenStore.getState().setNotice(paid ? `Bought ${formatMoney(total)} from ${party?.name ?? 'the vendor'}, paid` : `Bought ${formatMoney(total)} from ${party?.name ?? 'the vendor'} · we owe ${formatMoney(after)}`);
    router.back();
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
              <PrimaryButton label={paidNow === 'now' ? 'Save, paid' : 'Save, pay later'} tone="buy" onPress={() => void save()} disabled={!canSave} loading={saving} />
            </View>
          </View>
        }
      >
        <KHeader title="Bought from a vendor" subtitle="Stock goes up; paid now, or on the vendor's tab" onBack={() => router.back()} />
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
