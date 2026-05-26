import { useState, useEffect, useCallback } from 'react';
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

// Focus zones: 0-2 = payment methods, 3 = cancel, 4 = confirm
const TOTAL_ITEMS = 5;

export function SettlementModal({
  visible,
  total,
  onClose,
  onConfirm,
  isMutating = false,
}: SettlementModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [localMutating, setLocalMutating] = useState(false);
  const [focusIndex, setFocusIndex] = useState(4); // Default highlight on Confirm

  const handleConfirm = useCallback(async () => {
    setLocalMutating(true);
    const success = await onConfirm();
    setLocalMutating(false);
    if (success) {
      onClose();
    }
  }, [onConfirm, onClose]);

  const isProcessing = isMutating || localMutating;

  // Reset focus when modal opens
  useEffect(() => {
    if (visible) {
      setFocusIndex(4); // Default to Confirm button
    }
  }, [visible]);

  // Scoped keyboard listener — only active while settlement modal is visible
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter: instant confirm from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (!isProcessing) {
          e.preventDefault();
          void handleConfirm();
        }
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % TOTAL_ITEMS);
        return;
      }
      if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + TOTAL_ITEMS) % TOTAL_ITEMS);
        return;
      }
      // Up/Down: jump between payment row (0-2) and action row (3-4)
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => {
          if (prev <= 2) return 4; // payment → confirm
          return prev; // already on actions
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => {
          if (prev >= 3) {
            // action → payment method (go to currently selected method)
            const idx = PAYMENT_OPTIONS.indexOf(selectedMethod);
            return idx >= 0 ? idx : 0;
          }
          return prev; // already on payment
        });
        return;
      }

      // Enter: activate focused element
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (isProcessing) return;
        if (focusIndex <= 2) {
          // Select a payment method
          setSelectedMethod(PAYMENT_OPTIONS[focusIndex]);
        } else if (focusIndex === 3) {
          onClose();
        } else if (focusIndex === 4) {
          void handleConfirm();
        }
        return;
      }

      // Escape: close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, isProcessing, selectedMethod, focusIndex, onClose, handleConfirm]);

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
          {Platform.OS === 'web' && (
            <Text style={{ fontSize: 10, fontWeight: '500', color: '#94A3B8', marginTop: 4 }}>
              ← → to navigate · ↑ ↓ between rows · Enter to select · Ctrl+Enter to confirm
            </Text>
          )}
          <View className="mt-3 flex-row flex-wrap gap-2">
            {PAYMENT_OPTIONS.map((option, idx) => {
              const isSelected = selectedMethod === option;
              const isFocused = focusIndex === idx && Platform.OS === 'web';
              return (
                <Pressable
                  key={option}
                  disabled={isProcessing}
                  onPress={() => {
                    setSelectedMethod(option);
                    setFocusIndex(idx);
                  }}
                  onHoverIn={() => setFocusIndex(idx)}
                  className="min-h-[44px] items-center justify-center rounded-full border border-border-soft px-5 py-2"
                  style={[
                    {
                      backgroundColor: isSelected ? '#E8F2FA' : '#FFFFFF',
                      borderColor: isSelected ? '#0066b2' : '#c5d9eb',
                    },
                    isFocused && {
                      borderColor: '#0066b2',
                      borderWidth: 2,
                      shadowColor: '#0066b2',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.2,
                      shadowRadius: 10,
                      elevation: 4,
                      transform: [{ scale: 1.04 }],
                    },
                  ]}
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
              onHoverIn={() => setFocusIndex(3)}
              className="min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-primary-mid bg-surface-elevated"
              style={[
                focusIndex === 3 && Platform.OS === 'web' && {
                  borderColor: '#80B3FF',
                  shadowColor: '#0066b2',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.2,
                  shadowRadius: 12,
                  elevation: 6,
                  transform: [{ scale: 1.02 }],
                  backgroundColor: '#E8F2FA',
                },
              ]}
            >
              <Text className="text-sm font-bold text-primary-mid">Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isProcessing}
              onPress={() => {
                void handleConfirm();
              }}
              onHoverIn={() => setFocusIndex(4)}
              className="min-h-[48px] flex-1 overflow-hidden rounded-2xl"
              style={[
                focusIndex === 4 && Platform.OS === 'web' && {
                  borderWidth: 2,
                  borderColor: '#80B3FF',
                  shadowColor: '#0066b2',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.3,
                  shadowRadius: 14,
                  elevation: 8,
                  transform: [{ scale: 1.02 }],
                },
              ]}
            >
              <LinearGradient
                colors={['#0D6CE0', '#0B58B2']}
                style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text className="text-sm font-bold text-text-on-primary">
                      Confirm Payment ({selectedMethod})
                    </Text>
                    {Platform.OS === 'web' && (
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#c5d9eb', opacity: 0.85 }}>Ctrl+Enter</Text>
                    )}
                  </View>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
