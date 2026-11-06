import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';
import { ActivityIndicator, FlatList, Image, Platform, Pressable, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { colors, semantic } from '@/lib/pos/brand';
import { kitchenMonthRange, kitchenRangeLabel, kitchenToday, validKitchenDate } from '@/lib/pos/kitchen-analytics-utils';
import { cancelKitchenInvoice, createKitchenInvoice, fetchKitchenInvoice, fetchKitchenInvoices, receiveKitchenInvoicePayment } from '@/lib/pos/kitchen-invoice-service';
import { printKitchenInvoice } from '@/lib/pos/kitchen-invoice-export';
import { invoiceDate, invoiceIssuedDate, invoiceMoney, invoiceNumber, invoiceStatus } from '@/lib/pos/kitchen-invoice-utils';
import { formatDayLabel, formatQty, parseAmount } from '@/lib/pos/kitchen-utils';
import { historyTimeLabel } from '@/lib/pos/kitchen-history-utils';
import { INVOICE_STATUSES, type InvoiceDelivery, type InvoiceFilter, type InvoiceLine, type InvoiceStatus, type InvoiceWorkspace as WorkspaceData, type KitchenInvoice } from '@/lib/pos/kitchen-invoice-types';
import type { KitchenMode } from '@/lib/pos/kitchen-types';
import type { ReportOption } from '@/lib/pos/kitchen-analytics-types';
import { Avatar, KHeader, KScreen, Notice, PrimaryButton, ReceiptLine, SelectRow, SettingsGroup, TextField, Tick } from '@/components/kitchen/ui';
import { AmountPad, AmountRow, TotalBar, WhenRow } from '@/components/kitchen/EntryRows';
import { ReportDateRange } from '@/components/kitchen/ReportDateRange';
import { ReportMultiSelect, ReportSelect } from '@/components/kitchen/ReportSelect';
import { useDateGuard } from '@/components/kitchen/forms';

const PAID_IN: readonly { value: KitchenMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
];
// Task 287: the badge the printed invoice carries, shown on the preview too.
const badge: ImageSourcePropType = require('@/../assets/images/le-laban-badge.png');
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
function Action({ label, accessibilityLabel, onPress, primary = false, disabled = false, wide = false }: { label: string; accessibilityLabel?: string; onPress: () => void; primary?: boolean; disabled?: boolean; wide?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    className={'min-h-[44px] min-w-[44px] max-w-full items-center justify-center rounded-lg border px-3 py-1.5 ' + (wide ? 'w-full ' : 'self-start ') +
      (disabled ? 'border-border bg-surface-tint' : primary ? 'border-primary bg-primary hover:bg-primary-deep active:bg-primary-deep web:focus-visible:border-primary-deep' : 'border-border bg-surface-elevated hover:bg-accent-soft active:bg-accent-soft web:focus-visible:border-primary')}>
    <Text className={'text-sm font-semibold leading-5 ' + (primary && !disabled ? 'text-text-on-primary' : disabled ? 'text-text-secondary' : 'text-primary')}>{label}</Text>
  </Pressable>;
}
function Status({ invoice, pill = false }: { invoice: KitchenInvoice; pill?: boolean }) {
  const color = invoice.status === 'paid' ? semantic.success : invoice.status === 'cancelled' ? colors.textSecondary : semantic.warning;
  // Task 233: a phone shows the status as a soft pill.
  if (pill) return <View className="mt-0.5 rounded-full px-2 py-0.5" style={{ backgroundColor: invoice.status === 'paid' ? semantic.successSoft : invoice.status === 'cancelled' ? colors.surfaceTint : semantic.warningSoft }}><Text className="text-xs font-bold" style={{ color }}>{invoiceStatus(invoice.status)}</Text></View>;
  return <Text className="text-xs font-bold leading-5" style={{ color }}>{invoiceStatus(invoice.status)}</Text>;
}

/** Task 301: one delivery to pick: its day, how many items and what it comes to; its items open underneath. */
function DeliveryRow({ delivery, first, last, on, full, busy, open, onToggle, onOpen }: { delivery: InvoiceDelivery; first: boolean; last: boolean; on: boolean; full: boolean; busy: boolean; open: boolean; onToggle: () => void; onOpen: () => void }) {
  const day = formatDayLabel(delivery.entry_date, '');
  const count = delivery.lines.length;
  const blocked = busy || (!on && full);
  const Chevron = open ? ChevronUp : ChevronDown;
  return <View className={'overflow-hidden border-x border-border-soft ' + (on ? 'bg-surface-tint ' : 'bg-surface-elevated ') + (first ? 'rounded-t-[18px] border-t ' : '') + (last ? 'rounded-b-[18px] border-b' : 'border-b')}>
    <View className="flex-row items-center">
      <Pressable accessibilityRole="checkbox" accessibilityLabel={'Select delivery ' + day + ' ' + invoiceMoney(delivery.amount_paise)} aria-checked={on} accessibilityState={{ checked: on, disabled: blocked }} disabled={blocked} onPress={onToggle}
        className={'min-h-[60px] min-w-0 flex-1 flex-row items-center gap-3 py-2.5 pl-3 ' + (on ? '' : 'hover:bg-accent-soft active:bg-accent-soft')}>
        <Tick size={22} on={on} />
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{day}</Text>
          <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{count === 1 ? '1 item' : count + ' items'} · {delivery.lines.map(l => l.item_name).join(', ')}</Text>
        </View>
        <Text className="text-[15px] font-bold text-text-primary" style={tabular}>{invoiceMoney(delivery.amount_paise)}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={(open ? 'Hide items of ' : 'Show items of ') + day} aria-expanded={open} onPress={onOpen} className="h-[60px] w-11 items-center justify-center hover:bg-accent-soft active:bg-accent-soft">
        <Chevron size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
    {open ? <View className="border-t border-border-soft px-3.5 py-1.5">
      {delivery.lines.map(l => <ReceiptLine key={l.id} name={l.item_name} detail={formatQty(l.qty, l.unit) + ' × ' + invoiceMoney(l.price_paise)} amount={invoiceMoney(l.line_paise)} />)}
    </View> : null}
  </View>;
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
  // Task 286: a payment in the Received layout; on a phone the pad comes up when the amount row is tapped.
  const [padOpen, setPadOpen] = useState(false);
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
  // Task 301: this tab stays mounted, so a range that ran up to today moves on with the day; otherwise today's sends would be outside it.
  const lastToday = useRef(today);
  const rollDay = useCallback((): void => {
    const now = kitchenToday(); const was = lastToday.current;
    if (now === was) return;
    lastToday.current = now;
    setFilter(f => f.endDate !== was ? f : { ...f, page: 0, ...(f.startDate === was.slice(0, 7) + '-01' ? kitchenMonthRange(now.slice(0, 7), now) : { endDate: now }) });
  }, []);
  useFocusEffect(useCallback(() => { if (focusedOnce.current && !busyRef.current) { rollDay(); setRefresh(v => v + 1); } focusedOnce.current = true; }, [rollDay]));
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
  const reload = (): void => { if (busyRef.current) return; rollDay(); setSelected(new Map()); setRefresh(v => v + 1); };
  // Task 301: a delivery is one line until its items are asked for.
  const [openDeliveries, setOpenDeliveries] = useState<ReadonlySet<string>>(new Set());
  const toggleOpen = (id: string): void => setOpenDeliveries(now => { const next = new Set(now); if (!next.delete(id)) next.add(id); return next; });
  const rows = useMemo<Row[]>(() => preview ? preview.invoice.deliveries.flatMap(d => d.lines.map(l => ({ kind: 'docline' as const, value: l, date: d.entry_date })))
    : detailId ? invoice?.deliveries.flatMap(d => d.lines.map(l => ({ kind: 'line' as const, value: l, date: d.entry_date }))) ?? []
    : filter.candidates ? (data?.deliveries ?? []).map(value => ({ kind: 'delivery', value })) : (data?.rows ?? []).map(value => ({ kind: 'invoice', value })), [data, filter.candidates, invoice, detailId, preview]);
  const pane = invoice && editor ? <View className="gap-3 border-y border-border-soft bg-surface-elevated py-3">
    <Text className="text-base font-bold text-text-primary">{editor === 'receive' ? 'Record received payment' : 'Cancel this invoice'}</Text>
    {error ? <Notice text={error} /> : null}
    {editor === 'receive' ? <>
      <View className={desktop ? 'max-w-[420px] gap-3' : 'gap-1.5'}>
        <SettingsGroup>
          {desktop ? null : <AmountRow label="Amount received" amount={paymentPaise / 100} open={padOpen} onPress={() => setPadOpen(o => !o)} />}
          <SelectRow label="Paid in" value={mode} options={PAID_IN} onChange={setMode} />
          <WhenRow date={paymentDate} onChange={setPaymentDate} lockReason={lockReason} onLockReason={setLockReason} />
        </SettingsGroup>
        {desktop ? <TextField label="Amount received" value={amount} onChange={setAmount} prefix="₹" keyboardType="decimal-pad" placeholder="0" big /> : null}
        <Text className="text-xs font-semibold leading-5" style={{ color: paymentPaise > invoice.open_paise ? semantic.warning : colors.textSecondary }}>{paymentPaise > invoice.open_paise ? 'More than the ' + invoiceMoney(invoice.open_paise) + ' open. Record any extra on Received.' : invoiceMoney(invoice.open_paise) + ' open on this invoice'}</Text>
      </View>
    </> : <><Text className="text-sm leading-5 text-text-secondary">This keeps the invoice as cancelled and releases its deliveries for correction or a new invoice. Sales, stock and payments stay recorded.</Text>
      <TextField label="Invoice cancellation reason" value={reason} onChange={setReason} placeholder="Reason for cancelling" /></>}
    <View className="flex-row flex-wrap gap-2">{editor === 'receive' && !desktop ? null : <Action label={busy ? 'Saving…' : editor === 'receive' ? 'Save payment' : 'Confirm cancellation'} primary onPress={() => void saveAction()}
      disabled={busy || (editor === 'cancel' ? !reason.trim() || reason.trim().length > 200 : paymentPaise <= 0 || paymentPaise > invoice.open_paise || !validKitchenDate(paymentDate) || paymentDate > today || !paymentDateOk)} />}
      <Action label="Close" onPress={() => setEditor(null)} disabled={busy} /></View>
  </View> : null;
  const paymentWhy = !invoice || editor !== 'receive' ? undefined : paymentPaise <= 0 ? 'Enter the amount' : paymentPaise > invoice.open_paise ? 'More than is open'
    : !validKitchenDate(paymentDate) || paymentDate > today || !paymentDateOk ? 'Check the date' : undefined;
  const paymentSave = <PrimaryButton label={paymentPaise > 0 ? 'Save · ' + invoiceMoney(paymentPaise) : 'Save'} onPress={() => void saveAction()} disabled={busy || !!paymentWhy} loading={busy} reason={paymentWhy} />;
  const paymentFooter = invoice && editor === 'receive' && !desktop
    ? padOpen ? <AmountPad label="Amount received" value={amount} onChange={setAmount} onDone={() => setPadOpen(false)} save={paymentWhy ? undefined : paymentSave} /> : paymentSave
    : undefined;
  const docHeader = preview ? <>
    <View className="flex-row flex-wrap items-center gap-2"><Action label={busy ? 'Preparing…' : Platform.OS === 'web' ? 'Print / Save PDF' : 'Share PDF'} primary disabled={busy} onPress={() => void print()} />
      <Text className="min-w-0 flex-1 text-xs leading-5 text-text-secondary">{Platform.OS === 'web' ? 'Choose Save as PDF in the print dialog to keep a file.' : 'Share the PDF to WhatsApp, email or a printer.'}</Text></View>
    <View className={paper + ' mt-1 rounded-t-lg border-t pt-6'}>
      <View className={'gap-4 border-b-2 border-primary pb-4 ' + (desktop ? 'flex-row justify-between' : '')}>
        <View className="min-w-0 flex-1 flex-row items-center gap-3.5">
          <Image source={badge} accessibilityLabel="Le Laban" style={{ width: desktop ? 112 : 88, height: (desktop ? 112 : 88) * 0.625 }} resizeMode="contain" />
          <View className="min-w-0 flex-1"><Text className="text-lg font-bold leading-6 text-text-primary">{preview.invoice.kitchen_name}</Text><Text className="text-sm leading-5 text-text-secondary">Branch supply invoice</Text></View>
        </View>
        <View className={desktop ? 'items-end' : ''}><Text className="text-2xl font-extrabold leading-8 text-text-primary">{invoiceNumber(preview.invoice.invoice_no)}</Text><Status invoice={preview.invoice} /><Text className="text-xs leading-5 text-text-secondary">Issued {invoiceIssuedDate(preview.invoice.created_at)}</Text></View>
      </View>
      <View className="gap-1 py-4"><Text className="text-sm font-bold leading-5 text-text-primary">Bill to {preview.invoice.party_name}</Text>
        <Text className="text-sm leading-5 text-text-secondary">Delivery period: {invoiceDate(preview.invoice.start_date)} to {invoiceDate(preview.invoice.end_date)} (inclusive)</Text>
        {preview.invoice.cancelled_at ? <Text className="text-sm leading-5 text-text-primary">Cancelled: {preview.invoice.cancel_reason}</Text> : null}</View>
      {desktop ? <View className="flex-row gap-3 bg-surface-tint px-2 py-2"><Text className="w-[18%] text-xs font-semibold text-text-secondary">Date</Text><Text className="flex-1 text-xs font-semibold text-text-secondary">Items</Text><Text className="w-[14%] text-right text-xs font-semibold text-text-secondary">Quantity</Text><Text className="w-[14%] text-right text-xs font-semibold text-text-secondary">Rate</Text><Text className="w-[16%] text-right text-xs font-semibold text-text-secondary">Amount</Text></View> : null}
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
      {filter.candidates && data?.deliveries.length ? <View className="-mb-2 flex-row items-center justify-between gap-2">
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Select all deliveries" aria-checked={allPage} accessibilityState={{ checked: allPage, disabled: busy }} disabled={busy} onPress={selectPage}
          className="min-h-[44px] flex-row items-center gap-3 rounded-lg px-3 hover:bg-accent-soft active:bg-accent-soft web:focus-visible:border-primary">
          <Tick size={22} on={allPage} /><Text className="text-sm font-bold text-text-primary">Select all</Text>
        </Pressable>
        <Text className="px-3 text-[13px] font-semibold text-text-secondary">{selected.size >= 100 ? '100 is the most on one invoice' : data.total_rows === 1 ? '1 delivery' : data.total_rows + ' deliveries'}</Text>
      </View> : null}
    </> : invoice ? <>
      <View className="flex-row items-start justify-between gap-3"><View className="min-w-0 flex-1"><Text className="text-lg font-bold leading-6 text-text-primary">{invoice.party_name}</Text><Text className="text-xs leading-5 text-text-secondary">{kitchenRangeLabel({ startDate: invoice.start_date, endDate: invoice.end_date })}</Text></View><Status invoice={invoice} /></View>
      <View className="flex-row flex-wrap gap-4 border-y border-border-soft py-3">
        {[['Total', invoice.total_paise], ['Matched payments', invoice.covered_paise], ['To pay', invoice.open_paise]].map(([label, value]) => <View key={String(label)} className="min-w-[80px] flex-1"><Text className="text-xs leading-4 text-text-secondary">{label}</Text><Text className="text-lg font-bold leading-6 text-text-primary" style={tabular}>{invoiceMoney(Number(value))}</Text></View>)}
      </View>
      {/* Task 303: the main action on its own line on a phone, the other two sharing one at the same size. */}
      <View className={desktop ? 'flex-row gap-2' : 'gap-2'}>
        {invoice.status === 'to_be_paid' && access.can('invoices.receive') ? <View className={desktop ? 'w-[180px]' : ''}><Action wide label="Record payment" primary disabled={busy || !!editor} onPress={() => { paymentKey.current = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); setAmount(''); setPadOpen(false); setPaymentDate(today); setEditor('receive'); }} /></View> : null}
        <View className="flex-row gap-2">
          <View className={desktop ? 'w-[180px]' : 'min-w-0 flex-1'}><Action wide label="Preview invoice" disabled={busy} onPress={() => void openPreview()} /></View>
          {invoice.status !== 'cancelled' && access.can('invoices.cancel') ? <View className={desktop ? 'w-[180px]' : 'min-w-0 flex-1'}><Action wide label="Cancel invoice" disabled={busy || !!editor} onPress={() => { setReason(''); setEditor('cancel'); }} /></View> : null}
        </View>
      </View>
      {invoice.cancelled_at ? <Text className="text-sm leading-5 text-text-secondary">Cancelled: {invoice.cancel_reason}</Text> : null}
      <Text className="text-xs leading-5 text-text-secondary">Prepared {invoiceIssuedDate(invoice.created_at)} by {invoice.created_by_name}</Text>
      {pane}
      {desktop ? <View className="flex-row gap-3 bg-surface-tint px-3 py-2"><Text className="w-[34%] text-xs font-semibold text-text-secondary">Items</Text><Text className="flex-1 text-xs font-semibold text-text-secondary">Delivery date</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Quantity</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Rate</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Amount</Text></View> : null}
    </> : null}
    {message && !preview ? <Text accessibilityRole="alert" className="text-sm leading-5" style={{ color: semantic.success }}>{message}</Text> : null}
    {error && !editor ? <><Notice text={error} />{preview ? null : <Action label="Retry loading" disabled={loading || busy} onPress={reload} />}</> : null}
    {loading ? <ActivityIndicator accessibilityLabel="Loading invoices" color={colors.primary} /> : null}
    {docHeader}
  </View>;
  return <KeyboardAvoider><KScreen scroll={false} footer={paymentFooter ?? (filter.candidates && !detailId ? <TotalBar caption={selected.size === 0 ? 'None selected' : selected.size === 1 ? '1 delivery' : selected.size + ' deliveries'} total={invoiceMoney(total)} showTotal={selected.size > 0}><PrimaryButton label="Create invoice" disabled={loading || !selected.size} loading={busy} reason={selected.size ? undefined : 'Select a delivery'} onPress={() => void create()} /></TotalBar> : undefined)}>
    <View className="mx-auto w-full max-w-[1120px] flex-1 px-4">
      <FlatList<Row> data={loading || (error && !preview) ? [] : rows} keyExtractor={r => r.kind + r.value.id} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }} refreshing={false} onRefresh={preview ? undefined : reload}
        ListEmptyComponent={!loading && !error ? !detailId && !filter.candidates ? <View className="items-start gap-2 py-5">
          <Text className="text-sm font-semibold leading-5 text-text-primary">{narrowedTo ? narrowedTo.length === 0 ? 'No status is ticked. Tick one under Invoice status.' : 'No invoices ' + narrowedTo.map(s => statusNoun[s]).join(' or ') + ' for this period.' : 'No saved invoices for this period.'}</Text>
          {narrowedTo ? <Action label="Show all invoices" disabled={busy} onPress={() => resetFilter({ statuses: INVOICE_STATUSES })} /> : <Text className="text-sm leading-5 text-text-secondary">Choose a branch and select its deliveries.</Text>}
          {access.can('invoices.create') && !narrowedTo ? <Action label="Select deliveries" primary disabled={busy} onPress={() => resetFilter({ candidates: true })} /> : null}
        </View> : <Text className="py-5 text-sm leading-5 text-text-secondary">{detailId ? 'Invoice unavailable.' : filter.partyId ? 'Everything sent in these dates is already on an invoice.' : 'Choose a branch to load its deliveries.'}</Text> : null}
        ListFooterComponent={preview ? docFooter : !detailId && data && data.total_rows > 50 ? <View className="mt-3 flex-row flex-wrap items-center justify-between gap-2"><Action label="Previous page" disabled={loading || busy || filter.page === 0} onPress={() => setFilter(f => ({ ...f, page: f.page - 1 }))} /><Text className="text-xs text-text-secondary">Page {filter.page + 1} of {Math.ceil(data.total_rows / 50)}</Text><Action label="Next page" disabled={loading || busy || (filter.page + 1) * 50 >= data.total_rows} onPress={() => setFilter(f => ({ ...f, page: f.page + 1 }))} /></View> : null}
        renderItem={({ item, index }) => item.kind === 'invoice' ? <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + invoiceNumber(item.value.invoice_no) + ', ' + item.value.party_name + ', ' + invoiceMoney(item.value.total_paise) + ', ' + invoiceStatus(item.value.status) + (item.value.status === 'to_be_paid' && item.value.covered_paise > 0 ? ', ' + invoiceMoney(item.value.open_paise) + ' left' : '')} disabled={busy} onPress={() => { setMessage(null); setDetailId(item.value.id); }}
          className={'min-h-16 flex-row items-center gap-3 border-x border-b border-border-soft bg-surface-elevated px-3 py-2 hover:bg-accent-soft active:bg-accent-soft web:focus-visible:border-primary ' + (index === 0 ? 'rounded-t-[18px] border-t ' : '') + (index === rows.length - 1 ? 'rounded-b-[18px]' : '')}>
          {desktop ? null : <Avatar name={item.value.party_name} size={38} />}
          <View className="min-w-0 flex-1"><Text className="text-sm font-bold leading-5 text-text-primary">{invoiceNumber(item.value.invoice_no)} · {item.value.party_name}</Text><Text className="text-xs leading-5 text-text-secondary">{kitchenRangeLabel({ startDate: item.value.start_date, endDate: item.value.end_date })}</Text></View>
          <View className="items-end"><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.total_paise)}</Text><Status invoice={item.value} pill={!desktop} />
            {item.value.status === 'to_be_paid' && item.value.covered_paise > 0 ? <Text className="text-xs leading-4 text-text-secondary" style={tabular}>{invoiceMoney(item.value.open_paise)} left</Text> : null}</View>
        </Pressable> : item.kind === 'delivery' ? <DeliveryRow delivery={item.value} first={index === 0} last={index === rows.length - 1} on={selected.has(item.value.id)} full={selected.size >= 100} busy={busy} open={openDeliveries.has(item.value.id)} onToggle={() => toggle(item.value)} onOpen={() => toggleOpen(item.value.id)} />
          : item.kind === 'docline' ? <View className={paper}><View className="border-b border-border-soft px-2 py-2">
          {desktop ? <View className="min-h-11 flex-row items-center gap-3"><Text className="w-[18%] text-sm text-text-secondary">{invoiceDate(item.date)}</Text><Text className="flex-1 text-sm font-semibold text-text-primary">{item.value.item_name}</Text><Text className="w-[14%] text-right text-sm text-text-secondary">{formatQty(item.value.qty, item.value.unit)}</Text><Text className="w-[14%] text-right text-sm text-text-secondary" style={tabular}>{invoiceMoney(item.value.price_paise)}</Text><Text className="w-[16%] text-right text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View>
            : <><View className="flex-row justify-between gap-3"><Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text-primary">{item.value.item_name}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View><Text className="text-xs leading-5 text-text-secondary">{invoiceDate(item.date)} · {formatQty(item.value.qty, item.value.unit)} × {invoiceMoney(item.value.price_paise)}</Text></>}
        </View></View> : <View className={'border-x border-b border-border-soft bg-surface-elevated px-3 py-2 ' + (index === 0 && !desktop ? 'rounded-t-[18px] border-t ' : '') + (index === rows.length - 1 ? 'rounded-b-[18px]' : '')}>
          {desktop ? <View className="min-h-11 flex-row items-center gap-3"><Text className="w-[34%] text-sm font-semibold text-text-primary">{item.value.item_name}</Text><Text className="flex-1 text-xs text-text-secondary">{invoiceDate(item.date)}</Text><Text className="flex-1 text-right text-sm text-text-secondary">{formatQty(item.value.qty, item.value.unit)}</Text><Text className="flex-1 text-right text-sm text-text-secondary" style={tabular}>{invoiceMoney(item.value.price_paise)}</Text><Text className="flex-1 text-right text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View>
            : <><View className="flex-row justify-between gap-3"><Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text-primary">{item.value.item_name}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View><Text className="text-xs leading-5 text-text-secondary">{invoiceDate(item.date)} · {formatQty(item.value.qty, item.value.unit)} × {invoiceMoney(item.value.price_paise)}</Text></>}
        </View>} />
    </View>
  </KScreen></KeyboardAvoider>;
}
