/**
 * Task 318: the month close. A month's (or any range's) figures, cash and bank at its end, what
 * each branch and vendor stood at when it started and ended with the bills and money in between,
 * the Pending from earlier entries of the month, and a check that the oldest-first open amounts
 * add up to the pending totals. Opened from Analytics and from Cash & bank.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react-native';
import { colors, semantic } from '@/lib/pos/brand';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { fetchKitchenMonthClose } from '@/lib/pos/kitchen-dues-service';
import { monthCloseCsv, monthCloseRows, monthCloseSums, sinceLabel } from '@/lib/pos/kitchen-dues-utils';
import { kitchenMonthRange, kitchenRangeLabel, kitchenToday, shiftKitchenMonth, validKitchenDate, type KitchenDateRange } from '@/lib/pos/kitchen-analytics-utils';
import { formatDayLabel, formatMoney, matchesSearch } from '@/lib/pos/kitchen-utils';
import type { KitchenMonthClose, KitchenMonthCloseParty } from '@/lib/pos/kitchen-dues-types';
import { Card, Empty, KHeader, KScreen, LinkButton, Notice, Row, SearchBox, Section, Segmented, SettingsGroup, SkeletonRows, Toggle, useDesktopDensity } from './ui';
import { ReportDateRange } from './ReportDateRange';

type Show = 'all' | 'branch' | 'vendor';
const control = 'min-h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-xl px-3 hover:bg-accent-soft active:opacity-60 web:focus-visible:border web:focus-visible:border-primary';

function startRange(from?: string, to?: string): KitchenDateRange {
  const today = kitchenToday();
  if (from && to && validKitchenDate(from) && validKitchenDate(to) && from <= to && to <= today) return { startDate: from, endDate: to };
  return kitchenMonthRange(today.slice(0, 7), today);
}

/** One figure of the month: a label, the amount, and a short line under it. */
function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string | null; tone?: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl border border-border-soft bg-surface-elevated px-3.5 py-3" style={{ minHeight: 86 }}>
      <Text className="text-xs font-bold text-text-secondary" numberOfLines={1}>{label}</Text>
      <Text style={{ marginTop: 2, fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: tone ?? colors.textPrimary, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{value}</Text>
      {sub ? <Text className="mt-0.5 text-xs font-semibold leading-4 text-text-secondary" numberOfLines={2}>{sub}</Text> : null}
    </View>
  );
}

const COLUMNS = ['At start', 'Bills', 'Paid', 'At end'] as const;

