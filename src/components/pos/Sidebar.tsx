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
  const size = 14;

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

function SidebarDecoration() {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, opacity: 0.08, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Abstract overlapping curves/circles */}
      <View style={{ position: 'absolute', bottom: -60, left: -30, height: 150, width: 150, borderRadius: 75, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: -30, right: -60, height: 120, width: 120, borderRadius: 60, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: 30, left: -45, height: 130, width: 130, borderRadius: 65, borderWidth: 2, borderColor: '#ffffff' }} />
    </View>
  );
}

function SidebarLogoSection() {
  return (
    <View style={{ paddingTop: 6, paddingBottom: 12, marginBottom: 4, alignItems: 'center' }}>
      <Image
        source={leLabanLogo}
        style={{ height: 46, width: 68, resizeMode: 'contain', opacity: 0.96 }}
        accessibilityLabel="Le Leban logo"
      />
      <Text style={{ fontSize: 14, fontWeight: '700', letterSpacing: -0.5, color: '#FFFFFF', marginTop: 4 }}>
        Main Branch
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
        <View style={{ height: 5, width: 5, borderRadius: 2.5, backgroundColor: '#10b981' }} />
        <Text style={{ marginLeft: 5, fontSize: 10, fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>
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
      contentContainerStyle={{ gap: 6, marginTop: 8, paddingBottom: 16 }}
      renderItem={({ item }) => {
        const isActive = selectedCategoryId === item.id;

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectCategory(item.id)}
            style={{ borderRadius: 16, overflow: 'hidden' }}
          >
            <View
              style={
                isActive
                  ? {
                      height: 46,
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.18)',
                      shadowColor: '#013b8c',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.12,
                      shadowRadius: 10,
                      elevation: 2,
                    }
                  : {
                      height: 46,
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                    }
              }
            >
              {isActive && (
                <LinearGradient
                  colors={['#2E7BDA', '#013b8c']}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  opacity: 0.9,
                }}
              >
                {getCategoryIcon(item.name, isActive)}
              </View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.9)',
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {item.name}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

export function Sidebar({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  return (
    <View style={{ width: 280, minWidth: 280, maxWidth: 280, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 28, elevation: 4 }}>
      {/* Background */}
      <LinearGradient
        colors={['#0251b8', '#013b8c', '#012f70']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      
      {/* Subtle Pattern */}
      <SidebarDecoration />

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
