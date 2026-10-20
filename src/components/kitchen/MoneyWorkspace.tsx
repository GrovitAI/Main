import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ArrowRightLeft, ChevronRight, Landmark, PiggyBank, Wallet, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { chart, colors, semantic } from '@/lib/pos/brand';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { confirmAction } from '@/lib/pos/dialogs';
import { figureSize, formatMoney, localDateKey, moneyChangeOn } from '@/lib/pos/kitchen-utils';
import { historyDateLabel } from '@/lib/pos/kitchen-history-utils';
import { fetchKitchenMoney, voidKitchenMoneyMove, type MoneyAccount, type MoneyMove, type MoneySummary } from '@/lib/pos/kitchen-money-service';
import { Card, Divider, GhostButton, KHeader, KScreen, LinkButton, Notice, PrimaryButton, Row, StatTile, TextField } from '@/components/kitchen/ui';
import { useKitchenAccess, useKitchenData } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';

const tabular = { fontVariant: ['tabular-nums' as const] };
const ACCOUNT_LABEL: Record<MoneyAccount, string> = { cash: 'Cash', bank: 'Bank' };
const rupees = (paise: number): string => formatMoney(paise / 100);
// Task 286: moving money and the opening balances are their own pages, in the Spent layout.
const openMove = (): void => { router.push('/central-kitchen/money-move' as never); };
const openOpening = (): void => { router.push('/central-kitchen/money-opening' as never); };

/** One line of the since-opening breakdown: what came in, went out and moved for one account. */
function Flow({ label, inPaise, outPaise, movedIn, movedOut }: { label: string; inPaise: number; outPaise: number; movedIn: number; movedOut: number }) {
  return <View className="min-w-0 flex-1 gap-0.5">
    <Text className="text-xs font-bold text-text-secondary">{label}</Text>
    <Text className="text-xs leading-5 text-text-secondary" style={tabular}>Received {rupees(inPaise)} · Paid out {rupees(outPaise)}</Text>
    <Text className="text-xs leading-5 text-text-secondary" style={tabular}>Moved in {rupees(movedIn)} · Moved out {rupees(movedOut)}</Text>
  </View>;
}

/**
 * The Central Kitchen's money in two places: cash in hand and the bank (UPI
 * settles into the bank). Opening figures on an as-of date, plus every money
 * entry and transfer from that date, give the balances.
 */
