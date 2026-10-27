/**
 * Task 280: the rows every record form shares in the owner's chosen layout (output/previews/
 * task-279, round 7): who it is with, when it happened and an optional note, each a row that
 * opens its own small sheet.
 */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { formatDayLabel, formatMoney, localDateKey } from '@/lib/pos/kitchen-utils';
import { colors, semantic } from '@/lib/pos/brand';
import { AmountPanel, Avatar, LinkButton, PrimaryButton, Sheet, TextField, ValueRow } from './ui';
import { DateField, isValidDateKey, useDateGuard } from './forms';

/** The branch or vendor once chosen: its circle, name and balance, with Change to pick again. */
export function WhoRow({ name, sub, onChange }: { name: string; sub?: string; onChange?: () => void }) {
  return (
    <ValueRow label={name} sub={sub} value={onChange ? 'Change' : null} placeholder="" action={onChange ? 'chevron' : 'none'} disabled={!onChange}
      onPress={() => onChange?.()} lead={<Avatar name={name} size={36} ring={false} />} />
  );
}

/** When it happened: Today, Yesterday or a day on the calendar, in a sheet. */
export function WhenRow({ date, onChange, lockReason, onLockReason, guard = true, label = 'When' }: { date: string; onChange: (d: string) => void; lockReason: string; onLockReason: (r: string) => void; guard?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const ok = useDateGuard(date, lockReason, guard);
  return (
    <>
      <ValueRow label={label} value={date === localDateKey() ? 'Today' : formatDayLabel(date)} onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <DateField value={date} onChange={onChange} lockReason={lockReason} onLockReason={onLockReason} guard={guard} />
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

/**
 * Task 283 (owner's ask): the amount as a row, like the others. A tap opens the number pad at the
 * bottom of a phone; until then the other rows are easy to reach.
 */
export function AmountRow({ amount, open, onPress, label = 'Amount', entered }: { amount: number; open: boolean; onPress: () => void; label?: string; /** A typed zero counts (an opening balance). */ entered?: boolean }) {
  const has = entered ?? amount > 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${has ? formatMoney(amount) : 'not entered'}`} accessibilityState={{ expanded: open }}
      className={`min-h-[60px] flex-row items-center gap-3 border-t border-border-soft px-3.5 py-2.5 ${open ? 'bg-surface-tint' : 'hover:bg-surface-tint active:bg-surface-tint'}`}>
      <Text className="min-w-0 flex-1 text-[15px] font-bold text-text-primary">
        {label}{has ? null : <Text style={{ color: semantic.danger }}> *</Text>}
      </Text>
      <Text className="text-[22px] font-extrabold" style={{ color: has ? colors.textPrimary : colors.border, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }}>{formatMoney(amount)}</Text>
    </Pressable>
  );
}

/**
 * Task 285: the phone's number pad under an amount row. Once everything else is filled in its
 * button saves straight away; until then it is Done, which puts the pad away.
 */
export function AmountPad({ value, onChange, onDone, save, label }: { value: string; onChange: (next: string) => void; onDone: () => void; save?: React.ReactNode; label?: string }) {
  return (
    <AmountPanel value={value} onChange={onChange} label={label} onEnter={onDone}>
      {save ?? <PrimaryButton label="Done" onPress={onDone} />}
    </AmountPanel>
  );
}
