import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { gradients } from '@/lib/pos/brand';

type GradientVariant = keyof typeof gradients;

type BrandedGradientProps = {
  variant?: GradientVariant;
  children: ReactNode;
  className?: string;
};

export function BrandedGradient({
  variant = 'primary',
  children,
  className = '',
}: BrandedGradientProps) {
  const gradientColors = gradients[variant];
  const isHero = variant === 'hero';

  return (
    <View className={`overflow-hidden ${className}`}>
      <LinearGradient
        colors={[...gradientColors]}
        start={isHero ? { x: 0.5, y: 0 } : { x: 0, y: 0 }}
        end={isHero ? { x: 0.5, y: 1 } : { x: 1, y: 1 }}
        className="absolute inset-0"
      />
      {children}
    </View>
  );
}
