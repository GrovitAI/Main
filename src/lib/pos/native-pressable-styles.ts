import { createElement, forwardRef, useState, type ComponentType, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { Platform, Pressable, type GestureResponderEvent, type MouseEvent, type PressableProps, type View } from 'react-native';

type PressState = { pressed: boolean; hovered: boolean };
type AnyPressable = ComponentType<PressableProps & RefAttributes<View>>;

/**
 * A Pressable that works out a function style itself (task 249). On phones NativeWind wraps every
 * Pressable and reads `style` as plain style objects, so `style={({ pressed }) => …}` came out
 * empty: segmented choices lost `flex: 1`, buttons lost their size and padding. This bridge turns
 * the function into the style for the current press and hover state and hands NativeWind a
 * plain style. Plain styles pass straight through.
 */
export function bridgePressable(Base: AnyPressable): ForwardRefExoticComponent<PressableProps & RefAttributes<View>> {
  const Bridged = forwardRef<View, PressableProps>((props, ref) => {
    const [state, setState] = useState<PressState>({ pressed: false, hovered: false });
    const { style, onPressIn, onPressOut, onHoverIn, onHoverOut } = props;
    if (typeof style !== 'function') return createElement(Base, { ...props, ref });
    return createElement(Base, {
      ...props,
      ref,
      style: style(state),
      onPressIn: (e: GestureResponderEvent) => { setState((s) => ({ ...s, pressed: true })); onPressIn?.(e); },
      onPressOut: (e: GestureResponderEvent) => { setState((s) => ({ ...s, pressed: false })); onPressOut?.(e); },
      onHoverIn: (e: MouseEvent) => { setState((s) => ({ ...s, hovered: true })); onHoverIn?.(e); },
      onHoverOut: (e: MouseEvent) => { setState((s) => ({ ...s, hovered: false })); onHoverOut?.(e); },
    });
  });
  Bridged.displayName = 'BridgedPressable';
  return Bridged;
}

/**
 * Installs the bridge in NativeWind's component map, so every `<Pressable>` in the app uses it on
 * iOS and Android. The web keeps NativeWind's own handling, which supports function styles.
 */
export function installNativePressableStyles(): void {
  if (Platform.OS === 'web') return;
  // NativeWind registers Pressable when its components module first loads; load it now.
  /* eslint-disable @typescript-eslint/no-require-imports -- native-only internals, loaded lazily. */
  require('react-native-css-interop/dist/runtime/components');
  const { interopComponents } = require('react-native-css-interop/dist/runtime/native/api') as { interopComponents: Map<unknown, AnyPressable> };
  /* eslint-enable @typescript-eslint/no-require-imports */
  const current = interopComponents.get(Pressable);
  if (!current || current.displayName === 'BridgedPressable') return;
  interopComponents.set(Pressable, bridgePressable(current));
}
