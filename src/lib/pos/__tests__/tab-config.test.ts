/**
 * lucide-react-native ships ESM-only .mjs files that the jest-expo preset does
 * not transform. The tab configuration only uses these as opaque icon values,
 * so a Proxy returning a stub per icon name keeps the module out of the way.
 */
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import { Platform } from 'react-native';
import { getDefaultHrefForRole, getDefaultHrefForSession, getInitialRouteNameForRole, getTabsForRole, isCentralKitchenSession, usesManagementTabs } from '../tab-config';
import type { UserRole } from '../session-context';

/**
 * Runs `body` with Platform.OS forced to `os`, then restores it.
 *
 * The tab set depends on the platform as well as the window width, and Jest
 * runs under a native platform by default, so every case says which one it means.
 */
function onPlatform<T>(os: typeof Platform.OS, body: () => T): T {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    return body();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
}

const namesFor = (role: UserRole, isPhone: boolean): string[] =>
  getTabsForRole(role, isPhone).map((tab) => tab.name);

/** Tab names in a browser, where the width decides the layout. */
const webNames = (role: UserRole, isPhone: boolean): string[] =>
  onPlatform('web', () => namesFor(role, isPhone));

/** Tab names in the installed app, at a width wide enough for the till layout. */
const nativeTabletNames = (role: UserRole): string[] =>
  onPlatform('ios', () => namesFor(role, false));

describe('getTabsForRole on phones', () => {
  it('gives owners and admins the full mobile tab set', () => {
    const expected = ['analytics', 'inventory', 'menu', 'staff', 'branches', 'settings'];
    expect(webNames('owner', true)).toEqual(expected);
    expect(webNames('admin', true)).toEqual(expected);
  });

  it.each<UserRole>(['manager', 'cashier'])(
    'hides tenant administration from a %s',
    (role) => {
      const names = webNames(role, true);
      expect(names).not.toContain('staff');
      expect(names).not.toContain('branches');
    }
  );

  it('still gives managers and cashiers somewhere to work', () => {
    expect(webNames('manager', true)).toEqual(['analytics', 'inventory', 'menu', 'settings']);
    expect(webNames('cashier', true)).toEqual(['analytics', 'inventory', 'menu', 'settings']);
  });

  it('defers finance on phones for managers as well as cashiers', () => {
    expect(webNames('cashier', true)).not.toContain('finance');
    expect(webNames('manager', true)).not.toContain('finance');
  });

  it('leaves the kitchen role on its own two tabs', () => {
    expect(webNames('kitchen', true)).toEqual(['kitchen', 'settings']);
    expect(webNames('kitchen', false)).toEqual(['kitchen', 'settings']);
  });

  it('keeps accountants on Settings while finance is deferred, with a valid home on every device', () => {
    expect(webNames('accountant', true)).toEqual(['settings']);
    expect(webNames('accountant', false)).toEqual(['settings']);
    expect(nativeTabletNames('accountant')).toEqual(['settings']);
    for (const os of ['web', 'ios', 'android'] as const) {
      onPlatform(os, () => {
        for (const isPhone of [true, false]) {
          expect(getDefaultHrefForRole('accountant', isPhone)).toBe('/(app)/settings');
          expect(getInitialRouteNameForRole('accountant', isPhone)).toBe('settings');
        }
      });
    }
  });

  it('excludes POS and orders for every role, which phones do not carry', () => {
    for (const role of ['owner', 'admin', 'manager', 'cashier'] as UserRole[]) {
      const names = webNames(role, true);
      expect(names).not.toContain('index');
      expect(names).not.toContain('orders');
    }
  });
});

