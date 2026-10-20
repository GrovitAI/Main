import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { editKitchenEntry, postKitchenEntry } from '@/lib/pos/kitchen-service';
import { saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { balanceFromEntries, formatMoney, lastCostByItem, linesTotal, localDateKey } from '@/lib/pos/kitchen-utils';
import { placeOf } from '@/lib/pos/kitchen-spend-utils';
import type { KitchenCategory, KitchenEntryType, KitchenMode, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, SelectRow, SettingsGroup, Sheet, ValueRow, useSavedThen } from '@/components/kitchen/ui';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { useDateGuard, PartyPicker, draftToLines, isValidDateKey, typedLines } from '@/components/kitchen/forms';
import { NoteRow, TotalBar, WhenRow, WhoRow } from '@/components/kitchen/EntryRows';
import { ItemLines, ItemSearch, LinePad, startRate, useDraftLines } from '@/components/kitchen/EntryLines';
import { CategorySheet } from '@/components/kitchen/SpendFields';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

const EDITABLE: readonly KitchenEntryType[] = ['bought'];
type PaidBy = 'later' | KitchenMode;
const PAID_BY: readonly { value: PaidBy; label: string }[] = [
  { value: 'later', label: 'Pay later' },
  { value: 'cash', label: 'Kitchen · Cash' },
  { value: 'upi', label: 'Kitchen · UPI' },
  { value: 'bank', label: 'Kitchen · Bank' },
];

/**
 * From a vendor (task 280, owner's layout): the vendor as round circles, then rows (what for,
 * paid by, when, note), then the items with − and + and a rate on each, the rate starting at the
 * last price paid. Stock goes up; paid on the spot, or on the vendor's tab.
 */
export default function BoughtScreen() {
  const data = useKitchenData();
  const access = useKitchenAccess();
  const params = useLocalSearchParams<{ party?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [categoryOverride, setCategoryOverride] = useState<string | null | undefined>(undefined);
  const [paidBy, setPaidBy] = useState<PaidBy>('later');
  const [date, setDate] = useState(localDateKey());
  const draft = useDraftLines();
  const { lines, order, active } = draft;
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const done = useSavedThen();
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const phone = !useResponsive().isTablet;

  // Editing: the form starts from the buy as it was saved.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setPartyId(editing.party_id);
    setCategoryOverride(editing.purchase_category_id ?? null);
    setPaidBy(editing.paid ? editing.mode ?? 'cash' : 'later');
    setDate(editing.entry_date);
    draft.reset(Object.fromEntries(editing.lines.map((l) => [l.item_id, { qty: l.qty, price: l.price }])), editing.lines.map((l) => l.item_id));
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled, draft]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const categoryId = categoryOverride === undefined ? party?.purchase_category_id ?? null : categoryOverride;
  const keepsSavedCategory = !!editing && categoryId === (editing.purchase_category_id ?? null);
  // Task 279: Transport and Salary advance are for Spent only.
  const buyCategories = useMemo(() => data.purchaseCategories.filter((c) => !c.asks || c.id === categoryId), [data.purchaseCategories, categoryId]);
  const archivedCategory = !!categoryId && !keepsSavedCategory && data.purchaseCategories.some((c) => c.id === categoryId && !c.is_active);
  const categoryLabel = keepsSavedCategory && editing?.purchase_category_name ? editing.purchase_category_name : placeOf(data.purchaseCategories, categoryId)?.label ?? (categoryId ? 'Removed category' : 'Uncategorized');
  const lastCost = useMemo(() => lastCostByItem(data.entries), [data.entries]);
  const chosen = useMemo(() => draftToLines(lines), [lines]);
  const withQty = Object.entries(lines).filter(([, l]) => l.qty > 0);
  const total = useMemo(() => linesTotal(Object.values(lines).filter((l) => l.qty > 0).map((l) => ({ qty: l.qty, price: l.price ?? 0 }))), [lines]);
  const unpriced = withQty.find(([, l]) => l.price === null);
  const unpricedName = unpriced ? data.itemsById.get(unpriced[0])?.name ?? 'an item' : null;
  const dateOk = useDateGuard(date, lockReason);
  const owe = partyId ? balanceFromEntries(data.entries, partyId, 'vendor', party?.opening ?? 0) : 0;
  const reason = !partyId ? 'Choose a vendor'
    : archivedCategory ? 'Choose an active category'
    : withQty.length === 0 ? 'Add a quantity'
    : unpricedName ? `Set ${unpricedName}’s rate`
    : !isValidDateKey(date) || !dateOk ? 'Check the date' : undefined;
  const canSave = !missing && !reason && chosen !== null && chosen.length > 0;

  const addCategory = async (name: string, parentId: string | null): Promise<KitchenCategory | string> => {
    const res = await saveKitchenPurchaseCategory(name, undefined, true, parentId);
    if (!res.data) return res.error ?? 'Unable to add the category.';
    await data.load(true);
    return res.data;
  };

  // Task 221: Back asks first once items or a note are typed; never after the save.
  const typed = useTypedChanges(JSON.stringify({ lines: typedLines(lines), note: note.trim() }), prefilled);
  useLeaveGuard(typed && !done.saved, 'The items you typed');
  const save = async () => {
    if (!canSave || !partyId || !chosen || chosen.length === 0) return;
    setSaving(true);
    setError(null);
    const paid = paidBy !== 'later';
    const input: PostEntryInput = { type: 'bought', party_id: partyId, entry_date: date, lines: chosen, paid, mode: paid ? paidBy : null, note: note.trim() || null, purchase_category_id: categoryId };
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

  const activeItem = active ? data.itemsById.get(active.itemId) ?? null : null;
  const activeLine = active ? lines[active.itemId] ?? null : null;
  const pad = activeItem && activeLine && active ? (
    <LinePad key={activeItem.id} it={activeItem} line={activeLine} field={active.field} showAmounts
      onField={(f) => draft.setActive({ itemId: activeItem.id, field: f })} onChange={(l) => draft.update(activeItem.id, l)} onDone={() => draft.setActive(null)} />
  ) : null;
  const caption = withQty.length === 0 ? 'No items yet' : paidBy === 'later' ? `On ${party?.name ?? 'the vendor'}’s tab` : 'Paid now';
  const footer = phone && pad ? pad : (
    <TotalBar caption={caption} total={formatMoney(total)} showTotal={withQty.length > 0}>
      <PrimaryButton label={editing ? 'Save changes' : total > 0 ? `Save · ${formatMoney(total)}` : 'Save'} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved} reason={reason} />
    </TotalBar>
  );

  const who = party ? (
    <SettingsGroup>
      <WhoRow name={party.name} sub={owe > 0 ? `We owe ${formatMoney(owe)}` : 'Settled up'} onChange={editing ? undefined : () => { setPartyId(null); setCategoryOverride(undefined); }} />
      <ValueRow label="What for" value={categoryLabel} onPress={() => setPicking(true)} />
      <SelectRow label="Paid by" value={paidBy} options={PAID_BY} onChange={setPaidBy} />
      <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
      <NoteRow value={note} onChange={setNote} />
    </SettingsGroup>
  ) : (
    <Field label="From">
      <PartyPicker kind="vendor" parties={data.parties} balances={data.balances} value={partyId} onChange={(id) => { setPartyId(id); setCategoryOverride(undefined); }} />
    </Field>
  );
  const items = (
    <Field label={withQty.length ? `Items · ${withQty.length}` : 'Items'}>
      <ItemSearch items={data.items} mode="cost" lines={lines} lastCost={lastCost} showAmounts onAdd={(it) => draft.add(it, startRate(it, 'cost', lastCost))} />
      <ItemLines items={data.itemsById} lines={lines} order={order} onChange={draft.change} active={active} showAmounts
        onOpen={(itemId, field) => draft.setActive({ itemId, field })} />
    </Field>
  );

  return (
    <KeyboardAvoider>
      <KScreen footer={footer}>
        <KHeader title={editing ? 'Edit buy' : 'Bought'} onBack={() => backToKitchen()} />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a buy." /> : null}
        {phone ? <>{who}{items}</> : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View style={{ width: 340 }}>{who}</View>
            <View className="min-w-0 flex-1" style={{ marginTop: party ? -10 : 0 }}>{items}</View>
          </View>
        )}
        {archivedCategory ? <Notice text="This vendor’s usual category is archived. Choose another under What for." /> : null}
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
      {!phone ? <Sheet visible={!!pad} onClose={() => draft.setActive(null)} title="Quantity and rate">{pad}</Sheet> : null}
      <CategorySheet visible={picking} onClose={() => setPicking(false)} title="What for" categories={buyCategories} value={categoryId}
        onPick={(id) => { setCategoryOverride(id); setPicking(false); }} onNone={() => { setCategoryOverride(null); setPicking(false); }}
        onAdd={access.can('setup.categories') ? addCategory : undefined} />
    </KeyboardAvoider>
  );
}
