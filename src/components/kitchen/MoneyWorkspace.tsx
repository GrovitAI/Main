import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ArrowRightLeft, Landmark, Wallet } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { colors, semantic } from '@/lib/pos/brand';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { confirmAction } from '@/lib/pos/dialogs';
import { formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import { historyDateLabel } from '@/lib/pos/kitchen-history-utils';
import { fetchKitchenMoney, moveKitchenMoney, setKitchenMoneyOpening, voidKitchenMoneyMove, MONEY_LIMIT_PAISE, type MoneyAccount, type MoneyMove, type MoneySummary } from '@/lib/pos/kitchen-money-service';
import { Card, Divider, Field, GhostButton, KHeader, KScreen, LinkButton, Notice, PrimaryButton, Segmented, StatTile, TextField } from '@/components/kitchen/ui';
import { DateField, isValidDateKey, useDateGuard } from '@/components/kitchen/forms';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';

const tabular = { fontVariant: ['tabular-nums' as const] };
const ACCOUNT_LABEL: Record<MoneyAccount, string> = { cash: 'Cash', bank: 'Bank' };
const rupees = (paise: number): string => formatMoney(paise / 100);
/** Typed rupees to paise; the bank figure may be negative (an overdraft). */
function typedPaise(text: string, allowNegative = false): number {
  const negative = allowNegative && text.trim().startsWith('-');
  const value = Math.round(parseAmount(text.replace('-', '')) * 100);
  return negative ? -value : value;
}

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
  const [editor, setEditor] = useState<'move' | 'opening' | null>(null);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [from, setFrom] = useState<MoneyAccount>('cash');
  const [amount, setAmount] = useState(''); const [moveDate, setMoveDate] = useState(localDateKey()); const [note, setNote] = useState('');
  const [asOf, setAsOf] = useState(localDateKey()); const [openCash, setOpenCash] = useState(''); const [openBank, setOpenBank] = useState('');
  const requestKey = useRef('');
  const today = localDateKey();
  const access = useKitchenAccess();
  const mayView = access.can('money.view');
  const mayMove = access.can('money.move');
  const mayOpening = access.can('money.opening');
  const [lockReason, setLockReason] = useState('');
  const moveDateOk = useDateGuard(moveDate, lockReason);
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

  const run = async (save: () => Promise<{ error: string | null }>, done: string): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setMessage(null);
    const result = await save();
    busyRef.current = false; setBusy(false);
    if (result.error) { setError(result.error); return; }
    setEditor(null); setMessage(done); void load();
  };
  const openMove = (): void => {
    requestKey.current = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    setFrom('cash'); setAmount(''); setMoveDate(today); setNote(''); setLockReason(''); setError(null); setMessage(null); setEditor('move');
  };
  const openOpening = (): void => {
    setAsOf(summary?.as_of ?? today);
    setOpenCash(summary?.has_opening ? String(summary.opening_cash_paise / 100) : '');
    setOpenBank(summary?.has_opening ? String(summary.opening_bank_paise / 100) : '');
    setError(null); setMessage(null); setEditor('opening');
  };
  const voidMove = (m: MoneyMove): void => confirmAction('Void this transfer?',
    `${rupees(m.amount_paise)} from ${ACCOUNT_LABEL[m.from_account]} to ${ACCOUNT_LABEL[m.to_account]} on ${historyDateLabel(m.move_date)}. It stays in the records as voided and no longer counts.`,
    'Void transfer', () => void run(() => voidKitchenMoneyMove(m.id, voiding === m.id ? voidReason : null), 'Transfer voided'));
  const startVoid = (m: MoneyMove): void => {
    if (access.isLocked(m.move_date)) { setVoiding(m.id); setVoidReason(''); return; }
    voidMove(m);
  };

  const movePaise = typedPaise(amount);
  const available = summary ? (from === 'cash' ? summary.cash_paise : summary.bank_paise) : 0;
  const cashPaise = typedPaise(openCash); const bankPaise = typedPaise(openBank, true);
  const moveReady = movePaise > 0 && movePaise <= MONEY_LIMIT_PAISE && isValidDateKey(moveDate) && moveDate <= today && note.trim().length <= 200 && moveDateOk;
  const openingReady = openCash.trim() !== '' && openBank.trim() !== '' && cashPaise >= 0 && cashPaise <= MONEY_LIMIT_PAISE
    && Math.abs(bankPaise) <= MONEY_LIMIT_PAISE && isValidDateKey(asOf) && asOf <= today;

  const pane = editor ? <Card style={{ marginTop: 12 }}>
    <View className="gap-3">
      <Text className="text-base font-bold text-text-primary">{editor === 'move' ? 'Move money' : 'Opening cash and bank'}</Text>
      {error ? <Notice text={error} /> : null}
      {editor === 'move' ? <>
        <Field label="Direction">
          <Segmented options={[{ value: 'cash', label: 'Cash → Bank' }, { value: 'bank', label: 'Bank → Cash' }]} value={from} onChange={setFrom} />
        </Field>
        <Field label={from === 'cash' ? 'Amount deposited' : 'Amount withdrawn'}>
          <TextField label={from === 'cash' ? 'Amount deposited' : 'Amount withdrawn'} value={amount} onChange={setAmount} prefix="₹" keyboardType="decimal-pad" placeholder="Amount" />
        </Field>
        <Text className="text-xs leading-5" style={{ color: movePaise > available ? semantic.warning : colors.textSecondary }}>
          {movePaise > available ? `More than the ${rupees(available)} ${from === 'cash' ? 'cash in hand' : 'in the bank'} shown here. Check the amount, or the balances are missing an entry.` : `${rupees(available)} ${from === 'cash' ? 'cash in hand' : 'in the bank'} now.`}
        </Text>
        <DateField value={moveDate} onChange={setMoveDate} lockReason={lockReason} onLockReason={setLockReason} />
        <Field label="Note" optional hint="For example, deposited at the branch.">
          <TextField label="Note (optional)" value={note} onChange={setNote} />
        </Field>
        <Text className="text-xs leading-5 text-text-secondary">A transfer only moves money between Cash and Bank. Sales, purchases and branch or vendor balances are unchanged.</Text>
      </> : <>
        <DateField value={asOf} onChange={setAsOf} guard={false} />
        <Field label="Cash in hand on that day">
          <TextField label="Cash in hand on that day" value={openCash} onChange={setOpenCash} prefix="₹" keyboardType="decimal-pad" placeholder="0" />
        </Field>
        <Field label="Bank balance on that day (UPI included)" hint="Put a minus sign in front for an overdraft.">
          <TextField label="Bank balance on that day (UPI included)" value={openBank} onChange={setOpenBank} prefix="₹" keyboardType="numeric" placeholder="0" />
        </Field>
        <Text className="text-xs leading-5 text-text-secondary">Count the cash box and check the bank statement at the start of this day. Entries dated on or after it add to or take from these figures; earlier entries are not counted.</Text>
      </>}
      <View className="flex-row flex-wrap gap-2">
        <PrimaryButton label={editor === 'move' ? 'Save transfer' : 'Save opening balances'} loading={busy} disabled={busy || !(editor === 'move' ? moveReady : openingReady)}
          onPress={() => void (editor === 'move'
            ? run(() => moveKitchenMoney(moveDate, from, movePaise, note, requestKey.current, lockReason), from === 'cash' ? 'Cash moved to the bank' : 'Cash withdrawn from the bank')
            : run(() => setKitchenMoneyOpening(asOf, cashPaise, bankPaise), 'Opening balances saved'))} />
        <GhostButton small label="Close" disabled={busy} onPress={() => { setEditor(null); setError(null); }} />
      </View>
    </View>
  </Card> : null;

  const header = <View className="pb-3">
    <KHeader title="Cash & bank" onBack={busy ? undefined : backToKitchen} />
    {loading && !summary ? <ActivityIndicator accessibilityLabel="Loading cash and bank" color={colors.primary} className="my-6" /> : null}
    {error && !editor ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
    {summary ? <>
      <Card>
        <View className="flex-row">
          <View className="min-w-0 flex-1 flex-row items-start gap-2"><Wallet size={18} color={colors.textSecondary} /><StatTile label="Cash in hand" value={summary.cash_paise / 100} tone={summary.cash_paise < 0 ? 'out' : 'neutral'} /></View>
          <Divider vertical />
          <View className="min-w-0 flex-1 flex-row items-start gap-2 pl-3"><Landmark size={18} color={colors.textSecondary} /><StatTile label="Bank · UPI" value={summary.bank_paise / 100} tone={summary.bank_paise < 0 ? 'out' : 'neutral'} /></View>
        </View>
      </Card>
      <View className="mt-1 flex-row flex-wrap items-center" style={{ columnGap: 8 }}>
        <Text className="shrink text-xs leading-5 text-text-secondary">
          {summary.has_opening && summary.as_of
            ? `From the opening on ${historyDateLabel(summary.as_of)}: cash ${rupees(summary.opening_cash_paise)}, bank ${rupees(summary.opening_bank_paise)}${summary.opening_updated_by ? `, set by ${summary.opening_updated_by}` : ''}.`
            : 'Opening balances are not set, so these count every money entry from zero. Set them to match the cash box and the bank.'}
        </Text>
        {mayOpening && !busy && !editor ? <LinkButton label={summary.has_opening ? 'Change' : 'Set opening balances'} onPress={openOpening} /> : null}
      </View>
      {message ? <Text accessibilityRole="alert" className="mt-2 text-sm leading-5" style={{ color: semantic.success }}>{message}</Text> : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        {mayMove ? <PrimaryButton label="Move money" icon={ArrowRightLeft} disabled={busy || !!editor} onPress={openMove} /> : null}
      </View>
      {pane}
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
      ListEmptyComponent={summary ? <Text className="py-3 text-sm leading-5 text-text-secondary">No transfers yet. Use Move money when cash is deposited into the bank or withdrawn from it.</Text> : null}
      renderItem={({ item }) => <View className="min-h-16 flex-row flex-wrap items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2">
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
