import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Building2, Calendar, Clock, Download, Minus, Plus, RotateCcw, type LucideIcon } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { chart, colors, semantic } from '@/lib/pos/brand';
import { formatINR } from '@/lib/pos/finance-utils';
import { fetchAnalyticsDashboard, type AnalyticsDashboard, type AnalyticsFilters, type ProductInsight } from '@/lib/analytics/analytics-service';
import { ColumnChart, FlowBar, LegendKey, MeterRow, Ring, type ColumnPoint, type RingSegment } from '@/components/analytics/StatementCharts';

export type AnalyticsPreset = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'custom';
const PRESETS: readonly { id: AnalyticsPreset; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: '7days', label: '7 days' },
  { id: '30days', label: '30 days' }, { id: 'month', label: 'This month' }, { id: 'custom', label: 'Custom' },
];
const tabular = { fontVariant: ['tabular-nums' as const] };
/** Whole rupees: a dashboard reads totals, not paise. */
const money = (n: number): string => formatINR(Math.round(n));
const trim = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ''));
const moneyTick = (n: number): string => n >= 1_00_00_000 ? `₹${trim(n / 1_00_00_000)}Cr` : n >= 1_00_000 ? `₹${trim(n / 1_00_000)}L` : n >= 1_000 ? `₹${trim(n / 1_000)}k` : `₹${Math.round(n)}`;
/** Under 0.05% reads as no change, in neutral ink rather than a green "up". */
const changeTone = (change: number): { color: string; Icon: LucideIcon; flat: boolean } => Math.abs(change) < 0.0005 ? { color: colors.textSecondary, Icon: ArrowRight, flat: true } : change > 0 ? { color: semantic.success, Icon: ArrowUpRight, flat: false } : { color: semantic.danger, Icon: ArrowDownRight, flat: false };
type CompareState = 'idle' | 'loading' | 'ready' | 'failed';

/** A change as icon plus percentage, in the direction's colour. */
function Change({ change, bold = false }: { change: number; bold?: boolean }) {
  const tone = changeTone(change);
  return <View className="flex-row items-center gap-0.5"><tone.Icon size={12} color={tone.color} /><Text className={`text-xs ${bold ? 'font-bold' : ''}`} style={{ color: tone.color, ...tabular }}>{Math.abs(change * 100).toFixed(1)}%</Text></View>;
}
const count = (n: number): string => Math.round(n).toLocaleString('en-IN');

type Props = {
  data: AnalyticsDashboard | null;
  loading: boolean;
  errorMsg: string | null;
  onRetry: () => void;
  /** The filters the shown data was loaded with. */
  loadedFilters: AnalyticsFilters | null;
  preset: AnalyticsPreset;
  onPreset: (preset: AnalyticsPreset) => void;
  onOpenDates: () => void;
  startDate: string;
  endDate: string;
  branches: readonly { id: string; name: string }[];
  canPickBranch: boolean;
  selectedBranchId: string | null;
  onSelectBranch: (id: string | null) => void;
  canExport: boolean;
  exporting: boolean;
  exportNotice: string | null;
  onExportTransactions: () => void;
  onExportItems: () => void;
  hours: { enabled: boolean; start: string; end: string; onToggle: () => void; onStart: (v: string) => void; onEnd: (v: string) => void };
  franchise: { enabled: boolean; rate: number; onToggle: (on: boolean) => void; onDecrease: () => void; onIncrease: () => void };
};

/** Readable date such as "5 Oct 2026", from a YYYY-MM-DD key. */
function dayLabel(key: string, withYear = true): string {
  const d = new Date(key + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' as const } : {}) });
}
const isoDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The equal-length period just before the loaded one, for "vs previous period". */
function previousFilters(f: AnalyticsFilters): AnalyticsFilters | null {
  const start = new Date(f.startDate + 'T00:00:00'); const end = new Date(f.endDate + 'T00:00:00');
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 366) return null;
  const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - (days - 1));
  return { ...f, startDate: isoDay(prevStart), endDate: isoDay(prevEnd) };
}

