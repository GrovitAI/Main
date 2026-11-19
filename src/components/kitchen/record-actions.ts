import { ArrowDownLeft, ArrowUp, ArrowUpRight, ClipboardCheck, History, PackageOpen, PackagePlus, ShoppingBag, type LucideIcon } from 'lucide-react-native';
import type { KitchenPermission } from '@/lib/pos/kitchen-access-types';
import type { Tone } from './ui';

export type RecordAction = { key: 'send' | 'received' | 'bought' | 'spent' | 'give' | 'carried' | 'made' | 'count'; icon: LucideIcon; label: string; caption: string; tone: Tone; href: string };

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

/**
 * Task 326: what a stock-only login records, for its Home when none of the four apply: usage,
 * batches and the finished-goods count.
 */
export function stockOnlyActions(can: (permission: KitchenPermission) => boolean): RecordAction[] {
  return [
    ...stockActions(can),
    ...(can('entries.batch') ? [{ key: 'made' as const, icon: PackagePlus, label: 'Batches', caption: 'What was made', tone: 'primary' as const, href: '/central-kitchen/stock-entry?mode=made' }] : []),
    ...(can('entries.count') ? [{ key: 'count' as const, icon: ClipboardCheck, label: 'Count', caption: 'Stock on the shelf', tone: 'primary' as const, href: '/central-kitchen/stock-entry?mode=count&kind=finished_good' }] : []),
  ];
}

/**
 * Task 314: Pending from earlier, what a branch or vendor stood at as of a day. It sits on the
 * phone's + menu after the stock moves; branch and vendor pages offer it too.
 */
export function duesActions(can: (permission: KitchenPermission) => boolean): RecordAction[] {
  return can('entries.receive') || can('entries.buy') ? [{ key: 'carried', icon: History, label: 'Pending from earlier', caption: 'What was owed before', tone: 'neutral', href: '/central-kitchen/carried' }] : [];
}
