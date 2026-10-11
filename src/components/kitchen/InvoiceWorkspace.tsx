import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Square } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { colors, semantic } from '@/lib/pos/brand';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { kitchenMonthRange, kitchenRangeLabel, kitchenToday, validKitchenDate } from '@/lib/pos/kitchen-analytics-utils';
import { cancelKitchenInvoice, createKitchenInvoice, fetchKitchenInvoice, fetchKitchenInvoices, receiveKitchenInvoicePayment } from '@/lib/pos/kitchen-invoice-service';
import { exportKitchenInvoice } from '@/lib/pos/kitchen-invoice-export';
import { invoiceMoney, invoiceNumber, invoiceStatus } from '@/lib/pos/kitchen-invoice-utils';
import { formatQty, parseAmount } from '@/lib/pos/kitchen-utils';
import type { InvoiceDelivery, InvoiceFilter, InvoiceLine, InvoiceWorkspace as WorkspaceData, KitchenInvoice } from '@/lib/pos/kitchen-invoice-types';
import type { KitchenMode } from '@/lib/pos/kitchen-types';
import type { ReportOption } from '@/lib/pos/kitchen-analytics-types';
import { KHeader, KScreen, Notice, TextField } from '@/components/kitchen/ui';
import { ReportDateRange } from '@/components/kitchen/ReportDateRange';
import { ReportSelect } from '@/components/kitchen/ReportSelect';
import { DateField, ModePicker } from '@/components/kitchen/forms';

