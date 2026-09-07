import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BookOpen, LayoutDashboard, Lock, Receipt, type LucideIcon } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import type { FinanceTab } from '@/lib/pos/finance-types';

export const FINANCE_TABS: { key: FinanceTab; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'cashbook', label: 'Cash Book', icon: BookOpen },
  { key: 'dayclose', label: 'Day Close', icon: Lock },
];

type FinanceTabBarProps = {
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
  compact?: boolean;
};

export function FinanceTabBar({ active, onChange, compact = false }: FinanceTabBarProps) {
  return (
    <View className={`flex-row rounded-2xl border border-border/60 bg-white p-1 shadow-sm ${compact ? '' : 'self-start'}`}>
      {FINANCE_TABS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            className={`min-h-[44px] flex-row items-center justify-center rounded-xl ${compact ? 'flex-1 px-2' : 'px-4'} ${
              isActive ? 'bg-primary' : ''
            }`}
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Icon size={15} color={isActive ? colors.textOnPrimary : colors.textSecondary} />
            <Text
              className={`ml-1.5 font-bold ${compact ? 'text-[11px]' : 'text-xs'} ${isActive ? 'text-text-on-primary' : 'text-text-secondary'}`}
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
