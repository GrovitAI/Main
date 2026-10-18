import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { router, useFocusEffect } from 'expo-router';
import { colors } from '@/lib/pos/brand';
import { fetchKitchenPurchaseCategories, saveKitchenPurchaseCategory } from '@/lib/pos/kitchen-analytics-service';
import type { KitchenCategory } from '@/lib/pos/kitchen-types';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { Empty, KHeader, KScreen, Notice, PrimaryButton } from '@/components/kitchen/ui';

export default function PurchaseCategoriesScreen() {
  const mayEdit = useKitchenAccess().can('setup.categories');
  const [categories, setCategories] = useState<KitchenCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<KitchenCategory | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const result = await fetchKitchenPurchaseCategories(true);
    setLoading(false);
    if (result.error || !result.data) { setError(result.error ?? 'Unable to load categories.'); return; }
    setCategories(result.data);
    useKitchenStore.setState({ purchaseCategories: result.data });
  }, []);
  useEffect(() => { void load(); }, [load]);
  useFocusEffect(useCallback(() => { return () => { setEditing(null); setName(''); }; }, []));
  const save = async (category?: KitchenCategory, active?: boolean) => {
    if (saving) return;
    setSaving(true); setError(null);
    const result = await saveKitchenPurchaseCategory(category?.name ?? name, category?.id ?? editing?.id, active ?? editing?.is_active ?? true);
    setSaving(false);
    if (result.error || !result.data) { setError(result.error ?? 'Unable to save category.'); return; }
    setName(''); setEditing(null); await load();
  };
  return (
    <KScreen scroll={false}>
      <FlatList data={categories} keyExtractor={category => category.id} className="w-full max-w-[720px] flex-1 self-center px-4"
        keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={<View className="gap-3">
          <KHeader title="Categories" onBack={() => router.back()} subtitle="One list for Bought and Spent; vendors can start with a default" />
          {!mayEdit ? <Notice tone="neutral" text="Your login cannot add or change categories. Ask the owner." /> : null}
          <Text className="text-sm leading-5 text-text-secondary">Rename or archive a category here. Saved buys and spends keep the name they were saved with.</Text>
          <Text className="text-sm font-bold text-text-primary">{editing ? 'Rename ' + editing.name : 'Add a category'}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Dairy" accessibilityLabel="Category name" maxLength={80} placeholderTextColor={colors.textSecondary} className="min-h-12 rounded-xl bg-surface-elevated px-3 text-base text-text-primary" />
          <PrimaryButton label={editing ? 'Save name' : 'Add category'} disabled={!mayEdit || !name.trim() || loading} loading={saving} onPress={() => void save()} />
          {editing ? <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setName(''); }} className="min-h-12 items-center justify-center"><Text className="font-bold text-primary">Cancel rename</Text></Pressable> : null}
          {error ? <Notice text={error} action={<Pressable accessibilityRole="button" onPress={() => void load()} className="min-h-12 justify-center px-3"><Text className="font-bold text-primary">Retry</Text></Pressable>} /> : null}
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
        </View>}
        ListEmptyComponent={!loading && !error ? <Empty title="No categories yet" body="Add categories such as Dairy, Gas or Packaging. Buys and spends both use them." /> : null}
        renderItem={({ item }) => <View className="mt-3 gap-2 border-b border-border-soft py-3">
          <Text className="text-base font-bold text-text-primary">{item.name}{!item.is_active ? ' · Archived' : ''}</Text>
          <View className="flex-row gap-3">
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setEditing(item); setName(item.name); }} className="min-h-12 items-center justify-center rounded-xl bg-surface-elevated px-4 hover:bg-accent-soft active:opacity-60"><Text className="font-bold text-primary">Rename</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(item, !item.is_active)} className="min-h-12 items-center justify-center rounded-xl bg-surface-elevated px-4 hover:bg-accent-soft active:opacity-60"><Text className="font-bold text-primary">{item.is_active ? 'Archive' : 'Restore'}</Text></Pressable>
          </View>
        </View>} />
    </KScreen>
  );
}
