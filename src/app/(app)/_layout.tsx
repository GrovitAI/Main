import { Tabs, router, useSegments, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, Text, Pressable, LayoutAnimation, Animated, Easing } from 'react-native';
import { UIContext } from '@/lib/pos/ui-context';

import { colors } from '@/lib/pos/brand';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { ActivityIndicator, StyleSheet, Image } from 'react-native';
import { ChevronDown, MapPin, Layers, User } from 'lucide-react-native';
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
  inventory: '/inventory',
  settings: '/settings',
  dashboard: '/dashboard',
  analytics: '/analytics',
  billing: '/billing',
};

function CustomTabBar({ state, descriptors, navigation, roleTabs, tabBarHidden }: any) {
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

  // Hide / show animation for the tab bar (initialize to 1 if already hidden on mount)
  const hideAnim = useRef(new Animated.Value(tabBarHidden ? 1 : 0)).current; // 0 = visible, 1 = hidden
  useEffect(() => {
    Animated.timing(hideAnim, {
      toValue: tabBarHidden ? 1 : 0,
      duration: 280,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [tabBarHidden, hideAnim]);

  const tabBarTranslateY = hideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120], // slide down out of view
  });
  const tabBarOpacity = hideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.4, 0],
  });

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
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: layout.x,
            stiffness: 160,
            damping: 20,
            mass: 0.8,
            useNativeDriver: false,
          }),
          Animated.spring(widthAnim, {
            toValue: layout.width,
            stiffness: 160,
            damping: 20,
            mass: 0.8,
            useNativeDriver: false,
          }),
        ]).start();
      }
    }
  }, [activeTabName, tabLayouts]);

  return (
    <Animated.View
      pointerEvents={tabBarHidden ? 'none' : 'auto'}
      style={{
        transform: [{ translateY: tabBarTranslateY }],
        opacity: tabBarOpacity,
      }}
    >
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      height: 64,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'space-around',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 10,
      position: 'absolute',
      bottom: 24,
      alignSelf: 'center',
      width: Platform.OS === 'web' ? 840 : '92%',
      maxWidth: '92%',
      zIndex: 100,
      transform: [
        {
          translateX: (Platform.OS === 'web' && activeTabName === 'index') ? -105 : 0
        }
      ] as any,
    }}>
      {/* Sliding Highlight Backdrop Pill */}
      {tabLayouts[activeTabName] && (
        <Animated.View
          style={{
            position: 'absolute',
            left: slideAnim,
            width: widthAnim,
            height: 44,
            borderRadius: 16,
            backgroundColor: colors.primary, // Brand blue highlighted covering
            zIndex: 1,
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
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: hovered ? 'rgba(15, 23, 42, 0.02)' : 'transparent',
              transform: [{ scale: pressed ? 0.96 : (hovered ? 1.02 : 1) }],
              zIndex: 3,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any)}
          >
            <TabIcon
              color={isFocused ? '#FFFFFF' : '#64748B'}
              size={isFocused ? 18 : 17}
              style={{ transform: [{ scale: isFocused ? 1.05 : 1 }] } as any}
            />
            <Text style={{
              color: isFocused ? '#FFFFFF' : '#64748B',
              fontWeight: isFocused ? '700' : '500',
              fontSize: isFocused ? 12 : 11.5,
              marginLeft: isFocused ? 8 : 6,
              letterSpacing: isFocused ? 0.1 : 0,
            }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
    </Animated.View>
  );
}

export default function AppTabLayout() {
  const { session } = useSessionStore();
  const segments = useSegments();
  const pathname = usePathname();

  // Compute role-based tabs (safe: getTabsForRole handles null/undefined gracefully)
  const roleTabs = session ? getTabsForRole(session.role) : [];

  // tabBarHidden is controlled exclusively by individual screens via useTabBarHidden().
  // index.tsx sets it to true during the splash video and restores it to false when done.
  // We use window.location.pathname (available synchronously before Expo Router hydration)
  // to correctly detect if we booted at the root '/' route — the only case where the
  // splash video runs and the tab bar should start hidden.
  const isRootBoot = Platform.OS === 'web' && typeof window !== 'undefined'
    ? (() => {
        const p = window.location.pathname.replace(/\/+$/, '') || '/';
        return p === '/' || p === '/index';
      })()
    : true; // on native, always start hidden (splash runs on every boot)
  const [tabBarHidden, setTabBarHidden] = useState(isRootBoot);

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

  const setBranchScope = useSessionStore((s) => s.setBranchScope);

  // ── All hooks are above this line. Early return is safe here. ──
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0066b2" />
      </View>
    );
  }

  const initialRouteName = getInitialRouteNameForRole(session.role);
  const showHeader = session.role === 'owner' || session.role === 'admin';


  return (
    <UIContext.Provider value={{ tabBarHidden, setTabBarHidden }}>
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        {showHeader && (
          <GlobalHeader
            session={session}
            setBranchScope={setBranchScope}
          />
        )}
        <View style={{ flex: 1 }}>
          <Tabs
            initialRouteName={initialRouteName}
            tabBar={(props) => <CustomTabBar {...props} roleTabs={roleTabs} tabBarHidden={tabBarHidden} />}
            screenOptions={{
              headerShown: false,
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
                    headerShown: false,
                    tabBarIcon: ({ color, size }) => (
                      <TabIcon color={color} size={size} />
                    ),
                  }}
                />
              );
            })}
          </Tabs>
        </View>
      </View>
    </UIContext.Provider>
  );
}

