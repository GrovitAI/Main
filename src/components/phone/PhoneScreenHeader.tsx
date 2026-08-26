import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Menu } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';

export interface PhoneScreenHeaderProps {
  title: string;
  subtitle?: string;
  rightActions?: React.ReactNode;
  rightContent?: React.ReactNode;
  onBack?: () => void;
  onMenuPress?: () => void;
}

export function PhoneScreenHeader({
  title,
  subtitle,
  rightActions,
  rightContent,
  onBack,
  onMenuPress,
}: PhoneScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const effectiveRight = rightActions || rightContent;

  return (
    <View
      className="bg-white border-b border-[#E2E8F0]"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center min-h-[56px] px-2 py-1">
        {onBack ? (
          <Pressable
            onPress={onBack}
            className="w-[44px] h-[44px] items-center justify-center rounded-full"
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={colors.textPrimary} />
          </Pressable>
        ) : onMenuPress ? (
          <Pressable
            onPress={onMenuPress}
            className="w-[44px] h-[44px] items-center justify-center rounded-full"
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Menu size={22} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        
        <View className={`flex-1 justify-center ${onBack || onMenuPress ? 'ml-1' : 'ml-2'} mr-2`}>
          <Text
            className="text-[16px] font-bold"
            style={{ color: colors.textPrimary }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              className="text-[11px] mt-0.5"
              style={{ color: colors.textSecondary }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {effectiveRight && (
          <View className="flex-row items-center justify-end min-h-[44px]">
            {effectiveRight}
          </View>
        )}
      </View>
    </View>
  );
}
