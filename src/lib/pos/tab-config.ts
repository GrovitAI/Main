import type { LucideIcon } from 'lucide-react-native';
import {
  BarChart3,
  ChefHat,
  LayoutDashboard,
  Receipt,
  Settings2,
  ShoppingCart,
  Boxes,
  Users,
  TrendingUp,
  DollarSign,
  GitBranch,
} from 'lucide-react-native';

import type { UserRole } from './session-context';

export type TabConfig = {
  name: string;
  href: string;
  icon: LucideIcon;
  label: string;
};

// Cashier: POS-focused. No management screens.
const CASHIER_TABS: TabConfig[] = [
  { name: 'index',    href: '/(app)/index',    icon: Receipt,   label: 'POS' },
  { name: 'orders',   href: '/(app)/orders',   icon: ShoppingCart, label: 'Orders' },
  { name: 'kitchen',  href: '/(app)/kitchen',  icon: ChefHat,   label: 'Kitchen' },
  { name: 'settings', href: '/(app)/settings', icon: Settings2, label: 'Settings' },
];

// Manager: Branch-level operational view. POS + management for own branch.
const MANAGER_TABS: TabConfig[] = [
  { name: 'index',     href: '/(app)/index',     icon: Receipt,     label: 'POS' },
  { name: 'orders',    href: '/(app)/orders',    icon: ShoppingCart, label: 'Orders' },
  { name: 'kitchen',   href: '/(app)/kitchen',   icon: ChefHat,     label: 'Kitchen' },
  { name: 'inventory', href: '/(app)/inventory', icon: Boxes,       label: 'Inventory' },
  { name: 'analytics', href: '/(app)/analytics', icon: BarChart3,   label: 'Reports' },
  { name: 'settings',  href: '/(app)/settings',  icon: Settings2,   label: 'Settings' },
];

// Owner: Management dashboard. No POS — use a dedicated cashier account to bill.
const OWNER_TABS: TabConfig[] = [
  { name: 'orders',    href: '/(app)/orders',    icon: ShoppingCart, label: 'Orders' },
  { name: 'inventory', href: '/(app)/inventory', icon: Boxes,        label: 'Inventory' },
  { name: 'analytics', href: '/(app)/analytics', icon: TrendingUp,   label: 'Analytics' },
  { name: 'staff',     href: '/(app)/staff',     icon: Users,        label: 'Staff' },
  { name: 'branches',  href: '/(app)/branches',  icon: GitBranch,    label: 'Branches' },
  { name: 'settings',  href: '/(app)/settings',  icon: Settings2,    label: 'Settings' },
];

// Admin: Similar to Owner but does not have the branches option
const ADMIN_TABS: TabConfig[] = [
  { name: 'orders',    href: '/(app)/orders',    icon: ShoppingCart, label: 'Orders' },
  { name: 'inventory', href: '/(app)/inventory', icon: Boxes,        label: 'Inventory' },
  { name: 'analytics', href: '/(app)/analytics', icon: TrendingUp,   label: 'Analytics' },
  { name: 'staff',     href: '/(app)/staff',     icon: Users,        label: 'Staff' },
  { name: 'settings',  href: '/(app)/settings',  icon: Settings2,    label: 'Settings' },
];

// Kitchen: Kitchen display and printer settings only
const KITCHEN_TABS: TabConfig[] = [
  { name: 'kitchen',  href: '/(app)/kitchen',  icon: ChefHat,   label: 'Kitchen' },
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
  'expenses',
  'staff',
  'branches',
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
    case 'admin':
      return ADMIN_TABS;
    case 'kitchen':
      return KITCHEN_TABS;
    default:
      return CASHIER_TABS;
  }
}

export function getDefaultScreenForRole(role: UserRole): string {
  switch (role) {
    case 'cashier':
      return '/(app)/index';
    case 'manager':
      return '/(app)/index';
    case 'owner':
      return '/(app)/orders';   // Owner lands on Orders — no Dashboard tab
    case 'admin':
      return '/(app)/orders';
    case 'kitchen':
      return '/(app)/kitchen';
    default:
      return '/(app)/index';
  }
}

export function getInitialRouteNameForRole(role: UserRole): string {
  const defaultHref = getDefaultScreenForRole(role);
  const tab = getTabsForRole(role).find((entry) => entry.href === defaultHref);
  return tab?.name ?? 'index';
}

export function getTabConfigForRoute(
  routeName: string,
  roleTabs: TabConfig[],
): TabConfig | undefined {
  return roleTabs.find((tab) => tab.name === routeName);
}
