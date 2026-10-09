import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { gradients } from '@/lib/pos/brand';

/** The incumbent POS gradient and ring detail, shared by its kitchen rail. */
export function SidebarSurface() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <LinearGradient colors={gradients.posSidebar} style={{ flex: 1 }} />
      <View className="absolute bottom-0 left-0 right-0 h-[180px] overflow-hidden opacity-[0.08]">
        <View className="absolute -bottom-[60px] -left-[30px] h-[150px] w-[150px] rounded-full border border-text-on-primary" />
        <View className="absolute -bottom-[30px] -right-[60px] h-[120px] w-[120px] rounded-full border border-text-on-primary" />
        <View className="absolute bottom-[30px] -left-[45px] h-[130px] w-[130px] rounded-full border-2 border-text-on-primary" />
      </View>
    </View>
  );
}

export function SidebarSelection() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden rounded-[14px]">
      <LinearGradient colors={gradients.posSidebarSelected} style={{ flex: 1 }} />
    </View>
  );
}
