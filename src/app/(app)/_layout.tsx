import { Tabs, router, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { colors } from '@/lib/pos/brand';
import { CURRENT_ROLE } from '@/lib/pos/session-context';
import {
  APP_TAB_ROUTE_NAMES,
  AppTabRouteName,
  getInitialRouteNameForRole,
  getTabConfigForRoute,
  getTabsForRole,
} from '@/lib/pos/tab-config';

function getCurrentTabNameFromSegments(segments: string[]): AppTabRouteName {
  if (segments.length === 0) return 'index';
  const lastSegment = segments[segments.length - 1];
  if (lastSegment === '(app)' || lastSegment === 'index' || lastSegment === '') {
    return 'index';
  }
  const found = APP_TAB_ROUTE_NAMES.find(name => name === lastSegment);
  if (found) {
    return found;
  }
  return 'index';
}

export default function AppTabLayout() {
  const roleTabs = getTabsForRole(CURRENT_ROLE);
  const initialRouteName = getInitialRouteNameForRole(CURRENT_ROLE);
  const segments = useSegments();

  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl + ArrowRight (next tab) or Ctrl + ArrowLeft (previous tab)
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) {
        return;
      }

      // Check if we are currently editing a quantity / notes / forms field (blocked inputs)
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || (activeEl as any).isContentEditable) {
          // Allow tab navigation ONLY if it's the POS search input or the Orders search input
          if (activeEl.id !== 'search-input' && activeEl.id !== 'orders-search-input') {
            return; // Block tab switching
          }
        }
      }

      // We are allowed to switch tabs! Prevent default browser behaviors (such as back/forward in page history)
      e.preventDefault();

      // Read actual navigation tab names in rendered order
      const activeTabNames = APP_TAB_ROUTE_NAMES.filter(name =>
        roleTabs.some(tab => tab.name === name)
      );

      if (activeTabNames.length <= 1) return;

      const currentTabName = getCurrentTabNameFromSegments(segmentsRef.current);
      const currentIndex = activeTabNames.indexOf(currentTabName);

      if (currentIndex === -1) {
        console.warn('[AppTabLayout] Current tab name not found in active tabs list:', currentTabName);
        return;
      }

      let nextIndex = currentIndex;
      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % activeTabNames.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + activeTabNames.length) % activeTabNames.length;
      }

      const targetTabName = activeTabNames[nextIndex];
      const targetTabConfig = roleTabs.find(tab => tab.name === targetTabName);
      if (targetTabConfig) {
        console.log('[AppTabLayout] Navigating to tab:', targetTabName, 'via shortcut');
        router.push(targetTabConfig.href as any);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [roleTabs]);

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
