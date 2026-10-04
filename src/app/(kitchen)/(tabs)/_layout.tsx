import { Tabs } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Boxes, Store, Truck, History, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { PhoneWebFrame } from '@/components/phone/PhoneWebFrame';

type KitchenTab = { name: string; label: string; icon: LucideIcon };

/** Five sections, in the order the kitchen reaches for them. */
export const KITCHEN_TABS: readonly KitchenTab[] = [
  { name: 'home', label: 'Home', icon: Home },
  { name: 'items', label: 'Items', icon: Boxes },
  { name: 'branches', label: 'Branches', icon: Store },
  { name: 'vendors', label: 'Vendors', icon: Truck },
  { name: 'history', label: 'History', icon: History },
];

function TabButton({ tab, focused, onPress, rail }: { tab: KitchenTab; focused: boolean; onPress: () => void; rail: boolean }) {
  const Icon = tab.icon;
  const color = focused ? colors.primary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      style={({ pressed }) => ({
        flex: rail ? undefined : 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 52,
        width: rail ? 72 : undefined,
        paddingVertical: 6,
        borderRadius: 14,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View className="items-center justify-center rounded-xl" style={{ width: 44, height: 30, backgroundColor: focused ? colors.accentSoft : 'transparent' }}>
        <Icon size={21} color={color} />
      </View>
      <Text style={{ color, fontSize: 12, fontWeight: focused ? '800' : '600', marginTop: 2 }} numberOfLines={1}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

type BarProps = Pick<BottomTabBarProps, 'state' | 'navigation'>;

function BottomBar({ state, navigation }: BarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-row border-t border-border-soft bg-surface-elevated" style={{ paddingTop: 6, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 6), paddingHorizontal: 6 }}>
      {KITCHEN_TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const focused = state.routes[state.index]?.name === tab.name;
        return (
          <TabButton
            key={tab.name}
            tab={tab}
            focused={focused}
            rail={false}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
          />
        );
      })}
    </View>
  );
}

function Rail({ state, navigation }: BarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View className="border-r border-border-soft bg-surface-elevated" style={{ width: 88, paddingTop: insets.top + 12, alignItems: 'center', gap: 6 }}>
      {KITCHEN_TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const focused = state.routes[state.index]?.name === tab.name;
        return (
          <TabButton
            key={tab.name}
            tab={tab}
            focused={focused}
            rail
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * The kitchen's five sections. A bottom bar on a phone; on a tablet the same
 * five as a rail down the left, so the content keeps its width.
 */
export default function KitchenTabsLayout() {
  const { isTablet } = useResponsive();
  return (
    <PhoneWebFrame active={!isTablet}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surfaceTint } }}
        tabBar={(props) =>
          isTablet ? null : <BottomBar {...props} />
        }
        {...(isTablet
          ? {
              layout: ({ children, state, navigation }: BarProps & { children: React.ReactNode }) => (
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <Rail state={state} navigation={navigation} />
                  <View style={{ flex: 1 }}>{children}</View>
                </View>
              ),
            }
          : {})}
      >
        {KITCHEN_TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
        ))}
      </Tabs>
    </PhoneWebFrame>
  );
}
