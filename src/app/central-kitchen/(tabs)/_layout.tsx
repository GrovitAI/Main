import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { BackHandler, FlatList, Image, Platform, Pressable, View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Boxes, PackageCheck, Store, Truck, History, BarChart3, ClipboardCheck, Ellipsis, X, PanelLeft, PanelLeftClose, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { PhoneWebFrame } from '@/components/phone/PhoneWebFrame';
import { SidebarSelection, SidebarSurface } from '@/components/ui/SidebarSurface';

type KitchenTab = { name: string; label: string; icon: LucideIcon };

/** Direct sections on the rail; party lists share More on a phone. */
export const KITCHEN_TABS: readonly KitchenTab[] = [
  { name: 'home', label: 'Home', icon: Home },
  { name: 'analytics', label: 'Analytics', icon: BarChart3 },
  { name: 'items', label: 'Raw materials', icon: Boxes },
  { name: 'finished-goods', label: 'Finished goods', icon: PackageCheck },
  { name: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { name: 'branches', label: 'Branches', icon: Store },
  { name: 'vendors', label: 'Vendors', icon: Truck },
  { name: 'history', label: 'History', icon: History },
];
const phoneTabs = KITCHEN_TABS.filter(tab => !['branches', 'vendors', 'finished-goods', 'attendance'].includes(tab.name)).map(tab => tab.name === 'items' ? { ...tab, label: 'Stock' } : tab);
const moreTabs = KITCHEN_TABS.filter(tab => ['attendance', 'branches', 'vendors'].includes(tab.name));

const leLabanLogo: ImageSourcePropType = require('@/../assets/images/le-leban-logo.png');
type RailWebStyle = ViewStyle & { transition?: string };

function TabButton({ tab, focused, onPress, rail, expanded = true }: { tab: KitchenTab; focused: boolean; onPress: () => void; rail: boolean; expanded?: boolean }) {
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
      className={`items-center active:opacity-80 ${rail ? `overflow-hidden rounded-[14px] border border-transparent focus:border-text-on-primary ${focused ? '' : 'hover:bg-sidebar-hover'}` : 'rounded-xl hover:bg-surface-tint focus:border focus:border-primary'} ${compact ? `min-h-12 w-full flex-row py-1.5 ${expanded ? 'justify-start gap-2 px-2' : 'justify-center'}` : `${rail ? 'w-[72px]' : 'flex-1'} min-h-[52px] justify-center py-1.5`}`}
    >
      {rail && focused ? <SidebarSelection /> : null}
      <View className={`items-center justify-center rounded-xl ${compact ? 'h-7 w-7' : `h-[30px] w-11 ${focused && !rail ? 'bg-accent-soft' : ''}`}`}>
        <Icon size={compact ? 18 : 21} color={color} />
      </View>
      {!compact || expanded ? <Text className={`${focused ? 'font-extrabold' : 'font-semibold'} ${compact ? 'text-[13px]' : 'mt-0.5 text-xs'}`} style={{ color, textAlign: compact ? 'left' : 'center' }} numberOfLines={rail && !compact ? 2 : 1}>
        {tab.label}
      </Text> : null}
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
        const focused = activeName === tab.name || (tab.name === 'items' && activeName === 'finished-goods');
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
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const expanded = !compact || pinned || hovered || keyboardFocused;
  useEffect(() => {
    if (!compact) return;
    const rail = document.getElementById('kitchen-navigation-rail');
    const shell = document.getElementById('kitchen-navigation-shell');
    if (!rail || !shell) return;
    let keyboardNavigation = false;
    const onMouseEnter = (): void => setHovered(true);
    const onMouseLeave = (): void => setHovered(false);
    const onFocusIn = (): void => setKeyboardFocused(keyboardNavigation);
    const onFocusOut = (event: FocusEvent): void => {
      if (!(event.relatedTarget instanceof Node) || !rail.contains(event.relatedTarget)) setKeyboardFocused(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      keyboardNavigation = true;
      if (rail.contains(document.activeElement)) setKeyboardFocused(true);
    };
    const onPointerDown = (): void => {
      keyboardNavigation = false;
      setKeyboardFocused(false);
    };
    rail.addEventListener('focusin', onFocusIn);
    rail.addEventListener('focusout', onFocusOut);
    shell.addEventListener('mouseenter', onMouseEnter);
    shell.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      rail.removeEventListener('focusin', onFocusIn);
      rail.removeEventListener('focusout', onFocusOut);
      shell.removeEventListener('mouseenter', onMouseEnter);
      shell.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [compact]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const drawerStyle: RailWebStyle = {
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom,
    ...(compact ? {
      width: expanded ? 176 : 64,
      transition: reducedMotion ? 'none' : 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    } : {}),
  };
  return (
    <View nativeID="kitchen-navigation-shell" testID="kitchen-navigation-shell"
      className={`relative shrink-0 ${compact ? `${pinned ? 'w-44' : 'w-16'} z-50` : 'w-[88px]'}`}>
    <View nativeID="kitchen-navigation-rail" testID="kitchen-navigation-rail" className={`items-center gap-1.5 overflow-hidden px-2 ${compact ? 'absolute inset-y-0 left-0' : 'relative h-full w-[88px]'}`} style={drawerStyle}>
      <SidebarSurface />
      <View className="h-[68px] w-full items-center justify-center border-b border-sidebar-divider pb-3">
        <Image source={leLabanLogo} accessibilityLabel="Le Laban logo" resizeMode="contain"
          style={{ height: compact && expanded ? 52 : 32, width: compact && expanded ? 84 : 32 }} />
      </View>
      <FlatList
        className="min-h-0 w-full flex-1"
        data={KITCHEN_TABS}
        keyExtractor={tab => tab.name}
        extraData={`${state.index}-${expanded}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 6 }}
        ItemSeparatorComponent={() => <View className="h-1.5" />}
        renderItem={({ item: tab }) => {
          const route = state.routes.find(entry => entry.name === tab.name);
          if (!route) return null;
          const focused = state.routes[state.index]?.name === tab.name;
          return <TabButton tab={tab} focused={focused} rail expanded={expanded} onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }} />;
        }}
      />
      {compact ? <View className="w-full border-t border-sidebar-divider">
        {expanded ? <Text className="px-2 pt-2 text-xs font-semibold text-sidebar-muted" numberOfLines={1}>Central Kitchen</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={pinned ? 'Unpin kitchen sidebar' : 'Pin kitchen sidebar open'}
          accessibilityState={{ selected: pinned }} onPress={() => setPinned(value => !value)}
          className="min-h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border border-transparent hover:bg-sidebar-hover focus:border-text-on-primary active:opacity-80">
          {pinned ? <PanelLeftClose size={18} color={colors.sidebarTextMuted} /> : <PanelLeft size={18} color={colors.sidebarTextMuted} />}
          {expanded ? <Text className="text-xs font-semibold text-sidebar-muted">{pinned ? 'Unpin sidebar' : 'Pin sidebar'}</Text> : null}
        </Pressable>
      </View> : null}
    </View>
    </View>
  );
}

/**
 * Direct sections on the rail. Phones keep Home, Analytics, Stock,
 * History and More, with Attendance, Branches and Vendors in the expanded list.
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
