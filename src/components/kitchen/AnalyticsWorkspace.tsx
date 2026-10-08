import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, Share, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Download, Info, RefreshCw, Settings2 } from 'lucide-react-native';
import { colors, semantic } from '@/lib/pos/brand';
import { getTenantContext } from '@/lib/pos/tenant-context';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { fetchKitchenReport, KITCHEN_REPORT_PAGE_SIZE } from '@/lib/pos/kitchen-analytics-service';
import { kitchenMonthLabel, kitchenReportCsv, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import type { KitchenReport, KitchenReportFilter, KitchenReportKind, KitchenReportRow } from '@/lib/pos/kitchen-analytics-types';
import { formatMoney } from '@/lib/pos/kitchen-utils';
import { Empty, KHeader, KScreen, Notice } from '@/components/kitchen/ui';
import { ReportSelect } from '@/components/kitchen/ReportSelect';

const money = (paise: number): string => formatMoney(paise / 100);
const tabular = { fontVariant: ['tabular-nums' as const] };
const controls = 'min-h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-xl px-3 py-2 hover:bg-accent-soft active:opacity-60 focus:border focus:border-primary';
const tabs: readonly { id: KitchenReportKind; label: string }[] = [{ id: 'sales', label: 'Sales' }, { id: 'purchases', label: 'Purchases' }, { id: 'cash', label: 'Cash' }];

export function AnalyticsWorkspace() {
  const { width } = useWindowDimensions();
  const [reportWidth, setReportWidth] = useState(width);
  // The sidebar and phone frame reduce the actual space available to reports.
  const desktop = Platform.OS === 'web' && reportWidth >= 700;
  const toolbar = Platform.OS === 'web' && reportWidth >= 840;
  const inlineFilters = reportWidth >= 640;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const session = useSessionStore(state => state.session);
  const { tenant_id } = getTenantContext();
  const branchId = kitchenBranch().id;
  const today = kitchenToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [kind, setKind] = useState<KitchenReportKind>('sales');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [includeExpenses, setIncludeExpenses] = useState(false);
  const [detail, setDetail] = useState(false);
  const salesColumns = desktop && kind === 'sales' && !detail;
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<KitchenReport | null>(null);
  const [filterOptions, setFilterOptions] = useState<KitchenReport['options']>({ branches: [], items: [], vendors: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  const drillBase = useRef<{ partyId: string | null; itemId: string | null; category: string | null } | null>(null);
  const filter = useMemo<KitchenReportFilter>(() => ({ month, report: kind, partyId, itemId, category, includeExpenses, detail, page }), [month, kind, partyId, itemId, category, includeExpenses, detail, page]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setExportError(null); setReport(null);
    void fetchKitchenReport(filter, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (!result.data || result.error) { setError(result.error ?? 'Unable to load this report.'); return; }
      setReport(result.data); setFilterOptions(result.data.options);
    });
    return () => controller.abort();
  }, [filter, refresh, tenant_id, branchId, session?.userId]);
  useEffect(() => {
    exportController.current?.abort(); setExporting(false);
    return () => exportController.current?.abort();
  }, [filter, tenant_id, branchId]);

  const resetFilters = () => { setPartyId(null); setItemId(null); setCategory(null); setPage(0); setDetail(false); drillBase.current = null; };
  const changeMonth = (next: string) => { resetFilters(); setFilterOptions({ branches: [], items: [], vendors: [], categories: [] }); setMonth(next); };
  const chooseReport = (next: KitchenReportKind) => { resetFilters(); setKind(next); };
  const inspect = (row: KitchenReportRow) => {
    if (detail || kind === 'cash') return;
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
        link.href = url; link.download = 'kitchen-' + kind + '-' + month + '.csv';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({ title: 'Kitchen ' + kind + ' ' + month, message: csv });
    } catch {
      if (!controller.signal.aborted) setExportError('Unable to export. Please try again.');
    } finally {
      if (exportController.current === controller) { exportController.current = null; setExporting(false); }
    }
  };
  const title = kind === 'sales' ? 'Item sales to branches' : kind === 'purchases' ? includeExpenses ? 'All spending by category' : 'Purchases by category' : 'Money received and paid';
  const summary = report?.summary;
  const metrics = [
    { label: 'Sales to branches', value: summary?.sales_paise },
    { label: 'Purchases', value: summary?.purchases_paise },
    { label: 'Other expenses', value: summary?.expenses_paise },
  ];
  // Keep exact large amounts readable instead of shrinking them to fit a phone column.
  const stackedMetrics = !desktop && metrics.some(metric => metric.value !== undefined && money(metric.value).length * 11 > (reportWidth - 88) / 3);
  const activeFilters = Number(partyId !== null) + Number(itemId !== null) + Number(category !== null) + Number(kind === 'purchases' && includeExpenses);
  const filterSummary = [
    kind === 'purchases' && includeExpenses ? 'Purchases + other expenses' : null,
    partyId ? [...filterOptions.branches, ...filterOptions.vendors].find(option => option.id === partyId)?.label : null,
    itemId ? filterOptions.items.find(option => option.id === itemId)?.label : null,
    category,
  ].filter(Boolean).join(' · ');
  const monthControls = <View className="flex-row items-center justify-between gap-1">
    <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(shiftKitchenMonth(month, -1))} className={controls}><ChevronLeft size={18} color={colors.primary} /></Pressable>
    <Text className="min-w-[128px] text-center text-sm font-bold text-text-primary">{kitchenMonthLabel(month)}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => changeMonth(shiftKitchenMonth(month, 1))} className={controls}><ChevronRight size={18} color={colors.primary} /></Pressable>
  </View>;
  const headerActions = <View className="flex-row gap-1">
        <Pressable accessibilityRole="button" accessibilityLabel="About these reports" accessibilityState={{ expanded: notesOpen }} onPress={() => setNotesOpen(value => !value)} className={controls}>
          <Info size={18} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh reports" disabled={loading} onPress={() => setRefresh(value => value + 1)} className={controls + (loading ? ' opacity-40' : '')}>
          <RefreshCw size={18} color={colors.primary} />
        </Pressable>
  </View>;
  const exportButton = <Pressable accessibilityRole="button" accessibilityLabel="Export report CSV" disabled={loading || exporting || !report?.total_rows} onPress={() => void exportCsv()}
    className={controls + ((loading || exporting || !report?.total_rows) ? ' opacity-40' : '')}>
    {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Download size={17} color={colors.primary} />}
    <Text className="text-sm font-bold text-primary">{desktop ? 'Export CSV' : Platform.OS === 'web' ? 'CSV' : 'Share'}</Text>
  </Pressable>;
  const listHeader = (
    <View className="gap-2">
      {toolbar ? <View className="flex-row items-center justify-between gap-4 pt-2">
        <View className="min-w-0 flex-1"><Text accessibilityRole="header" className="text-lg font-bold text-text-primary">Analytics</Text><Text className="text-xs text-text-secondary">{kitchenBranch().name}</Text></View>
        {monthControls}{headerActions}
      </View> : <KHeader title="Analytics" subtitle={kitchenBranch().name} large={false} right={headerActions} />}
      <View className={toolbar ? 'flex-row flex-wrap items-center justify-end gap-2' : 'gap-1'}>
        {!toolbar ? monthControls : null}
        <View className="flex-row flex-wrap items-center justify-between gap-1">
          <Text className="text-xs text-text-secondary">{month === today.slice(0, 7) ? 'Month to date · through ' + today : 'Full calendar month'} · India time</Text>
          {month !== today.slice(0, 7) ? <Pressable accessibilityRole="button" onPress={() => changeMonth(today.slice(0, 7))} className={controls}><Text className="text-sm font-bold text-primary">This month</Text></Pressable> : null}
        </View>
      </View>
        <View className={'border-y border-border-soft py-2 ' + (stackedMetrics ? 'gap-1' : 'flex-row gap-3')}>
          {metrics.map(metric => <View key={metric.label} className={stackedMetrics ? 'flex-row flex-wrap items-center justify-between gap-2' : 'min-w-0 flex-1 ' + (desktop ? 'flex-row flex-wrap items-center gap-2' : '')}>
            <Text className={'text-xs font-bold text-text-secondary ' + (!desktop && !stackedMetrics ? 'min-h-8 leading-4' : '')}>{metric.label}</Text>
            <Text className="text-lg font-bold text-text-primary" style={tabular}>{metric.value === undefined ? '—' : money(metric.value)}</Text>
          </View>)}
        </View>
      {notesOpen ? <View className="gap-1 rounded-xl bg-surface-elevated p-3">
        <Text className="text-xs leading-5 text-text-secondary">Goods supplied are kitchen sales. Purchases include credit buys; these figures do not represent profit.</Text>
        <Text className="text-xs leading-5 text-text-secondary">{kind === 'cash'
          ? 'Cash, UPI and bank movements by entry date. Opening balances are excluded.'
          : kind === 'sales' ? 'Quantities keep their own units. Select a row to see its send entries.'
          : 'Select a category to see its entries. Later vendor payments are counted in Cash, not purchases.'}</Text>
      </View> : null}
      <View className="rounded-xl bg-surface-elevated px-3 py-2">
      <View className="flex-row items-center justify-between gap-2">
      <View className={'flex-row gap-1 ' + (desktop ? '' : 'flex-1')}>
        {tabs.map(tab => (
          <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: kind === tab.id }} onPress={() => chooseReport(tab.id)}
            className={'min-h-12 items-center justify-center rounded-xl px-3 active:opacity-70 focus:border focus:border-primary ' + (desktop ? 'min-w-[96px] ' : 'flex-1 ') + (kind === tab.id ? 'bg-primary' : 'bg-surface-elevated hover:bg-accent-soft')}>
            <Text className={'text-sm font-bold ' + (kind === tab.id ? 'text-text-on-primary' : 'text-text-secondary')}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
          {desktop ? exportButton : null}
        </View>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="min-w-0 flex-1 text-base font-bold text-text-primary">{detail ? 'Recorded entries' : title}</Text>
          {!desktop ? exportButton : null}
          {kind === 'purchases' && inlineFilters ? <Pressable accessibilityRole="button" onPress={() => router.push('/central-kitchen/purchase-categories')} className={controls}>
            <Settings2 size={16} color={colors.primary} /><Text className="text-xs font-bold text-primary">Manage purchase categories</Text>
          </Pressable> : null}
        </View>
        {!inlineFilters && kind !== 'cash' ? <>
          <Pressable accessibilityRole="button" accessibilityLabel="Report filters" accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} className={controls + ' mt-2 self-start'}>
            <Settings2 size={16} color={colors.primary} /><Text className="text-sm font-bold text-primary">{filtersOpen ? 'Hide filters' : 'Filters'}{activeFilters ? ' (' + activeFilters + ')' : ''}</Text>
          </Pressable>
          {filterSummary ? <Text className="mt-1 text-xs leading-5 text-text-secondary">{filterSummary}</Text> : null}
        </> : null}
        {(inlineFilters || filtersOpen) && kind !== 'cash' ? <View className={'mt-1 gap-3 ' + (inlineFilters ? 'flex-row' : '')}>
          {kind === 'sales' ? <>
            <ReportSelect label="Branch" value={partyId} options={filterOptions.branches} onChange={id => { setPartyId(id); setPage(0); }} emptyLabel="All branches" />
            <ReportSelect label="Item" value={itemId} options={filterOptions.items} onChange={id => { setItemId(id); setPage(0); }} emptyLabel="All items" />
          </> : kind === 'purchases' ? <>
            <ReportSelect label="Spending" value={includeExpenses ? 'all' : null} options={[{ id: 'all', label: 'Purchases + other expenses' }]} emptyLabel="Purchases only" onChange={id => { setIncludeExpenses(id === 'all'); setCategory(null); setPage(0); }} />
            <ReportSelect label="Category" value={category} options={filterOptions.categories} onChange={id => { setCategory(id); setPage(0); }} emptyLabel="All categories" />
            <ReportSelect label="Vendor" value={partyId} options={filterOptions.vendors} onChange={id => { setPartyId(id); setPage(0); }} emptyLabel="All vendors" />
          </> : null}
        </View> : null}
        {kind === 'purchases' && filtersOpen && !inlineFilters ? <Pressable accessibilityRole="button" onPress={() => router.push('/central-kitchen/purchase-categories')} className={controls + ' mt-1 self-start'}>
          <Settings2 size={16} color={colors.primary} /><Text className="text-xs font-bold text-primary">Manage purchase categories</Text>
        </Pressable> : null}
        {detail ? <Pressable accessibilityRole="button" onPress={closeDetail} className={controls + ' mt-2 self-start'}><ChevronLeft size={16} color={colors.primary} /><Text className="text-sm font-bold text-primary">Back to breakdown</Text></Pressable> : null}
        {report ? <View className="mt-2 flex-row flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-2">
          <Text className="text-sm font-bold text-text-primary" style={tabular}>{kind === 'cash'
            ? <><Text style={{ color: semantic.success }}>{'Received ' + money(report.filtered_in_paise)}</Text>{' · '}<Text style={{ color: semantic.danger }}>{'Paid ' + money(report.filtered_out_paise)}</Text></>
            : 'Filtered total ' + money(report.filtered_paise)}</Text>
          <Text className="text-xs text-text-secondary">{report.total_rows} {detail || kind === 'cash' ? report.total_rows === 1 ? 'row' : 'rows' : kind === 'sales' ? report.total_rows === 1 ? 'item / branch combination' : 'item / branch combinations' : report.total_rows === 1 ? 'category' : 'categories'}</Text>
        </View> : null}
      </View>
      {exportError ? <Notice text={exportError} /> : null}
      {error ? <Notice text={error} action={<Pressable accessibilityRole="button" onPress={() => setRefresh(value => value + 1)} className={controls}><Text className="font-bold text-primary">Retry</Text></Pressable>} /> : null}
      {loading ? <View className="flex-row items-center gap-3 rounded-xl bg-surface-elevated p-5" accessibilityLiveRegion="polite"><ActivityIndicator color={colors.primary} /><Text className="text-sm text-text-secondary">Loading report…</Text></View> : null}
      {desktop && report?.rows.length ? <View className="flex-row gap-4 rounded-t-xl bg-surface-elevated px-4 pt-4">
        <Text className="min-w-0 flex-1 text-xs font-bold text-text-secondary">{salesColumns ? 'Branch' : detail || kind === 'cash' ? 'Entry / source' : 'Category / source'}</Text>
        {salesColumns ? <Text className="min-w-0 flex-1 text-xs font-bold text-text-secondary">Item</Text> : null}
        <Text className={(salesColumns ? 'min-w-0 flex-1' : 'w-28') + ' text-right text-xs font-bold text-text-secondary'}>{kind === 'sales' ? 'Quantity' : 'Entries'}</Text>
        <Text className={(salesColumns ? 'min-w-0 flex-1' : 'w-32') + ' text-right text-xs font-bold text-text-secondary'}>{kind === 'cash' ? 'Received / paid' : 'Value'}</Text>
      </View> : null}
    </View>
  );
  return (
    <KScreen scroll={false}>
      <FlatList data={report?.rows ?? []} keyExtractor={row => row.key} className={'w-full flex-1 self-center px-4 ' + (desktop ? 'max-w-[1120px]' : 'max-w-[720px]')}
        onLayout={event => setReportWidth(event.nativeEvent.layout.width)}
        ListHeaderComponent={listHeader} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={!loading && !error ? <View className="rounded-xl bg-surface-elevated"><Empty title="No entries for this selection" body="Choose another month or clear the filters. New kitchen entries will appear here after you refresh." action={<Pressable accessibilityRole="button" onPress={resetFilters} className={controls}><Text className="font-bold text-primary">Clear filters</Text></Pressable>} /></View> : null}
        renderItem={({ item }) => <ReportRow row={item} desktop={desktop} detail={detail} reportKind={kind} total={report?.filtered_paise ?? 0} onPress={() => inspect(item)} />}
        ListFooterComponent={report?.total_rows ? <View className="mt-3 flex-row items-center justify-between gap-2">
          <Pressable accessibilityRole="button" disabled={page === 0 || loading} onPress={() => setPage(value => value - 1)} className={controls + (page === 0 || loading ? ' opacity-40' : '')}><Text className="font-bold text-primary">Previous</Text></Pressable>
          <Text className="text-xs text-text-secondary">Page {page + 1} of {Math.ceil(report.total_rows / KITCHEN_REPORT_PAGE_SIZE)}</Text>
          <Pressable accessibilityRole="button" disabled={(page + 1) * KITCHEN_REPORT_PAGE_SIZE >= report.total_rows || loading} onPress={() => setPage(value => value + 1)} className={controls + ((page + 1) * KITCHEN_REPORT_PAGE_SIZE >= report.total_rows || loading ? ' opacity-40' : '')}><Text className="font-bold text-primary">Next</Text></Pressable>
        </View> : null} />
    </KScreen>
  );
}

