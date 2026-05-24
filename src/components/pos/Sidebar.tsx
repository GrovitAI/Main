import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { CakeSlice, Coffee, CupSoda, GlassWater, LayoutGrid, CirclePlus, Sandwich } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { Category } from '@/lib/pos/products-service';

type SidebarProps = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
};

type CategoryTabItem = {
  id: string | null;
  name: string;
};

/* eslint-disable @typescript-eslint/no-require-imports */
const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

function getCategoryIcon(name: string, isActive: boolean) {
  const color = isActive ? '#ffffff' : 'rgba(255,255,255,0.9)'; 
  const size = 20;

  const lowerName = name.toLowerCase();
  if (lowerName === 'all') return <LayoutGrid color={color} size={size} />;
  if (lowerName.includes('signature') || lowerName.includes('cake')) return <CakeSlice color={color} size={size} />;
  if (lowerName.includes('kunafa')) return <Sandwich color={color} size={size} />;
  if (lowerName.includes('cup') && !lowerName.includes('drink')) return <CupSoda color={color} size={size} />;
  if (lowerName.includes('drink') || lowerName.includes('shake')) return <GlassWater color={color} size={size} />;
  if (lowerName.includes('hot') || lowerName.includes('beverage')) return <Coffee color={color} size={size} />;
  if (lowerName.includes('add')) return <CirclePlus color={color} size={size} />;
  
  return <LayoutGrid color={color} size={size} />;
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT: SidebarDecoration
// Abstract geometric shapes to approximate the luxury floral texture
// ─────────────────────────────────────────────────────────────────
function SidebarDecoration() {
  return (
    <View className="absolute inset-x-0 bottom-0 h-[300px] overflow-hidden opacity-20 pointer-events-none">
      {/* Abstract overlapping curves/circles */}
      <View className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full border-[1px] border-white/40" />
      <View className="absolute -bottom-10 -right-20 h-48 w-48 rounded-full border-[1px] border-white/30" />
      <View className="absolute bottom-10 -left-20 h-56 w-56 rounded-full border-[2px] border-white/20" />
      <View className="absolute bottom-32 -right-10 h-40 w-40 rounded-full border-[1px] border-white/20" />
      <View className="absolute bottom-0 left-0 right-0 h-48 bg-white/5 rounded-tl-[100px]" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT: SidebarLogoSection
// ─────────────────────────────────────────────────────────────────
function SidebarLogoSection() {
  return (
    <View className="h-[160px] items-center justify-center pt-6">
      {/* The glowing inner curve effect from the reference */}
      <View className="absolute bottom-0 left-4 right-4 h-[1px] bg-white/20" />
      <Image
        source={leLabanLogo}
        className="h-[60px] w-[100px]"
        resizeMode="contain"
        accessibilityLabel="Le Leban logo"
      />
      <Text className="mt-4 text-[12px] font-medium text-white">
        Main Branch
      </Text>
      <View className="mt-1 flex-row items-center">
        <View className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
        <Text className="ml-1.5 text-[10px] text-white/70">
          Online
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT: SidebarNavigation
// ─────────────────────────────────────────────────────────────────
function SidebarNavigation({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  const tabs: CategoryTabItem[] = [
    { id: null, name: 'All Items' },
    ...categories.map((category) => ({ id: category.id, name: category.name })),
  ];

  return (
    <FlatList
      data={tabs}
      keyExtractor={(item) => item.id ?? 'all'}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24, gap: 12 }}
      renderItem={({ item }) => {
        const isActive = selectedCategoryId === item.id;

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectCategory(item.id)}
          >
            {isActive ? (
              // ACTIVE CATEGORY
              <View className="min-h-[56px] flex-row items-center overflow-hidden rounded-[20px] shadow-sm">
                <LinearGradient
                  colors={['#4ca4ff', '#2d85f0']}
                  className="absolute inset-0"
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />
                <View className="w-10 items-center justify-center pl-2">
                  {getCategoryIcon(item.name, true)}
                </View>
                <Text
                  className="ml-2 flex-1 text-[13px] font-bold text-white shadow-sm"
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
              </View>
            ) : (
              // INACTIVE CATEGORY
              <View className="min-h-[56px] flex-row items-center rounded-[20px] px-2">
                <View className="w-10 items-center justify-center">
                  {getCategoryIcon(item.name, false)}
                </View>
                <Text
                  className="ml-2 flex-1 text-[13px] font-semibold text-white/90"
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
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT: Sidebar
// ─────────────────────────────────────────────────────────────────
export function Sidebar({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  return (
    <View className="flex-1 w-[140px] overflow-hidden">
      {/* Premium Layered Background */}
      <LinearGradient
        colors={['#003a75', '#004f9e', '#005fc0']}
        className="absolute inset-0"
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      {/* Decorative Texture Overlay */}
      <SidebarDecoration />

      {/* Sections */}
      <View className="absolute inset-0 flex-col">
        <SidebarLogoSection />
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
