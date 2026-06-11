import React, { useState, useMemo } from 'react';
import { Modal, View, Text, Pressable, TextInput, FlatList } from 'react-native';
import { Search, X, Check } from 'lucide-react-native';

interface SearchableDropdownProps<T> {
  visible: boolean;
  onClose: () => void;
  options: T[];
  onSelect: (option: T) => void;
  selectedValue?: string;
  getOptionLabel: (option: T) => string;
  getOptionValue: (option: T) => string;
  placeholder?: string;
  title?: string;
}

export function SearchableDropdown<T>({
  visible,
  onClose,
  options,
  onSelect,
  selectedValue,
  getOptionLabel,
  getOptionValue,
  placeholder = 'Search...',
  title = 'Select Option',
}: SearchableDropdownProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    return options.filter((opt) =>
      getOptionLabel(opt).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery, getOptionLabel]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable 
        className="flex-1 bg-black/40 justify-center items-center p-4" 
        onPress={onClose}
      >
        <Pressable 
          className="w-full max-w-md bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-2xl"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View className="flex-row justify-between items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
            <Text className="text-sm font-black text-slate-800">{title}</Text>
            <Pressable onPress={onClose} className="p-1 rounded-full active:bg-slate-100">
              <X size={16} color="#64748b" />
            </Pressable>
          </View>

          {/* Search Input */}
          <View className="p-3 border-b border-slate-100 flex-row items-center bg-white gap-2">
            <View className="flex-1 flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <Search size={14} color="#64748b" className="mr-2" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={placeholder}
                placeholderTextColor="#94a3b8"
                className="flex-1 text-slate-800 text-xs font-semibold h-8"
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} className="p-0.5">
                  <X size={14} color="#64748b" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Options List */}
          <View style={{ maxHeight: 300 }}>
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => getOptionValue(item)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="py-8 items-center justify-center">
                  <Text className="text-xs font-bold text-slate-400">No options found</Text>
                </View>
              }
              renderItem={({ item }) => {
                const label = getOptionLabel(item);
                const val = getOptionValue(item);
                const isSelected = selectedValue === val;

                return (
                  <Pressable
                    onPress={() => {
                      onSelect(item);
                      setSearchQuery('');
                      onClose();
                    }}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      backgroundColor: isSelected ? '#eff6ff' : pressed ? '#f8fafc' : 'transparent',
                      borderBottomWidth: 1,
                      borderBottomColor: '#f1f5f9',
                    })}
                  >
                    <Text className={`text-xs ${isSelected ? 'text-blue-600 font-extrabold' : 'text-slate-700 font-semibold'}`}>
                      {label}
                    </Text>
                    {isSelected && <Check size={14} color="#2563eb" strokeWidth={3} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
