import { createContext, useCallback, useContext, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, Pressable, View, type FlatListProps, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Check, ChevronDown, Pencil, Plus, RefreshCw, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { AttendanceDate } from '@/components/kitchen/AttendanceDate';
import { AttendanceAction } from '@/components/kitchen/AttendanceAction';
import { MonthlyAttendance } from '@/components/kitchen/MonthlyAttendance';
import { Empty, GhostButton, IconButton, KScreen, LinkButton, MeasureLabels, Notice, PrimaryButton, Reveal, SearchBox, Segmented, SkeletonRows, TextField, Tick, useDesktopDensity, useEnterOnChange, useEqualChoices, useSlidingRect } from '@/components/kitchen/ui';
import { colors } from '@/lib/pos/brand';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';
import { useResponsive } from '@/lib/pos/useResponsive';
import { kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { attendanceCounts, attendanceDateLabel, attendanceStaff } from '@/lib/pos/kitchen-attendance-utils';
import { fetchKitchenAttendance, markKitchenAttendance, markKitchenAttendanceGroup, saveKitchenStaff } from '@/lib/pos/kitchen-attendance-service';
import { ATTENDANCE_OPTIONS } from '@/lib/pos/kitchen-attendance-types';
import type { AttendanceStatus, KitchenAttendance, KitchenAttendanceDay, KitchenStaffMember } from '@/lib/pos/kitchen-attendance-types';

const statusLabel = (status: AttendanceStatus): string => ATTENDANCE_OPTIONS.find(option => option.value === status)?.label ?? 'Unmarked';
const control = 'min-h-12 justify-center rounded-xl border border-transparent px-3 hover:bg-accent-soft focus:border-primary active:bg-accent-soft';
type StatusFilter = AttendanceStatus | 'all';
type FilterOption = { value: StatusFilter; label: string };
const FILTERS: readonly FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'unmarked', label: 'Unmarked' },
  ...ATTENDANCE_OPTIONS,
];

/**
 * The status filters scroll sideways in a FlatList, so each cell reports its own
 * place in the row; the white highlight then slides to the chosen one (task 215).
 */
const PANES = [{ value: 'daily', label: 'Daily register' }, { value: 'monthly', label: 'Month overview' }, { value: 'staff', label: 'Staff' }] as const;

const FilterPlace = createContext<((i: number) => (e: LayoutChangeEvent) => void) | null>(null);
function FilterCell({ index, onLayout, style, children }: ComponentProps<NonNullable<FlatListProps<FilterOption>['CellRendererComponent']>>) {
  const place = useContext(FilterPlace);
  return <View style={style} onLayout={event => { onLayout?.(event); place?.(index)(event); }}>{children}</View>;
}

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

