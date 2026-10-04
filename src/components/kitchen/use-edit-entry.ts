import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useKitchenStore } from '@/lib/pos/use-kitchen-store';
import type { KitchenEntry, KitchenEntryType } from '@/lib/pos/kitchen-types';

/**
 * A form opened with `?edit=<entry id>` corrects that entry instead of adding
 * one. The entry comes from the store's recent list, so an entry older than
 * the window, a voided one, or one of another kind cannot be edited here;
 * `missing` says so and the form keeps its save disabled.
 */
export function useEditEntry(types: readonly KitchenEntryType[]): { editing: KitchenEntry | null; missing: boolean } {
  const params = useLocalSearchParams<{ edit?: string }>();
  const entries = useKitchenStore((s) => s.entries);
  const loaded = useKitchenStore((s) => s.loaded);
  const editId = typeof params.edit === 'string' && params.edit.length > 0 ? params.edit : null;
  const editing = useMemo(
    () => (editId ? entries.find((e) => e.id === editId && types.includes(e.type) && e.voided_at === null) ?? null : null),
    [entries, editId, types],
  );
  return { editing, missing: editId !== null && loaded && editing === null };
}
