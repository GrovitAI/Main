import React from 'react';
import { View, Text, Pressable, FlatList, Modal, TextInput, ScrollView, SafeAreaView } from 'react-native';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';
import { colors } from '@/lib/pos/brand';
import { 
  Search, 
  ChevronLeft, 
  FileText, 
  Printer, 
  CheckCircle, 
  CreditCard, 
  ChevronRight, 
  Edit
} from 'lucide-react-native';

export type OrderStatus = 'Unpaid' | 'Draft' | 'Held' | 'Paid' | 'Cancelled' | 'All';
export type DatePreset = 'Today' | 'Yesterday' | '7 Days' | '30 Days' | 'Custom';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  billIdentifier: string;
  status: OrderStatus;
  timestamp: string;
  customerName?: string;
  total: number;
  items: OrderItem[];
  paymentMethod?: string;
}

export interface OrderSummaryKPIs {
  grossSales: number;
  discounts: number;
  netSales: number;
  totalOrders: number;
}

export interface PhoneOrdersScreenProps {
  onMenuPress: () => void;
  activeTab: 'Active' | 'History';
  onTabChange: (tab: 'Active' | 'History') => void;
  
  // Active Orders state
  activeOrdersFilter: OrderStatus;
  onActiveOrdersFilterChange: (status: OrderStatus) => void;
  activeOrdersCounts: Record<OrderStatus, number>;
  activeOrdersSearchQuery: string;
  onActiveOrdersSearchChange: (query: string) => void;
  activeOrders: Order[];
  
  // History state
  historyDatePreset: DatePreset;
  onHistoryDatePresetChange: (preset: DatePreset) => void;
  historySearchQuery: string;
  onHistorySearchChange: (query: string) => void;
  historyKPIs: OrderSummaryKPIs;
  historyOrders: Order[];
  historyCurrentPage: number;
  historyTotalPages: number;
  onHistoryPageChange: (page: number) => void;

  // Detail Modal state
  selectedOrder: Order | null;
  onSelectOrder: (order: Order) => void;
  onCloseOrderDetail: () => void;
  
  // Detail Actions
  onOpenInPOS: (order: Order) => void;
  onSettle: (order: Order) => void;
  onEditBill: (order: Order) => void;
  onReprint: (order: Order) => void;
}

