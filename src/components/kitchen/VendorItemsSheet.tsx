import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { matchesSearch } from '@/lib/pos/kitchen-utils';
import { byCategoryThenName, itemCategoryName } from '@/lib/pos/kitchen-spend-utils';
import type { KitchenCategory, KitchenItem } from '@/lib/pos/kitchen-types';
import { PrimaryButton, SearchBox, Sheet } from './ui';

/**
 * Task 295: the items a vendor usually supplies, ticked in a list of what can be bought (raw
 * materials), grouped by category. They come first when buying from that vendor.
 */
export function VendorItemsSheet({ visible, onClose, items, categories, value, onDone }: {
  visible: boolean; onClose: () => void; items: readonly KitchenItem[]; categories: readonly KitchenCategory[];
  value: readonly string[]; onDone: (itemIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([...value]);
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(visible);
  // Each opening starts from what is saved on the form.
  if (visible && !opened) { setOpened(true); setPicked([...value]); setQuery(''); }
  if (!visible && opened) setOpened(false);
  const buyable = useMemo(() => byCategoryThenName(items.filter((i) => i.is_active && i.item_kind === 'raw_material'), categories), [items, categories]);
  const shown = buyable.filter((i) => matchesSearch(query, i.name, itemCategoryName(categories, i.category_id) ?? ''));
  const changed = picked.length !== value.length || picked.some((id) => !value.includes(id));
  const toggle = (id: string): void => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  return (
    <Sheet visible={visible} onClose={onClose} title="Usual items" dirty={changed}>
      <SearchBox value={query} onChange={setQuery} placeholder="Search items" />
      <View className="mt-2.5 overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
        {shown.length === 0 ? <Text className="px-3.5 py-4 text-[13px] font-semibold text-text-secondary">{buyable.length ? 'No item matches that.' : 'No raw materials yet.'}</Text> : null}
        {shown.map((it, i) => {
          const on = picked.includes(it.id);
          const category = itemCategoryName(categories, it.category_id);
          return (
            <Pressable key={it.id} onPress={() => toggle(it.id)} accessibilityRole="checkbox" aria-checked={on} accessibilityState={{ checked: on }} accessibilityLabel={it.name}
              className={`min-h-[52px] flex-row items-center gap-3 px-3.5 py-2 ${i > 0 ? 'border-t border-border-soft' : ''} ${on ? 'bg-surface-tint' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
              <View className="min-w-0 flex-1">
                <Text className={`text-[15px] ${on ? 'font-bold text-primary' : 'font-semibold text-text-primary'}`} numberOfLines={1}>{it.name}</Text>
                {category ? <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{category}</Text> : null}
              </View>
              {on ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
      {changed ? <View className="mt-4"><PrimaryButton label={`Done · ${picked.length}`} onPress={() => onDone(picked)} /></View> : null}
    </Sheet>
  );
}
