import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { fetchKitchenStockEntries } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { kitchenMonthRange, kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { formatMoney, formatQty, lastCostByItem, stockMovements, stockUnitValue, type StockMovement } from '@/lib/pos/kitchen-utils';
import type { KitchenEntry, KitchenItem } from '@/lib/pos/kitchen-types';
import { Empty, KHeader, KScreen, Notice, Segmented, useDesktopDensity } from '@/components/kitchen/ui';
import { ReportDateRange } from '@/components/kitchen/ReportDateRange';

type Kind = KitchenItem['item_kind'];
const tabular = { fontVariant: ['tabular-nums' as const] };

/**
 * Task 300: opening and closing stock over a month or any dates, and what each is worth: raw
 * materials at the last price paid, finished goods at rate + packing. Worked out from the stock
 * entries, so a month closes on the figure the next one opens with.
 */
export default function StockReportScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const data = useKitchenData();
  const { showAmounts } = useKitchenAccess();
  const desktop = useDesktopDensity();
  const [kind, setKind] = useState<Kind>(params.kind === 'finished_good' ? 'finished_good' : 'raw_material');
  const [range, setRange] = useState(() => kitchenMonthRange(kitchenToday().slice(0, 7), kitchenToday()));
  const [entries, setEntries] = useState<KitchenEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setEntries(null);
    setError(null);
    void fetchKitchenStockEntries(range.startDate).then((res) => {
      if (!current) return;
      setEntries(res.data ?? []);
      setError(res.error);
    });
    return () => { current = false; };
  }, [range.startDate, data.loadedAt]);

  const moves = useMemo(() => (entries && !error ? stockMovements(entries, data.items, range.startDate, range.endDate) : null), [entries, error, data.items, range]);
  const lastCost = useMemo(() => lastCostByItem(data.entries), [data.entries]);
  const rows = useMemo(() => data.items.filter((i) => i.is_active && i.item_kind === kind).sort((a, b) => a.name.localeCompare(b.name)), [data.items, kind]);
  const totals = useMemo(() => {
    let opening = 0;
    let closing = 0;
    let unpriced = 0;
    for (const it of rows) {
      const m = moves?.get(it.id);
      const unit = stockUnitValue(it, lastCost);
      if (!m) continue;
      if (unit === null) { if (m.closing !== 0 || m.opening !== 0) unpriced += 1; continue; }
      opening += Math.max(0, m.opening) * unit;
      closing += Math.max(0, m.closing) * unit;
    }
    return { opening, closing, unpriced };
  }, [rows, moves, lastCost]);

  return (
    <KScreen wide>
      <KHeader title="Opening & closing" subtitle={showAmounts ? 'Stock and its value' : 'Stock over these dates'} onBack={() => backToKitchen()} />
      <View className={desktop ? 'mb-3 flex-row items-center gap-3' : 'mb-3 gap-2'}>
        <View className={desktop ? 'w-[320px]' : undefined}><Segmented options={[{ value: 'raw_material', label: 'Raw materials' }, { value: 'finished_good', label: 'Finished goods' }]} value={kind} onChange={setKind} /></View>
        <View className={desktop ? 'w-[300px]' : undefined}><ReportDateRange outlined label="Stock report dates" value={range} onChange={setRange} /></View>
      </View>
      {error ? <Notice text={error} /> : null}
      {!moves && !error ? <ActivityIndicator accessibilityLabel="Loading stock report" color={colors.primary} className="my-6" /> : null}
      {moves ? (
        <>
          {showAmounts ? (
            <View className="mb-3 flex-row" style={{ gap: 8 }}>
              <Worth label="Opening value" value={formatMoney(totals.opening)} />
              <Worth label="Closing value" value={formatMoney(totals.closing)} />
            </View>
          ) : null}
          {showAmounts && totals.unpriced > 0 ? <Text className="mb-3 px-1 text-xs font-semibold text-text-secondary">{totals.unpriced} {totals.unpriced === 1 ? 'item has' : 'items have'} no price yet, so {totals.unpriced === 1 ? 'it is' : 'they are'} left out of the value.</Text> : null}
          {rows.length === 0 ? <Empty title="No items yet" /> : (
            <View className="overflow-hidden rounded-[18px] border border-border-soft bg-surface-elevated">
              {desktop ? <HeaderRow showValue={showAmounts} /> : null}
              {rows.map((it, i) => {
                const m = moves.get(it.id);
                if (!m) return null;
                const unit = stockUnitValue(it, lastCost);
                const value = showAmounts ? (unit === null ? '—' : formatMoney(Math.max(0, m.closing) * unit)) : null;
                return desktop ? <DesktopRow key={it.id} it={it} m={m} value={value} /> : <PhoneRow key={it.id} it={it} m={m} value={value} first={i === 0} />;
              })}
            </View>
          )}
        </>
      ) : null}
    </KScreen>
  );
}

