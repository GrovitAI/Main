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
      style={{ height: 50, minWidth: 90, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#0C63C7', backgroundColor: '#FFFFFF', paddingHorizontal: 12 }}
    >
      <Plus color="#0C63C7" size={16} strokeWidth={2.5} />
      <Text style={{ marginTop: 2, fontSize: 11, fontWeight: '600', color: '#0C63C7' }}>New Order</Text>
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
    label: formatOrderLabel(order.order_name, `Order #${index + 1}`),
    itemCount: itemCountByOrderId[order.id] ?? 0,
  }));

  if (isLoading && orders.length === 0) {
    return (
      <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
        <ActivityIndicator color="#0C63C7" size="small" />
      </View>
    );
  }

  return (
    <View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ marginRight: 14, justifyContent: 'center' }}>
        <Text style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.8, color: '#6B7280' }}>
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
              style={{ marginRight: 8 }}
            >
              <View
                style={
                  isActive
                    ? { height: 50, minWidth: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 14, overflow: 'hidden' }
                    : { height: 50, minWidth: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 14, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 }
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
                      ? { fontSize: 13, fontWeight: '600', color: '#FFFFFF' }
                      : { fontSize: 13, fontWeight: '600', color: '#111827' }
                  }
                >
                  {item.label}
                </Text>
                <Text
                  style={
                    isActive
                      ? { marginTop: 1, fontSize: 10, fontWeight: '500', color: '#FFFFFF', opacity: 0.75 }
                      : { marginTop: 1, fontSize: 10, fontWeight: '500', color: '#6B7280', opacity: 0.75 }
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
