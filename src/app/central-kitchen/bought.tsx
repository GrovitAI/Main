import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { editKitchenEntry, postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { balanceFromEntries, formatMoney, lastCostByItem, linesTotal, localDateKey } from '@/lib/pos/kitchen-utils';
import type { KitchenEntryType, KitchenMode, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, SummaryBar, TextField, useSavedThen } from '@/components/kitchen/ui';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { DateField, useDateGuard, LinesEditor, ModePicker, PartyPicker, draftToLines, isValidDateKey, typedLines, type DraftLines } from '@/components/kitchen/forms';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';
import { PurchaseCategoryPicker } from '@/components/kitchen/PurchaseCategoryPicker';

const EDITABLE: readonly KitchenEntryType[] = ['bought'];

/** From a vendor. Stock goes up; paid on the spot, or on the vendor's tab. */
export default function BoughtScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ party?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [categoryOverride, setCategoryOverride] = useState<string | null | undefined>(undefined);
  const [paidNow, setPaidNow] = useState<'later' | 'now'>('later');
  const [mode, setMode] = useState<KitchenMode>('cash');
  const [date, setDate] = useState(localDateKey());
  const [lines, setLines] = useState<DraftLines>({});
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [saving, setSaving] = useState(false);
  const done = useSavedThen();
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  // Editing: the form starts from the buy as it was saved.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setPartyId(editing.party_id);
    setCategoryOverride(editing.purchase_category_id ?? null);
    setPaidNow(editing.paid ? 'now' : 'later');
    setMode(editing.mode ?? 'cash');
    setDate(editing.entry_date);
    setLines(Object.fromEntries(editing.lines.map((l) => [l.item_id, { qty: l.qty, price: l.price }])));
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const categoryId = categoryOverride === undefined ? party?.purchase_category_id ?? null : categoryOverride;
  const keepsSavedCategory = !!editing && categoryId === (editing.purchase_category_id ?? null);
  // Task 279: Transport and Salary advance are for Spent only.
  const buyCategories = useMemo(() => data.purchaseCategories.filter((c) => !c.asks || c.id === categoryId), [data.purchaseCategories, categoryId]);
  const archivedCategory = !!categoryId && !keepsSavedCategory && data.purchaseCategories.some(category => category.id === categoryId && !category.is_active);
  const defaultCost = useMemo(() => lastCostByItem(data.entries), [data.entries]);
  const chosen = useMemo(() => draftToLines(lines), [lines]);
  const total = useMemo(() => linesTotal(Object.values(lines).filter((l) => l.qty > 0).map((l) => ({ qty: l.qty, price: l.price ?? 0 }))), [lines]);
  const hasQty = Object.values(lines).some((l) => l.qty > 0);
  const itemCount = Object.values(lines).filter((l) => l.qty > 0).length;
  const phone = !useResponsive().isTablet;
  const dateOk = useDateGuard(date, lockReason);
  const canSave = !missing && !archivedCategory && !!partyId && hasQty && chosen !== null && chosen.length > 0 && isValidDateKey(date) && dateOk;
  const owe = partyId ? balanceFromEntries(data.entries, partyId, 'vendor', party?.opening ?? 0) : 0;

  // Task 221: Back asks first once items or a note are typed; never after the save.
  const typed = useTypedChanges(JSON.stringify({ lines: typedLines(lines), note: note.trim() }), prefilled);
  useLeaveGuard(typed && !done.saved, 'The items you typed');
  const save = async () => {
    if (!canSave || !partyId || !chosen || chosen.length === 0) return;
    setSaving(true);
    setError(null);
    const paid = paidNow === 'now';
    const input: PostEntryInput = { type: 'bought', party_id: partyId, entry_date: date, lines: chosen, paid, mode: paid ? mode : null, note: note.trim() || null, purchase_category_id: categoryId };
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
      const after = balanceFromEntries(useKitchenStore.getState().entries, partyId, 'vendor', party?.opening ?? 0);
      useKitchenStore.getState().setNotice(paid ? `Bought ${formatMoney(total)} from ${party?.name ?? 'the vendor'}, paid` : `Bought ${formatMoney(total)} from ${party?.name ?? 'the vendor'} · we owe ${formatMoney(after)}`);
    }
    done.finish(backToKitchen);
  };

  const itemsField = (
    <Field label="Items" hint={hasQty && chosen === null ? 'Every line with a quantity needs a cost.' : 'The cost fills in from the last buy; change it if the price moved.'}>
      <LinesEditor items={data.items} lines={lines} onChange={setLines} mode="cost" defaultCost={defaultCost} />
    </Field>
  );

  return (
    <KeyboardAvoider>
      <KScreen
        floatingFooter={phone}
        footer={phone ? (
          // Task 231: a phone's footer is the dark summary bar.
          <SummaryBar caption={`${itemCount === 0 ? 'No items yet' : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`} · ${paidNow === 'now' ? 'paid now' : 'pay later'}`} total={total}>
            <PrimaryButton label={editing ? 'Save changes' : 'Save'} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved} reason={!partyId ? 'Choose a vendor' : archivedCategory ? 'Choose a category' : !isValidDateKey(date) || !dateOk ? 'Check the date' : !hasQty ? 'Add a quantity' : undefined} />
          </SummaryBar>
        ) : (
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="flex-1">
              <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }}>Total</Text>
              <Text className="text-text-primary" style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] }}>{formatMoney(total)}</Text>
            </View>
            <View style={{ flex: 1.2 }}>
              <PrimaryButton label={editing ? 'Save changes' : paidNow === 'now' ? 'Save, paid' : 'Save, pay later'} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved} reason={!partyId ? 'Choose a vendor' : archivedCategory ? 'Choose an active category' : !isValidDateKey(date) || !dateOk ? 'Check the date' : !hasQty ? 'Add an item quantity' : undefined} />
            </View>
          </View>
        )}
      >
        <KHeader
          title={editing ? 'Edit buy' : 'Bought from a vendor'}
          subtitle={editing ? 'The earlier entry is voided; this one takes its place' : "Stock goes up; paid now, or on the vendor's tab"}
          onBack={() => backToKitchen()}
        />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a buy." /> : null}
        <Field label="Vendor">
          <PartyPicker kind="vendor" parties={data.parties} balances={data.balances} value={partyId} onChange={id => { setPartyId(id); setCategoryOverride(undefined); }} />
        </Field>
        {party ? (
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
            {owe > 0 ? `We owe ${party.name} ${formatMoney(owe)}.` : `${party.name} is settled up.`}
          </Text>
        ) : null}
        <Field label="What for" hint={editing ? 'It keeps its saved name, even if the category was renamed.' : undefined}>
          <PurchaseCategoryPicker categories={buyCategories} value={categoryId} onChange={setCategoryOverride} historicalName={keepsSavedCategory ? editing?.purchase_category_name : null} tiles entries={data.entries} />
          {archivedCategory ? <Notice text="The vendor's default category is archived. Choose an active category or Uncategorized for this purchase." /> : null}
        </Field>
        {phone ? itemsField : null}
        <Field label="Payment">
          <Segmented options={[{ value: 'later', label: 'Pay later' }, { value: 'now', label: 'Paid now' }]} value={paidNow} onChange={setPaidNow} />
        </Field>
        {paidNow === 'now' ? (
          <Field label="Mode">
            <ModePicker value={mode} onChange={setMode} />
          </Field>
        ) : null}
        <DateField value={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
        {phone ? null : itemsField}
        <Field label="Note" optional hint="A bill number, or anything to remember.">
          <TextField value={note} onChange={setNote} label="Note (optional)" />
        </Field>
        {error ? <Notice text={error} /> : null}
      </KScreen>
    </KeyboardAvoider>
  );
}
