import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Minus } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { chart, colors, semantic } from '@/lib/pos/brand';
import { confirmAction } from '@/lib/pos/dialogs';
import { formatMoney } from '@/lib/pos/kitchen-utils';
import { historyDateLabel } from '@/lib/pos/kitchen-history-utils';
import { kitchenMonthLabel, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { fetchDrawings, voidDrawing, type DrawingKind, type DrawingRow, type DrawingsSummary } from '@/lib/pos/kitchen-drawings-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { Avatar, Card, Empty, KHeader, KScreen, LinkButton, Notice, PrimaryButton, Segmented, SettingsGroup, SkeletonRows, ValueRow } from '@/components/kitchen/ui';

const SHARE_COLORS = [chart.series3, chart.series2, colors.primary, semantic.warning] as const;
const rupees = (paise: number) => formatMoney(paise / 100);
const tabular = { fontVariant: ['tabular-nums' as const] };
const openEntry = (kind: DrawingKind, owner: string | null) => router.push({ pathname: '/central-kitchen/drawing-entry', params: owner ? { kind, owner } : { kind } } as never);

/**
 * The owners' drawings (task 282, owner's design, round 2): what is in drawings in all and each
 * owner's share; an owner's page with what is left, what went in and what was spent this month,
 * and their spendings and money in. Money goes in from Cash or Bank, an owner spends only from
 * their own drawings, and money can be put back. Owners only, and they see each other's.
 */
export default function DrawingsScreen() {
  const access = useKitchenAccess();
  const { isTablet } = useResponsive();
  const phone = !isTablet;
  const [month, setMonth] = useState(kitchenToday().slice(0, 7));
  const [data, setData] = useState<DrawingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'spend' | 'in'>('spend');

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetchDrawings(month);
    setLoading(false);
    setError(d.error);
    if (d.data) setData(d.data);
  }, [month]);
  // Loads when the month changes; coming back to the page refreshes, but only after the first load.
  const shownOnce = useRef(false);
  useEffect(() => { if (access.isOwner) void load(); }, [load, access.isOwner]);
  useFocusEffect(useCallback(() => {
    if (shownOnce.current && access.isOwner) void load();
    shownOnce.current = true;
  }, [access.isOwner, load]));

  const owners = data?.owners ?? [];
  const total = owners.reduce((a, o) => a + o.left_paise, 0);
  // A laptop shows one owner beside the list: the one picked, or the first.
  const shownId = openId ?? (phone ? null : owners[0]?.id ?? null);
  const owner = owners.find((o) => o.id === shownId) ?? null;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.owner_id === shownId && (tab === 'spend' ? r.kind === 'spend' : r.kind !== 'spend')), [data, shownId, tab]);
  const monthName = kitchenMonthLabel(month).split(' ')[0] ?? '';

  if (!access.isOwner) {
    return <KScreen><KHeader title="Drawings" onBack={() => router.back()} /><Card><Empty title="Only the owners can see drawings" /></Card></KScreen>;
  }

  const monthSwitch = (
    <View className="mt-1 flex-row items-center justify-between">
      <Pressable onPress={() => setMonth(shiftKitchenMonth(month, -1))} accessibilityRole="button" accessibilityLabel="Previous month" className="h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-tint active:bg-surface-tint">
        <ChevronLeft size={20} color={colors.primary} />
      </Pressable>
      <Text className="text-[15px] font-bold text-text-primary">{kitchenMonthLabel(month)}</Text>
      <Pressable onPress={() => setMonth(shiftKitchenMonth(month, 1))} disabled={month >= kitchenToday().slice(0, 7)} accessibilityRole="button" accessibilityLabel="Next month"
        className="h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-tint active:bg-surface-tint" style={{ opacity: month >= kitchenToday().slice(0, 7) ? 0.3 : 1 }}>
        <ChevronRight size={20} color={colors.primary} />
      </Pressable>
    </View>
  );

  const overview = (
    <View>
      <Card style={{ marginTop: 6 }}>
        <Text className="text-[13px] font-semibold text-text-secondary">In drawings</Text>
        <Text className="text-[30px] font-extrabold text-text-primary" style={{ letterSpacing: -0.6, ...tabular }}>{rupees(total)}</Text>
        {total > 0 ? (
          <View className="mt-2.5 flex-row overflow-hidden rounded" style={{ height: 8, gap: 2 }}>
            {owners.filter((o) => o.left_paise > 0).map((o) => <View key={o.id} style={{ flex: o.left_paise, backgroundColor: SHARE_COLORS[owners.indexOf(o) % SHARE_COLORS.length] }} />)}
          </View>
        ) : null}
      </Card>
      {monthSwitch}
      <SettingsGroup>
        {owners.map((o, i) => (
          <ValueRow key={o.id} label={o.name} sub={`Spent ${rupees(o.spent_paise)} in ${monthName}`} value={`${rupees(o.left_paise)} left`} action="open"
            lead={<View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: SHARE_COLORS[i % SHARE_COLORS.length] }} />}
            onPress={() => { setOpenId(o.id); setTab('spend'); }} />
        ))}
      </SettingsGroup>
      {owners.length === 0 && !loading ? <Card><Empty title="No owners on the team" /></Card> : null}
      <View className="items-start"><LinkButton label="Add money from Cash or Bank" onPress={() => openEntry('in', null)} /></View>
    </View>
  );

  const ownerPage = owner ? (
    <View>
      <Card style={{ marginTop: 6 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[13px] font-semibold text-text-secondary">Left</Text>
            <Text className="text-[30px] font-extrabold text-text-primary" style={{ letterSpacing: -0.6, ...tabular }}>{rupees(owner.left_paise)}</Text>
          </View>
          <Avatar name={owner.name} size={44} ring={false} />
        </View>
        <View className="mt-2.5 overflow-hidden rounded-[14px] border border-border-soft">
          <View className="flex-row justify-between px-3 py-2.5"><Text className="text-sm font-bold text-text-primary">Money in · {monthName}</Text><Text className="text-sm font-bold text-text-primary" style={tabular}>{rupees(owner.in_paise)}</Text></View>
          <View className="flex-row justify-between border-t border-border-soft px-3 py-2.5"><Text className="text-sm font-bold text-text-primary">Spent · {monthName}</Text><Text className="text-sm font-bold" style={{ color: semantic.danger, ...tabular }}>−{rupees(owner.spent_paise)}</Text></View>
        </View>
      </Card>
      {/* A laptop has the month above the owners already. */}
      {phone ? monthSwitch : <View style={{ height: 12 }} />}
      <Segmented options={[{ value: 'spend', label: 'Spendings' }, { value: 'in', label: 'Money in' }]} value={tab} onChange={setTab} />
      {loading && !data ? <SkeletonRows count={3} label="Loading drawings" /> : rows.length === 0 ? (
        <Text className="mt-3 px-1 text-[13px] font-semibold text-text-secondary">{tab === 'spend' ? `Nothing spent in ${monthName}.` : `No money in ${monthName}.`}</Text>
      ) : (
        <View className="mt-3"><SettingsGroup>{rows.map((r) => <DrawingRowView key={r.id} row={r} onVoid={() => confirmVoid(r)} />)}</SettingsGroup></View>
      )}
      <View className="mt-1 flex-row flex-wrap items-center" style={{ columnGap: 14 }}>
        <LinkButton label="Add money" onPress={() => openEntry('in', owner.id)} />
        {owner.left_paise > 0 ? <LinkButton label="Put back" onPress={() => openEntry('back', owner.id)} /> : null}
      </View>
    </View>
  ) : null;

  function confirmVoid(r: DrawingRow): void {
    confirmAction('Remove this entry?', `${rupees(r.amount_paise)} · ${historyDateLabel(r.draw_date)}`, 'Remove', () => {
      void voidDrawing(r.id).then((res) => {
        if (res.error) { setError(res.error); return; }
        useKitchenStore.getState().setNotice('Removed');
        void load();
      });
    });
  }

  const spendButton = owner && owner.left_paise > 0
    ? <PrimaryButton label="Spend" icon={Minus} onPress={() => openEntry('spend', owner.id)} />
    : undefined;


  if (phone) {
    return (
      <KeyboardAvoider>
        <KScreen footer={owner ? spendButton : undefined} refreshing={loading && !!data} onRefresh={() => void load()}>
          <KHeader title={owner ? owner.name : 'Drawings'} subtitle={owner ? 'Drawings' : 'Owners only'} onBack={() => (owner ? setOpenId(null) : router.back())} />
          {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
          {loading && !data ? <SkeletonRows count={3} label="Loading drawings" /> : owner ? ownerPage : overview}
        </KScreen>
              </KeyboardAvoider>
    );
  }
  return (
    <KeyboardAvoider>
      <KScreen wide refreshing={loading && !!data} onRefresh={() => void load()}>
        <KHeader title="Drawings" subtitle="Owners only" onBack={() => router.back()} />
        {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
        {loading && !data ? <SkeletonRows count={3} label="Loading drawings" /> : (
          <View className="flex-row" style={{ gap: 22 }}>
            <View style={{ width: 340 }}>{overview}</View>
            <View className="min-w-0 flex-1">
              {owner ? (
                <>
                  <View className="flex-row items-center justify-between" style={{ minHeight: 44 }}>
                    <Text className="text-xl font-bold text-text-primary">{owner.name}</Text>
                    {spendButton ? <View style={{ width: 160 }}>{spendButton}</View> : null}
                  </View>
                  {ownerPage}
                </>
              ) : null}
            </View>
          </View>
        )}
      </KScreen>
          </KeyboardAvoider>
  );
}

function DrawingRowView({ row, onVoid }: { row: DrawingRow; onVoid: () => void }) {
  const title = row.kind === 'spend' ? row.category ?? 'Spent' : row.kind === 'in' ? `From ${row.account === 'bank' ? 'the bank' : 'cash'}` : `Put back to ${row.account === 'bank' ? 'the bank' : 'cash'}`;
  const sub = [historyDateLabel(row.draw_date), row.note].filter(Boolean).join(' · ');
  const out = row.kind !== 'in';
  return (
    <ValueRow label={title} sub={sub} value={`${out ? '−' : ''}${rupees(row.amount_paise)}`} action="none" onPress={onVoid} />
  );
}
