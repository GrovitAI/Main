import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui/Typography';
import { chart } from '@/lib/pos/brand';

const tabular = { fontVariant: ['tabular-nums' as const] };

/** Clean axis maximum: 1, 2, 2.5 or 5 times a power of ten, at or above the value. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

export type ColumnPoint = { label: string; value: number; previous?: number };

type ColumnChartProps = {
  points: readonly ColumnPoint[];
  /** Pixel height of the plot area. */
  height?: number;
  format: (value: number) => string;
  /** Compact tick format for the left axis. */
  formatTick?: (value: number) => string;
  /** Show every nth x label; the rest stay in the tooltip. */
  labelEvery?: number;
  /** Names used in tooltips and the legend when a previous series exists. */
  currentName?: string;
  previousName?: string;
  /** Accessible summary of the whole chart. */
  summary: string;
};

/**
 * Columns grow from one baseline: at most 24 px wide, 4 px rounded data end,
 * square at the base. With a previous series the two columns sit side by side
 * with a 2 px gap. Hover, focus or tap shows a tooltip; only the peak carries
 * a direct value label.
 */
export function ColumnChart({ points, height = 200, format, formatTick = format, labelEvery = 1, currentName = 'This period', previousName = 'Previous period', summary }: ColumnChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState(0);
  // About 56 px per label; show every nth so labels never truncate.
  const every = Math.max(labelEvery, plotWidth > 0 ? Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 56))) : labelEvery);
  const groups = Array.from({ length: Math.ceil(points.length / every) }, (_, g) => ({ label: points[g * every]?.label ?? '', size: Math.min(every, points.length - g * every) }));
  const hasPrevious = points.some((p) => p.previous !== undefined);
  const max = niceMax(Math.max(0, ...points.map((p) => Math.max(p.value, p.previous ?? 0))));
  const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? -1) ? i : best), 0);
  const ticks = [max, max / 2, 0];
  const px = (v: number): number => Math.max(v > 0 ? 3 : 0, Math.round((v / max) * height));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View className="flex-row">
        <View style={{ height, width: 52 }} className="justify-between">
          {ticks.map((t) => <Text key={t} className="text-right text-xs text-text-secondary" style={{ ...tabular, marginTop: t === max ? -7 : 0, marginBottom: t === 0 ? -7 : 0 }}>{formatTick(t)}</Text>)}
        </View>
        <View className="ml-3 flex-1" style={{ height }} onLayout={(e) => setPlotWidth(e.nativeEvent.layout.width)}>
          {ticks.map((t) => <View key={t} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((t / max) * height), height: 1, backgroundColor: chart.grid }} />)}
          <View className="flex-1 flex-row items-end">
            {points.map((p, i) => {
              const on = active === i;
              const delta = p.previous ? (p.value - p.previous) / p.previous : null;
              return (
                <Pressable key={p.label + i} className="h-full flex-1 items-center justify-end" accessibilityRole="button"
                  accessibilityLabel={`${p.label}: ${format(p.value)}${hasPrevious && p.previous !== undefined ? `, ${previousName.toLowerCase()} ${format(p.previous)}` : ''}`}
                  onHoverIn={() => setActive(i)} onHoverOut={() => setActive((a) => (a === i ? null : a))} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                  onPress={() => setActive((a) => (a === i ? null : i))}
                  style={{ backgroundColor: on ? chart.hoverWash : 'transparent', borderRadius: 8 }}>
                  {i === peak && p.value > 0 && !on ? (
                    <Text className="mb-1 text-xs font-bold text-text-primary" style={tabular}>{format(p.value)}</Text>
                  ) : null}
                  <View className="flex-row items-end" style={{ gap: 2, width: '100%', justifyContent: 'center' }}>
                    {hasPrevious ? <View style={{ width: '34%', maxWidth: 24, height: px(p.previous ?? 0), backgroundColor: chart.previous, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} /> : null}
                    <View style={{ width: hasPrevious ? '34%' : '56%', maxWidth: 24, height: px(p.value), backgroundColor: chart.series1, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                  </View>
                  {on ? (
                    <View pointerEvents="none" className="absolute rounded-lg bg-text-primary px-2.5 py-1.5" style={{ bottom: px(Math.max(p.value, p.previous ?? 0)) + 8, minWidth: 116, zIndex: 5 }}>
                      <Text className="text-xs font-semibold text-text-on-primary" style={{ opacity: 0.8 }}>{p.label}</Text>
                      <Text className="text-[13px] font-bold text-text-on-primary" style={tabular}>{format(p.value)}</Text>
                      {hasPrevious && p.previous !== undefined ? (
                        <Text className="text-xs text-text-on-primary" style={{ ...tabular, opacity: 0.85 }}>
                          {previousName} {format(p.previous)}{delta !== null && Number.isFinite(delta) ? ` · ${delta >= 0 ? '+' : '−'}${Math.abs(delta * 100).toFixed(0)}%` : ''}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View className="mt-2 flex-row" style={{ paddingLeft: 64 }}>
        {groups.map((g, i) => (
          <View key={g.label + i} style={{ flex: g.size }}>
            <Text numberOfLines={1} className="text-center text-xs text-text-secondary" style={{ width: `${100 / g.size}%`, minWidth: 48, alignSelf: 'flex-start' }}>{g.label}</Text>
          </View>
        ))}
      </View>
      {hasPrevious ? (
        <View className="mt-3 flex-row gap-4">
          <LegendKey color={chart.series1} label={currentName} />
          <LegendKey color={chart.previous} label={previousName} />
        </View>
      ) : null}
    </View>
  );
}

export function LegendKey({ color, label }: { color: string; label: string }) {
  return <View className="flex-row items-center gap-1.5"><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} /><Text className="text-xs text-text-secondary">{label}</Text></View>;
}

export type RingSegment = { label: string; value: number; color: string };

/**
 * Payment ring: one arc per segment with a 2 px surface gap between arcs. Round
 * caps extend stroke/2 past each dash end, so a round segment leaves stroke + 2
 * of dash gap; a segment too short for round caps is drawn with butt caps.
 */
export function Ring({ segments, size = 168, stroke = 18, center, caption }: { segments: readonly RingSegment[]; size?: number; stroke?: number; center: string; caption: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const several = segments.filter((s) => s.value > 0).length > 1;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center self-center">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={chart.grid} strokeWidth={stroke} fill="none" />
        {total > 0 ? segments.map((s) => {
          const length = (s.value / total) * circumference;
          const round = !several || length > stroke * 2 + 2;
          const gap = several ? (round ? stroke + 2 : 2) : 0;
          const visible = Math.max(0.5, length - gap);
          const node = s.value > 0 ? (
            <Circle key={s.label} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={stroke} fill="none" strokeLinecap={round ? 'round' : 'butt'}
              strokeDasharray={`${visible} ${circumference - visible}`} strokeDashoffset={-offset - gap / 2} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          ) : null;
          offset += length;
          return node;
        }) : null}
      </Svg>
      <Text className="text-[26px] font-bold leading-8 text-text-primary">{center}</Text>
      <Text className="text-xs text-text-secondary">{caption}</Text>
    </View>
  );
}

export type FlowSegment = { label: string; value: number; color: string };

/** One horizontal stack with 2 px surface gaps between segments. */
export function FlowBar({ segments, height = 12 }: { segments: readonly FlowSegment[]; height?: number }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return (
    <View className="flex-row overflow-hidden rounded-full" style={{ height, gap: 2, backgroundColor: chart.grid }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {total > 0 ? segments.filter((s) => s.value > 0).map((s) => <View key={s.label} style={{ flex: s.value / total, backgroundColor: s.color }} />) : null}
    </View>
  );
}

/** A labelled meter row: name and value above, a 6 px bar on a lighter track below. */
export function MeterRow({ label, value, fraction, detail, color = chart.series1 }: { label: string; value: string; fraction: number; detail?: string; color?: string }) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{label}</Text>
        <Text className="text-sm font-bold text-text-primary" style={tabular}>{value}</Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: chart.grid }}>
        <View className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%`, backgroundColor: color }} />
      </View>
      {detail ? <Text className="text-xs text-text-secondary" style={tabular}>{detail}</Text> : null}
    </View>
  );
}

