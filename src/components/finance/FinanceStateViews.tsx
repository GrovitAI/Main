import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AlertTriangle, Inbox, RefreshCw, Database } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import type { FinanceSchemaStatus } from '@/lib/pos/finance-types';

type LoadingViewProps = { label?: string; inline?: boolean };

export function FinanceLoadingView({ label = 'Loading finance data…', inline = false }: LoadingViewProps) {
  return (
    <View className={inline ? 'flex-row items-center justify-center gap-2 py-3' : 'flex-1 items-center justify-center py-16'}>
      <ActivityIndicator size={inline ? 'small' : 'large'} color={colors.primary} />
      <Text className={`text-text-secondary ${inline ? 'text-xs font-semibold' : 'mt-3 text-sm'}`}>{label}</Text>
    </View>
  );
}

type ErrorViewProps = { message: string; onRetry?: () => void; compact?: boolean };

export function FinanceErrorView({ message, onRetry, compact = false }: ErrorViewProps) {
  return (
    <View
      className={`flex-row items-center rounded-2xl border px-4 ${compact ? 'py-3' : 'py-4'} mb-4`}
      style={{ backgroundColor: semantic.dangerSoft, borderColor: semantic.danger }}
      accessibilityRole="alert"
    >
      <AlertTriangle size={18} color={semantic.danger} />
      <View className="flex-1 px-3">
        <Text className="text-xs font-bold" style={{ color: semantic.danger }}>
          Something went wrong
        </Text>
        <Text className="mt-0.5 text-xs text-text-primary">{message}</Text>
      </View>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="min-h-[44px] flex-row items-center justify-center rounded-xl px-3"
          style={({ pressed }) => [{ backgroundColor: semantic.danger, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <RefreshCw size={14} color={colors.textOnPrimary} />
          <Text className="ml-1.5 text-xs font-bold text-text-on-primary">Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type EmptyViewProps = { title: string; subtitle?: string; action?: { label: string; onPress: () => void } };

export function FinanceEmptyView({ title, subtitle, action }: EmptyViewProps) {
  return (
    <View className="items-center justify-center rounded-2xl border border-dashed border-border bg-white px-6 py-12">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-tint">
        <Inbox size={22} color={colors.textSecondary} />
      </View>
      <Text className="mt-3 text-center text-sm font-bold text-text-primary">{title}</Text>
      {subtitle ? <Text className="mt-1 max-w-[320px] text-center text-xs text-text-secondary">{subtitle}</Text> : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          className="mt-4 min-h-[44px] items-center justify-center rounded-xl bg-primary px-5"
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
        >
          <Text className="text-sm font-bold text-text-on-primary">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type SchemaNoticeProps = { schema: FinanceSchemaStatus | null };

/**
 * Shown while the finance migration has not been applied. Read-only aggregates
 * still work (computed client-side); some write features are disabled.
 */
export function FinanceSchemaNotice({ schema }: SchemaNoticeProps) {
  if (!schema) return null;
  const complete = schema.expensesExtended && schema.categoriesTable && schema.dayClosuresTable && schema.summaryRpc;
  if (complete) return null;

  const missing: string[] = [];
  if (!schema.summaryRpc) missing.push('server-side totals');
  if (!schema.expensesExtended) missing.push('payment method, payee and void on expenses');
  if (!schema.categoriesTable) missing.push('custom categories');
  if (!schema.dayClosuresTable) missing.push('day close records');

  return (
    <View
      className="mb-4 flex-row items-start rounded-2xl border px-4 py-3"
      style={{ backgroundColor: semantic.warningSoft, borderColor: semantic.warning }}
    >
      <Database size={16} color={semantic.warning} />
      <View className="flex-1 pl-3">
        <Text className="text-xs font-bold" style={{ color: semantic.warning }}>
          Finance schema migration pending
        </Text>
        <Text className="mt-0.5 text-xs text-text-primary">
          Running supabase/migrations/20260907010000_finance_module.sql enables {missing.join(', ')}. Figures shown
          now are computed on the device from base tables.
        </Text>
      </View>
    </View>
  );
}

type SectionCardProps = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function FinanceSectionCard({ title, subtitle, icon, right, children, className = '' }: SectionCardProps) {
  return (
    <View className={`rounded-2xl border border-border/60 bg-white p-4 shadow-sm md:p-5 ${className}`}>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center">
          {icon ? <View className="mr-2">{icon}</View> : null}
          <View className="flex-1">
            <Text className="text-sm font-bold text-text-primary">{title}</Text>
            {subtitle ? <Text className="text-xs text-text-secondary">{subtitle}</Text> : null}
          </View>
        </View>
        {right ? <View className="ml-2">{right}</View> : null}
      </View>
      {children}
    </View>
  );
}
