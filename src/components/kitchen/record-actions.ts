import { ArrowDownLeft, ArrowUp, ArrowUpRight, ShoppingBag, type LucideIcon } from 'lucide-react-native';
import type { KitchenPermission } from '@/lib/pos/kitchen-access-types';
import type { Tone } from './ui';

export type RecordAction = { key: 'send' | 'received' | 'bought' | 'spent'; icon: LucideIcon; label: string; caption: string; tone: Tone; href: string };

/**
 * The four things the kitchen records, each offered only to logins allowed to
 * record it. Home and the phone's + menu both list them from here (task 228).
 */
export function recordActions(can: (permission: KitchenPermission) => boolean): RecordAction[] {
  const mayPay = can('entries.pay');
  const maySpend = can('entries.spend');
  return [
    ...(can('entries.send') ? [{ key: 'send' as const, icon: ArrowUpRight, label: 'Send', caption: 'Items to a branch', tone: 'primary' as const, href: '/central-kitchen/send' }] : []),
    ...(can('entries.receive') ? [{ key: 'received' as const, icon: ArrowDownLeft, label: 'Received', caption: 'Money from a branch', tone: 'in' as const, href: '/central-kitchen/received' }] : []),
    ...(can('entries.buy') ? [{ key: 'bought' as const, icon: ShoppingBag, label: 'Bought', caption: 'From a vendor', tone: 'buy' as const, href: '/central-kitchen/bought' }] : []),
    ...(mayPay || maySpend ? [{ key: 'spent' as const, icon: ArrowUp, label: 'Spent', caption: mayPay && maySpend ? 'Pay a vendor or a bill' : mayPay ? 'Pay a vendor' : 'Pay a bill', tone: 'out' as const, href: '/central-kitchen/spent' }] : []),
  ];
}
