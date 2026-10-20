import { useState } from 'react';
import { Text } from '@/components/ui/Typography';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard } from '@/lib/pos/use-leave-guard';
import { saveKitchenParty } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { formatMoney, parseAmount } from '@/lib/pos/kitchen-utils';
import type { KitchenPartyKind } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, TextField, useSavedThen } from '@/components/kitchen/ui';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { PurchaseCategoryPicker } from '@/components/kitchen/PurchaseCategoryPicker';

type Side = 'owed' | 'ahead';

/**
 * A branch the kitchen sends to, or a vendor it buys from: a name, a number
 * for WhatsApp, and what stood between you on the day the app started.
 */
export default function PartyFormScreen() {
  const data = useKitchenData();
  const mayEdit = useKitchenAccess().can('setup.parties');
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const existing = params.id ? data.partiesById.get(params.id) ?? null : null;
  const kind: KitchenPartyKind = existing?.kind ?? (params.kind === 'vendor' ? 'vendor' : 'branch');
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(existing?.purchase_category_id ?? null);
  const [openingText, setOpeningText] = useState(existing && existing.opening !== 0 ? String(Math.abs(existing.opening)) : '');
  const [side, setSide] = useState<Side>(existing && existing.opening < 0 ? 'ahead' : 'owed');
  const [saving, setSaving] = useState(false);
  const done = useSavedThen();
  const [error, setError] = useState<string | null>(null);
  const noun = kind === 'branch' ? 'branch' : 'vendor';
  const isBranch = kind === 'branch';
  const openingAbs = parseAmount(openingText);
  const opening = side === 'ahead' ? -openingAbs : openingAbs;

  // Task 221: Back asks first once something differs from the saved entry, or anything is typed for a new one.
  const typed = existing
    ? name !== existing.name || phone !== (existing.phone ?? '') || openingText !== (existing.opening !== 0 ? String(Math.abs(existing.opening)) : '')
    : Boolean(name.trim() || phone.trim() || openingText.trim());
  useLeaveGuard(typed && !done.saved, 'What you typed');
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await saveKitchenParty({ kind, name, phone: phone.trim() || null, opening, purchase_category_id: kind === 'vendor' ? categoryId : undefined }, existing?.id);
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? `Unable to save the ${noun}.`);
      buzz('error');
      return;
    }
    done.mark();
    await data.load(true);
    useKitchenStore.getState().setNotice(existing ? `${res.data.name} saved` : `${res.data.name} added`);
    done.finish(backToKitchen);
  };

  const sides = isBranch
    ? [{ value: 'owed' as const, label: 'They owe us' }, { value: 'ahead' as const, label: 'They paid ahead' }]
    : [{ value: 'owed' as const, label: 'We owe them' }, { value: 'ahead' as const, label: 'We paid ahead' }];

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label={existing ? 'Save changes' : `Add ${noun}`} onPress={() => void save()} disabled={!mayEdit || !name.trim()} loading={saving} done={done.saved} reason={mayEdit && !name.trim() ? 'Enter a name' : undefined} />}>
        <KHeader title={existing ? `Edit ${noun}` : `Add a ${noun}`} subtitle={existing ? undefined : isBranch ? 'An outlet the kitchen sends to' : 'Someone the kitchen buys from'} onBack={() => backToKitchen()} />
        {!mayEdit ? <Notice tone="neutral" text="Your login cannot add or change branches and vendors. Ask the owner." /> : null}
        <Field label="Name">
          <TextField value={name} onChange={setName} label={`${noun} name`} placeholder={isBranch ? 'e.g. Kolathur' : 'e.g. Aavin dairy'} autoFocus={!existing} />
        </Field>
        <Field label="WhatsApp number" optional hint={isBranch ? 'The slip after a send opens straight to their chat.' : 'Handy for sending a payment note.'}>
          <TextField value={phone} onChange={setPhone} label="WhatsApp number (optional)" placeholder="98765 43210" keyboardType="phone-pad" />
        </Field>
        {!isBranch ? (
          <Field label="Default purchase category" hint="Fills in on new buys; past buys keep theirs.">
            <PurchaseCategoryPicker categories={data.purchaseCategories.filter((c) => !c.asks || c.id === categoryId)} value={categoryId} onChange={setCategoryId} />
          </Field>
        ) : null}
        <Field
          label="Opening balance"
          optional
          hint="What stood between you on the day this app started, shown as the first line of the give-and-take."
        >
          <TextField value={openingText} onChange={setOpeningText} label="Opening balance (optional)" placeholder="0" keyboardType="decimal-pad" prefix="₹" />
          {openingAbs > 0 ? (
            <>
              <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>Which way</Text>
              <Segmented options={sides} value={side} onChange={setSide} />
              <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }}>
                {isBranch
                  ? side === 'owed' ? `${name.trim() || 'The branch'} starts ${formatMoney(openingAbs)} yet to pay.` : `${name.trim() || 'The branch'} starts ${formatMoney(openingAbs)} in credit.`
                  : side === 'owed' ? `We start owing ${name.trim() || 'the vendor'} ${formatMoney(openingAbs)}.` : `${name.trim() || 'The vendor'} starts holding ${formatMoney(openingAbs)} of ours.`}
              </Text>
            </>
          ) : null}
        </Field>
        {error ? <Notice text={error} /> : null}
      </KScreen>
    </KeyboardAvoider>
  );
}