export function MoneyWorkspace() {
  const [summary, setSummary] = useState<MoneySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const today = localDateKey();
  const access = useKitchenAccess();
  const phone = !useResponsive().isTablet;
  const { entries } = useKitchenData();
  const mayView = access.can('money.view');
  const mayMove = access.can('money.move');
  const mayOpening = access.can('money.opening');
  // Voiding a transfer on a locked day: the owner gives a reason in the row.
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async (): Promise<void> => {
    if (!mayView) { setLoading(false); return; }
    setLoading(true);
    const result = await fetchKitchenMoney();
    setLoading(false); setError(result.error); if (result.data) setSummary(result.data);
  }, [mayView]);
  // Reload whenever the screen is shown; entries recorded elsewhere change the balances.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (save: () => Promise<{ error: string | null }>, done: string): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(null); setMessage(null);
    const result = await save();
    busyRef.current = false; setBusy(false);
    if (result.error) { setError(result.error); return false; }
    setMessage(done); void load();
    return true;
  };
  const voidMove = (m: MoneyMove): void => confirmAction('Void this transfer?',
    `${rupees(m.amount_paise)} from ${ACCOUNT_LABEL[m.from_account]} to ${ACCOUNT_LABEL[m.to_account]} on ${historyDateLabel(m.move_date)}. It stays in the records as voided and no longer counts.`,
    'Void transfer', () => void run(() => voidKitchenMoneyMove(m.id, voiding === m.id ? voidReason : null), 'Transfer voided'));
  const startVoid = (m: MoneyMove): void => {
    if (access.isLocked(m.move_date)) { setVoiding(m.id); setVoidReason(''); return; }
    voidMove(m);
  };

  const change = moneyChangeOn(entries, summary?.moves ?? [], today);
  const phoneTop = (s: MoneySummary) => <>
    <View className="flex-row" style={{ gap: 10 }}>
      <BalanceCard icon={Wallet} color={chart.series2} label="Cash in hand" paise={s.cash_paise} change={change.cash} />
      <BalanceCard icon={Landmark} color={colors.primary} label="Bank · UPI" paise={s.bank_paise} change={change.bank} />
    </View>
    <DrawingsTile paise={s.drawings_paise} />
    {mayMove ? <MoveTile /> : null}
    {!s.has_opening ? <Text className="mt-2 px-1 text-xs leading-5 text-text-secondary">Opening balances are not set, so these count every money entry from zero.</Text> : null}
    {mayOpening && !busy ? <View className="mt-1 flex-row"><LinkButton label={s.has_opening ? 'Change opening balances' : 'Set opening balances'} onPress={openOpening} /></View> : null}
    {message ? <Text accessibilityRole="alert" className="mt-1 px-1 text-sm leading-5" style={{ color: semantic.success }}>{message}</Text> : null}
    <Text className="mb-2 mt-4 px-1 text-xs font-extrabold uppercase tracking-wide text-text-secondary">Moves</Text>
  </>;
  const phoneMove = (item: MoneyMove, first: boolean, last: boolean) => {
    const mayVoid = mayMove && (!access.isLocked(item.move_date) || access.isOwner);
    return <View className={`overflow-hidden border-x border-border-soft bg-surface-elevated px-3.5 ${first ? 'rounded-t-[18px] border-t' : ''} ${last ? 'rounded-b-[18px] border-b' : ''}`}>
      <View style={last && voiding !== item.id ? { marginBottom: -1 } : undefined}>
        <Row icon={ArrowRightLeft} iconTone="primary" title={`${ACCOUNT_LABEL[item.from_account]} → ${ACCOUNT_LABEL[item.to_account]}`}
          subtitle={historyDateLabel(item.move_date) + (item.note ? ' · ' + item.note : '')} right={rupees(item.amount_paise)} rightSub={`by ${item.created_by}`}
          onPress={mayVoid && !busy ? () => startVoid(item) : undefined}
          accessibilityLabel={`${rupees(item.amount_paise)} from ${ACCOUNT_LABEL[item.from_account]} to ${ACCOUNT_LABEL[item.to_account]}, ${historyDateLabel(item.move_date)}${mayVoid ? '. Opens void' : ''}`} />
      </View>
      {voiding === item.id ? <View className="gap-2 py-2.5">
        <TextField label="Reason for changing a locked day" value={voidReason} onChange={setVoidReason} placeholder="Why this transfer is being voided" autoFocus />
        <View className="flex-row gap-2">
          <GhostButton small tone="out" label="Void transfer" disabled={busy || !voidReason.trim()} onPress={() => voidMove(item)} />
          <GhostButton small label="Cancel" onPress={() => setVoiding(null)} />
        </View>
      </View> : null}
    </View>;
  };
  const phoneFlows = (s: MoneySummary) => <View className="mt-4 flex-row gap-3 rounded-[18px] border border-border-soft bg-surface-elevated p-3.5">
    <Flow label={s.has_opening && s.as_of ? `Cash since ${historyDateLabel(s.as_of)}` : 'Cash'} inPaise={s.cash_in_paise} outPaise={s.cash_out_paise} movedIn={s.moved_to_cash_paise} movedOut={s.moved_to_bank_paise} />
    <Flow label={s.has_opening && s.as_of ? `Bank since ${historyDateLabel(s.as_of)}` : 'Bank'} inPaise={s.bank_in_paise} outPaise={s.bank_out_paise} movedIn={s.moved_to_bank_paise} movedOut={s.moved_to_cash_paise} />
  </View>;

  const header = <View className="pb-3">
    <KHeader title="Cash & bank" subtitle={phone && summary ? summary.has_opening && summary.as_of ? `Opening set on ${historyDateLabel(summary.as_of)}` : 'Opening balances not set' : undefined} onBack={busy ? undefined : backToKitchen} />
    {loading && !summary ? <ActivityIndicator accessibilityLabel="Loading cash and bank" color={colors.primary} className="my-6" /> : null}
    {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
    {summary && phone ? phoneTop(summary) : null}
    {summary && !phone ? <>
      <Card>
        <View className="flex-row">
          <View className="min-w-0 flex-1 flex-row items-start gap-2"><Wallet size={18} color={colors.textSecondary} /><StatTile label="Cash in hand" value={summary.cash_paise / 100} tone={summary.cash_paise < 0 ? 'out' : 'neutral'} /></View>
          <Divider vertical />
          <View className="min-w-0 flex-1 flex-row items-start gap-2 pl-3"><Landmark size={18} color={colors.textSecondary} /><StatTile label="Bank · UPI" value={summary.bank_paise / 100} tone={summary.bank_paise < 0 ? 'out' : 'neutral'} /></View>
        </View>
      </Card>
      <DrawingsTile paise={summary.drawings_paise} />
      <View className="mt-1 flex-row flex-wrap items-center" style={{ columnGap: 8 }}>
        <Text className="shrink text-xs leading-5 text-text-secondary">
          {summary.has_opening && summary.as_of
            ? `From the opening on ${historyDateLabel(summary.as_of)}: cash ${rupees(summary.opening_cash_paise)}, bank ${rupees(summary.opening_bank_paise)}${summary.opening_updated_by ? `, set by ${summary.opening_updated_by}` : ''}.`
            : 'Opening balances are not set, so these count every money entry from zero. Set them to match the cash box and the bank.'}
        </Text>
        {mayOpening && !busy ? <LinkButton label={summary.has_opening ? 'Change' : 'Set opening balances'} onPress={openOpening} /> : null}
      </View>
      {message ? <Text accessibilityRole="alert" className="mt-2 text-sm leading-5" style={{ color: semantic.success }}>{message}</Text> : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        {mayMove ? <PrimaryButton label="Move money" icon={ArrowRightLeft} disabled={busy} onPress={openMove} /> : null}
      </View>
      <View className="mt-4 flex-row gap-3 border-y border-border-soft py-3">
        <Flow label={summary.has_opening && summary.as_of ? `Cash since ${historyDateLabel(summary.as_of)}` : 'Cash'} inPaise={summary.cash_in_paise} outPaise={summary.cash_out_paise} movedIn={summary.moved_to_cash_paise} movedOut={summary.moved_to_bank_paise} />
        <Flow label={summary.has_opening && summary.as_of ? `Bank since ${historyDateLabel(summary.as_of)}` : 'Bank'} inPaise={summary.bank_in_paise} outPaise={summary.bank_out_paise} movedIn={summary.moved_to_bank_paise} movedOut={summary.moved_to_cash_paise} />
      </View>
      <Text className="mt-4 text-sm font-bold text-text-primary">Transfers</Text>
    </> : null}
  </View>;

  if (!mayView) {
    return <KScreen><KHeader title="Cash & bank" onBack={backToKitchen} /><Notice tone="neutral" text="Your login does not show cash and bank balances. Ask the owner if you need them." /></KScreen>;
  }

  return <KeyboardAvoider><KScreen scroll={false} wide>
    <FlatList<MoneyMove> className="flex-1" data={summary?.moves ?? []} keyExtractor={m => m.id} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 720, alignSelf: 'center' }}
      refreshing={false} onRefresh={() => { if (!busyRef.current) void load(); }}
      ListEmptyComponent={summary ? <Text className={phone ? 'px-1 pb-2 text-sm leading-5 text-text-secondary' : 'py-3 text-sm leading-5 text-text-secondary'}>No transfers yet. Use Move money when cash is deposited into the bank or withdrawn from it.</Text> : null}
      ListFooterComponent={phone && summary ? phoneFlows(summary) : null}
      renderItem={({ item, index }) => phone ? phoneMove(item, index === 0, index === (summary?.moves.length ?? 0) - 1) : <View className="min-h-16 flex-row flex-wrap items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold leading-5 text-text-primary">{ACCOUNT_LABEL[item.from_account]} → {ACCOUNT_LABEL[item.to_account]}</Text>
          <Text className="text-xs leading-5 text-text-secondary" numberOfLines={2}>{historyDateLabel(item.move_date)}{item.note ? ' · ' + item.note : ''} · {item.created_by}</Text>
        </View>
        <Text className="text-sm font-bold text-text-primary" style={tabular}>{rupees(item.amount_paise)}</Text>
        {mayMove && (!access.isLocked(item.move_date) || access.isOwner) ? <GhostButton small label="Void" disabled={busy} onPress={() => startVoid(item)} /> : null}
        {voiding === item.id ? <View className="w-full gap-2 pb-2">
          <TextField label="Reason for changing a locked day" value={voidReason} onChange={setVoidReason} placeholder="Why this transfer is being voided" autoFocus />
          <View className="flex-row gap-2">
            <GhostButton small tone="out" label="Void transfer" disabled={busy || !voidReason.trim()} onPress={() => voidMove(item)} />
            <GhostButton small label="Cancel" onPress={() => setVoiding(null)} />
          </View>
        </View> : null}
      </View>} />
  </KScreen></KeyboardAvoider>;
}

