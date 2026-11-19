import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { Empty, Notice, PrimaryButton, Row, SearchBox, Sheet, SkeletonRows, TextField, useDesktopDensity } from '@/components/kitchen/ui';
import { colors, semantic } from '@/lib/pos/brand';
import { kitchenMonthLabel, kitchenMonthRange, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { cleanTypedNumber, formatMoney, matchesSearch } from '@/lib/pos/kitchen-utils';
import { fetchKitchenSalaryMonth, setKitchenStaffSalary } from '@/lib/pos/kitchen-salary-service';
import { PAID_OFFS_PER_MONTH, SALARY_DAY_BASIS, salaryDays, salaryFigures, type SalaryFigures, type SalaryMonth as Month, type SalaryPerson } from '@/lib/pos/kitchen-salary-utils';

const control = 'min-h-12 min-w-12 flex-row items-center justify-center gap-2 rounded-xl px-3 hover:bg-accent-soft active:opacity-60 web:focus-visible:border web:focus-visible:border-primary';
const tabular = { fontVariant: ['tabular-nums' as const] };
const half = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));
type Line = { person: SalaryPerson; f: SalaryFigures };

/** Only what differs from a full month: leave beyond the paid offs, half days, absences, days not marked. */
function exceptions({ person: p, f }: Line): string {
  return [
    p.leave ? `Leave ${p.leave}${f.unpaidOffs ? ` (${f.unpaidOffs} unpaid)` : ''}` : '',
    p.halfDay ? `Half day ${p.halfDay}` : '',
    p.absent ? `Absent ${p.absent}` : '',
    f.unmarked ? `${f.unmarked} not marked` : '',
  ].filter(Boolean).join(' · ');
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl border border-border-soft bg-surface-elevated px-3.5 py-3">
      <Text className="text-xs font-bold text-text-secondary" numberOfLines={1}>{label}</Text>
      <Text className="mt-0.5 text-xl font-extrabold" style={{ ...tabular, color: tone ?? colors.textPrimary }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

/**
 * Task 327: each person's salary for a month from the attendance. Salary ÷ 30 a day; two days of
 * Leave are paid offs; a half day is half; Absent, further leave and days not marked are unpaid.
 * The month's Salary advance and Salaries payments for the person come off in full.
 */
export function SalaryMonth({ header, mayEdit }: { header: ReactElement; mayEdit: boolean }) {
  const desktop = useDesktopDensity();
  const today = kitchenToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<Month | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<SalaryPerson | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const range = kitchenMonthRange(month);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    void fetchKitchenSalaryMonth(range.startDate, range.endDate).then((res) => {
      if (!live) return;
      setLoading(false);
      setError(res.error);
      setData(res.data);
    });
    return () => { live = false; };
  }, [range.startDate, range.endDate, refresh]);
  // Advances and attendance change on other screens.
  useFocusEffect(useCallback(() => { setRefresh((n) => n + 1); }, []));

  const days = salaryDays(range.startDate, range.endDate, today);
  const lines = useMemo<Line[]>(() => (data?.staff ?? [])
    .filter((p) => matchesSearch(query, p.name, p.jobTitle))
    .map((person) => ({ person, f: salaryFigures(person, days) })), [data, query, days]);
  const totals = useMemo(() => lines.reduce((t, l) => ({
    earned: t.earned + (l.f.earned ?? 0), advances: t.advances + l.person.advances, paid: t.paid + l.person.paid, due: t.due + (l.f.due ?? 0),
  }), { earned: 0, advances: 0, paid: 0, due: 0 }), [lines]);
  const unset = lines.filter((l) => l.person.monthlySalary === null).length;

  const startEdit = (p: SalaryPerson) => { if (!mayEdit) return; setEditing(p); setAmount(p.monthlySalary === null ? '' : String(p.monthlySalary)); setSaveError(null); };
  const typed = Number(amount);
  const changed = !!editing && amount.trim() !== '' && Number.isFinite(typed) && typed !== editing.monthlySalary;
  const save = async () => {
    if (!editing || !changed || saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await setKitchenStaffSalary(editing.rosterId, typed);
    setSaving(false);
    if (res.error) { setSaveError(res.error); return; }
    setEditing(null);
    setRefresh((n) => n + 1);
  };

  const controls = (
    <View className="gap-3 pb-3 pt-2">
      <View className="flex-row flex-wrap items-center gap-1">
        <Pressable onPress={() => setMonth(shiftKitchenMonth(month, -1))} accessibilityRole="button" accessibilityLabel="Previous month" className={control}><ChevronLeft size={18} color={colors.primary} /></Pressable>
        <Text className="min-w-[132px] text-center text-sm font-bold text-text-primary">{kitchenMonthLabel(month)}</Text>
        <Pressable onPress={() => setMonth(shiftKitchenMonth(month, 1))} disabled={month >= today.slice(0, 7)} accessibilityRole="button" accessibilityLabel="Next month"
          accessibilityState={{ disabled: month >= today.slice(0, 7) }} className={control + (month >= today.slice(0, 7) ? ' opacity-40' : '')}><ChevronRight size={18} color={colors.primary} /></Pressable>
        <Pressable onPress={() => setRefresh((n) => n + 1)} accessibilityRole="button" accessibilityLabel="Refresh salaries" className={control}><RefreshCw size={16} color={colors.primary} /></Pressable>
        {desktop ? <View className="ml-auto w-[320px]"><SearchBox value={query} onChange={setQuery} placeholder="Search staff" /></View> : null}
      </View>
      {desktop ? null : <SearchBox value={query} onChange={setQuery} placeholder="Search staff" />}
      {data ? (
        <View className={desktop ? 'flex-row gap-3' : 'gap-2.5'}>
          <View className="flex-1 flex-row gap-2.5"><Tile label="Earned" value={formatMoney(totals.earned)} /><Tile label="Advances" value={formatMoney(totals.advances)} /></View>
          <View className="flex-1 flex-row gap-2.5"><Tile label="Paid" value={formatMoney(totals.paid)} /><Tile label="To pay" value={formatMoney(totals.due)} tone={totals.due > 0 ? semantic.warning : undefined} /></View>
        </View>
      ) : null}
      <Text className="text-xs font-semibold text-text-secondary">
        Day = salary ÷ {SALARY_DAY_BASIS} · {PAID_OFFS_PER_MONTH} leave days paid · half day ½ · advances come off in full{days < 31 && month === today.slice(0, 7) ? ` · up to today (${days} days)` : ''}
      </Text>
      {error ? <Notice text={error} /> : null}
      {unset > 0 && mayEdit ? <Notice tone="neutral" text={`${unset} without a salary. Tap a name to set it.`} /> : null}
      {data && data.unassignedPaid > 0 ? <Notice tone="neutral" text={`${formatMoney(data.unassignedPaid)} of Salaries paid without a name.`} /> : null}
      {desktop && lines.length > 0 ? (
        <View className="flex-row items-center gap-3 border-y border-border-soft bg-surface-tint px-3 py-2">
          <Text className="min-w-0 flex-1 text-xs font-bold text-text-secondary">Staff</Text>
          {['Salary', 'Days paid', 'Earned', 'Advances', 'Paid', 'To pay'].map((h) => <Text key={h} className="w-24 text-right text-xs font-bold text-text-secondary">{h}</Text>)}
        </View>
      ) : null}
    </View>
  );

  const money = (n: number | null) => (n === null ? '—' : formatMoney(n));
  return (
    <>
      <FlatList
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 1120, alignSelf: 'center' }}
        data={loading && !data ? [] : lines}
        keyExtractor={(l) => l.person.rosterId}
        ListHeaderComponent={<>{header}{controls}</>}
        refreshing={loading && data !== null}
        onRefresh={() => setRefresh((n) => n + 1)}
        ListEmptyComponent={loading ? <SkeletonRows count={4} height={56} label="Loading salaries" /> : error ? null : <Empty title={query ? 'No matching staff' : 'No staff yet'} body={query ? undefined : 'Add kitchen staff under Staff.'} />}
        renderItem={({ item: l }) => {
          const label = `${l.person.name}, ${l.f.due === null ? 'no salary set' : `${formatMoney(l.f.due)} to pay`}${mayEdit ? '. Opens the salary' : ''}`;
          const note = exceptions(l);
          return desktop ? (
            <Pressable onPress={() => startEdit(l.person)} disabled={!mayEdit} accessibilityRole={mayEdit ? 'button' : undefined} accessibilityLabel={label}
              className={`min-h-[52px] flex-row items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2 ${mayEdit ? 'hover:bg-surface-tint active:bg-surface-tint' : ''}`}>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-text-primary" numberOfLines={1}>{l.person.name}{l.person.isActive ? '' : ' (archived)'}</Text>
                {note ? <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{note}</Text> : null}
              </View>
              <Text className="w-24 text-right text-sm font-semibold text-text-secondary" style={tabular}>{l.person.monthlySalary === null ? (mayEdit ? 'Set' : '—') : formatMoney(l.person.monthlySalary)}</Text>
              <Text className="w-24 text-right text-sm font-semibold text-text-secondary" style={tabular}>{half(l.f.payableDays)} of {l.f.days}</Text>
              <Text className="w-24 text-right text-sm font-semibold text-text-primary" style={tabular}>{money(l.f.earned)}</Text>
              <Text className="w-24 text-right text-sm font-semibold text-text-secondary" style={tabular}>{l.person.advances ? formatMoney(l.person.advances) : '—'}</Text>
              <Text className="w-24 text-right text-sm font-semibold text-text-secondary" style={tabular}>{l.person.paid ? formatMoney(l.person.paid) : '—'}</Text>
              <Text className="w-24 text-right text-sm font-extrabold" style={{ ...tabular, color: l.f.due !== null && l.f.due < 0 ? semantic.danger : colors.textPrimary }}>{money(l.f.due)}</Text>
            </Pressable>
          ) : (
            <Row title={l.person.name + (l.person.isActive ? '' : ' (archived)')}
              subtitle={[l.person.monthlySalary === null ? 'No salary set' : `${half(l.f.payableDays)} of ${l.f.days} days · earned ${formatMoney(l.f.earned ?? 0)}`, note].filter(Boolean).join(' · ')}
              right={l.f.due === null ? undefined : formatMoney(Math.abs(l.f.due))}
              rightSub={l.f.due === null ? (mayEdit ? 'Set salary' : undefined) : l.f.due < 0 ? 'paid ahead' : 'to pay'}
              onPress={mayEdit ? () => startEdit(l.person) : undefined} accessibilityLabel={label} />
          );
        }}
      />
      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing ? `Monthly salary · ${editing.name}` : 'Monthly salary'} dirty={changed}>
        <TextField label="Monthly salary" value={amount} onChange={(t) => setAmount(cleanTypedNumber(t, 2))} keyboardType="decimal-pad" prefix="₹" big autoFocus placeholder="0" />
        {editing && typed > 0 ? <Text className="mt-2 text-xs font-semibold text-text-secondary">{formatMoney(typed / SALARY_DAY_BASIS)} a day</Text> : null}
        {saveError ? <Notice text={saveError} /> : null}
        <View className="mt-4"><PrimaryButton label="Save" onPress={() => void save()} disabled={!changed} loading={saving} reason={changed ? undefined : 'Enter the salary'} /></View>
      </Sheet>
    </>
  );
}
