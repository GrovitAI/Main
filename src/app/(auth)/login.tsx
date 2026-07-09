import React, { useState, useEffect } from 'react';
import { Image, Pressable, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import { brand } from '@/lib/pos/brand';
import { useSessionStore } from '@/lib/pos/use-session-store';

const logoSource = require('../../../assets/images/le-leban-logo.png');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const { signIn, session, error: authError, isLoading, clearError } = useSessionStore();

  // Clear errors when user types
  useEffect(() => {
    if (validationError) setValidationError(null);
    if (authError) clearError();
  }, [email, password]);

  // If user is already authenticated (e.g. from session restoration), redirect
  useEffect(() => {
    if (session) {
      router.replace('/(app)');
    }
  }, [session]);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError('Email is required.');
      return;
    }
    if (!password) {
      setValidationError('Password is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    await signIn(trimmedEmail, password);
  };

  const displayError = validationError || authError;

  return (
    <>
      <StatusBar style="light" />
      <BrandedGradient variant="hero" className="flex-1">
        <View className="flex-1 items-center justify-center px-6 py-8">
          <Image
            source={logoSource}
            accessibilityLabel={`${brand.name} logo`}
            className="h-16 w-36 md:h-20 md:w-44"
            resizeMode="contain"
          />

          <View className="mt-6 w-full max-w-[360px] rounded-panel border border-border-soft bg-surface-elevated p-8 shadow-panel">
            <Text className="text-center text-xl font-bold text-text-primary">
              {brand.name}
            </Text>
            <Text className="mt-1.5 text-center text-xs text-text-secondary">
              Sign in to your restaurant POS
            </Text>

            <View className="mt-6 space-y-4">
              {/* Email Input */}
              <View>
                <Text className="text-xs font-semibold text-text-secondary mb-1.5">
                  Email Address
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="cashier@leleban.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border text-text-primary bg-surface-tint/10 text-sm focus:border-primary focus:bg-white"
                />
              </View>

              {/* Password Input */}
              <View className="mt-4">
                <Text className="text-xs font-semibold text-text-secondary mb-1.5">
                  Password
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border text-text-primary bg-surface-tint/10 text-sm focus:border-primary focus:bg-white"
                />
              </View>
            </View>

            {/* Error Message Box */}
            {displayError && (
              <View className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200">
                <Text className="text-xs font-medium text-red-600 text-center">
                  {displayError}
                </Text>
              </View>
            )}

            {/* Submit Button */}
            <Pressable
              onPress={handleLogin}
              disabled={isLoading}
              className="mt-6 overflow-hidden rounded-2xl"
              style={({ pressed }) => ({
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <BrandedGradient
                variant="primarySoft"
                className="min-h-[44px] items-center justify-center px-8 py-2.5 flex-row"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" className="mr-2" />
                ) : null}
                <Text className="text-base font-bold text-text-on-primary">
                  {isLoading ? 'Signing In...' : 'Continue to POS'}
                </Text>
              </BrandedGradient>
            </Pressable>
          </View>

          <Text className="mt-6 text-center text-sm text-text-on-primary/80">
            Powered by Grovit
          </Text>
        </View>
      </BrandedGradient>
    </>
  );
}
