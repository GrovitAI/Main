import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { installNativePressableStyles } from '../native-pressable-styles';

// NativeWind skips registering its components under Jest; register them as the app does.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-css-interop/dist/runtime/components');

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => { await act(async () => { tree?.unmount(); }); tree = undefined; jest.restoreAllMocks(); });

/** The style the native view ends up with for a Pressable styled by a function. */
async function hostStyle(): Promise<Record<string, unknown>> {
  await act(async () => {
    tree = renderer.create(<Pressable style={({ pressed }) => ({ flex: 1, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}><Text>Today</Text></Pressable>);
  });
  const host = tree?.root.findAll((node) => typeof node.type === 'string' && node.props.accessible !== undefined)[0];
  return (StyleSheet.flatten(host?.props.style) ?? {}) as Record<string, unknown>;
}

test('on a phone, a Pressable keeps the layout from its function style', async () => {
  expect(Platform.OS).not.toBe('web');
  installNativePressableStyles();
  const style = await hostStyle();
  expect(style.flex).toBe(1);
  expect(style.paddingVertical).toBe(4);
});
