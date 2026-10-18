import { createContext, createElement, forwardRef, useContext } from 'react';
import {
  Platform,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { cssInterop } from 'nativewind';
import { typography } from '@/lib/pos/brand';

// Kept separately so nested Text retains its parent's weight on native devices.
const FontReadyContext = createContext(false);
export const AppFontProvider = FontReadyContext.Provider;
const TextWeightContext = createContext<TextStyle['fontWeight']>('normal');

function nativeFace(weight: TextStyle['fontWeight']): string {
  const value = weight === 'bold' ? 700 : Number(weight ?? 400);
  if (value >= 700) return typography.faces.bold;
  if (value >= 600) return typography.faces.semibold;
  if (value >= 500) return typography.faces.medium;
  return typography.faces.regular;
}

function fontStyle(ready: boolean, style: TextStyle | undefined, weight: TextStyle['fontWeight']): TextStyle {
  if (!ready || style?.fontFamily) return {};
  if (Platform.OS === 'web') return { fontFamily: typography.family };
  // NativeWind resolves the weight first. Each native face is already weighted;
  // normal prevents the OS from synthesizing another bold over the bundled face.
  return { fontFamily: nativeFace(weight), fontWeight: 'normal' };
}

const AppText = forwardRef<NativeText, TextProps>(function AppText({ style, ...props }, ref) {
  const ready = useContext(FontReadyContext);
  const inheritedWeight = useContext(TextWeightContext);
  // Flatten only to read supplied typography; no StyleSheet styles are created.
  const supplied = StyleSheet.flatten(style);
  const weight = supplied?.fontWeight ?? inheritedWeight;
  return createElement(TextWeightContext.Provider, { value: weight },
    createElement(NativeText, { ...props, ref, style: [style, fontStyle(ready, supplied, weight)] }));
});

const AppTextInput = forwardRef<NativeTextInput, TextInputProps>(function AppTextInput({ style, ...props }, ref) {
  const ready = useContext(FontReadyContext);
  const supplied = StyleSheet.flatten(style);
  return createElement(NativeTextInput, {
    ...props,
    ref,
    style: [style, fontStyle(ready, supplied, supplied?.fontWeight)],
  });
});

// Keep className styling, events, accessibility props and native instance refs.
export const Text = cssInterop(AppText, { className: 'style' });
export const TextInput = cssInterop(AppTextInput, { className: 'style' });
export type Text = NativeText;
export type TextInput = NativeTextInput;
