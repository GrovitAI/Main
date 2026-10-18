import { ownHover } from '@/lib/pos/web-hover';
import React, { useEffect, useState } from 'react';
import { View, Pressable, Modal, ScrollView } from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock, ArrowRight } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';

export interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
  showTimePicker?: boolean;
  /**
   * 'range' (default) picks a start and an end. 'single' picks one day: no
   * range presets, one tap selects, and the button reads "Use this date".
   */
  mode?: 'range' | 'single';
  onApply: (start: string, end: string, startTime?: string, endTime?: string) => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Local YYYY-MM-DD; toISOString would give the UTC day, which is yesterday before 5:30 am in India. */
const isoDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Parses YYYY-MM-DD as a local date, or null. */
function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
const longDate = (iso: string): string => {
  const d = parseDay(iso);
  // Fixed names: browsers print "Sept" and add commas that vary by locale.
  return d ? `${SHORT_DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : iso || 'Not set';
};

type Preset = 'today' | 'yesterday' | '7days' | '30days' | 'month';
const PRESETS: readonly { id: Preset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: '7 days' },
  { id: '30days', label: '30 days' },
  { id: 'month', label: 'This month' },
];

/**
 * Calendar for a date range (or one day). Every day cell is a full 1/7-wide,
 * 44 px tall target with no gaps between cells, so a tap or hover anywhere in
 * the grid lands on a day. The range shows as one continuous band; while the
 * end is being picked, hovering previews the range.
 */
export function DatePickerModal({
  visible,
  onClose,
  startDate,
  endDate,
  startTime = '11:30',
  endTime = '02:30',
  showTimePicker = false,
  mode = 'range',
  onApply,
}: DatePickerModalProps) {
  const single = mode === 'single';
  const today = isoDay(new Date());
  const [selectedStart, setSelectedStart] = useState(startDate || today);
  const [selectedEnd, setSelectedEnd] = useState(endDate || today);
  const [selectedStartTime, setSelectedStartTime] = useState(startTime);
  const [selectedEndTime, setSelectedEndTime] = useState(endTime);
  /** True after the first tap of a range, until the last day is tapped. */
  const [picking, setPicking] = useState(false);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(() => parseDay(startDate) ?? new Date());

  // The picker stays mounted between openings, so each opening starts from
  // the dates it was given rather than whatever was picked last time.
  useEffect(() => {
    if (!visible) return;
    const start = startDate || isoDay(new Date());
    setSelectedStart(start);
    setSelectedEnd(single ? start : endDate || start);
    setPicking(false);
    setHoverDay(null);
    setViewDate(parseDay(start) ?? new Date());
  }, [visible, startDate, endDate, single]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const handleDayPress = (day: string) => {
    if (single) {
      setSelectedStart(day);
      setSelectedEnd(day);
      return;
    }
    if (!picking) {
      setSelectedStart(day);
      setSelectedEnd(day);
      setPicking(true);
      return;
    }
    // Second tap closes the range in whichever direction it was picked.
    if (day < selectedStart) { setSelectedEnd(selectedStart); setSelectedStart(day); } else setSelectedEnd(day);
    setPicking(false);
  };

  const applyPreset = (preset: Preset) => {
    const now = new Date();
    const start = new Date(now);
    if (preset === 'yesterday') start.setDate(now.getDate() - 1);
    else if (preset === '7days') start.setDate(now.getDate() - 6);
    else if (preset === '30days') start.setDate(now.getDate() - 29);
    else if (preset === 'month') start.setDate(1);
    setSelectedStart(isoDay(start));
    setSelectedEnd(preset === 'yesterday' ? isoDay(start) : isoDay(now));
    setPicking(false);
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const handleConfirm = () => {
    onApply(selectedStart, single ? selectedStart : selectedEnd, selectedStartTime, selectedEndTime);
    onClose();
  };

  // While picking the end, the hovered day previews the range.
  const previewing = !single && picking && hoverDay !== null && hoverDay !== selectedStart;
  const rangeFrom = previewing && hoverDay < selectedStart ? hoverDay : selectedStart;
  const rangeTo = previewing ? (hoverDay < selectedStart ? selectedStart : hoverDay) : single ? selectedStart : selectedEnd;
  const startD = parseDay(selectedStart); const endD = parseDay(selectedEnd);
  const dayCount = startD && endD ? Math.round((endD.getTime() - startD.getTime()) / 86_400_000) + 1 : 0;

  const weeks: (string | null)[][] = [];
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDayOfWeek }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoDay(new Date(year, month, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const renderDay = (day: string | null, index: number) => {
    if (!day) return <View key={`blank-${index}`} className="h-11 flex-1" />;
    const isFrom = day === rangeFrom;
    const isTo = day === rangeTo;
    const isEdge = (isFrom || isTo) && !(previewing && day === hoverDay && day !== selectedStart);
    const inBand = rangeFrom < rangeTo && day >= rangeFrom && day <= rangeTo;
    const hovered = hoverDay === day;
    const ink = isEdge ? colors.textOnPrimary : inBand ? colors.primaryDeep : colors.textPrimary;
    return (
      <Pressable {...ownHover}
        key={day}
        accessibilityRole="button"
        accessibilityLabel={longDate(day)}
        accessibilityState={{ selected: isEdge || inBand }}
        onPress={() => handleDayPress(day)}
        onHoverIn={() => setHoverDay(day)}
        onHoverOut={() => setHoverDay((h) => (h === day ? null : h))}
        className="h-11 flex-1 items-center justify-center"
      >
        {inBand ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 3, bottom: 3,
              left: isFrom ? '50%' : 0, right: isTo ? '50%' : 0,
              backgroundColor: previewing ? colors.surfaceTint : colors.accentSoft,
            }}
          />
        ) : null}
        <View
          pointerEvents="none"
          className="h-[38px] w-[38px] items-center justify-center rounded-full"
          style={{
            backgroundColor: isEdge ? colors.primary : hovered ? (inBand ? colors.accent : colors.surfaceTint) : 'transparent',
            borderWidth: day === today && !isEdge ? 1 : 0,
            borderColor: colors.primary,
          }}
        >
          <Text className={`text-[13px] ${isEdge ? 'font-bold' : 'font-semibold'}`} style={{ color: ink, fontVariant: ['tabular-nums'] }}>
            {Number(day.slice(8))}
          </Text>
        </View>
      </Pressable>
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center p-4">
        <Pressable accessibilityLabel="Close date picker" onPress={onClose} className="absolute inset-0 bg-black/50" />
        <View className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-xl">
          <View className="flex-row items-center justify-between border-b border-border-soft py-1 pl-5 pr-1">
            <View className="flex-row items-center gap-2">
              <CalendarIcon size={18} color={colors.primary} />
              <Text className="text-[15px] font-bold text-text-primary">{single ? 'Pick a date' : 'Choose dates'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-tint">
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView className="max-h-[560px]" contentContainerStyle={{ padding: 20 }}>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {PRESETS.filter((p) => !single || p.id === 'today' || p.id === 'yesterday').map((p) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={() => applyPreset(p.id)}
                  className="min-h-[44px] justify-center rounded-xl border border-border bg-surface-elevated px-3 hover:bg-surface-tint active:opacity-80">
                  <Text className="text-[13px] font-semibold text-text-primary">{p.label}</Text>
                </Pressable>
              ))}
            </View>

            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-[15px] font-bold text-text-primary">{MONTHS[month]} {year}</Text>
              <View className="flex-row items-center gap-1">
                <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setViewDate(new Date(year, month - 1, 1))}
                  className="h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-surface-tint">
                  <ChevronLeft size={18} color={colors.textPrimary} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setViewDate(new Date(year, month + 1, 1))}
                  className="h-11 w-11 items-center justify-center rounded-xl border border-border hover:bg-surface-tint">
                  <ChevronRight size={18} color={colors.textPrimary} />
                </Pressable>
              </View>
            </View>

            <View className="flex-row">
              {WEEKDAYS.map((d) => <Text key={d} className="h-8 flex-1 text-center text-xs font-semibold leading-8 text-text-secondary">{d}</Text>)}
            </View>
            <View>
              {weeks.map((week, w) => <View key={w} className="flex-row">{week.map((day, i) => renderDay(day, w * 7 + i))}</View>)}
            </View>

            <Text className="mb-2 mt-3 h-5 text-xs text-text-secondary">
              {single ? '' : picking ? 'Now tap the last day.' : 'Tap the first day, then the last day.'}
            </Text>
            {single ? (
              <View className="rounded-xl border border-border-soft p-3">
                <Text className="text-xs font-semibold text-text-secondary">Date</Text>
                <Text className="text-[15px] font-bold text-text-primary">{longDate(selectedStart)}</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-3 rounded-xl border border-border-soft p-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-text-secondary">From</Text>
                  <Text className="text-[13px] font-bold text-text-primary">{longDate(selectedStart)}</Text>
                </View>
                <ArrowRight size={16} color={colors.textSecondary} />
                <View className="flex-1 items-end">
                  <Text className="text-xs font-semibold text-text-secondary">To · {dayCount} {dayCount === 1 ? 'day' : 'days'}</Text>
                  <Text className="text-[13px] font-bold text-text-primary">{longDate(selectedEnd)}</Text>
                </View>
              </View>
            )}

            {showTimePicker && (
              <View className="mt-4 border-t border-border-soft pt-3">
                <View className="mb-2 flex-row items-center gap-1.5">
                  <Clock size={14} color={colors.textSecondary} />
                  <Text className="text-xs font-semibold text-text-secondary">Business hours</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-text-secondary">Start time</Text>
                    <TextInput value={selectedStartTime} onChangeText={setSelectedStartTime} placeholder="11:30" accessibilityLabel="Start time"
                      className="h-11 rounded-xl border border-border bg-surface-elevated px-3 text-[13px] font-semibold text-text-primary" />
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1 text-xs text-text-secondary">Cut-off time</Text>
                    <TextInput value={selectedEndTime} onChangeText={setSelectedEndTime} placeholder="02:30" accessibilityLabel="Cut-off time"
                      className="h-11 rounded-xl border border-border bg-surface-elevated px-3 text-[13px] font-semibold text-text-primary" />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View className="flex-row items-center justify-end gap-2 border-t border-border-soft px-5 py-3">
            <Pressable accessibilityRole="button" onPress={onClose} className="min-h-[44px] justify-center rounded-xl border border-border px-4 hover:bg-surface-tint">
              <Text className="text-[13px] font-semibold text-text-primary">Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handleConfirm} className="min-h-[44px] justify-center rounded-xl bg-primary px-5 hover:bg-primary-deep active:opacity-90">
              <Text className="text-[13px] font-bold text-text-on-primary">{single ? 'Use this date' : 'Apply dates'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
