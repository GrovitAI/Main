import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  Alert,
  Platform,
} from 'react-native';
import { Minus, Plus, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/lib/pos/brand';
import type { OpenOrder, PosOrderItem } from '@/lib/pos/order-types';
import {
  calculateOrderSubtotal,
  calculateOrderTotal,
  calculateTax,
  formatOrderLabel,
  TAX_RATE,
} from '@/lib/pos/order-utils';
import { formatCurrency } from '@/lib/pos/settlement-utils';

type OrderPanelProps = {
  order: OpenOrder | null;
  items: PosOrderItem[];
  orderIndex: number;
  isLoading: boolean;
  isMutating: boolean;
  isEditingUnpaid: boolean;
  hasUnsavedChanges: boolean;
  isReadOnlyView: boolean;
  onIncrementItem: (itemId: string) => void;
  onDecrementItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onSaveKot: () => void;
  onSaveAndPrint: () => void;
  onSettle: () => void;
  onCancel: () => void;
  onHoldOrder: () => void;
  onEditBill: () => void;
  onDiscardChanges: () => void;
  onStartNewOrder: () => void;
  heldOrders: OpenOrder[];
  itemCountByOrderId: Record<string, number>;
  onResumeOrder: (orderId: string) => void;
};

export function OrderPanel({
  order,
  items,
  orderIndex,
  isLoading,
  isMutating,
  isEditingUnpaid,
  hasUnsavedChanges,
  isReadOnlyView,
  onIncrementItem,
  onDecrementItem,
  onRemoveItem,
  onSaveKot,
  onSaveAndPrint,
  onSettle,
  onCancel,
  onHoldOrder,
  onEditBill,
  onDiscardChanges,
  onStartNewOrder,
  heldOrders,
  itemCountByOrderId,
  onResumeOrder,
}: OrderPanelProps) {
  const [saveKotHovered, setSaveKotHovered] = useState(false);
  const [savePrintHovered, setSavePrintHovered] = useState(false);
  const WebPressable = Pressable as any;

  const subtotal = useMemo(() => calculateOrderSubtotal(items), [items]);
  const tax = useMemo(() => calculateTax(subtotal, TAX_RATE), [subtotal]);
  const total = useMemo(() => calculateOrderTotal(subtotal, TAX_RATE), [subtotal]);

  const isUnpaid = order ? (order.status === 'unpaid' || order.status === 'in_kitchen') : false;
  const isDraft = order ? (order.status === 'draft' || order.status === 'open') : false;
  // Read-only mode forces canEdit off regardless of status
  const canEdit = !isReadOnlyView && (isDraft || isEditingUnpaid);

  // Title override for read-only closed orders
  const readOnlyTitle = order?.status === 'paid'
    ? 'Paid Bill'
    : order?.status === 'cancelled'
      ? 'Cancelled Order'
      : order?.status === 'completed'
        ? 'Completed Order'
        : null;

  const orderTitle = order
    ? (readOnlyTitle ??
        ((order.status === 'unpaid' || order.status === 'in_kitchen')
          ? (order.order_name || 'Unpaid Bill')
          : (order.status === 'held'
              ? 'Held Order'
              : (order.status === 'draft' || order.status === 'open'
                  ? 'Current Cart'
                  : formatOrderLabel(order.order_name, 'Order')
                )
            )
        )
      )
    : 'New Order';

  const hasItems = items.length > 0;
  const hasUnsentItems = items.some((item) => !item.kot_sent);
  const showSaveKotButton = !isReadOnlyView && hasUnsentItems && (isDraft || isEditingUnpaid);
  const showSaveAndPrintButton = !isReadOnlyView && hasItems && (isDraft || isUnpaid);
  const showSettleButton = !isReadOnlyView && isUnpaid && !hasUnsentItems;

  const handleResetPress = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Clear current cart?\n\nThis will remove all items from the current cart.');
      if (confirmed) {
        onResetCartPress();
      }
    } else {
      Alert.alert(
        'Clear current cart?',
        'This will remove all items from the current cart.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear Cart',
            style: 'destructive',
            onPress: () => onResetCartPress(),
          },
        ]
      );
    }
  };

  const onResetCartPress = () => {
    // Resetting cart is basically clearing items in draft mode.
    onDiscardChanges(); // We reuse the callback
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 18, elevation: 3 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{orderTitle}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isReadOnlyView && (
            <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: '#FEF3C7' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#B45309', letterSpacing: 0.5 }}>READ ONLY</Text>
            </View>
          )}
          {isEditingUnpaid && !isReadOnlyView && (
            <View className="rounded px-2 py-0.5" style={{ backgroundColor: '#FEE2E2' }}>
              <Text className="text-[9px] font-bold text-red-700 uppercase tracking-wider">EDITING</Text>
            </View>
          )}
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#6B7280' }}>{items.length} items</Text>
        </View>
      </View>

      {/* Items list */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#0D6CE0" size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={{ flex: 1, marginTop: 2 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 10 }}>
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
                  Add items to this order
                </Text>
              </View>
              
              {heldOrders && heldOrders.length > 0 && (
                <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: '#EEF2F7', paddingTop: 16 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: '#4B5563', marginBottom: 10 }}>
                    Held Carts ({heldOrders.length})
                  </Text>
                  
                  <FlatList
                    data={heldOrders}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => {
                      const itemsCount = itemCountByOrderId[item.id] ?? 0;
                      const elapsed = getElapsedLabel(item.created_at);
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' }}>
                          <View>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827' }}>
                              Draft Order
                            </Text>
                            <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
                              {itemsCount} {itemsCount === 1 ? 'item' : 'items'} • {elapsed}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => onResumeOrder(item.id)}
                            style={{ height: 28, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#E8F2FA', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D6CE0' }}>Resume</Text>
                          </Pressable>
                        </View>
                      );
                    }}
                  />
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const isItemEditable = canEdit && !item.kot_sent;
            return (
              <View style={{ flexDirection: 'row', paddingVertical: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F9FAFB', opacity: item.kot_sent ? 0.85 : 1 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F5F8FC', marginRight: 8 }} />
                
                <View style={{ flex: 1, marginRight: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: '#013b8c' }} numberOfLines={1}>
                    {item.product_name} {item.kot_sent && <Text style={{ fontSize: 10, fontWeight: '600', color: '#10B981' }}>(Sent)</Text>}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0B5FB3', marginTop: 1 }}>
                    {formatCurrency(item.qty * item.price)}
                  </Text>
                </View>

                <View 
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    height: 30, 
                    borderRadius: 10, 
                    backgroundColor: isItemEditable ? '#F4F8FD' : '#E2E8F0', 
                    paddingHorizontal: 2,
                    opacity: isItemEditable ? 1 : 0.85
                  }}
                >
                  <Pressable
                    disabled={!isItemEditable || isMutating}
                    onPress={() => onDecrementItem(item.id)}
                    style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: isItemEditable ? '#FFFFFF' : '#CBD5E1', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}
                  >
                    <Minus color={isItemEditable ? '#4B5563' : '#4B5563'} size={10} />
                  </Pressable>
                  <Text style={{ width: 20, textAlign: 'center', fontSize: 12, fontWeight: '800', color: isItemEditable ? '#111827' : '#4B5563' }}>
                    {item.qty}
                  </Text>
                  <Pressable
                    disabled={!isItemEditable || isMutating}
                    onPress={() => onIncrementItem(item.id)}
                    style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: isItemEditable ? '#FFFFFF' : '#CBD5E1', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}
                  >
                    <Plus color={isItemEditable ? '#4B5563' : '#4B5563'} size={10} />
                  </Pressable>
                </View>
 
                <Pressable
                  disabled={!isItemEditable || isMutating}
                  onPress={() => onRemoveItem(item.id)}
                  style={{ marginLeft: 6, padding: 2, opacity: isItemEditable ? 1 : 0.85 }}
                >
                  <Trash2 color={isItemEditable ? '#EF4444' : '#94A3B8'} size={14} opacity={isItemEditable ? 0.6 : 0.4} />
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {/* Totals + CTAs */}
      <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Subtotal</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827' }}>
            {formatCurrency(subtotal)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Tax (5%)</Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827' }}>
            {formatCurrency(tax)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Total</Text>
          <Text style={{ fontSize: 25, fontWeight: '800', letterSpacing: -1, color: '#111827' }}>
            {formatCurrency(total)}
          </Text>
        </View>

        {/* Primary CTA Buttons Row (Compact, Space-Efficient side-by-side layout) */}
        {!isReadOnlyView && (showSaveKotButton || showSaveAndPrintButton || showSettleButton) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, width: '100%' }}>
            {showSaveKotButton && (
              <WebPressable
                accessibilityRole="button"
                disabled={!hasItems || isMutating}
                onPress={onSaveKot}
                onMouseEnter={() => setSaveKotHovered(true)}
                onMouseLeave={() => setSaveKotHovered(false)}
                style={({ pressed }: { pressed: boolean }) => [
                  { 
                    flex: 1, 
                    height: 42, 
                    borderRadius: 12, 
                    borderWidth: 1.5,
                    borderColor: saveKotHovered ? '#047857' : '#10B981',
                    backgroundColor: saveKotHovered ? '#059669' : '#10B981', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    shadowColor: '#047857', 
                    shadowOffset: { width: 0, height: 4 }, 
                    shadowOpacity: saveKotHovered ? 0.16 : 0.08, 
                    shadowRadius: 8, 
                    elevation: 2 
                  },
                  (!hasItems || isMutating) && { opacity: 0.5 },
                  pressed && { transform: [{ scale: 0.98 }] }
                ]}
              >
                {isMutating ? (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>...</Text>
                ) : (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                      {isEditingUnpaid ? 'Update KOT' : 'Save KOT'}
                    </Text>
                    {Platform.OS === 'web' && (
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#A7F3D0', opacity: 0.85 }}>[F2]</Text>
                    )}
                  </View>
                )}
              </WebPressable>
            )}

            {showSaveAndPrintButton && (
              <WebPressable
                accessibilityRole="button"
                disabled={!hasItems || isMutating}
                onPress={onSaveAndPrint}
                onMouseEnter={() => setSavePrintHovered(true)}
                onMouseLeave={() => setSavePrintHovered(false)}
                style={({ pressed }: { pressed: boolean }) => [
                  { 
                    flex: 1, 
                    height: 42, 
                    borderRadius: 12, 
                    borderWidth: 1.5,
                    borderColor: savePrintHovered ? '#047857' : '#10B981',
                    backgroundColor: savePrintHovered ? '#059669' : '#10B981', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    shadowColor: '#047857', 
                    shadowOffset: { width: 0, height: 4 }, 
                    shadowOpacity: savePrintHovered ? 0.16 : 0.08, 
                    shadowRadius: 8, 
                    elevation: 2 
                  },
                  (!hasItems || isMutating) && { opacity: 0.5 },
                  pressed && { transform: [{ scale: 0.98 }] }
                ]}
              >
                {isMutating ? (
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>...</Text>
                ) : (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                      Save & Print
                    </Text>
                    {Platform.OS === 'web' && (
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#A7F3D0', opacity: 0.85 }}>[F3]</Text>
                    )}
                  </View>
                )}
              </WebPressable>
            )}

            {showSettleButton && (
              <Pressable
                accessibilityRole="button"
                disabled={isMutating}
                onPress={onSettle}
                style={({ pressed }) => [
                  { flex: 1, shadowColor: '#047857', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
                ]}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={{ height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
                >
                  {isMutating ? (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>...</Text>
                  ) : (
                    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                        Settle Bill
                      </Text>
                      {Platform.OS === 'web' && (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#A7F3D0', opacity: 0.85 }}>[F8]</Text>
                      )}
                    </View>
                  )}
                </LinearGradient>
              </Pressable>
            )}
          </View>
        )}

        {!isReadOnlyView && !isEditingUnpaid && showSettleButton && (
          <Pressable
            accessibilityRole="button"
            disabled={isMutating}
            onPress={onEditBill}
            style={({ pressed }) => [
              { height: 40, width: '100%', borderRadius: 12, borderWidth: 1.5, borderColor: '#0D6CE0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', marginTop: 8 },
              pressed && { backgroundColor: '#F0F7FF', transform: [{ scale: 0.98 }] }
            ]}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0D6CE0' }}>Edit Bill</Text>
          </Pressable>
        )}
 
        {/* Read-only mode — replaces all mutation CTAs */}
        {isReadOnlyView && (
          <Pressable
            accessibilityRole="button"
            onPress={onStartNewOrder}
            style={({ pressed }) => [
              { marginTop: 10, shadowColor: '#0D6CE0', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 3 },
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
            ]}
          >
            <LinearGradient
              colors={['#0D6CE0', '#0B58B2']}
              style={{ height: 48, width: '100%', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Start New Order</Text>
            </LinearGradient>
          </Pressable>
        )}
             {/* Bottom actions row — hidden when read-only */}
        {!isReadOnlyView && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
          {/* Hold Order */}
          <Pressable
            accessibilityRole="button"
            disabled={!isDraft || !hasItems || isMutating}
            onPress={onHoldOrder}
            style={({ pressed }) => [
              { flex: 1, height: 38, borderRadius: 10, backgroundColor: (!isDraft || !hasItems || isMutating) ? '#F8FAFC' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: (!isDraft || !hasItems || isMutating) ? '#CBD5E1' : '#4B5563' }}>
                Hold
              </Text>
              {Platform.OS === 'web' && (
                <Text style={{ fontSize: 10, fontWeight: '600', color: (!isDraft || !hasItems || isMutating) ? '#CBD5E1' : '#94A3B8', opacity: 0.85 }}>
                  [F4]
                </Text>
              )}
            </View>
          </Pressable>

          {/* Reset Cart / Discard Changes */}
          {isEditingUnpaid ? (
            <Pressable
              accessibilityRole="button"
              disabled={isMutating}
              onPress={onDiscardChanges}
              style={({ pressed }) => [
                { flex: 1, height: 38, borderRadius: 10, backgroundColor: isMutating ? '#F8FAFC' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: isMutating ? '#CBD5E1' : '#EF4444' }}>
                  Discard
                </Text>
                {Platform.OS === 'web' && (
                  <Text style={{ fontSize: 10, fontWeight: '600', color: isMutating ? '#CBD5E1' : '#FCA5A5', opacity: 0.85 }}>
                    [Alt+R]
                  </Text>
                )}
              </View>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={!isDraft || !hasItems || isMutating}
              onPress={handleResetPress}
              style={({ pressed }) => [
                { flex: 1, height: 38, borderRadius: 10, backgroundColor: (!isDraft || !hasItems || isMutating) ? '#F8FAFC' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: (!isDraft || !hasItems || isMutating) ? '#CBD5E1' : '#EF4444' }}>
                  Reset
                </Text>
                {Platform.OS === 'web' && (
                  <Text style={{ fontSize: 10, fontWeight: '600', color: (!isDraft || !hasItems || isMutating) ? '#CBD5E1' : '#FCA5A5', opacity: 0.85 }}>
                    [Alt+R]
                  </Text>
                )}
              </View>
            </Pressable>
          )}

          {/* Cancel Order */}
          <Pressable
            accessibilityRole="button"
            disabled={!order || isMutating || order.status === 'paid'}
            onPress={onCancel}
            style={({ pressed }) => [
              { flex: 1, height: 38, borderRadius: 10, backgroundColor: (!order || isMutating || order.status === 'paid') ? '#F8FAFC' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }
            ]}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: (!order || isMutating || order.status === 'paid') ? '#CBD5E1' : '#4B5563' }}>
              Cancel Order
            </Text>
          </Pressable>
        </View>
        )}
      </View>
    </View>
  );
}

function getElapsedLabel(createdAt: string): string {
  const createdMs = new Date(createdAt).getTime();
  const minutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60_000));
  if (minutes < 1) {
    return 'Just now';
  }
  return `${minutes}m ago`;
}
