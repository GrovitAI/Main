import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { colors, semantic } from '@/lib/pos/brand';
import { hoverLink } from '@/lib/pos/web-hover';
import { Card, Field, LinkButton, Notice, PrimaryButton, SelectRow, TextField, Toggle } from '@/components/kitchen/ui';
import type { MenuProduct } from '@/lib/pos/menu-service';
import type { Category } from '@/lib/pos/products-service';
import type { InventoryRecipe } from '@/lib/pos/inventory-service';
import { menuPrice, parsePrice } from '@/lib/pos/menu-utils';

export type MenuItemInput = { name: string; price: number; category_id: string; is_available: boolean; recipe_id: string | null };

/** A link in the danger colour, for Remove. */
function DangerLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable {...hoverLink} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ fontSize: 14, fontWeight: '800', color: semantic.danger }}>{label}</Text>
    </Pressable>
  );
}

/**
 * A "New category" link that opens a name field; Add shows once something is typed. Reports the
 * category made (or an existing one with that name).
 */
export function NewCategory({ onAdd, onAdded }: { onAdd: (name: string) => Promise<Category | string>; onAdded?: (category: Category) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    const wanted = (text ?? '').trim();
    if (!wanted || busy) return;
    setBusy(true);
    const result = await onAdd(wanted);
    setBusy(false);
    if (typeof result === 'string') { setError(result); return; }
    setText(null);
    setError(null);
    onAdded?.(result);
  };
  if (text === null) return <View className="items-start"><LinkButton label="New category" onPress={() => setText('')} /></View>;
  return (
    <View>
      <View className="mt-2 flex-row items-center gap-3">
        <View className="min-w-0 flex-1"><TextField label="New category" value={text} onChange={setText} placeholder="Category name" autoFocus /></View>
        {text.trim() ? <LinkButton label={busy ? 'Adding…' : 'Add'} onPress={() => void add()} /> : <LinkButton label="Cancel" onPress={() => { setText(null); setError(null); }} />}
      </View>
      {error ? <Notice text={error} /> : null}
    </View>
  );
}

/** "Was ₹877" under a price field once the typed price differs. */
function was(product: MenuProduct | null, priceText: string): string | undefined {
  if (!product) return undefined;
  const typed = parsePrice(priceText);
  return typed !== null && typed !== product.price ? `Was ${menuPrice(product.price)}` : undefined;
}

/**
 * Everything about one menu item (task 276, menu C): name, price, category, on sale and recipe.
 * In a sheet on a phone and in the panel beside the grid on a laptop. Save shows only after a
 * change; a new item starts empty, with no price filled in.
 */
export function MenuItemEditor({ product, categories, recipes, initialCategoryId, onSave, onRemove, onAddCategory, onDirtyChange, panel = false }: {
  product: MenuProduct | null;
  categories: readonly Category[];
  recipes: readonly InventoryRecipe[];
  /** A new item's category: the one being looked at, or none. */
  initialCategoryId: string;
  /** Resolves to an error to show, or null once saved. */
  onSave: (input: MenuItemInput) => Promise<string | null>;
  onRemove?: () => void;
  onAddCategory: (name: string) => Promise<Category | string>;
  onDirtyChange?: (dirty: boolean) => void;
  panel?: boolean;
}) {
  const start = useMemo(() => ({
    name: product?.name ?? '',
    price: product ? String(product.price) : '',
    category: product?.category_id ?? initialCategoryId,
    onSale: product ? product.is_available !== false : true,
    recipe: product?.recipe_id ?? '',
  }), [product, initialCategoryId]);
  const [name, setName] = useState(start.name);
  const [price, setPrice] = useState(start.price);
  const [category, setCategory] = useState(start.category);
  const [onSale, setOnSale] = useState(start.onSale);
  const [recipe, setRecipe] = useState(start.recipe);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== start.name || price !== start.price || category !== start.category || onSale !== start.onSale || recipe !== start.recipe;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const typed = parsePrice(price);
  const reason = !name.trim() ? 'Add a name' : typed === null ? 'Add a price' : !category ? 'Choose a category' : undefined;

  const save = async () => {
    if (reason || typed === null || saving) return;
    setSaving(true);
    setError(null);
    const problem = await onSave({ name: name.trim(), price: typed, category_id: category, is_available: onSale, recipe_id: recipe || null });
    setSaving(false);
    if (problem) setError(problem);
  };

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const recipeOptions = [{ value: '', label: 'None' }, ...recipes.map((r) => ({ value: r.id, label: r.name }))];

  return (
    <View>
      <Field label="Name">
        <TextField label="Name" value={name} onChange={setName} placeholder="Item name" />
      </Field>
      <Field label="Price" hint={was(product, price)}>
        <TextField label="Price" value={price} onChange={setPrice} prefix="₹" keyboardType="decimal-pad" />
      </Field>

      <Card padded={false} style={{ overflow: 'hidden', marginTop: 14 }}>
        <View style={{ marginTop: -1 }}>
          <SelectRow label="Category" value={category} valueLabel={category ? undefined : 'Choose'} options={categoryOptions} onChange={setCategory} />
          <Toggle label="On sale" on={onSale} onChange={setOnSale} />
          <SelectRow label="Recipe" value={recipe} options={recipeOptions} onChange={setRecipe} />
        </View>
      </Card>

      <NewCategory onAdd={onAddCategory} onAdded={(c) => setCategory(c.id)} />

      {error ? <Notice text={error} /> : null}

      {dirty || !product ? (
        <View className="mt-3"><PrimaryButton label={product ? 'Save' : 'Add item'} onPress={() => void save()} loading={saving} disabled={Boolean(reason)} reason={reason} /></View>
      ) : null}

      {product && onRemove ? (
        <View className={panel ? 'mt-1 items-start' : 'mt-1 items-center'}><DangerLink label="Remove" onPress={onRemove} /></View>
      ) : null}
    </View>
  );
}

/**
 * The quick sheet a held card opens on a phone (task 276): on sale, which applies at once, and the
 * price, which saves with Save. Everything else is behind Edit item.
 */
export function MenuQuickBody({ product, categoryName, onToggle, onSavePrice, onEdit, onDirtyChange }: {
  product: MenuProduct;
  categoryName: string | null;
  onToggle: (next: boolean) => void;
  onSavePrice: (price: number) => Promise<boolean>;
  onEdit: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [price, setPrice] = useState(String(product.price));
  const [saving, setSaving] = useState(false);
  const typed = parsePrice(price);
  const changed = typed !== null && typed !== product.price;
  useEffect(() => { onDirtyChange?.(price !== String(product.price)); }, [price, product.price, onDirtyChange]);

  const save = async () => {
    if (typed === null || saving) return;
    setSaving(true);
    await onSavePrice(typed);
    setSaving(false);
  };

  return (
    <View>
      {categoryName ? <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>{categoryName}</Text> : null}
      <Card padded={false} style={{ overflow: 'hidden', marginTop: 12 }}>
        <View style={{ marginTop: -1 }}>
          <Toggle label="On sale" on={product.is_available !== false} onChange={onToggle} />
        </View>
      </Card>
      <Field label="Price" hint={was(product, price)}>
        <TextField label="Price" value={price} onChange={setPrice} prefix="₹" keyboardType="decimal-pad" big />
      </Field>
      {changed ? <View className="mt-4"><PrimaryButton label="Save" onPress={() => void save()} loading={saving} /></View> : null}
      <View className="mt-1 items-center"><LinkButton label="Edit item" onPress={onEdit} /></View>
    </View>
  );
}
