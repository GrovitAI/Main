import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  Clock,
  CreditCard,
  Percent,
  PieChart,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Wallet,
} from 'lucide-react-native';

import { colors, semantic } from '@/lib/pos/brand';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { computeProfitAndLoss, formatINR, formatPaymentMethod, formatPercent } from '@/lib/pos/finance-utils';
import { FinanceKpiCard } from './FinanceKpiCard';
import { DonutChart, HorizontalBars, RevenueExpenseBars, type DonutSegment } from './FinanceCharts';
import { FinanceEmptyView, FinanceErrorView, FinanceLoadingView, FinanceSectionCard, financeContentPadding } from './FinanceStateViews';

const PAYMENT_COLORS: Record<string, string> = {
  cash: colors.primary,
  upi: colors.primaryLight,
  card: colors.accent,
  pos: colors.accent,
  bank_transfer: colors.primaryDeep,
  other: colors.textSecondary,
};

type Props = { compact?: boolean };

export function FinanceOverviewTab({ compact = false }: Props) {
  const summary = useFinanceStore((s) => s.summary);
  const series = useFinanceStore((s) => s.series);
  const loading = useFinanceStore((s) => s.overviewLoading);
  const error = useFinanceStore((s) => s.overviewError);
  const degraded = useFinanceStore((s) => s.overviewDegraded);
  const loadOverview = useFinanceStore((s) => s.loadOverview);

  const pnl = useMemo(() => (summary ? computeProfitAndLoss(summary) : null), [summary]);

  const paymentSegments: DonutSegment[] = useMemo(
    () =>
      (summary?.paymentSplit ?? []).map((p) => ({
        key: p.payment_type,
        label: formatPaymentMethod(p.payment_type),
        value: p.total,
        color: PAYMENT_COLORS[p.payment_type] ?? colors.textSecondary,
      })),
    [summary],
  );

  if (loading && !summary) return <FinanceLoadingView />;

  const isEmpty =
    summary !== null &&
    summary.collectedRevenue === 0 &&
    summary.expensesTotal === 0 &&
    summary.purchasesTotal === 0 &&
    summary.pendingCollections === 0;

  const netTone = pnl && pnl.netCashFlow < 0 ? 'negative' : 'positive';

  return (
    <ScrollView className="flex-1" contentContainerStyle={financeContentPadding(compact)} showsVerticalScrollIndicator={false}>
      {error ? <FinanceErrorView message={error} onRetry={loadOverview} /> : null}
      {loading && summary ? <FinanceLoadingView inline label="Refreshing…" /> : null}

      {summary && pnl ? (
        <>
          {/* KPI grid */}
          <View className="mb-4 flex-row flex-wrap gap-3">
            <FinanceKpiCard
              label="Collected revenue"
              value={formatINR(summary.collectedRevenue, { compact })}
              hint={`${summary.billCount} settled bills`}
              icon={Wallet}
              tone="primary"
              compact={compact}
            />
            <FinanceKpiCard
              label="Expenses"
              value={formatINR(summary.expensesTotal, { compact })}
              hint={`${summary.expensesCount} entries`}
              icon={Receipt}
              tone="negative"
              compact={compact}
            />
            <FinanceKpiCard
              label="Net cash flow"
              value={formatINR(pnl.netCashFlow, { compact, signed: true })}
              hint={`Margin ${formatPercent(pnl.margin)}`}
              icon={BarChart3}
              tone={netTone}
              compact={compact}
            />
            <FinanceKpiCard
              label="Pending collections"
              value={formatINR(summary.pendingCollections, { compact })}
              hint="Unpaid bills"
              icon={Clock}
              tone="warning"
              compact={compact}
            />
            <FinanceKpiCard
              label="Purchases"
              value={formatINR(summary.purchasesTotal, { compact })}
              hint={`${summary.purchasesCount} supplier invoices`}
              icon={ShoppingBag}
              compact={compact}
            />
            <FinanceKpiCard
              label="Tax collected"
              value={formatINR(summary.taxCollected, { compact })}
              hint="GST on settled bills"
              icon={Percent}
              compact={compact}
            />
            <FinanceKpiCard
              label="Discounts"
              value={formatINR(summary.discountsGiven, { compact })}
              hint={`Comp. value ${formatINR(summary.complimentaryValue, { compact: true })}`}
              icon={CreditCard}
              compact={compact}
            />
            <FinanceKpiCard
              label="Refunds"
              value={formatINR(summary.refundsTotal, { compact })}
              hint={`${summary.refundsCount} refunds`}
              icon={RotateCcw}
              compact={compact}
            />
          </View>

          {isEmpty ? (
            <View className="mb-4">
              <FinanceEmptyView
                title="No money movement in this range"
                subtitle="Settled bills, expenses and purchases will appear here as soon as they are recorded."
              />
            </View>
          ) : null}

          {/* Profit & loss + chart */}
          <View className={compact ? 'mb-4' : 'mb-4 flex-row gap-4'}>
            <FinanceSectionCard
              title="Profit & loss"
              subtitle="Cash basis for the selected range"
              icon={<Banknote size={16} color={colors.primary} />}
              className={compact ? 'mb-4' : 'w-[340px]'}
            >
              <PnlRow label="Collected revenue" value={pnl.collectedRevenue} />
              <PnlRow label="Refunds" value={-pnl.refundsTotal} muted />
              <PnlRow label="Net revenue" value={pnl.netRevenue} strong />
              <PnlRow label="Expenses" value={-pnl.expensesTotal} muted />
              <PnlRow label="Purchases" value={-pnl.purchasesTotal} muted />
              <View className="my-2 h-px bg-border-soft" />
              <PnlRow label="Net cash flow" value={pnl.netCashFlow} strong tone={netTone} />
              <Text className="mt-2 text-[11px] text-text-secondary">
                Margin {formatPercent(pnl.margin)} of net revenue. Purchases come from inventory supplier invoices.
              </Text>
            </FinanceSectionCard>

            <FinanceSectionCard
              title="Revenue vs expenses"
              subtitle="Per business day"
              icon={<BarChart3 size={16} color={colors.primary} />}
              className="flex-1"
            >
              <RevenueExpenseBars data={series} height={compact ? 190 : 230} />
            </FinanceSectionCard>
          </View>

          {/* Payment split + categories */}
          <View className={compact ? 'mb-4' : 'mb-4 flex-row gap-4'}>
            <FinanceSectionCard
              title="Payment split"
              subtitle="How revenue was collected"
              icon={<PieChart size={16} color={colors.primary} />}
              className={compact ? 'mb-4' : 'flex-1'}
            >
              {paymentSegments.length === 0 ? (
                <Text className="py-8 text-center text-xs text-text-secondary">No payments in range</Text>
              ) : (
                <View className={compact ? 'items-center' : 'flex-row items-center'}>
                  <DonutChart segments={paymentSegments} size={compact ? 140 : 150} />
                  <View className={compact ? 'mt-3 w-full' : 'ml-5 flex-1'}>
                    {paymentSegments.map((seg) => {
                      const pct = summary.collectedRevenue > 0 ? seg.value / summary.collectedRevenue : 0;
                      return (
                        <View key={seg.key} className="mb-2 flex-row items-center justify-between">
                          <View className="flex-row items-center">
                            <View className="mr-2 h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
                            <Text className="text-xs font-bold text-text-primary">{seg.label}</Text>
                          </View>
                          <Text className="text-xs font-semibold text-text-secondary">
                            {formatPercent(pct, 0)} · {formatINR(seg.value)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </FinanceSectionCard>

            <FinanceSectionCard
              title="Expenses by category"
              subtitle={`${summary.expensesCount} entries · ${formatINR(summary.expensesTotal)}`}
              icon={<Receipt size={16} color={semantic.danger} />}
              className="flex-1"
            >
              {summary.expensesByCategory.length === 0 ? (
                <Text className="py-8 text-center text-xs text-text-secondary">No expenses recorded in range</Text>
              ) : (
                <HorizontalBars
                  items={summary.expensesByCategory.map((c) => ({
                    key: c.category,
                    label: c.category,
                    value: c.total,
                    hint: `${c.count} ${c.count === 1 ? 'entry' : 'entries'}`,
                  }))}
                  color={semantic.danger}
                />
              )}
            </FinanceSectionCard>
          </View>

          {/* Cash position */}
          <FinanceSectionCard
            title="Cash position"
            subtitle="Physical cash movement in range"
            icon={<Banknote size={16} color={colors.primary} />}
            className="mb-4"
          >
            <View className="flex-row flex-wrap gap-3">
              <FinanceKpiCard label="Cash in" value={formatINR(summary.cashIn, { compact })} hint="Cash settlements" icon={ArrowDownToLine} tone="positive" compact />
              <FinanceKpiCard label="Cash out" value={formatINR(summary.cashOut, { compact })} hint="Cash expenses & refunds" icon={ArrowUpFromLine} tone="negative" compact />
              <FinanceKpiCard
                label="Net cash"
                value={formatINR(summary.cashIn - summary.cashOut, { compact, signed: true })}
                hint="Before opening float"
                icon={Wallet}
                tone={summary.cashIn - summary.cashOut < 0 ? 'negative' : 'primary'}
                compact
              />
            </View>
          </FinanceSectionCard>

          {degraded ? (
            <Text className="mb-2 text-center text-[11px] text-text-secondary">
              Totals computed on this device from base tables. Apply the finance migration for server-side aggregation.
            </Text>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

type PnlRowProps = { label: string; value: number; strong?: boolean; muted?: boolean; tone?: 'positive' | 'negative' };

function PnlRow({ label, value, strong = false, muted = false, tone }: PnlRowProps) {
  const color = tone === 'negative' ? semantic.danger : tone === 'positive' ? semantic.success : muted ? colors.textSecondary : colors.textPrimary;
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className={`text-xs ${strong ? 'font-bold text-text-primary' : 'font-medium text-text-secondary'}`}>{label}</Text>
      <Text className={`text-xs ${strong ? 'font-extrabold' : 'font-semibold'}`} style={{ color }}>
        {formatINR(value, { signed: muted })}
      </Text>
    </View>
  );
}
