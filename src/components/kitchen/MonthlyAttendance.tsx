import { ownHover } from '@/lib/pos/web-hover';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Animated, FlatList, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { Empty, GhostButton, Notice, PrimaryButton, SearchBox, SkeletonRows, TextField, useDesktopDensity, useEnterOnChange } from '@/components/kitchen/ui';
import { colors, semantic } from '@/lib/pos/brand';
import { kitchenCalendarDays, kitchenMonthLabel, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { attendanceDateLabel, attendanceMonthCounts, attendanceStaff } from '@/lib/pos/kitchen-attendance-utils';
import { fetchKitchenAttendanceMonth, markKitchenAttendance } from '@/lib/pos/kitchen-attendance-service';
import { ATTENDANCE_OPTIONS } from '@/lib/pos/kitchen-attendance-types';
import type { AttendanceStatus, KitchenAttendanceDay } from '@/lib/pos/kitchen-attendance-types';

const button = 'min-h-12 min-w-12 items-center justify-center rounded-lg border border-transparent hover:bg-surface-tint focus-visible:border-primary active:bg-accent-soft';
const labels: Record<AttendanceStatus, string> = { present: 'Present', absent: 'Absent', half_day: 'Half day', leave: 'Leave', unmarked: 'Unmarked' };
/**
 * Each status fills the day. Present is the one solid fill, so a good month
 * reads green at a glance and exceptions stand out. Absent also carries a
 * border, so it never relies on red against amber alone. Every fill keeps its
 * number at 4.5:1 or better, and the label is always in the accessible name.
 */
const fills: Record<AttendanceStatus, { bg: string; fg: string; border: string }> = {
  present: { bg: semantic.success, fg: colors.textOnPrimary, border: semantic.success },
  absent: { bg: semantic.dangerSoft, fg: semantic.danger, border: semantic.danger },
  half_day: { bg: semantic.warningSoft, fg: semantic.warning, border: semantic.warningSoft },
  leave: { bg: colors.accentSoft, fg: colors.primaryDeep, border: colors.accentSoft },
  unmarked: { bg: semantic.neutralSoft, fg: colors.textSecondary, border: semantic.neutralSoft },
};
const LEGEND: readonly AttendanceStatus[] = ['present', 'absent', 'half_day', 'leave', 'unmarked'];

/** A small key: the day's fill with an outline in its text colour, so pale fills stay visible on any row. */
function Swatch({ status }: { status: AttendanceStatus }) {
  const fill = fills[status];
  return <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: fill.bg, borderWidth: 1, borderColor: status === 'present' ? fill.bg : fill.fg }} />;
}

