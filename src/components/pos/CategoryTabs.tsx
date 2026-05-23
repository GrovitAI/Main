import { FlatList, Pressable, Text, View } from 'react-native';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import type { Category } from '@/lib/pos/products-service';

type CategoryTabsProps = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
};

type CategoryTabItem = {
  id: string | null;
  name: string;
};

export function CategoryTabs({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: CategoryTabsProps) {
  const tabs: CategoryTabItem[] = [
    { id: null, name: 'All' },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  return (
    <View className="px-4 pb-3 pt-4">
      <FlatList
        horizontal
        data={tabs}
        keyExtractor={(item) => item.id ?? 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => {
          const isActive = selectedCategoryId === item.id;

          if (isActive) {
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectCategory(item.id)}
              >
                <BrandedGradient
                  variant="primary"
                  className="min-h-[44px] items-center justify-center rounded-full px-5 py-2.5"
                >
                  <Text className="text-sm font-bold text-text-on-primary">{item.name}</Text>
                </BrandedGradient>
              </Pressable>
            );
          }

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectCategory(item.id)}
              className="min-h-[44px] justify-center rounded-full border border-border-soft bg-surface-elevated px-5 py-2.5"
            >
              <Text className="text-sm font-semibold text-text-secondary">{item.name}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
