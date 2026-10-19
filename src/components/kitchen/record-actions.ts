import { ArrowDownLeft, ArrowUp, ArrowUpRight, PackageOpen, ShoppingBag, type LucideIcon } from 'lucide-react-native';
import type { KitchenPermission } from '@/lib/pos/kitchen-access-types';
import type { Tone } from './ui';

export type RecordAction = { key: 'send' | 'received' | 'bought' | 'spent' | 'give'; icon: LucideIcon; label: string; caption: string; tone: Tone; href: string };

/**
 * The four things the kitchen records, each offered only to logins allowed to
 * record it. Home and the phone's + menu both list them from here (task 228).
 * Goods first, then money: Received and Spent sit side by side (task 254).
 */
export function recordActions(can: (permission: KitchenPermission) => boolean): RecordAction[] {
  const mayPay = can('entries.pay');
  const maySpend = can('entries.spend');
  return [
    ...(can('entries.send') ? [{ key: 'send' as const, icon: ArrowUpRight, label: 'Send', caption: 'Items to a branch', tone: 'primary' as const, href: '/central-kitchen/send' }] : []),
    ...(can('entries.buy') ? [{ key: 'bought' as const, icon: ShoppingBag, label: 'Bought', caption: 'From a vendor', tone: 'buy' as const, href: '/central-kitchen/bought' }] : []),
    ...(can('entries.receive') ? [{ key: 'received' as const, icon: ArrowDownLeft, label: 'Received', caption: 'Money from a branch', tone: 'in' as const, href: '/central-kitchen/received' }] : []),
    ...(mayPay || maySpend ? [{ key: 'spent' as const, icon: ArrowUp, label: 'Spent', caption: mayPay && maySpend ? 'Pay a vendor or a bill' : mayPay ? 'Pay a vendor' : 'Pay a bill', tone: 'out' as const, href: '/central-kitchen/spent' }] : []),
  ];
}

/**
 * Task 242: raw materials given to the kitchen from the store, which counts as used. It sits after
 * the four on the phone's + menu and on the raw materials page; Home keeps its four.
 */
export function stockActions(can: (permission: KitchenPermission) => boolean): RecordAction[] {
  return can('entries.issue') ? [{ key: 'give', icon: PackageOpen, label: 'Give to kitchen', caption: 'Out of the store, counted as used', tone: 'primary', href: '/central-kitchen/give' }] : [];
}
