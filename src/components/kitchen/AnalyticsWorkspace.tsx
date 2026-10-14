import { useEffect, useMemo, useRef, useState } from 'react';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';
import { ActivityIndicator, Animated, FlatList, Modal, Platform, Pressable, Share, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Download, Info, RefreshCw, Settings2, Package, ShoppingBasket, Receipt, MoreHorizontal, X } from 'lucide-react-native';
import { colors, semantic } from '@/lib/pos/brand';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { fetchKitchenReport, KITCHEN_REPORT_PAGE_SIZE } from '@/lib/pos/kitchen-analytics-service';
import { kitchenMonthRange, kitchenRangeLabel, kitchenReportCsv, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import type { KitchenDateRange } from '@/lib/pos/kitchen-analytics-utils';
import type { KitchenReport, KitchenReportFilter, KitchenReportKind, KitchenReportRow } from '@/lib/pos/kitchen-analytics-types';
import { formatMoney } from '@/lib/pos/kitchen-utils';
import { Empty, KScreen, Notice, Reveal, useEnterOnChange, useSlidingRect } from '@/components/kitchen/ui';
import { ReportSelect } from '@/components/kitchen/ReportSelect';
import { ReportDateRange } from '@/components/kitchen/ReportDateRange';

const money = (paise: number): string => formatMoney(paise / 100);
const tabular = { fontVariant: ['tabular-nums' as const] };
const controls = 'min-h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-xl px-3 py-2 hover:bg-accent-soft active:opacity-60 focus:border focus:border-primary';
const ALL_TABS: readonly { id: KitchenReportKind; label: string }[] = [{ id: 'sales', label: 'Sales' }, { id: 'purchases', label: 'Purchases' }, { id: 'cash', label: 'Cash' }, { id: 'bank', label: 'Bank' }, { id: 'profit', label: 'Profit' }];
/** Cash and Bank are both money-movement registers: no drill-down, no filters, received/paid columns. */
const isMoney = (kind: KitchenReportKind): boolean => kind === 'cash' || kind === 'bank';
/** Only Sales and Purchases have branch, item, vendor or category filters and a drill-down. */
const hasFilters = (kind: KitchenReportKind): boolean => kind === 'sales' || kind === 'purchases';
const percent = (part: number, whole: number): string => whole > 0 ? Math.round(part / whole * 100) + '%' : '—';

export function AnalyticsWorkspace() {
  const insets = useSafeAreaInsets();
  const kitchenAccess = useKitchenAccess();
  const mayExport = kitchenAccess.can('reports.export');
  const mayInvoices = kitchenAccess.can('invoices.create') || kitchenAccess.can('invoices.receive') || kitchenAccess.can('invoices.cancel');
  // Profit is all amounts; a quantities-only login does not get the tab.
  const tabs = ALL_TABS.filter(tab => tab.id !== 'profit' || kitchenAccess.showAmounts);
  const { width } = useWindowDimensions();
  const [reportWidth, setReportWidth] = useState(width);
  // The sidebar and phone frame reduce the actual space available to reports.
  const desktop = Platform.OS === 'web' && reportWidth >= 700;
  const toolbar = Platform.OS === 'web' && reportWidth >= 840;
  const inlineFilters = reportWidth >= 640;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const session = useSessionStore(state => state.session);
  const { tenant_id } = getTenantContext();
  const branchId = kitchenBranch().id;
  const today = kitchenToday();
  const [dateRange, setDateRange] = useState<KitchenDateRange>(() => kitchenMonthRange(today.slice(0, 7), today));
  const month = dateRange.startDate.slice(0, 7);
  const [kind, setKind] = useState<KitchenReportKind>('sales');
  // The blue report highlight slides between tabs (task 214).
  const tabSlide = useSlidingRect(tabs.findIndex(tab => tab.id === kind));
  const [partyId, setPartyId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [includeExpenses, setIncludeExpenses] = useState(false);
  const [detail, setDetail] = useState(false);
  const salesColumns = desktop && kind === 'sales' && !detail;
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<KitchenReport | null>(null);
  // Each report that arrives fades its rows and totals up into place (task 215).
  const reportsShown = useRef(0);
  const reportEnter = useEnterOnChange(report ? String(reportsShown.current) : 'loading');
  const [filterOptions, setFilterOptions] = useState<KitchenReport['options']>({ branches: [], items: [], vendors: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  const drillBase = useRef<{ partyId: string | null; itemId: string | null; category: string | null } | null>(null);
  const filter = useMemo<KitchenReportFilter>(() => ({ month, ...dateRange, report: kind, partyId, itemId, category, includeExpenses, detail, page }), [month, dateRange, kind, partyId, itemId, category, includeExpenses, detail, page]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setExportError(null); setReport(null);
    void fetchKitchenReport(filter, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (!result.data || result.error) { setError(result.error ?? 'Unable to load this report.'); return; }
      reportsShown.current += 1; setReport(result.data); setFilterOptions(result.data.options);
    });
    return () => controller.abort();
  }, [filter, refresh, tenant_id, branchId, session?.userId]);
  useEffect(() => {
    exportController.current?.abort(); setExporting(false);
    return () => exportController.current?.abort();
  }, [filter, tenant_id, branchId]);

  const resetFilters = () => { setPartyId(null); setItemId(null); setCategory(null); setPage(0); setDetail(false); drillBase.current = null; };
  const changeDates = (next: KitchenDateRange) => {
    if (next.startDate === dateRange.startDate && next.endDate === dateRange.endDate) return;
    resetFilters(); setFilterOptions({ branches: [], items: [], vendors: [], categories: [] }); setDateRange(next);
  };
  const changeMonth = (next: string) => changeDates(kitchenMonthRange(next, today));
  const chooseReport = (next: KitchenReportKind) => { resetFilters(); setKind(next); };
  const inspect = (row: KitchenReportRow) => {
    if (detail || !hasFilters(kind)) return;
    drillBase.current = { partyId, itemId, category };
    if (kind === 'sales') { setPartyId(row.party_id); setItemId(row.item_id); } else setCategory(row.category);
    setDetail(true); setPage(0);
  };
  const closeDetail = () => {
    const base = drillBase.current;
    if (base) { setPartyId(base.partyId); setItemId(base.itemId); setCategory(base.category); }
    setDetail(false); setPage(0); drillBase.current = null;
  };
  const exportCsv = async () => {
    if (loading || exporting || !report || report.total_rows === 0) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true); setExportError(null);
    try {
      const result = await fetchKitchenReport(filter, controller.signal, true);
      if (controller.signal.aborted) return;
      if (!result.data || result.error) { setExportError(result.error ?? 'Unable to export this report.'); return; }
      const csv = kitchenReportCsv(result.data, filter);
      if (Platform.OS === 'web') {
        // Use the same browser download mechanism as the main Analytics module.
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url; link.download = 'kitchen-' + kind + '-' + dateRange.startDate + '-to-' + dateRange.endDate + '.csv';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({ title: 'Kitchen ' + kind + ' ' + kitchenRangeLabel(dateRange), message: csv });
    } catch {
      if (!controller.signal.aborted) setExportError('Unable to export. Please try again.');
    } finally {
      if (exportController.current === controller) { exportController.current = null; setExporting(false); }
    }
  };
  const title = kind === 'sales' ? 'Item sales to branches' : kind === 'purchases' ? includeExpenses ? 'All spending by category' : 'Purchases by category' : kind === 'bank' ? 'Bank and UPI received and paid' : kind === 'profit' ? 'Profit by finished good' : 'Cash received and paid';
  const summary = report?.summary;
  const metrics = [
    { label: 'Sales to branches', value: summary?.sales_paise, Icon: Package },
    { label: 'Purchases', value: summary?.purchases_paise, Icon: ShoppingBasket },
    { label: 'Other expenses', value: summary?.expenses_paise, Icon: Receipt },
  ];
  // Keep exact large amounts readable instead of shrinking them to fit a phone column.
  const stackedMetrics = !desktop && metrics.some(metric => metric.value !== undefined && money(metric.value).length * 11 > (reportWidth - 110) / 3);
  const activeFilters = Number(partyId !== null) + Number(itemId !== null) + Number(category !== null) + Number(kind === 'purchases' && includeExpenses);
  const filterSummary = [
    kind === 'purchases' && includeExpenses ? 'Purchases + other expenses' : null,
    partyId ? [...filterOptions.branches, ...filterOptions.vendors].find(option => option.id === partyId)?.label : null,
    itemId ? filterOptions.items.find(option => option.id === itemId)?.label : null,
    category,
  ].filter(Boolean).join(' · ');
  const datePicker = <ReportDateRange value={dateRange} onChange={changeDates} />;
  const monthControls = <View className="min-w-0 max-w-[380px] flex-row items-center gap-1">
    <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(shiftKitchenMonth(month, -1))} className={controls}><ChevronLeft size={18} color={colors.primary} /></Pressable>
    <View className="min-w-0 shrink">{datePicker}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: month >= today.slice(0, 7) }} disabled={month >= today.slice(0, 7)} onPress={() => changeMonth(shiftKitchenMonth(month, 1))} className={controls + (month >= today.slice(0, 7) ? ' opacity-40' : '')}><ChevronRight size={18} color={colors.primary} /></Pressable>
  </View>;
  const infoButton = <Pressable accessibilityRole="button" accessibilityLabel="About these reports" accessibilityState={{ expanded: notesOpen }} onPress={() => setNotesOpen(value => !value)} className={controls}>
          <Info size={18} color={colors.primary} />
        </Pressable>;
  const headerActions = <View className="flex-row gap-1">
        {desktop && kind === 'sales' && mayInvoices ? <Pressable accessibilityRole="button" accessibilityLabel="Branch invoices" onPress={() => router.push({ pathname: '/central-kitchen/invoices', params: { start: dateRange.startDate, end: dateRange.endDate, ...(partyId ? { party: partyId } : {}) } } as never)} className={controls}>
          <Receipt size={18} color={colors.primary} /><Text className="text-sm font-bold text-primary">Invoices</Text>
        </Pressable> : null}
        {desktop ? infoButton : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh reports" disabled={loading} onPress={() => setRefresh(value => value + 1)} className={controls + (loading ? ' opacity-40' : '')}>
          <RefreshCw size={18} color={colors.primary} />
        </Pressable>
  </View>;
  const exportButton = <Pressable accessibilityRole="button" accessibilityLabel="Export report CSV" disabled={loading || exporting || !report?.total_rows} onPress={() => void exportCsv()}
    className={controls + ((loading || exporting || !report?.total_rows) ? ' opacity-40' : '')}>
    {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Download size={17} color={colors.primary} />}
    <Text className="text-sm font-bold text-primary">{desktop ? 'Export CSV' : Platform.OS === 'web' ? 'CSV' : 'Share'}</Text>
  </Pressable>;
  const currentRange = kitchenMonthRange(today.slice(0, 7), today);
  const currentMonth = dateRange.startDate === currentRange.startDate && dateRange.endDate === currentRange.endDate;
  const period = <Text className="text-xs text-text-secondary">{currentMonth ? 'Month to date · through ' + today : kitchenRangeLabel(dateRange)} · India time</Text>;
  const rowCountLabel = kind === 'profit' ? report?.total_rows === 1 ? 'finished good' : 'finished goods'
    : detail || isMoney(kind) ? report?.total_rows === 1 ? 'row' : 'rows'
    : kind === 'sales' ? desktop ? report?.total_rows === 1 ? 'item / branch combination' : 'item / branch combinations' : report?.total_rows === 1 ? 'combination' : 'combinations'
    : report?.total_rows === 1 ? 'category' : 'categories';
  const reportTotal = report ? isMoney(kind)
    ? <><Text style={{ color: semantic.success }}>{'Received ' + money(report.filtered_in_paise)}</Text>{' · '}<Text style={{ color: semantic.danger }}>{'Paid ' + money(report.filtered_out_paise)}</Text></>
    : kind === 'profit' ? 'Sales ' + money(report.filtered_paise) + ' · cost ' + money(report.summary.cost_paise)
    : (desktop || activeFilters || detail ? 'Filtered total ' : 'Report total ') + money(report.filtered_paise) : null;
  const reportActions = [
    ...(kind === 'sales' && mayInvoices ? [{ id: 'invoices', label: 'Branch invoices', Icon: Receipt, disabled: false, action: () => router.push({ pathname: '/central-kitchen/invoices', params: { start: dateRange.startDate, end: dateRange.endDate, ...(partyId ? { party: partyId } : {}) } } as never) }] : []),
    ...(mayExport ? [{ id: 'export', label: exporting ? 'Exporting report…' : Platform.OS === 'web' ? 'Export CSV' : 'Share report', Icon: Download, disabled: loading || exporting || !report?.total_rows, action: () => void exportCsv() }] : []),
    { id: 'refresh', label: 'Refresh reports', Icon: RefreshCw, disabled: loading, action: () => setRefresh(value => value + 1) },
    { id: 'info', label: 'About these reports', Icon: Info, disabled: false, action: () => setNotesOpen(value => !value) },
  ];
  const listHeader = (
    <View className="gap-2" style={{ paddingTop: Math.max(insets.top, 8) }}>
      <View testID="kitchen-report-selector" className="flex-row items-center justify-between gap-2 rounded-xl bg-surface-elevated p-1">
        <View className={'flex-row gap-1 ' + (desktop ? '' : 'flex-1')}>
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 12, backgroundColor: colors.primary, ...tabSlide.style }} />
          {tabs.map((tab, i) => (
            <Pressable key={tab.id} accessibilityRole="tab" aria-selected={kind === tab.id} accessibilityState={{ selected: kind === tab.id }} onPress={() => chooseReport(tab.id)} onLayout={tabSlide.measure(i)}
              className={'min-h-12 items-center justify-center rounded-xl px-3 active:opacity-70 focus:border focus:border-primary ' + (desktop ? 'min-w-[80px] ' : 'flex-1 ') + (kind === tab.id ? '' : 'hover:bg-accent-soft')}>
              <Text className={'text-sm font-bold ' + (kind === tab.id ? 'text-text-on-primary' : 'text-text-secondary')}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        {desktop ? headerActions : null}
      </View>
      <View testID="kitchen-report-period" className={'gap-1 rounded-xl border border-border-soft bg-surface-elevated py-1 ' + (desktop ? 'px-3' : 'px-1')}>
        <View className="flex-row items-center justify-between gap-1">
          <View className="min-w-0 shrink">{inlineFilters ? monthControls : datePicker}</View>
          {toolbar ? <View className="min-w-0 shrink">{period}</View> : null}
          <View className="shrink-0 flex-row items-center gap-1">
            {inlineFilters && !currentMonth ? <Pressable accessibilityRole="button" onPress={() => changeMonth(today.slice(0, 7))} className={controls}><Text className="text-xs font-bold text-primary">This month</Text></Pressable> : null}
            {hasFilters(kind) ? <Pressable accessibilityRole="button" accessibilityLabel="Report filters" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} className={controls}>
              <Settings2 size={16} color={colors.primary} /><Text className="text-sm font-bold text-primary">{filtersOpen ? 'Hide filters' : 'Filters'}{activeFilters ? ' (' + activeFilters + ')' : ''}</Text>
            </Pressable> : null}
          </View>
        </View>
        {desktop && !toolbar ? <Text className="px-3 text-xs leading-4 text-text-secondary">{currentMonth ? 'Through ' + today + ' · India time' : 'Inclusive dates · India time'}</Text> : null}
        <Reveal open={filtersOpen && hasFilters(kind)}><View className="gap-1">
        {filterSummary ? <Text className="text-xs leading-5 text-text-secondary">{filterSummary}</Text> : null}
        <View className={'mt-1 gap-2 ' + (inlineFilters ? 'flex-row' : '')}>
          {kind === 'sales' ? <>
            <ReportSelect compact={inlineFilters} label="Branch" value={partyId} options={filterOptions.branches} onChange={id => { setPartyId(id); setPage(0); }} emptyLabel="All branches" />
            <ReportSelect compact={inlineFilters} label="Item" value={itemId} options={filterOptions.items} onChange={id => { setItemId(id); setPage(0); }} emptyLabel="All items" />
          </> : kind === 'purchases' ? <>
            <ReportSelect compact={inlineFilters} label="Spending" value={includeExpenses ? 'all' : null} options={[{ id: 'all', label: 'Purchases + other expenses' }]} emptyLabel="Purchases only" onChange={id => { setIncludeExpenses(id === 'all'); setCategory(null); setPage(0); }} />
            <ReportSelect compact={inlineFilters} label="Category" value={category} options={filterOptions.categories} onChange={id => { setCategory(id); setPage(0); }} emptyLabel="All categories" />
            <ReportSelect compact={inlineFilters} label="Vendor" value={partyId} options={filterOptions.vendors} onChange={id => { setPartyId(id); setPage(0); }} emptyLabel="All vendors" />
            {inlineFilters ? <Pressable accessibilityRole="button" accessibilityLabel="Manage purchase categories" onPress={() => router.push('/central-kitchen/purchase-categories')} className={controls + ' self-center'}><Settings2 size={18} color={colors.primary} /></Pressable> : null}
          </> : null}
        </View>
        {kind === 'purchases' && !inlineFilters ? <Pressable accessibilityRole="button" onPress={() => router.push('/central-kitchen/purchase-categories')} className={controls + ' mt-1 self-start'}>
          <Settings2 size={16} color={colors.primary} /><Text className="text-xs font-bold text-primary">Manage purchase categories</Text>
        </Pressable> : null}
        </View></Reveal>
      </View>
        {kind === 'profit' && summary ? <Animated.View style={reportEnter}><ProfitStatement summary={summary} desktop={desktop} /></Animated.View> : null}
        {kind === 'profit' ? null : <Animated.View style={reportEnter}><View testID="kitchen-report-kpis" className={stackedMetrics ? 'gap-2' : 'flex-row gap-2'}>
          {metrics.map(metric => <View key={metric.label} className={'min-w-0 rounded-xl border border-border-soft bg-surface-elevated py-2 ' + (desktop ? 'px-3 ' : 'px-2 ') + (stackedMetrics ? 'flex-row flex-wrap items-center justify-between gap-2' : 'flex-1 gap-1')}>
            <View className={'gap-1 ' + (desktop || stackedMetrics ? 'flex-row items-center' : '')}>
              {desktop ? <metric.Icon size={15} color={colors.primary} /> : null}
              <Text className="text-xs font-semibold leading-4 text-text-secondary">{metric.label}</Text>
            </View>
            <Text className={'text-base font-bold text-text-primary ' + (desktop ? '' : 'leading-5')} style={tabular}>{metric.value === undefined ? '—' : money(metric.value)}</Text>
          </View>)}
        </View></Animated.View>}
      <Reveal open={notesOpen}><View className="gap-1 rounded-xl bg-surface-elevated p-3">
        <Text className="text-xs font-bold text-text-primary">{kitchenBranch().name}</Text>
        {!desktop ? period : null}
        <Text className="text-xs leading-5 text-text-secondary">{kind === 'profit'
          ? 'Profit = sales to branches − cost of goods sent − other expenses. Each send keeps the cost per unit of its day; sends from before a cost was set use today’s cost.'
          : 'Goods supplied are kitchen sales. Purchases include credit buys; see Profit for what the kitchen made.'}</Text>
        <Text className="text-xs leading-5 text-text-secondary">{kind === 'cash'
          ? 'Cash entries by entry date, with money moved to or from the bank. Opening balances are excluded.'
          : kind === 'bank'
          ? 'UPI and bank entries by entry date, with cash deposited or withdrawn. Opening balances are excluded.'
          : kind === 'profit'
          ? 'Purchases are not subtracted again: their cost is inside each finished good’s cost per unit. Set costs under Finished goods.'
          : kind === 'sales' ? 'Quantities keep their own units. Select a row to see its send entries.'
          : 'Select a category to see its entries. Later vendor payments are counted in Cash, not purchases.'}</Text>
      </View></Reveal>
      <View testID="kitchen-report-heading" className={desktop ? 'gap-1 rounded-xl bg-surface-elevated px-3 py-2' : 'gap-1 rounded-t-xl bg-surface-elevated px-3 py-1'}>
        <View className="flex-row items-center justify-between gap-1">
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" className="text-sm font-bold leading-5 text-text-primary">{detail ? 'Recorded entries' : title}</Text>
            {!desktop && report ? <Text className="text-xs leading-4 text-text-secondary" style={tabular}>{reportTotal}{' · '}{report.total_rows} {rowCountLabel}</Text> : null}
          </View>
          {desktop ? (mayExport ? exportButton : null) : <Pressable accessibilityRole="button" accessibilityLabel="Report actions" accessibilityState={{ expanded: actionsOpen }} onPress={() => setActionsOpen(true)} className={controls + ' shrink-0'}>
            {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <MoreHorizontal size={20} color={colors.primary} />}
          </Pressable>}
        </View>
        {detail ? <Pressable accessibilityRole="button" onPress={closeDetail} className={controls + ' mt-2 self-start'}><ChevronLeft size={16} color={colors.primary} /><Text className="text-sm font-bold text-primary">Back to breakdown</Text></Pressable> : null}
        {desktop && report ? <View className="mt-1 flex-row flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-2">
          <Text className="text-sm font-bold text-text-primary" style={tabular}>{reportTotal}</Text>
          <Text className="text-xs text-text-secondary">{report.total_rows} {rowCountLabel}</Text>
        </View> : null}
      </View>
      {exportError ? <Notice text={exportError} /> : null}
      {error ? <Notice text={error} action={<Pressable accessibilityRole="button" onPress={() => setRefresh(value => value + 1)} className={controls}><Text className="font-bold text-primary">Retry</Text></Pressable>} /> : null}
      {loading ? <View className="flex-row items-center gap-3 rounded-xl bg-surface-elevated p-5" accessibilityLiveRegion="polite"><ActivityIndicator color={colors.primary} /><Text className="text-sm text-text-secondary">Loading report…</Text></View> : null}
      {desktop && report?.rows.length ? <View className="flex-row gap-4 rounded-t-xl bg-surface-elevated px-4 pt-2">
        <Text className="min-w-0 flex-1 text-xs font-bold text-text-secondary">{kind === 'profit' ? 'Finished good' : salesColumns ? 'Branch' : detail || isMoney(kind) ? 'Entry / source' : 'Category / source'}</Text>
        {salesColumns ? <Text className="min-w-0 flex-1 text-xs font-bold text-text-secondary">Item</Text> : null}
        {kind === 'profit' ? ['Quantity', 'Sales', 'Cost', 'Profit'].map(label => <Text key={label} className="w-28 text-right text-xs font-bold text-text-secondary">{label}</Text>) : <>
        <Text className={(salesColumns ? 'min-w-0 flex-1' : 'w-28') + ' text-right text-xs font-bold text-text-secondary'}>{kind === 'sales' ? 'Quantity' : 'Entries'}</Text>
        <Text className={(salesColumns ? 'min-w-0 flex-1' : 'w-32') + ' text-right text-xs font-bold text-text-secondary'}>{isMoney(kind) ? 'Received / paid' : 'Value'}</Text>
        </>}
      </View> : null}
    </View>
  );
  return (
    <KScreen scroll={false}>
      <FlatList data={report?.rows ?? []} keyExtractor={row => row.key} className={'w-full flex-1 self-center ' + (desktop ? 'max-w-[1120px] px-4' : 'max-w-[720px] px-3')}
        onLayout={event => setReportWidth(event.nativeEvent.layout.width)}
        ListHeaderComponent={listHeader} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={!loading && !error ? <Animated.View style={reportEnter}><View className="rounded-xl bg-surface-elevated"><Empty title="No entries for this selection" body="Choose another month or clear the filters. New kitchen entries will appear here after you refresh." action={<Pressable accessibilityRole="button" onPress={resetFilters} className={controls}><Text className="font-bold text-primary">Clear filters</Text></Pressable>} /></View></Animated.View> : null}
        renderItem={({ item }) => <Animated.View style={reportEnter}>{kind === 'profit' ? <ProfitRow row={item} desktop={desktop} /> : <ReportRow row={item} desktop={desktop} availableWidth={reportWidth} detail={detail} reportKind={kind} total={report?.filtered_paise ?? 0} onPress={() => inspect(item)} />}</Animated.View>}
        ListFooterComponent={report?.total_rows ? <View className="mt-3 flex-row items-center justify-between gap-2">
          <Pressable accessibilityRole="button" disabled={page === 0 || loading} onPress={() => setPage(value => value - 1)} className={controls + (page === 0 || loading ? ' opacity-40' : '')}><Text className="font-bold text-primary">Previous</Text></Pressable>
          <Text className="text-xs text-text-secondary">Page {page + 1} of {Math.ceil(report.total_rows / KITCHEN_REPORT_PAGE_SIZE)}</Text>
          <Pressable accessibilityRole="button" disabled={(page + 1) * KITCHEN_REPORT_PAGE_SIZE >= report.total_rows || loading} onPress={() => setPage(value => value + 1)} className={controls + ((page + 1) * KITCHEN_REPORT_PAGE_SIZE >= report.total_rows || loading ? ' opacity-40' : '')}><Text className="font-bold text-primary">Next</Text></Pressable>
        </View> : null} />
      <Modal visible={actionsOpen && !desktop} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: colors.overlay, paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) }}>
          <Pressable accessible={false} tabIndex={-1} onPress={() => setActionsOpen(false)} className="absolute inset-0" />
          <View accessibilityViewIsModal className="max-h-[88%] w-full max-w-[372px] rounded-2xl bg-surface-elevated p-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text accessibilityRole="header" className="text-base font-bold text-text-primary">Report actions</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close report actions" onPress={() => setActionsOpen(false)} className={controls}><X size={20} color={colors.textSecondary} /></Pressable>
            </View>
            <FlatList data={reportActions} keyExtractor={item => item.id} className="shrink" keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: item.disabled }} disabled={item.disabled}
                onPress={() => { setActionsOpen(false); item.action(); }} className={'min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-3 hover:bg-accent-soft active:bg-accent-soft focus:border focus:border-primary ' + (item.disabled ? 'opacity-40' : '')}>
                <item.Icon size={18} color={colors.primary} /><Text className="min-w-0 flex-1 text-sm font-semibold text-primary">{item.label}</Text>
              </Pressable>} />
          </View>
        </View>
      </Modal>
    </KScreen>
  );
}

