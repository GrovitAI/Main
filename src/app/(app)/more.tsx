import { ActivityIndicator, FlatList, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/pos/brand';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { getDefaultHrefForSession } from '@/lib/pos/tab-config';
import {
  flattenNavigationGroups, getMoreGroups, usesDailyWorkNavigation, type NavigationRow,
} from '@/lib/pos/daily-work-navigation';

export default function MoreScreen() {
  const { session } = useSessionStore();
  const { width } = useWindowDimensions();
  const isPhone = width < 768;
  const insets = useSafeAreaInsets();
  if (!session) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator color={colors.primary} /></View>;
  if (!usesDailyWorkNavigation(session.role)) return <Redirect href={getDefaultHrefForSession(session, isPhone) as Href} />;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: isPhone ? insets.top : 0 }}>
      <FlatList<NavigationRow>
        data={flattenNavigationGroups(getMoreGroups(session.role, isPhone))}
        keyExtractor={(row) => row.key}
        contentContainerClassName={`w-full max-w-[720px] px-5 ${!isPhone && Platform.OS === 'web' ? 'pb-28' : 'pb-8'}`}
        ListHeaderComponent={<Text accessibilityRole="header" className="pb-2 pt-6 text-2xl font-semibold text-text-primary">More</Text>}
        ListEmptyComponent={<Text className="py-6 text-text-secondary">No additional screens are available for this account.</Text>}
        renderItem={({ item }) => {
          if (item.kind === 'heading') return <Text className="mb-2 mt-6 text-sm font-semibold text-text-secondary">{item.title}</Text>;
          const Icon = item.tab.icon;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.tab.label}
              onPress={() => router.navigate(item.tab.href as Href)}
              className="min-h-[56px] flex-row items-center gap-3 border-b border-border-soft py-3 hover:bg-surface-tint"
            >
              <Icon size={20} color={colors.primaryDeep} />
              <Text className="flex-1 text-base text-text-primary">{item.tab.label}</Text>
              <ChevronRight size={18} color={colors.textSecondary} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
