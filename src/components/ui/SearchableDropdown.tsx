import React, { useState, useMemo, useEffect } from 'react';
import { Modal, View, Text, Pressable, TextInput, FlatList, useWindowDimensions } from 'react-native';
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
  triggerRef?: React.RefObject<any>;
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
  triggerRef,
}: SearchableDropdownProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [coords, setCoords] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { height: screenHeight } = useWindowDimensions();

  const dropdownHeight = 220; // Fixed max height for the dropdown panel

  useEffect(() => {
    if (visible && triggerRef?.current) {
      // Measure position of the trigger component relative to screen space
      triggerRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
        // Adjust for any coordinate measuring edge cases
        setCoords({
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: Math.max(100, width),
          height: Math.max(0, height),
        });
      });
    } else if (!visible) {
      setCoords(null);
    }
  }, [visible, triggerRef]);

  const filteredOptions = useMemo(() => {
    return options.filter((opt) =>
      getOptionLabel(opt).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [options, searchQuery, getOptionLabel]);

  // Flip dropdown upwards if there is not enough bottom space
  const topPosition = coords
    ? (coords.y + coords.height + dropdownHeight > screenHeight - 20)
      ? coords.y - dropdownHeight - 4
      : coords.y + coords.height + 4
    : 0;

  return (
    <Modal
      visible={visible && !!coords}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable 
        className="flex-1 bg-transparent" 
        onPress={onClose}
      >
        {coords && (
          <View 
            style={{
              position: 'absolute',
              top: topPosition,
              left: coords.x,
              width: coords.width,
              height: dropdownHeight,
              zIndex: 9999,
            }}
            className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xl flex-col"
            onStartShouldSetResponder={() => true}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {/* Search Input inside dropdown */}
            <View className="p-2 border-b border-slate-100 flex-row items-center bg-white">
              <View className="flex-1 flex-row items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <Search size={12} color="#64748b" className="mr-1.5" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={placeholder}
                  placeholderTextColor="#94a3b8"
                  className="flex-1 text-slate-800 text-[11px] font-semibold h-6 p-0"
                  autoFocus={true}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} className="p-0.5">
                    <X size={12} color="#64748b" />
                  </Pressable>
                )}
              </View>
            </View>

            {/* Options List */}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => getOptionValue(item)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View className="py-4 items-center justify-center">
                  <Text className="text-[10px] font-bold text-slate-400">No matches</Text>
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
                      minHeight: 36,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: isSelected ? '#eff6ff' : pressed ? '#f8fafc' : 'transparent',
                      borderBottomWidth: 1,
                      borderBottomColor: '#f8fafc',
                    })}
                  >
                    <Text className={`text-[11px] ${isSelected ? 'text-blue-600 font-extrabold' : 'text-slate-700 font-semibold'}`}>
                      {label}
                    </Text>
                    {isSelected && <Check size={12} color="#2563eb" strokeWidth={3} />}
                  </Pressable>
                );
              }}
            />
          </View>
        )}
      </Pressable>
    </Modal>
  );
}
