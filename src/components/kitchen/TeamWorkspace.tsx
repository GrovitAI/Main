import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronDown, ChevronUp, Lock, UserRound } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { colors } from '@/lib/pos/brand';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { kitchenToday } from '@/lib/pos/kitchen-analytics-utils';
import { historyTimeLabel } from '@/lib/pos/kitchen-history-utils';
import { fetchKitchenAudit, fetchKitchenTeam, saveKitchenLock, saveKitchenStaffAccess } from '@/lib/pos/kitchen-access-service';
import { PERMISSION_GROUPS, PRESETS, auditText, dayText, hourText, lockSummary, presetFor, presetLabel } from '@/lib/pos/kitchen-access-utils';
import type { KitchenAuditRow, KitchenPermission, KitchenPreset, KitchenTeamMember } from '@/lib/pos/kitchen-access-types';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { Card, Empty, KHeader, KScreen, Label, LinkButton, Notice, PrimaryButton, Reveal, Section, SelectRow, SettingsGroup, Skeleton, Tick, Toggle, useDesktopDensity } from './ui';
import { DatePickerModal } from '@/components/ui/DatePickerModal';

const HOURS = [6, 8, 10, 11, 12, 14, 18, 22] as const;
const PERMISSION_TOTAL = PERMISSION_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

/**
 * How a desktop shows kitchen permissions (task 220). 'panes' (the owner's
 * option C): the logins in a list beside the chosen person's permissions, all
 * in a three-column grid. 'fold' (option A): the phone's layout, one card per
 * login with folded groups. Phones always fold.
 */
const DESKTOP_LAYOUT: 'panes' | 'fold' = 'panes';

/**
 * The groups split into three columns of about equal height, in order: a
 * group joins the current column while that keeps the column near a third of
 * the rows (each heading counts as a row).
 */
const GRID_COLUMNS: (typeof PERMISSION_GROUPS)[number][][] = (() => {
  const weight = (group: (typeof PERMISSION_GROUPS)[number]): number => group.items.length + 1;
  const target = PERMISSION_GROUPS.reduce((sum, group) => sum + weight(group), 0) / 3;
  const columns: (typeof PERMISSION_GROUPS)[number][][] = [[]];
  let height = 0;
  for (const group of PERMISSION_GROUPS) {
    const column = columns[columns.length - 1];
    if (column && column.length > 0 && columns.length < 3 && height + weight(group) / 2 > target) { columns.push([group]); height = weight(group); }
    else { column?.push(group); height += weight(group); }
  }
  return columns;
})();

/** Unsaved permission changes, kept per login until saved or undone. */
type Drafts = Record<string, KitchenPermission[]>;
const samePermissions = (a: readonly KitchenPermission[], b: readonly KitchenPermission[]): boolean => a.length === b.length && a.every((p) => b.includes(p));

/** The owner's kitchen settings: who may do what, how days lock, and what changed. */
export function TeamWorkspace() {
  const { isOwner, access } = useKitchenAccess();
  const { loaded } = useKitchenData();
  if (loaded && !isOwner) {
    return (
      <KScreen>
        <KHeader title="Team and day lock" onBack={() => backToKitchen()} />
        <Notice tone="neutral" text="Only the owner can change kitchen permissions and day locks." />
      </KScreen>
    );
  }
  return (
    <KeyboardAvoider>
      <KScreen wide={DESKTOP_LAYOUT === 'panes'}>
        <KHeader title="Team and day lock" subtitle="Who can do what in the kitchen, and when days lock" onBack={() => backToKitchen()} />
        <LockCard key={`${access.autoLock}-${access.openUntilHour}-${access.lockThrough ?? ''}`} />
        <TeamSection />
        <AuditSection />
      </KScreen>
    </KeyboardAvoider>
  );
}

/** What "Lock everything up to" is set to: nothing, one of the two usual days, or a picked date. */
type ThroughChoice = 'none' | 'yesterday' | 'month' | 'pick' | 'other';

