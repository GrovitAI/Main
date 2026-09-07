import React, { useCallback, useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, Banknote, RotateCcw, Scale } from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import type { LedgerEntry } from '@/lib/pos/finance-types';
import { formatDateLong, formatINR, formatPaymentMethod, formatTime, summarizeLedger } from '@/lib/pos/finance-utils';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { FinanceKpiCard } from './FinanceKpiCard';
import { FinanceEmptyView, FinanceErrorView, FinanceLoadingView } from './FinanceStateViews';

type Props = { compact?: boolean };

type Row =
  | { type: 'header'; key: string; date: string; totalIn: number; totalOut: number }
  | { type: 'entry'; key: string; entry: LedgerEntry };

export function CashBookTab({ compact = false }: Props) {
  const ledger = useFinanceStore((s) => s.ledger);
  const loading = useFinanceStore((s) => s.ledgerLoading);
  const error = useFinanceStore((s) => s.ledgerError);
  const loadLedger = useFinanceStore((s) => s.loadLedger);

  const totals = useMemo(() => summarizeLedger(ledger), [ledger]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let currentDate = '';
    let dayIn = 0;
    let dayOut = 0;
    let headerIndex = -1;
    for (const entry of ledger) {
      if (entry.business_date !== currentDate) {
        if (headerIndex >= 0) {
          const h = out[headerIndex];
          if (h.type === 'header') out[headerIndex] = { ...h, totalIn: dayIn, totalOut: dayOut };
        }
        currentDate = entry.business_date;
        dayIn = 0;
        dayOut = 0;
        headerIndex = out.length;
        out.push({ type: 'header', key: `h:${currentDate}`, date: currentDate, totalIn: 0, totalOut: 0 });
      }
      if (entry.direction === 'in') dayIn += entry.amount;
      else dayOut += entry.amount;
      out.push({ type: 'entry', key: entry.id, entry });
    }
    if (headerIndex >= 0) {
      const h = out[headerIndex];
      if (h.type === 'header') out[headerIndex] = { ...h, totalIn: dayIn, totalOut: dayOut };
    }
    return out;
  }, [ledger]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === 'header') {
        return (
          <View className="mb-1 mt-4 flex-row items-center justify-between rounded-xl bg-surface-tint px-3 py-2">
            <Text className="text-xs font-bold text-text-primary">{formatDateLong(item.date)}</Text>
            <Text className="text-[11px] font-semibold text-text-secondary">
              <Text style={{ color: semantic.success }}>{formatINR(item.totalIn, { signed: true })}</Text>
              {'  '}
              <Text style={{ color: semantic.danger }}>{formatINR(-item.totalOut)}</Text>
            </Text>
          </View>
        );
      }
      return <LedgerRow entry={item.entry} compact={compact} />;
    },
    [compact],
  );

  const header = (
    <View className="mb-2">
      <View className="flex-row flex-wrap gap-3">
        <FinanceKpiCard label="Money in" value={formatINR(totals.totalIn, { compact })} hint={`Cash ${formatINR(totals.cashIn, { compact: true })}`} icon={ArrowDownLeft} tone="positive" compact />
        <FinanceKpiCard label="Money out" value={formatINR(totals.totalOut, { compact })} hint={`Cash ${formatINR(totals.cashOut, { compact: true })}`} icon={ArrowUpRight} tone="negative" compact />
        <FinanceKpiCard label="Net" value={formatINR(totals.net, { compact, signed: true })} hint={`${totals.entryCount} entries`} icon={Scale} tone={totals.net < 0 ? 'negative' : 'primary'} compact />
      </View>
      {error ? <View className="mt-3"><FinanceErrorView message={error} onRetry={loadLedger} compact /></View> : null}
      {loading && ledger.length > 0 ? <FinanceLoadingView inline label="Updating…" /> : null}
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading ? (
          <FinanceLoadingView />
        ) : error ? null : (
          <View className="mt-4">
            <FinanceEmptyView title="No money movement in this range" subtitle="Settlements, expenses and refunds are listed here in the order they happened." />
          </View>
        )
      }
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

function LedgerRow({ entry, compact }: { entry: LedgerEntry; compact: boolean }) {
  const isIn = entry.direction === 'in';
  const tone = isIn ? semantic.success : semantic.danger;
  const toneSoft = isIn ? semantic.successSoft : semantic.dangerSoft;
  const Icon = entry.kind === 'refund' ? RotateCcw : entry.kind === 'expense' ? ArrowUpRight : ArrowDownLeft;

  return (
    <View className="flex-row items-center border-b border-border/40 px-2 py-2.5">
      <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: toneSoft }}>
        <Icon size={16} color={tone} />
      </View>
      <View className="flex-1 px-3">
        <Text className="text-xs font-bold text-text-primary" numberOfLines={1}>{entry.title}</Text>
        <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
          {[formatTime(entry.occurred_at), entry.subtitle, entry.reference].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {!compact ? (
        <View className="mr-3 flex-row items-center rounded-full bg-surface-tint px-2 py-1">
          <Banknote size={11} color={colors.textSecondary} />
          <Text className="ml-1 text-[10px] font-bold text-text-secondary">{formatPaymentMethod(entry.payment_method)}</Text>
        </View>
      ) : null}
      <View className="items-end">
        <Text className="text-sm font-extrabold" style={{ color: tone }}>
          {formatINR(isIn ? entry.amount : -entry.amount, { signed: true })}
        </Text>
        {compact ? <Text className="text-[10px] font-semibold text-text-secondary">{formatPaymentMethod(entry.payment_method)}</Text> : null}
      </View>
    </View>
  );
}