/** Task 286: on a phone, Move money is a row that opens its page. */
function MoveTile() {
  return (
    <Pressable onPress={openMove} accessibilityRole="button" accessibilityLabel="Move money between Cash and Bank"
      className="mt-2.5 flex-row items-center gap-3 rounded-[18px] border border-border-soft bg-surface-elevated px-3.5 py-3 hover:bg-surface-tint active:bg-surface-tint">
      <ArrowRightLeft size={18} color={colors.primary} />
      <Text className="min-w-0 flex-1 text-[15px] font-bold text-text-primary">Move money</Text>
      <Text className="text-xs font-semibold text-text-secondary">Cash ↔ Bank</Text>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

/** A phone's balance card (task 237): the account's icon and name in its colour, the balance, and today's change. */
/** Task 282: the owners' drawings, for owners only; it opens the Drawings page. */
function DrawingsTile({ paise }: { paise: number | null }) {
  if (paise === null) return null;
  return (
    <Pressable onPress={() => router.push('/central-kitchen/drawings' as never)} accessibilityRole="button" accessibilityLabel={`Drawings, ${rupees(paise)}`}
      className="mt-2.5 flex-row items-center gap-3 rounded-[18px] border border-border-soft bg-surface-elevated px-3.5 py-3 hover:bg-surface-tint active:bg-surface-tint">
      <PiggyBank size={18} color={chart.series3} />
      <Text className="min-w-0 flex-1 text-[15px] font-bold text-text-primary">Drawings</Text>
      <Text className="text-[17px] font-bold text-text-primary" style={tabular}>{rupees(paise)}</Text>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function BalanceCard({ icon: Icon, color, label, paise, change }: { icon: LucideIcon; color: string; label: string; paise: number; change: number }) {
  return <View className="min-w-0 flex-1 rounded-[18px] border border-border-soft bg-surface-elevated p-3.5">
    <View className="flex-row items-center gap-1.5"><Icon size={17} color={color} /><Text className="text-[13px] font-bold" style={{ color }}>{label}</Text></View>
    <Text className="mt-1 font-bold" style={{ fontSize: figureSize(rupees(paise), 26, 9), lineHeight: 32, color: paise < 0 ? semantic.danger : colors.textPrimary, letterSpacing: -0.5, ...tabular }} numberOfLines={1}>{rupees(paise)}</Text>
    <Text className="text-xs font-semibold text-text-secondary" style={tabular}>{change === 0 ? 'No change today' : `${change > 0 ? '+' : '−'}${formatMoney(Math.abs(change))} today`}</Text>
  </View>;
}
