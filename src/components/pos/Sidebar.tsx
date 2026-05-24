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
  const size = 16;

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
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 240, opacity: 0.08, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Abstract overlapping curves/circles */}
      <View style={{ position: 'absolute', bottom: -80, left: -40, height: 200, width: 200, borderRadius: 100, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: -40, right: -80, height: 160, width: 160, borderRadius: 80, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: 40, left: -60, height: 180, width: 180, borderRadius: 90, borderWidth: 2, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: 120, right: -40, height: 120, width: 120, borderRadius: 60, borderWidth: 1, borderColor: '#ffffff' }} />
    </View>
  );
}

function SidebarLogoSection() {
  return (
    <View style={{ paddingTop: 8, paddingBottom: 16, marginBottom: 6, alignItems: 'center' }}>
      <Image
        source={leLabanLogo}
        style={{ height: 52, width: 78, resizeMode: 'contain', opacity: 0.96 }}
        accessibilityLabel="Le Leban logo"
      />
      <Text style={{ fontSize: 16, fontWeight: '700', letterSpacing: -0.5, color: '#FFFFFF', marginTop: 6 }}>
        Main Branch
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: '#10b981' }} />
        <Text style={{ marginLeft: 6, fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>
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
      contentContainerStyle={{ gap: 8, marginTop: 10, paddingBottom: 20 }}
      renderItem={({ item }) => {
        const isActive = selectedCategoryId === item.id;

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectCategory(item.id)}
            style={{ borderRadius: 20, overflow: 'hidden' }}
          >
            <View
              style={
                isActive
                  ? {
                      height: 52,
                      borderRadius: 20,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.18)',
                      shadowColor: '#1E88FF',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.14,
                      shadowRadius: 14,
                      elevation: 3,
                    }
                  : {
                      height: 52,
                      borderRadius: 20,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                    }
              }
            >
              {isActive && (
                <LinearGradient
                  colors={['#57AEFF', '#2785F2']}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )}
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                  opacity: 0.9,
                }}
              >
                {getCategoryIcon(item.name, isActive)}
              </View>
              <Text
                style={{
                  fontSize: 13,
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
    <View style={{ width: 280, minWidth: 280, maxWidth: 280, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 35, elevation: 5 }}>
      {/* Background */}
      <LinearGradient
        colors={['#0A67C7', '#0C72D8', '#0059B8']}
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
