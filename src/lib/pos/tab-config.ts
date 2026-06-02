import type { LucideIcon } from 'lucide-react-native';
import {
  BarChart3,
  ChefHat,
  LayoutDashboard,
  Receipt,
  Settings2,
  ShoppingCart,
  Boxes,
} from 'lucide-react-native';

import type { UserRole } from './session-context';

export type TabConfig = {
  name: string;
  href: string;
  icon: LucideIcon;
  label: string;
};

const CASHIER_TABS: TabConfig[] = [
  { name: 'index', href: '/(app)/index', icon: Receipt, label: 'POS' },
  { name: 'orders', href: '/(app)/orders', icon: ShoppingCart, label: 'Orders' },
  { name: 'kitchen', href: '/(app)/kitchen', icon: ChefHat, label: 'Kitchen' },
  { name: 'settings', href: '/(app)/settings', icon: Settings2, label: 'Settings' },
];

const MANAGER_TABS: TabConfig[] = [
  { name: 'index', href: '/(app)/index', icon: Receipt, label: 'POS' },
  { name: 'orders', href: '/(app)/orders', icon: ShoppingCart, label: 'Orders' },
  { name: 'kitchen', href: '/(app)/kitchen', icon: ChefHat, label: 'Kitchen' },
  { name: 'inventory', href: '/(app)/inventory', icon: Boxes, label: 'Inventory' },
  { name: 'settings', href: '/(app)/settings', icon: Settings2, label: 'Settings' },
];

const OWNER_TABS: TabConfig[] = [
  {
    name: 'dashboard',
    href: '/(app)/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
  },
  { name: 'index', href: '/(app)/index', icon: Receipt, label: 'POS' },
  { name: 'orders', href: '/(app)/orders', icon: ShoppingCart, label: 'Orders' },
  { name: 'kitchen', href: '/(app)/kitchen', icon: ChefHat, label: 'Kitchen' },
  { name: 'inventory', href: '/(app)/inventory', icon: Boxes, label: 'Inventory' },
  { name: 'analytics', href: '/(app)/analytics', icon: BarChart3, label: 'Analytics' },
  { name: 'settings', href: '/(app)/settings', icon: Settings2, label: 'Settings' },
];

export const APP_TAB_ROUTE_NAMES = [
  'index',
  'orders',
  'kitchen',
  'inventory',
  'settings',
  'dashboard',
  'analytics',
  'billing',
] as const;

export type AppTabRouteName = (typeof APP_TAB_ROUTE_NAMES)[number];

export function getTabsForRole(role: UserRole): TabConfig[] {
  switch (role) {
    case 'cashier':
      return CASHIER_TABS;
    case 'manager':
      return MANAGER_TABS;
    case 'owner':
      return OWNER_TABS;
  }
}

export function getDefaultScreenForRole(role: UserRole): string {
  switch (role) {
    case 'cashier':
      return '/(app)/orders';
    case 'manager':
      return '/(app)/orders';
    case 'owner':
      return '/(app)/dashboard';
  }
}

export function getInitialRouteNameForRole(role: UserRole): string {
  const defaultHref = getDefaultScreenForRole(role);
  const tab = getTabsForRole(role).find((entry) => entry.href === defaultHref);
  return tab?.name ?? 'orders';
}

export function getTabConfigForRoute(
  routeName: string,
  roleTabs: TabConfig[],
): TabConfig | undefined {
  return roleTabs.find((tab) => tab.name === routeName);
}
