import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { saveKitchenParty } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { formatMoney, parseAmount } from '@/lib/pos/kitchen-utils';
import type { KitchenPartyKind } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, TextField } from '@/components/kitchen/ui';

type Side = 'owed' | 'ahead';

/**
 * A branch the kitchen sends to, or a vendor it buys from: a name, a number
 * for WhatsApp, and what stood between you on the day the app started.
 */
export default function PartyFormScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const existing = params.id ? data.partiesById.get(params.id) ?? null : null;
  const kind: KitchenPartyKind = existing?.kind ?? (params.kind === 'vendor' ? 'vendor' : 'branch');
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [openingText, setOpeningText] = useState(existing && existing.opening !== 0 ? String(Math.abs(existing.opening)) : '');
  const [side, setSide] = useState<Side>(existing && existing.opening < 0 ? 'ahead' : 'owed');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = kind === 'branch' ? 'branch' : 'vendor';
  const isBranch = kind === 'branch';
  const openingAbs = parseAmount(openingText);
  const opening = side === 'ahead' ? -openingAbs : openingAbs;

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await saveKitchenParty({ kind, name, phone: phone.trim() || null, opening }, existing?.id);
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? `Unable to save the ${noun}.`);
      return;
    }
    await data.load(true);
    useKitchenStore.getState().setNotice(existing ? `${res.data.name} saved` : `${res.data.name} added`);
    backToKitchen();
  };

  const sides = isBranch
    ? [{ value: 'owed' as const, label: 'They owe us' }, { value: 'ahead' as const, label: 'They paid ahead' }]
    : [{ value: 'owed' as const, label: 'We owe them' }, { value: 'ahead' as const, label: 'We paid ahead' }];

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label={existing ? 'Save changes' : `Add ${noun}`} onPress={() => void save()} disabled={!name.trim()} loading={saving} />}>
        <KHeader title={existing ? `Edit ${noun}` : `Add a ${noun}`} subtitle={existing ? undefined : isBranch ? 'An outlet the kitchen sends to' : 'Someone the kitchen buys from'} onBack={() => backToKitchen()} />
        <Field label="Name">
          <TextField value={name} onChange={setName} label={`${noun} name`} placeholder={isBranch ? 'e.g. Kolathur' : 'e.g. Aavin dairy'} autoFocus={!existing} />
        </Field>
        <Field label="WhatsApp number" hint={isBranch ? 'Optional. With a number, the slip after a send opens straight to their chat.' : 'Optional. Handy for sending a payment note.'}>
          <TextField value={phone} onChange={setPhone} label="WhatsApp number" placeholder="98765 43210" keyboardType="phone-pad" />
        </Field>
        <Field
          label="Opening balance"
          hint={`What stood between you on the day this app started. It is the first line of the give-and-take and part of the figure; leave it at 0 if nothing was pending.`}
        >
          <TextField value={openingText} onChange={setOpeningText} label="Opening balance" placeholder="0" keyboardType="decimal-pad" prefix="₹" />
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
