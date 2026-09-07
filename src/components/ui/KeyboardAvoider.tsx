import React from 'react';
import { KeyboardAvoidingView, Platform, type ViewStyle } from 'react-native';

/**
 * Lifts its children clear of the on-screen keyboard.
 *
 * Only iOS needs this. Android resizes the window for us via the default
 * `softwareKeyboardLayoutMode`, and applying `behavior` there fights that
 * resize and produces a double shift. On web there is no software keyboard,
 * so the component is a transparent flex container everywhere but iOS.
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
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
