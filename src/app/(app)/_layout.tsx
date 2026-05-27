import { Tabs, router, useSegments, usePathname } from 'expo-router';
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

function getCurrentTabNameNormalized(segments: string[], pathname: string): AppTabRouteName {
  // 1. Try segments first
  if (segments && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment !== '(app)' && lastSegment !== 'index' && lastSegment !== '') {
      const found = APP_TAB_ROUTE_NAMES.find(name => name === lastSegment);
      if (found) return found;
    }
  }

  // 2. Try pathname
  const clean = (pathname || '').split('?')[0].replace(/^\/|\/$/g, '').toLowerCase();
  if (clean === '' || clean === 'index' || clean === '(app)' || clean === '(app)/index') {
    return 'index';
  }

  // Check for exact matches
  for (const name of APP_TAB_ROUTE_NAMES) {
    if (clean === name || clean === `(app)/${name}` || clean.endsWith(`/${name}`)) {
      return name as AppTabRouteName;
    }
  }

  // 3. Fuzzy matches (check if clean starts with or contains route name)
  for (const name of APP_TAB_ROUTE_NAMES) {
    if (name !== 'index' && (clean.includes(name) || clean.startsWith(name))) {
      return name as AppTabRouteName;
    }
  }

  return 'index';
}

export default function AppTabLayout() {
  const roleTabs = getTabsForRole(CURRENT_ROLE);
  const initialRouteName = getInitialRouteNameForRole(CURRENT_ROLE);
  const segments = useSegments();
  const pathname = usePathname();

  const segmentsRef = useRef(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

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

      const currentTabName = getCurrentTabNameNormalized(segmentsRef.current, pathnameRef.current);
      let currentIndex = activeTabNames.indexOf(currentTabName);

      console.log('[AppTabLayout Debug]', {
        segments: segmentsRef.current,
        pathname: pathnameRef.current,
        currentTab: currentTabName,
        activeTabNames,
        currentIndex
      });

      if (currentIndex === -1) {
        console.warn('[AppTabLayout] Current tab name not found in active tabs list. Falling back to POS (index 0).', currentTabName);
        currentIndex = 0; // Graceful fallback to guarantee no dead ends
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
