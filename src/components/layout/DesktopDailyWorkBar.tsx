import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import type { UserRole } from '@/lib/pos/session-context';
import type { TabConfig } from '@/lib/pos/tab-config';
import {
  flattenNavigationGroups, getDailyWorkDesktopTabs, getDesktopNavigationSelection,
  getMoreGroups, type NavigationRow,
} from '@/lib/pos/daily-work-navigation';

type Props = BottomTabBarProps & { role: UserRole; hidden: boolean };

/** Desktop-only popover. The phone's More route remains a full screen. */
export function DesktopDailyWorkBar({ state, navigation, role, hidden }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTrigger = useRef<View>(null);
  const menuRefs = useRef<Record<string, View | null>>({});
  const focusedIndex = useRef(0);
  const activeRoute = state.routes[state.index]?.name ?? '';
  const tabs = useMemo(() => getDailyWorkDesktopTabs(role), [role]);
  const groups = useMemo(() => getMoreGroups(role, false), [role]);
  const menuTabs = useMemo(() => groups.flatMap(group => group.tabs), [groups]);
  const dockWidth = Math.min(width - 32, tabs.length * 112 + 16);
  const menuBottom = 88 + insets.bottom;

  function closeMenu(): void {
    setMoreOpen(false);
    requestAnimationFrame(() => moreTrigger.current?.focus());
  }

  useEffect(() => {
    setMoreOpen(false);
  }, [activeRoute, width, height, hidden, role]);

  useEffect(() => {
    if (!moreOpen) return;
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMoreOpen(false);
        requestAnimationFrame(() => moreTrigger.current?.focus());
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || menuTabs.length === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const lastIndex = menuTabs.length - 1;
      focusedIndex.current = event.key === 'Home' ? 0 : event.key === 'End' ? lastIndex
        : (focusedIndex.current + (event.key === 'ArrowDown' ? 1 : -1) + menuTabs.length) % menuTabs.length;
      const tab = menuTabs[focusedIndex.current];
      if (tab) menuRefs.current[tab.name]?.focus();
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [moreOpen, menuTabs]);

  function openTab(tab: TabConfig): void {
    if (tab.name === 'more') { setMoreOpen(open => !open); return; }
    setMoreOpen(false);
    if (tab.name === 'central-kitchen') { router.navigate(tab.href as Href); return; }
    const route = state.routes.find(entry => entry.name === tab.name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (route.name !== activeRoute && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  }

  if (hidden) return null;
  return (
    <View className="items-center px-4 pt-2" style={{ height: 80 + insets.bottom }}>
      <View className="rounded-2xl border border-border bg-surface-elevated p-2" style={{ width: dockWidth }}>
        <FlatList<TabConfig>
          horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}
          data={tabs} keyExtractor={tab => tab.name} extraData={[activeRoute, moreOpen, dockWidth]}
          renderItem={({ item }) => {
            const selected = item.name === getDesktopNavigationSelection(role, activeRoute);
            const Icon = item.icon;
            const isMore = item.name === 'more';
            return (
              <Pressable
                ref={isMore ? moreTrigger : undefined}
                accessibilityRole={isMore ? 'button' : 'tab'}
                accessibilityLabel={item.label}
                accessibilityState={{ selected, expanded: isMore ? moreOpen : undefined }}
                aria-selected={isMore ? undefined : selected}
                aria-expanded={isMore ? moreOpen : undefined}
                aria-haspopup={isMore ? 'menu' : undefined}
                onPress={() => openTab(item)}
                className={`min-h-[44px] flex-row items-center justify-center gap-2 rounded-lg px-2 focus:bg-accent-soft ${selected || (isMore && moreOpen) ? 'bg-accent-soft' : 'hover:bg-surface-tint'}`}
                style={{ width: (dockWidth - 18) / tabs.length }}
              >
                <Icon size={18} color={selected || (isMore && moreOpen) ? colors.primaryDeep : colors.textSecondary} />
                <Text className={`text-sm ${selected || (isMore && moreOpen) ? 'font-semibold text-primary-deep' : 'text-text-secondary'}`}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>
      <Modal transparent visible={moreOpen} animationType="none" onRequestClose={closeMenu}
        onShow={() => {
          focusedIndex.current = 0;
          const firstTab = menuTabs[0];
          if (firstTab) menuRefs.current[firstTab.name]?.focus();
        }}
      >
        <View className="flex-1">
          <Pressable testID="more-menu-dismiss" accessible={false} focusable={false} onPress={closeMenu} className="absolute inset-0" />
          <View
            accessibilityRole="menu" accessibilityLabel="More navigation"
            className="absolute w-[288px] overflow-hidden rounded-xl border border-border bg-surface-elevated"
            style={{ bottom: menuBottom, right: Math.max(16, (width - dockWidth) / 2 + 8), maxHeight: Math.max(120, height - menuBottom - 24) }}
          >
            <FlatList<NavigationRow>
              data={flattenNavigationGroups(groups)} keyExtractor={row => row.key}
              extraData={activeRoute} contentContainerClassName="px-2 pb-2"
              ListEmptyComponent={<Text className="p-4 text-sm text-text-secondary">No additional screens available.</Text>}
              renderItem={({ item }) => {
                if (item.kind === 'heading') return <Text className="mb-1 mt-4 px-3 text-xs font-semibold text-text-secondary">{item.title}</Text>;
                const Icon = item.tab.icon;
                const selected = item.tab.name === activeRoute;
                return (
                  <Pressable
                    ref={node => { menuRefs.current[item.tab.name] = node; }}
                    accessibilityRole="menuitem" accessibilityLabel={item.tab.label}
                    onFocus={() => { focusedIndex.current = menuTabs.findIndex(tab => tab.name === item.tab.name); }}
                    onPress={() => openTab(item.tab)}
                    className={`min-h-[44px] flex-row items-center gap-3 rounded-lg px-3 focus:bg-accent-soft ${selected ? 'bg-accent-soft' : 'hover:bg-surface-tint'}`}
                  >
                    <Icon size={18} color={selected ? colors.primaryDeep : colors.textSecondary} />
                    <Text className={`flex-1 text-sm ${selected ? 'font-semibold text-primary-deep' : 'text-text-primary'}`}>{item.tab.label}</Text>
                    <ChevronRight size={16} color={colors.textSecondary} />
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
