import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Card, Chips, Empty, Field, GhostButton, KHeader, KScreen, LinkButton, Notice, PrimaryButton, Reveal, Section, Segmented, Skeleton, TextField, Tick } from './ui';
import { isValidDateKey } from './forms';

const HOURS = [6, 8, 10, 11, 12, 14, 18, 22] as const;

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
      <KScreen>
        <KHeader title="Team and day lock" subtitle="Who can do what in the kitchen, and when days lock" onBack={() => backToKitchen()} />
        <LockCard key={`${access.autoLock}-${access.openUntilHour}-${access.lockThrough ?? ''}`} />
        <TeamSection />
        <AuditSection />
      </KScreen>
    </KeyboardAvoider>
  );
}

function LockCard() {
  const { access } = useKitchenAccess();
  const today = access.today || kitchenToday();
  const [autoLock, setAutoLock] = useState(access.autoLock);
  const [hour, setHour] = useState(access.openUntilHour);
  const [through, setThrough] = useState(access.lockThrough ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yesterday = useMemo(() => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - 1); return kitchenToday(d); }, [today]);
  const lastMonthEnd = useMemo(() => { const d = new Date(`${today}T12:00:00`); d.setDate(0); return kitchenToday(d); }, [today]);
  const throughValid = through === '' || (isValidDateKey(through) && through <= today);
  const changed = autoLock !== access.autoLock || hour !== access.openUntilHour || (through || null) !== access.lockThrough;

  const save = async () => {
    if (!throughValid) return;
    setBusy(true); setError(null);
    const result = await saveKitchenLock({ autoLock, openUntilHour: hour, lockThrough: through || null }, today);
    setBusy(false);
    if (result.error || !result.data) { setError(result.error ?? 'Unable to save the day lock.'); return; }
    useKitchenStore.setState({ access: result.data });
    useKitchenStore.getState().setNotice('Day lock saved');
  };

  return (
    <Section title="Day lock">
      <Card>
        <View className="flex-row items-center gap-2">
          <Lock size={16} color={colors.textSecondary} />
          <Text className="flex-1 text-[13px] font-semibold text-text-secondary">{lockSummary(access)}</Text>
        </View>
        <Field label="Lock each day automatically" hint={autoLock ? `Staff can still fix yesterday until ${hourText(hour)} today. After that only you can, with a reason.` : 'Staff can change any day their permissions allow.'}>
          <Segmented options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} value={autoLock ? 'on' : 'off'} onChange={(v) => setAutoLock(v === 'on')} />
        </Field>
        {autoLock ? (
          <Field label="Yesterday stays open until">
            <Chips options={HOURS.map((h) => ({ value: String(h), label: hourText(h) }))} value={String(hour)} onChange={(v) => setHour(Number(v))} />
          </Field>
        ) : null}
        <Field label="Lock everything up to" hint={through ? `Nothing dated ${dayText(through)} or earlier can change without your reason.` : 'For example, after the month’s accounts are done.'}>
          <Chips
            options={[{ value: '', label: 'No date' }, { value: yesterday, label: 'Yesterday' }, { value: lastMonthEnd, label: `End of last month · ${dayText(lastMonthEnd)}` }]}
            value={[yesterday, lastMonthEnd, ''].includes(through) ? through : '__other'}
            onChange={setThrough}
          />
          <View style={{ marginTop: 8 }}>
            <TextField value={through} onChange={setThrough} label="Lock up to date" placeholder="Year-month-day, for example 2026-09-30" keyboardType="numeric" />
          </View>
          {!throughValid ? <View style={{ marginTop: 8 }}><Notice text="Enter a date up to today, as year-month-day." /></View> : null}
        </Field>
        {error ? <View style={{ marginTop: 10 }}><Notice text={error} /></View> : null}
        <View style={{ marginTop: 14 }}><PrimaryButton label="Save day lock" onPress={() => void save()} disabled={!changed || !throughValid} loading={busy} /></View>
      </Card>
    </Section>
  );
}

