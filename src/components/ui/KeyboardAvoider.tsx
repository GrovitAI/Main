import React from 'react';
import { KeyboardAvoidingView, Platform, type ViewStyle } from 'react-native';

import { useVisualViewport } from '@/lib/pos/use-visual-viewport';

/**
 * Lifts its children clear of the on-screen keyboard.
 *
 * iOS needs the padding behaviour. Android resizes the window for us via the
 * default `softwareKeyboardLayoutMode`, and applying `behavior` there fights
 * that resize and produces a double shift. A phone browser is the awkward
 * one: its keyboard covers the page without resizing it, so here the
 * container shrinks to the browser's visual viewport while the keyboard is
 * up, which keeps a bottom sheet and its fields above the keys. On a desktop
 * browser nothing changes.
 *
 * Wrap the scrolling body of a form screen, or the backdrop of a modal that
 * contains a text input.
 */
export function KeyboardAvoider({
  children,
  offset = 0,
  style,
}: {
  children: React.ReactNode;
  /**
   * Extra space above the keyboard, in points. Use it when a header sits
   * above the avoided region and would otherwise be pushed off screen.
   */
  offset?: number;
  style?: ViewStyle;
}): React.ReactElement {
  const viewport = useVisualViewport();
  const webKeyboardStyle: ViewStyle | undefined =
    Platform.OS === 'web' && viewport.keyboardOpen ? { flex: 0, height: viewport.height, marginTop: viewport.offsetTop } : undefined;
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, webKeyboardStyle, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
