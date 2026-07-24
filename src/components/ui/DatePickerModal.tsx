import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react-native';

export interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
  showTimePicker?: boolean;
  onApply: (start: string, end: string, startTime?: string, endTime?: string) => void;
}

export function DatePickerModal({
  visible,
  onClose,
  startDate,
  endDate,
  startTime = '11:30',
  endTime = '02:30',
  showTimePicker = false,
  onApply,
}: DatePickerModalProps) {
  const [selectedStart, setSelectedStart] = useState(startDate || new Date().toISOString().slice(0, 10));
  const [selectedEnd, setSelectedEnd] = useState(endDate || new Date().toISOString().slice(0, 10));
  const [selectedStartTime, setSelectedStartTime] = useState(startTime);
  const [selectedEndTime, setSelectedEndTime] = useState(endTime);

  // Calendar month state
  const [viewDate, setViewDate] = useState(() => {
    const init = new Date(startDate || Date.now());
    return isNaN(init.getTime()) ? new Date() : init;
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const formatDayString = (dayNum: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(dayNum).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const handleDayPress = (dayStr: string) => {
    if (!selectedStart || (selectedStart && selectedEnd && selectedStart !== selectedEnd)) {
      setSelectedStart(dayStr);
      setSelectedEnd(dayStr);
    } else if (dayStr < selectedStart) {
      setSelectedStart(dayStr);
    } else {
      setSelectedEnd(dayStr);
    }
  };

  const applyPreset = (presetType: 'today' | 'yesterday' | '7days' | '30days' | 'month') => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (presetType === 'today') {
      start = now;
      end = now;
    } else if (presetType === 'yesterday') {
      start = new Date();
      start.setDate(now.getDate() - 1);
      end = new Date(start);
    } else if (presetType === '7days') {
      start = new Date();
      start.setDate(now.getDate() - 6);
      end = now;
    } else if (presetType === '30days') {
      start = new Date();
      start.setDate(now.getDate() - 29);
      end = now;
    } else if (presetType === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
    }

    const formatISO = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    setSelectedStart(formatISO(start));
    setSelectedEnd(formatISO(end));
  };

  const handleConfirm = () => {
    onApply(selectedStart, selectedEnd, selectedStartTime, selectedEndTime);
    onClose();
  };

  const renderCalendarGrid = () => {
    const days = [];
    // Blank offsets for first day of week
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<View key={`blank-${i}`} className="w-[14.28%] h-9" />);
    }

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dayStr = formatDayString(dayNum);
      const isStart = dayStr === selectedStart;
      const isEnd = dayStr === selectedEnd;
      const isInRange = selectedStart && selectedEnd && dayStr > selectedStart && dayStr < selectedEnd;
      const isSelected = isStart || isEnd;

      days.push(
        <Pressable
          key={dayStr}
          onPress={() => handleDayPress(dayStr)}
          className={`w-[14.28%] h-9 items-center justify-center rounded-lg my-0.5 ${
            isSelected
              ? 'bg-blue-600'
              : isInRange
              ? 'bg-blue-100'
              : 'hover:bg-slate-100'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              isSelected ? 'text-white font-bold' : isInRange ? 'text-blue-900 font-medium' : 'text-slate-700'
            }`}
          >
            {dayNum}
          </Text>
        </Pressable>
      );
    }

    return days;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center p-4">
        <View className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
          {/* Modal Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
            <View className="flex-row items-center space-x-2">
              <CalendarIcon size={18} color="#0284c7" />
              <Text className="text-sm font-bold text-slate-900">Select Date & Business Hours</Text>
            </View>
            <Pressable onPress={onClose} className="p-1 rounded-lg hover:bg-slate-200">
              <X size={18} color="#64748b" />
            </Pressable>
          </View>

          <ScrollView className="p-5 max-h-[500px]">
            {/* Quick Presets */}
            <Text className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Quick Ranges</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7days', label: 'Last 7 Days' },
                { id: '30days', label: 'Last 30 Days' },
                { id: 'month', label: 'This Month' },
              ].map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => applyPreset(p.id as any)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 active:bg-blue-50"
                >
                  <Text className="text-xs font-semibold text-slate-700">{p.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Month Header Navigation */}
            <View className="flex-row items-center justify-between my-2">
              <Text className="text-sm font-bold text-slate-900">
                {monthNames[month]} {year}
              </Text>
              <View className="flex-row items-center space-x-1">
                <Pressable onPress={handlePrevMonth} className="p-1.5 rounded-lg border border-slate-200 bg-white">
                  <ChevronLeft size={16} color="#334155" />
                </Pressable>
                <Pressable onPress={handleNextMonth} className="p-1.5 rounded-lg border border-slate-200 bg-white">
                  <ChevronRight size={16} color="#334155" />
                </Pressable>
              </View>
            </View>

            {/* Weekday Labels */}
            <View className="flex-row mb-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, i) => (
                <Text key={i} className="w-[14.28%] text-center text-[10px] font-bold text-slate-400">
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View className="flex-row flex-wrap mb-4">{renderCalendarGrid()}</View>

            {/* Selected Range Display */}
            <View className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 flex-row items-center justify-between">
              <View>
                <Text className="text-[10px] font-bold text-slate-400 uppercase">From</Text>
                <Text className="text-xs font-bold text-slate-800">{selectedStart || 'Not set'}</Text>
              </View>
              <Text className="text-slate-400 font-bold">→</Text>
              <View className="items-end">
                <Text className="text-[10px] font-bold text-slate-400 uppercase">To</Text>
                <Text className="text-xs font-bold text-slate-800">{selectedEnd || 'Not set'}</Text>
              </View>
            </View>

            {/* Optional Time Range Picker */}
            {showTimePicker && (
              <View className="border-t border-slate-200 pt-3 mt-1">
                <View className="flex-row items-center space-x-1.5 mb-2">
                  <Clock size={14} color="#64748b" />
                  <Text className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Business Operating Hours</Text>
                </View>
                <View className="flex-row items-center space-x-3">
                  <View className="flex-1">
                    <Text className="text-[10px] font-semibold text-slate-500 mb-1">Start Time</Text>
                    <TextInput
                      value={selectedStartTime}
                      onChangeText={setSelectedStartTime}
                      placeholder="11:30"
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 bg-white"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[10px] font-semibold text-slate-500 mb-1">Cutoff Time</Text>
                    <TextInput
                      value={selectedEndTime}
                      onChangeText={setSelectedEndTime}
                      placeholder="02:30"
                      className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 bg-white"
                    />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View className="flex-row items-center justify-end space-x-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
            <Pressable onPress={onClose} className="px-4 py-2 rounded-xl border border-slate-300 bg-white">
              <Text className="text-xs font-bold text-slate-700">Cancel</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} className="px-5 py-2 rounded-xl bg-blue-600 active:opacity-90">
              <Text className="text-xs font-bold text-white">Apply Range</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
