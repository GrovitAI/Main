import { act, createElement, Fragment, type ReactElement } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useActiveInterval } from '@/lib/pos/use-active-interval';

// Jest Expo supplies the renderer; describe only the API used by this test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (element: ReactElement) => {
    update: (element: ReactElement) => void;
    unmount: () => void;
  };
};

type Props = { tick: () => void | Promise<void>; focused: boolean; intervalMs?: number; pollKey?: string };

function Poller({ tick, focused, intervalMs = 10_000, pollKey }: Props): null {
  useActiveInterval(tick, intervalMs, { focused, pollKey });
  return null;
}

let tree: ReturnType<typeof renderer.create> | undefined;
const listeners = new Set<(state: AppStateStatus) => void>();
let remove: jest.Mock;

async function mount(props: Props): Promise<void> {
  await act(async () => { tree = renderer.create(createElement(Poller, props)); });
}

async function advance(ms: number): Promise<void> {
  await act(async () => { jest.advanceTimersByTime(ms); });
}

async function transition(state: AppStateStatus): Promise<void> {
  AppState.currentState = state;
  await act(async () => { listeners.forEach((listener) => listener(state)); });
}

beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); remove(); } };
  });
  // React 19 deprecates this renderer, which remains the Expo Jest renderer.
  const originalError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('react-test-renderer is deprecated')) return;
    originalError(...args);
  });
});

afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  listeners.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('waits for a slow request instead of issuing overlapping polls', async () => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const tick = jest.fn(() => pending);
  await mount({ tick, focused: true });
  await advance(10_000);
  await advance(40_000);
  expect(tick).toHaveBeenCalledTimes(1);
  await act(async () => { finish?.(); });
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

test('stops while backgrounded and refreshes once on return', async () => {
  const tick = jest.fn();
  await mount({ tick, focused: true });
  await transition('background');
  await advance(60_000);
  expect(tick).not.toHaveBeenCalled();
  await transition('active');
  expect(tick).toHaveBeenCalledTimes(1);
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

test('does not poll when mounted in the background or unfocused', async () => {
  const tick = jest.fn();
  AppState.currentState = 'background';
  await mount({ tick, focused: true });
  await advance(60_000);
  expect(tick).not.toHaveBeenCalled();
  await act(async () => { tree?.update(createElement(Poller, { tick, focused: false })); });
  await transition('active');
  await advance(60_000);
  expect(tick).not.toHaveBeenCalled();
});

test('a pending request stays protected across focus and foreground changes', async () => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const tick = jest.fn(() => pending);
  await mount({ tick, focused: true });
  await advance(10_000);
  await transition('background');
  await transition('active');
  await act(async () => { tree?.update(createElement(Poller, { tick, focused: false })); });
  await act(async () => { tree?.update(createElement(Poller, { tick, focused: true })); });
  await advance(20_000);
  expect(tick).toHaveBeenCalledTimes(1);
  await act(async () => { finish?.(); });
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

test('a failed poll releases the guard for the next attempt', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const tick = jest.fn<Promise<void>, []>()
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValue(undefined);
  await mount({ tick, focused: true });
  await advance(10_000);
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

test('uses the latest callback and cadence and cleans up on unmount', async () => {
  const tick = jest.fn();
  const nextTick = jest.fn();
  await mount({ tick, focused: true });
  await act(async () => {
    tree?.update(createElement(Poller, { tick: nextTick, focused: true, intervalMs: 60_000 }));
  });
  await advance(10_000);
  expect(nextTick).not.toHaveBeenCalled();
  await advance(50_000);
  expect(nextTick).toHaveBeenCalledTimes(1);
  expect(tick).not.toHaveBeenCalled();
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  await advance(60_000);
  expect(nextTick).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalled();
});

test('four mounted Orders copies share one poll per interval, including resume', async () => {
  const tick = jest.fn(async () => undefined);
  await act(async () => {
    tree = renderer.create(createElement(Fragment, null,
      ...Array.from({ length: 4 }, (_, key) => createElement(Poller, {
        key, tick, focused: true, pollKey: 'orders-test',
      })),
    ));
  });
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(1);
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(2);
  await transition('background');
  await advance(60_000);
  await transition('active');
  expect(tick).toHaveBeenCalledTimes(3);
});

test('a second screen cannot duplicate a pending poll after the first unmounts', async () => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const tick = jest.fn(() => pending);
  await mount({ tick, focused: true, pollKey: 'handoff-test' });
  await advance(10_000);
  await act(async () => { tree?.unmount(); });
  await mount({ tick, focused: true, pollKey: 'handoff-test' });
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(1);
  await act(async () => { finish?.(); });
  await advance(10_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

test('switching to screen-local history does not reuse the shared active-order budget', async () => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const activeTick = jest.fn(() => pending);
  const historyTick = jest.fn();
  await mount({ tick: activeTick, focused: true, pollKey: 'switch-test' });
  await advance(10_000);
  await act(async () => {
    tree?.update(createElement(Poller, { tick: historyTick, focused: true }));
  });
  await advance(10_000);
  expect(historyTick).toHaveBeenCalledTimes(1);
  await act(async () => { finish?.(); });
});
