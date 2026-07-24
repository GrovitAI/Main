import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { ShieldAlert, FileText, X } from 'lucide-react-native';

interface ReasonDialogProps {
  visible: boolean;
  actionTitle: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting?: boolean;
  isOtpRequired?: boolean;
}

export function ReasonDialog({
  visible,
  actionTitle,
  onClose,
  onSubmit,
  isSubmitting = false,
  isOtpRequired = true,
}: ReasonDialogProps) {
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
      setError('Please provide a reason before proceeding.');
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
              <View
                className={`h-10 w-10 items-center justify-center rounded-full ${
                  isOtpRequired ? 'bg-amber-50' : 'bg-sky-50'
                }`}
              >
                {isOtpRequired ? (
                  <ShieldAlert size={22} color="#D97706" />
                ) : (
                  <FileText size={22} color="#0284c7" />
                )}
              </View>
              <View>
                <Text className="text-base font-bold text-gray-900">
                  {isOtpRequired ? 'Approval Required' : 'Action Reason Required'}
                </Text>
                <Text
                  className={`text-xs font-medium ${
                    isOtpRequired ? 'text-amber-700' : 'text-sky-700'
                  }`}
                >
                  {actionTitle}
                </Text>
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
              {isOtpRequired ? 'Reason for Request *' : 'Reason for Action *'}
            </Text>
            <Text className="mt-1 text-xs text-gray-500">
              {isOtpRequired
                ? 'Please enter the operational reason for performing this sensitive action. An email code will be sent to the branch owner.'
                : 'Please enter the operational reason for audit logging before proceeding.'}
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
              className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-xl ${
                isOtpRequired ? 'bg-amber-600' : 'bg-blue-600'
              } ${isSubmitting ? 'opacity-70' : ''}`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">
                  {isOtpRequired ? 'Send Request' : 'Submit'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
