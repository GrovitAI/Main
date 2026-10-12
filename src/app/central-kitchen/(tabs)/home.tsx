import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router, useFocusEffect } from 'expo-router';
import { ArrowUpRight, ArrowDownLeft, ShoppingBag, ArrowUp, LogOut, Plus, ArrowLeft, ShieldCheck, Lock, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { dayText } from '@/lib/pos/kitchen-access-utils';
import type { Tone } from '@/components/kitchen/ui';
import { fetchKitchenMoney, type MoneySummary } from '@/lib/pos/kitchen-money-service';
import { formatLongDate, localDateKey, monthKeyOf, monthTotals, newestFirst, sumDues } from '@/lib/pos/kitchen-utils';
import { ActionTile, Card, Divider, Empty, IconButton, KHeader, KScreen, LinkButton, Notice, Section, Skeleton, StatTile, GhostButton, useDesktopDensity } from '@/components/kitchen/ui';
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

  const summary = !access.showAmounts ? null : (
    <>
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
      <View className="flex-row" style={{ gap: 10, marginTop: 12 }}>
        <StatTile label="Branches yet to pay" value={owed} tone={owed > 0 ? 'in' : 'neutral'} onPress={() => router.navigate('/central-kitchen/(tabs)/branches')} />
        <StatTile label="We owe vendors" value={owe} tone={owe > 0 ? 'out' : 'neutral'} onPress={() => router.navigate('/central-kitchen/(tabs)/vendors')} />
      </View>
      {money ? (
        <View className="flex-row" style={{ gap: 10, marginTop: 10 }}>
          <StatTile label="Cash in hand" value={money.cash_paise / 100} tone={money.cash_paise < 0 ? 'out' : 'neutral'} onPress={() => router.push('/central-kitchen/money')} />
          <StatTile label="Bank · UPI" value={money.bank_paise / 100} tone={money.bank_paise < 0 ? 'out' : 'neutral'} onPress={() => router.push('/central-kitchen/money')} />
        </View>
      ) : null}
    </>
  );

  // The four things the kitchen records, each shown only to logins allowed to record it.
  const mayPay = access.can('entries.pay');
  const maySpend = access.can('entries.spend');
  const tiles: { key: string; icon: LucideIcon; label: string; caption: string; tone: Tone; href: string }[] = [
    ...(access.can('entries.send') ? [{ key: 'send', icon: ArrowUpRight, label: 'Send', caption: 'Items to a branch', tone: 'primary' as const, href: '/central-kitchen/send' }] : []),
    ...(access.can('entries.receive') ? [{ key: 'received', icon: ArrowDownLeft, label: 'Received', caption: 'Money from a branch', tone: 'in' as const, href: '/central-kitchen/received' }] : []),
    ...(access.can('entries.buy') ? [{ key: 'bought', icon: ShoppingBag, label: 'Bought', caption: 'From a vendor', tone: 'buy' as const, href: '/central-kitchen/bought' }] : []),
    ...(mayPay || maySpend ? [{ key: 'spent', icon: ArrowUp, label: 'Spent', caption: mayPay && maySpend ? 'Pay a vendor or a bill' : mayPay ? 'Pay a vendor' : 'Pay a bill', tone: 'out' as const, href: '/central-kitchen/spent' }] : []),
  ];
  const tileRows = [tiles.slice(0, 2), tiles.slice(2, 4)].filter((row) => row.length > 0);
  const actions = tiles.length === 0 ? null : (
    <View className={desktop ? 'flex-row gap-3' : undefined} style={desktop ? undefined : { gap: 10, marginTop: isTablet ? 0 : 12 }}>
      {tileRows.map((row) => (
        <View key={row[0]?.key} className={desktop ? 'flex-1 flex-row gap-3' : 'flex-row'} style={desktop ? undefined : { gap: 10 }}>
          {row.map((t) => <ActionTile key={t.key} icon={t.icon} label={t.label} caption={t.caption} tone={t.tone} onPress={() => router.push(t.href as never)} />)}
        </View>
      ))}
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
          {access.isOwner ? <IconButton icon={ShieldCheck} label="Team and day lock" tone="neutral" onPress={() => router.push('/central-kitchen/team' as never)} /> : null}
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
          <Skeleton height={190} />
          <Skeleton height={66} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </View>
      ) : nothingSetUp ? (
        <Card style={{ marginTop: 4 }}>
          <Text className="text-text-primary" style={{ fontSize: 17, fontWeight: '800' }}>Start the kitchen&apos;s books</Text>
          <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', lineHeight: 19, marginTop: 4 }}>
            Add the items the kitchen makes and buys, then the branches it sends to and the vendors it buys from. Each takes a name and nothing else.
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8, marginTop: 14 }}>
            {access.can('setup.items') ? <GhostButton small icon={Plus} tone="primary" label="Add an item" onPress={() => router.push('/central-kitchen/item-form')} /> : null}
            {access.can('setup.parties') ? <GhostButton small icon={Plus} tone="primary" label="Add a branch" onPress={() => router.push({ pathname: '/central-kitchen/party-form', params: { kind: 'branch' } })} /> : null}
            {access.can('setup.parties') ? <GhostButton small icon={Plus} tone="primary" label="Add a vendor" onPress={() => router.push({ pathname: '/central-kitchen/party-form', params: { kind: 'vendor' } })} /> : null}
          </View>
        </Card>
      ) : desktop ? (
        <View className="gap-3">
          {actions}
          <View className="flex-row items-start gap-4">
            {summary ? <View className="w-80 shrink-0">{summary}</View> : null}
            <View className="min-w-0 flex-1">
              <Card>
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
            </View>
          </View>
        </View>
      ) : isTablet ? (
        <View className="flex-row" style={{ gap: 16, alignItems: 'flex-start' }}>
          <View className="flex-1">{summary}</View>
          <View className="flex-1">{actions}</View>
        </View>
      ) : (
        <>
          {summary}
          {actions}
        </>
      )}

      {data.loaded && !nothingSetUp && !desktop ? (
        <Section title="Today" action={<LinkButton label="All entries" onPress={() => router.navigate('/central-kitchen/(tabs)/history')} />}>
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
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
