import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';
import { ActivityIndicator, FlatList, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { colors, semantic } from '@/lib/pos/brand';
import { kitchenMonthRange, kitchenRangeLabel, kitchenToday, validKitchenDate } from '@/lib/pos/kitchen-analytics-utils';
import { cancelKitchenInvoice, createKitchenInvoice, fetchKitchenInvoice, fetchKitchenInvoices, receiveKitchenInvoicePayment } from '@/lib/pos/kitchen-invoice-service';
import { printKitchenInvoice } from '@/lib/pos/kitchen-invoice-export';
import { invoiceDate, invoiceIssuedDate, invoiceMoney, invoiceNumber, invoiceStatus } from '@/lib/pos/kitchen-invoice-utils';
import { formatQty, parseAmount } from '@/lib/pos/kitchen-utils';
import { historyTimeLabel } from '@/lib/pos/kitchen-history-utils';
import { INVOICE_STATUSES, type InvoiceDelivery, type InvoiceFilter, type InvoiceLine, type InvoiceStatus, type InvoiceWorkspace as WorkspaceData, type KitchenInvoice } from '@/lib/pos/kitchen-invoice-types';
import type { KitchenMode } from '@/lib/pos/kitchen-types';
import type { ReportOption } from '@/lib/pos/kitchen-analytics-types';
import { Avatar, KHeader, KScreen, Notice, TextField, Tick } from '@/components/kitchen/ui';
import { ReportDateRange } from '@/components/kitchen/ReportDateRange';
import { ReportMultiSelect, ReportSelect } from '@/components/kitchen/ReportSelect';
import { DateField, useDateGuard, ModePicker } from '@/components/kitchen/forms';

type Row = { kind: 'invoice'; value: KitchenInvoice } | { kind: 'delivery'; value: InvoiceDelivery } | { kind: 'line' | 'docline'; value: InvoiceLine; date: string };
type Preview = { invoice: KitchenInvoice; checkedAt: Date };
type RouteParams = { start?: string; end?: string; party?: string };
/** Analytics links carry a branch and an inclusive range; invalid or future dates fall back to this month. */
function routeFilter(params: RouteParams, today: string): Pick<InvoiceFilter, 'startDate' | 'endDate' | 'partyId'> {
  const range = params.start && params.end && validKitchenDate(params.start) && validKitchenDate(params.end) && params.start <= params.end && params.end <= today
    ? { startDate: params.start, endDate: params.end } : kitchenMonthRange(today.slice(0, 7));
  return { ...range, partyId: params.party ?? null };
}
/** The preview mirrors the printed A4 page: one paper column, hairline edges. */
const paper = 'w-full max-w-[794px] self-center border-x border-border-soft bg-surface-elevated px-5';
const tabular = { fontVariant: ['tabular-nums' as const] };
const STATUS_OPTIONS: readonly { id: InvoiceStatus; label: string }[] = INVOICE_STATUSES.map(id => ({ id, label: invoiceStatus(id) }));
const statusNoun: Record<InvoiceStatus, string> = { to_be_paid: 'to be paid', paid: 'paid', cancelled: 'cancelled' };
function Action({ label, accessibilityLabel, onPress, primary = false, disabled = false }: { label: string; accessibilityLabel?: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    className={'min-h-[44px] min-w-[44px] max-w-full self-start items-center justify-center rounded-lg border px-3 py-1.5 ' +
      (disabled ? 'border-border bg-surface-tint' : primary ? 'border-primary bg-primary hover:bg-primary-deep active:bg-primary-deep focus:border-primary-deep' : 'border-border bg-surface-elevated hover:bg-accent-soft active:bg-accent-soft focus:border-primary')}>
    <Text className={'text-sm font-semibold leading-5 ' + (primary && !disabled ? 'text-text-on-primary' : disabled ? 'text-text-secondary' : 'text-primary')}>{label}</Text>
  </Pressable>;
}
function Status({ invoice, pill = false }: { invoice: KitchenInvoice; pill?: boolean }) {
  const color = invoice.status === 'paid' ? semantic.success : invoice.status === 'cancelled' ? colors.textSecondary : semantic.warning;
  // Task 233: a phone shows the status as a soft pill.
  if (pill) return <View className="mt-0.5 rounded-full px-2 py-0.5" style={{ backgroundColor: invoice.status === 'paid' ? semantic.successSoft : invoice.status === 'cancelled' ? colors.surfaceTint : semantic.warningSoft }}><Text className="text-xs font-bold" style={{ color }}>{invoiceStatus(invoice.status)}</Text></View>;
  return <Text className="text-xs font-bold leading-5" style={{ color }}>{invoiceStatus(invoice.status)}</Text>;
}

export function InvoiceWorkspace() {
  const params = useLocalSearchParams<RouteParams>();
  const today = kitchenToday(); const { width } = useWindowDimensions(); const desktop = width >= 700;
  const [filter, setFilter] = useState<InvoiceFilter>(() => ({ ...routeFilter(params, today), page: 0, candidates: false, statuses: INVOICE_STATUSES }));
  const [data, setData] = useState<WorkspaceData | null>(null); const [branches, setBranches] = useState<ReportOption[]>([]); const branchesLoaded = useRef(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0); const [selected, setSelected] = useState<Map<string, InvoiceDelivery>>(new Map());
  const [invoice, setInvoice] = useState<KitchenInvoice | null>(null); const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [editor, setEditor] = useState<'receive' | 'cancel' | null>(null); const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today); const [mode, setMode] = useState<KitchenMode>('upi'); const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null); const [preview, setPreview] = useState<Preview | null>(null);
  const access = useKitchenAccess(); const [lockReason, setLockReason] = useState('');
  const paymentDateOk = useDateGuard(paymentDate, lockReason);
  const paymentKey = useRef(''); const paymentPaise = Math.round(parseAmount(amount) * 100);
  // Invoices is a tab, so it stays mounted: a later Analytics link replaces the branch and dates.
  const appliedParams = useRef([params.start, params.end, params.party].join('|'));
  useEffect(() => {
    const key = [params.start, params.end, params.party].join('|');
    if (appliedParams.current === key || busyRef.current) return;
    appliedParams.current = key;
    setDetailId(null); setInvoice(null); setPreview(null); setEditor(null); setSelected(new Map()); setMessage(null);
    setFilter(f => ({ ...routeFilter({ start: params.start, end: params.end, party: params.party }, kitchenToday()), page: 0, candidates: false, statuses: f.statuses ?? INVOICE_STATUSES }));
  }, [params.start, params.end, params.party]);
  // Reload whenever the tab is shown again (payments may have been recorded on Received); the first focus is the initial load.
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => { if (focusedOnce.current && !busyRef.current) setRefresh(v => v + 1); focusedOnce.current = true; }, []));
  useEffect(() => {
    if (detailId) return;
    const controller = new AbortController(); setError(null); setData(null);
    const branchesOnly = filter.candidates && !filter.partyId;
    if (branchesOnly && branchesLoaded.current) { setLoading(false); return () => controller.abort(); }
    // With no status ticked there is nothing to show, so nothing is fetched.
    if (!filter.candidates && filter.statuses?.length === 0) { setLoading(false); setData({ rows: [], deliveries: [], branches, total_rows: 0 }); return () => controller.abort(); }
    setLoading(true);
    // Branch choices arrive with the register; New invoice reloads them if that read failed.
    void fetchKitchenInvoices(branchesOnly ? { ...filter, candidates: false } : filter, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setLoading(false); setError(result.error); if (!branchesOnly) setData(result.data);
      if (result.data) { setBranches(result.data.branches); branchesLoaded.current = true; }
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- branches only fill the empty register; they must not refetch it.
  }, [filter, refresh, detailId]);
  useEffect(() => {
    if (!detailId) return;
    let current = true; setLoading(true); setError(null); setInvoice(null); setEditor(null); setPreview(null);
    void fetchKitchenInvoice(detailId).then(result => { if (!current) return; setLoading(false); setError(result.error); setInvoice(result.data); });
    return () => { current = false; };
  }, [detailId, refresh]);
  // The statuses ticked in the filter, when that is fewer than all of them.
  const narrowedTo = filter.statuses && filter.statuses.length < INVOICE_STATUSES.length ? INVOICE_STATUSES.filter(s => filter.statuses?.includes(s)) : null;
  const resetFilter = (change: Partial<InvoiceFilter>): void => { if (busy) return; setSelected(new Map()); setMessage(null); setFilter(f => ({ ...f, ...change, page: 0 })); };
  const chosen = [...selected.values()]; const total = chosen.reduce((n, d) => n + d.amount_paise, 0);
  const allPage = !!data?.deliveries.length && data.deliveries.every(d => selected.has(d.id));
  const toggle = (delivery: InvoiceDelivery): void => {
    if (busy) return;
    setSelected(current => { const next = new Map(current); if (next.has(delivery.id)) next.delete(delivery.id); else if (next.size < 100) next.set(delivery.id, delivery); return next; });
  };
  const selectPage = (): void => setSelected(current => {
    const next = new Map(current); for (const d of data?.deliveries ?? []) { if (allPage) next.delete(d.id); else if (next.size < 100) next.set(d.id, d); } return next;
  });
  const startBusy = (): boolean => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(null); setMessage(null); return true; };
  const endBusy = (): void => { busyRef.current = false; setBusy(false); };
  const create = async (): Promise<void> => {
    if (!startBusy()) return;
    const result = await createKitchenInvoice(filter, chosen); endBusy();
    if (result.error || !result.data) { setError(result.error); return; }
    setSelected(new Map()); setDetailId(result.data); setMessage('Invoice created');
  };
  const saveAction = async (): Promise<void> => {
    if (!invoice || !editor || !startBusy()) return;
    const result = editor === 'cancel' ? await cancelKitchenInvoice(invoice.id, reason) : await receiveKitchenInvoicePayment(invoice.id, paymentPaise, paymentDate, mode, paymentKey.current, lockReason);
    endBusy();
    if (result.error) { setError(result.error); return; }
    setMessage(editor === 'cancel' ? 'Invoice cancelled. Deliveries and payments are retained.' : 'Payment recorded');
    setEditor(null); setRefresh(v => v + 1);
  };
  // The preview always fetches fresh payment status, so the printed balance is current.
  const openPreview = async (): Promise<void> => {
    if (!invoice || !startBusy()) return;
    const result = await fetchKitchenInvoice(invoice.id); endBusy();
    if (result.error || !result.data) { setError(result.error ?? 'Unable to prepare the invoice.'); return; }
    setInvoice(result.data); setEditor(null); setPreview({ invoice: result.data, checkedAt: new Date() });
  };
  const print = async (): Promise<void> => {
    if (!preview || !startBusy()) return;
    const result = await printKitchenInvoice(preview.invoice, preview.checkedAt); endBusy(); if (result.error) setError(result.error);
  };
  const backToList = (): void => { setDetailId(null); setInvoice(null); setPreview(null); setEditor(null); setMessage(null); setError(null); resetFilter({ candidates: false }); };
  const reload = (): void => { if (busyRef.current) return; setSelected(new Map()); setRefresh(v => v + 1); };
  const rows = useMemo<Row[]>(() => preview ? preview.invoice.deliveries.flatMap(d => d.lines.map(l => ({ kind: 'docline' as const, value: l, date: d.entry_date })))
    : detailId ? invoice?.deliveries.flatMap(d => d.lines.map(l => ({ kind: 'line' as const, value: l, date: d.entry_date }))) ?? []
    : filter.candidates ? (data?.deliveries ?? []).map(value => ({ kind: 'delivery', value })) : (data?.rows ?? []).map(value => ({ kind: 'invoice', value })), [data, filter.candidates, invoice, detailId, preview]);
  const pane = invoice && editor ? <View className="gap-3 border-y border-border-soft bg-surface-elevated py-3">
    <Text className="text-base font-bold text-text-primary">{editor === 'receive' ? 'Record received payment' : 'Cancel this invoice'}</Text>
    {error ? <Notice text={error} /> : null}
    {editor === 'receive' ? <>
      <View className={desktop ? 'max-w-[420px]' : ''}><TextField label="Invoice payment amount" value={amount} onChange={setAmount} prefix="₹" keyboardType="decimal-pad" placeholder="Amount received" /></View>
      <Text className="text-xs leading-5" style={{ color: paymentPaise > invoice.open_paise ? semantic.warning : colors.textSecondary }}>{paymentPaise > invoice.open_paise ? 'More than the ' + invoiceMoney(invoice.open_paise) + ' still open on this invoice. Record any extra on the Received screen.' : invoiceMoney(invoice.open_paise) + ' is still open on this invoice.'}</Text>
      <ModePicker value={mode} onChange={setMode} /><DateField value={paymentDate} onChange={setPaymentDate} lockReason={lockReason} onLockReason={setLockReason} />
      <Text className="text-xs leading-5 text-text-secondary">Record money already received. This payment is matched only to this invoice’s deliveries.</Text>
    </> : <><Text className="text-sm leading-5 text-text-secondary">This keeps the invoice as cancelled and releases its deliveries for correction or a new invoice. Sales, stock and payments stay recorded.</Text>
      <TextField label="Invoice cancellation reason" value={reason} onChange={setReason} placeholder="Reason for cancelling" /></>}
    <View className="flex-row flex-wrap gap-2"><Action label={busy ? 'Saving…' : editor === 'receive' ? 'Confirm received payment' : 'Confirm cancellation'} primary onPress={() => void saveAction()}
      disabled={busy || (editor === 'cancel' ? !reason.trim() || reason.trim().length > 200 : paymentPaise <= 0 || paymentPaise > invoice.open_paise || !validKitchenDate(paymentDate) || paymentDate > today || !paymentDateOk)} />
      <Action label="Close" onPress={() => setEditor(null)} disabled={busy} /></View>
  </View> : null;
  const docHeader = preview ? <>
    <View className="flex-row flex-wrap items-center gap-2"><Action label={busy ? 'Preparing…' : Platform.OS === 'web' ? 'Print / Save PDF' : 'Share PDF'} primary disabled={busy} onPress={() => void print()} />
      <Text className="min-w-0 flex-1 text-xs leading-5 text-text-secondary">{Platform.OS === 'web' ? 'Choose Save as PDF in the print dialog to keep a file.' : 'Share the PDF to WhatsApp, email or a printer.'}</Text></View>
    <View className={paper + ' mt-1 rounded-t-lg border-t pt-6'}>
      <View className={'gap-4 border-b-2 border-primary pb-4 ' + (desktop ? 'flex-row justify-between' : '')}>
        <View className="min-w-0 flex-1"><Text className="text-lg font-bold leading-6 text-text-primary">{preview.invoice.kitchen_name}</Text><Text className="text-sm leading-5 text-text-secondary">Branch supply invoice</Text></View>
        <View className={desktop ? 'items-end' : ''}><Text className="text-2xl font-extrabold leading-8 text-text-primary">{invoiceNumber(preview.invoice.invoice_no)}</Text><Status invoice={preview.invoice} /><Text className="text-xs leading-5 text-text-secondary">Issued {invoiceIssuedDate(preview.invoice.created_at)}</Text></View>
      </View>
      <View className="gap-1 py-4"><Text className="text-sm font-bold leading-5 text-text-primary">Bill to {preview.invoice.party_name}</Text>
        <Text className="text-sm leading-5 text-text-secondary">Delivery period: {invoiceDate(preview.invoice.start_date)} to {invoiceDate(preview.invoice.end_date)} (inclusive)</Text>
        {preview.invoice.cancelled_at ? <Text className="text-sm leading-5 text-text-primary">Cancelled: {preview.invoice.cancel_reason}</Text> : null}</View>
      {desktop ? <View className="flex-row gap-3 bg-surface-tint px-2 py-2"><Text className="w-[18%] text-xs font-semibold text-text-secondary">Date</Text><Text className="flex-1 text-xs font-semibold text-text-secondary">Finished goods</Text><Text className="w-[14%] text-right text-xs font-semibold text-text-secondary">Quantity</Text><Text className="w-[14%] text-right text-xs font-semibold text-text-secondary">Rate</Text><Text className="w-[16%] text-right text-xs font-semibold text-text-secondary">Amount</Text></View> : null}
    </View>
  </> : null;
  const docFooter = preview ? <View className={paper + ' mb-2 rounded-b-lg border-b pb-6 pt-4'}>
    <View className={'gap-1 ' + (desktop ? 'ml-auto w-[280px]' : '')}>
      {([['Invoice total', preview.invoice.total_paise, true], ['Payments matched', preview.invoice.covered_paise, false], ['Balance to pay', preview.invoice.open_paise, true]] as const).map(([label, value, strong]) => <View key={label} className="flex-row justify-between gap-4">
        <Text className={'text-sm leading-6 text-text-primary ' + (strong ? 'font-bold' : '')}>{label}</Text><Text className={'text-sm leading-6 text-text-primary ' + (strong ? 'font-bold' : '')} style={tabular}>{invoiceMoney(value)}</Text></View>)}
    </View>
    <View className="mt-5 gap-1 border-t border-border-soft pt-3"><Text className="text-xs leading-5 text-text-secondary">Prepared by {preview.invoice.created_by_name}. Payment status checked {historyTimeLabel(preview.checkedAt.toISOString())}.</Text>
      <Text className="text-xs leading-5 text-text-secondary">Selected deliveries only. Unmatched branch receipts are not included. No additional tax has been calculated.</Text></View>
  </View> : null;
  // In the preview the paper continues straight into its line rows, so no gap below the header.
  const header = <View className={'gap-3 ' + (preview ? '' : 'pb-3')}>
    <KHeader title={preview ? 'Invoice preview' : detailId && invoice ? invoiceNumber(invoice.invoice_no) : filter.candidates ? 'New invoice' : 'Invoices'} large={false}
      onBack={busy ? undefined : preview ? () => { setPreview(null); setError(null); } : detailId ? backToList : filter.candidates ? () => resetFilter({ candidates: false }) : undefined}
      right={!detailId && !filter.candidates && access.can('invoices.create') ? <Action label={desktop ? 'New invoice' : '+ New'} accessibilityLabel="New invoice" primary onPress={() => resetFilter({ candidates: true })} disabled={loading || busy} /> : null} />
    {preview ? null : !detailId ? <>
      {/* Task 224: the status filter is a dropdown with ticks beside the dates, not a row of pills. */}
      <View className={'gap-2 ' + (desktop ? 'flex-row items-end' : '')}>
        <View className={desktop ? 'max-w-[340px] flex-1' : ''}><ReportSelect label="Branch" value={filter.partyId} options={branches}
          allowEmpty={!filter.candidates} emptyLabel={filter.candidates ? 'Choose a branch' : 'All branches'} outlined onChange={partyId => resetFilter({ partyId })} /></View>
        <View className="flex-row items-end gap-2">
          <View className={desktop ? 'shrink' : 'min-w-0 flex-1'}><ReportDateRange label="Invoice delivery period" value={filter} outlined onChange={range => resetFilter(range)} /></View>
          {filter.candidates ? null : <View className={desktop ? 'w-[240px]' : 'min-w-0 flex-1'}><ReportMultiSelect label="Invoice status" allLabel="All statuses" options={STATUS_OPTIONS}
            value={filter.statuses ?? INVOICE_STATUSES} onChange={statuses => resetFilter({ statuses })} /></View>}
        </View>
      </View>
      <Text className="text-xs leading-5 text-text-secondary">{filter.candidates ? 'Select finished-goods deliveries. Each delivery includes all its items. Already invoiced deliveries are excluded.' : 'Invoices overlapping the selected delivery period. Paid status follows matched branch payments.'}</Text>
      {filter.candidates && data?.deliveries.length ? <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Select all deliveries on this page" aria-checked={allPage} accessibilityState={{ checked: allPage, disabled: busy }} disabled={busy} onPress={selectPage}
          className="min-h-[44px] flex-row items-center gap-2 rounded-lg border border-border px-3 hover:bg-accent-soft active:bg-accent-soft focus:border-primary">
          <Tick size={20} on={allPage} /><Text className="text-sm font-semibold text-text-primary">Select page</Text>
        </Pressable><Text className="text-xs text-text-secondary">{selected.size}/100 selected</Text>
      </View> : null}
    </> : invoice ? <>
      <View className="flex-row items-start justify-between gap-3"><View className="min-w-0 flex-1"><Text className="text-lg font-bold leading-6 text-text-primary">{invoice.party_name}</Text><Text className="text-xs leading-5 text-text-secondary">{kitchenRangeLabel({ startDate: invoice.start_date, endDate: invoice.end_date })}</Text></View><Status invoice={invoice} /></View>
      <View className="flex-row flex-wrap gap-4 border-y border-border-soft py-3">
        {[['Total', invoice.total_paise], ['Matched payments', invoice.covered_paise], ['To pay', invoice.open_paise]].map(([label, value]) => <View key={String(label)} className="min-w-[80px] flex-1"><Text className="text-xs leading-4 text-text-secondary">{label}</Text><Text className="text-lg font-bold leading-6 text-text-primary" style={tabular}>{invoiceMoney(Number(value))}</Text></View>)}
      </View>
      <View className="flex-row flex-wrap gap-2"><Action label="Preview invoice" disabled={busy} onPress={() => void openPreview()} />
        {invoice.status === 'to_be_paid' && access.can('invoices.receive') ? <Action label="Record payment" primary disabled={busy || !!editor} onPress={() => { paymentKey.current = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); setAmount(String(invoice.open_paise / 100)); setPaymentDate(today); setEditor('receive'); }} /> : null}
        {invoice.status !== 'cancelled' && access.can('invoices.cancel') ? <Action label="Cancel invoice" disabled={busy || !!editor} onPress={() => { setReason(''); setEditor('cancel'); }} /> : null}
      </View>
      {invoice.cancelled_at ? <Text className="text-sm leading-5 text-text-secondary">Cancelled: {invoice.cancel_reason}</Text> : null}
      <Text className="text-xs leading-5 text-text-secondary">Prepared {invoiceIssuedDate(invoice.created_at)} by {invoice.created_by_name}. Unmatched branch receipts are not counted as invoice payments.</Text>
      {pane}
      {desktop ? <View className="flex-row gap-3 bg-surface-tint px-3 py-2"><Text className="w-[34%] text-xs font-semibold text-text-secondary">Finished goods</Text><Text className="flex-1 text-xs font-semibold text-text-secondary">Delivery date</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Quantity</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Rate</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Amount</Text></View> : null}
    </> : null}
    {message && !preview ? <Text accessibilityRole="alert" className="text-sm leading-5" style={{ color: semantic.success }}>{message}</Text> : null}
    {error && !editor ? <><Notice text={error} />{preview ? null : <Action label="Retry loading" disabled={loading || busy} onPress={reload} />}</> : null}
    {loading ? <ActivityIndicator accessibilityLabel="Loading invoices" color={colors.primary} /> : null}
    {docHeader}
  </View>;
  return <KeyboardAvoider><KScreen scroll={false} footer={filter.candidates && !detailId ? <View className="flex-row flex-wrap items-center justify-between gap-2"><View><Text className="text-xs text-text-secondary">{selected.size} deliveries selected</Text><Text className="text-lg font-bold text-text-primary" style={tabular}>{invoiceMoney(total)}</Text></View><Action label={busy ? 'Creating…' : 'Create invoice'} primary disabled={loading || busy || !selected.size} onPress={() => void create()} /></View> : undefined}>
    <View className="mx-auto w-full max-w-[1120px] flex-1 px-4">
      <FlatList<Row> data={loading || (error && !preview) ? [] : rows} keyExtractor={r => r.kind + r.value.id} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }} refreshing={false} onRefresh={preview ? undefined : reload}
        ListEmptyComponent={!loading && !error ? !detailId && !filter.candidates ? <View className="items-start gap-2 py-5">
          <Text className="text-sm font-semibold leading-5 text-text-primary">{narrowedTo ? narrowedTo.length === 0 ? 'No status is ticked. Tick one under Invoice status.' : 'No invoices ' + narrowedTo.map(s => statusNoun[s]).join(' or ') + ' for this period.' : 'No saved invoices for this period.'}</Text>
          {narrowedTo ? <Action label="Show all invoices" disabled={busy} onPress={() => resetFilter({ statuses: INVOICE_STATUSES })} /> : <Text className="text-sm leading-5 text-text-secondary">Choose a branch and select its finished-goods deliveries to create an invoice.</Text>}
          {access.can('invoices.create') && !narrowedTo ? <Action label="Select deliveries" primary disabled={busy} onPress={() => resetFilter({ candidates: true })} /> : null}
        </View> : <Text className="py-5 text-sm leading-5 text-text-secondary">{detailId ? 'Invoice unavailable.' : filter.partyId ? 'No uninvoiced finished-goods deliveries for this period. Try another date range.' : 'Choose a branch to load its deliveries.'}</Text> : null}
        ListFooterComponent={preview ? docFooter : !detailId && data && data.total_rows > 50 ? <View className="mt-3 flex-row flex-wrap items-center justify-between gap-2"><Action label="Previous page" disabled={loading || busy || filter.page === 0} onPress={() => setFilter(f => ({ ...f, page: f.page - 1 }))} /><Text className="text-xs text-text-secondary">Page {filter.page + 1} of {Math.ceil(data.total_rows / 50)}</Text><Action label="Next page" disabled={loading || busy || (filter.page + 1) * 50 >= data.total_rows} onPress={() => setFilter(f => ({ ...f, page: f.page + 1 }))} /></View> : null}
        renderItem={({ item }) => item.kind === 'invoice' ? <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + invoiceNumber(item.value.invoice_no) + ', ' + item.value.party_name + ', ' + invoiceMoney(item.value.total_paise) + ', ' + invoiceStatus(item.value.status) + (item.value.status === 'to_be_paid' && item.value.covered_paise > 0 ? ', ' + invoiceMoney(item.value.open_paise) + ' left' : '')} disabled={busy} onPress={() => { setMessage(null); setDetailId(item.value.id); }}
          className="min-h-16 flex-row items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2 hover:bg-accent-soft active:bg-accent-soft focus:border-primary">
          {desktop ? null : <Avatar name={item.value.party_name} size={38} />}
          <View className="min-w-0 flex-1"><Text className="text-sm font-bold leading-5 text-text-primary">{invoiceNumber(item.value.invoice_no)} · {item.value.party_name}</Text><Text className="text-xs leading-5 text-text-secondary">{kitchenRangeLabel({ startDate: item.value.start_date, endDate: item.value.end_date })}</Text></View>
          <View className="items-end"><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.total_paise)}</Text><Status invoice={item.value} pill={!desktop} />
            {item.value.status === 'to_be_paid' && item.value.covered_paise > 0 ? <Text className="text-xs leading-4 text-text-secondary" style={tabular}>{invoiceMoney(item.value.open_paise)} left</Text> : null}</View>
        </Pressable> : item.kind === 'delivery' ? <Pressable accessibilityRole="checkbox" accessibilityLabel={'Select delivery ' + invoiceDate(item.value.entry_date) + ' ' + invoiceMoney(item.value.amount_paise)} aria-checked={selected.has(item.value.id)} accessibilityState={{ checked: selected.has(item.value.id), disabled: busy || (!selected.has(item.value.id) && selected.size >= 100) }} disabled={busy || (!selected.has(item.value.id) && selected.size >= 100)} onPress={() => toggle(item.value)}
          className={'min-h-16 flex-row items-start gap-3 border-b border-border-soft px-3 py-3 hover:bg-accent-soft active:bg-accent-soft focus:border-primary ' + (selected.has(item.value.id) ? 'bg-surface-tint' : 'bg-surface-elevated')}>
          <Tick size={20} on={selected.has(item.value.id)} />
          <View className="min-w-0 flex-1"><View className="flex-row justify-between gap-2"><Text className="text-sm font-bold text-text-primary">{invoiceDate(item.value.entry_date)}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.amount_paise)}</Text></View>
            <Text className="text-xs leading-5 text-text-secondary">{item.value.lines.map(l => l.item_name + ' · ' + formatQty(l.qty, l.unit) + ' × ' + invoiceMoney(l.price_paise)).join('\n')}</Text></View>
        </Pressable> : item.kind === 'docline' ? <View className={paper}><View className="border-b border-border-soft px-2 py-2">
          {desktop ? <View className="min-h-11 flex-row items-center gap-3"><Text className="w-[18%] text-sm text-text-secondary">{invoiceDate(item.date)}</Text><Text className="flex-1 text-sm font-semibold text-text-primary">{item.value.item_name}</Text><Text className="w-[14%] text-right text-sm text-text-secondary">{formatQty(item.value.qty, item.value.unit)}</Text><Text className="w-[14%] text-right text-sm text-text-secondary" style={tabular}>{invoiceMoney(item.value.price_paise)}</Text><Text className="w-[16%] text-right text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View>
            : <><View className="flex-row justify-between gap-3"><Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text-primary">{item.value.item_name}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View><Text className="text-xs leading-5 text-text-secondary">{invoiceDate(item.date)} · {formatQty(item.value.qty, item.value.unit)} × {invoiceMoney(item.value.price_paise)}</Text></>}
        </View></View> : <View className="border-b border-border-soft bg-surface-elevated px-3 py-2">
          {desktop ? <View className="min-h-11 flex-row items-center gap-3"><Text className="w-[34%] text-sm font-semibold text-text-primary">{item.value.item_name}</Text><Text className="flex-1 text-xs text-text-secondary">{invoiceDate(item.date)}</Text><Text className="flex-1 text-right text-sm text-text-secondary">{formatQty(item.value.qty, item.value.unit)}</Text><Text className="flex-1 text-right text-sm text-text-secondary" style={tabular}>{invoiceMoney(item.value.price_paise)}</Text><Text className="flex-1 text-right text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View>
            : <><View className="flex-row justify-between gap-3"><Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text-primary">{item.value.item_name}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View><Text className="text-xs leading-5 text-text-secondary">{invoiceDate(item.date)} · {formatQty(item.value.qty, item.value.unit)} × {invoiceMoney(item.value.price_paise)}</Text></>}
        </View>} />
    </View>
  </KScreen></KeyboardAvoider>;
}
