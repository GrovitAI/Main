/**
 * On a phone every route file is loaded when the app starts, so one line that
 * only works in a browser (a bare `document`, a missing global) takes the
 * whole app down before the login screen shows. This loads each route the way
 * the native app does and fails if any of them throws while loading.
 */
const ROUTES: [string, () => unknown][] = [
  ['_layout', () => require('@/app/_layout')],
  ['(auth)/_layout', () => require('@/app/(auth)/_layout')],
  ['(auth)/login', () => require('@/app/(auth)/login')],
  ['(app)/_layout', () => require('@/app/(app)/_layout')],
  ['(app)/index', () => require('@/app/(app)/index')],
  ['(app)/orders', () => require('@/app/(app)/orders')],
  ['(app)/kitchen', () => require('@/app/(app)/kitchen')],
  ['(app)/inventory', () => require('@/app/(app)/inventory')],
  ['(app)/settings', () => require('@/app/(app)/settings')],
  ['(app)/dashboard', () => require('@/app/(app)/dashboard')],
  ['(app)/analytics', () => require('@/app/(app)/analytics')],
  ['(app)/finance', () => require('@/app/(app)/finance')],
  ['(app)/staff', () => require('@/app/(app)/staff')],
  ['(app)/branches', () => require('@/app/(app)/branches')],
  ['(app)/billing', () => require('@/app/(app)/billing')],
  ['(app)/menu', () => require('@/app/(app)/menu')],
];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The stylesheet is compiled by Metro, not Jest.
jest.mock('../../../../global.css', () => ({}));

// lucide-react-native ships ESM that Jest does not transform; every icon
// renders as an inert view.
jest.mock('lucide-react-native', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        const Icon = () => React.createElement(View, null);
        Icon.displayName = String(name);
        return Icon;
      },
    },
  );
});

describe('native route loading', () => {
  it.each(ROUTES)('%s loads without throwing', (_name, load) => {
    expect(load).not.toThrow();
  });
});
