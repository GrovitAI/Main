import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { editKitchenEntry, postKitchenEntry } from '@/lib/pos/kitchen-service';
import { saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import { fetchKitchenRoster } from '@/lib/pos/kitchen-attendance-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { allocateAcross, balanceFromEntries, formatMoney, formatQty, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import { placeOf, sameParticular } from '@/lib/pos/kitchen-spend-utils';
import type { KitchenCategory, KitchenEntryType, KitchenMode, KitchenOpenDocument, KitchenRouteDir, KitchenUnit, PostEntryInput } from '@/lib/pos/kitchen-types';
import type { KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { AmountPanel, Avatar, Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, SelectRow, SettingsGroup, Sheet, TextField, ValueRow, useSavedThen } from '@/components/kitchen/ui';
import { useResponsive } from '@/lib/pos/useResponsive';
import { colors } from '@/lib/pos/brand';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { useDateGuard, OpenDocsPicker, PartyPicker, isValidDateKey } from '@/components/kitchen/forms';
import { CategorySheet, ParticularSearch, QtySheet, RouteSheet, toneOfParticular, type PickedParticular } from '@/components/kitchen/SpendFields';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';
import { NoteRow, WhenRow, WhoRow } from '@/components/kitchen/EntryRows';

type Kind = 'vendor' | 'expense';
type Picker = 'category' | 'route' | 'who' | 'qty' | null;
const EDITABLE: readonly KitchenEntryType[] = ['paid', 'spent'];
const PAID_BY: readonly { value: KitchenMode; label: string }[] = [
  { value: 'cash', label: 'Kitchen · Cash' },
  { value: 'upi', label: 'Kitchen · UPI' },
  { value: 'bank', label: 'Kitchen · Bank' },
];

/**
 * Money out. An expense starts from its particular (task 279, owner's pick): a particular used
 * before brings its category, so the rows that follow are only what this one needs (the route
 * for Transport, the person for Salary advance), then qty, paid by and when. Or a vendor paid.
 */
export default function SpentScreen() {
  const data = useKitchenData();
  const access = useKitchenAccess();
  const params = useLocalSearchParams<{ party?: string; kind?: string; edit?: string }>();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [kind, setKind] = useState<Kind>(params.kind === 'vendor' || params.party ? 'vendor' : 'expense');
  const [partyId, setPartyId] = useState<string | null>(params.party ?? null);
  const [amountText, setAmountText] = useState('');
  const [amountTyped, setAmountTyped] = useState(false);
  const [mode, setMode] = useState<KitchenMode>('cash');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [docs, setDocs] = useState<KitchenOpenDocument[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // The expense, by particular.
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PickedParticular | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [unit, setUnit] = useState<KitchenUnit | null>(null);
  const [routeDir, setRouteDir] = useState<KitchenRouteDir | null>(null);
  const [routeParty, setRouteParty] = useState<string | null>(null);
  const [rosterId, setRosterId] = useState<string | null>(null);
  const [roster, setRoster] = useState<KitchenStaffMember[] | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [saving, setSaving] = useState(false);
  const done = useSavedThen();
  // Task 229: a phone takes the amount on a number pad; a tablet or desktop types it.
  const phone = !useResponsive().isTablet;
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  // Editing: the form starts from the entry as it was saved. An older expense (a category and a
  // note) comes in as a particular named after its note, under the category of the same name.
  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setKind(editing.type === 'paid' ? 'vendor' : 'expense');
    setPartyId(editing.party_id);
    setAmountText(String(editing.amount));
    setAmountTyped(true);
    setMode(editing.mode ?? 'cash');
    setDate(editing.entry_date);
    setNote(editing.note ?? '');
    if (editing.type === 'spent') {
      const name = (editing.note ?? '').trim() || (editing.category ?? '');
      const byName = data.purchaseCategories.find((c) => !c.parent_id && c.name.trim().toLocaleLowerCase() === (editing.category ?? '').trim().toLocaleLowerCase());
      setPicked({ id: editing.particular_id ?? null, name, category_id: editing.category_id ?? byName?.id ?? null });
      setCategoryId(editing.category_id ?? byName?.id ?? null);
      setQtyText(editing.qty !== null && editing.qty_unit ? String(editing.qty) : '');
      setUnit(editing.qty_unit ?? null);
      setRouteDir(editing.route_dir ?? null);
      setRouteParty(editing.route_party_id ?? null);
      setRosterId(editing.roster_id ?? null);
    }
    setPrefilled(editing.id);
  }, [editing, prefilled, data.purchaseCategories]);

  const place = placeOf(data.purchaseCategories, categoryId);
  const asks = place?.asks ?? null;
  useEffect(() => {
    if (asks !== 'person' || roster !== null) return;
    void fetchKitchenRoster().then((res) => setRoster(res.data ?? []));
  }, [asks, roster]);

  const party = partyId ? data.partiesById.get(partyId) ?? null : null;
  const amount = parseAmount(amountText);
  const owe = partyId ? balanceFromEntries(data.entries, partyId, 'vendor', party?.opening ?? 0) : 0;
  const tickedDocs = useMemo(() => docs.filter((d) => ticked.has(d.entry_id)), [docs, ticked]);
  const covers = useMemo(() => allocateAcross(tickedDocs, amount), [tickedDocs, amount]);
  const dateOk = useDateGuard(date, lockReason);
  const isVendor = kind === 'vendor';
  const qty = qtyText ? Number(qtyText) : null;
  const routeBranch = routeParty ? data.partiesById.get(routeParty) ?? null : null;
  const person = rosterId ? roster?.find((r) => r.id === rosterId) ?? null : null;

  const expenseReason = !picked ? 'Type the particular'
    : !place ? 'Choose the category'
    : asks === 'route' && (!routeDir || !routeParty) ? 'Choose the route'
    : asks === 'person' && !rosterId ? 'Choose who'
    : undefined;
  const vendorReason = !partyId ? 'Choose a vendor' : undefined;
  const reason = (isVendor ? vendorReason : expenseReason) ?? (amount <= 0 ? 'Enter the amount' : !isValidDateKey(date) || !dateOk ? 'Check the date' : undefined);
  const canSave = !missing && !reason;

  const onTick = (list: KitchenOpenDocument[], next: Set<string>) => {
    setDocs(list);
    setTicked(next);
    if (!amountTyped) {
      const sum = list.filter((d) => next.has(d.entry_id)).reduce((a, d) => a + d.open, 0);
      setAmountText(sum > 0 ? String(Math.round(sum * 100) / 100) : '');
    }
  };

  const pick = (p: PickedParticular) => {
    // A new name that is already a particular (typed differently) becomes that particular.
    const known = p.id ? null : sameParticular(data.particulars, p.name);
    const chosen = known ? { id: known.id, name: known.name, category_id: known.category_id } : p;
    setPicked(chosen);
    setCategoryId(chosen.category_id);
    setQuery('');
    setRouteDir(null);
    setRouteParty(null);
    setRosterId(null);
    if (!chosen.category_id) setPicker('category');
  };
  const changeParticular = () => {
    setQuery(picked?.name ?? '');
    setPicked(null);
    setCategoryId(null);
  };
  const addCategory = async (name: string, parentId: string | null): Promise<KitchenCategory | string> => {
    const res = await saveKitchenPurchaseCategory(name, undefined, true, parentId);
    if (!res.data) return res.error ?? 'Unable to add the category.';
    await data.load(true);
    return res.data;
  };

  // Task 221: Back asks first once something is typed; never after the save.
  const typed = useTypedChanges(JSON.stringify({ amountText: amountText.trim(), note: note.trim(), picked: picked?.name ?? query.trim() }), prefilled);
  useLeaveGuard(typed && !done.saved, 'What you entered');
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const input: PostEntryInput =
      isVendor && partyId
        ? { type: 'paid', party_id: partyId, entry_date: date, amount, mode, note: note.trim() || null, covers }
        : {
          type: 'spent', entry_date: date, amount, mode, category: place?.top.name ?? 'Other', note: null,
          spend: {
            particular_id: picked?.id ?? null, particular_name: picked?.name ?? '', category_id: categoryId ?? '',
            qty, qty_unit: qty !== null ? unit : null,
            route_party_id: asks === 'route' ? routeParty : null, route_dir: asks === 'route' ? routeDir : null,
            roster_id: asks === 'person' ? rosterId : null,
          },
        };
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
      useKitchenStore.getState().setNotice(`${picked?.name ?? 'Expense'} · ${formatMoney(amount)}`);
    }
    done.finish(backToKitchen);
  };

  const title = editing ? (isVendor ? 'Edit payment' : 'Edit expense') : 'Spent';
  const saveLabel = editing ? 'Save changes' : amount > 0 ? `Save · ${formatMoney(amount)}` : 'Save';
  const saveButton = <PrimaryButton label={saveLabel} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved} reason={reason} />;
  const onAmount = (t: string) => { setAmountText(t); setAmountTyped(t.trim().length > 0); };

  // ── Expense ────────────────────────────────────────────────────────────────
  const rows = picked ? (
    <SettingsGroup>
      <ValueRow label={picked.name} sub={place ? place.label : 'New · choose its category'} value="Change" onPress={changeParticular}
        lead={<Avatar name={picked.name} toneIndex={toneOfParticular(data.purchaseCategories, categoryId)} size={36} ring={false} />} />
      {!picked.id ? <ValueRow label="Category" value={place?.label} required onPress={() => setPicker('category')} /> : null}
      {asks === 'route' ? <ValueRow label="Route" value={routeBranch && routeDir ? `${routeDir === 'from' ? 'From' : 'To'} ${routeBranch.name}` : null} required onPress={() => setPicker('route')} /> : null}
      {asks === 'person' ? <ValueRow label="Who" value={person?.name} required onPress={() => setPicker('who')} /> : null}
      <ValueRow label="Qty" value={qty !== null && unit ? formatQty(qty, unit) : null} placeholder="Add" action="plus" onPress={() => setPicker('qty')} />
      <SelectRow label="Paid by" value={mode} options={PAID_BY} onChange={setMode} />
      <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
    </SettingsGroup>
  ) : (
    <Field label="Particular">
      <ParticularSearch particulars={data.particulars} categories={data.purchaseCategories} entries={data.entries} query={query} onQuery={setQuery} onPick={pick} showAmounts={access.showAmounts} />
    </Field>
  );

  const pickers = (
    <>
      <CategorySheet visible={picker === 'category'} onClose={() => setPicker(null)} categories={data.purchaseCategories} value={categoryId}
        onPick={(id) => { setCategoryId(id); setRouteDir(null); setRouteParty(null); setRosterId(null); setPicker(null); }}
        onAdd={access.can('setup.categories') ? addCategory : undefined} />
      <RouteSheet visible={picker === 'route'} onClose={() => setPicker(null)} branches={data.parties} dir={routeDir} partyId={routeParty}
        onPick={(dir, id) => { setRouteDir(dir); setRouteParty(id); setPicker(null); }} />
      <QtySheet key={picker === 'qty' ? 'qty-open' : 'qty'} visible={picker === 'qty'} onClose={() => setPicker(null)} qty={qtyText} unit={unit}
        onDone={(q, u) => { setQtyText(q); setUnit(q ? u : null); setPicker(null); }} />
      <Sheet visible={picker === 'who'} onClose={() => setPicker(null)} title="Who">
        <View className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
          <View style={{ marginTop: -1 }}>
            {(roster ?? []).map((r) => {
              const on = r.id === rosterId;
              return (
                <Pressable key={r.id} onPress={() => { setRosterId(r.id); setPicker(null); }} accessibilityRole="button" aria-selected={on} accessibilityState={{ selected: on }} accessibilityLabel={r.name}
                  className={`min-h-[56px] flex-row items-center gap-3 border-t border-border-soft px-3.5 py-2 ${on ? 'bg-surface-tint' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
                  <Avatar name={r.name} size={36} ring={false} />
                  <View className="min-w-0 flex-1">
                    <Text className={`text-[15px] font-bold ${on ? 'text-primary' : 'text-text-primary'}`} numberOfLines={1}>{r.name}</Text>
                    {r.job_title ? <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{r.job_title}</Text> : null}
                  </View>
                  {on ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
        {roster !== null && roster.length === 0 ? <Notice text="Add the staff under Attendance first." /> : null}
      </Sheet>
    </>
  );

  // ── Vendor (as before) ─────────────────────────────────────────────────────
  // ── Pay a vendor (task 280): the vendor as round circles, then rows, the amount at the bottom. ──
  const afterPay = owe - amount;
  const afterLine = party && amount > 0 && !editing ? (
    <Text className="mt-1.5 text-xs font-semibold text-text-secondary">{afterPay < 0 ? `${formatMoney(-afterPay)} paid ahead after this` : afterPay === 0 ? 'Settled up after this' : `We still owe ${formatMoney(afterPay)} after this`}</Text>
  ) : null;
  const vendor = party ? (
    <>
      <SettingsGroup>
        <WhoRow name={party.name} sub={owe > 0 ? `We owe ${formatMoney(owe)}` : owe < 0 ? `${formatMoney(-owe)} paid ahead` : 'Settled up'} onChange={editing ? undefined : () => { setPartyId(null); setTicked(new Set()); }} />
        <SelectRow label="Paid from" value={mode} options={PAID_BY} onChange={setMode} />
        <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
        <NoteRow value={note} onChange={setNote} />
      </SettingsGroup>
      {phone ? afterLine : null}
      <Field label="Against which buys" optional>
        <OpenDocsPicker partyId={partyId} kind="vendor" itemsById={data.itemsById} ticked={ticked} onChange={onTick} reopenPaymentId={editing?.type === 'paid' ? editing.id : undefined} />
      </Field>
    </>
  ) : (
    <Field label="Vendor">
      <PartyPicker kind="vendor" parties={data.parties} balances={data.balances} value={partyId} onChange={(id) => { setPartyId(id); setTicked(new Set()); }} />
    </Field>
  );

  const footer = phone && (isVendor ? !!party : !!picked) ? <AmountPanel value={amountText} onChange={onAmount}>{saveButton}</AmountPanel> : saveButton;

  return (
    <KeyboardAvoider>
      <KScreen footer={footer}>
        <KHeader title={title} onBack={() => backToKitchen()} />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a payment or expense." /> : null}
        {editing ? null : (
          <View style={{ marginTop: 4, marginBottom: 6 }}>
            <Segmented options={[{ value: 'expense', label: 'Expense' }, { value: 'vendor', label: 'Pay a vendor' }]} value={kind} onChange={setKind} />
          </View>
        )}
        {phone ? (isVendor ? vendor : rows) : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View className="min-w-0 flex-1">{isVendor ? vendor : rows}</View>
            <View className="min-w-0 flex-1">
              <Field label="Amount">
                <TextField value={amountText} onChange={onAmount} label="Amount" placeholder="0" keyboardType="decimal-pad" prefix="₹" big />
                {isVendor ? afterLine : null}
              </Field>
            </View>
          </View>
        )}
        {error ? <Notice text={error} /> : null}
        {isVendor ? null : pickers}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}