function AttendanceRow({ person, record, busy, selecting, selected, onSelect, onMark }: {
  person: KitchenStaffMember; record: KitchenAttendance | undefined; busy: boolean;
  selecting: boolean; selected: boolean; onSelect: (id: string) => void;
  onMark: (person: KitchenStaffMember, status: AttendanceStatus, note: string) => Promise<boolean>;
}) {
  const desktop = useDesktopDensity();
  const [expanded, setExpanded] = useState(false);
  const heldName = useRef(false);
  const [note, setNote] = useState(record?.note ?? '');
  const status = record?.status ?? 'unmarked';
  const canNote = status === 'half_day' || status === 'leave';
  const open = (): void => { setNote(record?.note ?? ''); setExpanded(value => !value); };
  const updatedTime = record ? new Date(record.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
  const choices = <View className="flex-row gap-1">{ATTENDANCE_OPTIONS.map(option => <Pressable key={option.value} disabled={busy || option.value === status} accessibilityRole="button" accessibilityLabel={`${person.name}: ${option.label}`} accessibilityState={{ selected: option.value === status, disabled: busy || option.value === status }} onPress={() => void onMark(person, option.value, record?.note ?? '')} className={`min-h-12 min-w-0 flex-1 flex-row items-center justify-center gap-1 rounded-lg border px-1 focus:border-primary ${option.value === status ? 'border-primary bg-accent-soft' : 'border-transparent hover:bg-surface-tint active:bg-accent-soft'} ${busy ? 'opacity-50' : ''}`}>{option.value === status ? <Check size={12} color={colors.primary} /> : null}<Text className={`text-xs font-semibold ${option.value === status ? 'text-primary' : 'text-text-secondary'}`}>{option.label}</Text></Pressable>)}</View>;
  return <View testID={`attendance-row-${person.id}`} className={`border-b border-border-soft px-3 py-2 ${selecting && selected ? 'bg-accent-soft' : 'bg-surface-elevated'}`}>
    <View className="min-h-12 flex-row items-center gap-2 lg:gap-3">
      <Pressable className="min-h-12 min-w-0 flex-1 flex-row items-center gap-2 rounded-lg focus:border-primary" disabled={busy}
        accessibilityRole={selecting ? 'checkbox' : 'button'} accessibilityLabel={`Select staff member ${person.name}`}
        aria-checked={selecting ? selected : undefined}
        accessibilityHint="Select for a group attendance mark" accessibilityState={{ checked: selecting ? selected : undefined, disabled: busy }}
        onPressIn={() => { heldName.current = false; }}
        onPress={() => { if (!heldName.current) onSelect(person.id); }}
        onLongPress={() => { heldName.current = true; onSelect(person.id); }}>
        {selecting ? <Tick size={20} on={selected} /> : null}
        <StaffIdentity person={person} />
      </Pressable>
      {selecting ? <Text className="text-sm font-semibold text-text-secondary">{statusLabel(status)}</Text> : desktop ? <View className="w-[320px] shrink-0">{choices}</View> : <Pressable className={`${control} min-w-[100px] shrink-0 flex-row items-center justify-center gap-1 ${status === 'unmarked' ? 'bg-surface-tint' : 'bg-accent-soft'}`} disabled={busy} accessibilityRole="button" accessibilityLabel={`Mark attendance for ${person.name}, ${statusLabel(status)}`} accessibilityState={{ expanded, disabled: busy }} onPress={open}><Text className={`text-sm font-semibold ${status === 'unmarked' ? 'text-text-secondary' : 'text-primary'}`}>{statusLabel(status)}</Text><ChevronDown size={14} color={colors.primary} /></Pressable>}
      {desktop ? <View className="w-[168px] shrink-0">{record ? <><Text className="text-sm text-text-primary">{record.updated_by_name}</Text><Text className="text-xs text-text-secondary">{updatedTime} IST</Text></> : <Text className="text-sm text-text-secondary">Not yet marked</Text>}</View> : null}
      {desktop && !selecting ? <AttendanceAction label="Edit" accessibilityLabel={`Edit attendance for ${person.name}`} disabled={busy} onPress={open} /> : null}
    </View>
    {canNote && record?.note && !expanded && !selecting ? <Text className="mt-1 text-xs text-text-secondary">{record.note}</Text> : null}
    <Reveal open={expanded && !selecting}><View className="gap-2 pt-2">
      {!desktop ? choices : null}
      {!desktop && record ? <Text className="text-xs text-text-secondary">Updated by {record.updated_by_name} · {updatedTime} IST</Text> : null}
      {canNote ? <TextField flat label={`Attendance note for ${person.name}`} value={note} onChange={setNote} placeholder="Optional note · up to 200 characters" /> : null}
      <View className="flex-row flex-wrap items-start gap-2" testID={`attendance-note-actions-${person.id}`}>
        {canNote ? <AttendanceAction label="Save note" primary disabled={busy || !record || note.trim() === record.note} onPress={() => { void onMark(person, status, note).then(saved => { if (saved) setExpanded(false); }); }} /> : null}
        <AttendanceAction label="Clear mark" disabled={busy || !record || (status === 'unmarked' && !record.note)} onPress={() => { void onMark(person, 'unmarked', '').then(saved => { if (saved) { setNote(''); setExpanded(false); } }); }} />
        <AttendanceAction label="Close" disabled={busy} onPress={() => setExpanded(false)} />
      </View>
    </View></Reveal>
  </View>;
}

export default function KitchenAttendanceScreen() {
  const desktop = useDesktopDensity();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(kitchenToday);
  const [pane, setPane] = useState<'daily' | 'monthly' | 'staff'>('daily');
  // The pane underline slides between Daily register, Month overview and Staff (task 214).
  const paneSlide = useSlidingRect((['daily', 'monthly', 'staff'] as const).indexOf(pane));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const statusSlide = useSlidingRect(FILTERS.findIndex(option => option.value === statusFilter));
  // Same-size choices (task 223): the three panes and the status filters each take the width of
  // their widest label, so the underline and the white highlight keep one size as they move.
  const paneSizes = useEqualChoices(PANES.length, { gap: 12, pad: 8, tightPad: 0, fallback: 'natural' });
  const filterSizes = useEqualChoices(FILTERS.length, { gap: 4, pad: 26 });
  const [monthlyLocked, setMonthlyLocked] = useState(false);
  const monthly = pane === 'monthly';
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [data, setData] = useState<KitchenAttendanceDay | null>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  // Rows fade up when the pane, the archived view or the loaded day changes (task 215).
  const paneEnter = useEnterOnChange(pane + ':' + (pane === 'daily' ? loadedDate ?? '' : String(showArchived)));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const request = useRef(0);
  const focused = useRef(false);
  const [editor, setEditor] = useState<{ id?: string; name: string; job_title: string; is_active: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupStatus, setGroupStatus] = useState<AttendanceStatus | null>(null);
  const access = useKitchenAccess();
  const dayLocked = access.isLocked(date) && !access.isOwner;
  // Marking needs attendance.mark, and a locked day only the owner may change.
  const mayMark = access.can('attendance.mark') && !dayLocked;
  const mayRoster = access.can('setup.roster');
  const markNotice = !access.can('attendance.mark') ? 'Your login can see attendance but not mark it.' : dayLocked ? `${attendanceDateLabel(date)} is locked. Ask the owner to change it.` : null;
  const clearSelection = useCallback((): void => { setSelecting(false); setSelectedIds(new Set()); setGroupStatus(null); }, []);
  const load = useCallback(async (): Promise<void> => {
    const version = ++request.current;
    setLoading(true); setError(null); clearSelection();
    const result = await fetchKitchenAttendance(date);
    if (!focused.current || version !== request.current) return;
    if (result.data) { setData(result.data); setLoadedDate(date); }
    else { setData(null); setLoadedDate(null); setError(result.error); }
    setLoading(false);
  }, [date, clearSelection]);
  useFocusEffect(useCallback(() => { focused.current = true; if (!monthly) void load(); return () => { focused.current = false; request.current++; }; }, [load, monthly]));
  const changeDate = (next: string): void => { if (busyRef.current) return; clearSelection(); setData(null); setLoadedDate(null); setSaved(null); setDate(next); };
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
  const selectedPeople = rows.filter(person => selectedIds.has(person.id));
  const selectPerson = (id: string): void => {
    if (busyRef.current || loading || loadedDate !== date) return;
    setSelecting(true); setSaved(null);
    setSelectedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const markGroup = async (): Promise<void> => {
    if (busyRef.current || loading || loadedDate !== date || !groupStatus || !selectedPeople.length) return;
    const status = groupStatus;
    const count = selectedPeople.length;
    // Skip already-matching marks and retain each person's existing note.
    const staff = selectedPeople.filter(person => byStaff.get(person.id)?.status !== status)
      .map(person => ({ roster_id: person.id, note: byStaff.get(person.id)?.note ?? '' }));
    if (!staff.length) { setSaved(`${count} staff already marked ${statusLabel(status)}.`); clearSelection(); return; }
    busyRef.current = true; setBusy(true); setError(null); setSaved(null);
    const result = await markKitchenAttendanceGroup({ date, status, staff });
    if (focused.current) {
      if (result.data) {
        const confirmed = result.data;
        const ids = new Set(confirmed.map(row => row.roster_id));
        setData(current => current ? { ...current, attendance: [...current.attendance.filter(row => !ids.has(row.roster_id)), ...confirmed] } : current);
        setSaved(`${count} staff marked ${statusLabel(status)} for ${attendanceDateLabel(date)}.`);
        clearSelection();
      } else setError(result.error);
    }
    setBusy(false); busyRef.current = false;
  };
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
  const startEditor = (person?: KitchenStaffMember): void => { if (busyRef.current || monthlyLocked) return; clearSelection(); if (monthly) setPane('staff'); setFormError(null); setEditor(person ? { ...person } : { name: '', job_title: '', is_active: true }); };
  const navigationHeader = <View className="gap-2" style={{ paddingTop: Platform.OS === 'web' ? 12 : insets.top + 12 }}>
    <View className="min-h-12 flex-row items-center gap-1">
      <Text accessibilityRole="header" className="flex-1 text-2xl font-bold text-text-primary">Attendance</Text>
      {!monthly ? <Pressable className={control} accessibilityRole="button" accessibilityLabel="Refresh attendance" disabled={busy || loading} onPress={() => void load()}><RefreshCw size={18} color={colors.primary} /></Pressable> : null}
      {mayRoster ? <Pressable accessibilityRole="button" accessibilityLabel="Add kitchen staff" disabled={busy || monthlyLocked} onPress={() => startEditor()} className="min-h-12 flex-row items-center gap-1 rounded-xl bg-primary px-3 hover:bg-primary-deep focus:border-border active:bg-primary-deep"><Plus size={16} color={colors.textOnPrimary} /><Text className="text-sm font-semibold text-text-on-primary">Add staff</Text></Pressable> : null}
    </View>
    <View accessibilityRole="tablist" className="flex-row gap-3 border-b border-border" onLayout={paneSizes.onLine}>
      <MeasureLabels>{PANES.map((option, i) => <Text key={option.value} onLayout={paneSizes.measure(i)} className="text-sm font-semibold">{option.label}</Text>)}</MeasureLabels>
      {PANES.map((option, i) => <Pressable key={option.value} onLayout={paneSlide.measure(i)} style={paneSizes.width ? { width: paneSizes.width } : undefined} disabled={busy || monthlyLocked} accessibilityRole="tab" accessibilityState={{ selected: pane === option.value, disabled: busy || monthlyLocked }} aria-selected={pane === option.value} onPress={() => { if (busyRef.current || monthlyLocked) return; clearSelection(); setPane(option.value); setQuery(''); setStatusFilter('all'); setSearchOpen(false); setEditor(null); setFormError(null); setSaved(null); }} className={`min-h-12 items-center justify-center px-1 focus:bg-accent-soft ${pane === option.value ? '' : 'hover:bg-surface-tint'}`}><Text numberOfLines={1} className={`text-sm font-semibold ${pane === option.value ? 'text-primary' : 'text-text-secondary'}`}>{option.label}</Text></Pressable>)}
      {/* Drawn over the tabs so a focused tab's fill never hides it; it takes no taps. */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 0, height: 2, backgroundColor: colors.primary, ...paneSlide.style }} />
    </View>
  </View>;
  const search = <SearchBox value={query} onChange={next => { if (busyRef.current) return; clearSelection(); setQuery(next); }} placeholder="Search staff or role" />;
  const header = <View className="gap-2">
    {navigationHeader}
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
      {desktop ? <View className="flex-1">{search}</View> : <Reveal open={pane === 'staff' || searchOpen || Boolean(query)}>{search}</Reveal>}
    </View>
    {pane === 'daily' && data && loadedDate === date ? <View><MeasureLabels>{FILTERS.map((option, i) => <View key={option.value} onLayout={filterSizes.measure(i)} className="flex-row items-center gap-2"><Text className="text-sm font-semibold">{option.label}</Text><Text className="text-xs font-semibold">{option.value === 'all' ? total : counts[option.value]}</Text></View>)}</MeasureLabels><FilterPlace.Provider value={statusSlide.measure}><FlatList horizontal showsHorizontalScrollIndicator={false} data={FILTERS} keyExtractor={option => option.value} contentContainerStyle={{ gap: 4 }} CellRendererComponent={FilterCell}
      ListHeaderComponentStyle={{ marginRight: -4 }} ListHeaderComponent={<Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, ...statusSlide.style }} />}
      renderItem={({ item: option }) => <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={`Filter attendance: ${option.label}`} accessibilityState={{ selected: statusFilter === option.value, disabled: busy }} aria-selected={statusFilter === option.value} onPress={() => { if (busyRef.current) return; clearSelection(); setStatusFilter(option.value); }} style={filterSizes.widest ? { width: filterSizes.widest + 26 } : undefined} className={`min-h-12 flex-row items-center justify-center gap-2 rounded-lg border px-3 focus:border-primary ${statusFilter === option.value ? 'border-transparent' : 'border-transparent hover:bg-surface-tint active:bg-accent-soft'}`}><Text className={`text-sm font-semibold ${statusFilter === option.value ? 'text-primary' : 'text-text-secondary'}`}>{option.label}</Text><Text className="text-xs font-semibold text-text-secondary">{option.value === 'all' ? total : counts[option.value]}</Text></Pressable>} /></FilterPlace.Provider></View> : null}
    <Reveal open={pane === 'daily' && Boolean(data) && loadedDate === date && !loading && selecting}><View className="gap-2 border-y border-border bg-surface-tint px-3 py-2" testID="attendance-selection-toolbar">
      <>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-sm font-semibold text-text-primary" accessibilityLiveRegion="polite">{selectedPeople.length} selected · {attendanceDateLabel(date)}</Text>
          <AttendanceAction label="Cancel" accessibilityLabel="Cancel selection" disabled={busy} onPress={clearSelection} />
        </View>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Select all staff in this view"
          aria-checked={selectedPeople.length === rows.length && rows.length > 0}
          accessibilityState={{ checked: selectedPeople.length === rows.length && rows.length > 0, disabled: busy || !rows.length }}
          disabled={busy || !rows.length} onPress={() => { if (busyRef.current) return; setSelectedIds(selectedPeople.length === rows.length ? new Set() : new Set(rows.map(person => person.id))); }}
          className="min-h-12 flex-row items-center gap-2 rounded-lg px-1 hover:bg-accent-soft focus:border-primary">
          <Tick size={20} on={selectedPeople.length === rows.length && rows.length > 0} />
          <Text className="text-sm font-semibold text-text-primary">Select all in this view ({rows.length})</Text>
        </Pressable>
        <View className="w-full max-w-[420px] flex-row gap-1">{ATTENDANCE_OPTIONS.map(option => <Pressable key={option.value} disabled={busy}
          accessibilityRole="button" accessibilityLabel={`Group attendance: ${option.label}`} accessibilityState={{ selected: groupStatus === option.value, disabled: busy }}
          aria-pressed={groupStatus === option.value}
          onPress={() => setGroupStatus(option.value)} className={`min-h-12 min-w-0 flex-1 items-center justify-center rounded-lg border px-1 focus:border-primary ${groupStatus === option.value ? 'border-primary bg-primary' : 'border-border bg-surface-elevated hover:bg-accent-soft active:bg-accent-soft'}`}>
          <Text className={`text-xs font-semibold ${groupStatus === option.value ? 'text-text-on-primary' : 'text-text-secondary'}`}>{option.label}</Text>
        </Pressable>)}</View>
        <View className="flex-row flex-wrap items-center gap-2">
          <AttendanceAction primary label={groupStatus ? `Mark ${selectedPeople.length} as ${statusLabel(groupStatus)}` : 'Choose a status'}
            disabled={busy || !selectedPeople.length || !groupStatus} onPress={() => void markGroup()} />
          <Text className="text-xs text-text-secondary">Existing marks will be updated. Notes are kept.</Text>
        </View>
      </>
    </View></Reveal>
    {error ? <Notice text={error} /> : null}
    {markNotice && pane === 'daily' ? <Notice tone="neutral" text={markNotice} /> : null}
    {saved ? <Text className="text-sm font-semibold text-primary" accessibilityLiveRegion="polite">{saved}</Text> : null}
    {busy ? <ActivityIndicator accessibilityLabel="Saving attendance change" color={colors.primary} /> : null}
    {!loading && data ? <View className="flex-row items-center justify-between gap-2 pb-2"><Text className="text-xs text-text-secondary">{rows.length} staff{query || (pane === 'daily' && statusFilter !== 'all') ? ' in this view' : ''}</Text>{pane === 'daily' ? <View className="flex-row items-center gap-3">{!selecting && mayMark && rows.length > 1 ? <LinkButton label="Select several" onPress={() => { if (busyRef.current) return; setSelecting(true); setSaved(null); }} /> : null}<Text className="text-xs text-text-secondary">{total - counts.unmarked} of {total} marked</Text></View> : null}</View> : null}
    {desktop && !selecting && pane === 'daily' && data && rows.length ? <View className="flex-row items-center gap-3 border-y border-border-soft bg-surface-tint px-3 py-2"><Text className="flex-1 text-xs font-semibold text-text-secondary">Staff member</Text><Text className="w-[320px] text-xs font-semibold text-text-secondary">Attendance</Text><Text className="w-[168px] text-xs font-semibold text-text-secondary">Last updated</Text><Text className="w-12 text-xs font-semibold text-text-secondary">Edit</Text></View> : null}
  </View>;
  if (monthly) return <KScreen scroll={false} wide><MonthlyAttendance header={navigationHeader} onLockChange={setMonthlyLocked} /></KScreen>;
  return <KScreen scroll={false} wide><FlatList className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, width: '100%', maxWidth: 1120, alignSelf: 'center' }} keyboardShouldPersistTaps="handled" data={loading || loadedDate !== date ? [] : rows} keyExtractor={person => person.id} extraData={{ data, busy, selecting, selectedIds }} ListHeaderComponent={header} refreshing={loading} onRefresh={() => { if (!busyRef.current) void load(); }} ListEmptyComponent={loading ? <SkeletonRows count={5} height={56} label="Loading attendance" /> : error && !data ? <Empty title="Attendance unavailable" body="Retry to load the register. No attendance has been changed." action={<GhostButton label="Retry attendance" onPress={() => void load()} />} /> : <Empty title={query || (pane === 'daily' && statusFilter !== 'all') ? 'No matching staff' : pane === 'staff' && showArchived ? 'No archived staff' : 'No staff for this view'} body={query || (pane === 'daily' && statusFilter !== 'all') ? 'Try another name or attendance status.' : pane === 'staff' && showArchived ? 'Archived staff appear here. Past attendance stays saved.' : 'Add kitchen staff to begin marking attendance.'} action={query || (pane === 'daily' && statusFilter !== 'all') ? <GhostButton label="Reset filters" onPress={() => { setQuery(''); setStatusFilter('all'); }} /> : pane === 'staff' && showArchived ? undefined : <GhostButton label="Add kitchen staff" onPress={() => startEditor()} />} />} renderItem={({ item }) => <Animated.View style={paneEnter}>{pane === 'daily' ? <AttendanceRow key={`${item.id}:${date}`} person={item} record={byStaff.get(item.id)} busy={busy || loading || !mayMark} selecting={selecting} selected={selectedIds.has(item.id)} onSelect={selectPerson} onMark={mark} /> : <View className="min-h-16 flex-row items-center gap-3 border-b border-border-soft bg-surface-elevated px-3 py-2"><StaffIdentity person={item} />{mayRoster ? <IconButton icon={Pencil} label={`Edit staff ${item.name}`} onPress={() => startEditor(item)} /> : null}</View>}</Animated.View>} /></KScreen>;
}
