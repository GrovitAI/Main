import { FlatList, Pressable, Text, View } from 'react-native';

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
    <View className="border-b border-border bg-background py-2">
      <FlatList
        horizontal
        data={tabs}
        keyExtractor={(item) => item.id ?? 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        renderItem={({ item }) => {
          const isActive = selectedCategoryId === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectCategory(item.id)}
              className={`min-h-[44px] justify-center rounded-full px-4 py-2 ${
                isActive ? 'bg-primary' : 'border border-border bg-background'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  isActive ? 'text-white' : 'text-text-secondary'
                }`}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
