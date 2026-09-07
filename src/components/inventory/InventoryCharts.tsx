import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { BarChart3 } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';

// Chart-only colours without a brand token (kept as literals; see report).
const CHART_SUCCESS = '#16a34a';
const CHART_DANGER = '#dc2626';
const CHART_ORANGE = '#f97316';
const CHART_YELLOW = '#eab308';
const CHART_AXIS = '#94a3b8';

export function Sparkline({
  data,
  strokeColor = colors.primary,
  fillColor = colors.glow,
}: {
  data: number[];
  strokeColor?: string;
  fillColor?: string;
}) {
  if (!data || data.length < 2) return null;
  const width = 120;
  const height = 40;
  const padding = 2;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data) || 0;
  const range = max - min || 1;

  const coords = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - ((val - min) / range) * (height - padding * 2) - padding;
    return { x, y };
  });

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const cpX1 = curr.x + (next.x - curr.x) / 3;
    const cpY1 = curr.y;
    const cpX2 = curr.x + (2 * (next.x - curr.x)) / 3;
    const cpY2 = next.y;
    path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
  }

  const fillPath = `${path} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Path d={fillPath} fill={fillColor} />
      <Path d={path} fill="none" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

export function CircularProgress({
  percentage = 0,
  size = 52,
  strokeWidth = 5.5,
}: {
  percentage?: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View className="items-center justify-center relative" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={semantic.neutralSoft} strokeWidth={strokeWidth} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={CHART_SUCCESS}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text className="text-[10px] font-black text-slate-800">{Math.round(clamped)}%</Text>
      </View>
    </View>
  );
}

export interface ProcurementPoint {
  label: string;
  value: number;
}

function formatAxisValue(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value)}`;
}

/** Monthly procurement spend line chart driven by real purchase data. */
export function ProcurementLineChart({ points }: { points: ProcurementPoint[] }) {
  if (points.length < 2) {
    return (
      <View className="w-full items-center justify-center py-8 gap-2">
        <BarChart3 size={28} color={CHART_AXIS} />
        <Text className="text-xs font-bold text-slate-500">Not enough purchase history yet</Text>
        <Text className="text-[10px] text-slate-400 text-center">Record purchases across at least two months to see a trend.</Text>
      </View>
    );
  }

  const width = 360;
  const height = 160;
  const paddingLeft = 40;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 25;

  const rawMax = Math.max(...points.map((p) => p.value));
  const maxVal = rawMax > 0 ? rawMax * 1.15 : 1;
  const gridValues = [0, maxVal / 3, (maxVal * 2) / 3, maxVal];

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const coords = points.map((p, idx) => {
    const x = paddingLeft + (idx / (points.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (p.value / maxVal) * chartHeight;
    return { x, y };
  });

  let linePath = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const cpX1 = curr.x + (next.x - curr.x) / 3;
    const cpY1 = curr.y;
    const cpX2 = curr.x + (2 * (next.x - curr.x)) / 3;
    const cpY2 = next.y;
    linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
  }

  const fillPath = `${linePath} L ${coords[coords.length - 1].x} ${height - paddingBottom} L ${coords[0].x} ${height - paddingBottom} Z`;

  return (
    <View className="w-full overflow-hidden items-center">
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <SvgLinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.primaryLight} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={colors.primaryLight} stopOpacity="0.0" />
          </SvgLinearGradient>
        </Defs>

        {gridValues.map((yVal) => {
          const y = paddingTop + chartHeight - (yVal / maxVal) * chartHeight;
          return (
            <React.Fragment key={yVal}>
              <Path d={`M ${paddingLeft} ${y} L ${width - paddingRight} ${y}`} stroke={semantic.neutralSoft} strokeWidth={1} />
              <SvgText x={2} y={y + 3} fill={CHART_AXIS} fontSize="8" fontWeight="black">
                {formatAxisValue(yVal)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {points.map((p, idx) => (
          <SvgText key={`${p.label}-${idx}`} x={coords[idx].x - 8} y={height - 8} fill={CHART_AXIS} fontSize="9" fontWeight="black">
            {p.label}
          </SvgText>
        ))}

        <Path d={fillPath} fill="url(#chartGradient)" />
        <Path d={linePath} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinecap="round" />

        {coords.map((p, idx) => (
          <Circle key={idx} cx={p.x} cy={p.y} r={4.5} fill={colors.primary} stroke={colors.background} strokeWidth={1.5} />
        ))}
      </Svg>
    </View>
  );
}

export interface WastageSlice {
  label: string;
  value: number;
}

/** Donut chart of wastage cost impact split by reason (up to three slices). */
export function WastageDonutChart({ totalLoss, slices }: { totalLoss: number; slices: WastageSlice[] }) {
  const size = 100;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const palette = [CHART_DANGER, CHART_ORANGE, CHART_YELLOW];

  const total = slices.reduce((acc, s) => acc + s.value, 0) || 1;
  let consumed = 0;

  return (
    <View className="items-center justify-center relative" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {slices.length === 0 && (
          <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={semantic.neutralSoft} strokeWidth={strokeWidth} />
        )}
        {slices.slice(0, 3).map((slice, idx) => {
          const stroke = circumference * (slice.value / total);
          const offset = circumference - consumed;
          consumed += stroke;
          return (
            <Circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={palette[idx]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${stroke} ${circumference}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      </Svg>
      <View className="absolute items-center justify-center">
        <Text className="text-[8px] font-black text-slate-400 uppercase">Total Loss</Text>
        <Text className="text-xs font-black text-slate-800">₹{Math.round(totalLoss).toLocaleString('en-IN')}</Text>
      </View>
    </View>
  );
}

export const WASTAGE_SLICE_COLORS = [CHART_DANGER, CHART_ORANGE, CHART_YELLOW];
