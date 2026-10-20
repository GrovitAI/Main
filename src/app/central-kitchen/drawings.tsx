import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, Minus } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { chart, colors, semantic } from '@/lib/pos/brand';
import { confirmAction } from '@/lib/pos/dialogs';
import { formatMoney, localDateKey, parseAmount } from '@/lib/pos/kitchen-utils';
import { historyDateLabel } from '@/lib/pos/kitchen-history-utils';
import { kitchenMonthLabel, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { fetchDrawings, recordDrawing, voidDrawing, type DrawingKind, type DrawingOwner, type DrawingRow, type DrawingsSummary } from '@/lib/pos/kitchen-drawings-service';
import { fetchKitchenMoney, type MoneyAccount } from '@/lib/pos/kitchen-money-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { Avatar, Card, Chips, Empty, Field, KHeader, KScreen, LinkButton, Notice, PrimaryButton, Segmented, SettingsGroup, Sheet, SkeletonRows, TextField, ValueRow } from '@/components/kitchen/ui';
import { DateField, isValidDateKey } from '@/components/kitchen/forms';

const SHARE_COLORS = [chart.series3, chart.series2, colors.primary, semantic.warning] as const;
const rupees = (paise: number) => formatMoney(paise / 100);
const tabular = { fontVariant: ['tabular-nums' as const] };
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
type SheetKind = { kind: DrawingKind; ownerId: string | null } | null;

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
  const [cash, setCash] = useState<{ cash: number; bank: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'spend' | 'in'>('spend');
  const [sheet, setSheet] = useState<SheetKind>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, m] = await Promise.all([fetchDrawings(month), fetchKitchenMoney()]);
    setLoading(false);
    setError(d.error);
    if (d.data) setData(d.data);
    if (m.data) setCash({ cash: m.data.cash_paise, bank: m.data.bank_paise });
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
      <View className="items-start"><LinkButton label="Add money from Cash or Bank" onPress={() => setSheet({ kind: 'in', ownerId: null })} /></View>
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
        <LinkButton label="Add money" onPress={() => setSheet({ kind: 'in', ownerId: owner.id })} />
        {owner.left_paise > 0 ? <LinkButton label="Put back" onPress={() => setSheet({ kind: 'back', ownerId: owner.id })} /> : null}
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
    ? <PrimaryButton label="Spend" icon={Minus} onPress={() => setSheet({ kind: 'spend', ownerId: owner.id })} />
    : undefined;

  const sheets = (
    <DrawingSheet key={sheet ? `${sheet.kind}-${sheet.ownerId ?? 'any'}` : 'closed'} sheet={sheet} owners={owners} cash={cash} categories={data?.categories ?? []}
      onClose={() => setSheet(null)} onSaved={(text) => { setSheet(null); useKitchenStore.getState().setNotice(text); void load(); }} />
  );

  if (phone) {
    return (
      <KeyboardAvoider>
        <KScreen footer={owner ? spendButton : undefined} refreshing={loading && !!data} onRefresh={() => void load()}>
          <KHeader title={owner ? owner.name : 'Drawings'} subtitle={owner ? 'Drawings' : 'Owners only'} onBack={() => (owner ? setOpenId(null) : router.back())} />
          {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
          {loading && !data ? <SkeletonRows count={3} label="Loading drawings" /> : owner ? ownerPage : overview}
        </KScreen>
        {sheets}
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
      {sheets}
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

/** One sheet for money in, a spending and a move back; what it asks depends on which. */
function DrawingSheet({ sheet, owners, cash, categories, onClose, onSaved }: {
  sheet: SheetKind; owners: readonly DrawingOwner[]; cash: { cash: number; bank: number } | null; categories: readonly string[];
  onClose: () => void; onSaved: (notice: string) => void;
}) {
  const [ownerId, setOwnerId] = useState<string | null>(sheet?.ownerId ?? null);
  const [account, setAccount] = useState<MoneyAccount>('cash');
  const [category, setCategory] = useState<string>('');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());
  if (!sheet) return null;
  const owner = owners.find((o) => o.id === ownerId) ?? null;
  const amount = Math.round(parseAmount(amountText) * 100);
  const available = sheet.kind === 'in' ? (cash ? cash[account] : 0) : owner?.left_paise ?? 0;
  const over = amount > available;
  const title = sheet.kind === 'spend' ? 'Spend' : sheet.kind === 'in' ? 'Add money' : 'Put back';
  const reason = !owner ? 'Choose the owner' : sheet.kind === 'spend' && !category.trim() ? 'Choose what for' : amount <= 0 ? 'Enter the amount'
    : over ? (sheet.kind === 'in' ? `More than ${account === 'cash' ? 'cash in hand' : 'in the bank'}` : 'More than is left') : !isValidDateKey(date) ? 'Check the date' : undefined;
  const save = async () => {
    if (reason || !owner) return;
    setSaving(true);
    setError(null);
    const res = await recordDrawing({ owner_id: owner.id, kind: sheet.kind, amount_paise: amount, draw_date: date, account, category, note, request_key: key.current });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    onSaved(sheet.kind === 'spend' ? `${category.trim()} · ${rupees(amount)}` : sheet.kind === 'in' ? `${rupees(amount)} into ${owner.name}’s drawings` : `${rupees(amount)} put back`);
  };
  const catOptions = categoryOptions(categories, category);
  return (
    <Sheet visible onClose={onClose} title={title} dirty={amountText.trim().length > 0}>
      {sheet.ownerId && owner ? (
        <Text className="mb-1 text-[13px] font-semibold text-text-secondary">{sheet.kind === 'in' ? `Into ${owner.name}’s drawings` : `${owner.name} · ${rupees(owner.left_paise)} left`}</Text>
      ) : (
        <Field label="For">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {owners.map((o) => (
              <Pressable key={o.id} onPress={() => setOwnerId(o.id)} accessibilityRole="button" aria-selected={o.id === ownerId} accessibilityLabel={o.name} className="w-[70px] items-center gap-1 py-1">
                <Avatar name={o.name} size={46} selected={o.id === ownerId} />
                <Text className={`text-xs ${o.id === ownerId ? 'font-extrabold text-primary' : 'font-semibold text-text-secondary'}`} numberOfLines={1}>{o.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Field>
      )}
      {sheet.kind === 'spend' ? (
        <Field label="What for">
          <Chips options={catOptions} value={category || null} onChange={(c) => setCategory(c)} />
          <View className="mt-2"><TextField label="What for" value={category} onChange={setCategory} placeholder="Fuel, personal, food…" /></View>
        </Field>
      ) : (
        <Field label={sheet.kind === 'in' ? 'From' : 'To'}>
          <Segmented options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }]} value={account} onChange={setAccount} />
        </Field>
      )}
      <Field label="Amount" hint={sheet.kind === 'in' && cash ? `${rupees(available)} ${account === 'cash' ? 'in cash' : 'in the bank'}` : undefined}>
        <TextField label="Amount" value={amountText} onChange={setAmountText} prefix="₹" keyboardType="decimal-pad" big />
      </Field>
      <DateField value={date} onChange={setDate} guard={false} />
      <Field label="Note" optional><TextField label="Note (optional)" value={note} onChange={setNote} /></Field>
      {error ? <Notice text={error} /> : null}
      <View className="mt-4"><PrimaryButton label={amount > 0 ? `Save · ${rupees(amount)}` : 'Save'} onPress={() => void save()} loading={saving} disabled={!!reason} reason={reason} /></View>
    </Sheet>
  );
}

/** The categories used before, as equal chips; a typed new one joins them. */
function categoryOptions(categories: readonly string[], typed: string): { value: string; label: string }[] {
  const list = [...categories];
  const t = typed.trim();
  if (t && !list.some((c) => c.toLocaleLowerCase() === t.toLocaleLowerCase())) list.unshift(t);
  return list.slice(0, 12).map((c) => ({ value: c, label: c }));
}
