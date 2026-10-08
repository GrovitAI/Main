import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import type { ReportOption } from '@/lib/pos/kitchen-analytics-types';
import { SearchBox } from '@/components/kitchen/ui';

export function ReportSelect({ label, value, options, onChange, emptyLabel = 'All', selectedLabel }: {
  label: string; value: string | null; options: readonly ReportOption[];
  onChange: (id: string | null) => void; emptyLabel?: string; selectedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = value ? options.find(option => option.id === value)?.label ?? selectedLabel ?? value : emptyLabel;
  const rows = useMemo(() => [{ id: '', label: emptyLabel }, ...options].filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [options, emptyLabel, search]);
  const close = () => { setOpen(false); setSearch(''); };
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-xs font-bold text-text-secondary">{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label + ': ' + selected} onPress={() => setOpen(true)}
        className="min-h-12 flex-row items-center justify-between gap-2 rounded-xl bg-surface-tint px-3 py-2 hover:bg-accent-soft active:opacity-70 focus:border focus:border-primary">
        <Text className="flex-1 text-sm font-semibold text-text-primary">{selected}</Text>
        <ChevronDown size={16} color={colors.primary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: colors.overlay }}>
          <View className="max-h-[80%] w-full max-w-[480px] rounded-2xl bg-surface-elevated p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-text-primary">{label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close picker" onPress={close} className="h-12 w-12 items-center justify-center rounded-xl hover:bg-surface-tint active:opacity-60">
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <SearchBox value={search} onChange={setSearch} placeholder={'Search ' + label.toLowerCase()} />
            <FlatList data={rows} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
              className="mt-3 max-h-[360px]" ListEmptyComponent={<Text className="py-4 text-sm text-text-secondary">No matches. Try another name.</Text>}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === (value ?? '') }}
                  onPress={() => { onChange(item.id || null); close(); }} className="min-h-12 flex-row items-center gap-2 border-b border-border-soft py-3 hover:bg-surface-tint active:opacity-60">
                  <Text className="flex-1 text-sm font-semibold text-text-primary">{item.label}</Text>
                  {item.id === (value ?? '') ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              )} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
