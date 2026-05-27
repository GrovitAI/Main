import { useRef, useEffect } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { ChefHat } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';

export default function KitchenScreen() {
  const navigation = useNavigation();
  const refreshButtonRef = useRef<View>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (Platform.OS === 'web') {
        const node = refreshButtonRef.current as unknown as HTMLElement | null;
        node?.focus();
      }
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <View className="flex-1 items-center justify-center bg-surface-tint px-6">
      <View className="w-full max-w-md rounded-panel border border-border-soft bg-surface-elevated p-8 shadow-panel items-center">
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl bg-primary-mid/10">
          <ChefHat color={colors.primaryMid} size={24} />
        </View>
        <Text className="text-center text-2xl font-bold text-text-primary">Kitchen Display</Text>
        <Text className="mt-2 text-center text-base text-text-secondary mb-6">
          KOT tracking and kitchen display console
        </Text>
        <Pressable
          ref={refreshButtonRef}
          focusable={true}
          accessibilityRole="button"
          style={({ hovered, pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 24,
            borderRadius: 12,
            backgroundColor: pressed ? colors.primaryDeep : (hovered ? colors.primaryMid : colors.primaryMid),
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.primaryMid,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 3,
            outlineStyle: (hovered ? 'solid' : 'none') as any,
            outlineColor: colors.primaryMid,
            outlineWidth: 2,
          } as any)}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>
            Refresh Display
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
