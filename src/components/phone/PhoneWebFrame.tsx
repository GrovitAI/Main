import React from 'react';
import { Platform, View } from 'react-native';
import { colors } from '@/lib/pos/brand';

/**
 * Widest the phone layout is allowed to grow on the web.
 *
 * The phone screens are laid out for a handset, so letting them fill a browser
 * window stretches every control across the viewport. Capping the column keeps
 * the proportions the screens were designed for and leaves the surplus width as
 * a gutter.
 */
export const PHONE_WEB_MAX_WIDTH = 480;

type PhoneWebFrameProps = {
  /** True while the phone layout is the one being rendered. */
  active: boolean;
  children: React.ReactNode;
};

/**
 * Centres the phone layout in a fixed-width column when it is shown in a
 * browser. On native, and whenever the tablet/desktop layout is active, the
 * children are returned untouched so nothing else changes.
 *
 * A handset browser is narrower than the cap, so the frame is invisible there;
 * it only takes effect once the window is wider than the column.
 */
export function PhoneWebFrame({ active, children }: PhoneWebFrameProps) {
  if (Platform.OS !== 'web' || !active) {
    return <>{children}</>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceTint, alignItems: 'center' }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: PHONE_WEB_MAX_WIDTH,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}
