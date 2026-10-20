import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import { fetchKitchenMoney, setKitchenMoneyOpening, MONEY_LIMIT_PAISE } from '@/lib/pos/kitchen-money-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { Field, KHeader, KScreen, Notice, PrimaryButton, SettingsGroup, SkeletonRows, TextField, Toggle, useSavedThen } from '@/components/kitchen/ui';
import { isValidDateKey } from '@/components/kitchen/forms';
import { AmountPad, AmountRow, WhenRow } from '@/components/kitchen/EntryRows';

type Which = 'cash' | 'bank';
const paiseOf = (text: string) => Math.round(parseAmount(text) * 100);
const LABEL: Record<Which, string> = { cash: 'Cash in hand', bank: 'Bank · UPI' };

/**
 * The opening cash and bank (task 286, in the Spent layout): the day they were counted, then the
 * two amounts as rows; on a phone a tap on either opens the number pad for that one. A bank
 * overdraft is a switch rather than a minus sign.
 */
export default function MoneyOpeningScreen() {
  const access = useKitchenAccess();
  const phone = !useResponsive().isTablet;
  const [loaded, setLoaded] = useState(false);
  const [asOf, setAsOf] = useState(localDateKey());
  const [cashText, setCashText] = useState('');
  const [bankText, setBankText] = useState('');
  const [overdrawn, setOverdrawn] = useState(false);
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const [pad, setPad] = useState<Which | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useSavedThen();

  // Changing the opening starts from what is saved.
  useEffect(() => {
    void fetchKitchenMoney().then((res) => {
      const s = res.data;
      if (s?.has_opening) {
        setAsOf(s.as_of ?? localDateKey());
        setCashText(String(s.opening_cash_paise / 100));
        setBankText(String(Math.abs(s.opening_bank_paise) / 100));
        setOverdrawn(s.opening_bank_paise < 0);
      }
      setStartedFrom('saved');
      setLoaded(true);
    });
  }, []);

  const cash = paiseOf(cashText);
  const bank = paiseOf(bankText) * (overdrawn ? -1 : 1);
  const why = cashText.trim() === '' ? 'Enter the cash in hand' : bankText.trim() === '' ? 'Enter the bank balance'
    : cash > MONEY_LIMIT_PAISE || Math.abs(bank) > MONEY_LIMIT_PAISE ? 'Check the amounts'
    : !isValidDateKey(asOf) || asOf > localDateKey() ? 'Check the date' : undefined;

  const typed = useTypedChanges(JSON.stringify({ cashText, bankText, overdrawn, asOf }), startedFrom);
  useLeaveGuard(typed && !done.saved, 'The balances you typed');

  const save = async () => {
    if (why || saving) return;
    setSaving(true);
    setError(null);
    const res = await setKitchenMoneyOpening(asOf, cash, bank);
    setSaving(false);
    if (res.error) { setError(res.error); buzz('error'); return; }
    done.mark();
    useKitchenStore.getState().setNotice('Opening balances saved');
    done.finish(() => router.back());
  };

  if (!access.can('money.opening')) {
    return <KScreen><KHeader title="Opening balances" onBack={() => router.back()} /><Notice tone="neutral" text="Your login cannot set opening balances." /></KScreen>;
  }

  const saveButton = <PrimaryButton label="Save" onPress={() => void save()} disabled={!!why} loading={saving} done={done.saved} reason={why} />;
  const rows = (
    <SettingsGroup>
      <WhenRow label="Counted on" date={asOf} onChange={setAsOf} lockReason="" onLockReason={() => undefined} guard={false} />
      {phone ? <AmountRow label={LABEL.cash} entered={cashText.trim() !== ''} amount={cash / 100} open={pad === 'cash'} onPress={() => setPad((p) => (p === 'cash' ? null : 'cash'))} /> : null}
      {phone ? <AmountRow label={LABEL.bank} entered={bankText.trim() !== ''} amount={paiseOf(bankText) / 100} open={pad === 'bank'} onPress={() => setPad((p) => (p === 'bank' ? null : 'bank'))} /> : null}
      <Toggle label="Bank overdrawn" on={overdrawn} onChange={setOverdrawn} />
    </SettingsGroup>
  );
  const footer = phone && pad
    ? <AmountPad key={pad} label={LABEL[pad]} value={pad === 'cash' ? cashText : bankText} onChange={pad === 'cash' ? setCashText : setBankText}
        onDone={() => setPad(null)} save={why ? undefined : saveButton} />
    : saveButton;

  return (
    <KeyboardAvoider>
      <KScreen footer={loaded ? footer : undefined}>
        <KHeader title="Opening balances" subtitle="Counted at the start of the day" onBack={() => router.back()} />
        {!loaded ? <SkeletonRows count={3} label="Loading balances" /> : phone ? rows : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View className="min-w-0 flex-1">{rows}</View>
            <View className="min-w-0 flex-1" style={{ gap: 10 }}>
              <Field label={LABEL.cash}>
                <TextField value={cashText} onChange={setCashText} label={LABEL.cash} placeholder="0" keyboardType="decimal-pad" prefix="₹" big />
              </Field>
              <Field label={LABEL.bank}>
                <TextField value={bankText} onChange={setBankText} label={LABEL.bank} placeholder="0" keyboardType="decimal-pad" prefix={overdrawn ? '−₹' : '₹'} big />
              </Field>
            </View>
          </View>
        )}
        {loaded && overdrawn && bankText.trim() ? <Text className="mt-1.5 text-xs font-semibold text-text-secondary">Bank starts at −{formatMoney(Math.abs(bank) / 100)}</Text> : null}
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
    </KeyboardAvoider>
  );
}
