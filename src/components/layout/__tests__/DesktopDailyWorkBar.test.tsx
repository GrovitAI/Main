/* eslint-disable @typescript-eslint/no-require-imports -- Jest mock factories need isolated imports. */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { DesktopDailyWorkBar } from '../DesktopDailyWorkBar';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('lucide-react-native', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return new Proxy({}, { get: (_target, name) => name === '__esModule' ? true : () => React.createElement(View) });
});

const mediaListeners = new Set<() => void>();
const inputListeners = new Map<string, Set<() => void>>();
let reduced = false;
let tree: ReactTestRenderer | undefined;
let originalMedia: PropertyDescriptor | undefined;
let originalDocument: PropertyDescriptor | undefined;

function props(index = 0): BottomTabBarProps {
  const names = ['orders', 'inventory', 'analytics', 'more'];
  return {
    state: { stale: false, type: 'tab', key: 'tabs', index, routeNames: names,
      routes: names.map(name => ({ key: name, name })), history: [], preloadedRouteKeys: [] },
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() } as unknown as BottomTabBarProps['navigation'],
  };
}

async function mount(): Promise<void> {
  await act(async () => { tree = renderer.create(<DesktopDailyWorkBar {...props()} role="owner" hidden={false} />); });
}

function pill(): { style: { clipPath: string; transitionDuration: string }; 'aria-hidden': boolean; pointerEvents: string } {
  if (!tree) throw new Error('Navigation is not mounted');
  const node = tree.root.findAll(node => node.props.testID === 'desktop-active-pill')[0];
  const style = node?.props.style;
  if (!node || typeof style !== 'object' || style === null || !('clipPath' in style)
    || !('transitionDuration' in style) || typeof style.clipPath !== 'string'
    || typeof style.transitionDuration !== 'string') throw new Error('Active pill styles are missing');
  return { style: { clipPath: style.clipPath, transitionDuration: style.transitionDuration },
    'aria-hidden': node.props['aria-hidden'] === true, pointerEvents: String(node.props.pointerEvents) };
}

async function input(type: string): Promise<void> {
  await act(async () => { inputListeners.get(type)?.forEach(listener => listener()); });
}

beforeEach(() => {
  reduced = false;
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
    get matches() { return reduced; },
    addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  }) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    addEventListener: (type: string, listener: () => void) => {
      const listeners = inputListeners.get(type) ?? new Set<() => void>();
      listeners.add(listener); inputListeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: () => void) => inputListeners.get(type)?.delete(listener),
  } });
  const originalError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('react-test-renderer is deprecated')) return;
    originalError(...args);
  });
});

afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  mediaListeners.clear(); inputListeners.clear();
  if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  jest.restoreAllMocks();
});

test('honors reduced motion on mount and when the system preference changes', async () => {
  reduced = true;
  await mount();
  expect(pill().style.transitionDuration).toBe('0ms');
  await act(async () => { reduced = false; mediaListeners.forEach(listener => listener()); });
  expect(pill().style.transitionDuration).not.toBe('0ms');
  await act(async () => { reduced = true; mediaListeners.forEach(listener => listener()); });
  expect(pill().style.transitionDuration).toBe('0ms');
});

test('keyboard selection is instant and pointer use restores motion without duplicating controls', async () => {
  await mount();
  const initialClip = pill().style.clipPath;
  await input('keydown');
  await act(async () => { tree?.update(<DesktopDailyWorkBar {...props(1)} role="owner" hidden={false} />); });
  expect(pill().style.clipPath).not.toBe(initialClip);
  expect(pill().style.transitionDuration).toBe('0ms');
  expect(pill()['aria-hidden']).toBe(true);
  expect(pill().pointerEvents).toBe('none');
  await input('pointerdown');
  expect(pill().style.transitionDuration).not.toBe('0ms');
});

test('removes preference and input listeners on unmount', async () => {
  await mount();
  expect(mediaListeners.size).toBe(1);
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  expect(mediaListeners.size).toBe(0);
  expect(inputListeners.get('keydown')?.size).toBe(0);
  expect(inputListeners.get('pointerdown')?.size).toBe(0);
});
