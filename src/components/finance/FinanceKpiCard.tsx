import React from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';

export type KpiTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'primary';

export type FinanceKpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  compact?: boolean;
};

const TONE_STYLES: Record<KpiTone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textSecondary, bg: colors.surfaceTint },
  primary: { fg: colors.primary, bg: colors.accentSoft },
  positive: { fg: semantic.success, bg: semantic.successSoft },
  negative: { fg: semantic.danger, bg: semantic.dangerSoft },
  warning: { fg: semantic.warning, bg: semantic.warningSoft },
};

export function FinanceKpiCard({ label, value, hint, icon: Icon, tone = 'neutral', compact = false }: FinanceKpiCardProps) {
  const palette = TONE_STYLES[tone];
  return (
    <View
      className={`flex-1 rounded-2xl border border-border/60 bg-white shadow-sm ${compact ? 'min-w-[140px] p-3' : 'min-w-[170px] p-4'}`}
      accessibilityRole="summary"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary" numberOfLines={1}>
          {label}
        </Text>
        <View
          className={`items-center justify-center rounded-xl ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}
          style={{ backgroundColor: palette.bg }}
        >
          <Icon size={compact ? 14 : 16} color={palette.fg} />
        </View>
      </View>
      <Text
        className={`mt-2 font-extrabold tracking-tight ${compact ? 'text-lg' : 'text-2xl'}`}
        style={{ color: tone === 'neutral' ? colors.textPrimary : palette.fg }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hint ? (
        <Text className="mt-1 text-[11px] text-text-secondary" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
