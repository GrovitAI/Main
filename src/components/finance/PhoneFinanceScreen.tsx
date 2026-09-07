import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SlidersHorizontal, X } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';
import type { FinanceFilters, FinancePreset, FinanceSchemaStatus, FinanceTab } from '@/lib/pos/finance-types';
import { describeDateRange } from '@/lib/pos/finance-utils';
import { FinanceFilterBar, type FinanceBranchOption } from './FinanceFilterBar';
import { FinanceTabBar } from './FinanceTabBar';
import { FinanceSchemaNotice } from './FinanceStateViews';
import { FinanceOverviewTab } from './FinanceOverviewTab';
import { ExpensesTab } from './ExpensesTab';
import { CashBookTab } from './CashBookTab';
import { DayCloseTab } from './DayCloseTab';

export type PhoneFinanceScreenProps = {
  activeTab: FinanceTab;
  filters: FinanceFilters;
  branches: FinanceBranchOption[];
  canPickBranch: boolean;
  loading: boolean;
  schema: FinanceSchemaStatus | null;
  onTab: (tab: FinanceTab) => void;
  onPreset: (preset: Exclude<FinancePreset, 'custom'>) => void;
  onCustomRange: (startDate: string, endDate: string) => void;
  onBranch: (branchId: string | null) => void;
  onRefresh: () => void;
  onMenuPress?: () => void;
};

export function PhoneFinanceScreen({
  activeTab,
  filters,
  branches,
  canPickBranch,
  loading,
  schema,
  onTab,
  onPreset,
  onCustomRange,
  onBranch,
  onRefresh,
  onMenuPress,
}: PhoneFinanceScreenProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const branchLabel = filters.branchId ? branches.find((b) => b.id === filters.branchId)?.name : canPickBranch ? 'All branches' : undefined;

  return (
    <View className="flex-1 bg-surface-tint">
      <PhoneScreenHeader
        title="Finance"
        subtitle={[describeDateRange(filters), branchLabel].filter(Boolean).join(' · ')}
        onMenuPress={onMenuPress}
        rightActions={
          <Pressable
            onPress={() => setFilterOpen(true)}
            className="h-[44px] w-[44px] items-center justify-center rounded-full bg-accent-soft"
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Open finance filters"
          >
            <SlidersHorizontal size={18} color={colors.primary} />
          </Pressable>
        }
      />

      <View className="px-3 pt-3">
        <FinanceTabBar active={activeTab} onChange={onTab} compact />
      </View>

      <View className="flex-1 px-3 pt-3">
        <FinanceSchemaNotice schema={schema} />
        {activeTab === 'overview' ? <FinanceOverviewTab compact /> : null}
        {activeTab === 'expenses' ? <ExpensesTab compact /> : null}
        {activeTab === 'cashbook' ? <CashBookTab compact /> : null}
        {activeTab === 'dayclose' ? <DayCloseTab compact /> : null}
      </View>

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setFilterOpen(false)}>
          <Pressable onPress={() => undefined} className="rounded-t-3xl bg-white px-4 pb-8 pt-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-base font-bold text-text-primary">Filters</Text>
              <Pressable
                onPress={() => setFilterOpen(false)}
                className="h-[44px] w-[44px] items-center justify-center rounded-full"
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
              >
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <FinanceFilterBar
              filters={filters}
              branches={branches}
              canPickBranch={canPickBranch}
              loading={loading}
              compact
              onPreset={(p) => {
                onPreset(p);
                setFilterOpen(false);
              }}
              onCustomRange={(s, e) => {
                onCustomRange(s, e);
                setFilterOpen(false);
              }}
              onBranch={onBranch}
              onRefresh={onRefresh}
            />
            <Text className="mt-3 text-xs text-text-secondary">{describeDateRange(filters)} · business days run 02:30 to 02:30 IST</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
