import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { semantic } from '@/lib/pos/brand';

/**
 * Whether this build talks to the staging copy of the database rather than
 * the live one. Set by EXPO_PUBLIC_APP_ENV=staging in .env.development.local
 * (docs/STAGING.md); a production build never carries it.
 */
export const IS_STAGING = (process.env.EXPO_PUBLIC_APP_ENV ?? '').trim().toLowerCase() === 'staging';

/**
 * A small "Test data" tag at the top centre of every screen while the app is
 * on the test database, so nobody mistakes a trial entry for a real one. It
 * floats over the screen without taking space or catching taps, flush with
 * the top edge so it stays clear of page titles (task 216). Renders nothing
 * on the live database.
 */
export function TestDatabaseBanner() {
  const insets = useSafeAreaInsets();
  if (!IS_STAGING) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top, left: 0, right: 0, alignItems: 'center', zIndex: 50 }}>
      <View
        accessible
        accessibilityLabel="Test database. Nothing here reaches the live business."
        className="px-2"
        style={{ backgroundColor: semantic.warningSoft, borderWidth: 1, borderTopWidth: 0, borderColor: semantic.warning, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, opacity: 0.9 }}
      >
        <Text className="text-[9px] font-bold" style={{ color: semantic.warning, letterSpacing: 0.4, lineHeight: 12 }}>TEST DATA</Text>
      </View>
    </View>
  );
}