export const PhoneOrdersScreen: React.FC<PhoneOrdersScreenProps> = ({
  onMenuPress,
  activeTab,
  onTabChange,
  
  activeOrdersFilter,
  onActiveOrdersFilterChange,
  activeOrdersCounts,
  activeOrdersSearchQuery,
  onActiveOrdersSearchChange,
  activeOrders,
  
  historyDatePreset,
  onHistoryDatePresetChange,
  historySearchQuery,
  onHistorySearchChange,
  historyKPIs,
  historyOrders,
  historyCurrentPage,
  historyTotalPages,
  onHistoryPageChange,

  selectedOrder,
  onSelectOrder,
  onCloseOrderDetail,
  
  onOpenInPOS,
  onSettle,
  onEditBill,
  onReprint,
}) => {

  const renderTabs = () => (
    <View className="flex-row px-4 py-2 border-b border-[#c5d9eb]">
      <Pressable 
        onPress={() => onTabChange('Active')}
        className={`flex-1 h-11 justify-center items-center border-b-2 ${activeTab === 'Active' ? 'border-[#0066b2]' : 'border-transparent'}`}
      >
        <Text className={`font-semibold ${activeTab === 'Active' ? 'text-[#0066b2]' : 'text-[#5b6b7c]'}`}>Active Orders</Text>
      </Pressable>
      <Pressable 
        onPress={() => onTabChange('History')}
        className={`flex-1 h-11 justify-center items-center border-b-2 ${activeTab === 'History' ? 'border-[#0066b2]' : 'border-transparent'}`}
      >
        <Text className={`font-semibold ${activeTab === 'History' ? 'text-[#0066b2]' : 'text-[#5b6b7c]'}`}>Sales & History</Text>
      </Pressable>
    </View>
  );

  const renderActiveFilterChips = () => (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 py-3 flex-row space-x-2">
        {(['All', 'Unpaid', 'Draft', 'Held', 'Paid', 'Cancelled'] as OrderStatus[]).map((status) => {
          const isActive = activeOrdersFilter === status;
          return (
            <Pressable
              key={status}
              onPress={() => onActiveOrdersFilterChange(status)}
              className={`h-11 px-4 rounded-full justify-center items-center flex-row space-x-2 mr-2 ${isActive ? 'bg-[#0066b2]' : 'bg-[#e8f2fa]'}`}
            >
              <Text className={`font-semibold ${isActive ? 'text-white' : 'text-[#0f2744]'}`}>{status}</Text>
              <View className={`rounded-full px-2 py-0.5 ${isActive ? 'bg-white/20' : 'bg-white'}`}>
                <Text className={`text-xs font-bold ${isActive ? 'text-white' : 'text-[#5b6b7c]'}`}>{activeOrdersCounts[status] || 0}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderHistoryFilterChips = () => (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 py-3 flex-row space-x-2">
        {(['Today', 'Yesterday', '7 Days', '30 Days', 'Custom'] as DatePreset[]).map((preset) => {
          const isActive = historyDatePreset === preset;
          return (
            <Pressable
              key={preset}
              onPress={() => onHistoryDatePresetChange(preset)}
              className={`h-11 px-5 rounded-full justify-center items-center mr-2 ${isActive ? 'bg-[#0066b2]' : 'bg-[#e8f2fa]'}`}
            >
              <Text className={`font-semibold ${isActive ? 'text-white' : 'text-[#0f2744]'}`}>{preset}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderSearchBar = (value: string, onChange: (t: string) => void, placeholder: string) => (
    <View className="px-4 pb-3">
      <View className="flex-row items-center bg-[#e8f2fa] px-3 rounded-lg h-11">
        <Search color={colors.textSecondary || "#5b6b7c"} size={20} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          className="flex-1 ml-2 text-[#0f2744] h-11"
          placeholderTextColor={colors.textSecondary || "#5b6b7c"}
        />
      </View>
    </View>
  );

  const renderKPIs = () => (
    <View className="px-4 pb-4 flex-row flex-wrap justify-between">
      <View className="w-[48%] bg-white p-3 rounded-lg border border-[#c5d9eb] mb-3">
        <Text className="text-xs text-[#5b6b7c] mb-1">Gross Sales</Text>
        <Text className="text-lg font-bold text-[#0f2744]">${historyKPIs.grossSales.toFixed(2)}</Text>
      </View>
      <View className="w-[48%] bg-white p-3 rounded-lg border border-[#c5d9eb] mb-3">
        <Text className="text-xs text-[#5b6b7c] mb-1">Discounts</Text>
        <Text className="text-lg font-bold text-[#0f2744]">${historyKPIs.discounts.toFixed(2)}</Text>
      </View>
      <View className="w-[48%] bg-[#0066b2] p-3 rounded-lg mb-3">
        <Text className="text-xs text-white/80 mb-1">Net Sales</Text>
        <Text className="text-lg font-bold text-white">${historyKPIs.netSales.toFixed(2)}</Text>
      </View>
      <View className="w-[48%] bg-[#e8f2fa] p-3 rounded-lg mb-3 border border-[#c5d9eb]">
        <Text className="text-xs text-[#5b6b7c] mb-1">Total Orders</Text>
        <Text className="text-lg font-bold text-[#0f2744]">{historyKPIs.totalOrders}</Text>
      </View>
    </View>
  );

  const renderOrderCard = ({ item: order }: { item: Order }) => (
    <Pressable
      onPress={() => onSelectOrder(order)}
      className="bg-white mx-4 mb-3 p-4 rounded-xl border border-[#c5d9eb]"
    >
      <View className="flex-row justify-between items-center mb-2">
        <Text className="font-bold text-lg text-[#0f2744]">{order.billIdentifier}</Text>
        <View className="bg-[#e8f2fa] px-2 py-1 rounded">
          <Text className="text-xs font-semibold text-[#0066b2]">{order.status}</Text>
        </View>
      </View>
      <View className="flex-row justify-between items-center">
        <View>
          <Text className="text-[#5b6b7c] text-sm">{order.timestamp}</Text>
          {order.customerName && <Text className="text-[#5b6b7c] text-sm mt-1">{order.customerName}</Text>}
        </View>
        <Text className="font-bold text-lg text-[#0f2744]">${order.total.toFixed(2)}</Text>
      </View>
    </Pressable>
  );

  const renderPagination = () => (
    <View className="flex-row justify-between items-center p-4 border-t border-[#c5d9eb] bg-white">
      <Pressable 
        onPress={() => onHistoryPageChange(Math.max(1, historyCurrentPage - 1))}
        disabled={historyCurrentPage === 1}
        className={`h-11 px-4 rounded justify-center items-center flex-row ${historyCurrentPage === 1 ? 'opacity-50' : ''}`}
      >
        <ChevronLeft color={colors.primary || "#0066b2"} size={20} />
        <Text className="text-[#0066b2] font-semibold ml-1">Prev</Text>
      </Pressable>
      <Text className="text-[#5b6b7c] font-medium">Page {historyCurrentPage} of {historyTotalPages}</Text>
      <Pressable 
        onPress={() => onHistoryPageChange(Math.min(historyTotalPages, historyCurrentPage + 1))}
        disabled={historyCurrentPage === historyTotalPages}
        className={`h-11 px-4 rounded justify-center items-center flex-row ${historyCurrentPage === historyTotalPages ? 'opacity-50' : ''}`}
      >
        <Text className="text-[#0066b2] font-semibold mr-1">Next</Text>
        <ChevronRight color={colors.primary || "#0066b2"} size={20} />
      </Pressable>
    </View>
  );

  const renderActiveOrders = () => (
    <FlatList
      data={activeOrders}
      keyExtractor={(item) => item.id}
      renderItem={renderOrderCard}
      contentContainerStyle={{ paddingBottom: 110 }}
      ListHeaderComponent={
        <>
          {renderActiveFilterChips()}
          {renderSearchBar(activeOrdersSearchQuery, onActiveOrdersSearchChange, 'Search orders...')}
        </>
      }
      ListEmptyComponent={
        <View className="flex-1 justify-center items-center py-10">
          <FileText color="#c5d9eb" size={48} />
          <Text className="text-[#5b6b7c] mt-4 font-medium">No active orders found</Text>
        </View>
      }
    />
  );

  const renderHistoryOrders = () => (
    <View className="flex-1">
      <FlatList
        data={historyOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderCard}
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <>
            {renderHistoryFilterChips()}
            {renderSearchBar(historySearchQuery, onHistorySearchChange, 'Search history...')}
            {renderKPIs()}
          </>
        }
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center py-10">
            <FileText color="#c5d9eb" size={48} />
            <Text className="text-[#5b6b7c] mt-4 font-medium">No history found</Text>
          </View>
        }
      />
      {historyOrders.length > 0 && renderPagination()}
    </View>
  );

  return (
    <View className="flex-1 bg-[#ffffff]">
      <PhoneScreenHeader title="Orders" onMenuPress={onMenuPress} />
      
      {renderTabs()}
      
      <View className="flex-1 bg-[#ffffff]">
        {activeTab === 'Active' ? renderActiveOrders() : renderHistoryOrders()}
      </View>

      <Modal
        visible={!!selectedOrder}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onCloseOrderDetail}
      >
        {selectedOrder && (
          <View className="flex-1 bg-white">
            <View className="flex-row items-center justify-between p-4 border-b border-[#c5d9eb]">
              <Pressable onPress={onCloseOrderDetail} className="h-11 w-11 justify-center items-center rounded-full bg-[#e8f2fa]">
                <ChevronLeft color="#0f2744" size={24} />
              </Pressable>
              <View className="items-center">
                <Text className="font-bold text-lg text-[#0f2744]">{selectedOrder.billIdentifier}</Text>
                <Text className="text-xs text-[#5b6b7c]">{selectedOrder.timestamp}</Text>
              </View>
              <View className="bg-[#e8f2fa] px-3 py-1.5 rounded-full">
                <Text className="text-xs font-semibold text-[#0066b2]">{selectedOrder.status}</Text>
              </View>
            </View>

            <ScrollView className="flex-1 px-4 py-2">
              {selectedOrder.customerName && (
                <View className="py-3 border-b border-[#c5d9eb]">
                  <Text className="text-xs text-[#5b6b7c]">Customer</Text>
                  <Text className="text-[#0f2744] font-medium">{selectedOrder.customerName}</Text>
                </View>
              )}

              <View className="py-4">
                <Text className="font-bold text-[#0f2744] mb-3">Order Items</Text>
                {selectedOrder.items.map((item) => (
                  <View key={item.id} className="flex-row justify-between mb-3">
                    <View className="flex-row flex-1 mr-2">
                      <Text className="text-[#5b6b7c] w-8">{item.quantity}x</Text>
                      <Text className="text-[#0f2744] flex-1">{item.name}</Text>
                    </View>
                    <Text className="font-medium text-[#0f2744]">₹{item.total.toFixed(2)}</Text>
                  </View>
                ))}
              </View>

              <View className="py-4 border-t border-[#c5d9eb]">
                {selectedOrder.paymentMethod && (
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-[#5b6b7c]">Payment Method</Text>
                    <Text className="text-[#0f2744] font-medium">{selectedOrder.paymentMethod}</Text>
                  </View>
                )}
                <View className="flex-row justify-between items-center mt-2">
                  <Text className="font-bold text-lg text-[#0f2744]">Total</Text>
                  <Text className="font-bold text-2xl text-[#0066b2]">₹{selectedOrder.total.toFixed(2)}</Text>
                </View>
              </View>
            </ScrollView>

            <View className="p-4 border-t border-[#c5d9eb] bg-white flex-row flex-wrap justify-between">
              <Pressable 
                onPress={() => onOpenInPOS(selectedOrder)}
                className="w-[48%] h-12 bg-[#e8f2fa] rounded-lg justify-center items-center mb-3 flex-row"
              >
                <CheckCircle color="#0066b2" size={18} className="mr-2" />
                <Text className="text-[#0066b2] font-semibold">Open in POS</Text>
              </Pressable>
              
              <Pressable 
                onPress={() => onEditBill(selectedOrder)}
                className="w-[48%] h-12 bg-[#e8f2fa] rounded-lg justify-center items-center mb-3 flex-row"
              >
                <Edit color="#0066b2" size={18} className="mr-2" />
                <Text className="text-[#0066b2] font-semibold">Edit Bill</Text>
              </Pressable>

              <Pressable 
                onPress={() => onReprint(selectedOrder)}
                className="w-[48%] h-12 border border-[#c5d9eb] rounded-lg justify-center items-center flex-row"
              >
                <Printer color="#0f2744" size={18} className="mr-2" />
                <Text className="text-[#0f2744] font-semibold">Reprint</Text>
              </Pressable>
              
              <Pressable 
                onPress={() => onSettle(selectedOrder)}
                className="w-[48%] h-12 bg-[#0066b2] rounded-lg justify-center items-center flex-row"
              >
                <CreditCard color="#ffffff" size={18} className="mr-2" />
                <Text className="text-white font-semibold">Settle</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
};
