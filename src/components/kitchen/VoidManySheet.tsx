import { useState } from 'react';
import { View } from 'react-native';
import { voidKitchenEntry } from '@/lib/pos/kitchen-service';
import { useKitchenAccess, useKitchenStore } from '@/lib/pos/use-kitchen-store';
import type { KitchenEntry } from '@/lib/pos/kitchen-types';
import { Notice, PrimaryButton, Sheet, TextField } from './ui';

/**
 * Task 298: voids the entries picked in History. Newest first, so a stock count puts back the
 * figure it found. Each stays in the history, marked void, and any stock it moved goes back. If
 * some cannot be voided, the rest still are, and those that failed stay picked.
 */
export function VoidManySheet({ visible, entries, onClose, onDone, onPartly }: {
  visible: boolean; entries: readonly KitchenEntry[]; onClose: () => void; onDone: () => void; onPartly: (leftIds: string[]) => void;
}) {
  const access = useKitchenAccess();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anyLocked = entries.some((e) => access.isLocked(e.entry_date));
  const count = entries.length;
  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const newestFirst = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const left: string[] = [];
    let firstError: string | null = null;
    for (const entry of newestFirst) {
      const res = await voidKitchenEntry(entry.id, reason.trim() || null);
      if (res.error) {
        left.push(entry.id);
        firstError = firstError ?? res.error;
      }
    }
    const store = useKitchenStore.getState();
    await store.load(true);
    setBusy(false);
    const voided = count - left.length;
    if (left.length > 0) {
      setError(`${voided} voided. ${left.length} could not be: ${firstError ?? 'please try again.'}`);
      onPartly(left);
      return;
    }
    store.setNotice(`${voided} ${voided === 1 ? 'entry' : 'entries'} voided`);
    setReason('');
    onDone();
  };
  return (
    <Sheet visible={visible} onClose={busy ? () => undefined : onClose} dirty={reason.trim().length > 0} title={`Void ${count} ${count === 1 ? 'entry' : 'entries'}?`}>
      <View style={{ gap: 12 }}>
        <Notice tone="neutral" text="They stay in the history, marked void. Any stock they moved goes back." />
        <TextField value={reason} onChange={setReason} label="Reason" placeholder={anyLocked ? 'Needed for a locked day' : 'Optional'} />
        {error ? <Notice text={error} /> : null}
        <PrimaryButton label={`Void ${count}`} tone="out" loading={busy} disabled={busy || count === 0 || (anyLocked && !reason.trim())} reason={anyLocked && !reason.trim() ? 'Give a reason' : undefined} onPress={() => void run()} />
      </View>
    </Sheet>
  );
}