export function MonthCloseWorkspace() {
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const access = useKitchenAccess();
  const desktop = useDesktopDensity();
  const { isTablet } = useResponsive();
  const phone = !isTablet;
  const today = kitchenToday();
  const [range, setRange] = useState<KitchenDateRange>(() => startRange(params.from, params.to));
  const [data, setData] = useState<KitchenMonthClose | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [show, setShow] = useState<Show>('all');
  const [query, setQuery] = useState('');
  const [settled, setSettled] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mayView = access.can('reports.view');
  const mayExport = access.can('reports.export');
  const showAmounts = access.showAmounts;
  const money = (n: number | null): string => (n === null ? '—' : showAmounts ? formatMoney(n) : '—');

  useEffect(() => {
    if (!mayView) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    void fetchKitchenMonthClose(range.startDate, range.endDate, controller.signal).then((res) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (res.error || !res.data) { setError(res.error ?? 'Unable to load the month close. Please retry.'); return; }
      setData(res.data);
    });
    return () => controller.abort();
  }, [range.startDate, range.endDate, refresh, mayView]);

  const month = range.startDate.slice(0, 7);
  const monthRange = kitchenMonthRange(month, today);
  const fullMonth = range.startDate === monthRange.startDate && range.endDate === monthRange.endDate;
  const atLatest = month >= today.slice(0, 7);
  const changeMonth = (m: string) => setRange(kitchenMonthRange(m, today));
  const rows = useMemo(() => (data ? monthCloseRows(data.parties, { show, query, settled, matches: (q, name) => matchesSearch(q, name) }) : []), [data, show, query, settled]);
  const branches = rows.filter((p) => p.kind === 'branch');
  const vendors = rows.filter((p) => p.kind === 'vendor');

  const exportCsv = async () => {
    if (!data) return;
    setExportError(null);
    const csv = monthCloseCsv(data);
    const name = `kitchen-month-close-${data.from}-to-${data.to}.csv`;
    try {
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        await Share.share({ title: `Kitchen month close ${kitchenRangeLabel(range)}`, message: csv });
      }
    } catch {
      setExportError('Unable to export. Please try again.');
    }
  };
  const openParty = (id: string) => router.push({ pathname: '/central-kitchen/party/[id]', params: { id } });

  if (!mayView) {
    return <KScreen><KHeader title="Month close" onBack={backToKitchen} /><Notice tone="neutral" text="Your login does not show reports. Ask the owner if you need them." /></KScreen>;
  }

  const controls = (
    <View className={phone ? 'flex-row items-center justify-between' : 'flex-row items-center gap-1'}>
      <View className="min-w-0 shrink flex-row items-center gap-1">
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(shiftKitchenMonth(month, -1))} className={control}>
          <ChevronLeft size={18} color={colors.primary} />
        </Pressable>
        <View className="min-w-0 shrink"><ReportDateRange value={range} onChange={setRange} label="Month close dates" /></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={atLatest} accessibilityState={{ disabled: atLatest }} onPress={() => changeMonth(shiftKitchenMonth(month, 1))}
          className={control + (atLatest ? ' opacity-40' : '')}>
          <ChevronRight size={18} color={colors.primary} />
        </Pressable>
      </View>
      <View className="flex-row items-center gap-1">
        {!phone ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh the month close" disabled={loading} onPress={() => setRefresh((n) => n + 1)} className={control + (loading ? ' opacity-40' : '')}>
            <RefreshCw size={18} color={colors.primary} />
          </Pressable>
        ) : null}
        {mayExport ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Export the month close" disabled={!data} onPress={() => void exportCsv()} className={control + (!data ? ' opacity-40' : '')}>
            <Download size={17} color={colors.primary} />
            <Text className="text-sm font-bold text-primary">{desktop ? 'Export CSV' : Platform.OS === 'web' ? 'CSV' : 'Share'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const t = data?.totals;
  const cashAndBank = t && t.endCash !== null && t.endBank !== null ? t.endCash + t.endBank : null;
  const figures = t ? [
    <Figure key="sales" label="Sales to branches" value={money(t.sales)} sub={t.carriedSales > 0 ? `${money(t.carriedSales)} brought forward` : null} />,
    <Figure key="purchases" label="Purchases" value={money(t.purchases)} sub={t.carriedPurchases > 0 ? `${money(t.carriedPurchases)} from earlier` : null} />,
    <Figure key="expenses" label="Expenses" value={money(t.expenses)} sub={t.expensesLater > 0 ? `${money(t.expensesLater)} to pay later` : null} />,
    <Figure key="in" label="Money in" value={money(t.cashIn + t.bankIn)} sub={showAmounts ? `Cash ${formatMoney(t.cashIn)} · Bank ${formatMoney(t.bankIn)}` : null} tone={semantic.success} />,
    <Figure key="out" label="Money out" value={money(t.cashOut + t.bankOut)} sub={showAmounts ? `Cash ${formatMoney(t.cashOut)} · Bank ${formatMoney(t.bankOut)}` : null} tone={semantic.danger} />,
    <Figure key="end" label={fullMonth ? 'At month end' : 'At the end'} value={money(cashAndBank)}
      sub={cashAndBank === null ? 'Set the opening cash and bank' : showAmounts && t.endCash !== null && t.endBank !== null ? `Cash ${formatMoney(t.endCash)} · Bank ${formatMoney(t.endBank)}` : null} />,
  ] : [];
  const perRow = desktop ? 3 : 2;
  const figureRows: React.ReactNode[][] = [];
  for (let i = 0; i < figures.length; i += perRow) figureRows.push(figures.slice(i, i + perRow));

  const table = (label: string, list: readonly KitchenMonthCloseParty[]) => {
    const sums = monthCloseSums(list);
    return (
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <View className="min-h-11 flex-row items-center border-b border-border-soft bg-surface-tint px-4">
          <Text className="min-w-0 flex-1 text-xs font-extrabold uppercase text-text-secondary" style={{ letterSpacing: 0.6 }}>{label}</Text>
          {COLUMNS.map((c) => <Text key={c} className="w-28 text-right text-xs font-bold text-text-secondary">{c}</Text>)}
          <Text className="w-32 text-right text-xs font-bold text-text-secondary">Oldest due</Text>
        </View>
        {list.map((p) => (
          <Pressable key={p.party_id} onPress={() => openParty(p.party_id)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${money(p.atEnd)} at the end. Opens the statement`}
            className="min-h-[48px] flex-row items-center border-b border-border-soft px-4 hover:bg-surface-tint active:bg-surface-tint">
            <Text className="min-w-0 flex-1 text-sm font-bold text-text-primary" numberOfLines={1}>{p.name}</Text>
            {[p.atStart, p.bills, p.paid, p.atEnd].map((n, i) => (
              <Text key={COLUMNS[i]} className={`w-28 text-right text-sm ${i === 3 ? 'font-extrabold text-text-primary' : 'font-semibold text-text-secondary'}`} style={{ fontVariant: ['tabular-nums'] }}>{money(n)}</Text>
            ))}
            <Text className="w-32 text-right text-xs font-bold text-text-secondary" numberOfLines={1}>{p.atEnd > 0 ? (p.openingDue ? 'Before the app' : p.oldestDue ? formatDayLabel(p.oldestDue) : '') : ''}</Text>
          </Pressable>
        ))}
        <View className="min-h-[48px] flex-row items-center px-4">
          <Text className="min-w-0 flex-1 text-sm font-extrabold text-text-primary">Total</Text>
          {[sums.atStart, sums.bills, sums.paid, sums.atEnd].map((n, i) => (
            <Text key={COLUMNS[i]} className="w-28 text-right text-sm font-extrabold text-text-primary" style={{ fontVariant: ['tabular-nums'] }}>{money(n)}</Text>
          ))}
          <View className="w-32" />
        </View>
      </Card>
    );
  };

  const phoneList = (label: string, list: readonly KitchenMonthCloseParty[]) => {
    const sums = monthCloseSums(list);
    return (
      <Section title={label} action={<Text className="text-xs font-extrabold text-text-primary" style={{ fontVariant: ['tabular-nums'] }}>{money(sums.atEnd)}</Text>}>
        <Card padded={false} style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
          {list.map((p) => (
            <Row key={p.party_id} title={p.name}
              subtitle={showAmounts ? `Start ${formatMoney(p.atStart)} · Bills ${formatMoney(p.bills)} · Paid ${formatMoney(p.paid)}` : undefined}
              right={money(p.atEnd)} rightSub={p.atEnd > 0 ? sinceLabel(p.openingDue ? null : p.oldestDue) ?? undefined : p.atEnd < 0 ? 'paid ahead' : 'settled'}
              onPress={() => openParty(p.party_id)} accessibilityLabel={`${p.name}, ${money(p.atEnd)} at the end. Opens the statement`} />
          ))}
        </Card>
      </Section>
    );
  };

  const sides = (
    <>
      {branches.length > 0 ? (desktop ? <View className="mt-2">{table('Branches', branches)}</View> : phoneList('Branches owe', branches)) : null}
      {vendors.length > 0 ? (desktop ? <View className="mt-3">{table('Vendors', vendors)}</View> : phoneList('We owe vendors', vendors)) : null}
      {data && rows.length === 0 ? <Card><Empty title={query.trim() ? 'No match' : 'Nothing pending'} body={settled || query.trim() ? undefined : 'Every branch and vendor is settled for these dates.'} /></Card> : null}
    </>
  );

  const check = data ? (
    <View className="mt-4 flex-row items-center gap-2 px-1" accessibilityRole="text">
      {data.check.difference === 0 ? <CheckCircle2 size={16} color={semantic.success} /> : <AlertTriangle size={16} color={semantic.warning} />}
      <Text className="flex-1 text-xs font-bold" style={{ color: data.check.difference === 0 ? semantic.success : semantic.warning }}>
        {data.check.difference === 0 ? 'Ties up with the balances' : `Off by ${formatMoney(Math.abs(data.check.difference))} against the balances. Tell the owner.`}
      </Text>
    </View>
  ) : null;

  const carried = data ? (
    <Section title="Brought forward" action={access.can('entries.receive') || access.can('entries.buy') ? <LinkButton label="Add" onPress={() => router.push('/central-kitchen/carried' as never)} /> : undefined}>
      <Card padded={false} style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
        {data.carried.length === 0 ? <Empty title="None for these dates" /> : data.carried.map((c) => (
          <Row key={c.id} title={c.party} subtitle={[formatDayLabel(c.entry_date), c.kind === 'branch' ? 'Branch owed us' : 'We owed', c.note].filter(Boolean).join(' · ')}
            right={money(c.amount)} onPress={() => openParty(c.party_id)} accessibilityLabel={`${c.party}, ${money(c.amount)} brought forward. Opens the statement`} />
        ))}
      </Card>
    </Section>
  ) : null;

  const filters = (
    <View className={desktop ? 'mt-2 flex-row items-center gap-3' : 'mt-1 gap-2'}>
      <View className={desktop ? 'w-80' : undefined}>
        <Segmented options={[{ value: 'all', label: 'All' }, { value: 'branch', label: 'Branches' }, { value: 'vendor', label: 'Vendors' }]} value={show} onChange={setShow} />
      </View>
      <View className={desktop ? 'min-w-0 flex-1' : undefined}><SearchBox value={query} onChange={setQuery} placeholder="Search a branch or vendor" /></View>
      <View className={desktop ? 'w-60' : undefined}><SettingsGroup><Toggle label="Settled names" on={settled} onChange={setSettled} /></SettingsGroup></View>
    </View>
  );

  return (
    <KScreen wide refreshing={loading && data !== null} onRefresh={phone ? () => setRefresh((n) => n + 1) : undefined}>
      <KHeader title="Month close" subtitle={kitchenRangeLabel(range)} onBack={backToKitchen} />
      {controls}
      {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => setRefresh((n) => n + 1)} />} /> : null}
      {exportError ? <Notice text={exportError} /> : null}
      {loading && !data ? <View className="mt-3"><SkeletonRows count={4} height={86} label="Loading the month close" /></View> : null}
      {loading && data ? <ActivityIndicator accessibilityLabel="Updating the month close" color={colors.primary} className="mt-2" /> : null}
      {data ? (
        <>
          <Section title={fullMonth ? 'The month' : 'These dates'}>
            <View style={{ gap: 10 }}>
              {figureRows.map((row, i) => <View key={i} className="flex-row" style={{ gap: 10 }}>{row}</View>)}
            </View>
          </Section>
          <Section title="Pending at the end">
            {filters}
            {sides}
          </Section>
          {check}
          {carried}
        </>
      ) : null}
    </KScreen>
  );
}
