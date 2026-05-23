import { Image, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BrandedGradient } from '@/components/pos/BrandedGradient';
import { brand } from '@/lib/pos/brand';

const logoSource = require('../../../assets/images/le-leban-logo.png');

export default function LoginScreen() {
  return (
    <>
      <StatusBar style="light" />
      <BrandedGradient variant="hero" className="flex-1">
      <View className="flex-1 items-center justify-center px-6 py-10">
        <Image
          source={logoSource}
          accessibilityLabel={`${brand.name} logo`}
          className="h-40 w-72"
          resizeMode="contain"
        />

        <View className="mt-10 w-full max-w-sm rounded-panel border-2 border-border-soft bg-surface-elevated p-8 shadow-panel">
          <Text className="text-center text-2xl font-bold text-text-primary">
            {brand.name}
          </Text>
          <Text className="mt-2 text-center text-base text-text-secondary">
            Sign in to your restaurant POS
          </Text>

          <Link href="/(app)" asChild>
            <Pressable className="mt-8 overflow-hidden rounded-2xl">
              <BrandedGradient
                variant="primarySoft"
                className="min-h-[48px] items-center justify-center px-8 py-3"
              >
                <Text className="text-base font-bold text-text-on-primary">
                  Continue to POS
                </Text>
              </BrandedGradient>
            </Pressable>
          </Link>
        </View>

        <Text className="mt-6 text-center text-sm text-text-on-primary/80">
          Powered by Grovit
        </Text>
      </View>
    </BrandedGradient>
    </>
  );
}