function LockCard() {
  const { access } = useKitchenAccess();
  const today = access.today || kitchenToday();
  const [autoLock, setAutoLock] = useState(access.autoLock);
  const [hour, setHour] = useState(access.openUntilHour);
  const [through, setThrough] = useState(access.lockThrough ?? '');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yesterday = useMemo(() => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - 1); return kitchenToday(d); }, [today]);
  const lastMonthEnd = useMemo(() => { const d = new Date(`${today}T12:00:00`); d.setDate(0); return kitchenToday(d); }, [today]);
  const changed = autoLock !== access.autoLock || hour !== access.openUntilHour || (through || null) !== access.lockThrough;
  const choice: ThroughChoice = through === '' ? 'none' : through === yesterday ? 'yesterday' : through === lastMonthEnd ? 'month' : 'other';

  const undo = (): void => { setAutoLock(access.autoLock); setHour(access.openUntilHour); setThrough(access.lockThrough ?? ''); setError(null); };
  const chooseThrough = (next: ThroughChoice): void => {
    setError(null);
    if (next === 'pick') { setPicking(true); return; }
    if (next !== 'other') setThrough(next === 'none' ? '' : next === 'yesterday' ? yesterday : lastMonthEnd);
  };
  const save = async () => {
    setBusy(true); setError(null);
    const result = await saveKitchenLock({ autoLock, openUntilHour: hour, lockThrough: through || null }, today);
    setBusy(false);
    if (result.error || !result.data) { setError(result.error ?? 'Unable to save the day lock.'); return; }
    useKitchenStore.setState({ access: result.data });
    useKitchenStore.getState().setNotice('Day lock saved');
  };

  return (
    <Section title="Day lock">
      <SettingsGroup>
        <View className="flex-row items-center gap-2 border-t border-border-soft bg-surface-tint px-3.5 py-2.5">
          <Lock size={15} color={colors.primary} />
          <Text className="flex-1 text-[13px] font-semibold text-text-primary">{lockSummary(access)}</Text>
        </View>
        <Toggle label="Lock each day automatically" on={autoLock} onChange={setAutoLock}
          hint={autoLock ? `Staff can fix yesterday until ${hourText(hour)} today. After that only you can, with a reason.` : 'Staff can change any day their permissions allow.'} />
        <Reveal open={autoLock}>
          <SelectRow label="Yesterday stays open until" value={String(hour)} onChange={(v) => setHour(Number(v))}
            options={HOURS.map((h) => ({ value: String(h), label: hourText(h) }))} />
        </Reveal>
        <SelectRow<ThroughChoice> label="Lock everything up to" value={choice} onChange={chooseThrough}
          valueLabel={choice === 'other' ? dayText(through) : undefined}
          hint={through ? `Nothing dated ${dayText(through)} or earlier changes without your reason.` : 'For example, once the month’s accounts are done.'}
          options={[
            { value: 'none', label: 'No date' },
            { value: 'yesterday', label: 'Yesterday', detail: dayText(yesterday) },
            { value: 'month', label: 'End of last month', detail: dayText(lastMonthEnd) },
            { value: 'pick', label: choice === 'other' ? `Another date · ${dayText(through)}` : 'Another date…' },
          ]} />
        <Reveal open={changed || Boolean(error)}>
          <View className="gap-2 border-t border-border-soft px-3.5 py-3">
            {error ? <Notice text={error} /> : null}
            <View className="flex-row items-center justify-end gap-3">
              <LinkButton label="Undo" onPress={undo} />
              <PrimaryButton label="Save day lock" onPress={() => void save()} disabled={!changed} loading={busy} />
            </View>
          </View>
        </Reveal>
      </SettingsGroup>
      <DatePickerModal visible={picking} mode="single" startDate={through || yesterday} endDate={through || yesterday} onClose={() => setPicking(false)}
        onApply={(day) => {
          setPicking(false);
          if (day > today) { setError('Pick a day up to today.'); return; }
          setThrough(day);
        }} />
    </Section>
  );
}