type Row = { kind: 'invoice'; value: KitchenInvoice } | { kind: 'delivery'; value: InvoiceDelivery } | { kind: 'line'; value: InvoiceLine; date: string };
const tabular = { fontVariant: ['tabular-nums' as const] };
function Action({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    className={'min-h-[44px] min-w-[44px] max-w-full self-start items-center justify-center rounded-lg border px-3 py-1.5 ' +
      (disabled ? 'border-border bg-surface-tint' : primary ? 'border-primary bg-primary hover:bg-primary-deep active:bg-primary-deep focus:border-primary-deep' : 'border-border bg-surface-elevated hover:bg-accent-soft active:bg-accent-soft focus:border-primary')}>
    <Text className={'text-sm font-semibold leading-5 ' + (primary && !disabled ? 'text-text-on-primary' : disabled ? 'text-text-secondary' : 'text-primary')}>{label}</Text>
  </Pressable>;
}
function Status({ invoice }: { invoice: KitchenInvoice }) {
  return <Text className="text-xs font-bold leading-5" style={{ color: invoice.status === 'paid' ? semantic.success : invoice.status === 'cancelled' ? colors.textSecondary : semantic.warning }}>{invoiceStatus(invoice.status)}</Text>;
}

export function InvoiceWorkspace() {
  const params = useLocalSearchParams<{ start?: string; end?: string; party?: string }>();
  const today = kitchenToday(); const { width } = useWindowDimensions(); const desktop = width >= 700; const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<InvoiceFilter>(() => ({ ...kitchenMonthRange(today.slice(0, 7)),
    ...(params.start && params.end && validKitchenDate(params.start) && validKitchenDate(params.end) && params.start <= params.end && params.end <= today ? { startDate: params.start, endDate: params.end } : {}),
    partyId: params.party ?? null, page: 0, candidates: false }));
  const [data, setData] = useState<WorkspaceData | null>(null); const [branches, setBranches] = useState<ReportOption[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0); const [selected, setSelected] = useState<Map<string, InvoiceDelivery>>(new Map());
  const [invoice, setInvoice] = useState<KitchenInvoice | null>(null); const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [editor, setEditor] = useState<'receive' | 'cancel' | null>(null); const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today); const [mode, setMode] = useState<KitchenMode>('upi'); const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const paymentKey = useRef('');
  useEffect(() => {
    if (detailId) return;
    const controller = new AbortController(); setError(null); setData(null);
    if (filter.candidates && !filter.partyId) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void fetchKitchenInvoices(filter, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setLoading(false); setError(result.error); setData(result.data);
      if (result.data) setBranches(result.data.branches);
    });
    return () => controller.abort();
  }, [filter, refresh, detailId]);
  useEffect(() => {
    if (!detailId) return;
    let current = true; setLoading(true); setError(null); setInvoice(null); setEditor(null);
    void fetchKitchenInvoice(detailId).then(result => { if (!current) return; setLoading(false); setError(result.error); setInvoice(result.data); });
    return () => { current = false; };
  }, [detailId, refresh]);
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
    const result = editor === 'cancel' ? await cancelKitchenInvoice(invoice.id, reason) : await receiveKitchenInvoicePayment(invoice.id, Math.round(parseAmount(amount) * 100), paymentDate, mode, paymentKey.current);
    endBusy();
    if (result.error) { setError(result.error); return; }
    setMessage(editor === 'cancel' ? 'Invoice cancelled. Deliveries and payments are retained.' : 'Payment recorded');
    setEditor(null); setRefresh(v => v + 1);
  };
  const print = async (): Promise<void> => {
    if (!invoice || !startBusy()) return;
    const result = await exportKitchenInvoice(invoice.id); endBusy(); if (result.error) setError(result.error);
  };
  const backToList = (): void => { setDetailId(null); setInvoice(null); setEditor(null); setMessage(null); setError(null); resetFilter({ candidates: false }); };
  const rows = useMemo<Row[]>(() => detailId ? invoice?.deliveries.flatMap(d => d.lines.map(l => ({ kind: 'line' as const, value: l, date: d.entry_date }))) ?? []
    : filter.candidates ? (data?.deliveries ?? []).map(value => ({ kind: 'delivery', value })) : (data?.rows ?? []).map(value => ({ kind: 'invoice', value })), [data, filter.candidates, invoice, detailId]);
  const pane = invoice && editor ? <View className="gap-3 border-y border-border-soft bg-surface-elevated py-3">
    <Text className="text-base font-bold text-text-primary">{editor === 'receive' ? 'Record received payment' : 'Cancel this invoice'}</Text>
    {error ? <Notice text={error} /> : null}
    {editor === 'receive' ? <>
      <View className={desktop ? 'max-w-[420px]' : ''}><TextField label="Invoice payment amount" value={amount} onChange={setAmount} prefix="₹" keyboardType="decimal-pad" placeholder="Amount received" /></View>
      <ModePicker value={mode} onChange={setMode} /><DateField value={paymentDate} onChange={setPaymentDate} />
      <Text className="text-xs leading-5 text-text-secondary">Record money already received. This payment is matched only to this invoice’s deliveries.</Text>
    </> : <><Text className="text-sm leading-5 text-text-secondary">This keeps the invoice as cancelled and releases its deliveries for correction or a new invoice. Sales, stock and payments stay recorded.</Text>
      <TextField label="Invoice cancellation reason" value={reason} onChange={setReason} placeholder="Reason for cancelling" /></>}
    <View className="flex-row flex-wrap gap-2"><Action label={busy ? 'Saving…' : editor === 'receive' ? 'Confirm received payment' : 'Confirm cancellation'} primary onPress={() => void saveAction()}
      disabled={busy || (editor === 'cancel' ? !reason.trim() || reason.trim().length > 200 : parseAmount(amount) <= 0 || Math.round(parseAmount(amount) * 100) > invoice.open_paise || !validKitchenDate(paymentDate) || paymentDate > today)} />
      <Action label="Close" onPress={() => setEditor(null)} disabled={busy} /></View>
  </View> : null;
  const header = <View className="gap-3 pb-3">
    <KHeader title={detailId && invoice ? invoiceNumber(invoice.number) : filter.candidates ? 'New invoice' : 'Invoices'} large={false}
      onBack={busy ? undefined : detailId ? backToList : filter.candidates ? () => resetFilter({ candidates: false }) : backToKitchen}
      right={!detailId && !filter.candidates ? <Action label="New invoice" primary onPress={() => resetFilter({ candidates: true })} disabled={loading || busy} /> : null} />
    {!detailId ? <>
      <View className={'gap-2 ' + (desktop ? 'flex-row items-end' : '')}>
        <View className={desktop ? 'max-w-[340px] flex-1' : ''}><ReportSelect label="Branch" value={filter.partyId} options={branches}
          allowEmpty={!filter.candidates} emptyLabel={filter.candidates ? 'Choose a branch' : 'All branches'} outlined onChange={partyId => resetFilter({ partyId })} /></View>
        <View className={desktop ? 'shrink' : ''}><ReportDateRange label="Invoice delivery period" value={filter} outlined onChange={range => resetFilter(range)} /></View>
        <View className={desktop ? 'self-end' : 'self-start'}><Action label="Refresh invoices" disabled={loading || busy} onPress={() => { setSelected(new Map()); setRefresh(v => v + 1); }} /></View>
      </View>
      <Text className="text-xs leading-5 text-text-secondary">{filter.candidates ? 'Select finished-goods deliveries. Each delivery includes all its items. Already invoiced deliveries are excluded.' : 'Invoices overlapping the selected delivery period. Paid status follows matched branch payments.'}</Text>
      {filter.candidates && data?.deliveries.length ? <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Select all deliveries on this page" aria-checked={allPage} accessibilityState={{ checked: allPage, disabled: busy }} disabled={busy} onPress={selectPage}
          className="min-h-[44px] flex-row items-center gap-2 rounded-lg border border-border px-3 hover:bg-accent-soft active:bg-accent-soft focus:border-primary">
          {allPage ? <Check size={18} color={colors.primary} /> : <Square size={18} color={colors.textSecondary} />}<Text className="text-sm font-semibold text-text-primary">Select page</Text>
        </Pressable><Text className="text-xs text-text-secondary">{selected.size}/100 selected</Text>
      </View> : null}
    </> : invoice ? <>
      <View className="flex-row items-start justify-between gap-3"><View className="min-w-0 flex-1"><Text className="text-lg font-bold leading-6 text-text-primary">{invoice.party_name}</Text><Text className="text-xs leading-5 text-text-secondary">{kitchenRangeLabel({ startDate: invoice.start_date, endDate: invoice.end_date })}</Text></View><Status invoice={invoice} /></View>
      <View className="flex-row flex-wrap gap-4 border-y border-border-soft py-3">
        {[['Total', invoice.total_paise], ['Matched payments', invoice.covered_paise], ['To pay', invoice.open_paise]].map(([label, value]) => <View key={String(label)} className="min-w-[80px] flex-1"><Text className="text-xs leading-4 text-text-secondary">{label}</Text><Text className="text-lg font-bold leading-6 text-text-primary" style={tabular}>{invoiceMoney(Number(value))}</Text></View>)}
      </View>
      <View className="flex-row flex-wrap gap-2"><Action label={Platform.OS === 'web' ? 'Print / PDF' : 'Share PDF'} disabled={busy} onPress={() => void print()} />
        {invoice.status === 'to_be_paid' ? <Action label="Record payment" primary disabled={busy || !!editor} onPress={() => { paymentKey.current = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); setAmount(String(invoice.open_paise / 100)); setPaymentDate(today); setEditor('receive'); }} /> : null}
        {invoice.status !== 'cancelled' ? <Action label="Cancel invoice" disabled={busy || !!editor} onPress={() => { setReason(''); setEditor('cancel'); }} /> : null}
        <Action label="Refresh invoice" disabled={loading || busy} onPress={() => setRefresh(v => v + 1)} />
      </View>
      {invoice.cancelled_at ? <Text className="text-sm leading-5 text-text-secondary">Cancelled: {invoice.cancel_reason}</Text> : null}
      <Text className="text-xs leading-5 text-text-secondary">Prepared {invoice.created_at.slice(0, 10)} by {invoice.created_by_name}. Unmatched branch receipts are not counted as invoice payments.</Text>
      {pane}
      {desktop ? <View className="flex-row gap-3 bg-surface-tint px-3 py-2"><Text className="w-[34%] text-xs font-semibold text-text-secondary">Finished goods</Text><Text className="flex-1 text-xs font-semibold text-text-secondary">Delivery date</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Quantity</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Rate</Text><Text className="flex-1 text-right text-xs font-semibold text-text-secondary">Amount</Text></View> : null}
    </> : null}
    {message ? <Text accessibilityRole="alert" className="text-sm leading-5" style={{ color: semantic.success }}>{message}</Text> : null}
    {error && !editor ? <><Notice text={error} /><Action label="Retry loading" disabled={loading || busy} onPress={() => { setSelected(new Map()); setRefresh(v => v + 1); }} /></> : null}
    {loading ? <ActivityIndicator accessibilityLabel="Loading invoices" color={colors.primary} /> : null}
  </View>;
  return <KeyboardAvoider><KScreen scroll={false} footer={filter.candidates && !detailId ? <View className="flex-row flex-wrap items-center justify-between gap-2" style={{ paddingBottom: Math.max(0, insets.bottom - 12) }}><View><Text className="text-xs text-text-secondary">{selected.size} deliveries selected</Text><Text className="text-lg font-bold text-text-primary" style={tabular}>{invoiceMoney(total)}</Text></View><Action label={busy ? 'Creating…' : 'Create invoice'} primary disabled={loading || busy || !selected.size} onPress={() => void create()} /></View> : undefined}>
    <View className="mx-auto w-full max-w-[1120px] flex-1 px-4">
      <FlatList<Row> data={loading || error ? [] : rows} keyExtractor={r => r.kind + r.value.id} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        ListEmptyComponent={!loading && !error ? !detailId && !filter.candidates ? <View className="items-start gap-2 py-5">
          <Text className="text-sm font-semibold leading-5 text-text-primary">No saved invoices for this period.</Text>
          <Text className="text-sm leading-5 text-text-secondary">Choose a branch and select its finished-goods deliveries to create an invoice.</Text>
          <Action label="Select deliveries" primary disabled={busy} onPress={() => resetFilter({ candidates: true })} />
        </View> : <Text className="py-5 text-sm leading-5 text-text-secondary">{detailId ? 'Invoice unavailable.' : filter.partyId ? 'No uninvoiced finished-goods deliveries for this period. Try another date range.' : 'Choose a branch to load its deliveries.'}</Text> : null}
        ListFooterComponent={!detailId && data && data.total_rows > 50 ? <View className="mt-3 flex-row flex-wrap items-center justify-between gap-2"><Action label="Previous page" disabled={loading || busy || filter.page === 0} onPress={() => setFilter(f => ({ ...f, page: f.page - 1 }))} /><Text className="text-xs text-text-secondary">Page {filter.page + 1} of {Math.ceil(data.total_rows / 50)}</Text><Action label="Next page" disabled={loading || busy || (filter.page + 1) * 50 >= data.total_rows} onPress={() => setFilter(f => ({ ...f, page: f.page + 1 }))} /></View> : null}
        renderItem={({ item }) => item.kind === 'invoice' ? <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + invoiceNumber(item.value.number)} disabled={busy} onPress={() => { setMessage(null); setDetailId(item.value.id); }}
          className="min-h-16 flex-row items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2 hover:bg-accent-soft active:bg-accent-soft focus:border-primary">
          <View className="min-w-0 flex-1"><Text className="text-sm font-bold leading-5 text-text-primary">{invoiceNumber(item.value.number)} · {item.value.party_name}</Text><Text className="text-xs leading-5 text-text-secondary">{kitchenRangeLabel({ startDate: item.value.start_date, endDate: item.value.end_date })}</Text></View>
          <View className="items-end"><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.total_paise)}</Text><Status invoice={item.value} /></View>
        </Pressable> : item.kind === 'delivery' ? <Pressable accessibilityRole="checkbox" accessibilityLabel={'Select delivery ' + item.value.entry_date + ' ' + invoiceMoney(item.value.amount_paise)} aria-checked={selected.has(item.value.id)} accessibilityState={{ checked: selected.has(item.value.id), disabled: busy || (!selected.has(item.value.id) && selected.size >= 100) }} disabled={busy || (!selected.has(item.value.id) && selected.size >= 100)} onPress={() => toggle(item.value)}
          className={'min-h-16 flex-row items-start gap-3 border-b border-border-soft px-3 py-3 hover:bg-accent-soft active:bg-accent-soft focus:border-primary ' + (selected.has(item.value.id) ? 'bg-surface-tint' : 'bg-surface-elevated')}>
          {selected.has(item.value.id) ? <Check size={18} color={colors.primary} /> : <Square size={18} color={colors.textSecondary} />}
          <View className="min-w-0 flex-1"><View className="flex-row justify-between gap-2"><Text className="text-sm font-bold text-text-primary">{item.value.entry_date}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.amount_paise)}</Text></View>
            <Text className="text-xs leading-5 text-text-secondary">{item.value.lines.map(l => l.item_name + ' · ' + formatQty(l.qty, l.unit) + ' × ' + invoiceMoney(l.price_paise)).join('\n')}</Text></View>
        </Pressable> : <View className="border-b border-border-soft bg-surface-elevated px-3 py-2">
          {desktop ? <View className="min-h-11 flex-row items-center gap-3"><Text className="w-[34%] text-sm font-semibold text-text-primary">{item.value.item_name}</Text><Text className="flex-1 text-xs text-text-secondary">{item.date}</Text><Text className="flex-1 text-right text-sm text-text-secondary">{formatQty(item.value.qty, item.value.unit)}</Text><Text className="flex-1 text-right text-sm text-text-secondary" style={tabular}>{invoiceMoney(item.value.price_paise)}</Text><Text className="flex-1 text-right text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View>
            : <><View className="flex-row justify-between gap-3"><Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text-primary">{item.value.item_name}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{invoiceMoney(item.value.line_paise)}</Text></View><Text className="text-xs leading-5 text-text-secondary">{item.date} · {formatQty(item.value.qty, item.value.unit)} × {invoiceMoney(item.value.price_paise)}</Text></>}
        </View>} />
    </View>
  </KScreen></KeyboardAvoider>;
}
