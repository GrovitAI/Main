import { useState } from 'react';
import { Animated, FlatList, Modal, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useEnterOnChange } from '@/components/kitchen/ui';
import { kitchenCalendarDays, kitchenMonthLabel, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import { shiftAttendanceDate, attendanceDateLabel } from '@/lib/pos/kitchen-attendance-utils';

const button = 'min-h-12 min-w-12 items-center justify-center rounded-xl border border-transparent hover:bg-accent-soft focus-visible:border-primary active:bg-accent-soft';
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

/**
 * The attendance day. A desktop steps a day at a time beside the date; a phone (`strip`, task 233)
 * taps one of seven days around it, with the calendar for any other day.
 */
export function AttendanceDate({ value, onChange, disabled, strip = false }: { value: string; onChange: (date: string) => void; disabled: boolean; strip?: boolean }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  // A later month slides in from the right, an earlier one from the left (task 215).
  const monthSlide = useEnterOnChange(month, 'x');
  const today = kitchenToday();
  const close = (): void => setOpen(false);
  // Seven days with the chosen one in view: up to three after it, never past today.
  let end = value;
  for (let i = 0; i < 3 && end < today; i++) end = shiftAttendanceDate(end, 1);
  const days = Array.from({ length: 7 }, (_, i) => shiftAttendanceDate(end, i - 6));
  return <View>
    {strip ? <View className="flex-row items-center gap-1" testID="attendance-week-strip">
      {days.map(day => {
        const on = day === value;
        const future = day > today;
        return <Pressable key={day} accessibilityRole="button" aria-selected={on} accessibilityLabel={attendanceDateLabel(day)} disabled={disabled || future} onPress={() => onChange(day)}
          className={`min-h-12 flex-1 items-center justify-center rounded-xl py-1.5 ${on ? 'bg-primary' : 'hover:bg-accent-soft active:bg-accent-soft'} ${future ? 'opacity-40' : ''}`}>
          <Text className={`text-xs font-bold ${on ? 'text-text-on-primary' : 'text-text-secondary'}`}>{WEEKDAYS[new Date(`${day}T12:00:00`).getDay()]}</Text>
          <Text className={`text-base font-extrabold ${on ? 'text-text-on-primary' : 'text-text-primary'}`}>{Number(day.slice(8))}</Text>
        </Pressable>;
      })}
      <Pressable accessibilityRole="button" accessibilityLabel={`Attendance date: ${attendanceDateLabel(value)}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setMonth(value.slice(0, 7)); setOpen(true); }} className={button}><CalendarDays size={18} color={colors.primary} /></Pressable>
    </View> : <View className="flex-row items-center gap-1">
      <Pressable accessibilityRole="button" accessibilityLabel="Previous attendance day" disabled={disabled} onPress={() => onChange(shiftAttendanceDate(value, -1))} className={button}><ChevronLeft size={18} color={colors.primary} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Attendance date: ${attendanceDateLabel(value)}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => { setMonth(value.slice(0, 7)); setOpen(true); }} className={`${button} flex-1 flex-row gap-2 px-2`}><CalendarDays size={18} color={colors.primary} /><Text className="text-sm font-bold text-text-primary">{attendanceDateLabel(value)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next attendance day" disabled={disabled || value >= today} accessibilityState={{ disabled: disabled || value >= today }} onPress={() => onChange(shiftAttendanceDate(value, 1))} className={`${button} ${value >= today ? 'opacity-40' : ''}`}><ChevronRight size={18} color={colors.primary} /></Pressable>
    </View>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center px-3" style={{ backgroundColor: colors.overlay }}>
        <Pressable accessible={false} tabIndex={-1} onPress={close} className="absolute inset-0" />
        <View accessibilityViewIsModal className="w-full max-w-[364px] rounded-2xl bg-surface-elevated p-3">
          <View className="flex-row items-center justify-between"><Text className="text-lg font-bold text-text-primary">Attendance date</Text><Pressable className={button} accessibilityRole="button" accessibilityLabel="Close attendance calendar" onPress={close}><X size={18} color={colors.primary} /></Pressable></View>
          <View className="flex-row items-center justify-between"><Pressable className={button} accessibilityRole="button" accessibilityLabel="Previous calendar month" onPress={() => setMonth(shiftKitchenMonth(month, -1))}><ChevronLeft size={18} color={colors.primary} /></Pressable><Animated.View style={monthSlide}><Text className="text-base font-bold text-text-primary">{kitchenMonthLabel(month)}</Text></Animated.View><Pressable className={`${button} ${month >= today.slice(0, 7) ? 'opacity-40' : ''}`} accessibilityRole="button" accessibilityLabel="Next calendar month" disabled={month >= today.slice(0, 7)} onPress={() => setMonth(shiftKitchenMonth(month, 1))}><ChevronRight size={18} color={colors.primary} /></Pressable></View>
          <View className="flex-row py-2">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <Text key={day} className="flex-1 text-center text-xs font-semibold text-text-secondary">{day}</Text>)}</View>
          <FlatList data={kitchenCalendarDays(month)} keyExtractor={cell => cell.key} numColumns={7} scrollEnabled={false} renderItem={({ item }) => <Animated.View style={[{ flex: 1 }, monthSlide]}>{item.date ? <Pressable disabled={item.date > today} accessibilityRole="button" accessibilityLabel={`Select ${item.date}`} accessibilityState={{ selected: item.date === value, disabled: item.date > today }} aria-selected={item.date === value} onPress={() => { if (item.date) onChange(item.date); close(); }} className={`min-h-12 items-center justify-center rounded-xl border border-transparent focus-visible:border-primary ${item.date === value ? 'bg-primary' : 'hover:bg-accent-soft active:bg-accent-soft'} ${item.date > today ? 'opacity-30' : ''}`}><Text className={`text-sm font-bold ${item.date === value ? 'text-text-on-primary' : 'text-text-primary'}`}>{Number(item.date.slice(-2))}</Text></Pressable> : <View className="min-h-12" />}</Animated.View>} />
          <Pressable className={`${button} mt-2 border-border`} accessibilityRole="button" accessibilityLabel="Attendance today" onPress={() => { onChange(today); close(); }}><Text className="text-sm font-bold text-primary">Today</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
}
