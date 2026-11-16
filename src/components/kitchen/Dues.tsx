/**
 * Tasks 316-317: what is still open with a branch or vendor, shown three ways. A tag on each bill
 * (cleared, part left, open); a strip of how old the open amounts are, each part a filter; and a
 * preview of which bills an amount being paid will clear, oldest first.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { formatMoney, formatDayLabel, typeLabel } from '@/lib/pos/kitchen-utils';
import { dueState, fifoClear } from '@/lib/pos/kitchen-dues-utils';
import { fetchKitchenDues } from '@/lib/pos/kitchen-dues-service';
import type { KitchenAgeBucket, KitchenAgeing, KitchenDue } from '@/lib/pos/kitchen-dues-types';
import { toneColor, toneSoft, type Tone } from './ui';

/** A bill's state as a small tag: Cleared, ₹x left, or Open. */
export function DueTag({ due, showAmounts = true }: { due: Pick<KitchenDue, 'amount' | 'open'>; showAmounts?: boolean }) {
  const state = dueState(due);
  // Open is the usual state of a recent bill, so it stays quiet; age is what the strip colours.
  const tone: Tone = state.kind === 'cleared' ? 'in' : state.kind === 'part' ? 'buy' : 'neutral';
  const label = state.kind === 'cleared' ? 'Cleared' : state.kind === 'part' ? (showAmounts ? `${formatMoney(state.left)} left` : 'Part paid') : 'Open';
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: toneSoft[tone] }}>
      <Text style={{ color: toneColor[tone], fontSize: 11, fontWeight: '800' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const BUCKETS: readonly { key: KitchenAgeBucket; label: string }[] = [
  { key: 'upTo30', label: 'Up to 30 days' },
  { key: 'upTo60', label: '31–60 days' },
  { key: 'over60', label: 'Over 60 days' },
];

/**
 * How old the open amounts are, in three equal parts. Tapping a part shows only the bills in it;
 * tapping it again shows them all. A part with nothing open in it cannot be chosen.
 */
export function AgeingStrip({ ageing, value, onChange, showAmounts = true }: { ageing: KitchenAgeing; value: KitchenAgeBucket | null; onChange: (next: KitchenAgeBucket | null) => void; showAmounts?: boolean }) {
  return (
    <View className="flex-row overflow-hidden rounded-2xl border border-border-soft" accessibilityRole="tablist" accessibilityLabel="How old the open amounts are">
      {BUCKETS.map((b, i) => {
        const amount = ageing[b.key];
        const on = value === b.key;
        const empty = amount <= 0;
        const old = b.key === 'over60' && !empty;
        return (
          <Pressable key={b.key} onPress={() => onChange(on ? null : b.key)} disabled={empty && !on}
            accessibilityRole="tab" accessibilityLabel={`${b.label}: ${showAmounts ? formatMoney(amount) : ''}`} accessibilityState={{ selected: on, disabled: empty && !on }} aria-selected={on}
            className={`min-h-[56px] flex-1 justify-center px-2.5 py-2 ${i > 0 ? 'border-l border-border-soft' : ''} ${on ? 'bg-accent-soft' : empty ? '' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
            <Text className={`text-[11px] font-bold ${on ? 'text-primary' : 'text-text-secondary'}`} numberOfLines={1}>{b.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', marginTop: 1, fontVariant: ['tabular-nums'], color: empty ? colors.textSecondary : old ? toneColor.out : on ? colors.primary : colors.textPrimary }} numberOfLines={1}>
              {showAmounts ? formatMoney(amount) : '—'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Task 317: a branch's or vendor's open bills for a payment form; nothing is loaded without a party. */
export function usePartyDues(partyId: string | null): { dues: KitchenDue[] | null; loading: boolean } {
  const [state, setState] = useState<{ party: string; dues: KitchenDue[] | null } | null>(null);
  useEffect(() => {
    if (!partyId) return;
    let live = true;
    void fetchKitchenDues(partyId).then((res) => { if (live) setState({ party: partyId, dues: res.data }); });
    return () => { live = false; };
  }, [partyId]);
  const mine = partyId !== null && state?.party === partyId;
  return { dues: mine ? state.dues : null, loading: partyId !== null && !mine };
}

/**
 * Task 317: what this amount will clear, oldest bill first, under the amount of a payment. Bills
 * picked by hand are left to the picker; this shows the money that is not matched.
 */
export function FifoPreview({ dues, amount, kind, loading = false }: { dues: readonly KitchenDue[] | null; amount: number; kind: 'branch' | 'vendor'; loading?: boolean }) {
  if (amount <= 0) return null;
  if (dues === null) {
    return loading ? <Text className="mt-1.5 text-xs font-semibold text-text-secondary">Working out what this clears…</Text> : null;
  }
  // What is left over is said once, by the line under the amount.
  const { cleared } = fifoClear(dues, amount);
  if (cleared.length === 0) return null;
  const shown = cleared.slice(0, 3);
  return (
    <View className="mt-2 rounded-2xl bg-surface-tint px-3 py-2.5" accessibilityLabel="What this clears, oldest first">
      <Text className="text-[11px] font-bold uppercase text-text-secondary" style={{ letterSpacing: 0.4 }}>Clears, oldest first</Text>
      {shown.map(({ due, take, left }) => (
        <View key={due.entry_id ?? 'opening'} className="mt-1 flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-[13px] font-semibold text-text-primary" numberOfLines={1}>
            {due.entry_date === null ? 'Opening balance' : `${typeLabel(due.type === 'opening' ? 'carried' : due.type)} · ${formatDayLabel(due.entry_date)}`}
          </Text>
          <Text className="text-[13px] font-bold text-text-primary" style={{ fontVariant: ['tabular-nums'] }}>
            {left > 0 ? `${formatMoney(take)} of ${formatMoney(take + left)}` : formatMoney(take)}
          </Text>
        </View>
      ))}
      {cleared.length > shown.length ? <Text className="mt-1 text-xs font-semibold text-text-secondary">and {cleared.length - shown.length} more</Text> : null}
    </View>
  );
}
