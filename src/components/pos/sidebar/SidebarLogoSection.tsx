import React from 'react';
import { Image, Text, View } from 'react-native';

/* eslint-disable @typescript-eslint/no-require-imports */
const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

export function SidebarLogoSection() {
  return (
    <View className="items-center justify-center pt-8 pb-4">
      {/* Centered and beautifully scaled logo */}
      <View className="h-[46px] w-[85px] items-center justify-center">
        <Image
          source={leLabanLogo}
          className="h-full w-full"
          resizeMode="contain"
          accessibilityLabel="Le Leban logo"
        />
      </View>

      {/* Main Branch + Green Online Dot */}
      <View className="mt-2.5 items-center">
        <Text className="text-[11px] font-bold text-white tracking-wide">
          Main Branch
        </Text>
        <View className="mt-1 flex-row items-center justify-center">
          {/* Pulsing online green indicator dot */}
          <View className="h-1.5 w-1.5 rounded-full bg-[#10b981] shadow-sm shadow-[#10b981]/50" />
          <Text className="ml-1.5 text-[9.5px] font-medium text-white/70 uppercase tracking-widest">
            Online
          </Text>
        </View>
      </View>
    </View>
  );
}
