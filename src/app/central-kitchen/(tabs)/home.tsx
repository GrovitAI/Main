import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router, useFocusEffect } from 'expo-router';
import { LogOut, Plus, ArrowLeft, ShieldCheck, Lock, History, ChevronRight } from 'lucide-react-native';
import { chart, colors, semantic } from '@/lib/pos/brand';
import { hoverFace, hoverFaceMark } from '@/lib/pos/web-hover';
import { recordActions } from '@/components/kitchen/record-actions';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { dayText } from '@/lib/pos/kitchen-access-utils';
import { fetchKitchenMoney, type MoneySummary } from '@/lib/pos/kitchen-money-service';
import { formatLongDate, formatMoney, localDateKey, monthKeyOf, monthTotals, newestFirst, sumDues } from '@/lib/pos/kitchen-utils';
import { ActionTile, Card, Divider, Empty, IconButton, KHeader, KScreen, LinkButton, Notice, Row, RowInset, Section, Skeleton, StatTile, useDesktopDensity } from '@/components/kitchen/ui';
import { EntryList } from '@/components/kitchen/EntryList';

/**
 * The kitchen's home: this month's money, who still owes whom, the four
 * things the kitchen records, and today's entries.
 */
export default function KitchenHome() {
  const data = useKitchenData();
  const access = useKitchenAccess();
  const mayMoney = access.can('money.view');
  const { isTablet } = useResponsive();
  const desktop = useDesktopDensity();
  const session = useSessionStore((s) => s.session);
  const today = localDateKey();
  const month = useMemo(() => monthTotals(data.entries, monthKeyOf(today)), [data.entries, today]);
  const owed = useMemo(() => sumDues(data.balances, 'branch'), [data.balances]);
  const owe = useMemo(() => sumDues(data.balances, 'vendor'), [data.balances]);
  const todays = useMemo(() => data.entries.filter((e) => e.entry_date === today && e.voided_at === null), [data.entries, today]);
  const recent = useMemo(() => newestFirst(data.entries.filter((e) => e.entry_date !== today && e.voided_at === null)).slice(0, 5), [data.entries, today]);
  const showRecent = todays.length === 0 && recent.length > 0;
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const isKitchenLogin = session?.role === 'kitchen';
  const branchName = kitchenBranch().name;
  const nothingSetUp = data.loaded && data.items.length === 0 && data.parties.length === 0;
  // Cash and bank come from the database (opening plus every entry since), so they refresh when Home
  // is shown and after each save changes the entries.
  const [money, setMoney] = useState<MoneySummary | null>(null);
  const loadMoney = useCallback((): (() => void) => {
    let live = true;
    if (!mayMoney) { setMoney(null); return () => { live = false; }; }
    void fetchKitchenMoney().then((r) => { if (live && r.data) setMoney(r.data); });
    return () => { live = false; };
  }, [mayMoney]);
  useFocusEffect(loadMoney);
  const seenEntries = useRef(data.entries);
  useEffect(() => {
    if (seenEntries.current === data.entries) return undefined;
    seenEntries.current = data.entries;
    return loadMoney();
  }, [data.entries, loadMoney]);

  // Task 222: two calm cards. What is owed and held comes first, each figure opening its page;
  // the month's totals follow. On a phone they sit below the four actions.
  const summary = !access.showAmounts ? null : (
    <View style={{ gap: 12 }}>
      <Card>
        <View className="flex-row">
          <StatTile label="Branches yet to pay" value={owed} tone={owed > 0 ? 'in' : 'neutral'} onPress={() => router.navigate('/central-kitchen/(tabs)/branches')} />
          <Divider vertical />
          <StatTile label="We owe vendors" value={owe} tone={owe > 0 ? 'out' : 'neutral'} onPress={() => router.navigate('/central-kitchen/(tabs)/vendors')} />
        </View>
        {money ? (
          <>
            <Divider />
            <View className="flex-row">
              <StatTile label="Cash in hand" value={money.cash_paise / 100} tone={money.cash_paise < 0 ? 'out' : 'neutral'} onPress={() => router.push('/central-kitchen/money')} />
              <Divider vertical />
              <StatTile label="Bank · UPI" value={money.bank_paise / 100} tone={money.bank_paise < 0 ? 'out' : 'neutral'} onPress={() => router.push('/central-kitchen/money')} />
            </View>
          </>
        ) : null}
      </Card>
      <Card>
        <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
          <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>This month</Text>
          <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }}>{monthName}</Text>
        </View>
        <View className="flex-row">
          <StatTile label="Money in" value={month.moneyIn} tone="in" />
          <Divider vertical />
          <StatTile label="Money out" value={month.moneyOut} tone="out" />
        </View>
        <Divider />
        <View className="flex-row">
          <StatTile label="Sent to branches" value={month.sent} />
          <Divider vertical />
          <StatTile label="Bought" value={month.bought} />
        </View>
      </Card>
    </View>
  );

  // The four things the kitchen records, each shown only to logins allowed to record it.
  const tiles = recordActions(access.can);
  const tileRows = [tiles.slice(0, 2), tiles.slice(2, 4)].filter((row) => row.length > 0);
  const actions = tiles.length === 0 ? null : (
    <View className={desktop ? 'flex-row gap-3' : undefined} style={desktop ? undefined : { gap: 10 }}>
      {tileRows.map((row) => (
        <View key={row[0]?.key} className={desktop ? 'flex-1 flex-row gap-3' : 'flex-row'} style={desktop ? undefined : { gap: 10 }}>
          {row.map((t) => <ActionTile key={t.key} icon={t.icon} label={t.label} caption={t.caption} tone={t.tone} onPress={() => router.push(t.href as never)} />)}
        </View>
      ))}
    </View>
  );
  // Task 228 (owner's pick, Home B): a phone shows the four actions as round buttons, one quiet
  // money card, the two who-owes tiles and today's entries. Tablets and desktops keep their layouts.
  const phone = !isTablet;
  const roundActions = tiles.length === 0 ? null : (
    <View className="flex-row" style={{ marginTop: 4 }}>
      {tiles.map((t) => {
        const lead = t.key === 'send';
        return (
          <Pressable key={t.key} onPress={() => router.push(t.href as never)} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.caption}`} {...hoverFace}
            className="flex-1 items-center gap-1.5 py-1 active:opacity-70">
            <View {...hoverFaceMark} className={`h-14 w-14 items-center justify-center rounded-full border ${lead ? 'border-primary bg-primary' : 'border-border bg-surface-elevated'}`}>
              <t.icon size={22} color={lead ? colors.textOnPrimary : colors.primary} />
            </View>
            <Text className="text-[13px] font-bold text-text-primary">{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const cash = money ? money.cash_paise / 100 : 0;
  const bank = money ? money.bank_paise / 100 : 0;
  const moneyCard = money ? (
    <Pressable onPress={() => router.push('/central-kitchen/money')} accessibilityRole="button" accessibilityLabel={`Money now, ${formatMoney(cash + bank)}: cash ${formatMoney(cash)}, bank ${formatMoney(bank)}`}
      className="rounded-[20px] border border-border-soft bg-surface-elevated p-4 active:opacity-80">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-extrabold uppercase tracking-wide text-text-secondary">Money now</Text>
        <ChevronRight size={16} color={colors.textSecondary} />
      </View>
      <Text className="mt-1 text-[34px] font-extrabold leading-10 text-text-primary" style={{ letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{formatMoney(cash + bank)}</Text>
      {/* How the money splits between cash and bank; a negative side shows as empty. */}
      <View className="mt-2 flex-row gap-1">
        {cash > 0 ? <View className="h-2.5 rounded-full" style={{ flex: cash, backgroundColor: chart.series2 }} /> : null}
        {bank > 0 ? <View className="h-2.5 rounded-full" style={{ flex: bank, backgroundColor: colors.primary }} /> : null}
        {cash <= 0 && bank <= 0 ? <View className="h-2.5 flex-1 rounded-full" style={{ backgroundColor: chart.grid }} /> : null}
      </View>
      <View className="mt-2 flex-row gap-4">
        <View className="flex-row items-center gap-1.5"><View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: chart.series2 }} /><Text className="text-[13px] font-bold text-text-secondary">Cash {formatMoney(cash)}</Text></View>
        <View className="flex-row items-center gap-1.5"><View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors.primary }} /><Text className="text-[13px] font-bold text-text-secondary">Bank {formatMoney(bank)}</Text></View>
      </View>
    </Pressable>
  ) : null;
  const dueCount = (kind: 'branch' | 'vendor'): number => data.balances.filter((b) => b.kind === kind && b.balance > 0).length;
  const oweTile = (label: string, value: number, count: number, noun: string, tone: string, href: string) => (
    <Pressable onPress={() => router.navigate(href as never)} accessibilityRole="button" accessibilityLabel={`${label}, ${formatMoney(value)}`}
      className="flex-1 rounded-[18px] border border-border-soft bg-surface-elevated px-3.5 py-3 active:opacity-80">
      <View className="flex-row items-center gap-0.5"><Text className="text-xs font-bold text-text-secondary">{label}</Text><ChevronRight size={13} color={colors.textSecondary} /></View>
      <Text className="mt-0.5 text-xl font-extrabold" style={{ color: value > 0 ? tone : colors.textPrimary, fontVariant: ['tabular-nums'] }}>{formatMoney(value)}</Text>
      <Text className="text-xs font-semibold text-text-secondary">{count === 0 ? 'All settled' : `${count} ${count === 1 ? noun : noun === 'branch' ? 'branches' : 'vendors'}`}</Text>
    </Pressable>
  );
  const phoneSummary = !access.showAmounts ? null : (
    <View style={{ gap: 10 }}>
      {moneyCard}
      <View className="flex-row" style={{ gap: 10 }}>
        {oweTile('Yet to pay', owed, dueCount('branch'), 'branch', semantic.success, '/central-kitchen/(tabs)/branches')}
        {oweTile('We owe', owe, dueCount('vendor'), 'vendor', semantic.danger, '/central-kitchen/(tabs)/vendors')}
      </View>
    </View>
  );
  const lockedThrough = access.access.lockedThrough;
  const lockLine = lockedThrough ? (
    <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-surface-tint px-3 py-2.5">
      <Lock size={15} color={colors.textSecondary} />
      <Text className="flex-1 text-[13px] font-semibold text-text-secondary">
        {access.isOwner ? `Entries up to ${dayText(lockedThrough)} are locked. You can still correct them with a reason.` : `Entries up to ${dayText(lockedThrough)} are locked.`}
      </Text>
    </View>
  ) : null;

  return (
    <KScreen wide refreshing={data.loading && data.loaded} onRefresh={data.refresh}>
      <KHeader
        title="Central Kitchen"
        subtitle={isKitchenLogin ? formatLongDate(today) : `${branchName} · ${formatLongDate(today)}`}
        right={
          <View className="flex-row items-center" style={{ gap: 4 }}>
          {phone ? <IconButton icon={History} label="History" onPress={() => router.navigate('/central-kitchen/(tabs)/history')} /> : access.isOwner ? <IconButton icon={ShieldCheck} label="Team and day lock" tone="neutral" onPress={() => router.push('/central-kitchen/team' as never)} /> : null}
          {isKitchenLogin ? (
            <Pressable onPress={() => void useSessionStore.getState().signOut()} accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={8} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <LogOut size={20} color={colors.textSecondary} />
            </Pressable>
          ) : (
            // Go back to the Settings screen that opened the kitchen rather than replacing the
            // kitchen with a second copy of the main app: each copy keeps its own Orders tab
            // mounted and polling, which is how one browser tab came to poll four times over.
            <IconButton icon={ArrowLeft} label="Back to the main app" tone="neutral" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/settings'))} />
          )}
          </View>
        }
      />

      {data.error ? <Notice text={data.error} action={<LinkButton label="Retry" onPress={() => void data.load()} />} /> : null}
      {lockLine}

      {!data.loaded ? (
        <View style={{ gap: 12 }}>
          {desktop ? null : <><Skeleton height={100} /><Skeleton height={100} /></>}
          <Skeleton height={150} />
          <Skeleton height={150} />
        </View>
      ) : nothingSetUp ? (
        <Card style={{ marginTop: 4 }}>
          <Text className="text-text-primary" style={{ fontSize: 17, fontWeight: '800' }}>Start the kitchen&apos;s books</Text>
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', lineHeight: 19, marginTop: 4 }}>
            Add the items the kitchen makes and buys, then the branches it sends to and the vendors it buys from. Each takes a name and nothing else.
          </Text>
          {/* Task 251: whole rows to tap, one per step, instead of three wrapping buttons. */}
          <View style={{ marginTop: 8 }}>
            {access.can('setup.items') ? <Row icon={Plus} iconTone="primary" title="Add an item" subtitle="What the kitchen makes or buys" onPress={() => router.push('/central-kitchen/item-form')} /> : null}
            {access.can('setup.parties') ? <Row icon={Plus} iconTone="primary" title="Add a branch" subtitle="An outlet the kitchen sends to" onPress={() => router.push({ pathname: '/central-kitchen/party-form', params: { kind: 'branch' } })} /> : null}
            {access.can('setup.parties') ? <Row icon={Plus} iconTone="primary" title="Add a vendor" subtitle="Someone the kitchen buys from" onPress={() => router.push({ pathname: '/central-kitchen/party-form', params: { kind: 'vendor' } })} /> : null}
          </View>
        </Card>
      ) : desktop ? (
        <View className="gap-3">
          {actions}
          <View className="flex-row items-start gap-4">
            {summary ? <View className="w-80 shrink-0">{summary}</View> : null}
            <View className="min-w-0 flex-1">
              {/* A desktop card is padded 12, so its entry rows reach back 12 (task 226). */}
              <RowInset.Provider value={12}>
              <Card style={{ overflow: 'hidden' }}>
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs font-extrabold uppercase tracking-wide text-text-secondary">{showRecent ? 'Recent entries' : 'Today'}</Text>
                  <LinkButton label="All entries" onPress={() => router.navigate('/central-kitchen/(tabs)/history')} />
                </View>
                {showRecent ? <Text className="pb-2 text-xs font-semibold text-text-secondary">Nothing recorded today yet. Here are the latest entries.</Text> : null}
                {todays.length === 0 && !showRecent ? (
                  <Empty title="Nothing recorded today yet" body="A send, a payment or a buy will show here the moment it is saved." />
                ) : (
                  <EntryList entries={showRecent ? recent : todays} itemsById={data.itemsById} partiesById={data.partiesById} grouped={showRecent} />
                )}
              </Card>
              </RowInset.Provider>
            </View>
          </View>
        </View>
      ) : isTablet ? (
        <View className="flex-row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <View className="flex-1">{summary}</View>
          <View className="flex-1">{actions}</View>
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 2 }}>
          {roundActions}
          {phoneSummary}
        </View>
      )}

      {data.loaded && !nothingSetUp && !desktop ? (
        <Section title="Today" action={<LinkButton label="All entries" onPress={() => router.navigate('/central-kitchen/(tabs)/history')} />}>
          <Card padded={false} style={{ paddingHorizontal: 14, overflow: 'hidden' }}>
            {todays.length === 0 ? (
              <Empty title="Nothing recorded today yet" body="A send, a payment or a buy will show here the moment it is saved." />
            ) : (
              <EntryList entries={todays} itemsById={data.itemsById} partiesById={data.partiesById} grouped={false} />
            )}
          </Card>
        </Section>
      ) : null}
    </KScreen>
  );
}
