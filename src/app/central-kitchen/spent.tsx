import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { KITCHEN_CATEGORIES, allocateAcross, balanceFromEntries, formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import type { KitchenMode, KitchenOpenDocument } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Chips, Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, TextField } from '@/components/kitchen/ui';
import { DateField, ModePicker, OpenDocsPicker, PartyPicker, isValidDateKey } from '@/components/kitchen/forms';

type Kind = 'vendor' | 'expense';

/** Money out: a vendor paid, or a bill under a category. */
export default function SpentScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string; kind?: string }>();
  const [kind, setKind] = useState<Kind>(params.kind === 'expense' ? 'expense' : 'vendor');
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [category, setCategory] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [amountTyped, setAmountTyped] = useState(false);
  const [mode, setMode] = useState<KitchenMode>('cash');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [docs, setDocs] = useState<KitchenOpenDocument[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const amount = parseAmount(amountText);
  const owe = partyId ? balanceFromEntries(data.entries, partyId, 'vendor') : 0;
  const tickedDocs = useMemo(() => docs.filter((d) => ticked.has(d.entry_id)), [docs, ticked]);
  const covers = useMemo(() => allocateAcross(tickedDocs, amount), [tickedDocs, amount]);
  const canSave = amount > 0 && isValidDateKey(date) && (kind === 'vendor' ? !!partyId : !!category);

  const onTick = (list: KitchenOpenDocument[], next: Set<string>) => {
    setDocs(list);
    setTicked(next);
    if (!amountTyped) {
      const sum = list.filter((d) => next.has(d.entry_id)).reduce((a, d) => a + d.open, 0);
      setAmountText(sum > 0 ? String(Math.round(sum * 100) / 100) : '');
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const res =
      kind === 'vendor' && partyId
        ? await postKitchenEntry({ type: 'paid', party_id: partyId, entry_date: date, amount, mode, note: note.trim() || null, covers })
        : await postKitchenEntry({ type: 'spent', entry_date: date, amount, mode, category: category ?? 'Other', note: note.trim() || null });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await data.load(true);
    if (kind === 'vendor' && partyId) {
      const after = balanceFromEntries(useKitchenStore.getState().entries, partyId, 'vendor');
      useKitchenStore.getState().setNotice(`Paid ${party?.name ?? 'the vendor'} ${formatMoney(amount)} · ${after > 0 ? `still owe ${formatMoney(after)}` : 'settled up'}`);
    } else {
      useKitchenStore.getState().setNotice(`${category ?? 'Expense'} · ${formatMoney(amount)} recorded`);
    }
    backToKitchen();
  };

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label={kind === 'vendor' ? 'Save payment' : 'Save expense'} tone="out" onPress={() => void save()} disabled={!canSave} loading={saving} />}>
        <KHeader title="Spent" subtitle="Money out: a vendor, or a bill" onBack={() => backToKitchen()} />
        <View style={{ marginTop: 4 }}>
          <Segmented options={[{ value: 'vendor', label: 'Pay a vendor' }, { value: 'expense', label: 'Expense' }]} value={kind} onChange={setKind} />
        </View>
        {kind === 'vendor' ? (
          <Field label="Vendor">
            <PartyPicker kind="vendor" parties={data.parties} balances={data.balances} value={partyId} onChange={(id) => { setPartyId(id); setTicked(new Set()); }} />
          </Field>
        ) : (
          <Field label="What for">
            <Chips options={KITCHEN_CATEGORIES.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />
          </Field>
        )}
        {kind === 'vendor' && partyId ? (
          <Field label="Against which buys (optional)" hint="Tick the buys this payment is for and the amount fills itself. Leave them unticked and it simply comes off what we owe.">
            <OpenDocsPicker partyId={partyId} kind="vendor" itemsById={data.itemsById} ticked={ticked} onChange={onTick} />
          </Field>
        ) : null}
        <Field label="Amount">
          <TextField value={amountText} onChange={(t) => { setAmountText(t); setAmountTyped(t.trim().length > 0); }} label="Amount" placeholder="0" keyboardType="decimal-pad" prefix="₹" big />
          {kind === 'vendor' && party ? (
            <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
              We owe {party.name} {formatMoney(owe)}{amount > 0 ? ` → after this ${formatMoney(owe - amount)}` : ''}
            </Text>
          ) : kind === 'expense' ? (
            <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>Counts as money out this month.</Text>
          ) : null}
        </Field>
        <Field label="Mode">
          <ModePicker value={mode} onChange={setMode} />
        </Field>
        <DateField value={date} onChange={setDate} />
        <Field label="Note">
          <TextField value={note} onChange={setNote} label="Note" placeholder="Optional" />
        </Field>
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}
