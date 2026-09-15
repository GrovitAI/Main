import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Plus, SlidersHorizontal, X } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import type { FinanceFilters, FinancePreset, FinanceSchemaStatus, FinanceTab } from '@/lib/pos/finance-types';
import { describeDateRange } from '@/lib/pos/finance-utils';
import { useLedgerStore } from '@/lib/pos/use-ledger-store';
import { FinanceFilterBar, type FinanceBranchOption } from './FinanceFilterBar';
import { FINANCE_TABS, FinanceTabBar, type FinanceTabDef } from './FinanceTabBar';
import { FinanceSchemaNotice } from './FinanceStateViews';
import { FinanceOverviewTab } from './FinanceOverviewTab';
import { LedgerTab } from './LedgerTab';
import { CashBookTab } from './CashBookTab';
import { DayCloseTab } from './DayCloseTab';

export type PhoneFinanceScreenProps = {
  activeTab: FinanceTab;
  /** The tabs this role may open; a single tab hides the bar. */
  tabs?: FinanceTabDef[];
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
  tabs = FINANCE_TABS,
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
  const insets = useSafeAreaInsets();
  const requestNewEntry = useLedgerStore((s) => s.requestNewEntry);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const branchLabel = filters.branchId ? branches.find((b) => b.id === filters.branchId)?.name : canPickBranch ? 'All branches' : undefined;
  const rangeLabel = describeDateRange(filters);

  return (
    <View className="flex-1 bg-surface-tint">
      <PhoneScreenHeader
        title="Finance"
        subtitle={branchLabel ?? 'Revenue, expenses, cash book and day close'}
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

      {tabs.length > 1 ? (
        <View className="px-3 pt-3">
          <FinanceTabBar active={activeTab} onChange={onTab} tabs={tabs} compact />
        </View>
      ) : null}

      {/* Active range, as on the analytics screen: tap the date to change it,
          or open every filter at once. */}
      <View className="mx-3 mt-3 flex-row items-center justify-between rounded-2xl border border-border-soft bg-accent-soft px-3 py-1">
        <Pressable
          onPress={() => setPickerOpen(true)}
          className="min-h-[44px] flex-1 flex-row items-center pr-2"
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Change the finance date range"
        >
          <Calendar size={15} color={colors.primary} />
          <Text className="ml-2 text-xs font-bold text-primary" numberOfLines={1}>
            {rangeLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setFilterOpen(true)}
          className="min-h-[36px] flex-row items-center rounded-lg border border-border-soft bg-white px-2.5"
          hitSlop={4}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Open finance filters"
        >
          <SlidersHorizontal size={11} color={colors.primary} />
          <Text className="ml-1 text-[11px] font-bold text-primary">Filters</Text>
        </Pressable>
      </View>

      {/* Day close and the expense forms carry text inputs, so the body lifts
          clear of the iOS keyboard. */}
      <KeyboardAvoider>
        <View className="flex-1 px-3 pt-3">
          <FinanceSchemaNotice schema={schema} />
          {activeTab === 'overview' ? <FinanceOverviewTab compact /> : null}
          {activeTab === 'ledger' ? <LedgerTab compact /> : null}
          {activeTab === 'cashbook' ? <CashBookTab compact /> : null}
          {activeTab === 'dayclose' ? <DayCloseTab compact /> : null}
        </View>
      </KeyboardAvoider>

      {/* Recording an entry is the one thing done on a phone several times a
          day, so it is one tap from every tab. The Ledger tab has its own
          button in the toolbar. Sits above the app tab bar. */}
      {activeTab !== 'ledger' ? (
        // The wrapper carries the placement as a plain style object: on web,
        // css-interop drops an inline offset given next to a positioning class.
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: 72 + insets.bottom }}>
          <Pressable
            onPress={() => {
              requestNewEntry();
              onTab('ledger');
            }}
            className="h-[56px] flex-row items-center rounded-full bg-primary pl-4 pr-5 shadow-panel"
            style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Record an entry"
          >
            <Plus size={20} color={colors.textOnPrimary} />
            <Text className="ml-1.5 text-sm font-bold text-text-on-primary">Entry</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setFilterOpen(false)}>
          <Pressable
            onPress={() => undefined}
            className="rounded-t-3xl bg-white px-4 pt-4"
            style={{ paddingBottom: Math.max(24, insets.bottom + 12) }}
          >
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
            <Text className="mt-3 text-xs text-text-secondary">{rangeLabel} · business days run 02:30 to 02:30 IST</Text>
          </Pressable>
        </Pressable>
      </Modal>

      <DatePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        startDate={filters.startDate}
        endDate={filters.endDate}
        onApply={(start, end) => onCustomRange(start, end)}
      />
    </View>
  );
}
