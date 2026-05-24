import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
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
  onIncrementItem: (itemId: string) => void;
  onDecrementItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onSendKot: () => void;
  onSettle: () => void;
};

export function OrderPanel({
  order,
  items,
  orderIndex,
  isLoading,
  isMutating,
  onIncrementItem,
  onDecrementItem,
  onRemoveItem,
  onSendKot,
  onSettle,
}: OrderPanelProps) {
  const subtotal = calculateOrderSubtotal(items);
  const tax = calculateTax(subtotal, TAX_RATE);
  const total = calculateOrderTotal(subtotal, TAX_RATE);

  const orderTitle = order
    ? formatOrderLabel(order.order_name, `Order #${orderIndex + 1}`)
    : 'New Order';

  const hasItems = items.length > 0;
  const ctaDisabled = !order || !hasItems || isMutating;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 18, elevation: 3 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{orderTitle}</Text>
        <Text style={{ fontSize: 11, fontWeight: '500', color: '#6B7280' }}>{items.length} items</Text>
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
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <Text style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
                Add items to this order
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', paddingVertical: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F9FAFB' }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F5F8FC', marginRight: 8 }} />
              
              <View style={{ flex: 1, marginRight: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0B5FB3', marginTop: 1 }}>
                  {formatCurrency(item.qty * item.price)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', height: 30, borderRadius: 10, backgroundColor: '#F4F8FD', paddingHorizontal: 2 }}>
                <Pressable
                  onPress={() => onDecrementItem(item.id)}
                  style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}
                >
                  <Minus color="#4B5563" size={10} />
                </Pressable>
                <Text style={{ width: 20, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#111827' }}>
                  {item.qty}
                </Text>
                <Pressable
                  onPress={() => onIncrementItem(item.id)}
                  style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 }}
                >
                  <Plus color="#4B5563" size={10} />
                </Pressable>
              </View>

              <Pressable
                onPress={() => onRemoveItem(item.id)}
                style={{ marginLeft: 6, padding: 2 }}
              >
                <Trash2 color="#EF4444" size={14} opacity={0.6} />
              </Pressable>
            </View>
          )}
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

        <Pressable
          accessibilityRole="button"
          disabled={ctaDisabled}
          onPress={onSettle}
          style={({ pressed }) => [
            { marginTop: 10, shadowColor: '#0B5FB3', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 3 },
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
          ]}
        >
          <LinearGradient
            colors={['#0D6CE0', '#0B58B2']}
            style={{ height: 48, width: '100%', borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Pay {formatCurrency(total)}</Text>
          </LinearGradient>
        </Pressable>
        
        <Pressable
          accessibilityRole="button"
          disabled={ctaDisabled}
          onPress={onSendKot}
          style={{ marginTop: 10, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280' }}>Send KOT</Text>
        </Pressable>
      </View>
    </View>
  );
}
