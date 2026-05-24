import React from 'react';
import { FlatList } from 'react-native';
import { SidebarItem } from './SidebarItem';
import type { Category } from '@/lib/pos/products-service';

type SidebarNavigationProps = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
};

type CategoryTabItem = {
  id: string | null;
  name: string;
};

export function SidebarNavigation({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: SidebarNavigationProps) {
  const tabs: CategoryTabItem[] = [
    { id: null, name: 'All Items' },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  return (
    <FlatList
      data={tabs}
      keyExtractor={(item) => item.id ?? 'all'}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 8,
        paddingBottom: 20,
        gap: 6,
      }}
      renderItem={({ item }) => {
        const isActive = selectedCategoryId === item.id;
        return (
          <SidebarItem
            name={item.name}
            isActive={isActive}
            onPress={() => onSelectCategory(item.id)}
          />
        );
      }}
    />
  );
}
