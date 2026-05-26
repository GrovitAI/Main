import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { OpenOrder } from '@/lib/pos/order-types';
import { formatOrderLabel } from '@/lib/pos/order-utils';

type OpenOrdersStripProps = {
  orders: OpenOrder[];
  activeOrderId: string | null;
  itemCountByOrderId: Record<string, number>;
  isLoading: boolean;
  onSelectOrder: (orderId: string) => void;
  onCreateOrder: () => void;
};

type OrderChip = {
  id: string;
  label: string;
  itemCount: number;
};

function CreateOrderButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create new order"
      onPress={onPress}
      style={{ height: 46, minWidth: 80, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#0C63C7', backgroundColor: '#FFFFFF', paddingHorizontal: 10 }}
    >
      <Plus color="#0C63C7" size={14} strokeWidth={2.5} />
      <Text style={{ marginTop: 1, fontSize: 10, fontWeight: '600', color: '#0C63C7' }}>New Order</Text>
    </Pressable>
  );
}

export function OpenOrdersStrip({
  orders,
  activeOrderId,
  itemCountByOrderId,
  isLoading,
  onSelectOrder,
  onCreateOrder,
}: OpenOrdersStripProps) {
  const chips: OrderChip[] = orders.map((order, index) => ({
    id: order.id,
    label: (order.status === 'draft' || order.status === 'held' || order.status === 'payment_pending')
      ? (order.status === 'held' ? 'Held Order' : 'Current Cart')
      : formatOrderLabel(order.order_name, `Order #${index + 1}`),
    itemCount: itemCountByOrderId[order.id] ?? 0,
  }));

  if (isLoading && orders.length === 0) {
    return (
      <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <ActivityIndicator color="#0C63C7" size="small" />
      </View>
    );
  }

  return (
    <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ marginRight: 10, justifyContent: 'center' }}>
        <Text style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.6, color: '#6B7280' }}>
          Active Orders
        </Text>
      </View>

      <FlatList
        horizontal
        data={chips}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center' }}
        ListFooterComponent={<CreateOrderButton onPress={onCreateOrder} />}
        renderItem={({ item }) => {
          const isActive = item.id === activeOrderId;

          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectOrder(item.id)}
              style={{ marginRight: 6 }}
            >
              <View
                style={
                  isActive
                    ? { height: 46, minWidth: 110, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 12, overflow: 'hidden' }
                    : { height: 46, minWidth: 110, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 12, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 }
                }
              >
                {isActive && (
                  <LinearGradient
                    colors={['#0C63C7', '#094F9B']}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                )}
                <Text
                  style={
                    isActive
                      ? { fontSize: 12, fontWeight: '600', color: '#FFFFFF' }
                      : { fontSize: 12, fontWeight: '600', color: '#111827' }
                  }
                >
                  {item.label}
                </Text>
                <Text
                  style={
                    isActive
                      ? { marginTop: 0.5, fontSize: 9, fontWeight: '500', color: '#FFFFFF', opacity: 0.75 }
                      : { marginTop: 0.5, fontSize: 9, fontWeight: '500', color: '#6B7280', opacity: 0.75 }
                  }
                >
                  {item.itemCount} items
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
