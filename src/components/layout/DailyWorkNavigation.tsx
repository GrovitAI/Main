import { useState } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/pos/brand';
import type { UserRole } from '@/lib/pos/session-context';
import type { TabConfig } from '@/lib/pos/tab-config';
import {
  flattenNavigationGroups, getDailyWorkGroups, getDailyWorkPhoneTabs,
  getPhoneNavigationSelection, type NavigationRow,
} from '@/lib/pos/daily-work-navigation';

type Props = BottomTabBarProps & { role: UserRole; sidebar: boolean; hidden: boolean };

export function DailyWorkNavigation({ state, navigation, role, sidebar, hidden }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [phoneWidth, setPhoneWidth] = useState(Math.min(width, 480));
  const activeRoute = state.routes[state.index]?.name ?? '';

  function openTab(tab: TabConfig): void {
    if (tab.name === 'central-kitchen') {
      router.navigate(tab.href as Href);
      return;
    }
    const route = state.routes.find((entry) => entry.name === tab.name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (route.name !== activeRoute && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  }

  function destination(tab: TabConfig, selected: boolean, phone = false) {
    const Icon = tab.icon;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected }}
        aria-selected={selected}
        onPress={() => openTab(tab)}
        onLongPress={() => {
          const route = state.routes.find((entry) => entry.name === tab.name);
          if (route) navigation.emit({ type: 'tabLongPress', target: route.key });
        }}
        className={phone
          ? 'min-h-[56px] items-center justify-center gap-1'
          : `mx-2 min-h-[44px] flex-row items-center gap-2 rounded-lg px-3 ${selected ? 'bg-accent-soft' : 'hover:bg-surface-tint'}`}
        style={phone ? { width: phoneWidth / 4 } : undefined}
      >
        <Icon size={phone ? 20 : 18} color={selected ? colors.primaryDeep : colors.textSecondary} />
        <Text className={`${phone ? 'text-xs' : 'text-sm'} ${selected ? 'font-semibold text-primary-deep' : 'text-text-secondary'}`}>
          {tab.label}
        </Text>
      </Pressable>
    );
  }

  if (sidebar) {
    return (
      <View className="w-[184px] border-r border-border bg-surface-elevated" style={{ paddingBottom: insets.bottom }}>
        {!hidden && <FlatList<NavigationRow>
          data={flattenNavigationGroups(getDailyWorkGroups(role, false))}
          keyExtractor={(row) => row.key}
          extraData={activeRoute}
          contentContainerClassName="pb-4"
          renderItem={({ item }) => item.kind === 'heading'
            ? <Text className="mb-2 mt-6 px-5 text-xs font-semibold text-text-secondary">{item.title}</Text>
            : destination(item.tab, item.tab.name === activeRoute)}
        />}
      </View>
    );
  }

  if (hidden) return null;
  return (
    <View
      onLayout={(event) => setPhoneWidth(event.nativeEvent.layout.width)}
      className="border-t border-border bg-surface-elevated"
      style={{ paddingBottom: insets.bottom }}
    >
      <FlatList<TabConfig>
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        data={getDailyWorkPhoneTabs(role)}
        keyExtractor={(tab) => tab.name}
        extraData={[activeRoute, phoneWidth]}
        renderItem={({ item }) => destination(item, item.name === getPhoneNavigationSelection(activeRoute), true)}
      />
    </View>
  );
}