function ReportRow({ row, desktop, availableWidth, detail, reportKind, total, onPress }: { row: KitchenReportRow; desktop: boolean; availableWidth: number; detail: boolean; reportKind: KitchenReportKind; total: number; onPress: () => void }) {
  const interactive = !detail && !isMoney(reportKind);
  const salesColumns = desktop && reportKind === 'sales' && !detail;
  const title = row.kind === 'category' ? row.category ?? 'Uncategorized' : row.item ? row.party + ' · ' + row.item : row.party;
  const subtitle = [row.date, row.source, row.category && row.kind !== 'category' ? row.category : null, row.payment, row.mode?.toUpperCase()].filter(Boolean).join(' · ');
  const secondary = row.quantity !== null ? row.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + (row.unit ?? '') : row.documents + ' ' + (row.documents === 1 ? 'entry' : 'entries');
  const value = isMoney(reportKind) ? (row.money_in_paise > 0 ? 'Received ' + money(row.money_in_paise) : 'Paid ' + money(row.money_out_paise)) : money(row.amount_paise);
  const figures = <>
    <View className={salesColumns ? 'min-w-0 flex-1 items-end' : 'w-28 items-end'}>
      <Text className="text-sm text-text-secondary" style={tabular}>{secondary}</Text>
    </View>
    <View className={salesColumns ? 'min-w-0 flex-1 items-end' : 'w-32 items-end'}>
      <Text className="text-sm font-bold" style={{ ...tabular, color: isMoney(reportKind) ? row.money_in_paise > 0 ? semantic.success : semantic.danger : colors.textPrimary }}>{value}</Text>
      {row.kind === 'category' ? <Text className="mt-1 text-xs text-text-secondary" style={tabular}>{total > 0 ? (row.amount_paise / total * 100).toFixed(1) : '0.0'}% of selection</Text> : null}
    </View>
  </>;
  const desktopBody = (
    <>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-text-primary">{salesColumns ? row.party : title}</Text>
        {!salesColumns ? <Text className="text-xs leading-4 text-text-secondary">{subtitle}</Text> : null}
        {row.kind === 'category' ? <View className="mt-1 h-1 max-w-[240px] overflow-hidden rounded-full bg-surface-tint"><View className="h-full rounded-full bg-primary" style={{ width: total > 0 ? Math.min(100, row.amount_paise / total * 100) + '%' as `${number}%` : '0%' }} /></View> : null}
      </View>
      {salesColumns ? <View className="min-w-0 flex-1"><Text className="text-sm font-bold text-text-primary">{row.item}</Text><Text className="text-xs leading-4 text-text-secondary">{subtitle}</Text></View> : null}
      {figures}
    </>
  );
  const mobileValue = isMoney(reportKind) ? money(row.money_in_paise > 0 ? row.money_in_paise : row.money_out_paise) : money(row.amount_paise);
  const categoryShare = (total > 0 ? row.amount_paise / total * 100 : 0).toFixed(1) + '% of selection';
  const mobileSubtitle = row.kind === 'category' ? secondary + ' · ' + categoryShare
    : !detail && reportKind === 'sales' ? row.party : [row.item ? row.party : null, subtitle].filter(Boolean).join(' · ');
  const mobileSecondary = isMoney(reportKind) ? row.money_in_paise > 0 ? 'Received' : 'Paid' : row.quantity !== null ? secondary : null;
  // Grow into a full-width figure row for exact large values instead of truncating or shrinking.
  const stackedRow = !desktop && Math.max(mobileValue.length * 9, (mobileSecondary?.length ?? 0) * 7) > (availableWidth - 48) * 0.44;
  const mobileBody = <>
    <View className={stackedRow ? 'min-w-0' : 'min-w-0 flex-1'}>
      <Text className="text-sm font-bold leading-5 text-text-primary">{row.kind === 'category' ? title : row.item ?? row.party}</Text>
      {mobileSubtitle ? <Text className="text-xs leading-4 text-text-secondary">{mobileSubtitle}</Text> : null}
    </View>
    <View className={stackedRow ? 'min-w-0 flex-row flex-wrap items-center justify-between gap-2' : 'min-w-0 max-w-[44%] shrink-0 items-end'}>
      <Text className="text-sm font-bold leading-5" style={{ ...tabular, color: isMoney(reportKind) ? row.money_in_paise > 0 ? semantic.success : semantic.danger : colors.textPrimary }}>{mobileValue}</Text>
      {mobileSecondary ? <Text className="text-xs leading-4 text-text-secondary" style={tabular}>{mobileSecondary}</Text> : null}
    </View>
  </>;
  const body = desktop ? desktopBody : mobileBody;
  const classes = 'border-b border-border-soft bg-surface-elevated py-2 ' + (desktop ? 'min-h-[52px] flex-row items-center gap-4 px-4' : 'min-h-[62px] px-3 ' + (stackedRow ? 'gap-2' : 'flex-row items-center gap-3'));
  return interactive ? <Pressable testID="kitchen-report-row" onPress={onPress} accessibilityRole="button" accessibilityLabel={'View entries for ' + title} className={classes + ' hover:bg-accent-soft active:bg-accent-soft focus:border focus:border-primary'}>{body}</Pressable> : <View testID="kitchen-report-row" className={classes}>{body}</View>;
}

