export const APP_TABS = [
  { name: 'index', title: 'Dashboard', href: '/' as const },
  { name: 'orders', title: 'Orders', href: '/orders' as const },
  { name: 'billing', title: 'Billing', href: '/billing' as const },
  { name: 'kitchen', title: 'Kitchen', href: '/kitchen' as const },
  { name: 'inventory', title: 'Inventory', href: '/inventory' as const },
] as const;

export type AppTabName = (typeof APP_TABS)[number]['name'];
