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
  const color = '#ffffff'; 
  const size = 16;
  const opacity = isActive ? 1 : 0.92;

  const lowerName = name.toLowerCase();
  if (lowerName === 'all') return <LayoutGrid color={color} size={size} style={{ opacity }} />;
  if (lowerName.includes('signature') || lowerName.includes('cake')) return <CakeSlice color={color} size={size} style={{ opacity }} />;
  if (lowerName.includes('kunafa')) return <Sandwich color={color} size={size} style={{ opacity }} />;
  if (lowerName.includes('cup') && !lowerName.includes('drink')) return <CupSoda color={color} size={size} style={{ opacity }} />;
  if (lowerName.includes('drink') || lowerName.includes('shake')) return <GlassWater color={color} size={size} style={{ opacity }} />;
  if (lowerName.includes('hot') || lowerName.includes('beverage')) return <Coffee color={color} size={size} style={{ opacity }} />;
  if (lowerName.includes('add')) return <CirclePlus color={color} size={size} style={{ opacity }} />;
  
  return <LayoutGrid color={color} size={size} style={{ opacity }} />;
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
    <View style={{ width: '100%', alignSelf: 'stretch', paddingTop: 28, paddingBottom: 32, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}>
      <Image
        source={leLabanLogo}
        style={{ height: 60, width: 94, resizeMode: 'contain', opacity: 0.96 }}
        accessibilityLabel="Le Leban logo"
      />
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF', marginTop: 4 }}>
        Main Branch
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
        <View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: '#10b981' }} />
        <Text style={{ marginLeft: 4, fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>
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
      contentContainerStyle={{ gap: 10, marginTop: 18, paddingHorizontal: 14, paddingBottom: 24 }}
      renderItem={({ item }) => {
        const isActive = selectedCategoryId === item.id;

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectCategory(item.id)}
            style={({ hovered, pressed }) => [
              {
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderWidth: 1,
                borderColor: 'transparent',
                borderLeftWidth: 2,
                borderLeftColor: 'transparent',
                // Web transition
                ...({ transition: 'all 180ms ease' } as any)
              },
              isActive && {
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderColor: 'rgba(255,255,255,0.12)',
                borderLeftColor: 'rgba(255,255,255,0.85)',
                shadowColor: '#ffffff',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.06,
                shadowRadius: 20,
                elevation: 1,
                // Soft glassmorphism blur
                ...({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any)
              },
              !isActive && hovered && {
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderColor: 'rgba(255,255,255,0.06)',
                transform: [{ translateX: 2 }],
                // Soft glassmorphism blur
                ...({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any)
              },
              pressed && {
                opacity: 0.85,
                transform: [{ scale: 0.98 }]
              }
            ]}
          >
            {getCategoryIcon(item.name, isActive)}
            <Text
              style={{
                fontSize: 13,
                lineHeight: 16,
                fontWeight: isActive ? '600' : '500',
                color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.8)',
                flex: 1,
              }}
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
    <View style={{ width: 180, minWidth: 180, maxWidth: 180, borderRadius: 0, overflow: 'hidden' }}>
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