/** The trend service labels days "13 Sep" / "01 Oct" and omits days without sales. */
const TREND_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const trendLabel = (d: Date): string => `${String(d.getDate()).padStart(2, '0')} ${TREND_MONTHS[d.getMonth()]}`;
type AlignedDay = { label: string; sales: number; orders: number; previousSales: number };

/**
 * One point per calendar day in the loaded range, zero where nothing sold, and
 * each day paired with the day exactly one period earlier. Falls back to the
 * service's own points when its labels are not daily (for example, months).
 */
function alignedDays(data: AnalyticsDashboard | null, previous: AnalyticsDashboard | null, filters: AnalyticsFilters | null): AlignedDay[] {
  const raw = data?.salesByDay ?? [];
  const fallback = raw.map((p) => ({ label: p.label, sales: p.sales, orders: p.orders, previousSales: 0 }));
  if (!filters) return fallback;
  const start = new Date(filters.startDate + 'T12:00:00'); const end = new Date(filters.endDate + 'T12:00:00');
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (!Number.isFinite(span) || span < 1 || span > 92) return fallback;
  const byLabel = new Map(raw.map((p) => [p.label, p]));
  const prevByLabel = new Map((previous?.salesByDay ?? []).map((p) => [p.label, p]));
  const out: AlignedDay[] = [];
  for (let i = 0; i < span; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const before = new Date(day); before.setDate(day.getDate() - span);
    const label = trendLabel(day);
    const hit = byLabel.get(label);
    out.push({ label, sales: hit?.sales ?? 0, orders: hit?.orders ?? 0, previousSales: prevByLabel.get(trendLabel(before))?.sales ?? 0 });
  }
  // Labels that never match mean the service grouped differently; keep its points.
  return raw.length > 0 && !raw.some((p) => out.some((d) => d.label === p.label)) ? fallback : out;
}

/** "12a" … "11p" for an "HH:00" hour. */
function shortHour(hour: string): string {
  const h = Number(hour.slice(0, 2));
  if (!Number.isFinite(h)) return hour;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
}

