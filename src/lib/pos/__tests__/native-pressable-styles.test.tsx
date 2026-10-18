import React, { forwardRef } from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { View, type PressableProps } from 'react-native';
import { bridgePressable } from '../native-pressable-styles';

// Stands in for NativeWind's Pressable: it records the props it is handed.
const seen: PressableProps[] = [];
const Base = forwardRef<View, PressableProps>((props, _ref) => { seen.push(props); return <View />; });
Base.displayName = 'Base';
const Bridged = bridgePressable(Base);

let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  seen.length = 0;
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('react-test-renderer is deprecated')) return;
  });
});
afterEach(async () => { await act(async () => { tree?.unmount(); }); tree = undefined; jest.restoreAllMocks(); });

test('a function style reaches the base as a plain style, and follows the press', async () => {
  const onPressIn = jest.fn();
  await act(async () => {
    tree = renderer.create(<Bridged onPressIn={onPressIn} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.5 : 1 })} />);
  });
  expect(seen.at(-1)?.style).toEqual({ flex: 1, opacity: 1 });
  await act(async () => { seen.at(-1)?.onPressIn?.({} as never); });
  expect(onPressIn).toHaveBeenCalledTimes(1);
  expect(seen.at(-1)?.style).toEqual({ flex: 1, opacity: 0.5 });
  await act(async () => { seen.at(-1)?.onPressOut?.({} as never); });
  expect(seen.at(-1)?.style).toEqual({ flex: 1, opacity: 1 });
});

test('a plain style and its handlers pass straight through', async () => {
  const onPressIn = jest.fn();
  await act(async () => { tree = renderer.create(<Bridged onPressIn={onPressIn} style={{ padding: 4 }} />); });
  expect(seen.at(-1)?.style).toEqual({ padding: 4 });
  expect(seen.at(-1)?.onPressIn).toBe(onPressIn);
});
