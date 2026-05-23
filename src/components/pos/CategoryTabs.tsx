import { FlatList, Pressable, Text, View } from 'react-native';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import type { Category } from '@/lib/pos/products-service';

type CategoryTabsProps = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  vertical?: boolean;
};

type CategoryTabItem = {
  id: string | null;
  name: string;
};

export function CategoryTabs({
  categories,
  selectedCategoryId,
  onSelectCategory,
  vertical = false,
}: CategoryTabsProps) {
  const tabs: CategoryTabItem[] = [
    { id: null, name: 'All' },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  if (vertical) {
    return (
      <BrandedGradient variant="navRail" className="flex-1 rounded-xl px-2 pb-2 pt-3">
        <FlatList
          data={tabs}
          keyExtractor={(item) => item.id ?? 'all'}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isActive = selectedCategoryId === item.id;

            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectCategory(item.id)}
                className="mb-1"
              >
                <View
                  className={
                    isActive
                      ? 'min-h-[40px] justify-center rounded-lg bg-primary-light/20 px-3 py-2.5'
                      : 'min-h-[40px] justify-center rounded-lg px-3 py-2.5'
                  }
                >
                  {isActive ? (
                    <View className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-primary-light" />
                  ) : null}
                  <Text
                    className={
                      isActive
                        ? 'text-xs font-bold text-text-on-primary'
                        : 'text-xs font-medium text-accent'
                    }
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      </BrandedGradient>
    );
  }

  return (
    <View className="px-3 pb-2 pt-2">
      <FlatList
        horizontal
        data={tabs}
        keyExtractor={(item) => item.id ?? 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
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
                  className="min-h-[36px] items-center justify-center rounded-full px-4 py-1.5"
                >
                  <Text className="text-xs font-bold text-text-on-primary">{item.name}</Text>
                </BrandedGradient>
              </Pressable>
            );
          }

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectCategory(item.id)}
              className="min-h-[36px] justify-center rounded-full border border-border-soft bg-surface-elevated px-4 py-1.5"
            >
              <Text className="text-xs font-semibold text-text-secondary">{item.name}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
