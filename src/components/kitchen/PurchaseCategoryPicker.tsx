import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { KitchenCategory } from '@/lib/pos/kitchen-types';
import { colors } from '@/lib/pos/brand';
import { saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import { useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { ReportSelect } from '@/components/kitchen/ReportSelect';
import { Notice, PrimaryButton } from '@/components/kitchen/ui';

export function PurchaseCategoryPicker({ categories, value, onChange, historicalName }: {
  categories: readonly KitchenCategory[]; value: string | null; onChange: (id: string | null) => void; historicalName?: string | null;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    if (saving || !name.trim()) return;
    setSaving(true); setError(null);
    const result = await saveKitchenPurchaseCategory(name);
    setSaving(false);
    if (!result.data || result.error) { setError(result.error ?? 'Unable to save the category.'); return; }
    useKitchenStore.setState(state => ({ purchaseCategories: [...state.purchaseCategories, result.data].filter((category): category is KitchenCategory => category !== null).sort((a, b) => a.name.localeCompare(b.name)) }));
    setName(''); onChange(result.data.id);
  };
  return (
    <View className="gap-2">
      <ReportSelect label="Purchase category" value={value} selectedLabel={historicalName ?? undefined}
        options={categories.filter(category => category.is_active || category.id === value).map(category => ({ id: category.id, label: category.id === value && historicalName ? historicalName : category.name + (!category.is_active ? ' · Archived' : '') }))} onChange={onChange} emptyLabel="Uncategorized" />
      <View className="flex-row items-center gap-2">
        <TextInput accessibilityLabel="New purchase category" placeholder="Add a category, e.g. Dairy" placeholderTextColor={colors.textSecondary}
          value={name} onChangeText={setName} maxLength={80} className="min-h-12 min-w-0 flex-1 rounded-xl bg-surface-tint px-3 text-base text-text-primary" />
        <View className="w-20"><PrimaryButton label="Add" onPress={() => void add()} loading={saving} disabled={!name.trim()} /></View>
      </View>
      <Text className="text-xs leading-5 text-text-secondary">Purchase categories are separate from direct expense categories.</Text>
      {error ? <Notice text={error} /> : null}
    </View>
  );
}