function Worth({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl border border-border-soft bg-surface-elevated px-3.5 py-2.5">
      <Text className="text-xs font-bold text-text-secondary">{label}</Text>
      <Text className="text-xl font-extrabold text-text-primary" style={tabular} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const signed = (n: number, unit: string): string => (n === 0 ? '—' : `${n > 0 ? '+' : '−'}${formatQty(Math.abs(n), unit)}`);
const COLUMN = 'w-[92px] text-right';

function HeaderRow({ showValue }: { showValue: boolean }) {
  const head = (t: string) => <Text className={`${COLUMN} text-xs font-bold text-text-secondary`}>{t}</Text>;
  return (
    <View className="flex-row items-center gap-2 border-b border-border-soft px-3.5 py-2">
      <Text className="min-w-0 flex-1 text-xs font-bold text-text-secondary">Item</Text>
      {head('Opening')}{head('In')}{head('Out')}{head('Counted')}{head('Closing')}{showValue ? head('Value') : null}
    </View>
  );
}

function DesktopRow({ it, m, value }: { it: KitchenItem; m: StockMovement; value: string | null }) {
  const cell = (t: string, strong = false) => <Text className={`${COLUMN} text-[13px] ${strong ? 'font-bold text-text-primary' : 'font-semibold text-text-secondary'}`} style={tabular} numberOfLines={1}>{t}</Text>;
  return (
    <View className="min-h-[44px] flex-row items-center gap-2 border-b border-border-soft px-3.5 py-2">
      <Text className="min-w-0 flex-1 text-sm font-bold text-text-primary" numberOfLines={1}>{it.name}</Text>
      {cell(formatQty(m.opening, it.unit), true)}{cell(m.in ? `+${formatQty(m.in, it.unit)}` : '—')}{cell(m.out ? `−${formatQty(m.out, it.unit)}` : '—')}{cell(signed(m.counted, it.unit))}{cell(formatQty(m.closing, it.unit), true)}{value !== null ? cell(value, true) : null}
    </View>
  );
}

function PhoneRow({ it, m, value, first }: { it: KitchenItem; m: StockMovement; value: string | null; first: boolean }) {
  const parts = [m.in ? `In ${formatQty(m.in, it.unit)}` : '', m.out ? `Out ${formatQty(m.out, it.unit)}` : '', m.counted ? `Counted ${signed(m.counted, it.unit)}` : ''].filter(Boolean).join(' · ');
  return (
    <View className={`px-3.5 py-2.5 ${first ? '' : 'border-t border-border-soft'}`}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-[15px] font-bold text-text-primary" numberOfLines={1}>{it.name}</Text>
        {value !== null ? <Text className="text-[15px] font-bold text-text-primary" style={tabular}>{value}</Text> : null}
      </View>
      <Text className="mt-0.5 text-[13px] font-bold text-text-primary" style={tabular}>{formatQty(m.opening, it.unit)} → {formatQty(m.closing, it.unit)}</Text>
      {parts ? <Text className="mt-0.5 text-xs font-semibold text-text-secondary" style={tabular}>{parts}</Text> : null}
    </View>
  );
}
