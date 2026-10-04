import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, ArrowDownLeft, ShoppingBag, ArrowUp, LogOut, Plus, ArrowLeft } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { kitchenBranch } from '@/lib/pos/kitchen-service';
import { useKitchenData } from '@/lib/pos/use-kitchen-store';
import { formatLongDate, localDateKey, monthKeyOf, monthTotals, sumDues } from '@/lib/pos/kitchen-utils';
import { ActionTile, Card, Divider, Empty, IconButton, KHeader, KScreen, LinkButton, Notice, Section, Skeleton, StatTile, GhostButton } from '@/components/kitchen/ui';
import { EntryList } from '@/components/kitchen/EntryList';

/**
 * The kitchen's home: this month's money, who still owes whom, the four
 * things the kitchen records, and today's entries.
 */
export default function KitchenHome() {
  const data = useKitchenData();
  const { isTablet } = useResponsive();
  const session = useSessionStore((s) => s.session);
  const today = localDateKey();
  const month = useMemo(() => monthTotals(data.entries, monthKeyOf(today)), [data.entries, today]);
  const owed = useMemo(() => sumDues(data.balances, 'branch'), [data.balances]);
  const owe = useMemo(() => sumDues(data.balances, 'vendor'), [data.balances]);
  const todays = useMemo(() => data.entries.filter((e) => e.entry_date === today && e.voided_at === null), [data.entries, today]);
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const isKitchenLogin = session?.role === 'kitchen';
  const branchName = kitchenBranch().name;
  const nothingSetUp = data.loaded && data.items.length === 0 && data.parties.length === 0;

  const summary = (
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
    </>
  );

  const actions = (
    <View style={{ gap: 10, marginTop: isTablet ? 0 : 12 }}>
      <View className="flex-row" style={{ gap: 10 }}>
        <ActionTile icon={ArrowUpRight} label="Send" caption="Items to a branch" tone="primary" onPress={() => router.push('/central-kitchen/send')} />
        <ActionTile icon={ArrowDownLeft} label="Received" caption="Money from a branch" tone="in" onPress={() => router.push('/central-kitchen/received')} />
      </View>
      <View className="flex-row" style={{ gap: 10 }}>
        <ActionTile icon={ShoppingBag} label="Bought" caption="From a vendor" tone="buy" onPress={() => router.push('/central-kitchen/bought')} />
        <ActionTile icon={ArrowUp} label="Spent" caption="Pay a vendor or a bill" tone="out" onPress={() => router.push('/central-kitchen/spent')} />
      </View>
    </View>
  );

  return (
    <KScreen refreshing={data.loading && data.loaded} onRefresh={data.refresh}>
      <KHeader
        title="Central Kitchen"
        subtitle={isKitchenLogin ? formatLongDate(today) : `${branchName} · ${formatLongDate(today)}`}
        right={
          isKitchenLogin ? (
            <Pressable onPress={() => void useSessionStore.getState().signOut()} accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={8} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <LogOut size={20} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <IconButton icon={ArrowLeft} label="Back to the main app" tone="neutral" onPress={() => router.replace('/(app)/settings')} />
          )
        }
      />

      {data.error ? <Notice text={data.error} action={<LinkButton label="Retry" onPress={() => void data.load()} />} /> : null}

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
            <GhostButton small icon={Plus} tone="primary" label="Add an item" onPress={() => router.push('/central-kitchen/item-form')} />
            <GhostButton small icon={Plus} tone="primary" label="Add a branch" onPress={() => router.push({ pathname: '/central-kitchen/party-form', params: { kind: 'branch' } })} />
            <GhostButton small icon={Plus} tone="primary" label="Add a vendor" onPress={() => router.push({ pathname: '/central-kitchen/party-form', params: { kind: 'vendor' } })} />
          </View>
        </Card>
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

      {data.loaded && !nothingSetUp ? (
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
