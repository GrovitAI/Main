import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard } from '@/lib/pos/use-leave-guard';
import { saveKitchenItem } from '@/lib/pos/kitchen-service';
import { saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import { placeOf } from '@/lib/pos/kitchen-spend-utils';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { KITCHEN_UNITS, type KitchenCategory, type KitchenUnit, type KitchenItemKind } from '@/lib/pos/kitchen-types';
import { formatMoney, parseAmount } from '@/lib/pos/kitchen-utils';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, SettingsGroup, TextField, ValueRow, useSavedThen } from '@/components/kitchen/ui';
import { CategorySheet } from '@/components/kitchen/SpendFields';
import { buzz } from '@/lib/pos/kitchen-haptics';

const UNIT_LABELS: Record<KitchenUnit, string> = { kg: 'Kilograms', L: 'Litres', pcs: 'Pieces' };

const money = (text: string): string => text.replace(/[,\s]/g, '');
const asText = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

/**
 * A new item, or a change to one: name, unit, the price a branch pays and, for profit, what it costs to make.
 * Task 295: its category (a spending one for a raw material, a finished goods one for a finished good), the
 * cost as a rate and an optional packing, and a branch price on a raw material that is also sold on.
 */
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
  const [cost, setCost] = useState(asText(existing?.cost_price));
  const [packing, setPacking] = useState(asText(existing?.packing_price));
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [pickingCategory, setPickingCategory] = useState(false);
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
    setCost(asText(existing.cost_price));
    setPacking(asText(existing.packing_price));
    setCategoryId(existing.category_id);
  }, [existing]);

  const finished = kind === 'finished_good';
  // A raw material sits under a spending category (not one that asks for a route or a person).
  const categories: KitchenCategory[] = finished ? data.goodsCategories : data.purchaseCategories.filter((c) => !c.asks);
  const category = placeOf(categories, categoryId);
  const sellNumber = Number(money(price));
  const costNumber = Number(money(cost));
  const packingNumber = packing.trim() ? Number(money(packing)) : 0;
  const totalCost = finished && cost.trim() && Number.isFinite(costNumber) && Number.isFinite(packingNumber) ? costNumber + packingNumber : null;
  const margin = finished && price.trim() && totalCost !== null && Number.isFinite(sellNumber) && sellNumber > 0
    ? { each: sellNumber - totalCost, percent: Math.round(((sellNumber - totalCost) / sellNumber) * 100) } : null;
  const changeKind = (next: KitchenItemKind): void => {
    // The other type's categories are a different list.
    if (next !== kind) setCategoryId(null);
    setKind(next);
  };
  const addCategory = async (categoryName: string, parentId: string | null): Promise<KitchenCategory | string> => {
    const res = await saveKitchenPurchaseCategory(categoryName, undefined, true, finished ? null : parentId, finished ? 'goods' : undefined);
    if (!res.data) return res.error ?? 'Unable to add the category.';
    await data.load(true);
    return res.data;
  };

  // Task 221: Back asks first once something differs from the saved item, or anything is typed for a new one.
  const typed = existing
    ? name !== existing.name || price !== asText(existing.sell_price) || cost !== asText(existing.cost_price) || packing !== asText(existing.packing_price) || categoryId !== existing.category_id
    : Boolean(name.trim() || price.trim() || cost.trim() || packing.trim() || opening.trim() || categoryId);
  useLeaveGuard(typed && !done.saved, 'What you typed');
  const save = async () => {
    if (!name.trim() || (id && !existing)) return;
    const openingQty = Number(money(opening));
    if ((!existing && (!Number.isFinite(openingQty) || openingQty < 0)) || (price.trim() !== '' && (!Number.isFinite(sellNumber) || sellNumber < 0))) {
      setError('Enter a valid stock quantity and selling price, zero or greater.');
      return;
    }
    if (finished && ((cost.trim() !== '' && (!Number.isFinite(costNumber) || costNumber < 0)) || (packing.trim() !== '' && (!Number.isFinite(packingNumber) || packingNumber < 0)))) {
      setError('Enter a valid rate and packing, zero or greater.');
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveKitchenItem(
      {
        name, item_kind: kind, unit, sell_price: price.trim() === '' ? null : parseAmount(price), opening_stock: openingQty, category_id: categoryId,
        // Only a login that sees amounts edits the cost; otherwise it is left as it is.
        ...(access.showAmounts ? {
          cost_price: !finished || cost.trim() === '' ? null : parseAmount(cost),
          packing_price: !finished || packing.trim() === '' ? null : parseAmount(packing),
        } : {}),
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
          <Segmented options={[{ value: 'raw_material', label: 'Raw material' }, { value: 'finished_good', label: 'Finished good' }]} value={kind} onChange={changeKind} />
        </Field>
        <Field label="Name">
          <TextField value={name} onChange={setName} label="Item name" placeholder="e.g. Nutella sauce" autoFocus={!existing} />
        </Field>
        <Field label="Category" optional>
          <SettingsGroup>
            <ValueRow label={finished ? 'Finished goods' : 'Bought as'} value={category?.label ?? null} onPress={() => setPickingCategory(true)} disabled={!mayEdit} />
          </SettingsGroup>
        </Field>
        <Field label="Counted in" hint={existing ? 'The stock figure is not converted, so count it again after a change.' : undefined}>
          <Segmented options={KITCHEN_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))} value={unit} onChange={setUnit} />
        </Field>
        <Field label={finished ? `Sells at, ₹ per ${unit}` : `Branch price, ₹ per ${unit}`} optional>
          <TextField value={price} onChange={setPrice} label="Selling price (optional)" keyboardType="decimal-pad" prefix="₹" />
        </Field>
        {finished && access.showAmounts ? <Field label={`Rate, ₹ per ${unit}`} optional>
          <TextField value={cost} onChange={setCost} label="Rate per unit (optional)" keyboardType="decimal-pad" prefix="₹" />
        </Field> : null}
        {finished && access.showAmounts ? <Field label={`Packing, ₹ per ${unit}`} optional
          hint={totalCost !== null ? `Costs ${formatMoney(totalCost)}${margin ? ` · ${formatMoney(margin.each)} profit (${margin.percent}%)` : ''}${existing ? ' · past sends keep their cost' : ''}` : undefined}>
          <TextField value={packing} onChange={setPacking} label="Packing per unit (optional)" keyboardType="decimal-pad" prefix="₹" />
        </Field> : null}
        {!existing ? (
          <Field label={`In stock today, ${unit}`}>
            <TextField value={opening} onChange={setOpening} label="Opening stock" placeholder="0" keyboardType="decimal-pad" />
          </Field>
        ) : null}
        {error ? <Notice text={error} /> : null}
        {id && data.loaded && !existing ? <Notice text="This item is no longer in the list. Go back to Stock and choose an active item." /> : null}
      </KScreen>
      <CategorySheet visible={pickingCategory} onClose={() => setPickingCategory(false)} title={finished ? 'Finished goods' : 'Bought as'} categories={categories} value={categoryId}
        onPick={(picked) => { setCategoryId(picked); setPickingCategory(false); }} onNone={() => { setCategoryId(null); setPickingCategory(false); }} noneLabel="No category"
        onAdd={access.can('setup.categories') ? addCategory : undefined} />
    </KeyboardAvoider>
  );
}
