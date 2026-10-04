import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Coffee,
  Droplets,
  Flame,
  Home,
  LayoutGrid,
  Package,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  Users,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { saveKitchenCategory } from '@/lib/pos/kitchen-service';
import { useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { matchesSearch, orderCategories, shownCategories } from '@/lib/pos/kitchen-utils';
import type { KitchenCategory, KitchenEntry } from '@/lib/pos/kitchen-types';
import { Label, Notice, PrimaryButton, Row, SearchBox, Sheet, TextField } from './ui';

const ICON_RULES: readonly { test: RegExp; icon: LucideIcon }[] = [
  { test: /salar|wage|staff|pay ?roll|labou?r/i, icon: Users },
  { test: /gas|cylinder|lpg|firewood|charcoal/i, icon: Flame },
  { test: /electri|\beb\b|power|current|generator/i, icon: Zap },
  { test: /rent|lease|deposit/i, icon: Home },
  { test: /transport|deliver|petrol|diesel|fuel|auto|vehicle|cab|bike/i, icon: Truck },
  { test: /pack|box|bag|container|carton|foil/i, icon: Package },
  { test: /repair|mainten|service|fix|ac\b|plumb/i, icon: Wrench },
  { test: /clean|wash|soap|pest|garbage|waste/i, icon: Sparkles },
  { test: /water|can\b/i, icon: Droplets },
  { test: /phone|internet|wifi|mobile|recharge|data/i, icon: Wifi },
  { test: /tea|coffee|food|snack|meal|refresh/i, icon: Coffee },
  { test: /licen|insur|tax|gst|fee|fssai|permit|audit/i, icon: ShieldCheck },
];

/** An icon that suits the name, so the tiles read at a glance; a plain tag otherwise. */
export function categoryIcon(name: string): LucideIcon {
  return ICON_RULES.find((r) => r.test.test(name))?.icon ?? Tag;
}

type Props = {
  categories: readonly KitchenCategory[];
  entries: readonly KitchenEntry[];
  value: string | null;
  onChange: (name: string) => void;
};

/**
 * What an expense was for: the kitchen's most-used categories as tiles, and
 * "More" for the whole list, searchable, with a new one added in place.
 */
export function CategoryPicker({ categories, entries, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ordered = useMemo(() => orderCategories(categories, entries), [categories, entries]);
  const shown = useMemo(() => shownCategories(ordered, value), [ordered, value]);
  const filtered = useMemo(() => ordered.filter((c) => matchesSearch(query, c.name)), [ordered, query]);
  const rest = ordered.length - shown.length;

  const choose = (categoryName: string) => {
    onChange(categoryName);
    setOpen(false);
    setQuery('');
  };

  const add = async () => {
    const candidate = (name.trim() || query.trim());
    if (!candidate) return;
    setSaving(true);
    setError(null);
    const res = await saveKitchenCategory(candidate);
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error ?? 'Unable to add the category.');
      return;
    }
    await useKitchenStore.getState().load(true);
    setName('');
    choose(res.data.name);
  };

  type Tile = { key: string; label: string; icon: LucideIcon; on: boolean; onPress: () => void; more?: boolean };
  const tiles: Tile[] = [
    ...shown.map((c): Tile => ({ key: c.id, label: c.name, icon: categoryIcon(c.name), on: c.name === value, onPress: () => onChange(c.name) })),
    { key: 'more', label: rest > 0 ? `More · ${rest}` : 'More', icon: LayoutGrid, on: false, onPress: () => setOpen(true), more: true },
  ];
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += 3) rows.push(tiles.slice(i, i + 3));
  const newName = name.trim() || (filtered.length === 0 ? query.trim() : '');

  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map(({ key, ...tile }) => (
            <CategoryTile key={key} {...tile} />
          ))}
          {row.length < 3 ? Array.from({ length: 3 - row.length }, (_, j) => <View key={`pad-${j}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}

      <Sheet visible={open} onClose={() => setOpen(false)} title="What for">
        <View style={{ gap: 14 }}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search categories" autoFocus />
          <View>
            {filtered.map((c) => (
              <Row key={c.id} icon={categoryIcon(c.name)} iconTone="primary" title={c.name} selected={c.name === value} onPress={() => choose(c.name)} />
            ))}
            {filtered.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', paddingVertical: 12 }}>
                No category called that yet. Add it below and it stays in the list.
              </Text>
            ) : null}
          </View>
          <View>
            <Label>New category</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <TextField value={name} onChange={setName} label="New category name" placeholder={filtered.length === 0 && query.trim() ? query.trim() : 'e.g. Water cans'} />
              </View>
              <View style={{ width: 96 }}>
                <PrimaryButton label="Add" onPress={() => void add()} disabled={!newName} loading={saving} />
              </View>
            </View>
            {error ? <Notice text={error} /> : null}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function CategoryTile({ label, icon: Icon, on, onPress, more }: { label: string; icon: LucideIcon; on: boolean; onPress: () => void; more?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={more ? 'More categories' : label}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 78,
        borderRadius: 16,
        borderWidth: 1,
        padding: 10,
        justifyContent: 'space-between',
        borderColor: on ? colors.primary : more ? colors.border : colors.borderSoft,
        borderStyle: more ? 'dashed' : 'solid',
        backgroundColor: on ? colors.primary : more ? colors.surfaceTint : colors.surfaceElevated,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primaryDeep : colors.accentSoft }}>
        <Icon size={17} color={on ? colors.textOnPrimary : colors.primary} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '800', marginTop: 8, color: on ? colors.textOnPrimary : colors.textPrimary }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
