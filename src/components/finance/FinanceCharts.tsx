import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { colors, semantic } from '@/lib/pos/brand';
import type { FinanceDailyPoint } from '@/lib/pos/finance-types';
import { formatDateLabel, formatINR } from '@/lib/pos/finance-utils';

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

// ─── Revenue vs expenses grouped bars ────────────────────────────────────────

type RevenueExpenseBarsProps = {
  data: FinanceDailyPoint[];
  height?: number;
};

export function RevenueExpenseBars({ data, height = 210 }: RevenueExpenseBarsProps) {
  const [width, setWidth] = useState(0);
  const paddingX = 12;
  const paddingTop = 18;
  const paddingBottom = 26;
  const plotHeight = Math.max(20, height - paddingTop - paddingBottom);

  const maxValue = Math.max(100, ...data.map((p) => Math.max(safe(p.revenue), safe(p.expenses))));
  const slotWidth = data.length > 0 ? Math.max(4, (width - paddingX * 2) / data.length) : 0;
  const barGap = 2;
  const barWidth = Math.max(2, Math.min(22, (slotWidth - 6) / 2 - barGap / 2));
  const labelEvery = data.length <= 8 ? 1 : data.length <= 16 ? 2 : data.length <= 31 ? 5 : 10;

  const gridSteps = [0.25, 0.5, 0.75, 1];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} className="w-full">
      <View className="mb-2 flex-row items-center gap-4">
        <LegendDot color={colors.primary} label="Revenue" />
        <LegendDot color={semantic.danger} label="Expenses" />
      </View>
      {width > 0 && data.length > 0 ? (
        <Svg width={width} height={height}>
          {gridSteps.map((step) => {
            const y = paddingTop + plotHeight - step * plotHeight;
            return (
              <G key={step}>
                <Line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke={colors.borderSoft} strokeWidth={1} />
                <SvgText x={paddingX} y={y - 3} fontSize={8} fill={colors.textSecondary}>
                  {formatINR(maxValue * step, { compact: true })}
                </SvgText>
              </G>
            );
          })}
          <Line
            x1={paddingX}
            y1={paddingTop + plotHeight}
            x2={width - paddingX}
            y2={paddingTop + plotHeight}
            stroke={colors.border}
            strokeWidth={1}
          />
          {data.map((p, idx) => {
            const groupX = paddingX + idx * slotWidth + (slotWidth - (barWidth * 2 + barGap)) / 2;
            const revenueH = (safe(p.revenue) / maxValue) * plotHeight;
            const expenseH = (safe(p.expenses) / maxValue) * plotHeight;
            const baseY = paddingTop + plotHeight;
            const showLabel = idx % labelEvery === 0 || idx === data.length - 1;
            return (
              <G key={p.date}>
                <Rect
                  x={groupX}
                  y={baseY - revenueH}
                  width={barWidth}
                  height={Math.max(revenueH > 0 ? 1.5 : 0, revenueH)}
                  fill={colors.primary}
                  rx={2}
                />
                <Rect
                  x={groupX + barWidth + barGap}
                  y={baseY - expenseH}
                  width={barWidth}
                  height={Math.max(expenseH > 0 ? 1.5 : 0, expenseH)}
                  fill={semantic.danger}
                  rx={2}
                />
                {showLabel ? (
                  <SvgText
                    x={groupX + barWidth + barGap / 2}
                    y={height - 8}
                    fontSize={8.5}
                    fill={colors.textSecondary}
                    textAnchor="middle"
                  >
                    {formatDateLabel(p.date)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height }} className="items-center justify-center">
          <Text className="text-xs text-text-secondary">No daily data in this range</Text>
        </View>
      )}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center">
      <View className="mr-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[11px] font-semibold text-text-secondary">{label}</Text>
    </View>
  );
}

// ─── Donut ───────────────────────────────────────────────────────────────────

export type DonutSegment = { key: string; label: string; value: number; color: string };

type DonutChartProps = {
  segments: DonutSegment[];
  size?: number;
  centerLabel?: string;
};

export function DonutChart({ segments, size = 150, centerLabel = 'TOTAL' }: DonutChartProps) {
  const radius = size * 0.33;
  const strokeWidth = size * 0.095;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((acc, s) => acc + safe(s.value), 0);
  let offset = 0;

  return (
    <Svg width={size} height={size}>
      <Circle cx={center} cy={center} r={radius} stroke={colors.surfaceTint} strokeWidth={strokeWidth} fill="none" />
      {total > 0
        ? segments.map((s) => {
            const fraction = Math.max(0, safe(s.value) / total);
            const length = fraction * circumference;
            const dashOffset = -offset;
            offset += length;
            return (
              <Circle
                key={s.key}
                cx={center}
                cy={center}
                r={radius}
                stroke={s.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${length.toFixed(2)} ${circumference.toFixed(2)}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
          })
        : null}
      <SvgText x={center} y={center - 4} fontSize={8.5} fontWeight="bold" fill={colors.textSecondary} textAnchor="middle">
        {centerLabel}
      </SvgText>
      <SvgText x={center} y={center + 12} fontSize={11.5} fontWeight="bold" fill={colors.textPrimary} textAnchor="middle">
        {formatINR(total, { compact: true })}
      </SvgText>
    </Svg>
  );
}

// ─── Horizontal bars (View based) ────────────────────────────────────────────

export type HorizontalBarItem = { key: string; label: string; value: number; hint?: string };

type HorizontalBarsProps = {
  items: HorizontalBarItem[];
  color?: string;
  maxItems?: number;
};

export function HorizontalBars({ items, color = colors.primary, maxItems = 8 }: HorizontalBarsProps) {
  const shown = items.slice(0, maxItems);
  const max = Math.max(1, ...shown.map((i) => safe(i.value)));
  const rest = items.slice(maxItems);
  const restTotal = rest.reduce((acc, i) => acc + safe(i.value), 0);

  return (
    <View>
      {shown.map((item) => {
        const pct = Math.max(2, Math.round((safe(item.value) / max) * 100));
        return (
          <View key={item.key} className="mb-2.5">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="flex-1 pr-2 text-xs font-semibold text-text-primary" numberOfLines={1}>
                {item.label}
              </Text>
              <Text className="text-xs font-bold text-text-primary">{formatINR(item.value)}</Text>
            </View>
            <View className="h-2 w-full overflow-hidden rounded-full bg-surface-tint">
              <View className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </View>
            {item.hint ? <Text className="mt-0.5 text-[10px] text-text-secondary">{item.hint}</Text> : null}
          </View>
        );
      })}
      {rest.length > 0 ? (
        <Text className="text-[11px] text-text-secondary">
          + {rest.length} more {rest.length === 1 ? 'category' : 'categories'} totalling {formatINR(restTotal)}
        </Text>
      ) : null}
    </View>
  );
}
