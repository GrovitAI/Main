import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { KeyRound, RefreshCw, X, CheckCircle2 } from 'lucide-react-native';

interface ApprovalCodeModalProps {
  visible: boolean;
  actionTitle: string;
  requestId: string;
  expiresAt?: string | null;
  onClose: () => void;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string; attemptsRemaining?: number; isExpired?: boolean }>;
  onResend: () => Promise<{ success: boolean; error?: string }>;
}

export function ApprovalCodeModal({
  visible,
  actionTitle,
  requestId,
  expiresAt,
  onClose,
  onVerify,
  onResend,
}: ApprovalCodeModalProps) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(30);

  // 30-second resend cooldown timer
  useEffect(() => {
    if (!visible) return;
    setCooldown(30);
    setCode('');
    setError(null);
    setInfoMsg(null);

    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, requestId]);

  const handleVerify = useCallback(async () => {
    const cleanCode = code.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setError('Please enter the full 6-digit numeric approval code.');
      return;
    }

    setError(null);
    setInfoMsg(null);
    setIsVerifying(true);

    const res = await onVerify(cleanCode);
    setIsVerifying(false);

    if (res.success) {
      setCode('');
    } else {
      setError(res.error || 'Verification failed.');
    }
  }, [code, onVerify]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setError(null);
    setInfoMsg(null);

    const res = await onResend();
    setIsResending(false);

    if (res.success) {
      setInfoMsg('New approval code sent to owner.');
      setCooldown(30);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setError(res.error || 'Failed to resend code.');
    }
  }, [cooldown, isResending, onResend]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-gray-100 pb-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <KeyRound size={22} color="#0284C7" />
              </View>
              <View>
                <Text className="text-base font-bold text-gray-900">Enter Approval Code</Text>
                <Text className="text-xs font-medium text-blue-600">{actionTitle}</Text>
              </View>
            </View>
            <Pressable
              disabled={isVerifying}
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-lg bg-gray-100"
            >
              <X size={18} color="#6B7280" />
            </Pressable>
          </View>

          {/* Content */}
          <View className="py-5 items-center">
            <Text className="text-center text-xs font-medium text-gray-600">
              A 6-digit approval code was sent to the branch owner's email address.
            </Text>

            {/* 6-Digit PIN input */}
            <TextInput
              value={code}
              onChangeText={(text) => {
                const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
                setCode(digits);
                if (error) setError(null);
              }}
              placeholder="000000"
              placeholderTextColor="#CBD5E1"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              className="mt-4 w-48 rounded-xl border-2 border-blue-600 bg-blue-50/50 py-3 text-center text-2xl font-bold tracking-[8px] text-gray-900"
              editable={!isVerifying}
            />

            {infoMsg && (
              <View className="mt-3 flex-row items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5">
                <CheckCircle2 size={14} color="#059669" />
                <Text className="text-xs font-medium text-emerald-700">{infoMsg}</Text>
              </View>
            )}

            {error && (
              <Text className="mt-3 text-center text-xs font-medium text-red-600">
                {error}
              </Text>
            )}
          </View>

          {/* Resend Action */}
          <View className="flex-row items-center justify-center pb-2">
            <Pressable
              disabled={cooldown > 0 || isResending || isVerifying}
              onPress={handleResend}
              className="flex-row items-center gap-1.5 py-1"
            >
              {isResending ? (
                <ActivityIndicator size="small" color="#0284C7" />
              ) : (
                <RefreshCw size={13} color={cooldown > 0 ? '#94A3B8' : '#0284C7'} />
              )}
              <Text
                className={`text-xs font-semibold ${
                  cooldown > 0 ? 'text-gray-400' : 'text-blue-600'
                }`}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Approval Code'}
              </Text>
            </Pressable>
          </View>

          {/* Footer Actions */}
          <View className="flex-row items-center gap-3 pt-3">
            <Pressable
              disabled={isVerifying}
              onPress={onClose}
              className="min-h-[44px] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancel</Text>
            </Pressable>

            <Pressable
              disabled={isVerifying || code.length < 6}
              onPress={handleVerify}
              className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-blue-600 ${
                isVerifying || code.length < 6 ? 'opacity-50' : ''
              }`}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text className="text-sm font-bold text-white">Verify Code</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
