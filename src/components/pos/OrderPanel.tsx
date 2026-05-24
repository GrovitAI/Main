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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 30, padding: 24, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 30, elevation: 5 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>{orderTitle}</Text>
        <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B7280' }}>{items.length} items</Text>
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
          style={{ flex: 1, marginTop: 8 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <Text style={{ textAlign: 'center', fontSize: 14, color: '#9CA3AF' }}>
                Add items to this order
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', paddingVertical: 14, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F9FAFB' }}>
              <View style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: '#F5F8FC', marginRight: 14 }} />
              
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#0B5FB3', marginTop: 4 }}>
                  {formatCurrency(item.qty * item.price)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 16, backgroundColor: '#F4F8FD', paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => onDecrementItem(item.id)}
                  style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}
                >
                  <Minus color="#4B5563" size={16} />
                </Pressable>
                <Text style={{ width: 30, textAlign: 'center', fontSize: 15, fontWeight: '600', color: '#111827' }}>
                  {item.qty}
                </Text>
                <Pressable
                  onPress={() => onIncrementItem(item.id)}
                  style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}
                >
                  <Plus color="#4B5563" size={16} />
                </Pressable>
              </View>

              <Pressable
                onPress={() => onRemoveItem(item.id)}
                style={{ marginLeft: 12, padding: 4 }}
              >
                <Trash2 color="#EF4444" size={18} opacity={0.6} />
              </Pressable>
            </View>
          )}
        />
      )}

      {/* Totals + CTAs */}
      <View style={{ marginTop: 22, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 14, color: '#6B7280' }}>Subtotal</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
            {formatCurrency(subtotal)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 14, color: '#6B7280' }}>Tax (5%)</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>
            {formatCurrency(tax)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Total</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: -1, color: '#111827' }}>
            {formatCurrency(total)}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={ctaDisabled}
          onPress={onSettle}
          style={({ pressed }) => [
            { marginTop: 18, shadowColor: '#0B5FB3', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.25, shadowRadius: 28, elevation: 6 },
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
          ]}
        >
          <LinearGradient
            colors={['#0D6CE0', '#0B58B2']}
            style={{ height: 60, width: '100%', borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }}>Pay {formatCurrency(total)}</Text>
          </LinearGradient>
        </Pressable>
        
        <Pressable
          accessibilityRole="button"
          disabled={ctaDisabled}
          onPress={onSendKot}
          style={{ marginTop: 16, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#6B7280' }}>Send KOT</Text>
        </Pressable>
      </View>
    </View>
  );
}