function Delta({ current, previous, state, label = 'vs previous period' }: { current: number; previous: number | null | undefined; state: CompareState; label?: string }) {
  if (state === 'idle' || state === 'loading') return <View style={{ height: 20 }} />;
  if (state === 'failed') return <Text className="text-xs text-text-secondary">Comparison unavailable</Text>;
  if (previous === null || previous === undefined || previous <= 0) return <Text className="text-xs text-text-secondary">No sales in the previous period</Text>;
  const change = (current - previous) / previous;
  const { flat } = changeTone(change);
  const up = change > 0;
  return (
    <View className="flex-row items-center gap-2">
      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: flat ? semantic.neutralSoft : up ? semantic.successSoft : semantic.dangerSoft }}>
        <Change change={change} bold />
      </View>
      <Text className="text-xs text-text-secondary">{label}</Text>
    </View>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <View className={`rounded-2xl border border-border-soft bg-surface-elevated p-5 shadow-card ${className}`}>{children}</View>;
}
function CardHead({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View className="mb-4 flex-row items-start gap-3">
      <View className="min-w-0 flex-1"><Text className="text-base font-bold leading-6 text-text-primary" accessibilityRole="header">{title}</Text>{subtitle ? <Text className="text-xs leading-5 text-text-secondary">{subtitle}</Text> : null}</View>
      {right}
    </View>
  );
}
const Gap = () => <View className="h-5" />;
function ToolButton({ label, onPress, active = false, icon: Icon, disabled = false, primary = false }: { label: string; onPress: () => void; active?: boolean; icon?: typeof Calendar; disabled?: boolean; primary?: boolean }) {
  const tone = primary ? 'border-primary bg-primary hover:bg-primary-deep' : active ? 'border-primary bg-accent-soft' : 'border-border bg-surface-elevated hover:bg-surface-tint';
  const ink = primary ? colors.textOnPrimary : active ? colors.primaryDeep : colors.textPrimary;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress}
      className={`min-h-[44px] flex-row items-center gap-1.5 rounded-xl border px-3.5 ${tone} ${disabled ? 'opacity-50' : 'active:opacity-80'}`}>
      {Icon ? <Icon size={15} color={ink} /> : null}
      <Text className="text-[13px] font-semibold" style={{ color: ink }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Desktop web analytics as a daily statement: money first, then sales by day
 * against the previous equal period, payment mix, rush hours, orders, the menu
 * and every item's revenue. Phone and tablet keep their own screens.
 */
export function AnalyticsStatement(props: Props) {
  const { data, loading, errorMsg, loadedFilters } = props;
  const [previous, setPrevious] = useState<AnalyticsDashboard | null>(null);
  const [compare, setCompare] = useState<CompareState>('idle');
  const prevRequest = useRef(0);

  // The previous equal period gives every "vs" figure. A failed read only hides the comparisons.
  useEffect(() => {
    const prev = loadedFilters ? previousFilters(loadedFilters) : null;
    const id = ++prevRequest.current;
    setPrevious(null);
    if (!prev) { setCompare(loadedFilters ? 'failed' : 'idle'); return; }
    setCompare('loading');
    void fetchAnalyticsDashboard(prev).then((r) => {
      if (id !== prevRequest.current) return;
      if (r.data) { setPrevious(r.data); setCompare('ready'); } else setCompare('failed');
    });
  }, [loadedFilters]);

  const k = data?.kpis;
  const pk = previous?.kpis;
  const periodLabel = props.startDate && props.endDate
    ? props.startDate === props.endDate ? dayLabel(props.startDate) : `${dayLabel(props.startDate, props.startDate.slice(0, 4) !== props.endDate.slice(0, 4))} – ${dayLabel(props.endDate)}`
    : 'Choose dates';
  // After a failed reload the cards still show the last good load, so the scope line follows that load.
  const stale = !!(errorMsg && data && loadedFilters);
  // The cards show the last completed load, so the scope line follows it, also while a new period loads.
  const onScreen = data && loadedFilters ? loadedFilters : null;
  const shownStart = onScreen ? onScreen.startDate : props.startDate;
  const shownEnd = onScreen ? onScreen.endDate : props.endDate;
  const shownBranchId = onScreen ? onScreen.branchId ?? null : props.selectedBranchId;
  const shownPeriod = shownStart && shownEnd
    ? shownStart === shownEnd ? dayLabel(shownStart) : `${dayLabel(shownStart, shownStart.slice(0, 4) !== shownEnd.slice(0, 4))} – ${dayLabel(shownEnd)}`
    : 'Choose dates';
  const branchName = shownBranchId ? props.branches.find((b) => b.id === shownBranchId)?.name ?? 'Your branch' : props.canPickBranch ? 'All branches' : 'Your branch';

  const days = useMemo(() => alignedDays(data, previous, loadedFilters), [data, previous, loadedFilters]);
  const dayPoints = useMemo<ColumnPoint[]>(() => days.map((d) => ({ label: d.label, value: d.sales, ...(previous ? { previous: d.previousSales } : {}) })), [days, previous]);
  const orderPoints = useMemo<ColumnPoint[]>(() => days.map((d) => ({ label: d.label, value: d.orders })), [days]);
  const hourPoints = useMemo<ColumnPoint[]>(() => {
    const hours = data?.salesByHour ?? [];
    const busy = hours.map((h, i) => (h.sales > 0 ? i : -1)).filter((i) => i >= 0);
    if (!busy.length) return hours.slice(9, 24).map((h) => ({ label: shortHour(h.hour), value: h.sales }));
    let from = Math.max(0, busy[0] - 1); let to = Math.min(hours.length - 1, busy[busy.length - 1] + 1);
    while (to - from < 7) { if (from > 0) from--; if (to - from < 7 && to < hours.length - 1) to++; if (from === 0 && to === hours.length - 1) break; }
    return hours.slice(from, to + 1).map((h) => ({ label: shortHour(h.hour), value: h.sales }));
  }, [data]);
  const busiestHour = hourPoints.reduce<ColumnPoint | null>((best, p) => (!best || p.value > best.value ? p : best), null);
  // The busiest three-hour window and its share of the day's sales, in words.
  const rushLine = useMemo(() => {
    const hours = data?.salesByHour ?? [];
    const total = hours.reduce((sum, h) => sum + h.sales, 0);
    if (total <= 0 || hours.length < 3) return null;
    let best = 0; let bestSum = -1;
    for (let i = 0; i + 3 <= hours.length; i++) { const sum = hours[i].sales + hours[i + 1].sales + hours[i + 2].sales; if (sum > bestSum) { bestSum = sum; best = i; } }
    const word = (h: number): string => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
    const startHour = Number(hours[best].hour.slice(0, 2));
    if (!Number.isFinite(startHour)) return null;
    return `Busiest from ${word(startHour)} to ${word(startHour + 3)}, with ${Math.round((bestSum / total) * 100)}% of sales.`;
  }, [data]);
  const busiestDay = dayPoints.reduce<ColumnPoint | null>((best, p) => (!best || p.value > best.value ? p : best), null);

  const payments = useMemo<RingSegment[]>(() => {
    const palette = [chart.series1, chart.series2, chart.series3];
    const order = ['upi', 'cash', 'card'];
    const rows = [...(data?.paymentSplit ?? [])].filter((p) => p.total > 0)
      .sort((a, b) => (order.indexOf(a.payment_type.toLowerCase()) + 99) % 99 - (order.indexOf(b.payment_type.toLowerCase()) + 99) % 99 || b.total - a.total);
    const named = rows.slice(0, 3).map((p, i) => ({ label: p.payment_type.toUpperCase() === 'UPI' ? 'UPI' : p.payment_type.charAt(0).toUpperCase() + p.payment_type.slice(1).toLowerCase(), value: p.total, color: palette[i] }));
    const rest = rows.slice(3).reduce((sum, p) => sum + p.total, 0);
    return rest > 0 ? [...named, { label: 'Other', value: rest, color: colors.textSecondary }] : named;
  }, [data]);
  const paymentTotal = payments.reduce((sum, p) => sum + p.value, 0);
  const lead = payments[0];

  const items = useMemo(() => data?.itemWiseReport ?? [], [data]);
  const itemRevenue = items.reduce((sum, i) => sum + i.revenue, 0);
  const sortedItems = useMemo(() => [...items].sort((a, b) => b.revenue - a.revenue), [items]);
  const empty = !!k && k.totalOrders === 0 && k.totalSales === 0;

  const toolbar = (
    <View className="gap-3 pb-1 pt-6">
      <View className="flex-row flex-wrap items-end gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-2xl font-bold leading-8 text-text-primary" accessibilityRole="header">Analytics</Text>
          <Text className="text-[13px] leading-5 text-text-secondary">{branchName} · {shownPeriod}{loading ? ' · updating…' : stale ? ' · last successful load' : ''}</Text>
        </View>
        {props.canExport && k && k.totalOrders > 0 ? (
          <View className="flex-row gap-2">
            <ToolButton label="Item sales" icon={Download} onPress={props.onExportItems} disabled={loading} />
            <ToolButton label={props.exporting ? 'Preparing…' : 'Export transactions'} icon={Download} primary onPress={props.onExportTransactions} disabled={loading || props.exporting} />
          </View>
        ) : null}
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="flex-row rounded-xl border border-border-soft bg-surface-elevated p-1" accessibilityRole="tablist">
          {PRESETS.map((p) => {
            const on = props.preset === p.id;
            return (
              <Pressable key={p.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => props.onPreset(p.id)}
                className={`min-h-[44px] justify-center rounded-lg px-3 ${on ? 'bg-primary' : 'hover:bg-surface-tint'}`}>
                <Text className="text-[13px] font-semibold" style={{ color: on ? colors.textOnPrimary : colors.textSecondary }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <ToolButton label={periodLabel} icon={Calendar} onPress={props.onOpenDates} />
        <ToolButton label={props.hours.enabled ? `${props.hours.start}–${props.hours.end}` : 'All hours'} icon={Clock} active={props.hours.enabled} onPress={props.hours.onToggle} />
        {props.hours.enabled ? (
          <View className="flex-row items-center gap-2">
            <TextInput accessibilityLabel="From time" value={props.hours.start} onChangeText={props.hours.onStart} placeholder="09:00" className="h-11 w-20 rounded-xl border border-border bg-surface-elevated px-3 text-[13px] text-text-primary" />
            <Text className="text-text-secondary">to</Text>
            <TextInput accessibilityLabel="To time" value={props.hours.end} onChangeText={props.hours.onEnd} placeholder="23:00" className="h-11 w-20 rounded-xl border border-border bg-surface-elevated px-3 text-[13px] text-text-primary" />
          </View>
        ) : null}
        {props.canPickBranch && props.branches.length > 0 ? (
          <View className="ml-auto flex-row flex-wrap gap-2">
            <ToolButton label="All branches" icon={Building2} active={props.selectedBranchId === null} onPress={() => props.onSelectBranch(null)} />
            {props.branches.map((b) => <ToolButton key={b.id} label={b.name} active={props.selectedBranchId === b.id} onPress={() => props.onSelectBranch(b.id)} />)}
          </View>
        ) : null}
      </View>
      {props.exportNotice ? <Text accessibilityRole="alert" className="text-[13px] text-text-secondary">{props.exportNotice}</Text> : null}
      {errorMsg && data ? <View accessibilityRole="alert" className="flex-row items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: semantic.warningSoft }}><Text className="min-w-0 flex-1 text-[13px]" style={{ color: semantic.warning }}>{errorMsg} The figures below are from the last successful load.</Text><ToolButton label="Retry" icon={RotateCcw} onPress={props.onRetry} /></View> : null}
    </View>
  );

  const body = !data ? (
    <Card className="mt-6 items-center py-14">
      {errorMsg ? <>
        <Text className="text-base font-bold text-text-primary">Analytics could not load</Text>
        <Text className="mt-1 text-[13px] text-text-secondary">{errorMsg}</Text>
        <View className="mt-4"><ToolButton label="Retry" icon={RotateCcw} onPress={props.onRetry} /></View>
      </> : <><ActivityIndicator color={colors.primary} accessibilityLabel="Loading analytics" /><Text className="mt-3 text-[13px] text-text-secondary">Loading the statement…</Text></>}
    </Card>
  ) : empty ? (
    <Card className="mt-6 items-center py-14">
      <Text className="text-base font-bold text-text-primary">No sales · {shownPeriod}</Text>
      <Text className="mt-1 text-[13px] text-text-secondary">{branchName} recorded no sales then. Choose another date range or branch.</Text>
    </Card>
  ) : k ? (
    <View>
      <Gap />
      <Card>
        <View className="flex-row flex-wrap items-end gap-6">
          <View className="min-w-0 flex-1">
            <Text className="text-[13px] font-semibold text-text-secondary">Total sales</Text>
            <Text className="mt-1 text-[48px] font-bold leading-[56px] text-text-primary" style={{ letterSpacing: -0.8 }}>{money(k.totalSales)}</Text>
            <View className="mt-1"><Delta current={k.totalSales} previous={pk?.totalSales} state={compare} /></View>
          </View>
          {([['Orders', count(k.totalOrders), k.totalOrders, pk?.totalOrders], ['Average bill', money(k.avgOrderValue), k.avgOrderValue, pk?.avgOrderValue], ['Items sold', count(k.itemsSold), k.itemsSold, pk?.itemsSold]] as const).map(([label, shown, value, was]) => (
            <View key={label} className="min-w-[132px]">
              <Text className="text-xs font-semibold text-text-secondary">{label}</Text>
              <Text className="mt-0.5 text-2xl font-bold leading-8 text-text-primary">{shown}</Text>
              {compare === 'ready' && was !== undefined && was > 0 ? <Change change={(value - was) / was} /> : <View style={{ height: 16 }} />}
            </View>
          ))}
        </View>
        <View className="mt-5"><FlowBar segments={[{ label: 'Collected', value: k.collectedRevenue, color: chart.series1 }, { label: 'Pending', value: k.pendingCollections, color: chart.pending }]} /></View>
        <View className="mt-4 flex-row flex-wrap gap-3">
          {([['Collected', money(k.collectedRevenue), chart.series1], ['Pending', money(k.pendingCollections), chart.pending], ['Discounts given', money(k.totalDiscounts), null], ['GST collected', money(k.taxCollected), null], [`Cancelled · ${count(k.cancelledOrders)} bills`, money(k.cancelledSales), null]] as const).map(([label, value, swatch]) => (
            <View key={label} className="min-w-[150px] flex-1 flex-row gap-2.5">
              <View><View className="flex-row items-center gap-1.5">{swatch ? <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: swatch }} /> : null}<Text className="text-xs font-semibold text-text-secondary">{label}</Text></View><Text className="text-lg font-bold leading-6 text-text-primary" style={tabular}>{value}</Text></View>
            </View>
          ))}
        </View>
      </Card>

      <Gap />
      <View className="flex-row gap-4">
        <Card className="min-w-0 flex-[2]">
          <CardHead title="Sales by day" subtitle={`${money(k.totalSales)} over ${count(dayPoints.length)} ${dayPoints.length === 1 ? 'day' : 'days'}${previous ? ' · against the previous period of the same length' : ''}`}
            right={busiestDay && busiestDay.value > 0 ? <View className="items-end"><Text className="text-xs text-text-secondary">Best day</Text><Text className="text-[13px] font-bold text-text-primary">{busiestDay.label}</Text></View> : null} />
          <ColumnChart points={dayPoints} format={money} formatTick={moneyTick} labelEvery={dayPoints.length > 16 ? Math.ceil(dayPoints.length / 10) : 1}
            currentName="This period" previousName="Previous period" summary={`Sales by day, ${dayPoints.length} days, best day ${busiestDay?.label ?? ''} at ${money(busiestDay?.value ?? 0)}`} />
        </Card>
        <Card className="min-w-0 flex-1">
          <CardHead title="Payment mix" subtitle="How customers paid" />
          {paymentTotal > 0 && lead ? <>
            <Ring segments={payments} center={`${Math.round((lead.value / paymentTotal) * 100)}%`} caption={`paid by ${lead.label}`} />
            <View className="mt-5 gap-3">
              {payments.map((p) => (
                <View key={p.label} className="flex-row items-center gap-2.5">
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: p.color }} />
                  <Text className="min-w-0 flex-1 text-[13px] text-text-primary">{p.label}</Text>
                  <Text className="text-xs text-text-secondary" style={tabular}>{Math.round((p.value / paymentTotal) * 100)}%</Text>
                  <Text className="w-24 text-right text-[13px] font-bold text-text-primary" style={tabular}>{money(p.value)}</Text>
                </View>
              ))}
            </View>
          </> : <Text className="py-10 text-center text-[13px] text-text-secondary">No payments recorded in this period.</Text>}
        </Card>
      </View>

      <Gap />
      <View className="flex-row gap-4">
        <Card className="min-w-0 flex-[2]">
          <CardHead title="Rush hours" subtitle="Sales by hour of the day across the period"
            right={busiestHour && busiestHour.value > 0 ? <View className="items-end"><Text className="text-xs text-text-secondary">Busiest hour</Text><Text className="text-[13px] font-bold text-text-primary">{busiestHour.label}</Text></View> : null} />
          <ColumnChart points={hourPoints} height={160} format={money} formatTick={moneyTick} summary={`Sales by hour, busiest ${busiestHour?.label ?? ''} at ${money(busiestHour?.value ?? 0)}`} />
          {rushLine ? <Text className="mt-3 text-[13px] leading-5 text-text-secondary">{rushLine}</Text> : null}
        </Card>
        <Card className="min-w-0 flex-1">
          <CardHead title="Orders by day" subtitle={`${count(k.totalOrders)} orders · ${money(k.avgOrderValue)} average bill`} />
          <ColumnChart points={orderPoints} height={160} format={count} labelEvery={orderPoints.length > 8 ? Math.ceil(orderPoints.length / 5) : 1} summary={`Orders by day, ${count(k.totalOrders)} in total`} />
        </Card>
      </View>

      <Gap />
      <View className="flex-row items-start gap-4">
        {([
          ['Best sellers', 'Most sold', [...data.itemWiseReport].sort((a, b) => b.qty - a.qty).slice(0, 5), (i: ProductInsight) => money(i.revenue), (i: ProductInsight) => `${count(i.qty)} sold`, (i: ProductInsight, top: number) => i.qty / top, (top: ProductInsight[]) => Math.max(1, ...top.map((x) => x.qty)), chart.series1],
          ['Top revenue', 'Earned the most', data.highestRevenueItems.slice(0, 5), (i: ProductInsight) => `${count(i.qty)} sold`, (i: ProductInsight) => money(i.revenue), (i: ProductInsight, top: number) => i.revenue / top, (top: ProductInsight[]) => Math.max(1, ...top.map((x) => x.revenue)), chart.series2],
          ['Slow movers', 'Fewest sold', data.leastSellingItems.slice(0, 5), (i: ProductInsight) => money(i.revenue), (i: ProductInsight) => `${count(i.qty)} sold`, (i: ProductInsight, top: number) => i.qty / top, () => Math.max(1, ...data.topSellingItems.map((x) => x.qty)), chart.series3],
        ] as const).map(([title, subtitle, list, detail, value, frac, topOf, color]) => {
          const top = topOf(list as ProductInsight[]);
          return (
            <Card key={title} className="min-w-0 flex-1">
              <CardHead title={title} subtitle={subtitle} />
              {list.length ? <View className="gap-3.5">{list.map((i) => <MeterRow key={i.item_name} label={i.item_name} value={value(i)} detail={detail(i)} fraction={frac(i, top)} color={color} />)}{title === 'Slow movers' ? <Text className="text-[13px] leading-5 text-text-secondary">Consider featuring these on the counter, or reviewing their place on the menu.</Text> : null}</View>
                : <Text className="py-6 text-[13px] text-text-secondary">No items in this period.</Text>}
            </Card>
          );
        })}
      </View>
      <View className="mt-4 flex-row items-center gap-3 rounded-t-2xl border border-b-0 border-border-soft bg-surface-elevated px-5 pb-3 pt-5">
        <View className="min-w-0 flex-1"><Text className="text-base font-bold leading-6 text-text-primary" accessibilityRole="header">Item sales</Text><Text className="text-xs text-text-secondary">{count(items.length)} items · {money(itemRevenue)} revenue, highest first</Text></View>
        <LegendKey color={chart.series1} label="Share of item revenue" />
      </View>
      <View className="flex-row border-x border-border-soft bg-surface-tint px-5 py-2">
        <Text className="flex-[3] text-xs font-bold uppercase text-text-secondary" style={{ letterSpacing: 0.6 }}>Item</Text>
        <Text className="flex-1 text-right text-xs font-bold uppercase text-text-secondary" style={{ letterSpacing: 0.6 }}>Qty sold</Text>
        <Text className="flex-1 text-right text-xs font-bold uppercase text-text-secondary" style={{ letterSpacing: 0.6 }}>Revenue</Text>
        <Text className="flex-[2] pl-6 text-xs font-bold uppercase text-text-secondary" style={{ letterSpacing: 0.6 }}>Share</Text>
      </View>
    </View>
  ) : null;

  const royalty = props.franchise;
  const fee = k ? (k.totalSales * royalty.rate) / 100 : 0;
  const footer = data && k && !empty ? (
    <View>
      <View className="h-3 rounded-b-2xl border border-t-0 border-border-soft bg-surface-elevated" />
      <Gap />
      <Card>
        <View className="flex-row flex-wrap items-center gap-6">
          <View className="min-w-0 flex-1">
            <Text className="text-base font-bold text-text-primary">{royalty.enabled ? `${royalty.rate.toFixed(1)}% royalty on gross sales` : 'Royalty tracking is off'}</Text>
            <Text className="text-xs text-text-secondary">{royalty.enabled ? 'The fee and store share for this period.' : 'Turn it on to see the fee and store share for a franchise branch.'}</Text>
          </View>
          {royalty.enabled ? (
            <View className="flex-row items-center gap-2">
              <Pressable accessibilityRole="button" accessibilityLabel="Lower royalty rate" onPress={royalty.onDecrease} className="h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-surface-tint"><Minus size={16} color={colors.textPrimary} /></Pressable>
              <Text className="w-14 text-center text-[15px] font-bold text-text-primary" style={tabular}>{royalty.rate.toFixed(1)}%</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Raise royalty rate" onPress={royalty.onIncrease} className="h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-surface-tint"><Plus size={16} color={colors.textPrimary} /></Pressable>
            </View>
          ) : null}
          <ToolButton label={royalty.enabled ? 'Turn off' : 'Turn on'} active={royalty.enabled} onPress={() => royalty.onToggle(!royalty.enabled)} />
        </View>
        {royalty.enabled ? (
          <View className="mt-5">
            <FlowBar segments={[{ label: 'Store share', value: k.totalSales - fee, color: chart.series1 }, { label: 'Royalty', value: fee, color: chart.series3 }]} />
            <View className="mt-4 flex-row gap-3">
              {([['Gross sales', k.totalSales, null], ['Store share', k.totalSales - fee, chart.series1], ['Royalty fee', fee, chart.series3]] as const).map(([label, value, swatch]) => (
                <View key={label} className="flex-1 flex-row gap-2.5"><View><View className="flex-row items-center gap-1.5">{swatch ? <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: swatch }} /> : null}<Text className="text-xs font-semibold text-text-secondary">{label}</Text></View><Text className="text-lg font-bold leading-6 text-text-primary" style={tabular}>{money(value)}</Text></View></View>
              ))}
            </View>
          </View>
        ) : null}
      </Card>
    </View>
  ) : null;

  return (
    <FlatList
      data={data && !empty ? sortedItems : []}
      keyExtractor={(i) => i.item_name}
      ListHeaderComponent={<View>{toolbar}{body}</View>}
      ListFooterComponent={footer}
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140, width: '100%', maxWidth: 1168, alignSelf: 'center' }}
      style={{ backgroundColor: chart.canvas }}
      renderItem={({ item, index }) => (
        <View className={`flex-row items-center border-x border-border-soft bg-surface-elevated px-5 py-2.5 ${index > 0 ? 'border-t' : ''}`} style={{ borderTopColor: chart.grid }}>
          <Text numberOfLines={1} className="flex-[3] text-[13px] font-semibold text-text-primary">{item.item_name}</Text>
          <Text className="flex-1 text-right text-[13px] text-text-secondary" style={tabular}>{count(item.qty)}</Text>
          <Text className="flex-1 text-right text-[13px] font-bold text-text-primary" style={tabular}>{money(item.revenue)}</Text>
          <View className="flex-[2] flex-row items-center gap-2 pl-6">
            <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: chart.grid }}><View className="h-full rounded-full" style={{ width: `${(sortedItems[0]?.revenue ?? 0) > 0 ? Math.max(1, (item.revenue / (sortedItems[0]?.revenue ?? 1)) * 100) : 0}%`, backgroundColor: chart.series1 }} /></View>
            <Text className="w-12 text-right text-xs text-text-secondary" style={tabular}>{itemRevenue > 0 ? `${((item.revenue / itemRevenue) * 100).toFixed(1)}%` : '—'}</Text>
          </View>
        </View>
      )}
    />
  );
}
