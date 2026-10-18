import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { Check, ChevronDown, X, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import type { ReportOption } from '@/lib/pos/kitchen-analytics-types';
import { SearchBox, Tick } from '@/components/kitchen/ui';

export function ReportSelect({ label, value, options, onChange, emptyLabel = 'All', selectedLabel, compact = false, allowEmpty = true, toolbar = false, outlined = false, inlineLabel, triggerText, triggerIcon: TriggerIcon }: {
  label: string; value: string | null; options: readonly ReportOption[];
  onChange: (id: string | null) => void; emptyLabel?: string; selectedLabel?: string; compact?: boolean; allowEmpty?: boolean;
  toolbar?: boolean; outlined?: boolean; inlineLabel?: string; triggerText?: string; triggerIcon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = value ? options.find(option => option.id === value)?.label ?? selectedLabel ?? value : emptyLabel;
  const rows = useMemo(() => [...(allowEmpty ? [{ id: '', label: emptyLabel }] : []), ...options].filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [options, emptyLabel, search, allowEmpty]);
  const close = () => { setOpen(false); setSearch(''); };
  return (
    <View className={'min-w-0 gap-1 ' + (inlineLabel ? 'shrink-0' : 'flex-1')}>
      {!compact && !toolbar && !inlineLabel ? <Text className="text-xs font-bold text-text-secondary">{label}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label + ': ' + selected} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)}
        className={(inlineLabel ? 'min-h-11 ' : 'min-h-12 ') + 'flex-row items-center justify-between gap-2 rounded-xl px-3 py-2 focus:border focus:border-primary ' + (toolbar || outlined ? 'border border-border bg-surface-elevated hover:bg-accent-soft active:bg-accent-soft' : 'bg-surface-tint hover:bg-accent-soft active:opacity-70')}>
        {inlineLabel ? <Text className="w-20 shrink-0 text-xs font-semibold leading-4 text-text-secondary">{inlineLabel}</Text> : null}
        {toolbar && TriggerIcon ? <TriggerIcon size={16} color={colors.primary} /> : null}
        <View className="min-w-0 flex-1">
          {compact && !toolbar && !inlineLabel ? <Text className="text-xs font-bold leading-4 text-text-secondary">{label}</Text> : null}
          <Text className="text-sm font-semibold leading-5 text-text-primary">{triggerText ?? selected}</Text>
        </View>
        <ChevronDown size={16} color={colors.primary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 items-center justify-center px-4" style={{ backgroundColor: colors.overlay }}>
          {/* A tap outside the list closes it. */}
          <Pressable accessible={false} tabIndex={-1} onPress={close} className="absolute inset-0" testID="report-select-backdrop" />
          <View accessibilityViewIsModal className="max-h-[80%] w-full max-w-[480px] shrink rounded-2xl bg-surface-elevated p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-text-primary">{label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close picker" onPress={close} className="h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-tint active:opacity-60">
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <SearchBox value={search} onChange={setSearch} placeholder={'Search ' + label.toLowerCase()} />
            <FlatList data={rows} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
              className="mt-3 max-h-[360px] shrink" ListEmptyComponent={<Text className="py-4 text-sm text-text-secondary">No matches. Try another name.</Text>}
              ItemSeparatorComponent={() => <View className="h-1" />}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === (value ?? '') }} aria-selected={item.id === (value ?? '')}
                  onPress={() => { onChange(item.id || null); close(); }} className={'min-h-12 flex-row items-center gap-2 rounded-lg border border-transparent px-3 py-2 focus:border-primary ' + (item.id === (value ?? '') ? 'bg-surface-tint' : 'bg-surface-elevated hover:bg-accent-soft active:bg-accent-soft')}>
                  <Text className="flex-1 text-sm font-semibold text-text-primary">{item.label}</Text>
                  {item.id === (value ?? '') ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              )} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/**
 * A dropdown that ticks several options at once (task 224), with Select all at the top. Each tick
 * applies straight away, and the trigger names what is chosen. It looks like ReportSelect.
 */
export function ReportMultiSelect<T extends string>({ label, options, value, onChange, allLabel, noneLabel = 'None chosen' }: {
  label: string; options: readonly { id: T; label: string }[]; value: readonly T[]; onChange: (next: T[]) => void; allLabel: string; noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const all = options.every(option => value.includes(option.id));
  const summary = all ? allLabel : value.length === 0 ? noneLabel : options.filter(option => value.includes(option.id)).map(option => option.label).join(', ');
  const toggle = (id: T): void => onChange(options.filter(option => (option.id === id ? !value.includes(id) : value.includes(option.id))).map(option => option.id));
  const close = (): void => setOpen(false);
  const row = 'min-h-12 flex-row items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:bg-accent-soft active:bg-accent-soft focus:border-primary';
  return (
    <View className="min-w-0 flex-1">
      <Pressable accessibilityRole="button" accessibilityLabel={label + ': ' + summary} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)}
        className="min-h-12 flex-row items-center justify-between gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2 hover:bg-accent-soft focus:border-primary active:bg-accent-soft">
        <Text className="min-w-0 flex-1 text-sm font-semibold leading-5 text-text-primary" numberOfLines={1}>{summary}</Text>
        <ChevronDown size={16} color={colors.primary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: colors.overlay }}>
          {/* A tap outside the list closes it. */}
          <Pressable accessible={false} tabIndex={-1} onPress={close} className="absolute inset-0" testID="report-multiselect-backdrop" />
          <View accessibilityViewIsModal className="w-full max-w-[400px] rounded-2xl bg-surface-elevated p-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-text-primary">{label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close picker" onPress={close} className="h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-tint active:opacity-60">
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Pressable accessibilityRole="checkbox" accessibilityLabel="Select all" aria-checked={all} accessibilityState={{ checked: all }}
              onPress={() => onChange(all ? [] : options.map(option => option.id))} className={row}>
              <Tick on={all} size={22} />
              <Text className="flex-1 text-sm font-bold text-text-primary">Select all</Text>
            </Pressable>
            <View className="my-1 h-px bg-border-soft" />
            {options.map(option => {
              const on = value.includes(option.id);
              return (
                <Pressable key={option.id} accessibilityRole="checkbox" accessibilityLabel={option.label} aria-checked={on} accessibilityState={{ checked: on }}
                  onPress={() => toggle(option.id)} className={row}>
                  <Tick on={on} size={22} />
                  <Text className="flex-1 text-sm font-semibold text-text-primary">{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}
