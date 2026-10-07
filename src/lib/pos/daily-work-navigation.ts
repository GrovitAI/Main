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

/** Keep every authorized screen mounted as a tab, even when it lives under More. */
export function getDailyWorkTabs(role: UserRole, isPhone: boolean): TabConfig[] {
  const tabs = getTabsForRole(role, isPhone);
  return usesDailyWorkNavigation(role) ? [...tabs, MORE_TAB] : tabs;
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

export function getPhoneNavigationSelection(routeName: string): string {
  return PHONE_PRIMARY_NAMES.has(routeName) ? routeName : 'more';
}

export function flattenNavigationGroups(groups: NavigationGroup[]): NavigationRow[] {
  return groups.flatMap((group): NavigationRow[] => [
    { kind: 'heading', key: group.title, title: group.title },
    ...group.tabs.map((tab): NavigationRow => ({ kind: 'destination', key: tab.name, tab })),
  ]);
}
