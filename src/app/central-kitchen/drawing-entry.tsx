import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import { kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { fetchDrawings, recordDrawing, type DrawingKind, type DrawingOwner } from '@/lib/pos/kitchen-drawings-service';
import { fetchKitchenMoney, type MoneyAccount } from '@/lib/pos/kitchen-money-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { useResponsive } from '@/lib/pos/useResponsive';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { Avatar, Card, Empty, Field, KHeader, KScreen, Notice, PrimaryButton, Segmented, SelectRow, SettingsGroup, SkeletonRows, TextField, ValueRow, useSavedThen } from '@/components/kitchen/ui';
import { isValidDateKey } from '@/components/kitchen/forms';
import { AmountPad, AmountRow, NoteRow, WhenRow, WhoRow } from '@/components/kitchen/EntryRows';
import { NameSearch } from '@/components/kitchen/SpendFields';

const KINDS: readonly { value: DrawingKind; label: string }[] = [
  { value: 'spend', label: 'Spend' },
  { value: 'in', label: 'Add money' },
  { value: 'back', label: 'Put back' },
];
const rupees = (paise: number) => formatMoney(paise / 100);
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * An owner's drawings entry (task 285, in the Spent page's layout): Spend starts from what it was
 * for (the reasons used most as round circles, or a new one typed), then rows for the owner, the
 * amount, when and a note. Add money and Put back ask which account instead. On a phone the
 * amount is a row and the number pad comes up only when it is tapped.
 */
