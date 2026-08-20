import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuManagement } from '@/components/settings/MenuManagement';
import { useResponsive } from '@/lib/pos/useResponsive';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingBottom: isPhone ? 100 : 20, paddingTop: insets.top }]}>
        <MenuManagement />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
  },
});
