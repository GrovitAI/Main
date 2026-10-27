import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { colors, semantic } from '@/lib/pos/brand';
import { formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import { fetchKitchenMoney, moveKitchenMoney, MONEY_LIMIT_PAISE, type MoneyAccount } from '@/lib/pos/kitchen-money-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, SettingsGroup, TextField, useSavedThen } from '@/components/kitchen/ui';
import { isValidDateKey, useDateGuard } from '@/components/kitchen/forms';
import { AmountPad, AmountRow, NoteRow, WhenRow } from '@/components/kitchen/EntryRows';

const rupees = (paise: number) => formatMoney(paise / 100);
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const DIRECTIONS: readonly { value: MoneyAccount; label: string }[] = [
  { value: 'cash', label: 'Cash → Bank' },
  { value: 'bank', label: 'Bank → Cash' },
];

/**
 * Money moved between Cash and Bank (task 286, in the Spent layout): the direction, then rows for
 * the amount, when and a note. On a phone the amount pad comes up when the amount row is tapped.
 * Sales and dues stay the same.
 */
export default function MoneyMoveScreen() {
  const access = useKitchenAccess();
  const phone = !useResponsive().isTablet;
  const [from, setFrom] = useState<MoneyAccount>('cash');
  const [balances, setBalances] = useState<{ cash: number; bank: number } | null>(null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [padOpen, setPadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useSavedThen();
  const key = useRef(newKey());

  useEffect(() => {
    void fetchKitchenMoney().then((res) => { if (res.data) setBalances({ cash: res.data.cash_paise, bank: res.data.bank_paise }); });
  }, []);

  const amount = Math.round(parseAmount(amountText) * 100);
  const available = balances ? balances[from] : 0;
  const dateOk = useDateGuard(date, lockReason);
  const why = amount <= 0 ? 'Enter the amount' : amount > MONEY_LIMIT_PAISE ? 'Check the amount' : !isValidDateKey(date) || !dateOk ? 'Check the date' : undefined;

  const typed = useTypedChanges(JSON.stringify({ amountText: amountText.trim(), note: note.trim() }), null);
  useLeaveGuard(typed && !done.saved, 'The amount you typed');

  const save = async () => {
    if (why || saving) return;
    setSaving(true);
    setError(null);
    const res = await moveKitchenMoney(date, from, amount, note, key.current, lockReason);
    setSaving(false);
    if (res.error) { setError(res.error); buzz('error'); return; }
    done.mark();
    useKitchenStore.getState().setNotice(from === 'cash' ? `${rupees(amount)} moved to the bank` : `${rupees(amount)} withdrawn to cash`);
    done.finish(() => router.back());
  };

  if (!access.can('money.move')) {
    return <KScreen><KHeader title="Move money" onBack={() => router.back()} /><Notice tone="neutral" text="Your login cannot move money." /></KScreen>;
  }

  const saveButton = <PrimaryButton label={amount > 0 ? `Move ${rupees(amount)}` : 'Move'} onPress={() => void save()} disabled={!!why} loading={saving} done={done.saved} reason={why} />;
  const place = from === 'cash' ? 'cash in hand' : 'in the bank';
  const afterLine = balances ? (
    <Text className="mt-1.5 text-xs font-semibold" style={{ color: amount > available ? semantic.warning : colors.textSecondary }}>
      {amount > available ? `More than the ${rupees(available)} ${place} shown here` : `${rupees(available)} ${place}`}
    </Text>
  ) : null;
  const rows = (
    <>
      <SettingsGroup>
        {phone ? <AmountRow amount={amount / 100} open={padOpen} onPress={() => setPadOpen((o) => !o)} /> : null}
        <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
        <NoteRow value={note} onChange={setNote} placeholder="For example, deposited at the branch" />
      </SettingsGroup>
      {phone ? afterLine : null}
    </>
  );
  const footer = phone && padOpen
    ? <AmountPad value={amountText} onChange={setAmountText} onDone={() => setPadOpen(false)} save={why ? undefined : saveButton} />
    : saveButton;

  return (
    <KeyboardAvoider>
      <KScreen footer={footer}>
        <KHeader title="Move money" subtitle="Sales and dues stay the same" onBack={() => router.back()} />
        <View style={{ marginTop: 4, marginBottom: 6 }}>
          <Segmented options={DIRECTIONS} value={from} onChange={setFrom} />
        </View>
        {phone ? rows : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View className="min-w-0 flex-1">{rows}</View>
            <View className="min-w-0 flex-1">
              <Field label="Amount">
                <TextField value={amountText} onChange={setAmountText} label="Amount" placeholder="0" keyboardType="decimal-pad" prefix="₹" big />
                {afterLine}
              </Field>
            </View>
          </View>
        )}
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}
