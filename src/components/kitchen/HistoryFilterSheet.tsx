import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';

type Props = {
  visible: boolean;
  onClose: () => void;
  onReset: () => void;
  fields: readonly [ReactNode, ReactNode, ReactNode, ReactNode];
  dates: ReactNode;
  /** The list's order (task 236): on a phone it lives here rather than in the toolbar. */
  sort?: ReactNode;
};

/** Phone-only disclosure; choices remain local and Done only closes it. */
export function HistoryFilterSheet({ visible, onClose, onReset, fields, dates, sort }: Props) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View className="flex-1 justify-end" style={{ backgroundColor: colors.overlay, paddingTop: Math.max(insets.top, 8) }}>
      <Pressable accessible={false} tabIndex={-1} onPress={onClose} className="absolute inset-0" testID="history-filter-backdrop" />
      <View testID="kitchen-history-filters" accessibilityViewIsModal className="max-h-[88%] w-full shrink gap-2 rounded-t-2xl bg-surface-elevated px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="text-lg font-bold text-text-primary">Filters</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close history filters" onPress={onClose} className="h-12 w-12 items-center justify-center rounded-xl hover:bg-accent-soft active:bg-accent-soft focus:border focus:border-primary">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        {/* A static form, not a nested virtualized list: picker/calendar lists must scroll independently. */}
        <ScrollView className="min-h-0 shrink" keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            {sort ?? null}
            <View className="flex-row items-start gap-2">
              <View className="min-w-0 flex-1">{fields[0]}</View>
              <View className="min-w-0 flex-1">{fields[1]}</View>
            </View>
            <View className="flex-row items-start gap-2">
              <View className="min-w-0 flex-1">{fields[2]}</View>
              <View className="min-w-0 flex-1">{fields[3]}</View>
            </View>
            <View className="gap-2">{dates}</View>
          </View>
        </ScrollView>
        <View className="flex-row gap-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Reset history filters" onPress={onReset} className="min-h-12 flex-1 items-center justify-center rounded-xl border border-border bg-surface-elevated px-3 py-2 hover:bg-accent-soft active:bg-accent-soft focus:border-primary">
            <Text className="text-sm font-bold text-primary">Reset</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Done filtering" onPress={onClose} className="min-h-12 flex-1 items-center justify-center rounded-xl border border-primary bg-primary px-3 py-2 hover:bg-primary-deep active:bg-primary-deep focus:border-primary-deep">
            <Text className="text-sm font-bold text-text-on-primary">Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}