// ─── Global Header & Branch Selector Dropdown ───────────────────────────────────

const headerLogo = require('@/../assets/images/le-leban-logo.png') as number;

function GlobalHeader({ session, setBranchScope }: { session: any; setBranchScope: any }) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (!session) return null;
  const currentScope = session.branchScope;

  const currentLabel = currentScope.mode === 'all'
    ? 'All Branches'
    : (session.accessibleBranches.find((b: any) => b.id === currentScope.branchId)?.name || 'Home Branch');

  const handleSelectBranch = (branchId: string | 'all') => {
    if (branchId === 'all') {
      setBranchScope({ mode: 'all' });
    } else {
      setBranchScope({ mode: 'single', branchId });
    }
    setMenuOpen(false);
  };

  return (
    <View style={styles.headerContainer}>
      {/* Left side: Logo and Role Badge */}
      <View style={styles.leftSection}>
        <Image
          source={headerLogo}
          style={{ width: 56, height: 26 }}
          resizeMode="contain"
          accessibilityLabel="Le Leban Logo"
        />
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{session.role.toUpperCase()}</Text>
        </View>
      </View>

      {/* Right side: Branch Selector and Profile Card */}
      <View style={styles.rightSection}>
        {/* Branch Selector Dropdown Trigger */}
        <View style={{ zIndex: 10001 }}>
          <Pressable
            onPress={() => setMenuOpen(!menuOpen)}
            style={styles.branchSelectorTrigger}
          >
            {currentScope.mode === 'all' ? (
              <Layers size={13} color="#0066b2" />
            ) : (
              <MapPin size={13} color="#0066b2" />
            )}
            <Text style={styles.branchSelectorText}>{currentLabel}</Text>
            <ChevronDown size={12} color="#64748B" />
          </Pressable>

          {/* Popover Dropdown Menu */}
          {menuOpen && (
            <>
              {/* Pressable Backdrop to click outside and close */}
              <Pressable
                style={styles.backdrop}
                onPress={() => setMenuOpen(false)}
              />
              <View style={styles.dropdownMenu}>
                <Text style={styles.dropdownHeader}>Switch Branch Scope</Text>
                
                {/* Option: All Branches */}
                <Pressable
                  onPress={() => handleSelectBranch('all')}
                  style={[
                    styles.dropdownItem,
                    currentScope.mode === 'all' && styles.dropdownItemActive
                  ]}
                >
                  <Layers size={13} color={currentScope.mode === 'all' ? '#0066b2' : '#64748B'} />
                  <Text style={[
                    styles.dropdownItemText,
                    currentScope.mode === 'all' && styles.dropdownItemTextActive
                  ]}>All Branches (Aggregation)</Text>
                </Pressable>

                <View style={styles.dropdownDivider} />

                {/* Option: Individual Branches */}
                {session.accessibleBranches.map((branch: any) => {
                  const isActive = currentScope.mode === 'single' && currentScope.branchId === branch.id;
                  return (
                    <Pressable
                      key={branch.id}
                      onPress={() => handleSelectBranch(branch.id)}
                      style={[
                        styles.dropdownItem,
                        isActive && styles.dropdownItemActive
                      ]}
                    >
                      <MapPin size={13} color={isActive ? '#0066b2' : '#64748B'} />
                      <Text style={[
                        styles.dropdownItemText,
                        isActive && styles.dropdownItemTextActive
                      ]}>{branch.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* Profile Chip */}
        <View style={styles.profileChip}>
          <User size={12} color="#64748B" />
          <Text style={styles.profileText}>{session.displayName}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    zIndex: 9999,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      },
      default: {
        elevation: 2,
      }
    })
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E40AF',
    letterSpacing: 0.5,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  branchSelectorTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
    height: 34,
    cursor: 'pointer' as any,
  },
  branchSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  backdrop: {
    position: 'absolute',
    top: -100,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: 9999,
    backgroundColor: 'transparent',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 40,
    right: 0,
    width: 240,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      },
      default: {
        elevation: 5,
      }
    }),
    zIndex: 10000,
  },
  dropdownHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    cursor: 'pointer' as any,
  },
  dropdownItemActive: {
    backgroundColor: '#F0F9FF',
  },
  dropdownItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  dropdownItemTextActive: {
    color: '#0066b2',
    fontWeight: '700',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
    height: 34,
  },
  profileText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
});

