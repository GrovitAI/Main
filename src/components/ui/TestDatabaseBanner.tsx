import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { semantic } from '@/lib/pos/brand';

/**
 * Whether this build talks to the staging copy of the database rather than
 * the live one. Set by EXPO_PUBLIC_APP_ENV=staging in .env.development.local
 * (docs/STAGING.md); a production build never carries it.
 */
export const IS_STAGING = (process.env.EXPO_PUBLIC_APP_ENV ?? '').trim().toLowerCase() === 'staging';

/**
 * A strip across the top of every screen while the app is on the test
 * database, so nobody mistakes a trial entry for a real one, or the other way
 * round. Renders nothing on the live database.
 */
export function TestDatabaseBanner() {
  const insets = useSafeAreaInsets();
  if (!IS_STAGING) return null;
  return (
    <View
      style={{ backgroundColor: semantic.warning, paddingTop: insets.top }}
      accessibilityRole="alert"
      accessibilityLabel="Test database. Nothing here reaches the live business."
    >
      <Text className="px-3 py-1 text-center text-[11px] font-bold text-text-on-primary" numberOfLines={1}>
        TEST DATABASE · nothing here reaches the live business
      </Text>
    </View>
  );
}