function TeamSection() {
  const [team, setTeam] = useState<KitchenTeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const result = await fetchKitchenTeam();
    setError(result.error);
    if (result.data) setTeam(result.data);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Section title="Kitchen logins">
      <Text className="mb-2 text-[13px] leading-5 text-text-secondary">Each person signs in with their own login. Add one under Settings › Staff with the role Kitchen. You always have every permission.</Text>
      {error ? <Notice text={error} action={<LinkButton label="Retry" onPress={() => void load()} />} /> : null}
      {team === null && !error ? (
        <View style={{ gap: 8 }}><Skeleton height={64} /><Skeleton height={64} /></View>
      ) : team && team.length === 0 ? (
        <Card><Empty title="No kitchen logins yet" body="Add a staff member with the role Kitchen at the Central Kitchen, then set what they can do here." /></Card>
      ) : (
        <View style={{ gap: 10 }}>
          {(team ?? []).map((member) => (
            <MemberCard key={member.staffId} member={member} open={open === member.staffId}
              onToggle={() => setOpen((id) => (id === member.staffId ? null : member.staffId))}
              onSaved={(next) => setTeam((list) => (list ?? []).map((m) => (m.staffId === next.staffId ? next : m)))} />
          ))}
        </View>
      )}
    </Section>
  );
}

function MemberCard({ member, open, onToggle, onSaved }: { member: KitchenTeamMember; open: boolean; onToggle: () => void; onSaved: (m: KitchenTeamMember) => void }) {
  const [perms, setPerms] = useState<KitchenPermission[]>(member.permissions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!open) { setPerms(member.permissions); setError(null); } }, [open, member.permissions]);
  const preset: KitchenPreset = presetFor(perms);
  const changed = perms.length !== member.permissions.length || perms.some((p) => !member.permissions.includes(p));
  const toggle = (key: KitchenPermission) => setPerms((list) => (list.includes(key) ? list.filter((p) => p !== key) : [...list, key]));

  const save = async () => {
    setBusy(true); setError(null);
    const result = await saveKitchenStaffAccess(member.staffId, preset, perms);
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    onSaved({ ...member, preset, permissions: [...perms].sort(), updatedAt: new Date().toISOString() });
    useKitchenStore.getState().setNotice(`${member.name}’s permissions saved`);
  };

  return (
    <Card padded={false}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${member.name}, ${presetLabel(member.preset)}`}
        className="min-h-[64px] flex-row items-center gap-3 rounded-2xl px-4 py-3 hover:bg-surface-tint active:opacity-80">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft"><UserRound size={18} color={colors.primary} /></View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-text-primary" numberOfLines={1}>{member.name}</Text>
          <Text className="text-xs text-text-secondary" numberOfLines={1}>{presetLabel(member.preset)} · {member.permissions.length} of 25 permissions{member.email ? ` · ${member.email}` : ''}</Text>
        </View>
        {open ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
      </Pressable>
      <Reveal open={open}>
        <View className="border-t border-border-soft px-4 pb-4 pt-3" style={{ gap: 14 }}>
          <Field label="Starting role" hint={PRESETS.find((p) => p.id === preset)?.summary ?? 'Custom: switched on one by one below.'}>
            <Chips options={[...PRESETS.map((p) => ({ value: p.id as KitchenPreset, label: p.label })), ...(preset === 'custom' ? [{ value: 'custom' as KitchenPreset, label: 'Custom' }] : [])]}
              value={preset} onChange={(id) => { const p = PRESETS.find((x) => x.id === id); if (p) setPerms([...p.permissions]); }} />
          </Field>
          {PERMISSION_GROUPS.map((group) => (
            <View key={group.title}>
              <Text className="mb-1 text-xs font-extrabold uppercase tracking-wide text-text-secondary">{group.title}</Text>
              {group.items.map((item) => {
                const on = perms.includes(item.key);
                return (
                  <Pressable key={item.key} onPress={() => toggle(item.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={item.label}
                    className="min-h-[48px] flex-row items-center gap-3 rounded-xl px-1 py-2 hover:bg-surface-tint active:opacity-80">
                    <Tick on={on} />
                    <View className="min-w-0 flex-1">
                      <Text className="text-[14px] font-semibold text-text-primary">{item.label}</Text>
                      {item.hint ? <Text className="text-xs text-text-secondary">{item.hint}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {error ? <Notice text={error} /> : null}
          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1"><GhostButton label="Undo changes" onPress={() => setPerms(member.permissions)} disabled={!changed || busy} /></View>
            <View className="flex-1"><PrimaryButton label="Save" onPress={() => void save()} disabled={!changed} loading={busy} /></View>
          </View>
        </View>
      </Reveal>
    </Card>
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
      {more ? <View style={{ marginTop: 10 }}><GhostButton label="Show older changes" onPress={() => void load(page + 1)} /></View> : null}
    </Section>
  );
}
