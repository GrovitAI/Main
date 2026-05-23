import { Modal, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
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
      <View className="flex-1 justify-end bg-primary-deep/40">
        <View className="rounded-t-panel border-t border-border-soft bg-surface-elevated px-6 pb-10 pt-5 shadow-panel">
          <View className="mb-5 flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Settlement
              </Text>
              <Text className="mt-1 text-2xl font-bold text-text-primary">Settle bill</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close settlement"
              onPress={onClose}
              className="h-12 w-12 items-center justify-center rounded-2xl border border-border-soft bg-surface-tint"
            >
              <X color={colors.primaryDeep} size={22} />
            </Pressable>
          </View>

          <View className="rounded-2xl border border-border-soft bg-surface-tint px-4 py-4">
            <Text className="text-sm text-text-secondary">Amount due</Text>
            <Text className="mt-1 text-4xl font-bold text-primary-mid">
              {formatCurrency(total)}
            </Text>
          </View>

          <Text className="mt-6 text-sm font-bold text-text-primary">Payment method</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {PAYMENT_OPTIONS.map((option) => (
              <View
                key={option}
                className="min-h-[44px] items-center justify-center rounded-full border border-border-soft bg-surface-elevated px-5 py-2"
              >
                <Text className="text-sm font-semibold text-text-secondary">{option}</Text>
              </View>
            ))}
          </View>

          <Text className="mt-4 text-center text-xs text-text-secondary">
            Full settlement flow will be added in Task 6.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="mt-6 min-h-[48px] overflow-hidden rounded-2xl"
          >
            <BrandedGradient variant="primary" className="min-h-[48px] items-center justify-center">
              <Text className="text-base font-bold text-text-on-primary">Close</Text>
            </BrandedGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