function ReportRow({ row, desktop, detail, reportKind, total, onPress }: { row: KitchenReportRow; desktop: boolean; detail: boolean; reportKind: KitchenReportKind; total: number; onPress: () => void }) {
  const interactive = !detail && reportKind !== 'cash';
  const salesColumns = desktop && reportKind === 'sales' && !detail;
  const title = row.kind === 'category' ? row.category ?? 'Uncategorized' : row.item ? row.party + ' · ' + row.item : row.party;
  const subtitle = [row.date, row.source, row.category && row.kind !== 'category' ? row.category : null, row.payment, row.mode?.toUpperCase()].filter(Boolean).join(' · ');
  const secondary = row.quantity !== null ? row.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' ' + (row.unit ?? '') : row.documents + ' ' + (row.documents === 1 ? 'entry' : 'entries');
  const value = reportKind === 'cash' ? (row.money_in_paise > 0 ? 'Received ' + money(row.money_in_paise) : 'Paid ' + money(row.money_out_paise)) : money(row.amount_paise);
  const figures = <>
    <View className={desktop ? (salesColumns ? 'min-w-0 flex-1 items-end' : 'w-28 items-end') : 'min-w-0 flex-1'}>
      {!desktop && row.quantity !== null ? <Text className="text-xs text-text-secondary">Quantity</Text> : null}
      <Text className="text-sm text-text-secondary" style={tabular}>{secondary}</Text>
    </View>
    <View className={desktop ? (salesColumns ? 'min-w-0 flex-1 items-end' : 'w-32 items-end') : 'min-w-0 items-end'}>
      {!desktop && reportKind !== 'cash' ? <Text className="text-xs text-text-secondary">Value</Text> : null}
      <Text className="text-sm font-bold" style={{ ...tabular, color: reportKind === 'cash' ? row.money_in_paise > 0 ? semantic.success : semantic.danger : colors.textPrimary }}>{value}</Text>
      {row.kind === 'category' ? <Text className="mt-1 text-xs text-text-secondary" style={tabular}>{total > 0 ? (row.amount_paise / total * 100).toFixed(1) : '0.0'}% of selection</Text> : null}
    </View>
  </>;
  const body = (
    <>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-text-primary">{salesColumns ? row.party : title}</Text>
        {!salesColumns ? <Text className="mt-1 text-xs leading-5 text-text-secondary">{subtitle}</Text> : null}
        {row.kind === 'category' ? <View className="mt-2 h-1.5 max-w-[240px] overflow-hidden rounded-full bg-surface-tint"><View className="h-full rounded-full bg-primary" style={{ width: total > 0 ? Math.min(100, row.amount_paise / total * 100) + '%' as `${number}%` : '0%' }} /></View> : null}
      </View>
      {salesColumns ? <View className="min-w-0 flex-1"><Text className="text-sm font-bold text-text-primary">{row.item}</Text><Text className="mt-1 text-xs leading-5 text-text-secondary">{subtitle}</Text></View> : null}
      {desktop ? figures : <View className="flex-row flex-wrap items-end justify-between gap-4">{figures}</View>}
    </>
  );
  const classes = 'min-h-12 border-b border-border-soft bg-surface-elevated px-4 py-4 ' + (desktop ? 'flex-row items-center gap-4' : 'gap-3');
  return interactive ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={'View entries for ' + title} className={classes + ' hover:bg-accent-soft active:bg-accent-soft focus:border focus:border-primary'}>{body}</Pressable> : <View className={classes}>{body}</View>;
}
