import { Modal, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import { formatCurrency } from '@/lib/pos/settlement-utils';

type SettlementModalProps = {
  visible: boolean;
  total: number;
  onClose: () => void;
};

const PAYMENT_OPTIONS = ['Cash', 'UPI', 'Card'] as const;

export function SettlementModal({ visible, total, onClose }: SettlementModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="rounded-t-3xl border-t border-border bg-background px-5 pb-8 pt-4">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-text-primary">Settle bill</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close settlement"
              onPress={onClose}
              className="h-11 w-11 items-center justify-center rounded-full border border-border"
            >
              <X color={colors.textPrimary} size={20} />
            </Pressable>
          </View>

          <Text className="text-sm text-text-secondary">Amount due</Text>
          <Text className="mt-1 text-3xl font-bold text-primary">
            {formatCurrency(total)}
          </Text>

          <Text className="mt-6 text-sm font-semibold text-text-primary">
            Payment method
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {PAYMENT_OPTIONS.map((option) => (
              <View
                key={option}
                className="min-h-[44px] items-center justify-center rounded-full border border-border px-4 py-2"
              >
                <Text className="text-sm font-medium text-text-secondary">{option}</Text>
              </View>
            ))}
          </View>

          <Text className="mt-4 text-center text-xs text-text-secondary">
            Full settlement flow will be added in Task 6.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="mt-6 min-h-[44px] items-center justify-center rounded-xl bg-primary"
          >
            <Text className="text-base font-semibold text-white">Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
