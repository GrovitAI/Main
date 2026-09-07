import React, { useCallback } from 'react';
import { FlatList, Modal, Pressable, Text, View, type ListRenderItem } from 'react-native';
import { Bell, X } from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import type { InventoryMaterial } from '@/lib/pos/inventory-service';

// Amber notification palette has no brand token yet (see report).
const AMBER_BG = '#FFFBEB';
const AMBER_BORDER = '#FDE68A';
const AMBER_ICON_BG = '#FEF3C7';
const AMBER_ICON = '#D97706';
const AMBER_TEXT = '#92400E';
const AMBER_SUBTEXT = '#B45309';
const AMBER_BADGE = '#F59E0B';
const GREEN_BG = '#F0FDF4';
const GREEN_ICON = '#22c55e';
const RED_BADGE = '#EF4444';
const SLATE_700 = '#334155';
const SLATE_400 = '#94a3b8';
const SLATE_100 = '#F1F5F9';

interface InventoryNotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  lowStockMaterials: InventoryMaterial[];
  onViewAlerts: () => void;
  screenWidth: number;
}

const NotificationRow = React.memo(function NotificationRow({ item, onPress }: { item: InventoryMaterial; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.material_name} is low on stock`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: AMBER_BG, borderWidth: 1, borderColor: AMBER_BORDER, borderRadius: 12, padding: 12, minHeight: 44, marginBottom: 6 }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: AMBER_ICON_BG, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell size={14} color={AMBER_ICON} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: AMBER_TEXT }} numberOfLines={1}>
          {item.material_name}
        </Text>
        <Text style={{ fontSize: 10, color: AMBER_SUBTEXT, marginTop: 1 }}>
          Stock: {item.current_stock} {item.unit_short_name ?? ''} — Reorder at {item.reorder_level} {item.unit_short_name ?? ''}
        </Text>
      </View>
      <View style={{ backgroundColor: AMBER_BADGE, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ fontSize: 8, fontWeight: '900', color: colors.textOnPrimary, textTransform: 'uppercase' }}>Low</Text>
      </View>
    </Pressable>
  );
});

/** Bell dropdown listing low-stock materials. */
export function InventoryNotificationsModal({ visible, onClose, lowStockMaterials, onViewAlerts, screenWidth }: InventoryNotificationsModalProps) {
  const renderItem: ListRenderItem<InventoryMaterial> = useCallback(
    ({ item }) => <NotificationRow item={item} onPress={onViewAlerts} />,
    [onViewAlerts]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,39,68,0.35)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close notifications">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
          style={{
            position: 'absolute',
            top: 64,
            right: 24,
            width: Math.min(340, screenWidth - 32),
            backgroundColor: colors.background,
            borderRadius: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 12,
            overflow: 'hidden',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: SLATE_100 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Bell size={15} color={colors.textPrimary} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary }}>Notifications</Text>
              {lowStockMaterials.length > 0 && (
                <View style={{ backgroundColor: RED_BADGE, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: colors.textOnPrimary }}>{lowStockMaterials.length}</Text>
                </View>
              )}
            </View>
            <Pressable onPress={onClose} style={{ padding: 4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Close notifications">
              <X size={16} color={SLATE_400} />
            </Pressable>
          </View>

          {lowStockMaterials.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: GREEN_BG, alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={20} color={GREEN_ICON} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: SLATE_700 }}>All clear!</Text>
              <Text style={{ fontSize: 11, color: SLATE_400, textAlign: 'center' }}>No low stock alerts at this time.</Text>
            </View>
          ) : (
            <FlatList
              data={lowStockMaterials}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ padding: 10 }}
              showsVerticalScrollIndicator={false}
              initialNumToRender={8}
              windowSize={5}
            />
          )}

          <Pressable
            onPress={onViewAlerts}
            accessibilityRole="button"
            style={{ margin: 10, marginTop: 4, backgroundColor: colors.textPrimary, borderRadius: 12, paddingVertical: 11, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textOnPrimary }}>View All Alerts →</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
