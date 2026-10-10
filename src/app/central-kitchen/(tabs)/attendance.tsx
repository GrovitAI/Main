import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronDown, Pencil, Plus, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { AttendanceDate } from '@/components/kitchen/AttendanceDate';
import { Empty, GhostButton, IconButton, KHeader, KScreen, Notice, PrimaryButton, SearchBox, Segmented, TextField, useDesktopDensity } from '@/components/kitchen/ui';
import { colors } from '@/lib/pos/brand';
import { kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { attendanceCounts, attendanceStaff } from '@/lib/pos/kitchen-attendance-utils';
import { fetchKitchenAttendance, markKitchenAttendance, saveKitchenStaff } from '@/lib/pos/kitchen-attendance-service';
import { ATTENDANCE_OPTIONS } from '@/lib/pos/kitchen-attendance-types';
import type { AttendanceStatus, KitchenAttendance, KitchenAttendanceDay, KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';

const statusLabel = (status: AttendanceStatus): string => ATTENDANCE_OPTIONS.find(option => option.value === status)?.label ?? 'Unmarked';
const control = 'min-h-12 justify-center rounded-xl border border-transparent px-3 hover:bg-accent-soft focus:border-primary active:bg-accent-soft';

function AttendanceRow({ person, record, busy, onMark }: { person: KitchenStaffMember; record: KitchenAttendance | undefined; busy: boolean; onMark: (person: KitchenStaffMember, status: AttendanceStatus, note: string) => Promise<boolean> }) {
  const desktop = useDesktopDensity();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(record?.note ?? '');
  const status = record?.status ?? 'unmarked';
  const open = (): void => { setNote(record?.note ?? ''); setExpanded(value => !value); };
  const choices = <View className="flex-row gap-1">{ATTENDANCE_OPTIONS.map(option => <Pressable key={option.value} disabled={busy || option.value === status} accessibilityRole="button" accessibilityLabel={`${person.name}: ${option.label}`} accessibilityState={{ selected: option.value === status, disabled: busy || option.value === status }} onPress={() => void onMark(person, option.value, record?.note ?? '')} className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-1 focus:border-primary ${option.value === status ? 'border-primary bg-accent-soft' : 'border-border-soft hover:bg-surface-tint active:bg-accent-soft'} ${busy ? 'opacity-50' : ''}`}><Text className={`text-xs font-bold ${option.value === status ? 'text-primary' : 'text-text-primary'}`}>{option.label}</Text></Pressable>)}</View>;
  return <View className="border-b border-border-soft bg-surface-elevated px-3 py-2">
    <View className="flex-row items-center gap-3">
      <View className="flex-1"><Text className="text-base font-bold text-text-primary">{person.name}</Text><Text className="text-xs text-text-secondary">{person.job_title || 'Kitchen staff'}{person.is_active ? '' : ' · Archived'}</Text></View>
      {desktop ? <View className="w-[340px]">{choices}</View> : <Pressable className={`${control} flex-row items-center gap-1 ${status === 'unmarked' ? 'bg-surface-tint' : 'bg-accent-soft'}`} disabled={busy} accessibilityRole="button" accessibilityLabel={`Mark attendance for ${person.name}, ${statusLabel(status)}`} accessibilityState={{ expanded }} onPress={open}><Text className={`text-sm font-bold ${status === 'unmarked' ? 'text-text-secondary' : 'text-primary'}`}>{statusLabel(status)}</Text><ChevronDown size={16} color={colors.primary} /></Pressable>}
      {desktop ? <IconButton icon={Pencil} label={`Attendance note for ${person.name}`} onPress={open} /> : null}
    </View>
    {record ? <Text className="mt-1 text-xs text-text-secondary">{desktop ? `${statusLabel(status)} · ` : ''}Updated by {record.updated_by_name} · {new Date(record.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST{record.note && !expanded ? ` · ${record.note}` : ''}</Text> : <Text className="mt-1 text-xs text-text-secondary">Not marked for this day</Text>}
    {expanded ? <View className="gap-2 pt-3">
      {!desktop ? choices : null}
      <TextField label={`Attendance note for ${person.name}`} value={note} onChange={setNote} placeholder="Optional note · up to 200 characters" />
      <View className="flex-row flex-wrap gap-2"><View className="flex-1"><PrimaryButton label="Save note" disabled={busy || !record || note.trim() === record.note} onPress={() => { void onMark(person, status, note).then(saved => { if (saved) setExpanded(false); }); }} /></View><GhostButton label="Clear mark" disabled={busy || !record || (status === 'unmarked' && !record.note)} onPress={() => { void onMark(person, 'unmarked', '').then(saved => { if (saved) { setNote(''); setExpanded(false); } }); }} /><GhostButton label="Close" disabled={busy} onPress={() => setExpanded(false)} /></View>
      {!record ? <Text className="text-xs text-text-secondary">Choose a status first, then save an optional note.</Text> : null}
    </View> : null}
  </View>;
}

export default function KitchenAttendanceScreen() {
  const [date, setDate] = useState(kitchenToday);
  const [pane, setPane] = useState<'daily' | 'staff'>('daily');
  const [query, setQuery] = useState('');
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
  const byStaff = useMemo(() => new Map(data?.attendance.map(row => [row.roster_id, row]) ?? []), [data]);
  const rows = useMemo(() => {
    const staff = data?.staff ?? [];
    const candidates = pane === 'daily' ? attendanceStaff(staff, data?.attendance ?? []) : staff.filter(member => showArchived ? !member.is_active : member.is_active);
    return candidates.filter(member => `${member.name} ${member.job_title}`.toLowerCase().includes(query.trim().toLowerCase()));
  }, [data, pane, query, showArchived]);
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
  const header = <View className="gap-3 pb-3">
    <KHeader title="Attendance" right={<IconButton icon={Plus} label="Add kitchen staff" onPress={() => startEditor()} />} />
    <Segmented options={[{ value: 'daily', label: 'Daily register' }, { value: 'staff', label: 'Staff' }]} value={pane} onChange={value => { if (!busyRef.current) { setPane(value); setQuery(''); setEditor(null); setFormError(null); setSaved(null); } }} />
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
    {pane === 'daily' ? <View className="gap-2 rounded-2xl border border-border-soft bg-surface-elevated px-2 py-1"><AttendanceDate value={date} onChange={changeDate} disabled={busy || loading} />{data && loadedDate === date ? <View className="flex-row flex-wrap gap-x-3 gap-y-1 px-2 pb-2">{[...ATTENDANCE_OPTIONS, { value: 'unmarked' as const, label: 'Unmarked' }].map(option => <Text key={option.value} className="text-xs text-text-secondary"><Text className="font-bold text-text-primary">{counts[option.value]}</Text> {option.label}</Text>)}</View> : null}</View> : <Segmented options={[{ value: 'active', label: 'Active staff' }, { value: 'archived', label: 'Archived' }]} value={showArchived ? 'archived' : 'active'} onChange={value => setShowArchived(value === 'archived')} />}
    <View className="flex-row items-center gap-2"><View className="flex-1"><SearchBox value={query} onChange={setQuery} placeholder="Search staff or role" /></View><Pressable className={control} accessibilityRole="button" accessibilityLabel="Refresh attendance" disabled={busy || loading} onPress={() => void load()}><RefreshCw size={18} color={colors.primary} /></Pressable></View>
    {error ? <Notice text={error} /> : null}
    {saved ? <Text className="text-sm font-semibold text-primary" accessibilityLiveRegion="polite">{saved}</Text> : null}
    {busy ? <ActivityIndicator accessibilityLabel="Saving attendance change" color={colors.primary} /> : null}
    {!loading && data ? <Text className="text-xs text-text-secondary">{rows.length} {pane === 'daily' ? 'staff for this day' : 'staff'}{query ? ' matching search' : ''}{pane === 'daily' ? ' · Tap a status to save' : ''}</Text> : null}
  </View>;
  return <KScreen scroll={false} wide><FlatList className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 1120 }} keyboardShouldPersistTaps="handled" data={loading || loadedDate !== date ? [] : rows} keyExtractor={person => person.id} extraData={{ data, busy }} ListHeaderComponent={header} refreshing={loading} onRefresh={() => { if (!busyRef.current) void load(); }} ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading attendance" color={colors.primary} className="my-6" /> : error && !data ? <Empty title="Attendance unavailable" body="Retry to load the register. No attendance has been changed." action={<GhostButton label="Retry attendance" onPress={() => void load()} />} /> : <Empty title={query ? 'No matching staff' : pane === 'staff' && showArchived ? 'No archived staff' : 'No staff for this view'} body={query ? 'Try another name or job role.' : 'Add kitchen staff to begin marking attendance.'} action={<GhostButton label={query ? 'Clear search' : 'Add kitchen staff'} onPress={query ? () => setQuery('') : () => startEditor()} />} />} renderItem={({ item }) => pane === 'daily' ? <AttendanceRow key={`${item.id}:${date}`} person={item} record={byStaff.get(item.id)} busy={busy || loading} onMark={mark} /> : <View className="flex-row items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2"><View className="flex-1"><Text className="text-base font-bold text-text-primary">{item.name}</Text><Text className="text-xs text-text-secondary">{item.job_title || 'Kitchen staff'} · {item.is_active ? 'Active' : 'Archived'}</Text></View><IconButton icon={Pencil} label={`Edit staff ${item.name}`} onPress={() => startEditor(item)} /></View>} /></KScreen>;
}
