import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { saveKitchenItem } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { KITCHEN_UNITS, type KitchenUnit } from '@/lib/pos/kitchen-types';
import { parseAmount } from '@/lib/pos/kitchen-utils';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Chips, Field, KHeader, KScreen, Notice, PrimaryButton, TextField } from '@/components/kitchen/ui';

const UNIT_LABELS: Record<KitchenUnit, string> = { kg: 'Kilograms', L: 'Litres', pcs: 'Pieces' };

/** A new item, or a change to one: name, unit, the price a branch pays. */
export default function ItemFormScreen() {
  const data = useKitchenData();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? data.itemsById.get(id) ?? null : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [unit, setUnit] = useState<KitchenUnit>(existing?.unit ?? 'kg');
  const [price, setPrice] = useState(existing?.sell_price !== null && existing?.sell_price !== undefined ? String(existing.sell_price) : '');
  const [opening, setOpening] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const openingQty = Number(opening.replace(/[,\s]/g, ''));
    const res = await saveKitchenItem(
      { name, unit, sell_price: price.trim() === '' ? null : parseAmount(price), opening_stock: Number.isFinite(openingQty) && openingQty > 0 ? openingQty : 0 },
      existing?.id,
    );
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? 'Unable to save the item.');
      return;
    }
    await data.load(true);
    useKitchenStore.getState().setNotice(existing ? `${res.data.name} saved` : `${res.data.name} added`);
    router.back();
  };

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label={existing ? 'Save changes' : 'Add item'} onPress={() => void save()} disabled={!name.trim()} loading={saving} />}>
        <KHeader title={existing ? 'Edit item' : 'Add an item'} subtitle={existing ? undefined : 'Something the kitchen makes, or something it buys'} onBack={() => router.back()} />
        <Field label="Name">
          <TextField value={name} onChange={setName} label="Item name" placeholder="e.g. Nutella sauce" autoFocus={!existing} />
        </Field>
        <Field label="Counted in" hint={existing ? 'Changing the unit does not convert the stock figure; count it again afterwards.' : undefined}>
          <Chips options={KITCHEN_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u], hint: u }))} value={unit} onChange={setUnit} />
        </Field>
        <Field label={`Sells at, ₹ per ${unit}`} hint="Leave it blank for a raw material the kitchen only buys. Branches are charged this on every send; it can be changed per send.">
          <TextField value={price} onChange={setPrice} label="Selling price" placeholder="Not sold to branches" keyboardType="decimal-pad" prefix="₹" />
        </Field>
        {!existing ? (
          <Field label={`In stock today, ${unit}`} hint="What is on the shelf right now. Later changes come from buys, sends, batches and counts.">
            <TextField value={opening} onChange={setOpening} label="Opening stock" placeholder="0" keyboardType="decimal-pad" />
          </Field>
        ) : null}
        {error ? <Notice text={error} /> : null}
      </KScreen>
    </KeyboardAvoider>
  );
}
