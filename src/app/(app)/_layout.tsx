import { Tabs } from 'expo-router';

import { colors } from '@/lib/pos/brand';
import { CURRENT_ROLE } from '@/lib/pos/session-context';
import {
  APP_TAB_ROUTE_NAMES,
  getInitialRouteNameForRole,
  getTabConfigForRoute,
  getTabsForRole,
} from '@/lib/pos/tab-config';

export default function AppTabLayout() {
  const roleTabs = getTabsForRole(CURRENT_ROLE);
  const initialRouteName = getInitialRouteNameForRole(CURRENT_ROLE);

  return (
    <Tabs
      initialRouteName={initialRouteName}
      screenOptions={{
        tabBarActiveTintColor: colors.primaryMid,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.borderSoft,
          minHeight: 64,
          paddingTop: 4,
        },
        headerStyle: {
          backgroundColor: colors.surfaceTint,
          borderBottomColor: colors.borderSoft,
        },
        headerTintColor: colors.primaryDeep,
        headerTitleStyle: { fontWeight: '700', color: colors.textPrimary },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      {APP_TAB_ROUTE_NAMES.map((routeName) => {
        const tab = getTabConfigForRoute(routeName, roleTabs);

        if (!tab) {
          return (
            <Tabs.Screen
              key={routeName}
              name={routeName}
              options={{
                href: null,
              }}
            />
          );
        }

        const TabIcon = tab.icon;

        return (
          <Tabs.Screen
            key={routeName}
            name={routeName}
            options={{
              title: tab.label,
              headerShown: routeName !== 'index' && routeName !== 'orders', // Reclaim top spacing for POS + Orders screens
              tabBarIcon: ({ color, size }) => (
                <TabIcon color={color} size={size} />
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
