/**
 * lucide-react-native ships ESM-only .mjs files that the jest-expo preset does
 * not transform. The tab configuration only uses these as opaque icon values,
 * so a Proxy returning a stub per icon name keeps the module out of the way.
 */
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import { getTabsForRole, MOBILE_TABS } from '../tab-config';
import type { UserRole } from '../session-context';

const namesFor = (role: UserRole, isPhone: boolean): string[] =>
  getTabsForRole(role, isPhone).map((tab) => tab.name);

describe('getTabsForRole on phones', () => {
  it('gives owners and admins the full mobile tab set', () => {
    const expected = MOBILE_TABS.map((tab) => tab.name);
    expect(namesFor('owner', true)).toEqual(expected);
    expect(namesFor('admin', true)).toEqual(expected);
  });

  it.each<UserRole>(['manager', 'cashier'])(
    'hides tenant administration from a %s',
    (role) => {
      const names = namesFor(role, true);
      expect(names).not.toContain('staff');
      expect(names).not.toContain('branches');
    }
  );

  it('still gives managers and cashiers somewhere to work', () => {
    for (const role of ['manager', 'cashier'] as UserRole[]) {
      const names = namesFor(role, true);
      expect(names).toEqual(['analytics', 'inventory', 'menu', 'settings']);
    }
  });

  it('leaves the kitchen role on its own two tabs', () => {
    expect(namesFor('kitchen', true)).toEqual(['kitchen', 'settings']);
  });

  it('excludes POS and orders for every role, which phones do not carry', () => {
    for (const role of ['owner', 'admin', 'manager', 'cashier'] as UserRole[]) {
      const names = namesFor(role, true);
      expect(names).not.toContain('index');
      expect(names).not.toContain('orders');
    }
  });
});

describe('getTabsForRole on tablets and desktop', () => {
  it('is unaffected by the phone-only restriction', () => {
    expect(namesFor('manager', false)).toContain('index');
    expect(namesFor('cashier', false)).toContain('orders');
    expect(namesFor('owner', false)).toContain('staff');
    expect(namesFor('owner', false)).toContain('branches');
  });

  it('keeps POS away from owners, who bill through a cashier account', () => {
    expect(namesFor('owner', false)).not.toContain('index');
  });
});
