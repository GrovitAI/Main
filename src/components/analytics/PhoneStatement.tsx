import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Minus, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { chart, colors, semantic } from '@/lib/pos/brand';
import { figureSize } from '@/lib/pos/kitchen-utils';
import { IconButton, ScrollPills, Sheet, Toggle } from '@/components/kitchen/ui';
import { ColumnChart, FlowBar, LegendKey } from '@/components/analytics/StatementCharts';
import {
  Change, Delta, PRESETS, alignedDays, count, dayLabel, hourPointsOf, money, moneyTick, paymentSegments, previousFilters, rushLineOf, shortRange, tabular, usePreviousPeriod,
  type AnalyticsPreset, type AnalyticsStatementProps,
} from '@/components/analytics/AnalyticsStatement';
import type { ProductInsight } from '@/lib/analytics/analytics-service';

/** Items shown before "Show all". */
const TOP_ITEMS = 6;
/** The period row on a phone: the desktop presets, with Custom as "Dates". */
const PERIODS = PRESETS.map((p) => ({ value: p.id, label: p.id === 'custom' ? 'Dates' : p.label }));

function Card({ children, first = false }: { children: React.ReactNode; first?: boolean }) {
  return <View className={`rounded-[20px] border border-border-soft bg-surface-elevated p-4 ${first ? 'mt-3.5' : 'mt-4'}`}>{children}</View>;
}
function CardTitle({ title, right }: { title: string; right?: string | null }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="min-w-0 flex-1 text-lg font-bold text-text-primary" style={{ letterSpacing: -0.2 }} accessibilityRole="header">{title}</Text>
      {right ? <Text className="text-xs font-semibold text-text-secondary" style={tabular}>{right}</Text> : null}
    </View>
  );
}
function Line({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={`min-h-[44px] flex-row items-center justify-between gap-3 ${last ? '' : 'border-b border-border-soft'}`}>
      <Text className="min-w-0 flex-1 text-[15px] font-semibold text-text-primary">{label}</Text>
      <Text className="text-[15px] font-bold text-text-primary" style={tabular}>{value}</Text>
    </View>
  );
}
function TextLink({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      className={`min-h-[44px] justify-center px-1 ${disabled ? 'opacity-50' : 'active:opacity-60'}`}>
      <Text className="text-sm font-bold text-primary hover:underline" style={{ textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}
function ItemRow({ item, rank, top }: { item: ProductInsight; rank: number; top: number }) {
  return (
    <View className="flex-row items-center gap-3 border-t border-border-soft py-2.5">
      <Text className="w-[22px] text-[13px] font-bold text-text-secondary" style={tabular}>{rank}</Text>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{item.item_name}</Text>
        <View className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: chart.grid }}>
          <View className="h-full rounded-full" style={{ width: `${top > 0 ? Math.max(2, (item.revenue / top) * 100) : 0}%`, backgroundColor: chart.series1 }} />
        </View>
      </View>
      <View className="items-end">
        <Text className="text-[15px] font-bold text-text-primary" style={tabular}>{money(item.revenue)}</Text>
        <Text className="text-xs font-semibold text-text-secondary" style={tabular}>{count(item.qty)} sold</Text>
      </View>
    </View>
  );
}

/**
 * Task 261 (owner's pick, layout A): the desktop daily statement folded for a phone. Money first
 * as one figure with its change and what is still pending, then sales by day against the previous
 * period, how customers paid, when they come, what sold, and the exports as links. Branch, hours
 * and royalty sit in a filter sheet; the period is a row of equal pills.
 */
export function PhoneStatement(props: AnalyticsStatementProps) {
  const { data, loading, errorMsg, loadedFilters } = props;
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState(false);
  const [allItems, setAllItems] = useState(false);
  const { previous, compare } = usePreviousPeriod(loadedFilters);

  const k = data?.kpis;
  const pk = previous?.kpis;
  const prevRange = loadedFilters ? previousFilters(loadedFilters) : null;
  const compareRange = prevRange ? shortRange(prevRange.startDate, prevRange.endDate) : null;
  // The cards show the last completed load, so the scope line follows it, also while a new period loads.
  const onScreen = data && loadedFilters ? loadedFilters : null;
  const shownStart = onScreen ? onScreen.startDate : props.startDate;
  const shownEnd = onScreen ? onScreen.endDate : props.endDate;
  const shownBranchId = onScreen ? onScreen.branchId ?? null : props.selectedBranchId;
  const shownPeriod = shownStart && shownEnd ? shortRange(shownStart, shownEnd) : 'Choose dates';
  const branchName = shownBranchId ? props.branches.find((b) => b.id === shownBranchId)?.name ?? 'Your branch' : props.canPickBranch ? 'All branches' : 'Your branch';
  const stale = !!(errorMsg && data && loadedFilters);

  const days = useMemo(() => alignedDays(data, previous, loadedFilters), [data, previous, loadedFilters]);
  const dayPoints = useMemo(() => days.map((d) => ({ label: d.label, value: d.sales, ...(previous ? { previous: d.previousSales, ...(d.previousLabel ? { previousLabel: d.previousLabel } : {}) } : {}) })), [days, previous]);
  const busiestDay = dayPoints.reduce<{ label: string; value: number } | null>((best, p) => (!best || p.value > best.value ? p : best), null);
  const hourPoints = useMemo(() => hourPointsOf(data), [data]);
  const rushLine = useMemo(() => rushLineOf(data), [data]);
  const payments = useMemo(() => paymentSegments(data), [data]);
  const paymentTotal = payments.reduce((sum, p) => sum + p.value, 0);
  const sortedItems = useMemo(() => [...(data?.itemWiseReport ?? [])].sort((a, b) => b.revenue - a.revenue), [data]);
  const shownItems = allItems ? sortedItems : sortedItems.slice(0, TOP_ITEMS);
  const topRevenue = sortedItems[0]?.revenue ?? 0;
  const slow = (data?.leastSellingItems ?? []).slice(0, 3);
  const empty = !!k && k.totalOrders === 0 && k.totalSales === 0;
  const ready = !!(data && k && !empty);
  const royalty = props.franchise;
  const fee = k ? (k.totalSales * royalty.rate) / 100 : 0;

  const choosePeriod = (id: AnalyticsPreset): void => {
    // Dates opens the calendar; the period changes only when dates are applied.
    if (id === 'custom') props.onOpenDates();
    else props.onPreset(id);
  };

  const header = (
    <View>
      <View className="flex-row items-start justify-between gap-3 pt-2">
        <View className="min-w-0 flex-1">
          <Text className="text-[27px] font-bold leading-8 text-text-primary" style={{ letterSpacing: -0.5 }} accessibilityRole="header">Analytics</Text>
          <Text className="mt-0.5 text-sm font-semibold text-text-secondary" numberOfLines={1}>{branchName} · {shownPeriod}{loading ? ' · updating…' : stale ? ' · last good load' : ''}</Text>
        </View>
        <IconButton icon={SlidersHorizontal} label="Filters: branch, hours and royalty" onPress={() => setFilters(true)} />
      </View>
      <View className="mt-3"><ScrollPills label="Period" options={PERIODS} value={props.preset} onChange={choosePeriod} /></View>
      {props.exportNotice ? <Text accessibilityRole="alert" className="mt-2 text-[13px] text-text-secondary">{props.exportNotice}</Text> : null}
      {errorMsg && data ? (
        <View accessibilityRole="alert" className="mt-3 flex-row items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: semantic.warningSoft }}>
          <Text className="min-w-0 flex-1 text-[13px] font-semibold" style={{ color: semantic.warning }}>{errorMsg} These are the last figures that loaded.</Text>
          <TextLink label="Retry" onPress={props.onRetry} />
        </View>
      ) : null}
    </View>
  );

  const body = !data ? (
    <Card first>
      <View className="items-center py-10">
        {errorMsg ? <>
          <Text className="text-base font-bold text-text-primary">Analytics could not load</Text>
          <Text className="mt-1 text-center text-[13px] text-text-secondary">{errorMsg}</Text>
          <Pressable onPress={props.onRetry} accessibilityRole="button" className="mt-3 min-h-[44px] flex-row items-center gap-1.5 rounded-xl border border-border px-4 hover:bg-surface-tint active:bg-surface-tint">
            <RotateCcw size={15} color={colors.primary} /><Text className="text-sm font-bold text-primary">Try again</Text>
          </Pressable>
        </> : <><ActivityIndicator color={colors.primary} accessibilityLabel="Loading analytics" /><Text className="mt-3 text-[13px] text-text-secondary">Loading the figures…</Text></>}
      </View>
    </Card>
  ) : empty ? (
    <Card first>
      <View className="items-center py-10">
        <Text className="text-base font-bold text-text-primary">No sales · {shownPeriod}</Text>
        <Text className="mt-1 text-center text-[13px] leading-5 text-text-secondary">{branchName} recorded no sales then. Choose another period or branch.</Text>
      </View>
    </Card>
  ) : k ? (
    <View>
      <Card first>
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-sm font-semibold text-text-secondary">Sales</Text>
          <Delta current={k.totalSales} previous={pk?.totalSales} state={compare} against={compareRange ?? 'the previous period'} />
        </View>
        <Text className="mt-1.5 font-bold text-text-primary" style={{ fontSize: figureSize(money(k.totalSales), 44, 10, 30), lineHeight: 50, letterSpacing: -1.2, ...tabular }} numberOfLines={1}>{money(k.totalSales)}</Text>
        <View className="mt-3.5 flex-row">
          {([['Orders', count(k.totalOrders), k.totalOrders, pk?.totalOrders], ['Average bill', money(k.avgOrderValue), k.avgOrderValue, pk?.avgOrderValue], ['Items sold', count(k.itemsSold), k.itemsSold, pk?.itemsSold]] as const).map(([label, shown, value, was], i) => (
            <View key={label} className={`min-w-0 flex-1 ${i > 0 ? 'border-l border-border-soft pl-3' : ''}`}>
              <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{label}</Text>
              <Text className="text-[19px] font-bold text-text-primary" style={tabular} numberOfLines={1}>{shown}</Text>
              {compare === 'ready' && was !== undefined && was > 0 ? <Change change={(value - was) / was} /> : null}
            </View>
          ))}
        </View>
        <View className="mt-4"><FlowBar height={10} segments={[{ label: 'Collected', value: k.collectedRevenue, color: chart.series1 }, { label: 'Pending', value: k.pendingCollections, color: chart.pending }]} /></View>
        <View className="mt-2 flex-row flex-wrap justify-between gap-2">
          <LegendKey color={chart.series1} label={`Collected ${money(k.collectedRevenue)}`} />
          <LegendKey color={chart.pending} label={`Pending ${money(k.pendingCollections)}`} />
        </View>
      </Card>

      {/* One day has no day-by-day story; the hours below tell it. */}
      {dayPoints.length > 1 ? <Card>
        <CardTitle title="Sales by day" right={busiestDay && busiestDay.value > 0 ? `Best ${busiestDay.label} · ${money(busiestDay.value)}` : null} />
        <View className="mt-3">
          <ColumnChart points={dayPoints} height={150} format={money} formatTick={moneyTick}
            currentName={onScreen ? shortRange(onScreen.startDate, onScreen.endDate) : 'This period'} previousName={compareRange ?? 'Previous period'}
            summary={`Sales by day, ${dayPoints.length} days, best day ${busiestDay?.label ?? ''} at ${money(busiestDay?.value ?? 0)}`} />
        </View>
      </Card> : null}

      <Card>
        <CardTitle title="How customers paid" />
        {paymentTotal > 0 ? <>
          <View className="mt-3.5"><FlowBar height={14} segments={payments} /></View>
          <View className="mt-1.5">
            {payments.map((p, i) => (
              <View key={p.label} className={`min-h-[44px] flex-row items-center gap-2.5 ${i > 0 ? 'border-t border-border-soft' : ''}`}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: p.color }} />
                <Text className="min-w-0 flex-1 text-[15px] font-bold text-text-primary">{p.label}</Text>
                <Text className="text-[15px] font-bold text-text-primary" style={tabular}>{money(p.value)}</Text>
                <Text className="w-11 text-right text-[13px] font-semibold text-text-secondary" style={tabular}>{Math.round((p.value / paymentTotal) * 100)}%</Text>
              </View>
            ))}
          </View>
        </> : <Text className="py-6 text-center text-[13px] text-text-secondary">No payments recorded in this period.</Text>}
      </Card>

      <Card>
        <CardTitle title="When customers come" />
        {rushLine ? <Text className="mt-0.5 text-[13px] font-semibold leading-5 text-text-secondary">{rushLine}</Text> : null}
        <View className="mt-3">
          <ColumnChart points={hourPoints} height={120} format={money} formatTick={moneyTick} summary={`Sales by hour${rushLine ? `. ${rushLine}` : ''}`} />
        </View>
      </Card>

      <Card>
        <CardTitle title={`Also in ${loadedFilters && loadedFilters.startDate === loadedFilters.endDate ? 'this day' : 'this period'}`} />
        <View className="mt-1">
          <Line label="Discounts given" value={money(k.totalDiscounts)} />
          <Line label="GST collected" value={money(k.taxCollected)} />
          <Line label="Cancelled" value={`${count(k.cancelledOrders)} ${k.cancelledOrders === 1 ? 'bill' : 'bills'} · ${money(k.cancelledSales)}`} last />
        </View>
      </Card>

      <View className="mt-4 rounded-t-[20px] border border-b-0 border-border-soft bg-surface-elevated px-4 pb-1 pt-4">
        <CardTitle title="What sold" right={`${count(sortedItems.length)} ${sortedItems.length === 1 ? 'item' : 'items'} · by sales`} />
      </View>
    </View>
  ) : null;

  const footer = ready && k ? (
    <View>
      <View className="rounded-b-[20px] border border-t-0 border-border-soft bg-surface-elevated px-4 pb-2">
        {sortedItems.length > TOP_ITEMS ? (
          <View className="items-start border-t border-border-soft"><TextLink label={allItems ? 'Show the top six' : `Show all ${count(sortedItems.length)} items`} onPress={() => setAllItems((v) => !v)} /></View>
        ) : null}
      </View>
      {slow.length ? (
        <Card>
          <CardTitle title="Selling slowly" />
          <View className="mt-1">{slow.map((i, n) => <Line key={i.item_name} label={i.item_name} value={`${count(i.qty)} sold`} last={n === slow.length - 1} />)}</View>
        </Card>
      ) : null}
      {royalty.enabled ? (
        <Card>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-lg font-bold text-text-primary" accessibilityRole="header">Royalty</Text>
            <View className="flex-row items-center gap-1.5">
              <Pressable accessibilityRole="button" accessibilityLabel="Lower royalty rate" onPress={royalty.onDecrease} className="h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-surface-tint active:bg-surface-tint"><Minus size={16} color={colors.textPrimary} /></Pressable>
              <Text className="w-14 text-center text-[15px] font-bold text-text-primary" style={tabular}>{royalty.rate.toFixed(1)}%</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Raise royalty rate" onPress={royalty.onIncrease} className="h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-surface-tint active:bg-surface-tint"><Plus size={16} color={colors.textPrimary} /></Pressable>
            </View>
          </View>
          <View className="mt-3.5"><FlowBar height={10} segments={[{ label: 'Store share', value: k.totalSales - fee, color: chart.series1 }, { label: 'Royalty', value: fee, color: chart.series3 }]} /></View>
          <View className="mt-1.5">
            <Line label="Store share" value={money(k.totalSales - fee)} />
            <Line label="Royalty fee" value={money(fee)} last />
          </View>
        </Card>
      ) : null}
      {props.canExport && k.totalOrders > 0 ? (
        <View className="mt-4 flex-row flex-wrap justify-center gap-x-6">
          <TextLink label={props.exporting ? 'Preparing…' : 'Export transactions'} onPress={props.onExportTransactions} disabled={loading || props.exporting} />
          <TextLink label="Export item sales" onPress={props.onExportItems} disabled={loading} />
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <View className="flex-1" style={{ backgroundColor: chart.canvas, paddingTop: insets.top }}>
      <FlatList
        data={ready ? shownItems : []}
        keyExtractor={(i) => i.item_name}
        ListHeaderComponent={<View>{header}{body}</View>}
        ListFooterComponent={footer}
        renderItem={({ item, index }) => (
          <View className="border-x border-border-soft bg-surface-elevated px-4"><ItemRow item={item} rank={index + 1} top={topRevenue} /></View>
        )}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={props.onRetry} tintColor={colors.primary} />}
      />
      <Sheet visible={filters} onClose={() => setFilters(false)} title="Filters">
        <View style={{ gap: 6 }}>
          {props.canPickBranch && props.branches.length > 0 ? (
            <View>
              <Text className="mb-1 text-[13px] font-semibold text-text-secondary">Branch</Text>
              {[{ id: null as string | null, name: 'All branches' }, ...props.branches].map((b) => {
                const on = props.selectedBranchId === b.id;
                return (
                  <Pressable key={b.id ?? 'all'} onPress={() => props.onSelectBranch(b.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on}
                    className={`min-h-[48px] flex-row items-center gap-3 rounded-xl px-3 ${on ? 'bg-surface-tint' : 'hover:bg-accent-soft active:bg-accent-soft'}`}>
                    <Text className={`min-w-0 flex-1 text-[15px] text-text-primary ${on ? 'font-bold' : 'font-semibold'}`}>{b.name}</Text>
                    {on ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View className="mt-2 overflow-hidden rounded-2xl border border-border-soft" style={{ marginTop: 10 }}>
            <View style={{ marginTop: -1 }}>
              <Toggle label="Business hours only" hint={props.hours.enabled ? `${props.hours.start} to ${props.hours.end}` : 'Counts sales at any hour'} on={props.hours.enabled} onChange={props.hours.onToggle} />
              {props.hours.enabled ? (
                <View className="flex-row items-center gap-2 border-t border-border-soft px-3.5 py-2.5">
                  <Text className="text-[13px] font-semibold text-text-secondary">From</Text>
                  <TextInput accessibilityLabel="From time" value={props.hours.start} onChangeText={props.hours.onStart} placeholder="09:00" className="h-11 w-20 rounded-xl border border-border bg-surface-elevated px-3 text-[15px] text-text-primary" />
                  <Text className="text-[13px] font-semibold text-text-secondary">to</Text>
                  <TextInput accessibilityLabel="To time" value={props.hours.end} onChangeText={props.hours.onEnd} placeholder="23:00" className="h-11 w-20 rounded-xl border border-border bg-surface-elevated px-3 text-[15px] text-text-primary" />
                </View>
              ) : null}
              <Toggle label="Royalty" hint={royalty.enabled ? `${royalty.rate.toFixed(1)}% of sales, shown at the end` : 'Fee and store share for a franchise branch'} on={royalty.enabled} onChange={royalty.onToggle} />
            </View>
          </View>
          {shownStart && shownEnd ? <Text className="mt-2 text-xs text-text-secondary">Showing {shownStart === shownEnd ? dayLabel(shownStart) : `${dayLabel(shownStart, false)} – ${dayLabel(shownEnd)}`}. Change the period with the pills above the figures.</Text> : null}
        </View>
      </Sheet>
    </View>
  );
}
