import { Tabs, router, useSegments, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, Text, Pressable, LayoutAnimation, Animated, Easing } from 'react-native';

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

const TAB_ROUTE_MAP: Record<AppTabRouteName, string> = {
  index: '/',
  orders: '/orders',
  kitchen: '/kitchen',
  finance: '/finance',
  settings: '/settings',
  dashboard: '/dashboard',
  analytics: '/analytics',
  billing: '/billing',
};

function CustomTabBar({ state, descriptors, navigation, roleTabs }: any) {
  const activeTabNames = APP_TAB_ROUTE_NAMES.filter(name =>
    roleTabs.some((tab: any) => tab.name === name)
  );

  const activeTabName = state.routes[state.index]?.name;

  // Dictionary to store tab button layouts
  const [tabLayouts, setTabLayouts] = useState<Record<string, { x: number; width: number }>>({});

  // Animated values for horizontal sliding and width morphing
  const slideAnim = useRef(new Animated.Value(0)).current;
  const widthAnim = useRef(new Animated.Value(0)).current;
  const hasInitialPosition = useRef(false);

  // Trigger smooth layout animations on active tab index switch
  useEffect(() => {
    LayoutAnimation.configureNext({
      duration: 250,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
  }, [state.index]);

  // Animate the highlighter elements smoothly and continuously
  useEffect(() => {
    const layout = tabLayouts[activeTabName];
    if (layout) {
      if (!hasInitialPosition.current) {
        // Set initial positions instantly without delay on first load
        slideAnim.setValue(layout.x);
        widthAnim.setValue(layout.width);
        hasInitialPosition.current = true;
      } else {
        // Snappy, organic cubic-bezier curve similar to modern device UI physics
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: layout.x,
            duration: 280,
            easing: Easing.bezier(0.16, 1, 0.3, 1), // easeOutExpo feel
            useNativeDriver: false,
          }),
          Animated.timing(widthAnim, {
            toValue: layout.width,
            duration: 280,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            useNativeDriver: false,
          }),
        ]).start();
      }
    }
  }, [activeTabName, tabLayouts]);

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#FFFFFF',
      borderTopWidth: 1,
      borderTopColor: '#EEF2F6',
      height: 72,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'space-around',
      shadowColor: '#0D264C',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.05,
      shadowRadius: 14,
      elevation: 12,
      position: 'relative',
    }}>
      {/* Sliding Highlight Backdrop Pill */}
      {tabLayouts[activeTabName] && (
        <Animated.View
          style={{
            position: 'absolute',
            left: slideAnim,
            width: widthAnim,
            height: 48,
            borderRadius: 12,
            backgroundColor: 'rgba(0, 102, 178, 0.08)',
            shadowColor: colors.primaryMid,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 2,
            zIndex: 1,
          }}
        />
      )}

      {/* Sliding Top Glowing Highlighter Line */}
      {tabLayouts[activeTabName] && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: slideAnim,
            width: widthAnim,
            height: 4,
            backgroundColor: colors.primary,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 4,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.35,
            shadowRadius: 5,
            elevation: 4,
            zIndex: 2,
          }}
        />
      )}

      {activeTabNames.map((tabName) => {
        const route = state.routes.find((r: any) => r.name === tabName);
        if (!route) return null;

        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index].name === tabName;
        const tabConfig = roleTabs.find((t: any) => t.name === tabName);
        if (!tabConfig) return null;

        const TabIcon = tabConfig.icon;
        const label = tabConfig.label;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={tabName}
            onPress={onPress}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              setTabLayouts((prev) => {
                if (prev[tabName]?.x === x && prev[tabName]?.width === width) {
                  return prev;
                }
                return {
                  ...prev,
                  [tabName]: { x, width },
                };
              });
            }}
            style={({ hovered, pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 12,
              backgroundColor: hovered ? 'rgba(2, 81, 184, 0.03)' : 'transparent',
              transform: [{ scale: pressed ? 0.95 : (hovered ? 1.03 : 1) }],
              zIndex: 3,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any)}
          >
            <TabIcon
              color={isFocused ? colors.primaryMid : '#7C8BA1'}
              size={isFocused ? 21 : 19}
              style={{ transform: [{ scale: isFocused ? 1.05 : 1 }] } as any}
            />
            <Text style={{
              color: isFocused ? colors.primaryMid : '#7C8BA1',
              fontWeight: isFocused ? '800' : '600',
              fontSize: isFocused ? 13.5 : 12.5,
              marginLeft: isFocused ? 10 : 8,
              letterSpacing: isFocused ? 0.2 : 0,
            }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
      const targetTabPath = TAB_ROUTE_MAP[targetTabName];
      console.log('[AppTabLayout] Navigating to tab:', targetTabName, 'via path:', targetTabPath);
      router.push(targetTabPath as any);
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [roleTabs]);

  return (
    <Tabs
      initialRouteName={initialRouteName}
      tabBar={(props) => <CustomTabBar {...props} roleTabs={roleTabs} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surfaceTint,
          borderBottomColor: colors.borderSoft,
        },
        headerTintColor: colors.primaryDeep,
        headerTitleStyle: { fontWeight: '700', color: colors.textPrimary },
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