/** The period's profit as a short statement: what came in, what it cost, what is left. */
function ProfitStatement({ summary, desktop }: { summary: KitchenReport['summary']; desktop: boolean }) {
  const gross = summary.sales_paise - summary.cost_paise;
  const profit = gross - summary.expenses_paise;
  const lines: readonly { label: string; value: number; sign?: '−' | '='; strong?: boolean; note?: string }[] = [
    { label: 'Sales to branches', value: summary.sales_paise },
    { label: 'Cost of goods sent', value: summary.cost_paise, sign: '−' },
    { label: 'Gross profit', value: gross, sign: '=', strong: true, note: percent(gross, summary.sales_paise) },
    { label: 'Other expenses', value: summary.expenses_paise, sign: '−' },
    { label: 'Profit for the period', value: profit, sign: '=', strong: true, note: percent(profit, summary.sales_paise) },
  ];
  return <View testID="kitchen-profit-statement" className={'gap-2 rounded-xl border border-border-soft bg-surface-elevated py-3 ' + (desktop ? 'px-4' : 'px-3')}>
    {summary.cost_missing_items > 0 ? <View className="gap-2 rounded-lg bg-surface-tint p-3">
      <Text className="text-sm font-semibold leading-5 text-text-primary">{summary.cost_missing_items === 1 ? '1 finished good sent has no cost yet' : summary.cost_missing_items + ' finished goods sent have no cost yet'} ({money(summary.cost_missing_sales_paise)} of sales).</Text>
      <Text className="text-xs leading-5 text-text-secondary">Their cost counts as zero here, so profit reads high until you set it.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/central-kitchen/finished-goods' as never)} className={controls + ' self-start border border-border bg-surface-elevated'}><Text className="text-sm font-bold text-primary">Set costs in Finished goods</Text></Pressable>
    </View> : null}
    <View className={desktop ? 'max-w-[560px]' : ''}>
      {lines.map(line => <View key={line.label} className={'min-h-11 flex-row items-center gap-3 ' + (line.sign === '=' ? 'border-t border-border-soft' : '')}>
        <Text className="w-4 text-sm font-bold text-text-secondary">{line.sign ?? ''}</Text>
        <Text className={'min-w-0 flex-1 text-sm leading-5 ' + (line.strong ? 'font-bold text-text-primary' : 'text-text-secondary')}>{line.label}</Text>
        {line.note ? <Text className="text-xs text-text-secondary" style={tabular}>{line.note}</Text> : null}
        <Text className={(line.strong ? 'text-base font-extrabold' : 'text-sm font-semibold') + ' text-right'} style={{ ...tabular, color: line.strong && line.value < 0 ? semantic.danger : colors.textPrimary, minWidth: 96 }}>{money(line.value)}</Text>
      </View>)}
    </View>
    <Text className="text-xs leading-5 text-text-secondary">Purchases of {money(summary.purchases_paise)} are not subtracted again: their cost is inside each finished good’s cost per unit.</Text>
  </View>;
}

