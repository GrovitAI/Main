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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 4 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>{orderTitle}</Text>
        <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>{items.length} items</Text>
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
          style={{ flex: 1, marginTop: 4 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <Text style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                Add items to this order
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F9FAFB' }}>
              <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: '#F5F8FC', marginRight: 10 }} />
              
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0B5FB3', marginTop: 2 }}>
                  {formatCurrency(item.qty * item.price)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, borderRadius: 12, backgroundColor: '#F4F8FD', paddingHorizontal: 3 }}>
                <Pressable
                  onPress={() => onDecrementItem(item.id)}
                  style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }}
                >
                  <Minus color="#4B5563" size={12} />
                </Pressable>
                <Text style={{ width: 24, textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#111827' }}>
                  {item.qty}
                </Text>
                <Pressable
                  onPress={() => onIncrementItem(item.id)}
                  style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 }}
                >
                  <Plus color="#4B5563" size={12} />
                </Pressable>
              </View>

              <Pressable
                onPress={() => onRemoveItem(item.id)}
                style={{ marginLeft: 8, padding: 3 }}
              >
                <Trash2 color="#EF4444" size={16} opacity={0.6} />
              </Pressable>
            </View>
          )}
        />
      )}

      {/* Totals + CTAs */}
      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 13, color: '#6B7280' }}>Subtotal</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
            {formatCurrency(subtotal)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 13, color: '#6B7280' }}>Tax (5%)</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
            {formatCurrency(tax)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Total</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: -1, color: '#111827' }}>
            {formatCurrency(total)}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={ctaDisabled}
          onPress={onSettle}
          style={({ pressed }) => [
            { marginTop: 14, shadowColor: '#0B5FB3', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.20, shadowRadius: 20, elevation: 4 },
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
          ]}
        >
          <LinearGradient
            colors={['#0D6CE0', '#0B58B2']}
            style={{ height: 54, width: '100%', borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Pay {formatCurrency(total)}</Text>
          </LinearGradient>
        </Pressable>
        
        <Pressable
          accessibilityRole="button"
          disabled={ctaDisabled}
          onPress={onSendKot}
          style={{ marginTop: 12, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280' }}>Send KOT</Text>
        </Pressable>
      </View>
    </View>
  );
}
