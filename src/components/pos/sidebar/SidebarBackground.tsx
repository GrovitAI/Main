import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function SidebarBackground() {
  return (
    <LinearGradient
      colors={['#0066B8', '#0B73CC', '#0057A8']}
      className="absolute inset-0"
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    />
  );
}

export function SidebarDecoration() {
  return (
    <View className="absolute inset-x-0 bottom-0 h-[280px] overflow-hidden opacity-20 pointer-events-none">
      <View className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full border-[1.5px] border-white/30" />
      <View className="absolute -bottom-10 -right-20 h-48 w-48 rounded-full border-[1px] border-white/20" />
      <View className="absolute bottom-12 -left-16 h-52 w-52 rounded-full border-[1.5px] border-white/15" />
      <View className="absolute bottom-36 -right-8 h-36 w-36 rounded-full border-[1px] border-white/15" />
      <View className="absolute bottom-0 left-0 right-0 h-40 bg-white/5 rounded-tl-[80px]" />
    </View>
  );
}
