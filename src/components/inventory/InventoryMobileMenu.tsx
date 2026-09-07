import React from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BarChart3, ChevronDown, ChevronRight, Database, X } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import type { InventoryTabName } from './inventory-types';
import { ACTIVE_ITEM_GRADIENT, MAIN_NAV_ITEMS, MASTER_SUB_ITEMS, SIDEBAR_GRADIENT, SidebarDecoration, leLabanLogo } from './InventorySidebar';

const WHITE_80 = 'rgba(255, 255, 255, 0.8)';
const WHITE_70 = 'rgba(255, 255, 255, 0.7)';
const WHITE_60 = 'rgba(255, 255, 255, 0.6)';

interface InventoryMobileMenuProps {
  visible: boolean;
  onClose: () => void;
  activeTab: InventoryTabName;
  onSelectTab: (tab: InventoryTabName) => void;
  isMasterExpanded: boolean;
  onToggleMaster: () => void;
}

const mainItemStyle = (isActive: boolean) => ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
  {
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  isActive && {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
];

/** Slide-in navigation drawer used on phones. */
export function InventoryMobileMenu({ visible, onClose, activeTab, onSelectTab, isMasterExpanded, onToggleMaster }: InventoryMobileMenuProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 flex-row">
        <View style={{ width: 180, minWidth: 180, maxWidth: 180, overflow: 'hidden' }} className="flex-col h-full">
          <LinearGradient colors={SIDEBAR_GRADIENT} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <SidebarDecoration />

          <View
            style={{
              width: '100%',
              alignSelf: 'stretch',
              paddingTop: 28,
              paddingBottom: 20,
              paddingHorizontal: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
            }}
          >
            <View className="flex-row items-center justify-between w-full">
              <Image source={leLabanLogo} style={{ height: 40, width: 62, resizeMode: 'contain', opacity: 0.96 }} accessibilityLabel="Le Leban logo" />
              <Pressable onPress={onClose} className="p-1 rounded-lg min-w-[44px] min-h-[44px] items-center justify-center" accessibilityRole="button" accessibilityLabel="Close menu">
                <X size={16} color={colors.textOnPrimary} />
              </Pressable>
            </View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textOnPrimary, marginTop: 4 }}>Inventory Center</Text>
          </View>

          <ScrollView className="flex-1 px-3 py-4 gap-1.5" showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() => onSelectTab('dashboard')}
              style={mainItemStyle(activeTab === 'dashboard')}
              accessibilityRole="tab"
              accessibilityLabel="Dashboard"
              accessibilityState={{ selected: activeTab === 'dashboard' }}
            >
              {activeTab === 'dashboard' && (
                <LinearGradient colors={ACTIVE_ITEM_GRADIENT} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, zIndex: -1 }} />
              )}
              <BarChart3 size={14} color={activeTab === 'dashboard' ? colors.textOnPrimary : WHITE_80} />
              <Text style={{ fontSize: 11, fontWeight: activeTab === 'dashboard' ? '600' : '500', color: activeTab === 'dashboard' ? colors.textOnPrimary : WHITE_80 }}>
                Dashboard
              </Text>
            </Pressable>

            <Pressable
              onPress={onToggleMaster}
              accessibilityRole="button"
              accessibilityLabel={isMasterExpanded ? 'Collapse master setup' : 'Expand master setup'}
              style={({ pressed }) => [
                { borderRadius: 14, paddingHorizontal: 10, height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Database size={14} color={WHITE_80} />
              <Text style={{ fontSize: 11, fontWeight: '500', color: WHITE_80, flex: 1 }}>Master Setup</Text>
              {isMasterExpanded ? <ChevronDown size={12} color={WHITE_60} /> : <ChevronRight size={12} color={WHITE_60} />}
            </Pressable>

            {isMasterExpanded && (
              <View style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)', marginLeft: 14, marginBottom: 8, gap: 4 }}>
                {MASTER_SUB_ITEMS.map((sub) => {
                  const SubIcon = sub.icon;
                  const isActive = activeTab === sub.id;
                  return (
                    <Pressable
                      key={sub.id}
                      onPress={() => onSelectTab(sub.id)}
                      accessibilityRole="tab"
                      accessibilityLabel={sub.label}
                      accessibilityState={{ selected: isActive }}
                      style={({ pressed }) => [
                        { borderRadius: 10, paddingHorizontal: 8, height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, overflow: 'hidden' },
                        isActive && { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      {isActive && (
                        <LinearGradient colors={ACTIVE_ITEM_GRADIENT} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10, zIndex: -1 }} />
                      )}
                      <SubIcon size={12} color={isActive ? colors.textOnPrimary : WHITE_60} />
                      <Text style={{ fontSize: 10.5, fontWeight: isActive ? '600' : '500', color: isActive ? colors.textOnPrimary : WHITE_70 }}>{sub.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {MAIN_NAV_ITEMS.map((item) => {
              const IconComponent = item.icon;
              const isActive = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onSelectTab(item.id)}
                  style={mainItemStyle(isActive)}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: isActive }}
                >
                  {isActive && (
                    <LinearGradient colors={ACTIVE_ITEM_GRADIENT} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, zIndex: -1 }} />
                  )}
                  <IconComponent size={14} color={isActive ? colors.textOnPrimary : WHITE_80} />
                  <Text style={{ fontSize: 11, fontWeight: isActive ? '600' : '500', color: isActive ? colors.textOnPrimary : WHITE_80 }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      </View>
    </Modal>
  );
}
