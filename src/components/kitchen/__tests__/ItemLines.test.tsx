/* eslint-disable @typescript-eslint/no-require-imports -- Jest mock factories need isolated imports. */
import React from 'react';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { ItemLines } from '../EntryLines';
import type { KitchenItem } from '@/lib/pos/kitchen-types';
import type { DraftLine, DraftLines } from '../forms';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('lucide-react-native', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return new Proxy({}, { get: (_target, name) => name === '__esModule' ? true : () => React.createElement(View) });
});
jest.mock('@/lib/pos/kitchen-haptics', () => ({ buzz: jest.fn() }));

const milk: KitchenItem = {
  id: 'milk', name: 'Milk', unit: 'L', sell_price: 60, stock: 12, is_active: true, updated_at: '', item_kind: 'raw_material',
} as KitchenItem;
const cups: KitchenItem = {
  id: 'cups', name: 'Cups', unit: 'pcs', sell_price: null, stock: 300, is_active: true, updated_at: '', item_kind: 'raw_material',
} as KitchenItem;
const items = new Map<string, KitchenItem>([[milk.id, milk], [cups.id, cups]]);

let tree: ReactTestRenderer | undefined;

async function mount(typed: boolean, lines: DraftLines, onType = jest.fn(), onOpen = jest.fn(), focusItemId: string | null = null): Promise<void> {
  await act(async () => {
    tree = renderer.create(
      <ItemLines items={items} lines={lines} order={Object.keys(lines)} onChange={jest.fn()} active={null} onOpen={onOpen}
        showAmounts typed={typed} onType={onType} focusItemId={focusItemId} />,
    );
  });
}

function inputs(): ReactTestInstance[] {
  if (!tree) throw new Error('Lines are not mounted');
  return tree.root.findAll((node) => typeof node.props.onChangeText === 'function' && typeof node.props.accessibilityLabel === 'string' && typeof node.type === 'string');
}

function input(label: string): ReactTestInstance {
  const found = inputs().find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`No box labelled ${label}`);
  return found;
}

/** Calls a handler prop on a rendered node (test-renderer props are untyped). */
function fire(node: ReactTestInstance | undefined, prop: 'onChangeText' | 'onPress', ...args: unknown[]): void {
  const handler: unknown = node?.props[prop];
  if (typeof handler !== 'function') throw new Error(`No ${prop} handler`);
  handler(...args);
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
});

afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
});

describe('item lines typed on a computer (task 293)', () => {
  it('takes the quantity and the rate typed straight in', async () => {
    const onType = jest.fn<void, [string, DraftLine]>();
    await mount(true, { milk: { qty: 0, price: 60 } }, onType);
    await act(async () => { fire(input('Milk quantity in L'), 'onChangeText', '2.5'); });
    expect(onType).toHaveBeenLastCalledWith('milk', { qty: 2.5, price: 60 });
    await act(async () => { fire(input('Milk rate per L'), 'onChangeText', '62.75'); });
    expect(onType).toHaveBeenLastCalledWith('milk', { qty: 0, price: 62.75 });
  });

  it('drops what is not a number, and keeps whole pieces whole', async () => {
    const onType = jest.fn<void, [string, DraftLine]>();
    await mount(true, { cups: { qty: 0, price: null } }, onType);
    await act(async () => { fire(input('Cups quantity in pcs'), 'onChangeText', '12.7 pcs'); });
    expect(onType).toHaveBeenLastCalledWith('cups', { qty: 12, price: null });
    await act(async () => { fire(input('Cups rate per pcs'), 'onChangeText', ''); });
    expect(onType).toHaveBeenLastCalledWith('cups', { qty: 0, price: null });
  });

  it('puts the cursor in the quantity of the line just added', async () => {
    await mount(true, { milk: { qty: 1, price: 60 }, cups: { qty: 0, price: null } }, jest.fn(), jest.fn(), 'cups');
    expect(input('Cups quantity in pcs').props.autoFocus).toBe(true);
    expect(input('Milk quantity in L').props.autoFocus).toBeFalsy();
  });

  it('keeps the pad on a phone: no typed boxes, a tap opens the pad', async () => {
    const onOpen = jest.fn();
    await mount(false, { milk: { qty: 1, price: 60 } }, jest.fn(), onOpen);
    expect(inputs()).toHaveLength(0);
    if (!tree) throw new Error('Lines are not mounted');
    const qty = tree.root.findAll((node) => node.props.accessibilityLabel === 'Milk quantity 1 L' && typeof node.props.onPress === 'function')[0];
    await act(async () => { fire(qty, 'onPress'); });
    expect(onOpen).toHaveBeenCalledWith('milk', 'qty');
  });
});
