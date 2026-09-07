import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

/**
 * Web-only CSS properties (outlineStyle, transition, whiteSpace, cursor, ...)
 * typed as React Native styles.
 *
 * React Native Web accepts these at runtime but they are absent from the
 * React Native style types, so they would otherwise need an `any` cast at
 * every call site. One helper per style family keeps the casts contained.
 */
export function webViewStyle(style: Record<string, unknown>): ViewStyle {
  return style as unknown as ViewStyle;
}

export function webTextStyle(style: Record<string, unknown>): TextStyle {
  return style as unknown as TextStyle;
}

export function webImageStyle(style: Record<string, unknown>): ImageStyle {
  return style as unknown as ImageStyle;
}

/** Removes the browser focus ring on web; a no-op on native. */
export const NO_OUTLINE: ViewStyle = webViewStyle({ outlineStyle: 'none' });
