import { useState, useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import { colors } from '@/lib/pos/brand';
import { formatCurrency } from '@/lib/pos/settlement-utils';

type SettlementModalProps = {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  isMutating?: boolean;
};

const PAYMENT_OPTIONS = ['Cash', 'UPI', 'Card'] as const;

export function SettlementModal({
  visible,
  total,
  onClose,
  onConfirm,
  isMutating = false,
}: SettlementModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [localMutating, setLocalMutating] = useState(false);

  const handleConfirm = async () => {
    setLocalMutating(true);
    const success = await onConfirm();
    setLocalMutating(false);
    if (success) {
      onClose();
    }
  };

  const isProcessing = isMutating || localMutating;

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!isProcessing) {
          e.preventDefault();
          void handleConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, isProcessing, selectedMethod]);

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
              disabled={isProcessing}
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
            {PAYMENT_OPTIONS.map((option) => {
              const isSelected = selectedMethod === option;
              return (
                <Pressable
                  key={option}
                  disabled={isProcessing}
                  onPress={() => setSelectedMethod(option)}
                  className="min-h-[44px] items-center justify-center rounded-full border border-border-soft px-5 py-2"
                  style={{
                    backgroundColor: isSelected ? '#E8F2FA' : '#FFFFFF',
                    borderColor: isSelected ? '#0066b2' : '#c5d9eb',
                  }}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: isSelected ? '#0066b2' : '#5b6b7c' }}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-6 flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={isProcessing}
              onPress={onClose}
              className="min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-primary-mid bg-surface-elevated"
            >
              <Text className="text-sm font-bold text-primary-mid">Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isProcessing}
              onPress={() => {
                void handleConfirm();
              }}
              className="min-h-[48px] flex-1 overflow-hidden rounded-2xl"
            >
              <LinearGradient
                colors={['#0D6CE0', '#0B58B2']}
                style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text className="text-sm font-bold text-text-on-primary">
                    {Platform.OS === 'web'
                      ? `Confirm Payment (${selectedMethod}) [Ctrl+Enter]`
                      : `Confirm Payment (${selectedMethod})`}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
