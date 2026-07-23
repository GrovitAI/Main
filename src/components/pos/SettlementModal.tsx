import { useState, useEffect, useCallback, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import { colors } from '@/lib/pos/brand';
import { formatCurrency } from '@/lib/pos/settlement-utils';
import { useApprovalFlow } from '@/lib/approval/use-approval-flow';
import { ApprovalAction } from '@/lib/approval/approval.types';

type SettlementModalProps = {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (paymentMethod: string) => Promise<boolean>;
  isMutating?: boolean;
};

const PAYMENT_OPTIONS = ['Cash', 'UPI', 'Card', 'Complimentary'] as const;

// Focus zones: 0-3 = payment methods, 4 = cancel, 5 = confirm
const TOTAL_ITEMS = 6;

export function SettlementModal({
  visible,
  total,
  onClose,
  onConfirm,
  isMutating = false,
}: SettlementModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Complimentary'>('Cash');
  const [localMutating, setLocalMutating] = useState(false);
  const [focusIndex, setFocusIndex] = useState(5);

  // Keyboard owner — a plain <div> (View), NOT TextInput. Avoids Enter/submit/blur quirks.
  const keyboardOwnerRef = useRef<View>(null);

  const { requestApproval } = useApprovalFlow();

  const handleConfirm = useCallback(async () => {
    if (localMutating || isMutating) return;
    setLocalMutating(true);

    const doConfirm = async () => {
      try {
        const success = await onConfirm(selectedMethod.toLowerCase());
        if (success) {
          onClose();
        }
      } finally {
        setLocalMutating(false);
      }
    };

    if (selectedMethod === 'Complimentary') {
      requestApproval({
        action: ApprovalAction.COMPLIMENTARY_BILL,
        actionTitle: 'Complimentary Bill',
        resourceType: 'settlement',
        resourceId: 'active_settlement',
        onApproved: () => {
          void doConfirm();
        },
        onCancelled: () => {
          setLocalMutating(false);
        },
      });
    } else {
      void doConfirm();
    }
  }, [localMutating, isMutating, selectedMethod, onConfirm, onClose, requestApproval]);

  const isProcessing = isMutating || localMutating;

  // Claim keyboard focus on the hidden div
  const claimFocus = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const node = keyboardOwnerRef.current as unknown as HTMLElement | null;
    if (!node) return;
    node.focus();
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setFocusIndex(4);
      setSelectedMethod('Cash');
    }
  }, [visible]);

  // Attach native keydown listener + make div focusable + claim focus
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const node = keyboardOwnerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    // Make the div focusable and invisible to screen readers
    node.tabIndex = 0;
    node.style.outline = 'none';
    node.setAttribute('aria-hidden', 'true');

    // Use a mutable ref to always read latest state inside the listener
    let currentFocusIndex = focusIndex;
    let currentSelectedMethod = selectedMethod;
    let currentIsProcessing = isProcessing;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      e.preventDefault();
      e.stopPropagation();

      // Ctrl/Cmd + Enter: instant confirm
      if ((e.ctrlKey || e.metaKey) && key === 'Enter') {
        if (!currentIsProcessing) {
          void handleConfirm();
        }
        return;
      }

      // Arrow / Tab navigation
      if (key === 'ArrowRight' || (key === 'Tab' && !e.shiftKey)) {
        setFocusIndex((prev) => {
          const next = (prev + 1) % TOTAL_ITEMS;
          currentFocusIndex = next;
          return next;
        });
        return;
      }
      if (key === 'ArrowLeft' || (key === 'Tab' && e.shiftKey)) {
        setFocusIndex((prev) => {
          const next = (prev - 1 + TOTAL_ITEMS) % TOTAL_ITEMS;
          currentFocusIndex = next;
          return next;
        });
        return;
      }
      if (key === 'ArrowDown') {
        setFocusIndex((prev) => {
          if (prev <= 3) {
            currentFocusIndex = 5;
            return 5;
          }
          return prev;
        });
        return;
      }
      if (key === 'ArrowUp') {
        setFocusIndex((prev) => {
          if (prev >= 4) {
            const idx = PAYMENT_OPTIONS.indexOf(currentSelectedMethod);
            const next = idx >= 0 ? idx : 0;
            currentFocusIndex = next;
            return next;
          }
          return prev;
        });
        return;
      }

      // Enter: activate focused element
      if (key === 'Enter') {
        if (currentIsProcessing) return;
        if (currentFocusIndex <= 3) {
          const method = PAYMENT_OPTIONS[currentFocusIndex];
          currentSelectedMethod = method;
          setSelectedMethod(method);
        } else if (currentFocusIndex === 4) {
          onClose();
        } else if (currentFocusIndex === 5) {
          void handleConfirm();
        }
        return;
      }

      // Escape: close
      if (key === 'Escape') {
        onClose();
        return;
      }
    };

    node.addEventListener('keydown', handleKeyDown);

    // Initial focus claim after modal mount
    const timer = setTimeout(() => {
      node.focus();
    }, 120);

    return () => {
      node.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [visible, isProcessing, selectedMethod, focusIndex, onClose, handleConfirm]);

  // Persistent focus guard — reclaim focus after any state-driven re-render
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    requestAnimationFrame(() => {
      claimFocus();
    });
  }, [visible, focusIndex, selectedMethod, claimFocus]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-primary-deep/40">
        <View className="rounded-t-panel border-t border-border-soft bg-surface-elevated px-6 pb-10 pt-5 shadow-panel">

          {/* Hidden keyboard owner — plain div, NOT TextInput */}
          {Platform.OS === 'web' && (
            <View
              ref={keyboardOwnerRef}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                opacity: 0,
                top: 0,
                left: 0,
              }}
            />
          )}

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
              onPress={() => { onClose(); }}
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
                    claimFocus();
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
              onPress={() => { onClose(); }}
              onHoverIn={() => setFocusIndex(4)}
              className="min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-primary-mid bg-surface-elevated"
              style={[
                focusIndex === 4 && Platform.OS === 'web' && {
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
              onHoverIn={() => setFocusIndex(5)}
              className="min-h-[48px] flex-1 overflow-hidden rounded-2xl"
              style={[
                focusIndex === 5 && Platform.OS === 'web' && {
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