/** Month reads are on demand; selecting staff, days and drafts is entirely local. */
export function MonthlyAttendance({ header, onLockChange }: { header: ReactElement; onLockChange: (locked: boolean) => void }) {
  const desktop = useDesktopDensity();
  const today = kitchenToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<KitchenAttendanceDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ status: AttendanceStatus; note: string }>({ status: 'unmarked', note: '' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const focused = useRef(false);
  const request = useRef(0);
  const person = data?.staff.find(member => member.id === personId);
  const records = useMemo(() => new Map(data?.attendance.filter(row => row.roster_id === personId).map(row => [row.attendance_date, row]) ?? []), [data, personId]);
  const selected = date ? records.get(date) : undefined;
  const dirty = date !== null && (draft.status !== (selected?.status ?? 'unmarked') || draft.note !== (selected?.note ?? ''));
  const locked = busy || dirty;
  useEffect(() => { onLockChange(locked); return () => onLockChange(false); }, [locked, onLockChange]);
  const load = useCallback(async (): Promise<void> => {
    const version = ++request.current;
    setLoading(true); setError(null); setData(null);
    const result = await fetchKitchenAttendanceMonth(month);
    if (!focused.current || version !== request.current) return;
    setData(result.data); setError(result.error); setLoading(false);
  }, [month]);
  useFocusEffect(useCallback(() => { focused.current = true; void load(); return () => { focused.current = false; request.current++; }; }, [load]));
  const people = useMemo(() => attendanceStaff(data?.staff ?? [], data?.attendance ?? []).filter(member => `${member.name} ${member.job_title}`.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const summaries = useMemo(() => new Map(people.map(member => [member.id, attendanceMonthCounts(member, data?.attendance ?? [], month, today)])), [people, data, month, today]);
  const choosePerson = (id: string | null): void => { if (locked || busyRef.current) return; setPersonId(id); setDate(null); setSaved(null); setError(null); };
  const chooseDate = (next: string): void => {
    if (locked || busyRef.current || !person || next > today || (!person.is_active && !records.has(next))) return;
    const mark = records.get(next);
    setDate(next); setDraft({ status: mark?.status ?? 'unmarked', note: mark?.note ?? '' }); setSaved(null); setError(null);
  };
  const changeMonth = (next: string): void => {
    if (locked || busyRef.current || next > today.slice(0, 7)) return;
    setDate(null); setPersonId(null); setSaved(null); setQuery(''); setMonth(next);
  };
  const save = async (clear = false): Promise<void> => {
    if (busyRef.current || loading || !person || !date) return;
    busyRef.current = true; setBusy(true); setError(null); setSaved(null);
    const result = await markKitchenAttendance({ roster_id: person.id, date, status: clear ? 'unmarked' : draft.status, note: clear ? '' : draft.note });
    if (focused.current) {
      if (result.data) {
        const confirmed = result.data;
        setData(current => current ? { ...current, attendance: [...current.attendance.filter(row => row.roster_id !== confirmed.roster_id || row.attendance_date !== confirmed.attendance_date), confirmed] } : current);
        setDraft({ status: confirmed.status, note: confirmed.note });
        setSaved(`${attendanceDateLabel(confirmed.attendance_date)}: ${labels[confirmed.status]} saved.`);
      } else setError(result.error);
    }
    busyRef.current = false; setBusy(false);
  };
  const feedback = <View className="gap-2">{error ? <Notice text={error} /> : null}{saved ? <Text accessibilityLiveRegion="polite" className="text-sm font-semibold text-primary">{saved}</Text> : null}</View>;
  // Task 215: the month name slides from the side moved to; rows and a person's calendar fade up.
  const monthSlide = useEnterOnChange(month, 'x');
  const rosterEnter = useEnterOnChange(loading ? 'loading' : month);
  const calendarEnter = useEnterOnChange(personId ?? '');
  const toolbar = <View className="gap-2 pb-3">
    {header}
    <View className={`flex-row items-center gap-1 ${desktop ? 'w-[352px]' : ''}`}>
      <Pressable className={button} disabled={locked || loading} accessibilityRole="button" accessibilityLabel="Previous attendance month" onPress={() => changeMonth(shiftKitchenMonth(month, -1))}><ChevronLeft size={18} color={colors.primary} /></Pressable>
      <Animated.View style={[{ flex: 1 }, monthSlide]}><Text accessibilityRole="header" className="text-base font-bold text-text-primary">{kitchenMonthLabel(month)}</Text></Animated.View>
      <Pressable className={button} disabled={locked || loading || month >= today.slice(0, 7)} accessibilityRole="button" accessibilityLabel="Next attendance month" accessibilityState={{ disabled: locked || loading || month >= today.slice(0, 7) }} onPress={() => changeMonth(shiftKitchenMonth(month, 1))}><ChevronRight size={18} color={colors.primary} /></Pressable>
      <Pressable className={button} disabled={locked || loading} accessibilityRole="button" accessibilityLabel="Refresh month attendance" onPress={() => { setDate(null); void load(); }}><RefreshCw size={18} color={colors.primary} /></Pressable>
    </View>
    <Text className="text-xs leading-4 text-text-secondary">Select staff, then a day to mark or correct it. Unmarked is not absent.{month === today.slice(0, 7) ? ` Through ${attendanceDateLabel(today)}.` : ''}</Text>
  </View>;
  const calendar = person ? <Animated.View style={calendarEnter}><View className="gap-2 rounded-xl border border-border-soft bg-surface-elevated p-3">
    <View className="flex-row items-center gap-2">
      {!desktop ? <Pressable className={button} disabled={locked} accessibilityRole="button" accessibilityLabel="Back to month staff" onPress={() => choosePerson(null)}><ArrowLeft size={18} color={colors.primary} /></Pressable> : null}
      <View className="min-w-0 flex-1"><Text accessibilityRole="header" className="text-lg font-bold text-text-primary">{person.name}</Text><Text className="text-xs text-text-secondary">{person.job_title || 'Kitchen staff'}{person.is_active ? '' : ' · Archived'}</Text></View>
    </View>
    <View className="flex-row flex-wrap gap-x-3 gap-y-1">{LEGEND.map(status => <View key={status} className="flex-row items-center gap-1"><Swatch status={status} /><Text className="text-xs text-text-secondary">{labels[status]}</Text></View>)}</View>
    {!person.is_active ? <Text className="text-xs text-text-secondary">Only recorded days can be corrected for archived staff.</Text> : null}
    <View className="flex-row">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <Text key={day} className="flex-1 py-1 text-center text-xs font-semibold text-text-secondary">{day}</Text>)}</View>
    <FlatList data={kitchenCalendarDays(month)} keyExtractor={cell => cell.key} numColumns={7} scrollEnabled={false} renderItem={({ item }) => {
      const day = item.date;
      const status = day ? records.get(day)?.status ?? 'unmarked' : 'unmarked';
      const unavailable = !day || day > today || (!person.is_active && !records.has(day));
      // The whole cell is the target (no gaps between days); the colour sits 2px
      // inside it and the selection ring sits on the cell edge, outside the colour.
      const fill = unavailable ? null : fills[status];
      const chosen = date === day;
      return <View className="flex-1">{day ? <Pressable {...ownHover} testID={`month-attendance-day-${day}`} disabled={unavailable || locked} accessibilityRole="button" accessibilityLabel={`${attendanceDateLabel(day)}: ${unavailable ? 'Unavailable' : labels[status]}`} accessibilityState={{ selected: chosen, disabled: unavailable || locked }} onPress={() => chooseDate(day)}
        style={{ minHeight: 48, padding: 2, borderRadius: 12, borderWidth: 2, borderColor: chosen ? colors.primary : 'transparent' }}>
        {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => <View style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, backgroundColor: fill ? fill.bg : 'transparent', borderColor: fill ? fill.border : 'transparent', opacity: unavailable ? 0.35 : pressed ? 0.7 : hovered && !chosen ? 0.85 : 1 }}>
          <Text style={{ fontSize: 14, fontWeight: day === today ? '800' : '600', color: fill ? fill.fg : colors.textSecondary, textDecorationLine: day === today ? 'underline' : 'none' }}>{Number(day.slice(-2))}</Text>
        </View>}
      </Pressable> : <View className="min-h-12" />}</View>;
    }} />
    {date ? <View className="gap-2 border-t border-border-soft pt-3">
      <Text accessibilityRole="header" className="text-base font-bold text-text-primary">{attendanceDateLabel(date)}</Text>
      <View className="flex-row flex-wrap gap-1">{ATTENDANCE_OPTIONS.map(option => <Pressable key={option.value} disabled={busy} accessibilityRole="button" accessibilityLabel={`Month attendance: ${option.label}`} accessibilityState={{ selected: draft.status === option.value, disabled: busy }} aria-selected={draft.status === option.value} onPress={() => setDraft(current => ({ ...current, status: option.value }))} className={`${draft.status === option.value ? button.replace(' hover:bg-surface-tint', '') : button} flex-1 flex-row gap-1 px-1 ${draft.status === option.value ? 'border-primary bg-accent-soft' : ''}`}><Swatch status={option.value} /><Text className={`text-xs font-semibold ${draft.status === option.value ? 'text-primary' : 'text-text-secondary'}`}>{option.label}</Text></Pressable>)}</View>
      {draft.status === 'half_day' || draft.status === 'leave' ? <TextField flat label="Monthly attendance note" value={draft.note} onChange={note => { if (!busyRef.current) setDraft(current => ({ ...current, note })); }} placeholder="Optional note · up to 200 characters" /> : null}
      {selected ? <Text className="text-xs text-text-secondary">Updated by {selected.updated_by_name} · {new Date(selected.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} IST</Text> : null}
      {dirty ? <Text className="text-xs text-text-secondary">Save or cancel this edit before changing dates.</Text> : null}
      {feedback}
      <View className="flex-row flex-wrap gap-2"><View className="flex-1"><PrimaryButton label="Save day" disabled={!dirty} loading={busy} onPress={() => void save()} /></View><GhostButton label="Cancel edit" disabled={busy} onPress={() => { setDate(null); setError(null); }} /></View>
      {selected && (selected.status !== 'unmarked' || selected.note) ? <GhostButton label="Clear attendance day" disabled={busy} onPress={() => void save(true)} /> : null}
    </View> : <Text className="py-2 text-sm text-text-secondary">Choose a day in the calendar.</Text>}
    {!date ? feedback : null}
  </View></Animated.View> : <Empty title="Select a staff member" body="Their month calendar and attendance totals will appear here." />;
  const rosterHeader = <View className="gap-2 pb-2"><SearchBox value={query} onChange={setQuery} placeholder="Search month staff" /><Text className="text-xs text-text-secondary">{people.length} staff</Text></View>;
  const empty = loading ? <SkeletonRows count={4} height={64} label="Loading month attendance" /> : error && !data ? <Empty title="Month unavailable" body="Retry to load the complete month." action={<GhostButton label="Retry month attendance" onPress={() => void load()} />} /> : <Empty title={query ? 'No matching staff' : 'No staff in this month'} body={query ? 'Try another name or role.' : 'Add kitchen staff using Add staff.'} action={query ? <GhostButton label="Reset month search" onPress={() => setQuery('')} /> : undefined} />;
  const roster = <FlatList className="flex-1" keyboardShouldPersistTaps="handled" data={loading ? [] : people} keyExtractor={member => member.id} extraData={{ personId, locked, summaries }} ListHeaderComponent={rosterHeader} ListEmptyComponent={empty} renderItem={({ item }) => {
    const counts = summaries.get(item.id);
    return <Animated.View style={rosterEnter}><Pressable testID={`month-staff-${item.id}`} disabled={locked} accessibilityRole="button" accessibilityLabel={`Month attendance for ${item.name}`} accessibilityState={{ selected: item.id === personId, disabled: locked }} onPress={() => choosePerson(item.id)} className={`min-h-12 gap-1 border-b border-border-soft px-3 py-3 focus-visible:border-primary ${item.id === personId ? 'bg-accent-soft' : 'bg-surface-elevated hover:bg-surface-tint active:bg-accent-soft'}`}><Text className="text-base font-semibold text-text-primary">{item.name}</Text><Text className="text-xs text-text-secondary">{item.job_title || 'Kitchen staff'}{item.is_active ? '' : ' · Archived'}</Text>{counts ? <View className="flex-row flex-wrap gap-x-3 gap-y-1">{LEGEND.map(status => <View key={status} className="flex-row items-center gap-1"><Swatch status={status} /><Text className="text-xs text-text-secondary">{labels[status]} <Text className="font-semibold text-text-primary">{counts[status]}</Text></Text></View>)}</View> : null}</Pressable></Animated.View>;
  }} />;
  return <View className="w-full max-w-[1120px] flex-1 self-center px-4 pb-6">
    {desktop ? <>{toolbar}{!person ? feedback : null}<View className="min-h-0 flex-1 flex-row gap-4"><View className="w-[352px]">{roster}</View><FlatList className="min-w-0 flex-1" data={[]} renderItem={() => null} ListHeaderComponent={loading ? null : calendar} keyboardShouldPersistTaps="handled" /></View></> : person && !loading ? <FlatList data={[]} renderItem={() => null} ListHeaderComponent={<>{toolbar}{calendar}</>} keyboardShouldPersistTaps="handled" /> : <View className="flex-1">{toolbar}{feedback}{roster}</View>}
  </View>;
}
