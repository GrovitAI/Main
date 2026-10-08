import { useState } from 'react';
import { FlatList, Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, semantic } from '@/lib/pos/brand';
import { kitchenCalendarDays, kitchenMonthLabel, kitchenMonthRange, kitchenRangeLabel, kitchenToday, shiftKitchenMonth } from '@/lib/pos/kitchen-analytics-utils';
import type { KitchenDateRange } from '@/lib/pos/kitchen-analytics-utils';

const control = 'min-h-12 min-w-12 items-center justify-center rounded-xl px-3 hover:bg-accent-soft active:opacity-70 focus:border focus:border-primary';
const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Date selection is a draft: only Apply changes the report and starts a request. */
export function ReportDateRange({ value, onChange }: { value: KitchenDateRange; onChange: (range: KitchenDateRange) => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const today = kitchenToday();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [choosing, setChoosing] = useState<'startDate' | 'endDate'>('startDate');
  const [calendarMonth, setCalendarMonth] = useState(value.startDate.slice(0, 7));
  const monthRange = kitchenMonthRange(value.startDate.slice(0, 7), today);
  const fullMonth = value.startDate === monthRange.startDate && value.endDate === monthRange.endDate;
  const valid = draft.endDate >= draft.startDate && draft.endDate <= today;
  const close = () => setOpen(false);
  const select = (date: string) => {
    setDraft(current => ({ ...current, [choosing]: date }));
    if (choosing === 'startDate') setChoosing('endDate');
  };
  const preset = (month: string) => {
    setDraft(kitchenMonthRange(month, today)); setCalendarMonth(month); setChoosing('startDate');
  };
  const header = <View className="gap-2 px-1">
    <View className="flex-row items-center justify-between">
      <Text accessibilityRole="header" className="text-base font-bold text-text-primary">Report dates</Text>
      <Pressable accessibilityRole="button" onPress={() => preset(today.slice(0, 7))} className={control}><Text className="text-xs font-bold text-primary">This month</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Close date picker" onPress={close} className={control}><X size={18} color={colors.textSecondary} /></Pressable>
    </View>
    <Text className="text-xs leading-4 text-text-secondary">Choose start, then end. Both dates are included.</Text>
    <View className="flex-row gap-2">
      {(['startDate', 'endDate'] as const).map(field => <Pressable key={field} accessibilityRole="button" accessibilityLabel={(field === 'startDate' ? 'Start date: ' : 'End date: ') + draft[field]} accessibilityState={{ selected: choosing === field }} onPress={() => { setChoosing(field); setCalendarMonth(draft[field].slice(0, 7)); }}
        className={'min-h-12 min-w-0 flex-1 rounded-xl border px-3 py-2 focus:border-primary ' + (choosing === field ? 'border-primary bg-accent-soft' : 'border-border-soft bg-surface-elevated hover:bg-surface-tint')}>
        <Text className="text-xs font-semibold text-text-secondary">{field === 'startDate' ? 'Start date' : 'End date'}</Text>
        <Text className="text-sm font-bold text-text-primary">{draft[field]}</Text>
      </Pressable>)}
    </View>
    <View className="flex-row items-center justify-between">
      <Pressable accessibilityRole="button" accessibilityLabel="Previous calendar month" disabled={calendarMonth === '1000-01'} onPress={() => setCalendarMonth(shiftKitchenMonth(calendarMonth, -1))} className={control}><ChevronLeft size={18} color={colors.primary} /></Pressable>
      <Text className="text-sm font-bold text-text-primary">{kitchenMonthLabel(calendarMonth)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next calendar month" accessibilityState={{ disabled: calendarMonth >= today.slice(0, 7) }} disabled={calendarMonth >= today.slice(0, 7)} onPress={() => setCalendarMonth(shiftKitchenMonth(calendarMonth, 1))} className={control + (calendarMonth >= today.slice(0, 7) ? ' opacity-40' : '')}><ChevronRight size={18} color={colors.primary} /></Pressable>
    </View>
    <View className="mb-1 flex-row">{weekdays.map(day => <Text key={day} className="flex-1 text-center text-xs font-semibold text-text-secondary">{day}</Text>)}</View>
  </View>;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={'Report dates: ' + value.startDate + ' through ' + value.endDate} accessibilityState={{ expanded: open }} onPress={() => { setDraft(value); setChoosing('startDate'); setCalendarMonth(value.startDate.slice(0, 7)); setOpen(true); }}
      className="min-h-12 min-w-0 flex-row items-center gap-2 rounded-xl bg-surface-elevated px-3 py-2 hover:bg-accent-soft active:opacity-70 focus:border focus:border-primary">
      <CalendarDays size={16} color={colors.primary} />
      <Text className="min-w-0 shrink text-sm font-bold text-primary">{fullMonth ? kitchenMonthLabel(value.startDate.slice(0, 7)) : kitchenRangeLabel(value)}</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.overlay, paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) }}>
        <Pressable accessible={false} tabIndex={-1} onPress={close} className="absolute inset-0" />
        <View accessibilityViewIsModal className={'max-h-[92%] w-full max-w-[372px] rounded-2xl bg-surface-elevated p-1.5 ' + (width >= 360 ? 'mx-3' : '')} style={{ maxWidth: Math.min(372, width >= 360 ? width - 24 : width) }}>
          <FlatList data={kitchenCalendarDays(calendarMonth)} numColumns={7} keyExtractor={day => day.key} ListHeaderComponent={header} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const date = item.date;
              const cell = 'min-w-0 flex-1 items-center justify-center ' + (Platform.OS === 'web' ? 'min-h-11' : 'min-h-12');
              if (!date) return <View className={cell} />;
              const selected = date === draft.startDate || date === draft.endDate;
              const between = date > draft.startDate && date < draft.endDate;
              return <Pressable accessibilityRole="button" accessibilityLabel={'Select ' + date + ' as ' + (choosing === 'startDate' ? 'start' : 'end') + ' date'} accessibilityState={{ selected, disabled: date > today }} disabled={date > today} onPress={() => select(date)}
                className={cell + ' rounded-lg focus:border focus:border-primary ' + (selected ? 'bg-primary' : between ? 'bg-accent-soft' : 'hover:bg-surface-tint') + (date > today ? ' opacity-40' : '')}>
                <Text className={'text-sm font-semibold ' + (selected ? 'text-text-on-primary' : 'text-text-primary')}>{Number(date.slice(8))}</Text>
              </Pressable>;
            }}
            ListFooterComponent={<View className="gap-2 px-1 pb-2 pt-3">
              {!valid ? <Text accessibilityRole="alert" className="text-xs font-semibold" style={{ color: semantic.danger }}>End date must be on or after start, and no later than today.</Text> : <Text className="text-center text-xs text-text-secondary">{kitchenRangeLabel(draft)} · India time</Text>}
              <View className="flex-row gap-2">
                <Pressable accessibilityRole="button" onPress={close} className={control + ' flex-1'}><Text className="text-sm font-bold text-primary">Cancel</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Apply report dates" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={() => { onChange(draft); close(); }} className={'min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-3 hover:bg-primary-deep focus:border focus:border-accent ' + (!valid ? 'opacity-40' : '')}><Text className="text-sm font-bold text-text-on-primary">Apply dates</Text></Pressable>
              </View>
            </View>} />
        </View>
      </View>
    </Modal>
  </>;
}
