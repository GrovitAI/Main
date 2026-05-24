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

function SidebarLogoSection() {
  return (
    <View style={{ paddingTop: 14, paddingBottom: 28, marginBottom: 10, alignItems: 'center' }}>
      <Image
        source={leLabanLogo}
        style={{ height: 72, width: 140, resizeMode: 'contain' }}
        accessibilityLabel="Le Leban logo"
      />
      <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: '#FFFFFF', marginTop: 10 }}>
        Main Branch
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
        <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
        <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>
          Online
        </Text>
      </View>
    </View>
  );
}

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
      contentContainerStyle={{ gap: 10, marginTop: 14, paddingBottom: 20 }}
      renderItem={({ item }) => {
        const isActive = selectedCategoryId === item.id;

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectCategory(item.id)}
            style={
              isActive
                ? { height: 68, borderRadius: 22, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 4 }
                : { height: 68, borderRadius: 22, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)' }
            }
          >
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              {getCategoryIcon(item.name, isActive)}
            </View>
            <Text
              style={{ fontSize: 16, fontWeight: '600', color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.9)', flex: 1 }}
              numberOfLines={2}
            >
              {item.name}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

export function Sidebar({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  return (
    <View style={{ width: 280, minWidth: 280, maxWidth: 280, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 35, elevation: 5 }}>
      {/* Background */}
      <LinearGradient
        colors={['#0C63C7', '#094D9A']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      
      <SidebarLogoSection />
      
      <View style={{ flex: 1 }}>
        <SidebarNavigation
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={onSelectCategory}
        />
      </View>
    </View>
  );
}
