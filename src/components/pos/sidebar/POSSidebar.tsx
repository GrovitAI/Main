import React from 'react';
import { View } from 'react-native';
import { SidebarBackground, SidebarDecoration } from './SidebarBackground';
import { SidebarLogoSection } from './SidebarLogoSection';
import { SidebarNavigation } from './SidebarNavigation';
import type { Category } from '@/lib/pos/products-service';

type POSSidebarProps = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
};

export function POSSidebar({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: POSSidebarProps) {
  return (
    <View className="flex-1 w-full h-full overflow-hidden bg-[#003a75]">
      {/* 1. Branded Gradient Background */}
      <SidebarBackground />

      {/* 2. Ornate Background Pattern (Layered Bottom Texture) */}
      <SidebarDecoration />

      {/* 3. Foregrounds (Logo, Branch Info, and Categories list) */}
      <View className="absolute inset-0 flex-col">
        {/* Centered logo section + online status indicator */}
        <SidebarLogoSection />

        {/* Separator line */}
        <View className="mx-3 mb-3 h-[1px] bg-white/10" />

        {/* Category Navigation Scrollable list */}
        <View className="flex-1">
          <SidebarNavigation
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={onSelectCategory}
          />
        </View>
      </View>
    </View>
  );
}
export default POSSidebar;
