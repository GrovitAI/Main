import React, { useState, useEffect, useRef } from 'react';
import { Image, Pressable, View, ActivityIndicator, ScrollView, type TextInput as RNTextInput } from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { ArrowRight, CircleAlert, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react-native';

import { KeyboardAvoider } from '@/components/ui/KeyboardAvoider';
import { brand, colors, semantic } from '@/lib/pos/brand';
import { isSupabaseConfigured } from '@/lib/pos/supabase';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { getDefaultHrefForSession } from '@/lib/pos/tab-config';
import { useResponsive } from '@/lib/pos/useResponsive';

const logoSource = require('../../../assets/images/le-leban-logo.png');

/** Shown when the build was made without usable server settings; signing in cannot work. */
const NOT_CONFIGURED_MESSAGE = 'This version of the app was built without its server settings. Please install the latest version.';

/**
 * Thin arcs that echo the light-blue swooshes inside the logo. They stretch with the panel, so
 * they sit the same way on a phone's top half and a laptop's left side.
 */
function Swooshes({ opacity = 0.2 }: { opacity?: number }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Path d="M -10 78 C 25 98, 70 95, 110 62" stroke={colors.logoSwoosh} strokeOpacity={opacity} strokeWidth={0.5} fill="none" />
      <Path d="M -10 86 C 30 105, 75 100, 110 72" stroke={colors.textOnPrimary} strokeOpacity={opacity * 0.7} strokeWidth={0.3} fill="none" />
      <Path d="M 55 -5 C 80 10, 100 25, 110 40" stroke={colors.logoSwoosh} strokeOpacity={opacity} strokeWidth={0.5} fill="none" />
    </Svg>
  );
}

/**
 * Task 271 (owner's pick, login D): the Le Laban badge on its own blue, so it reads as the brand
 * rather than a square picture, with the form on white beside it (laptop) or below it (phone).
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const passwordRef = useRef<RNTextInput>(null);

  const { signIn, session, error: authError, isLoading, clearError } = useSessionStore();
  const { isPhone } = useResponsive();
  const segments = useSegments();

  // Clear errors when user types
  useEffect(() => {
    if (validationError) setValidationError(null);
    if (authError) clearError();
  }, [email, password]);

  // After a successful sign-in, land on the role/device default screen.
  // Only redirect while the auth group is actually focused — under a deep link
  // this screen stays mounted beneath the app routes and must not hijack them.
  useEffect(() => {
    if (session && segments[0] === '(auth)') {
      router.replace(getDefaultHrefForSession(session, isPhone) as never);
    }
  }, [session, isPhone, segments]);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError('Enter your email.');
      return;
    }
    if (!password) {
      setValidationError('Enter your password.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setValidationError('That email does not look right. Check it and try again.');
      return;
    }

    await signIn(trimmedEmail, password);
  };

  const displayError = validationError || authError || (isSupabaseConfigured ? null : NOT_CONFIGURED_MESSAGE);
  const field = 'min-h-[52px] flex-row items-center gap-2.5 rounded-[14px] border bg-surface-elevated px-3.5';

  const form = (
    <View className="w-full" style={{ maxWidth: 400 }}>
      <Text accessibilityRole="header" className="font-bold text-text-primary" style={{ fontSize: isPhone ? 24 : 32, letterSpacing: isPhone ? -0.4 : -0.6 }}>Sign in</Text>
      {!isPhone ? <Text className="mt-1.5 text-[15px] font-semibold text-text-secondary">Welcome back to {brand.name}.</Text> : null}

      <View style={{ marginTop: isPhone ? 18 : 26 }}>
        <Text className="mb-1.5 text-[13px] font-bold text-text-secondary">Email</Text>
        <View className={`${field} border-border focus-within:border-primary`}>
          <Mail size={18} color={colors.textSecondary} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@lelaban.in"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!isLoading}
            accessibilityLabel="Email"
            className="min-h-[50px] min-w-0 flex-1 text-base text-text-primary"
          />
        </View>
      </View>

      <View className="mt-3.5">
        <Text className="mb-1.5 text-[13px] font-bold text-text-secondary">Password</Text>
        <View className={`${field} border-border pr-1 focus-within:border-primary`}>
          <LockKeyhole size={18} color={colors.textSecondary} />
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showPassword}
            textContentType="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void handleLogin()}
            editable={!isLoading}
            accessibilityLabel="Password"
            className="min-h-[50px] min-w-0 flex-1 text-base text-text-primary"
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            className="h-11 w-11 items-center justify-center rounded-xl hover:bg-surface-tint active:bg-surface-tint">
            {showPassword ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
          </Pressable>
        </View>
      </View>

      {displayError ? (
        <View accessibilityRole="alert" className="mt-3 flex-row items-start gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: semantic.dangerSoft }}>
          <CircleAlert size={16} color={semantic.danger} style={{ marginTop: 1 }} />
          <Text className="min-w-0 flex-1 text-[13px] font-semibold leading-[18px]" style={{ color: semantic.danger }}>{displayError}</Text>
        </View>
      ) : null}

      <Pressable onPress={() => void handleLogin()} disabled={isLoading} accessibilityRole="button" accessibilityLabel="Sign in" accessibilityState={{ disabled: isLoading, busy: isLoading }}
        className="mt-5 min-h-[54px] flex-row items-center justify-center gap-2 rounded-[14px] bg-primary hover:bg-primary-deep active:bg-primary-deep">
        {isLoading ? <ActivityIndicator size="small" color={colors.textOnPrimary} /> : null}
        <Text className="text-base font-bold text-text-on-primary">{isLoading ? 'Signing in…' : 'Sign in'}</Text>
        {!isLoading ? <ArrowRight size={18} color={colors.textOnPrimary} /> : null}
      </Pressable>

      <Text className="mt-3.5 text-center text-xs font-semibold leading-[18px] text-text-secondary">Forgot your password? The owner can reset it in Settings › Staff.</Text>
    </View>
  );

  // The logo's square is the same blue as the panel, so only the white badge shows.
  const logo = (size: number) => (
    <Image source={logoSource} accessibilityLabel={`${brand.name} logo`} style={{ width: size, height: size }} resizeMode="contain" />
  );

  if (isPhone) {
    return (
      <>
        <StatusBar style="light" />
        <KeyboardAvoider style={{ backgroundColor: colors.logoBlue }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
            <View className="items-center" style={{ minHeight: 330, justifyContent: 'center', paddingTop: 40 }}>
              <Swooshes />
              <View style={{ marginTop: -30, marginBottom: -70 }}>{logo(280)}</View>
              <Text className="text-[15px] font-semibold" style={{ color: colors.accent }}>Billing · Kitchen · Accounts</Text>
            </View>
            <View className="flex-1 items-center bg-surface-elevated px-6 pb-10 pt-8" style={{ borderTopLeftRadius: 34, borderTopRightRadius: 34 }}>
              {form}
            </View>
          </ScrollView>
        </KeyboardAvoider>
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <KeyboardAvoider style={{ flexDirection: 'row', backgroundColor: colors.surfaceElevated }}>
        <View className="items-center justify-center overflow-hidden" style={{ flex: 1.1, backgroundColor: colors.logoBlue }}>
          <Swooshes opacity={0.22} />
          {logo(460)}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }} keyboardShouldPersistTaps="handled">
          {form}
        </ScrollView>
      </KeyboardAvoider>
    </>
  );
}
