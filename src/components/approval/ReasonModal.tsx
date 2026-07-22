import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { ShieldAlert, X } from 'lucide-react-native';

interface ReasonModalProps {
  visible: boolean;
  actionTitle: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting?: boolean;
}

export function ReasonModal({
  visible,
  actionTitle,
  onClose,
  onSubmit,
  isSubmitting = false,
}: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason('');
      setError(null);
    }
  }, [visible]);

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Please provide a reason for this request.');
      return;
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-gray-100 pb-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-amber-50">
                <ShieldAlert size={22} color="#D97706" />
              </View>
              <View>
                <Text className="text-base font-bold text-gray-900">Approval Required</Text>
                <Text className="text-xs font-medium text-amber-700">{actionTitle}</Text>
              </View>
            </View>
            <Pressable
              disabled={isSubmitting}
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-lg bg-gray-100"
            >
              <X size={18} color="#6B7280" />
            </Pressable>
          </View>

          {/* Content */}
          <View className="py-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Reason for Request *
            </Text>
            <Text className="mt-1 text-xs text-gray-500">
              Please enter the operational reason for performing this sensitive action. An email code will be sent to the branch owner.
            </Text>

            <TextInput
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                if (error) setError(null);
              }}
              placeholder="e.g. Customer requested order cancellation / Bill reprint requested..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              className="mt-3 min-h-[80px] rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900"
              style={{ textAlignVertical: 'top' }}
              editable={!isSubmitting}
            />

            {error && (
              <Text className="mt-2 text-xs font-medium text-red-600">{error}</Text>
            )}
          </View>

          {/* Footer Actions */}
          <View className="flex-row items-center gap-3 pt-2">
            <Pressable
              disabled={isSubmitting}
              onPress={onClose}
              className="min-h-[44px] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancel</Text>
            </Pressable>

            <Pressable
              disabled={isSubmitting}
              onPress={handleSubmit}
              className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-amber-600 ${
                isSubmitting ? 'opacity-70' : ''
              }`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Send Request</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
