import { FlatList, Image, Pressable, Text, View } from 'react-native';
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
    <View style={{ paddingTop: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}>
      <Image
        source={leLabanLogo}
        style={{ height: 76, width: 115, resizeMode: 'contain', opacity: 0.96 }}
        accessibilityLabel="Le Leban logo"
      />
      <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF', marginTop: 4 }}>
        Main Branch
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
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
      contentContainerStyle={{ gap: 18, marginTop: 18, paddingBottom: 16 }}
      renderItem={({ item }) => {
        const isActive = selectedCategoryId === item.id;

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectCategory(item.id)}
            style={{ borderRadius: 0 }}
          >
            <View
              style={
                isActive
                  ? {
                      height: 38,
                      borderLeftWidth: 3,
                      borderLeftColor: 'white',
                      paddingLeft: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }
                  : {
                      height: 38,
                      borderLeftWidth: 3,
                      borderLeftColor: 'transparent',
                      paddingLeft: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }
              }
            >
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: isActive ? '600' : '500',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.8)',
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
    <View style={{ width: 180, minWidth: 180, maxWidth: 180, borderRadius: 0, paddingHorizontal: 16, paddingVertical: 18, overflow: 'hidden' }}>
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
