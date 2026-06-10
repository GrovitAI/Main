import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { CakeSlice, Coffee, CupSoda, GlassWater, LayoutGrid, CirclePlus, Sandwich, Sparkles, Layers, IceCream } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

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

/* eslint-disable @typescript-eslint/no-require-imports */
const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

function getCategoryIcon(name: string, color: string) {
  const size = 18;

  const lowerName = name.toLowerCase().trim();
  if (lowerName === 'all' || lowerName === 'all items') return <LayoutGrid color={color} size={size} />;
  
  // Custom sweet-shop dessert mapping (.includes matches substring/variations robustly)
  if (lowerName.includes('signature')) return <Sparkles color={color} size={size} />;
  if (lowerName.includes('salankatia')) return <CakeSlice color={color} size={size} />;
  if (lowerName.includes('koushiri') || lowerName.includes('koshari')) return <Layers color={color} size={size} />;
  if (lowerName.includes('qashtuta')) return <IceCream color={color} size={size} />;

  // General fallbacks
  if (lowerName.includes('cake')) return <CakeSlice color={color} size={size} />;
  if (lowerName.includes('kunafa')) return <Sandwich color={color} size={size} />;
  if (lowerName.includes('cup') && !lowerName.includes('drink')) return <CupSoda color={color} size={size} />;
  if (lowerName.includes('drink') || lowerName.includes('shake')) return <GlassWater color={color} size={size} />;
  if (lowerName.includes('hot') || lowerName.includes('beverage')) return <Coffee color={color} size={size} />;
  if (lowerName.includes('add')) return <CirclePlus color={color} size={size} />;
  
  return <LayoutGrid color={color} size={size} />;
}


export function CategoryTabs({
  categories,
  selectedCategoryId,
  onSelectCategory,
  vertical = false,
}: CategoryTabsProps) {
  const tabs: CategoryTabItem[] = [
    { id: null, name: 'All Items' },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  if (vertical) {
    return (
      <View className="flex-1 overflow-hidden">
        {/* Premium Background Gradient matching reference */}
        <LinearGradient
          colors={['#003a75', '#004f9e', '#005fc0']}
          className="absolute inset-0"
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />

        {/* Subtle decorative texture/glow placeholder (using radial gradient approximation) */}
        <View className="absolute inset-0 bg-black/5" />

        {/* Logo Section */}
        <View className="mb-2 h-[160px] items-center justify-center pt-8">
          <Image
            source={leLabanLogo}
            className="h-[60px] w-[100px]"
            resizeMode="contain"
            accessibilityLabel="Le Leban logo"
          />
          <Text className="mt-4 text-[12px] font-medium text-white">
            Main Branch
          </Text>
          <View className="mt-1.5 flex-row items-center">
            <View className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            <Text className="ml-1.5 text-[10px] font-medium text-white/70">
              Online
            </Text>
          </View>
        </View>

        {/* Category List */}
        <FlatList
          data={tabs}
          keyExtractor={(item) => item.id ?? 'all'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
          renderItem={({ item }) => {
            const isActive = selectedCategoryId === item.id;

            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectCategory(item.id)}
                className="mb-1.5"
              >
                {isActive ? (
                  // ACTIVE CATEGORY
                  <View className="min-h-[54px] flex-row items-center overflow-hidden rounded-[20px] shadow-sm">
                    <LinearGradient
                       colors={['#4ca4ff', '#2d85f0']}
                      className="absolute inset-0"
                    />
                    <View className="w-8 items-center justify-center pl-1">
                      {getCategoryIcon(item.name, '#ffffff')}
                    </View>
                    <Text
                      className="ml-2 flex-1 text-[12px] font-bold text-white"
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                  </View>
                ) : (
                  // INACTIVE CATEGORY
                  <View className="min-h-[54px] flex-row items-center rounded-[20px] px-1">
                    <View className="w-8 items-center justify-center">
                      {getCategoryIcon(item.name, 'rgba(255,255,255,0.9)')}
                    </View>
                    <Text
                      className="ml-2 flex-1 text-[12px] font-semibold text-white/90"
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    );
  }

  // Mobile horizontal mode fallback
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
                <View className="min-h-[36px] flex-row items-center justify-center rounded-full bg-primary-navy px-4 py-1.5">
                  <View className="mr-1.5">
                    {getCategoryIcon(item.name, '#ffffff')}
                  </View>
                  <Text className="text-xs font-bold text-text-on-primary">{item.name}</Text>
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectCategory(item.id)}
              className="min-h-[36px] flex-row items-center justify-center rounded-full border border-border-soft bg-surface-elevated px-4 py-1.5"
            >
              <View className="mr-1.5">
                {getCategoryIcon(item.name, '#6b7280')}
              </View>
              <Text className="text-xs font-semibold text-text-secondary">{item.name}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

