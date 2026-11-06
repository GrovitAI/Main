import { useEffect, useState } from 'react';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { editKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { cleanTypedNumber, formatQty, localDateKey } from '@/lib/pos/kitchen-utils';
import type { KitchenEntryType } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, SettingsGroup, TextField, useSavedThen } from '@/components/kitchen/ui';
import { NoteRow, WhenRow, WhoRow } from '@/components/kitchen/EntryRows';
import { isValidDateKey, useDateGuard } from '@/components/kitchen/forms';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';
import { buzz } from '@/lib/pos/kitchen-haptics';

const EDITABLE: readonly KitchenEntryType[] = ['made'];

/**
 * Task 304: corrects a batch: how much, which day and its note. As with every edit, the earlier
 * entry stays in History as replaced, and stock moves by the difference.
 */
export default function BatchEditScreen() {
  const data = useKitchenData();
  const access = useKitchenAccess();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useSavedThen();

  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setQty(String(editing.qty ?? ''));
    setDate(editing.entry_date);
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled]);

  const item = editing?.item_id ? data.itemsById.get(editing.item_id) ?? null : null;
  const unit = item?.unit ?? '';
  const amount = Number(qty);
  const dateOk = useDateGuard(date, lockReason);
  const changed = useTypedChanges(JSON.stringify({ qty: qty.trim(), date, note: note.trim() }), prefilled);
  const mayChange = !!editing && (access.isOwner || (access.canFix(editing) && !access.isLocked(editing.entry_date)));
  useLeaveGuard(changed && !done.saved, 'Your changes');
  const reason = !qty.trim() || !Number.isFinite(amount) || amount <= 0 ? 'Enter the quantity' : !isValidDateKey(date) || !dateOk ? 'Check the date' : !changed ? 'Nothing changed' : undefined;

  const save = async (): Promise<void> => {
    if (!editing?.item_id || reason || !mayChange || saving) return;
    setSaving(true);
    setError(null);
    const res = await editKitchenEntry(editing.id, { type: 'made', item_id: editing.item_id, entry_date: date, qty: amount, note: note.trim() || null }, lockReason);
    if (res.error) {
      setSaving(false);
      setError(res.error);
      buzz('error');
      return;
    }
    done.mark();
    await data.load(true);
    setSaving(false);
    useKitchenStore.getState().setNotice('Batch changed');
    done.finish(backToKitchen);
  };

  return (
    <KeyboardAvoider>
      <KScreen footer={<PrimaryButton label="Save changes" onPress={() => void save()} disabled={!!reason || !mayChange} loading={saving} done={done.saved} reason={reason} />}>
        <KHeader title="Edit batch" onBack={() => backToKitchen()} />
        {missing ? <Notice text="This batch cannot be edited here: it is voided or older than three months." /> : null}
        {editing && !mayChange ? <Notice tone="neutral" text="Your login cannot change this batch. Ask the owner or a kitchen manager." /> : null}
        {editing ? (
          <>
            <SettingsGroup>
              <WhoRow name={item?.name ?? 'Removed item'} sub={item ? `${formatQty(item.stock, item.unit)} in stock` : undefined} />
              <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
              <NoteRow value={note} onChange={setNote} />
            </SettingsGroup>
            <Field label={unit ? `Quantity made, ${unit}` : 'Quantity made'}>
              <TextField value={qty} onChange={(t) => setQty(cleanTypedNumber(t, unit === 'pcs' ? 0 : 3))} label="Quantity made" keyboardType="decimal-pad" />
            </Field>
          </>
        ) : null}
        {error ? <Notice text={error} /> : null}
      </KScreen>
    </KeyboardAvoider>
  );
}
