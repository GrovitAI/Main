import React from 'react';
import { Image, Text, View } from 'react-native';

/* eslint-disable @typescript-eslint/no-require-imports */
const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

export function SidebarLogoSection() {
  return (
    <View className="items-center justify-center pt-4 pb-2">
      {/* Centered and beautifully scaled logo with strict inline dimensions to prevent NativeWind sizing bugs */}
      <View style={{ width: 75, height: 40 }} className="items-center justify-center">
        <Image
          source={leLabanLogo}
          style={{ width: 75, height: 40 }}
          resizeMode="contain"
          accessibilityLabel="Le Leban logo"
        />
      </View>

      {/* Main Branch + Green Online Dot */}
      <View className="mt-1.5 items-center">
        <Text className="text-[10px] font-bold text-white tracking-wide">
          Main Branch
        </Text>
        <View className="mt-0.5 flex-row items-center justify-center">
          {/* Pulsing online green indicator dot */}
          <View className="h-1 w-1 rounded-full bg-[#10b981] shadow-sm shadow-[#10b981]/50" />
          <Text className="ml-1 text-[8.5px] font-medium text-white/70 uppercase tracking-widest">
            Online
          </Text>
        </View>
      </View>
    </View>
  );
}