export default function DrawingEntryScreen() {
  const access = useKitchenAccess();
  const params = useLocalSearchParams<{ kind?: string; owner?: string }>();
  const phone = !useResponsive().isTablet;
  const [kind, setKind] = useState<DrawingKind>(params.kind === 'in' || params.kind === 'back' ? params.kind : 'spend');
  const [owners, setOwners] = useState<DrawingOwner[] | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [cash, setCash] = useState<{ cash: number; bank: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(params.owner ?? null);
  const [account, setAccount] = useState<MoneyAccount>('cash');
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState<string | null>(null);
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
    if (!access.isOwner) return;
    void Promise.all([fetchDrawings(kitchenToday().slice(0, 7)), fetchKitchenMoney()]).then(([d, m]) => {
      setLoadError(d.error);
      if (d.data) { setOwners(d.data.owners); setReasons(d.data.categories); }
      if (m.data) setCash({ cash: m.data.cash_paise, bank: m.data.bank_paise });
    });
  }, [access.isOwner]);

  const owner = owners?.find((o) => o.id === ownerId) ?? null;
  const amount = Math.round(parseAmount(amountText) * 100);
  const available = kind === 'in' ? (cash ? cash[account] : 0) : owner?.left_paise ?? 0;
  const why = !owner ? 'Choose the owner'
    : kind === 'spend' && !reason ? 'Choose what for'
    : amount <= 0 ? 'Enter the amount'
    : amount > available ? (kind === 'in' ? `More than ${account === 'cash' ? 'cash in hand' : 'in the bank'}` : 'More than is left')
    : !isValidDateKey(date) ? 'Check the date' : undefined;

  const typed = useTypedChanges(JSON.stringify({ amountText: amountText.trim(), note: note.trim(), reason: reason ?? query.trim() }), null);
  useLeaveGuard(typed && !done.saved, 'What you entered');

  const save = async () => {
    if (why || !owner || saving) return;
    setSaving(true);
    setError(null);
    const res = await recordDrawing({ owner_id: owner.id, kind, amount_paise: amount, draw_date: date, account, category: kind === 'spend' ? reason : null, note, request_key: key.current });
    setSaving(false);
    if (res.error) { setError(res.error); buzz('error'); return; }
    done.mark();
    useKitchenStore.getState().setNotice(kind === 'spend' ? `${reason ?? 'Spent'} · ${rupees(amount)}` : kind === 'in' ? `${rupees(amount)} into ${owner.name}’s drawings` : `${rupees(amount)} put back`);
    done.finish(() => router.back());
  };

  if (!access.isOwner) {
    return <KScreen><KHeader title="Drawings" onBack={() => router.back()} /><Card><Empty title="Only the owners can see drawings" /></Card></KScreen>;
  }

  const saveButton = <PrimaryButton label={amount > 0 ? `Save · ${rupees(amount)}` : 'Save'} onPress={() => void save()} disabled={!!why} loading={saving} done={done.saved} reason={why} />;
  const afterLine = owner && amount > 0 ? (
    <Text className="mt-1.5 text-xs font-semibold text-text-secondary">
      {kind === 'in' ? `${rupees(Math.max(0, available - amount))} left ${account === 'cash' ? 'in cash' : 'in the bank'} after this` : `${rupees(Math.max(0, available - amount))} left in drawings after this`}
    </Text>
  ) : null;
  const sub = owner ? `${rupees(owner.left_paise)} left` : undefined;
  // Money in shows what each account holds; a move back does not need it.
  const accounts: { value: MoneyAccount; label: string }[] = [
    { value: 'cash', label: kind === 'in' && cash ? `Cash · ${rupees(cash.cash)}` : 'Cash' },
    { value: 'bank', label: kind === 'in' && cash ? `Bank · ${rupees(cash.bank)}` : 'Bank' },
  ];

  const ownerPicker = (
    <Field label="Owner">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {(owners ?? []).map((o) => (
          <Pressable key={o.id} onPress={() => setOwnerId(o.id)} accessibilityRole="button" accessibilityLabel={`${o.name}, ${rupees(o.left_paise)} left`}
            className="w-[76px] items-center gap-1 rounded-2xl py-1.5 hover:bg-surface-tint active:bg-surface-tint">
            <Avatar name={o.name} size={52} ring={false} />
            <Text className="text-xs font-bold text-text-primary" numberOfLines={1}>{o.name}</Text>
            <Text className="text-[11px] font-semibold text-text-secondary" numberOfLines={1}>{rupees(o.left_paise)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Field>
  );

  const rows = (
    <>
      <SettingsGroup>
        {kind === 'spend' && reason ? (
          <ValueRow label={reason} value="Change" onPress={() => { setQuery(reason); setReason(null); }} lead={<Avatar name={reason} toneKey={reason} size={36} ring={false} />} />
        ) : null}
        {owner ? <WhoRow name={owner.name} sub={sub} onChange={() => setOwnerId(null)} /> : null}
        {phone ? <AmountRow amount={amount / 100} open={padOpen} onPress={() => setPadOpen((o) => !o)} /> : null}
        {kind === 'spend' ? null : <SelectRow label={kind === 'in' ? 'From' : 'To'} value={account} options={accounts} onChange={setAccount} />}
        <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} guard={false} />
        <NoteRow value={note} onChange={setNote} placeholder="Anything to remember" />
      </SettingsGroup>
      {phone ? afterLine : null}
    </>
  );

  // What comes first: the owner if none is chosen, then (for a spending) what it was for.
  const body = !owners ? <SkeletonRows count={3} label="Loading drawings" />
    : !owner ? ownerPicker
    : kind === 'spend' && !reason ? (
      <>
        <SettingsGroup><WhoRow name={owner.name} sub={sub} onChange={() => setOwnerId(null)} /></SettingsGroup>
        <Field label="What for">
          <NameSearch names={reasons} query={query} onQuery={setQuery} onPick={(n) => { setReason(n.trim()); setQuery(''); }} placeholder="Fuel, personal, food…" />
        </Field>
      </>
    ) : rows;
  const ready = !!owner && (kind !== 'spend' || !!reason);

  const footer = phone && padOpen && ready
    ? <AmountPad value={amountText} onChange={setAmountText} onDone={() => setPadOpen(false)} save={why ? undefined : saveButton} />
    : saveButton;

  return (
    <KeyboardAvoider>
      <KScreen footer={footer}>
        <KHeader title={KINDS.find((k) => k.value === kind)?.label ?? 'Drawings'} subtitle="Drawings" onBack={() => router.back()} />
        <View style={{ marginTop: 4, marginBottom: 6 }}>
          <Segmented options={KINDS} value={kind} onChange={(k) => { setKind(k); setPadOpen(false); }} />
        </View>
        {loadError ? <Notice text={loadError} /> : null}
        {phone || !ready ? body : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View className="min-w-0 flex-1">{body}</View>
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
