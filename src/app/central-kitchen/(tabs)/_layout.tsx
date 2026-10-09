import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { BackHandler, FlatList, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Boxes, Store, Truck, History, BarChart3, Ellipsis, X, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { PhoneWebFrame } from '@/components/phone/PhoneWebFrame';
import { SidebarSelection, SidebarSurface } from '@/components/ui/SidebarSurface';

type KitchenTab = { name: string; label: string; icon: LucideIcon };

/** Direct sections on the rail; party lists share More on a phone. */
export const KITCHEN_TABS: readonly KitchenTab[] = [
  { name: 'home', label: 'Home', icon: Home },
  { name: 'analytics', label: 'Analytics', icon: BarChart3 },
  { name: 'items', label: 'Items', icon: Boxes },
  { name: 'branches', label: 'Branches', icon: Store },
  { name: 'vendors', label: 'Vendors', icon: Truck },
  { name: 'history', label: 'History', icon: History },
];
const phoneTabs = KITCHEN_TABS.filter(tab => tab.name !== 'branches' && tab.name !== 'vendors');
const moreTabs = KITCHEN_TABS.filter(tab => tab.name === 'branches' || tab.name === 'vendors');

function TabButton({ tab, focused, onPress, rail }: { tab: KitchenTab; focused: boolean; onPress: () => void; rail: boolean }) {
  const { isDesktop } = useResponsive();
  const compact = Platform.OS === 'web' && isDesktop && rail;
  const Icon = tab.icon;
  const color = rail ? focused ? colors.textOnPrimary : colors.sidebarTextMuted : focused ? colors.primary : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      accessibilityLabel={tab.label}
      className={`items-center active:opacity-80 ${rail ? `overflow-hidden rounded-[14px] border border-transparent focus:border-text-on-primary ${focused ? '' : 'hover:bg-sidebar-hover'}` : 'rounded-xl hover:bg-surface-tint focus:border focus:border-primary'} ${compact ? 'min-h-12 w-full flex-row justify-start gap-2 px-3 py-1.5' : `${rail ? 'w-[72px]' : 'flex-1'} min-h-[52px] justify-center py-1.5`}`}
    >
      {rail && focused ? <SidebarSelection /> : null}
      <View className={`items-center justify-center rounded-xl ${compact ? 'h-7 w-7' : `h-[30px] w-11 ${focused && !rail ? 'bg-accent-soft' : ''}`}`}>
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
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    if (Platform.OS === 'web') {
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') setMoreOpen(false);
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setMoreOpen(false); return true; });
    return () => listener.remove();
  }, [moreOpen]);
  const activeName = state.routes[state.index]?.name;
  const openTab = (tab: KitchenTab): void => {
    const route = state.routes.find(entry => entry.name === tab.name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    setMoreOpen(false);
    if (activeName !== route.name) navigation.navigate(route.name, route.params);
  };
  return (
    <View>
      {moreOpen ? <View className="absolute bottom-full left-0 right-0 border-t border-border-soft bg-surface-elevated p-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-bold text-text-primary">More kitchen sections</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close more sections" onPress={() => setMoreOpen(false)} className="h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-tint active:opacity-60 focus:border focus:border-primary"><X size={18} color={colors.primary} /></Pressable>
        </View>
        <FlatList data={moreTabs} keyExtractor={tab => tab.name} extraData={activeName}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: activeName === item.name }} onPress={() => openTab(item)} className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 hover:bg-surface-tint active:opacity-60 focus:border focus:border-primary">
            <item.icon size={20} color={colors.primary} /><Text className="text-sm font-semibold text-text-primary">{item.label}</Text>
          </Pressable>} />
      </View> : null}
    <View className="flex-row border-t border-border-soft bg-surface-elevated" style={{ paddingTop: 6, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 8 : 6), paddingHorizontal: 6 }}>
      {phoneTabs.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const focused = state.routes[state.index]?.name === tab.name;
        return (
          <TabButton
            key={tab.name}
            tab={tab}
            focused={focused}
            rail={false}
            onPress={() => openTab(tab)}
          />
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="More kitchen sections" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen(value => !value)} className="min-h-[52px] flex-1 items-center justify-center rounded-xl py-1.5 hover:bg-surface-tint active:opacity-60 focus:border focus:border-primary">
        <View className={'h-[30px] w-11 items-center justify-center rounded-xl ' + (moreOpen || moreTabs.some(tab => tab.name === activeName) ? 'bg-accent-soft' : '')}><Ellipsis size={21} color={moreOpen || moreTabs.some(tab => tab.name === activeName) ? colors.primary : colors.textSecondary} /></View>
        <Text className="mt-0.5 text-xs font-semibold text-text-secondary">More</Text>
      </Pressable>
    </View>
    </View>
  );
}

function Rail({ state, navigation }: BarProps) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const compact = Platform.OS === 'web' && isDesktop;
  return (
    <View testID="kitchen-navigation-rail" className={`relative items-center gap-1.5 overflow-hidden ${compact ? 'w-44 px-2' : 'w-[88px] px-2'}`} style={{ paddingTop: insets.top + 12 }}>
      <SidebarSurface />
      <View className={`w-full border-b border-sidebar-divider pb-3 ${compact ? 'px-3' : 'items-center'}`}>
        <Text className={`font-bold text-text-on-primary ${compact ? 'text-xl' : 'text-xs'}`} numberOfLines={1}>Le Laban</Text>
      </View>
      <FlatList
        className="min-h-0 w-full flex-1"
        data={KITCHEN_TABS}
        keyExtractor={tab => tab.name}
        extraData={state.index}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 6 }}
        ItemSeparatorComponent={() => <View className="h-1.5" />}
        renderItem={({ item: tab }) => {
          const route = state.routes.find(entry => entry.name === tab.name);
          if (!route) return null;
          const focused = state.routes[state.index]?.name === tab.name;
          return <TabButton tab={tab} focused={focused} rail onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }} />;
        }}
      />
      {compact ? <View className="mt-auto w-full border-t border-sidebar-divider px-3 py-4"><Text className="text-xs font-semibold text-sidebar-muted">Central Kitchen</Text></View> : null}
    </View>
  );
}

/**
 * Six direct sections on the rail. Phones keep Home, Analytics, Items,
 * History and More, with Branches and Vendors in the expanded list.
 */
export default function KitchenTabsLayout() {
  const { isTablet } = useResponsive();
  return (
    <PhoneWebFrame active={!isTablet}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.kitchenCanvas } }}
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
