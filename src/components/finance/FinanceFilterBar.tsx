import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Building2, Calendar, RefreshCw } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import type { FinanceFilters, FinancePreset } from '@/lib/pos/finance-types';
import { describeDateRange } from '@/lib/pos/finance-utils';

export type FinanceBranchOption = { id: string; name: string };

export type FinanceFilterBarProps = {
  filters: FinanceFilters;
  branches: FinanceBranchOption[];
  canPickBranch: boolean;
  loading: boolean;
  compact?: boolean;
  onPreset: (preset: Exclude<FinancePreset, 'custom'>) => void;
  onCustomRange: (startDate: string, endDate: string) => void;
  onBranch: (branchId: string | null) => void;
  onRefresh: () => void;
};

const PRESETS: { key: Exclude<FinancePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7days', label: '7 Days' },
  { key: '30days', label: '30 Days' },
  { key: 'month', label: 'This Month' },
];

type ChipProps = { label: string; active: boolean; onPress: () => void; icon?: React.ReactNode };

function Chip({ label, active, onPress, icon }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 min-h-[44px] flex-row items-center justify-center rounded-full border px-4 ${
        active ? 'border-primary bg-accent-soft' : 'border-border bg-white'
      }`}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon ? <View className="mr-1.5">{icon}</View> : null}
      <Text className={`text-xs font-bold ${active ? 'text-primary' : 'text-text-secondary'}`}>{label}</Text>
    </Pressable>
  );
}

export function FinanceFilterBar({
  filters,
  branches,
  canPickBranch,
  loading,
  compact = false,
  onPreset,
  onCustomRange,
  onBranch,
  onRefresh,
}: FinanceFilterBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View className={compact ? '' : 'mb-4'}>
      <View className="flex-row items-center">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerStyle={{ alignItems: 'center' }}>
          {PRESETS.map((p) => (
            <Chip key={p.key} label={p.label} active={filters.preset === p.key} onPress={() => onPreset(p.key)} />
          ))}
          <Chip
            label={filters.preset === 'custom' ? describeDateRange(filters) : 'Custom'}
            active={filters.preset === 'custom'}
            onPress={() => setPickerOpen(true)}
            icon={<Calendar size={13} color={filters.preset === 'custom' ? colors.primary : colors.textSecondary} />}
          />
        </ScrollView>
        <Pressable
          onPress={onRefresh}
          disabled={loading}
          className="ml-2 h-[44px] w-[44px] items-center justify-center rounded-full border border-border bg-white"
          style={({ pressed }) => [{ opacity: pressed || loading ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Refresh finance data"
        >
          <RefreshCw size={16} color={colors.primary} />
        </Pressable>
      </View>

      {canPickBranch && branches.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" contentContainerStyle={{ alignItems: 'center' }}>
          <Chip
            label="All branches"
            active={filters.branchId === null}
            onPress={() => onBranch(null)}
            icon={<Building2 size={13} color={filters.branchId === null ? colors.primary : colors.textSecondary} />}
          />
          {branches.map((b) => (
            <Chip key={b.id} label={b.name} active={filters.branchId === b.id} onPress={() => onBranch(b.id)} />
          ))}
        </ScrollView>
      ) : null}

      {!compact ? (
        <Text className="mt-2 text-xs text-text-secondary">
          Showing <Text className="font-bold text-text-primary">{describeDateRange(filters)}</Text>
          {' · business days run 02:30 to 02:30 IST'}
        </Text>
      ) : null}

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
