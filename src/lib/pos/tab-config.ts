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
  BookOpen,
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

// Admin: Similar to Owner but has POS option and no branches option
const ADMIN_TABS: TabConfig[] = [
  { name: 'index',     href: '/(app)/index',     icon: Receipt,      label: 'POS' },
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

// Mobile Devices: Management & Analytics focused (POS/Orders excluded per user requirement)
export const MOBILE_TABS: TabConfig[] = [
  { name: 'analytics', href: '/(app)/analytics', icon: TrendingUp, label: 'Analytics' },
  { name: 'inventory', href: '/(app)/inventory', icon: Boxes,      label: 'Inventory' },
  { name: 'menu',      href: '/(app)/menu',      icon: BookOpen,   label: 'Menu' },
  { name: 'staff',     href: '/(app)/staff',     icon: Users,      label: 'Staff' },
  { name: 'branches',  href: '/(app)/branches',  icon: GitBranch,  label: 'Branches' },
  { name: 'settings',  href: '/(app)/settings',  icon: Settings2,  label: 'Settings' },
];

/**
 * Tabs on MOBILE_TABS that only owners and admins may open.
 *
 * The Staff and Branches screens already restrict editing to those two roles.
 * Their contents are still tenant administration — staff email addresses, branch
 * GSTIN and approval configuration — so a cashier or manager on a phone should
 * not reach them at all.
 */
const OWNER_ONLY_MOBILE_TABS: ReadonlySet<string> = new Set(['staff', 'branches']);

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
  'menu',
] as const;

export type AppTabRouteName = (typeof APP_TAB_ROUTE_NAMES)[number];

export function getTabsForRole(role: UserRole, isPhone = false): TabConfig[] {
  if (isPhone) {
    if (role === 'kitchen') return KITCHEN_TABS;
    if (role === 'owner' || role === 'admin') return MOBILE_TABS;
    return MOBILE_TABS.filter((tab) => !OWNER_ONLY_MOBILE_TABS.has(tab.name));
  }
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

export function getDefaultScreenForRole(role: UserRole, isPhone = false): string {
  if (isPhone) {
    if (role === 'kitchen') return '/(app)/kitchen';
    return '/(app)/analytics'; // Analytics is flagship home for phone
  }
  switch (role) {
    case 'cashier':
      return '/(app)/index';
    case 'manager':
      return '/(app)/index';
    case 'owner':
      return '/(app)/orders';
    case 'admin':
      return '/(app)/index';
    case 'kitchen':
      return '/(app)/kitchen';
    default:
      return '/(app)/index';
  }
}

/**
 * Navigable href for the role/device default screen.
 * Tab hrefs use the "/index" suffix for matching, but Expo Router only
 * accepts "/(app)" for the index route, so strip it here.
 */
export function getDefaultHrefForRole(role: UserRole, isPhone = false): string {
  return getDefaultScreenForRole(role, isPhone).replace(/[/]index$/, '');
}

export function getInitialRouteNameForRole(role: UserRole, isPhone = false): string {
  const defaultHref = getDefaultScreenForRole(role, isPhone);
  const tabs = getTabsForRole(role, isPhone);
  const tab = tabs.find((entry) => entry.href === defaultHref);
  return tab?.name ?? (isPhone ? 'analytics' : 'index');
}

export function getTabConfigForRoute(
  routeName: string,
  roleTabs: TabConfig[],
): TabConfig | undefined {
  return roleTabs.find((tab) => tab.name === routeName);
}
