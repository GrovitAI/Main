import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CakeSlice,
  Coffee,
  CupSoda,
  GlassWater,
  LayoutGrid,
  CirclePlus,
  Sandwich,
} from 'lucide-react-native';

type SidebarItemProps = {
  name: string;
  isActive: boolean;
  onPress: () => void;
};

function getCategoryIcon(name: string, isActive: boolean) {
  const color = isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.75)';
  const size = 18;

  const lowerName = name.toLowerCase();
  if (lowerName === 'all' || lowerName.includes('all')) {
    return <LayoutGrid color={color} size={size} />;
  }
  if (
    lowerName.includes('signature') ||
    lowerName.includes('cake') ||
    lowerName.includes('dessert') ||
    lowerName.includes('sweet')
  ) {
    return <CakeSlice color={color} size={size} />;
  }
  if (
    lowerName.includes('kunafa') ||
    lowerName.includes('waffle') ||
    lowerName.includes('crepe') ||
    lowerName.includes('pancake')
  ) {
    return <Sandwich color={color} size={size} />;
  }
  if (lowerName.includes('cup') && !lowerName.includes('drink')) {
    return <CupSoda color={color} size={size} />;
  }
  if (
    lowerName.includes('drink') ||
    lowerName.includes('shake') ||
    lowerName.includes('beverage') ||
    lowerName.includes('cold')
  ) {
    return <GlassWater color={color} size={size} />;
  }
  if (
    lowerName.includes('hot') ||
    lowerName.includes('coffee') ||
    lowerName.includes('tea')
  ) {
    return <Coffee color={color} size={size} />;
  }
  if (
    lowerName.includes('add') ||
    lowerName.includes('extra') ||
    lowerName.includes('topping')
  ) {
    return <CirclePlus color={color} size={size} />;
  }

  return <LayoutGrid color={color} size={size} />;
}

export function SidebarItem({ name, isActive, onPress }: SidebarItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="w-full active:opacity-90"
    >
      {isActive ? (
        // Active: Glowing soft blue pill
        <View className="min-h-[50px] w-full flex-row items-center overflow-hidden rounded-[14px] px-3 shadow-md shadow-blue-500/20">
          <LinearGradient
            colors={['#4ca4ff', '#2d85f0']}
            className="absolute inset-0"
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <View className="mr-2.5 items-center justify-center">
            {getCategoryIcon(name, true)}
          </View>
          <Text
            className="flex-1 text-[11.5px] font-bold text-white leading-tight"
            numberOfLines={2}
          >
            {name}
          </Text>
        </View>
      ) : (
        // Inactive: Transparent background, highly readable white text (75% opacity)
        <View className="min-h-[50px] w-full flex-row items-center rounded-[14px] px-3 border border-transparent">
          <View className="mr-2.5 items-center justify-center">
            {getCategoryIcon(name, false)}
          </View>
          <Text
            className="flex-1 text-[11.5px] font-medium text-white/75 leading-tight"
            numberOfLines={2}
          >
            {name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
