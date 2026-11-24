import { ChefHat, Ellipsis } from 'lucide-react-native';
import type { UserRole } from '@/lib/pos/session-context';
import { getTabsForRole, KITCHEN_HOME, type TabConfig } from '@/lib/pos/tab-config';

export type NavigationGroup = { title: string; tabs: TabConfig[] };
export type NavigationRow =
  | { kind: 'heading'; key: string; title: string }
  | { kind: 'destination'; key: string; tab: TabConfig };

const MORE_TAB: TabConfig = { name: 'more', href: '/(app)/more', icon: Ellipsis, label: 'More' };
const KITCHEN_TAB: TabConfig = {
  name: 'central-kitchen', href: KITCHEN_HOME, icon: ChefHat, label: 'Central Kitchen',
};
const BUSINESS_NAMES = ['finance', 'menu'];
const ADMINISTRATION_NAMES = ['staff', 'branches', 'settings'];
const PHONE_PRIMARY_NAMES: ReadonlySet<string> = new Set(['analytics', 'inventory']);

export function usesDailyWorkNavigation(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Task 337: a manager keeps the tab bar they have, but Menu is not one of its tabs: it sits under a
 * More tab at the end of the bar. The Menu screen stays mounted, so it opens like any other.
 */
export function usesMoreForMenu(role: UserRole): boolean {
  return role === 'manager';
}

/** Whether the role has a More tab at all: owners and admins (the daily-work layout) and managers (for Menu). */
export function hasMoreTab(role: UserRole): boolean {
  return usesDailyWorkNavigation(role) || usesMoreForMenu(role);
}

/** The tabs a manager sees in the bar: everything mounted except what lives under More. */
export function getBarTabs(role: UserRole, isPhone: boolean): TabConfig[] {
  const tabs = getDailyWorkTabs(role, isPhone);
  return usesMoreForMenu(role) ? tabs.filter((tab) => tab.name !== 'menu') : tabs;
}

/** Keep every authorized screen mounted as a tab, even when it lives under More. */
export function getDailyWorkTabs(role: UserRole, isPhone: boolean): TabConfig[] {
  const tabs = getTabsForRole(role, isPhone);
  return hasMoreTab(role) ? [...tabs, MORE_TAB] : tabs;
}

function selectTabs(tabs: TabConfig[], names: string[]): TabConfig[] {
  return names.flatMap((name) => {
    const tab = tabs.find((entry) => entry.name === name);
    return tab ? [tab] : [];
  });
}

export function getDailyWorkGroups(role: UserRole, isPhone: boolean): NavigationGroup[] {
  if (!usesDailyWorkNavigation(role)) return [];
  const tabs = getTabsForRole(role, isPhone);
  return [
    { title: 'Daily work', tabs: [...selectTabs(tabs, ['index', 'orders', 'inventory', 'analytics']), KITCHEN_TAB] },
    { title: 'Business', tabs: selectTabs(tabs, BUSINESS_NAMES) },
    { title: 'Administration', tabs: selectTabs(tabs, ADMINISTRATION_NAMES) },
  ].filter((group) => group.tabs.length > 0);
}

export function getMoreGroups(role: UserRole, isPhone: boolean): NavigationGroup[] {
  if (usesMoreForMenu(role)) {
    const menu = selectTabs(getTabsForRole(role, isPhone), ['menu']);
    return menu.length > 0 ? [{ title: 'Business', tabs: menu }] : [];
  }
  return getDailyWorkGroups(role, isPhone).filter((group) => group.title !== 'Daily work');
}

export function getDailyWorkPhoneTabs(role: UserRole): TabConfig[] {
  if (!usesDailyWorkNavigation(role)) return [];
  const tabs = getTabsForRole(role, true);
  return [
    ...selectTabs(tabs, ['analytics']),
    { ...KITCHEN_TAB, label: 'Kitchen' },
    ...selectTabs(tabs, ['inventory']),
    MORE_TAB,
  ];
}

export function getDailyWorkDesktopTabs(role: UserRole): TabConfig[] {
  if (!usesDailyWorkNavigation(role)) return [];
  const dailyWork = getDailyWorkGroups(role, false).find(group => group.title === 'Daily work');
  return [
    ...(dailyWork?.tabs ?? []).map(tab => tab.name === 'central-kitchen' ? { ...tab, label: 'Kitchen' } : tab),
    MORE_TAB,
  ];
}

export function getDesktopNavigationSelection(role: UserRole, routeName: string): string {
  return getDailyWorkDesktopTabs(role).some(tab => tab.name === routeName) ? routeName : 'more';
}

export function getPhoneNavigationSelection(routeName: string): string {
  return PHONE_PRIMARY_NAMES.has(routeName) ? routeName : 'more';
}

export function flattenNavigationGroups(groups: NavigationGroup[]): NavigationRow[] {
  return groups.flatMap((group): NavigationRow[] => [
    { kind: 'heading', key: group.title, title: group.title },
    ...group.tabs.map((tab): NavigationRow => ({ kind: 'destination', key: tab.name, tab })),
  ]);
}
