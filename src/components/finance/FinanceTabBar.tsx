import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BookOpen, LayoutDashboard, Lock, NotebookPen, type LucideIcon } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import type { FinanceTab } from '@/lib/pos/finance-types';
import type { UserRole } from '@/lib/pos/session-context';
import { isFinanceOwner } from '@/lib/pos/finance-ledger-utils';

export type FinanceTabDef = { key: FinanceTab; label: string; icon: LucideIcon };

export const FINANCE_TABS: FinanceTabDef[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'ledger', label: 'Ledger', icon: NotebookPen },
  { key: 'cashbook', label: 'Cash Book', icon: BookOpen },
  { key: 'dayclose', label: 'Day Close', icon: Lock },
];

/**
 * The tabs a role may open. Owners, admins and managers get the tills' view
 * and the ledger; an accountant exists for the ledger alone and never sees
 * revenue, the cash book or day close.
 */
export function financeTabsForRole(role: UserRole | null | undefined): FinanceTabDef[] {
  if (isFinanceOwner(role) || role === 'manager') return FINANCE_TABS;
  return FINANCE_TABS.filter((tab) => tab.key === 'ledger');
}

type FinanceTabBarProps = {
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
  tabs?: FinanceTabDef[];
  compact?: boolean;
};

export function FinanceTabBar({ active, onChange, tabs = FINANCE_TABS, compact = false }: FinanceTabBarProps) {
  return (
    <View className={`flex-row rounded-2xl border border-border/60 bg-white p-1 shadow-sm ${compact ? '' : 'self-start'}`}>
      {tabs.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            // Four labels do not fit beside their icons on a phone, so the
            // compact bar stacks the icon over the label instead of clipping.
            className={`min-h-[44px] items-center justify-center rounded-xl ${compact ? 'flex-1 px-1 py-1.5' : 'flex-row px-4'} ${
              isActive ? 'bg-primary' : ''
            }`}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Icon size={15} color={isActive ? colors.textOnPrimary : colors.textSecondary} />
            <Text
              className={`font-bold ${compact ? 'mt-1 text-[10px]' : 'ml-1.5 text-xs'} ${isActive ? 'text-text-on-primary' : 'text-text-secondary'}`}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