function TeamSection() {
  const panes = useDesktopDensity() && DESKTOP_LAYOUT === 'panes';
  const [team, setTeam] = useState<KitchenTeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const load = useCallback(async () => {
    const result = await fetchKitchenTeam();
    setError(result.error);
    if (result.data) setTeam(result.data);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const setDraft = (member: KitchenTeamMember, perms: KitchenPermission[] | null): void => setDrafts((all) => {
    const next = { ...all };
    if (perms === null || samePermissions(perms, member.permissions)) delete next[member.staffId]; else next[member.staffId] = perms;
    return next;
  });
  const saved = (next: KitchenTeamMember): void => {
    setTeam((list) => (list ?? []).map((m) => (m.staffId === next.staffId ? next : m)));
    setDraft(next, null);
  };
  const list = team ?? [];
  const current = list.find((m) => m.staffId === chosen) ?? list[0];

  return (
    <Section title="Kitchen logins">
      <Text className="mb-2 text-[13px] leading-5 text-text-secondary">Add a login under Settings › Staff with the role Kitchen. You always have every permission.</Text>
      {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
      {team === null && !error ? (
        <View style={{ gap: 8 }}><Skeleton height={64} /><Skeleton height={64} /></View>
      ) : team && team.length === 0 ? (
        <Card><Empty title="No kitchen logins yet" body="Add a staff member with the role Kitchen at the Central Kitchen, then set what they can do here." /></Card>
      ) : panes && current ? (
        <View className="flex-row items-start gap-3">
          <Card padded={false} style={{ width: 280, overflow: 'hidden' }}>
            {list.map((member, i) => (
              <MemberRow key={member.staffId} member={member} draft={drafts[member.staffId]} selected={member.staffId === current.staffId} first={i === 0}
                onPress={() => setChosen(member.staffId)} />
            ))}
          </Card>
          <Card padded={false} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <View className="px-4 pb-2 pt-3">
              <Text className="text-[17px] font-extrabold text-text-primary">{current.name}</Text>
              {current.email ? <Text className="text-xs text-text-secondary">{current.email}</Text> : null}
            </View>
            <PermissionEditor key={current.staffId} member={current} layout="grid" perms={drafts[current.staffId] ?? current.permissions}
              onChange={(perms) => setDraft(current, perms)} onSaved={saved} />
          </Card>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {list.map((member) => (
            <Card key={member.staffId} padded={false}>
              <MemberRow member={member} draft={drafts[member.staffId]} expanded={open === member.staffId} first
                onPress={() => setOpen((id) => (id === member.staffId ? null : member.staffId))} />
              <Reveal open={open === member.staffId}>
                <PermissionEditor member={member} layout="fold" perms={drafts[member.staffId] ?? member.permissions}
                  onChange={(perms) => setDraft(member, perms)} onSaved={saved} />
              </Reveal>
            </Card>
          ))}
        </View>
      )}
    </Section>
  );
}

/** A login in the list: a tap opens it on a phone, or shows it beside the list on a desktop. */
function MemberRow({ member, draft, selected = false, expanded, first, onPress }: { member: KitchenTeamMember; draft?: KitchenPermission[]; selected?: boolean; expanded?: boolean; first: boolean; onPress: () => void }) {
  const detail = `${presetLabel(member.preset)} · ${member.permissions.length} of ${PERMISSION_TOTAL}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${member.name}, ${detail}${draft ? ', unsaved changes' : ''}`}
      accessibilityState={expanded === undefined ? { selected } : { expanded }}
      className={'min-h-[64px] flex-row items-center gap-3 px-4 py-3 hover:bg-surface-tint active:bg-surface-tint ' + (first ? '' : 'border-t border-border-soft ') + (selected ? 'bg-surface-tint' : '')}>
      <View className={'h-10 w-10 items-center justify-center rounded-full ' + (selected ? 'bg-primary' : 'bg-accent-soft')}><UserRound size={18} color={selected ? colors.textOnPrimary : colors.primary} /></View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{member.name}</Text>
        <Text className={'text-xs ' + (draft ? 'font-bold text-primary' : 'text-text-secondary')} numberOfLines={1}>{draft ? 'Unsaved changes' : detail}</Text>
      </View>
      {expanded === undefined ? null : expanded ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
    </Pressable>
  );
}

/**
 * One login's permissions: the starting role, then the ticks by group, either
 * all at once in three columns ('grid') or folded with a count on each group
 * ('fold'). Save and Undo appear once something differs from what is saved.
 */
function PermissionEditor({ member, perms, layout, onChange, onSaved }: { member: KitchenTeamMember; perms: KitchenPermission[]; layout: 'grid' | 'fold'; onChange: (perms: KitchenPermission[] | null) => void; onSaved: (m: KitchenTeamMember) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const preset: KitchenPreset = presetFor(perms);
  const changed = !samePermissions(perms, member.permissions);
  const toggle = (key: KitchenPermission): void => onChange(perms.includes(key) ? perms.filter((p) => p !== key) : [...perms, key]);

  const save = async () => {
    setBusy(true); setError(null);
    const result = await saveKitchenStaffAccess(member.staffId, preset, perms);
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    onSaved({ ...member, preset, permissions: [...perms].sort(), updatedAt: new Date().toISOString() });
    useKitchenStore.getState().setNotice(`${member.name}’s permissions saved`);
  };
  const ticks = (items: (typeof PERMISSION_GROUPS)[number]['items']) => items.map((item) => {
    const on = perms.includes(item.key);
    return (
      <Pressable key={item.key} onPress={() => toggle(item.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.label}
        className={'flex-row items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-surface-tint active:opacity-80 ' + (layout === 'grid' ? 'min-h-11' : 'min-h-12')}>
        <Tick on={on} size={layout === 'grid' ? 22 : 26} />
        <View className="min-w-0 flex-1">
          <Text className={'font-semibold text-text-primary ' + (layout === 'grid' ? 'text-[13px] leading-[18px]' : 'text-[14px]')}>{item.label}</Text>
          {item.hint ? <Text className="text-xs text-text-secondary">{item.hint}</Text> : null}
        </View>
      </Pressable>
    );
  });

  return (
    <View>
      <SelectRow<KitchenPreset> label="Starting role" value={preset} hint={PRESETS.find((p) => p.id === preset)?.summary ?? 'Custom: switched on one by one.'}
        options={[...PRESETS.map((p) => ({ value: p.id as KitchenPreset, label: p.label, detail: p.summary })), ...(preset === 'custom' ? [{ value: 'custom' as KitchenPreset, label: 'Custom', detail: 'Switched on one by one' }] : [])]}
        onChange={(id) => { const p = PRESETS.find((x) => x.id === id); if (p) onChange([...p.permissions]); }} />
      {layout === 'grid' ? (
        <View className="flex-row border-t border-border-soft px-2 pb-1 pt-3">
          {GRID_COLUMNS.map((column) => (
            <View key={column[0]?.title ?? 'column'} className="min-w-0 flex-1 px-2">
              {column.map((group) => (
                <View key={group.title} className="mb-3">
                  <Label>{group.title}</Label>
                  {ticks(group.items)}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        PERMISSION_GROUPS.map((group) => {
          const count = group.items.filter((item) => perms.includes(item.key)).length;
          const isOpen = openGroup === group.title;
          return (
            <View key={group.title} className="border-t border-border-soft">
              <Pressable onPress={() => setOpenGroup(isOpen ? null : group.title)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${group.title}, ${count} of ${group.items.length} on`}
                className="min-h-[52px] flex-row items-center gap-3 px-4 py-2 hover:bg-surface-tint active:bg-surface-tint">
                <Text className="flex-1 text-[15px] font-bold text-text-primary">{group.title}</Text>
                <Text className={'text-[13px] ' + (count ? 'font-bold text-primary' : 'font-semibold text-text-secondary')} style={{ fontVariant: ['tabular-nums'] }}>{count} of {group.items.length}</Text>
                {isOpen ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
              </Pressable>
              <Reveal open={isOpen}><View className="px-3 pb-2">{ticks(group.items)}</View></Reveal>
            </View>
          );
        })
      )}
      <Reveal open={changed || Boolean(error)}>
        <View className="gap-2 border-t border-border-soft px-4 py-3">
          {error ? <Notice text={error} /> : null}
          <View className="flex-row items-center justify-end gap-3">
            <LinkButton label="Undo" onPress={() => { setError(null); onChange(null); }} />
            <PrimaryButton label={`Save ${member.name.split(' ')[0]}’s permissions`} onPress={() => void save()} disabled={!changed} loading={busy} />
          </View>
        </View>
      </Reveal>
    </View>
  );
}

function AuditSection() {
  const [rows, setRows] = useState<KitchenAuditRow[] | null>(null);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (p: number) => {
    const result = await fetchKitchenAudit(p);
    setError(result.error);
    if (result.data) {
      const next = result.data;
      setRows((list) => (p === 0 ? next : [...(list ?? []), ...next]));
      setMore(next.length === 50);
      setPage(p);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(0); }, [load]));

  return (
    <Section title="Change log">
      {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load(0)} />} /> : null}
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        {rows === null && !error ? (
          <View style={{ paddingVertical: 14, gap: 8 }}><Skeleton height={40} /><Skeleton height={40} /></View>
        ) : rows && rows.length === 0 ? (
          <Empty title="Nothing changed yet" body="Edits, voids, locked-day changes and permission changes will show here." />
        ) : (
          (rows ?? []).map((row) => {
            const text = auditText(row);
            return (
              <View key={row.id} className="border-b border-border-soft py-3" style={{ gap: 2 }}>
                <Text className="text-[14px] font-bold text-text-primary">{text.title}</Text>
                {text.detail ? <Text className="text-xs leading-4 text-text-secondary">{text.detail}</Text> : null}
                <Text className="text-xs leading-4 text-text-secondary">{row.actorName} · {historyTimeLabel(row.createdAt)}</Text>
              </View>
            );
          })
        )}
      </Card>
      {more ? <View className="items-center"><LinkButton label="Show older changes" onPress={() => void load(page + 1)} /></View> : null}
    </Section>
  );
}