describe('getTabsForRole on tablets and desktop browsers', () => {
  it('puts menu management one tap away for everyone who manages the menu', () => {
    for (const role of ['owner', 'admin', 'manager'] as const) {
      expect(webNames(role, false)).toContain('menu');
    }
    expect(webNames('cashier', false)).not.toContain('menu');
    expect(webNames('kitchen', false)).not.toContain('menu');
  });

  it('is unaffected by the phone-only restriction', () => {
    expect(webNames('manager', false)).toContain('index');
    expect(webNames('cashier', false)).toContain('orders');
    expect(webNames('owner', false)).toContain('staff');
    expect(webNames('owner', false)).toContain('branches');
  });

  it('keeps POS away from owners, who bill through a cashier account', () => {
    expect(webNames('owner', false)).not.toContain('index');
  });

  it('omits deferred finance from every role and platform', () => {
    for (const role of ['owner', 'admin', 'manager', 'accountant', 'cashier', 'kitchen'] as UserRole[]) {
      expect(webNames(role, false)).not.toContain('finance');
      expect(webNames(role, true)).not.toContain('finance');
      expect(nativeTabletNames(role)).not.toContain('finance');
    }
    expect(webNames('cashier', false)).not.toContain('finance');
    expect(webNames('kitchen', false)).not.toContain('finance');
  });
});

describe('getTabsForRole in the installed app', () => {
  it('withholds POS and orders even on an iPad, which is wide enough for them', () => {
    for (const role of ['owner', 'admin', 'manager', 'cashier'] as UserRole[]) {
      const names = nativeTabletNames(role);
      expect(names).not.toContain('index');
      expect(names).not.toContain('orders');
    }
  });

  it('gives an iPad the same management tabs a phone gets', () => {
    expect(nativeTabletNames('owner')).toEqual(['analytics', 'inventory', 'menu', 'staff', 'branches', 'settings']);
    expect(nativeTabletNames('manager')).toEqual(['analytics', 'inventory', 'menu', 'settings']);
  });

  it('still routes a restaurant kitchen login to the kitchen display', () => {
    expect(nativeTabletNames('kitchen')).toEqual(['kitchen', 'settings']);
    expect(getDefaultHrefForRole('kitchen', true)).toBe('/(app)/kitchen');
    expect(getDefaultHrefForRole('kitchen', false)).toBe('/(app)/kitchen');
  });
});

describe('usesManagementTabs', () => {
  it('is true for any phone-width window and for every native build', () => {
    expect(onPlatform('web', () => usesManagementTabs(true))).toBe(true);
    expect(onPlatform('ios', () => usesManagementTabs(false))).toBe(true);
    expect(onPlatform('android', () => usesManagementTabs(false))).toBe(true);
  });

  it('is false only for a browser wide enough to bill on', () => {
    expect(onPlatform('web', () => usesManagementTabs(false))).toBe(false);
  });
});

describe('the Central Kitchen login', () => {
  const branch = (id: string, branch_type: string | null) => ({
    id, tenant_id: 't', name: id, code: id, address: null, phone: null, gstin: null, invoice_prefix: 'A', branch_type, is_active: true,
  });
  const at = (role: UserRole, branch_type: string | null) => ({ role, branchId: 'own', accessibleBranches: [branch('own', branch_type), branch('other', 'RESTAURANT')] });

  it('is the kitchen role placed at the central kitchen or a warehouse', () => {
    expect(isCentralKitchenSession(at('kitchen', 'CENTRAL_KITCHEN'))).toBe(true);
    expect(isCentralKitchenSession(at('kitchen', 'WAREHOUSE'))).toBe(true);
    expect(isCentralKitchenSession(at('kitchen', 'RESTAURANT'))).toBe(false);
    expect(isCentralKitchenSession(at('kitchen', null))).toBe(false);
    expect(isCentralKitchenSession(at('owner', 'CENTRAL_KITCHEN'))).toBe(false);
  });

  it('lands on the Central Kitchen home, while a restaurant kitchen keeps its display', () => {
    onPlatform('web', () => {
      expect(getDefaultHrefForSession(at('kitchen', 'CENTRAL_KITCHEN'), true)).toBe('/central-kitchen/home');
      expect(getDefaultHrefForSession(at('kitchen', 'RESTAURANT'), true)).toBe('/(app)/kitchen');
      expect(getDefaultHrefForSession(at('owner', 'CENTRAL_KITCHEN'), true)).toBe('/(app)/analytics');
    });
  });
});
