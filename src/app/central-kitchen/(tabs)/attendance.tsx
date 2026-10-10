import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Check, ChevronDown, MessageSquareText, Pencil, Plus, RefreshCw, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { AttendanceDate } from '@/components/kitchen/AttendanceDate';
import { Empty, GhostButton, IconButton, KScreen, Notice, PrimaryButton, SearchBox, Segmented, TextField, useDesktopDensity } from '@/components/kitchen/ui';
import { colors } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { attendanceCounts, attendanceStaff } from '@/lib/pos/kitchen-attendance-utils';
import { fetchKitchenAttendance, markKitchenAttendance, saveKitchenStaff } from '@/lib/pos/kitchen-attendance-service';
import { ATTENDANCE_OPTIONS } from '@/lib/pos/kitchen-attendance-types';
import type { AttendanceStatus, KitchenAttendance, KitchenAttendanceDay, KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';

const statusLabel = (status: AttendanceStatus): string => ATTENDANCE_OPTIONS.find(option => option.value === status)?.label ?? 'Unmarked';
const control = 'min-h-12 justify-center rounded-xl border border-transparent px-3 hover:bg-accent-soft focus:border-primary active:bg-accent-soft';
type StatusFilter = AttendanceStatus | 'all';
const FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unmarked', label: 'Unmarked' },
  ...ATTENDANCE_OPTIONS,
];

function StaffIdentity({ person }: { person: KitchenStaffMember }) {
  const { width } = useResponsive();
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? '').join('').toLocaleUpperCase();
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      {width >= 360 ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-tint">
        <Text className="text-xs font-bold text-primary">{initials}</Text>
      </View> : null}
      <View className="min-w-0 flex-1">
        <Text className="text-base font-semibold text-text-primary">{person.name}</Text>
        <Text className="text-xs text-text-secondary">{person.job_title || 'Kitchen staff'}{person.is_active ? '' : ' · Archived'}</Text>
      </View>
    </View>
  );
}

