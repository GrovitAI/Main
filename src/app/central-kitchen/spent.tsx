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
import { AmountPad, Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, TextField, useSavedThen } from '@/components/kitchen/ui';
import { useResponsive } from '@/lib/pos/useResponsive';
import { semantic } from '@/lib/pos/brand';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { DateField, useDateGuard, ModePicker, OpenDocsPicker, PartyPicker, isValidDateKey } from '@/components/kitchen/forms';
import { CategoryPicker } from '@/components/kitchen/CategoryPicker';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

type Kind = 'vendor' | 'expense';
const EDITABLE: readonly KitchenEntryType[] = ['paid', 'spent'];

/** Money out: a bill under a category (the usual case, so it opens there), or a vendor paid. */
export default function SpentScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string; kind?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [kind, setKind] = useState<Kind>(params.kind === 'vendor' || params.party ? 'vendor' : 'expense');
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [category, setCategory] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [amountTyped, setAmountTyped] = useState(false);
  const [mode, setMode] = useState<KitchenMode>('cash');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [docs, setDocs] = useState<KitchenOpenDocument[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const done = useSavedThen();
  // Task 229: a phone takes the amount on a number pad; a tablet or desktop types it.
  const phone = !useResponsive().isTablet;
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  // Editing: the form starts from the entry as it was saved.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setKind(editing.type === 'paid' ? 'vendor' : 'expense');
    setPartyId(editing.party_id);
    setCategory(editing.category);
    setAmountText(String(editing.amount));
    setAmountTyped(true);
    setMode(editing.mode ?? 'cash');
    setDate(editing.entry_date);
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const amount = parseAmount(amountText);
  const owe = partyId ? balanceFromEntries(data.entries, partyId, 'vendor', party?.opening ?? 0) : 0;
  const tickedDocs = useMemo(() => docs.filter((d) => ticked.has(d.entry_id)), [docs, ticked]);
  const covers = useMemo(() => allocateAcross(tickedDocs, amount), [tickedDocs, amount]);
  const dateOk = useDateGuard(date, lockReason);
  const needsNote = kind === 'expense' && !note.trim();
  const canSave = !missing && amount > 0 && isValidDateKey(date) && (kind === 'vendor' ? !!partyId : !!category) && dateOk && !needsNote;
  const isVendor = kind === 'vendor';

  const onTick = (list: KitchenOpenDocument[], next: Set<string>) => {
    setDocs(list);
    setTicked(next);
    if (!amountTyped) {
      const sum = list.filter((d) => next.has(d.entry_id)).reduce((a, d) => a + d.open, 0);
      setAmountText(sum > 0 ? String(Math.round(sum * 100) / 100) : '');
    }
  };

  // Task 221: Back asks first once an amount or a note is typed; never after the save.
  const typed = useTypedChanges(JSON.stringify({ amountText: amountText.trim(), note: note.trim() }), prefilled);
  useLeaveGuard(typed && !done.saved, 'The amount you typed');
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const input: PostEntryInput =
      isVendor && partyId
        ? { type: 'paid', party_id: partyId, entry_date: date, amount, mode, note: note.trim() || null, covers }
        : { type: 'spent', entry_date: date, amount, mode, category: category ?? 'Other', note: note.trim() || null };
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
    } else if (isVendor && partyId) {
      const after = balanceFromEntries(useKitchenStore.getState().entries, partyId, 'vendor', party?.opening ?? 0);
      useKitchenStore.getState().setNotice(`Paid ${party?.name ?? 'the vendor'} ${formatMoney(amount)} · ${after > 0 ? `still owe ${formatMoney(after)}` : 'settled up'}`);
    } else {
      useKitchenStore.getState().setNotice(`${category ?? 'Expense'} · ${formatMoney(amount)} recorded`);
    }
    done.finish(backToKitchen);
  };

  const title = editing ? (isVendor ? 'Edit payment' : 'Edit expense') : 'Spent';
  const subtitle = editing ? 'The earlier entry is voided; this one takes its place' : 'Money out: a bill, or a vendor';

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label={editing ? 'Save changes' : phone && amount > 0 ? `Save ${formatMoney(amount)}` : isVendor ? 'Save payment' : 'Save expense'} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved} reason={kind === 'vendor' && !partyId ? 'Choose a vendor' : kind !== 'vendor' && !category ? 'Choose what it was for' : amount <= 0 ? 'Enter the amount' : !isValidDateKey(date) || !dateOk ? 'Check the date' : needsNote ? 'Add a note' : undefined} />}>
        <KHeader title={title} subtitle={subtitle} onBack={() => backToKitchen()} />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a payment or expense." /> : null}
        {editing ? null : (
          <View style={{ marginTop: 4 }}>
            <Segmented options={[{ value: 'expense', label: 'Expense' }, { value: 'vendor', label: 'Pay a vendor' }]} value={kind} onChange={setKind} />
          </View>
        )}
        {isVendor ? (
          <Field label="Vendor">
            <PartyPicker kind="vendor" parties={data.parties} balances={data.balances} value={partyId} onChange={(id) => { setPartyId(id); setTicked(new Set()); }} />
          </Field>
        ) : (
          <Field label="What for">
            <CategoryPicker categories={data.purchaseCategories} entries={data.entries} value={category} onChange={setCategory} />
          </Field>
        )}
        {isVendor && partyId ? (
          <Field label="Against which buys" optional hint="Tick the buys this pays for and the amount fills in.">
            <OpenDocsPicker partyId={partyId} kind="vendor" itemsById={data.itemsById} ticked={ticked} onChange={onTick} reopenPaymentId={editing?.type === 'paid' ? editing.id : undefined} />
          </Field>
        ) : null}
        {phone ? (
          <View style={{ marginTop: 14, gap: 4 }}>
            {isVendor && party ? <View className="items-center"><View className="rounded-full px-3 py-1" style={{ backgroundColor: semantic.dangerSoft }}><Text style={{ color: semantic.danger, fontSize: 13, fontWeight: '700' }}>We owe {party.name} {formatMoney(owe)}{amount > 0 && !editing ? ` · then ${owe - amount < 0 ? `${formatMoney(amount - owe)} overpaid` : formatMoney(owe - amount)}` : ''}</Text></View></View> : null}
            <AmountPad value={amountText} onChange={(t) => { setAmountText(t); setAmountTyped(t.trim().length > 0); }} />
            {!isVendor ? <Text className="text-center text-text-secondary" style={{ fontSize: 12, fontWeight: '600' }}>Counts as money out this month.</Text> : null}
          </View>
        ) : null}
        {phone ? null : <Field label="Amount">
          <TextField value={amountText} onChange={(t) => { setAmountText(t); setAmountTyped(t.trim().length > 0); }} label="Amount" placeholder="0" keyboardType="decimal-pad" prefix="₹" big />
          {isVendor && party ? (
            <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
              We owe {party.name} {formatMoney(owe)}{amount > 0 && !editing ? ` → after this ${formatMoney(owe - amount)}` : ''}
            </Text>
          ) : !isVendor ? (
            <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>Counts as money out this month.</Text>
          ) : null}
        </Field>}
        <Field label="Mode">
          <ModePicker value={mode} onChange={setMode} />
        </Field>
        <DateField value={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
        <Field label="Note" optional={isVendor} hint={isVendor ? undefined : 'Required for an expense: what it was, for example "Gas cylinder for the week".'}>
          <TextField value={note} onChange={setNote} label={isVendor ? 'Note (optional)' : 'Note'} />
        </Field>
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}
