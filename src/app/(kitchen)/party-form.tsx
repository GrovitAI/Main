import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { saveKitchenParty } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import type { KitchenPartyKind } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, TextField } from '@/components/kitchen/ui';

/** A branch the kitchen sends to, or a vendor it buys from: a name, and a number for WhatsApp. */
export default function PartyFormScreen() {
  const data = useKitchenData();
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const existing = params.id ? data.partiesById.get(params.id) ?? null : null;
  const kind: KitchenPartyKind = existing?.kind ?? (params.kind === 'vendor' ? 'vendor' : 'branch');
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = kind === 'branch' ? 'branch' : 'vendor';

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await saveKitchenParty({ kind, name, phone: phone.trim() || null }, existing?.id);
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? `Unable to save the ${noun}.`);
      return;
    }
    await data.load(true);
    useKitchenStore.getState().setNotice(existing ? `${res.data.name} saved` : `${res.data.name} added`);
    router.back();
  };

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label={existing ? 'Save changes' : `Add ${noun}`} onPress={() => void save()} disabled={!name.trim()} loading={saving} />}>
        <KHeader title={existing ? `Edit ${noun}` : `Add a ${noun}`} subtitle={existing ? undefined : kind === 'branch' ? 'An outlet the kitchen sends to' : 'Someone the kitchen buys from'} onBack={() => router.back()} />
        <Field label="Name">
          <TextField value={name} onChange={setName} label={`${noun} name`} placeholder={kind === 'branch' ? 'e.g. Kolathur' : 'e.g. Aavin dairy'} autoFocus={!existing} />
        </Field>
        <Field label="WhatsApp number" hint={kind === 'branch' ? 'Optional. With a number, the slip after a send opens straight to their chat.' : 'Optional. Handy for sending a payment note.'}>
          <TextField value={phone} onChange={setPhone} label="WhatsApp number" placeholder="98765 43210" keyboardType="phone-pad" />
        </Field>
        {error ? <Notice text={error} /> : null}
      </KScreen>
    </KeyboardAvoider>
  );
}
