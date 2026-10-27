import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useReducedMotion } from '@/components/kitchen/ui';
import { playEntrance, webMotionNode } from '@/lib/pos/web-motion';

type TabNavigation = {
  addListener: (event: 'focus' | 'blur', callback: () => void) => () => void;
  getState: () => { routes: readonly { key: string }[] };
};

/**
 * How a tab change looks (task 291): the tab being opened fades in, and on a phone slides 16 px in
 * from the side of the tab that was tapped. Only the arriving tab moves and nothing is drawn
 * again: in a browser the browser plays it (web-motion.ts), on a phone Animated runs natively.
 * The navigator's own tab animation kept the tab being left awake and redrew both, which on the
 * POS and Analytics cost more than the switch itself. Reduce Motion switches at once.
 *
 * Used as a tab navigator's `screenLayout`; `lastIndex` is shared by the navigator's tabs.
 */
export function TabScene({ children, navigation, routeKey, slide, lastIndex }: {
  children: React.ReactNode;
  navigation: TabNavigation;
  routeKey: string;
  slide: boolean;
  lastIndex: React.MutableRefObject<number | null>;
}) {
  const reduce = useReducedMotion();
  const view = useRef<View>(null);
  const progress = useRef(new Animated.Value(1)).current;
  const offset = useRef(new Animated.Value(0)).current;
  const shift = useRef(Animated.multiply(Animated.subtract(1, progress), offset)).current;
  const live = useRef({ reduce, slide });
  live.current = { reduce, slide };

  useEffect(() => {
    const offFocus = navigation.addListener('focus', () => {
      const index = navigation.getState().routes.findIndex((r) => r.key === routeKey);
      const before = lastIndex.current;
      lastIndex.current = index;
      const web = webMotionNode(view.current);
      // The first tab shown when the app opens simply appears.
      if (before === null || before === index || live.current.reduce) {
        if (web) web.style.opacity = ''; else progress.setValue(1);
        return;
      }
      const dx = live.current.slide ? (index > before ? 16 : -16) : 0;
      if (web) { playEntrance(web, dx, 200); return; }
      offset.setValue(dx);
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    // Hidden once another tab is open, so it waits at its start out of sight.
    const offBlur = navigation.addListener('blur', () => {
      if (live.current.reduce) return;
      const web = webMotionNode(view.current);
      if (web) web.style.opacity = '0'; else progress.setValue(0);
    });
    return () => { offFocus(); offBlur(); };
  }, [navigation, routeKey, lastIndex, progress, offset]);

  if (Platform.OS === 'web') return <View ref={view} style={{ flex: 1 }}>{children}</View>;
  return <Animated.View style={{ flex: 1, opacity: progress, transform: [{ translateX: shift }] }}>{children}</Animated.View>;
}