function AttendanceRow({ person, record, busy, onMark }: { person: KitchenStaffMember; record: KitchenAttendance | undefined; busy: boolean; onMark: (person: KitchenStaffMember, status: AttendanceStatus, note: string) => Promise<boolean> }) {
  const desktop = useDesktopDensity();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(record?.note ?? '');
  const status = record?.status ?? 'unmarked';
  const open = (): void => { setNote(record?.note ?? ''); setExpanded(value => !value); };
  const updatedTime = record ? new Date(record.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
  const choices = <View className="flex-row gap-1">{ATTENDANCE_OPTIONS.map(option => <Pressable key={option.value} disabled={busy || option.value === status} accessibilityRole="button" accessibilityLabel={`${person.name}: ${option.label}`} accessibilityState={{ selected: option.value === status, disabled: busy || option.value === status }} onPress={() => void onMark(person, option.value, record?.note ?? '')} className={`min-h-12 min-w-0 flex-1 flex-row items-center justify-center gap-1 rounded-lg border px-1 focus:border-primary ${option.value === status ? 'border-primary bg-accent-soft' : 'border-transparent hover:bg-surface-tint active:bg-accent-soft'} ${busy ? 'opacity-50' : ''}`}>{option.value === status ? <Check size={12} color={colors.primary} /> : null}<Text className={`text-xs font-semibold ${option.value === status ? 'text-primary' : 'text-text-secondary'}`}>{option.label}</Text></Pressable>)}</View>;
  return <View testID={`attendance-row-${person.id}`} className="border-b border-border-soft bg-surface-elevated px-3 py-2">
    <View className="min-h-12 flex-row items-center gap-2 lg:gap-3">
      <StaffIdentity person={person} />
      {desktop ? <View className="w-[320px] shrink-0">{choices}</View> : <Pressable className={`${control} min-w-[100px] shrink-0 flex-row items-center justify-center gap-1 ${status === 'unmarked' ? 'bg-surface-tint' : 'bg-accent-soft'}`} disabled={busy} accessibilityRole="button" accessibilityLabel={`Mark attendance for ${person.name}, ${statusLabel(status)}`} accessibilityState={{ expanded, disabled: busy }} onPress={open}><Text className={`text-sm font-semibold ${status === 'unmarked' ? 'text-text-secondary' : 'text-primary'}`}>{statusLabel(status)}</Text><ChevronDown size={14} color={colors.primary} /></Pressable>}
      {desktop ? <View className="w-[168px] shrink-0">{record ? <><Text className="text-sm text-text-primary">{record.updated_by_name}</Text><Text className="text-xs text-text-secondary">{updatedTime} IST</Text></> : <Text className="text-sm text-text-secondary">Not yet marked</Text>}</View> : null}
      {desktop ? <IconButton icon={record?.note ? MessageSquareText : Pencil} label={`Attendance note for ${person.name}`} onPress={open} /> : null}
    </View>
    {record?.note && !expanded ? <Text className="mt-1 text-xs text-text-secondary">{record.note}</Text> : null}
    {expanded ? <View className="gap-2 pt-3">
      {!desktop ? choices : null}
      {!desktop && record ? <Text className="text-xs text-text-secondary">Updated by {record.updated_by_name} · {updatedTime} IST</Text> : null}
      <TextField flat label={`Attendance note for ${person.name}`} value={note} onChange={setNote} placeholder="Optional note · up to 200 characters" />
      <View className="flex-row flex-wrap gap-2"><View className="flex-1"><PrimaryButton label="Save note" disabled={busy || !record || note.trim() === record.note} onPress={() => { void onMark(person, status, note).then(saved => { if (saved) setExpanded(false); }); }} /></View><GhostButton label="Clear mark" disabled={busy || !record || (status === 'unmarked' && !record.note)} onPress={() => { void onMark(person, 'unmarked', '').then(saved => { if (saved) { setNote(''); setExpanded(false); } }); }} /><GhostButton label="Close" disabled={busy} onPress={() => setExpanded(false)} /></View>
      {!record ? <Text className="text-xs text-text-secondary">Choose a status first, then save an optional note.</Text> : null}
    </View> : null}
  </View>;
}

export default function KitchenAttendanceScreen() {
  const desktop = useDesktopDensity();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(kitchenToday);
  const [pane, setPane] = useState<'daily' | 'staff'>('daily');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [data, setData] = useState<KitchenAttendanceDay | null>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const request = useRef(0);
  const focused = useRef(false);
  const [editor, setEditor] = useState<{ id?: string; name: string; job_title: string; is_active: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const load = useCallback(async (): Promise<void> => {
    const version = ++request.current;
    setLoading(true); setError(null);
    const result = await fetchKitchenAttendance(date);
    if (!focused.current || version !== request.current) return;
    if (result.data) { setData(result.data); setLoadedDate(date); }
    else { setData(null); setLoadedDate(null); setError(result.error); }
    setLoading(false);
  }, [date]);
  useFocusEffect(useCallback(() => { focused.current = true; void load(); return () => { focused.current = false; request.current++; }; }, [load]));
  const changeDate = (next: string): void => { if (busyRef.current) return; setData(null); setLoadedDate(null); setSaved(null); setDate(next); };
  const counts = useMemo(() => attendanceCounts(data?.staff ?? [], data?.attendance ?? []), [data]);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const byStaff = useMemo(() => new Map(data?.attendance.map(row => [row.roster_id, row]) ?? []), [data]);
  const rows = useMemo(() => {
    const staff = data?.staff ?? [];
    const candidates = pane === 'daily' ? attendanceStaff(staff, data?.attendance ?? []) : staff.filter(member => showArchived ? !member.is_active : member.is_active);
    const term = query.trim().toLowerCase();
    return candidates.filter(member => `${member.name} ${member.job_title}`.toLowerCase().includes(term)
      && (pane !== 'daily' || statusFilter === 'all' || (byStaff.get(member.id)?.status ?? 'unmarked') === statusFilter));
  }, [data, pane, query, showArchived, statusFilter, byStaff]);
  const mark = async (person: KitchenStaffMember, status: AttendanceStatus, note: string): Promise<boolean> => {
    if (busyRef.current || loading || loadedDate !== date) return false;
    busyRef.current = true; setBusy(true); setError(null); setSaved(null);
    const result = await markKitchenAttendance({ roster_id: person.id, date, status, note });
    if (focused.current) {
      if (result.data) {
        const confirmed = result.data;
        setData(current => current ? { ...current, attendance: [...current.attendance.filter(row => row.roster_id !== person.id), confirmed] } : current);
        setSaved(`${person.name}: ${statusLabel(confirmed.status)} saved.`);
      } else setError(result.error);
    }
    setBusy(false);
    busyRef.current = false;
    return result.data !== null;
  };
  const saveStaff = async (active?: boolean): Promise<void> => {
    if (!editor || busyRef.current) return;
    busyRef.current = true; setBusy(true); setFormError(null); setSaved(null);
    const result = await saveKitchenStaff({ ...editor, ...(active === undefined ? {} : { is_active: active }) }, editor.id);
    if (focused.current) {
      if (result.data) { setEditor(null); setSaved(active === false ? 'Staff archived. Past attendance is retained.' : active === true ? 'Staff restored.' : 'Staff saved.'); await load(); }
      else setFormError(result.error);
    }
    setBusy(false);
    busyRef.current = false;
  };
  const startEditor = (person?: KitchenStaffMember): void => { if (busyRef.current) return; setFormError(null); setEditor(person ? { ...person } : { name: '', job_title: '', is_active: true }); };
  const header = <View className="gap-2" style={{ paddingTop: Platform.OS === 'web' ? 12 : insets.top + 12 }}>
    <View className="min-h-12 flex-row items-center gap-1">
      <Text accessibilityRole="header" className="flex-1 text-2xl font-bold text-text-primary">Attendance</Text>
      <Pressable className={control} accessibilityRole="button" accessibilityLabel="Refresh attendance" disabled={busy || loading} onPress={() => void load()}><RefreshCw size={18} color={colors.primary} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Add kitchen staff" disabled={busy} onPress={() => startEditor()} className="min-h-12 flex-row items-center gap-1 rounded-xl bg-primary px-3 hover:bg-primary-deep focus:border-border active:bg-primary-deep"><Plus size={16} color={colors.textOnPrimary} /><Text className="text-sm font-semibold text-text-on-primary">Add staff</Text></Pressable>
    </View>
    <View accessibilityRole="tablist" className="flex-row gap-5 border-b border-border">
      {([{ value: 'daily', label: 'Daily register' }, { value: 'staff', label: 'Staff' }] as const).map(option => <Pressable key={option.value} disabled={busy} accessibilityRole="tab" accessibilityState={{ selected: pane === option.value, disabled: busy }} onPress={() => { if (busyRef.current) return; setPane(option.value); setQuery(''); setStatusFilter('all'); setSearchOpen(false); setEditor(null); setFormError(null); setSaved(null); }} className={`min-h-12 justify-center border-b-2 px-1 focus:bg-accent-soft hover:bg-surface-tint ${pane === option.value ? 'border-primary' : 'border-transparent'}`}><Text className={`text-sm font-semibold ${pane === option.value ? 'text-primary' : 'text-text-secondary'}`}>{option.label}</Text></Pressable>)}
    </View>
    {editor ? <View pointerEvents={busy ? 'none' : 'auto'} className="gap-3 rounded-2xl border border-border-soft bg-surface-elevated p-3">
      <Text className="text-lg font-bold text-text-primary">{editor.id ? 'Edit staff member' : 'Add staff member'}</Text>
      <Text className="text-xs text-text-secondary">Attendance roster only. This does not create an app login.</Text>
      <TextField flat label="Staff name" value={editor.name} onChange={name => setEditor(current => current ? { ...current, name } : current)} placeholder="Full name" />
      <TextField flat label="Job role" value={editor.job_title} onChange={job_title => setEditor(current => current ? { ...current, job_title } : current)} placeholder="Optional · e.g. Cook or Packing" />
      {formError ? <Notice text={formError} /> : null}
      <View className="flex-row flex-wrap gap-2"><View className="flex-1"><PrimaryButton label="Save staff" loading={busy} onPress={() => void saveStaff()} /></View><GhostButton label="Cancel" disabled={busy} onPress={() => setEditor(null)} /></View>
      {editor.id ? <GhostButton label={editor.is_active ? 'Archive staff' : 'Restore staff'} disabled={busy} onPress={() => void saveStaff(!editor.is_active)} /> : null}
      {editor.id && editor.is_active ? <Text className="text-xs text-text-secondary">Archiving removes this person from new days. Existing attendance stays available.</Text> : null}
    </View> : null}
    <View className={`gap-2 ${desktop ? 'flex-row items-center' : ''}`}>
      {pane === 'daily' ? <View className="flex-row items-center gap-1"><View className={desktop ? 'w-[272px]' : 'min-w-0 flex-1'}><AttendanceDate value={date} onChange={changeDate} disabled={busy || loading} /></View>{!desktop ? <Pressable className={`${control} items-center`} accessibilityRole="button" accessibilityLabel="Search attendance staff" accessibilityState={{ expanded: searchOpen || Boolean(query) }} onPress={() => setSearchOpen(value => !value)}><Search size={18} color={colors.primary} /></Pressable> : null}</View> : <View className={desktop ? 'w-[272px]' : ''}><Segmented options={[{ value: 'active', label: 'Active staff' }, { value: 'archived', label: 'Archived' }]} value={showArchived ? 'archived' : 'active'} onChange={value => setShowArchived(value === 'archived')} /></View>}
      {desktop || pane === 'staff' || searchOpen || query ? <View className="flex-1"><SearchBox value={query} onChange={setQuery} placeholder="Search staff or role" /></View> : null}
    </View>
    {pane === 'daily' && data && loadedDate === date ? <FlatList horizontal showsHorizontalScrollIndicator={false} data={FILTERS} keyExtractor={option => option.value} contentContainerStyle={{ gap: 4 }} renderItem={({ item: option }) => <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Filter attendance: ${option.label}`} accessibilityState={{ selected: statusFilter === option.value, disabled: busy }} onPress={() => setStatusFilter(option.value)} className={`min-h-12 flex-row items-center gap-2 rounded-lg border px-3 focus:border-primary ${statusFilter === option.value ? 'border-border bg-surface-elevated' : 'border-transparent hover:bg-surface-tint active:bg-accent-soft'}`}><Text className={`text-sm font-semibold ${statusFilter === option.value ? 'text-primary' : 'text-text-secondary'}`}>{option.label}</Text><Text className="text-xs font-semibold text-text-secondary">{option.value === 'all' ? total : counts[option.value]}</Text></Pressable>} /> : null}
    {error ? <Notice text={error} /> : null}
    {saved ? <Text className="text-sm font-semibold text-primary" accessibilityLiveRegion="polite">{saved}</Text> : null}
    {busy ? <ActivityIndicator accessibilityLabel="Saving attendance change" color={colors.primary} /> : null}
    {!loading && data ? <View className="flex-row items-center justify-between gap-2 pb-2"><Text className="text-xs text-text-secondary">{rows.length} staff{query || (pane === 'daily' && statusFilter !== 'all') ? ' in this view' : ''}</Text>{pane === 'daily' ? <Text className="text-xs text-text-secondary">{total - counts.unmarked} of {total} marked</Text> : null}</View> : null}
    {desktop && pane === 'daily' && data && rows.length ? <View className="flex-row items-center gap-3 border-y border-border-soft bg-surface-tint px-3 py-2"><Text className="flex-1 text-xs font-semibold text-text-secondary">Staff member</Text><Text className="w-[320px] text-xs font-semibold text-text-secondary">Attendance</Text><Text className="w-[168px] text-xs font-semibold text-text-secondary">Last updated</Text><Text className="w-12 text-xs font-semibold text-text-secondary">Notes</Text></View> : null}
  </View>;
  return <KScreen scroll={false} wide><FlatList className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 1120 }} keyboardShouldPersistTaps="handled" data={loading || loadedDate !== date ? [] : rows} keyExtractor={person => person.id} extraData={{ data, busy }} ListHeaderComponent={header} refreshing={loading} onRefresh={() => { if (!busyRef.current) void load(); }} ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading attendance" color={colors.primary} className="my-6" /> : error && !data ? <Empty title="Attendance unavailable" body="Retry to load the register. No attendance has been changed." action={<GhostButton label="Retry attendance" onPress={() => void load()} />} /> : <Empty title={query || (pane === 'daily' && statusFilter !== 'all') ? 'No matching staff' : pane === 'staff' && showArchived ? 'No archived staff' : 'No staff for this view'} body={query || (pane === 'daily' && statusFilter !== 'all') ? 'Try another name or attendance status.' : pane === 'staff' && showArchived ? 'Archived staff appear here. Past attendance stays saved.' : 'Add kitchen staff to begin marking attendance.'} action={query || (pane === 'daily' && statusFilter !== 'all') ? <GhostButton label="Reset filters" onPress={() => { setQuery(''); setStatusFilter('all'); }} /> : pane === 'staff' && showArchived ? undefined : <GhostButton label="Add kitchen staff" onPress={() => startEditor()} />} />} renderItem={({ item }) => pane === 'daily' ? <AttendanceRow key={`${item.id}:${date}`} person={item} record={byStaff.get(item.id)} busy={busy || loading} onMark={mark} /> : <View className="min-h-16 flex-row items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2"><StaffIdentity person={item} /><IconButton icon={Pencil} label={`Edit staff ${item.name}`} onPress={() => startEditor(item)} /></View>} /></KScreen>;
}
