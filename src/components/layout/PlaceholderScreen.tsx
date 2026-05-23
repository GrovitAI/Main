import { View, Text } from 'react-native';

type PlaceholderScreenProps = {
  title: string;
  subtitle?: string;
};

export function PlaceholderScreen({ title, subtitle }: PlaceholderScreenProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <View className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
        <Text className="text-center text-2xl font-bold text-text-primary">{title}</Text>
        {subtitle ? (
          <Text className="mt-2 text-center text-base text-text-secondary">{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}