/** One finished good: quantity sent, what branches paid, what it cost, and what is left. */
function ProfitRow({ row, desktop }: { row: KitchenReportRow; desktop: boolean }) {
  const quantity = (row.quantity ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + (row.unit ?? '');
  const profit = row.cost_paise === null ? null : row.amount_paise - row.cost_paise;
  const profitText = profit === null ? 'No cost set' : money(profit);
  const profitColor = profit === null ? colors.textSecondary : profit < 0 ? semantic.danger : colors.textPrimary;
  if (desktop) {
    return <View testID="kitchen-report-row" className="min-h-[52px] flex-row items-center gap-4 border-b border-border-soft bg-surface-elevated px-4 py-2">
      <View className="min-w-0 flex-1"><Text className="text-sm font-bold text-text-primary">{row.item}</Text><Text className="text-xs leading-4 text-text-secondary">{row.documents} {row.documents === 1 ? 'send' : 'sends'}</Text></View>
      <Text className="w-28 text-right text-sm text-text-secondary" style={tabular}>{quantity}</Text>
      <Text className="w-28 text-right text-sm text-text-primary" style={tabular}>{money(row.amount_paise)}</Text>
      <Text className="w-28 text-right text-sm text-text-secondary" style={tabular}>{row.cost_paise === null ? '—' : money(row.cost_paise)}</Text>
      <View className="w-28 items-end"><Text className="text-sm font-bold" style={{ ...tabular, color: profitColor }}>{profitText}</Text>{profit !== null ? <Text className="text-xs text-text-secondary" style={tabular}>{percent(profit, row.amount_paise)}</Text> : null}</View>
    </View>;
  }
  return <View testID="kitchen-report-row" className="min-h-[62px] flex-row items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2">
    <View className="min-w-0 flex-1">
      <Text className="text-sm font-bold leading-5 text-text-primary">{row.item}</Text>
      <Text className="text-xs leading-4 text-text-secondary" style={tabular}>{quantity} · sales {money(row.amount_paise)}{row.cost_paise === null ? '' : ' · cost ' + money(row.cost_paise)}</Text>
    </View>
    <View className="shrink-0 items-end">
      <Text className="text-sm font-bold leading-5" style={{ ...tabular, color: profitColor }}>{profitText}</Text>
      {profit !== null ? <Text className="text-xs leading-4 text-text-secondary" style={tabular}>{percent(profit, row.amount_paise)}</Text> : null}
    </View>
  </View>;
}
