import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard } from '@/lib/pos/use-leave-guard';
import { saveKitchenItem } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { KITCHEN_UNITS, type KitchenUnit, type KitchenItemKind } from '@/lib/pos/kitchen-types';
import { formatMoney, parseAmount } from '@/lib/pos/kitchen-utils';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Chips, Field, KHeader, KScreen, Notice, PrimaryButton, TextField, useSavedThen } from '@/components/kitchen/ui';
import { buzz } from '@/lib/pos/kitchen-haptics';

const UNIT_LABELS: Record<KitchenUnit, string> = { kg: 'Kilograms', L: 'Litres', pcs: 'Pieces' };

/** A new item, or a change to one: name, unit, the price a branch pays and, for profit, what it costs to make. */
export default function ItemFormScreen() {
  const access = useKitchenAccess();
  const mayEdit = access.can('setup.items');
  const data = useKitchenData();
  const { id, kind: initialKind } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const existing = id ? data.itemsById.get(id) ?? null : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<KitchenItemKind>(existing?.item_kind ?? (initialKind === 'finished_good' ? 'finished_good' : 'raw_material'));
  const [unit, setUnit] = useState<KitchenUnit>(existing?.unit ?? 'kg');
  const [price, setPrice] = useState(existing?.sell_price !== null && existing?.sell_price !== undefined ? String(existing.sell_price) : '');
  const [cost, setCost] = useState(existing?.cost_price !== null && existing?.cost_price !== undefined ? String(existing.cost_price) : '');
  const [opening, setOpening] = useState('');
  const [saving, setSaving] = useState(false);
  const done = useSavedThen();
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(existing?.id);
  useEffect(() => {
    if (!existing || hydrated.current === existing.id) return;
    hydrated.current = existing.id;
    setName(existing.name);
    setKind(existing.item_kind);
    setUnit(existing.unit);
    setPrice(existing.sell_price === null ? '' : String(existing.sell_price));
    setCost(existing.cost_price === null ? '' : String(existing.cost_price));
  }, [existing]);

  const sellNumber = Number(price.replace(/[,s]/g, ''));
  const costNumber = Number(cost.replace(/[,s]/g, ''));
  const margin = kind === 'finished_good' && price.trim() && cost.trim() && Number.isFinite(sellNumber) && Number.isFinite(costNumber) && sellNumber > 0
    ? { each: sellNumber - costNumber, percent: Math.round(((sellNumber - costNumber) / sellNumber) * 100) } : null;

  // Task 221: Back asks first once something differs from the saved item, or anything is typed for a new one.
  const typed = existing
    ? name !== existing.name || price !== (existing.sell_price === null ? '' : String(existing.sell_price)) || cost !== (existing.cost_price === null ? '' : String(existing.cost_price))
    : Boolean(name.trim() || price.trim() || cost.trim() || opening.trim());
  useLeaveGuard(typed && !done.saved, 'What you typed');
  const save = async () => {
    if (!name.trim() || (id && !existing)) return;
    const openingQty = Number(opening.replace(/[,\s]/g, ''));
    const sellingPrice = Number(price.replace(/[,\s]/g, ''));
    if ((!existing && (!Number.isFinite(openingQty) || openingQty < 0)) || (kind === 'finished_good' && price.trim() !== '' && (!Number.isFinite(sellingPrice) || sellingPrice < 0))) {
      setError('Enter a valid stock quantity and selling price, zero or greater.');
      return;
    }
    if (kind === 'finished_good' && cost.trim() !== '' && (!Number.isFinite(costNumber) || costNumber < 0)) {
      setError('Enter a valid cost, zero or greater.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveKitchenItem(
      {
        name, item_kind: kind, unit, sell_price: kind === 'raw_material' || price.trim() === '' ? null : parseAmount(price), opening_stock: openingQty,
        // Only a login that sees amounts edits the cost; otherwise it is left as it is.
        ...(access.showAmounts ? { cost_price: kind === 'raw_material' || cost.trim() === '' ? null : parseAmount(cost) } : {}),
      },
      existing?.id,
    );
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? 'Unable to save the item.');
      buzz('error');
      return;
    }
    done.mark();
    await data.load(true);
    useKitchenStore.getState().setNotice(existing ? `${res.data.name} saved` : `${res.data.name} added`);
    done.finish(backToKitchen);
  };

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label={id ? 'Save changes' : 'Add item'} onPress={() => void save()} disabled={!mayEdit || !name.trim() || Boolean(id && !existing)} loading={saving} done={done.saved} reason={mayEdit && !name.trim() ? 'Enter a name' : undefined} />}>
        <KHeader title={existing ? 'Edit item' : kind === 'finished_good' ? 'Add a finished good' : 'Add a raw material'} onBack={() => backToKitchen()} />
        {!mayEdit ? <Notice tone="neutral" text="Your login cannot add or change items. Ask the owner." /> : null}
        <Field label="Item type" hint={existing ? 'Decides which stock list shows it; past entries stay as they are.' : undefined}>
          <Chips options={[{ value: 'raw_material', label: 'Raw material' }, { value: 'finished_good', label: 'Finished good' }]} value={kind} onChange={setKind} />
        </Field>
        <Field label="Name">
          <TextField value={name} onChange={setName} label="Item name" placeholder="e.g. Nutella sauce" autoFocus={!existing} />
        </Field>
        <Field label="Counted in" hint={existing ? 'The stock figure is not converted, so count it again after a change.' : undefined}>
          <Chips options={KITCHEN_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u], hint: u }))} value={unit} onChange={setUnit} />
        </Field>
        {kind === 'finished_good' ? <Field label={`Sells at, ₹ per ${unit}`} optional hint="Fills in on each send; leave it blank to type a price each time.">
          <TextField value={price} onChange={setPrice} label="Selling price (optional)" keyboardType="decimal-pad" prefix="₹" />
        </Field> : null}
        {kind === 'finished_good' && access.showAmounts ? <Field label={`Costs us, ₹ per ${unit}`} optional hint={`${margin ? `${formatMoney(margin.each)} profit per ${unit} at the selling price (${margin.percent}%).` : `Ingredients and packing for one ${unit}, for profit in Analytics.`}${existing ? ' Past sends keep their cost.' : ''}`}>
          <TextField value={cost} onChange={setCost} label="Cost per unit (optional)" keyboardType="decimal-pad" prefix="₹" />
        </Field> : null}
        {!existing ? (
          <Field label={`In stock today, ${unit}`} hint={kind === 'finished_good' ? 'What is on the shelf now; batches add to it and sends take from it.' : 'What is on the shelf now; purchases add to it.'}>
            <TextField value={opening} onChange={setOpening} label="Opening stock" placeholder="0" keyboardType="decimal-pad" />
          </Field>
        ) : null}
        {error ? <Notice text={error} /> : null}
        {id && data.loaded && !existing ? <Notice text="This item is no longer in the list. Go back to Stock and choose an active item." /> : null}
      </KScreen>
    </KeyboardAvoider>
  );
}
