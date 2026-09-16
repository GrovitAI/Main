import { Platform } from 'react-native';
import type { ImageStyle, NativeSyntheticEvent, TargetedEvent, TextStyle, ViewStyle } from 'react-native';

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

/** The nearest ancestor that actually scrolls, or null when nothing above the element does. */
function scrollParentOf(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight + 1) return parent;
    parent = parent.parentElement;
  }
  return null;
}

/**
 * On the web, scrolls a field that just took focus to the middle of the
 * sheet or list it sits in, so a phone shows it above the keyboard without
 * the browser zooming to it. Only that container moves; the page behind a
 * sheet stays where it is. The short delay lets the keyboard settle first.
 * A no-op on native, where the keyboard avoider does this.
 */
export function centerFieldOnFocus(event: NativeSyntheticEvent<TargetedEvent>): void {
  if (Platform.OS !== 'web') return;
  const target = (event as unknown as { target?: unknown }).target;
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return;
  setTimeout(() => {
    const container = scrollParentOf(target);
    if (!container) return;
    const field = target.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const delta = field.top + field.height / 2 - (box.top + box.height / 2);
    if (Math.abs(delta) < 8) return;
    container.scrollBy({ top: delta, behavior: 'smooth' });
  }, 250);
}

/** Removes the browser focus ring on web; a no-op on native. */
export const NO_OUTLINE: ViewStyle = webViewStyle({ outlineStyle: 'none' });
