import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { ShieldCheck, RefreshCw, X } from 'lucide-react-native';

interface ApprovalCodeDialogProps {
  visible: boolean;
  actionTitle: string;
  onClose: () => void;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string; attemptsRemaining?: number }>;
  onResend: () => Promise<{ success: boolean; error?: string }>;
}

export function ApprovalCodeDialog({
  visible,
  actionTitle,
  onClose,
  onVerify,
  onResend,
}: ApprovalCodeDialogProps) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(30);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setCode('');
      setErrorMsg(null);
      setCooldown(30);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [visible, cooldown]);

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6 || !/^\d+$/.test(trimmed)) {
      setErrorMsg('Please enter a valid 6-digit approval code.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);
    try {
      const res = await onVerify(trimmed);
      if (!res.success) {
        setErrorMsg(res.error || 'Verification failed.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification error.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg(null);
    try {
      const res = await onResend();
      if (res.success) {
        setCooldown(30);
        setCode('');
      } else {
        setErrorMsg(res.error || 'Failed to resend code.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Resend error.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-gray-100 pb-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                <ShieldCheck size={22} color="#2563EB" />
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

          {/* Body */}
          <View className="py-4 items-center">
            <Text className="text-center text-xs text-gray-600">
              A 6-digit approval code was sent to the branch owner’s email.
            </Text>

            <View className="mt-4 w-full">
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={(val) => {
                  const cleaned = val.replace(/[\s-]/g, '').replace(/\D/g, '').slice(0, 6);
                  setCode(cleaned);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
                editable={!isVerifying}
                className="h-14 w-full rounded-xl border-2 border-blue-200 bg-blue-50/50 text-center text-2xl font-bold tracking-widest text-gray-900"
              />
            </View>

            {errorMsg && (
              <Text className="mt-3 text-center text-xs font-semibold text-red-600">
                {errorMsg}
              </Text>
            )}

            {/* Resend row */}
            <View className="mt-4 flex-row items-center justify-between w-full pt-2">
              <Pressable
                disabled={cooldown > 0 || isResending || isVerifying}
                onPress={handleResend}
                className="flex-row items-center gap-1.5"
              >
                {isResending ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <RefreshCw size={14} color={cooldown > 0 ? '#9CA3AF' : '#2563EB'} />
                )}
                <Text
                  className={`text-xs font-semibold ${
                    cooldown > 0 ? 'text-gray-400' : 'text-blue-600'
                  }`}
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend approval code'}
                </Text>
              </Pressable>

              <Text className="text-[11px] font-medium text-gray-400">Valid for 5 mins</Text>
            </View>
          </View>

          {/* Footer Actions */}
          <View className="flex-row items-center gap-3 pt-2">
            <Pressable
              disabled={isVerifying}
              onPress={onClose}
              className="min-h-[44px] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white"
            >
              <Text className="text-sm font-semibold text-gray-700">Cancel</Text>
            </Pressable>

            <Pressable
              disabled={isVerifying || code.length !== 6}
              onPress={handleVerify}
              className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-blue-600 ${
                isVerifying || code.length !== 6 ? 'opacity-60' : ''
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
