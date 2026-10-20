/**
 * Task 280: the rows every record form shares in the owner's chosen layout (output/previews/
 * task-279, round 7): who it is with, when it happened and an optional note, each a row that
 * opens its own small sheet.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { formatDayLabel, localDateKey } from '@/lib/pos/kitchen-utils';
import { Avatar, LinkButton, PrimaryButton, Sheet, TextField, ValueRow } from './ui';
import { DateField, isValidDateKey, useDateGuard } from './forms';

/** The branch or vendor once chosen: its circle, name and balance, with Change to pick again. */
export function WhoRow({ name, sub, onChange }: { name: string; sub?: string; onChange?: () => void }) {
  return (
    <ValueRow label={name} sub={sub} value={onChange ? 'Change' : null} placeholder="" action={onChange ? 'chevron' : 'none'} disabled={!onChange}
      onPress={() => onChange?.()} lead={<Avatar name={name} size={36} ring={false} />} />
  );
}

/** When it happened: Today, Yesterday or a day on the calendar, in a sheet. */
export function WhenRow({ date, onChange, lockReason, onLockReason }: { date: string; onChange: (d: string) => void; lockReason: string; onLockReason: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const ok = useDateGuard(date, lockReason);
  return (
    <>
      <ValueRow label="When" value={date === localDateKey() ? 'Today' : formatDayLabel(date)} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="When">
        <DateField value={date} onChange={onChange} lockReason={lockReason} onLockReason={onLockReason} />
        <View className="mt-4"><PrimaryButton label="Done" onPress={() => setOpen(false)} disabled={!isValidDateKey(date) || !ok} reason="Check the date" /></View>
      </Sheet>
    </>
  );
}

/** An optional note, as a row: Add until one is written. */
export function NoteRow({ value, onChange, placeholder = 'A bill number, or anything to remember' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <>
      <ValueRow label="Note" value={value.trim() || null} placeholder="Add" action="plus" onPress={() => { setDraft(value); setOpen(true); }} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Note" dirty={draft !== value}>
        <TextField label="Note" value={draft} onChange={setDraft} placeholder={placeholder} autoFocus />
        <View className="mt-4"><PrimaryButton label="Done" onPress={() => { onChange(draft.trim()); setOpen(false); }} /></View>
        {value ? <View className="mt-1 items-center"><LinkButton label="Remove note" onPress={() => { onChange(''); setOpen(false); }} /></View> : null}
      </Sheet>
    </>
  );
}

/** The footer of a send or buy: what is on it and the total on the left, the save on the right. */
export function TotalBar({ caption, total, showTotal, children }: { caption: string; total: string; showTotal: boolean; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-bold text-text-secondary" numberOfLines={1}>{caption}</Text>
        {showTotal ? <Text className="text-[22px] font-extrabold text-text-primary" style={{ letterSpacing: -0.3, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{total}</Text> : null}
      </View>
      <View style={{ flex: 1.3 }}>{children}</View>
    </View>
  );
}
