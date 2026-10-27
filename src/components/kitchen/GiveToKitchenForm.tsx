import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { backToKitchen } from '@/lib/pos/kitchen-nav';
import { useLeaveGuard, useTypedChanges } from '@/lib/pos/use-leave-guard';
import { editKitchenEntry, postKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenData, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import { localDateKey, oftenGiven } from '@/lib/pos/kitchen-utils';
import type { KitchenEntryType, PostEntryInput } from '@/lib/pos/kitchen-types';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { Field, KHeader, KScreen, Notice, PrimaryButton, SettingsGroup, Sheet, useSavedThen } from '@/components/kitchen/ui';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { isValidDateKey, typedLines, useDateGuard } from '@/components/kitchen/forms';
import { ItemLines, ItemSearch, LinePad, useDraftLines } from '@/components/kitchen/EntryLines';
import { NoteRow, WhenRow } from '@/components/kitchen/EntryRows';
import { useResponsive } from '@/lib/pos/useResponsive';
import { useEditEntry } from '@/components/kitchen/use-edit-entry';

const EDITABLE: readonly KitchenEntryType[] = ['issued'];

/**
 * Task 242, the owner's flow for raw materials: a buy goes into the store, and what the store gives
 * to the kitchen counts as used. Quantities only. More than the store shows is allowed (stock can
 * run behind until the next count) but is pointed out. Task 286: in the Send layout - when and a
 * note as rows, the raw materials as lines with - and +, and a tap on a quantity opens the pad.
 */
export function GiveToKitchenForm() {
  const data = useKitchenData();
  const { editing, missing } = useEditEntry(EDITABLE);
  const [date, setDate] = useState(localDateKey());
  const draft = useDraftLines();
  const { lines, order, active } = draft;
  const phone = !useResponsive().isTablet;
  const [note, setNote] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<string | null>(null);
  const done = useSavedThen();

  useEffect(() => {
    if (!editing || prefilled === editing.id) return;
    setDate(editing.entry_date);
    draft.reset(Object.fromEntries(editing.lines.map((l) => [l.item_id, { qty: l.qty, price: null }])), editing.lines.map((l) => l.item_id));
    setNote(editing.note ?? '');
    setPrefilled(editing.id);
  }, [editing, prefilled, draft]);

  const chosen = useMemo(() => Object.entries(lines).filter(([, l]) => l.qty > 0).map(([item_id, l]) => ({ item_id, qty: l.qty })), [lines]);
  // An edit gives back what the entry took before it is posted again, so that counts as in the store.
  const before = useMemo(() => new Map((editing?.lines ?? []).map((l) => [l.item_id, l.qty])), [editing]);
  const over = chosen
    .map((l) => ({ line: l, item: data.itemsById.get(l.item_id) }))
    .filter(({ line, item }) => item && line.qty > item.stock + (before.get(line.item_id) ?? 0));
  const picks = useMemo(() => (editing ? [] : oftenGiven(data.entries)), [data.entries, editing]);
  const dateOk = useDateGuard(date, lockReason);
  const canSave = !missing && chosen.length > 0 && isValidDateKey(date) && dateOk;

  const typed = useTypedChanges(JSON.stringify({ lines: typedLines(lines), note: note.trim() }), prefilled);
  useLeaveGuard(typed && !done.saved, 'The quantities you typed');
  const save = async (): Promise<void> => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const input: PostEntryInput = { type: 'issued', entry_date: date, lines: chosen, note: note.trim() || null };
    const res = editing ? await editKitchenEntry(editing.id, input, lockReason) : await postKitchenEntry(input, lockReason);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      buzz('error');
      return;
    }
    done.mark();
    await data.load(true);
    useKitchenStore.getState().setNotice(editing ? 'Changes saved' : `Given to the kitchen · ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}`);
    done.finish(backToKitchen);
  };

  const activeItem = active ? data.itemsById.get(active.itemId) ?? null : null;
  const activeLine = active ? lines[active.itemId] ?? null : null;
  const pad = activeItem && activeLine && active ? (
    <LinePad key={activeItem.id} it={activeItem} line={activeLine} field="qty" showAmounts={false}
      onField={() => undefined} onChange={(l) => draft.update(activeItem.id, l)} onDone={() => draft.setActive(null)} />
  ) : null;
  const saveButton = <PrimaryButton label={editing ? 'Save changes' : 'Give to kitchen'} onPress={() => void save()} disabled={!canSave} loading={saving} done={done.saved}
    reason={chosen.length === 0 ? 'Add a quantity' : !isValidDateKey(date) || !dateOk ? 'Check the date' : undefined} />;
  const rows = (
    <SettingsGroup>
      <WhenRow date={date} onChange={setDate} lockReason={lockReason} onLockReason={setLockReason} />
      <NoteRow value={note} onChange={setNote} placeholder="What it is for, e.g. Mousse batch" />
    </SettingsGroup>
  );
  const items = (
    <Field label={chosen.length ? `Raw materials · ${chosen.length}` : 'Raw materials'}>
      <ItemSearch items={data.items} mode="cost" lines={lines} picks={picks} showAmounts={false} onAdd={(it) => draft.add(it, null)} />
      <ItemLines items={data.itemsById} lines={lines} order={order} onChange={draft.change} active={active} showAmounts={false}
        onOpen={(itemId) => draft.setActive({ itemId, field: 'qty' })} />
      {over.length > 0 ? (
        <Text className="mt-2 px-1 text-[13px] font-semibold text-text-secondary">
          More than the store shows for {over.map(({ item }) => item?.name ?? '').join(', ')}. Check the quantity, or count the store.
        </Text>
      ) : null}
    </Field>
  );

  return (
    <KeyboardAvoider>
      <KScreen footer={phone && pad ? pad : saveButton}>
        <KHeader title={editing ? 'Edit what was given' : 'Give to the kitchen'} subtitle={editing ? 'The earlier entry is voided; this one takes its place' : 'Out of the store; counted as used'} onBack={() => backToKitchen()} />
        {missing ? <Notice text="That entry cannot be edited here: it is voided, older than three months, or not a give to the kitchen." /> : null}
        {phone ? <>{rows}{items}</> : (
          <View className="flex-row" style={{ gap: 20 }}>
            <View style={{ width: 340 }}>{rows}</View>
            <View className="min-w-0 flex-1" style={{ marginTop: -10 }}>{items}</View>
          </View>
        )}
        {error ? <Notice text={error} /> : null}
        <View style={{ height: 8 }} />
      </KScreen>
      {!phone ? <Sheet visible={!!pad} onClose={() => draft.setActive(null)} title="Quantity">{pad}</Sheet> : null}
    </KeyboardAvoider>
  );
}
