import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { rankOptions, type SearchSelectOption } from '@/lib/pos/search-select-utils';

export type { SearchSelectOption } from '@/lib/pos/search-select-utils';

export type SearchSelectProps = {
  value: string | null;
  options: SearchSelectOption[];
  onChange: (id: string) => void;
  /** Shown in the field when nothing is picked, and as the sheet's title. */
  placeholder: string;
  /** Hint under the search box, such as "Type to filter". */
  searchPlaceholder?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * A single-choice field for a phone: one line showing the pick, and a sheet
 * with a search box that narrows the list as letters are typed. Replaces a
 * wall of chips where the list is long or the screen is small.
 */
export function SearchSelect({ value, options, onChange, placeholder, searchPlaceholder = 'Type to filter', disabled = false, accessibilityLabel }: SearchSelectProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const shown = useMemo(() => rankOptions(options, query), [options, query]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        className={`min-h-[44px] flex-row items-center rounded-xl border border-border bg-white px-3 ${disabled ? 'opacity-50' : ''}`}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : disabled ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        accessibilityValue={{ text: selected?.label ?? 'Nothing picked' }}
      >
        <View className="flex-1">
          <Text className={`text-sm ${selected ? 'font-semibold text-text-primary' : 'text-text-secondary'}`} numberOfLines={1}>
            {selected?.label ?? placeholder}
          </Text>
          {selected?.hint ? <Text className="text-[11px] text-text-secondary" numberOfLines={1}>{selected.hint}</Text> : null}
        </View>
        <ChevronDown size={16} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoider>
          <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
            <Pressable onPress={() => undefined} className="max-h-[80%] rounded-t-3xl bg-white" style={{ paddingBottom: Math.max(12, insets.bottom) }}>
              <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
                <Text className="text-base font-bold text-text-primary">{placeholder}</Text>
                <Pressable
                  onPress={() => setOpen(false)}
                  className="h-[44px] w-[44px] items-center justify-center rounded-full"
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
              <View className="mx-4 mb-2 min-h-[44px] flex-row items-center rounded-xl border border-border bg-white px-3">
                <Search size={16} color={colors.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={colors.textSecondary}
                  className="ml-2 flex-1 text-sm text-text-primary"
                  autoFocus
                  autoCorrect={false}
                  accessibilityLabel={`Search ${placeholder.toLowerCase()}`}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} className="h-[36px] w-[36px] items-center justify-center" hitSlop={4} accessibilityRole="button" accessibilityLabel="Clear search">
                    <X size={14} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
              <FlatList
                data={shown}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = item.id === value;
                  return (
                    <Pressable
                      onPress={() => pick(item.id)}
                      className={`min-h-[48px] flex-row items-center border-b border-border-soft ${item.nested ? 'pl-9 pr-5' : 'px-5'} ${active ? 'bg-accent-soft' : ''}`}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label}
                    >
                      <View className="flex-1">
                        <Text className={`text-sm ${active ? 'font-bold text-primary' : 'font-semibold text-text-primary'}`} numberOfLines={1}>{item.label}</Text>
                        {item.hint ? <Text className="text-[11px] text-text-secondary" numberOfLines={1}>{item.hint}</Text> : null}
                      </View>
                      {active ? <Check size={16} color={colors.primary} /> : null}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={<Text className="py-8 text-center text-xs text-text-secondary">{`Nothing matches "${query}".`}</Text>}
              />
            </Pressable>
          </Pressable>
        </KeyboardAvoider>
      </Modal>
    </>
  );
}
