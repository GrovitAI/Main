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
  const { isDesktop } = useResponsive();
  const compact = Platform.OS === 'web' && isDesktop && rail;
  const Icon = tab.icon;
  const color = focused ? colors.primary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      className={`items-center rounded-xl active:opacity-60 ${compact ? `min-h-11 w-full flex-row justify-start gap-2 px-3 py-1.5 ${focused ? 'bg-accent-soft' : ''}` : `${rail ? 'w-[72px]' : 'flex-1'} min-h-[52px] justify-center py-1.5`}`}
    >
      <View className={`items-center justify-center rounded-xl ${compact ? 'h-7 w-7' : `h-[30px] w-11 ${focused ? 'bg-accent-soft' : ''}`}`}>
        <Icon size={compact ? 18 : 21} color={color} />
      </View>
      <Text className={`${focused ? 'font-extrabold' : 'font-semibold'} ${compact ? 'text-[13px]' : 'mt-0.5 text-xs'}`} style={{ color }} numberOfLines={1}>
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
  const { isDesktop } = useResponsive();
  const compact = Platform.OS === 'web' && isDesktop;
  return (
    <View className={`items-center gap-1.5 border-r border-border-soft bg-surface-elevated ${compact ? 'w-44 px-2' : 'w-[88px]'}`} style={{ paddingTop: insets.top + 12 }}>
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
