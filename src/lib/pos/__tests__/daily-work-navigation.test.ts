jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import { Platform } from 'react-native';
import type { UserRole } from '@/lib/pos/session-context';
import { getTabsForRole } from '@/lib/pos/tab-config';
import {
  getDailyWorkGroups, getDailyWorkPhoneTabs, getBarTabs, getDailyWorkTabs, getMoreGroups, hasMoreTab, usesMoreForMenu,
  getPhoneNavigationSelection, usesDailyWorkNavigation,
  getDailyWorkDesktopTabs, getDesktopNavigationSelection,
} from '@/lib/pos/daily-work-navigation';

function onWeb(body: () => void): void {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  try { body(); } finally { Object.defineProperty(Platform, 'OS', { value: original, configurable: true }); }
}

describe('Daily work navigation', () => {
  it.each<UserRole>(['owner', 'admin'])('keeps four phone destinations for %s and every secondary screen reachable', (role) => {
    onWeb(() => {
      expect(getDailyWorkPhoneTabs(role).map((tab) => tab.name)).toEqual(['analytics', 'central-kitchen', 'inventory', 'more']);
      const secondary = getMoreGroups(role, true).flatMap((group) => group.tabs.map((tab) => tab.name));
      expect(secondary).toEqual(['menu', 'staff', 'branches', 'settings']);
      const mounted = getDailyWorkTabs(role, true).map((tab) => tab.name);
      secondary.forEach((name) => expect(mounted).toContain(name));
      expect(mounted).not.toContain('index');
      expect(mounted).not.toContain('orders');
      expect(mounted).not.toContain('finance');
    });
  });

  it('preserves the owner desktop destinations without adding a till', () => onWeb(() => {
    const groups = getDailyWorkGroups('owner', false);
    expect(groups.map((group) => group.title)).toEqual(['Daily work', 'Business', 'Administration']);
    expect(groups[0]?.tabs.map((tab) => tab.name)).toEqual(['orders', 'inventory', 'analytics', 'central-kitchen']);
    expect(groups.flatMap((group) => group.tabs.map((tab) => tab.name))).not.toContain('index');
  }));

  it('preserves admin POS and its existing desktop branch restriction', () => onWeb(() => {
    const names = getDailyWorkGroups('admin', false).flatMap((group) => group.tabs.map((tab) => tab.name));
    expect(names).toContain('index');
    expect(names).toContain('orders');
    expect(names).not.toContain('branches');
  }));

  it('keeps owner daily tasks in the desktop bottom bar and secondary tools under More', () => onWeb(() => {
    expect(getDailyWorkDesktopTabs('owner').map(tab => tab.name)).toEqual(['orders', 'inventory', 'analytics', 'central-kitchen', 'more']);
    expect(getMoreGroups('owner', false).flatMap(group => group.tabs.map(tab => tab.name))).toEqual(['menu', 'staff', 'branches', 'settings']);
    expect(getDailyWorkTabs('owner', false).map(tab => tab.name)).not.toContain('finance');
    expect(getDesktopNavigationSelection('owner', 'menu')).toBe('more');
    expect(getDesktopNavigationSelection('owner', 'orders')).toBe('orders');
  }));

  it('retains admin POS in the compact bar without exposing desktop Branches', () => onWeb(() => {
    expect(getDailyWorkDesktopTabs('admin').map(tab => tab.name)).toEqual(['index', 'orders', 'inventory', 'analytics', 'central-kitchen', 'more']);
    expect(getMoreGroups('admin', false).flatMap(group => group.tabs.map(tab => tab.name))).toEqual(['menu', 'staff', 'settings']);
  }));

  it.each<UserRole>(['cashier', 'kitchen', 'accountant'])('leaves %s navigation and access unchanged', (role) => onWeb(() => {
    expect(usesDailyWorkNavigation(role)).toBe(false);
    expect(getDailyWorkTabs(role, false)).toEqual(getTabsForRole(role, false));
    expect(getDailyWorkTabs(role, true)).toEqual(getTabsForRole(role, true));
    expect(getDailyWorkGroups(role, false)).toEqual([]);
    expect(getDailyWorkPhoneTabs(role)).toEqual([]);
    expect(getDailyWorkDesktopTabs(role)).toEqual([]);
    expect(getMoreGroups(role, true)).toEqual([]);
  }));

  // Task 337: a manager keeps the tab bar, but Menu lives under More.
  it('puts the manager Menu under More and keeps every other tab in the bar', () => {
    onWeb(() => {
      for (const phone of [false, true]) {
        const configured = getTabsForRole('manager', phone).map((tab) => tab.name);
        expect(usesDailyWorkNavigation('manager')).toBe(false);
        expect(usesMoreForMenu('manager')).toBe(true);
        expect(hasMoreTab('manager')).toBe(true);
        const bar = getBarTabs('manager', phone).map((tab) => tab.name);
        expect(bar).not.toContain('menu');
        expect(bar[bar.length - 1]).toBe('more');
        expect(bar.filter((name) => name !== 'more')).toEqual(configured.filter((name) => name !== 'menu'));
        // Menu is still mounted, so it opens like any other screen.
        expect(getDailyWorkTabs('manager', phone).map((tab) => tab.name)).toEqual([...configured, 'more']);
        expect(getMoreGroups('manager', phone)).toEqual([{ title: 'Business', tabs: expect.arrayContaining([expect.objectContaining({ name: 'menu' })]) }]);
        expect(getMoreGroups('manager', phone).flatMap((g) => g.tabs.map((tab) => tab.name))).toEqual(['menu']);
      }
    });
  });

  it('gives no one else a More tab for Menu', () => onWeb(() => {
    (['cashier', 'kitchen', 'accountant'] as UserRole[]).forEach((role) => {
      expect(usesMoreForMenu(role)).toBe(false);
      expect(getBarTabs(role, false)).toEqual(getTabsForRole(role, false));
    });
  }));

  it('highlights More while a secondary screen is open', () => {
    ['menu', 'staff', 'branches', 'settings', 'more'].forEach((name) => {
      expect(getPhoneNavigationSelection(name)).toBe('more');
    });
    expect(getPhoneNavigationSelection('analytics')).toBe('analytics');
    expect(getPhoneNavigationSelection('inventory')).toBe('inventory');
  });

  it('does not add till screens to a wide native management device', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    try {
      const names = getDailyWorkGroups('admin', false).flatMap(group => group.tabs.map(tab => tab.name));
      expect(names).not.toContain('index');
      expect(names).not.toContain('orders');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
