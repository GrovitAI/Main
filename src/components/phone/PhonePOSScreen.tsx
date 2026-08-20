import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, FlatList, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, ShoppingCart, ChevronRight, Trash2, Minus, Plus } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';
import type { Category, Product } from '@/lib/pos/products-service';

type CartItem = {
  id: string;
  product_id: string;
  product_name: string;
  price: number;
  qty: number;
  kot_sent: boolean;
};

type HeldOrder = {
  id: string;
  order_name: string;
  status: string;
  created_at: string;
};

export type PhonePOSScreenProps = {
  // Product browsing
  categories: Category[];
  products: Product[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddProduct: (product: Product) => void;
  catalogLoading: boolean;
  catalogError: string | null;
  onRetryCatalog: () => void;

  // Cart state
  cartItems: CartItem[];
  orderName: string;
  orderStatus: string;
  orderIndex: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  isLoading: boolean;
  isMutating: boolean;
  isEditingUnpaid: boolean;
  hasUnsavedChanges: boolean;
  isReadOnlyView: boolean;

  // Cart item actions
  onIncrementItem: (itemId: string) => void;
  onDecrementItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;

  // Order actions
  onSaveKot: () => void;
  onSaveAndPrint: () => void;
  onSettle: () => void;
  onHoldOrder: () => void;
  onReset: () => void;
  onNewOrder: () => void;
  onEditBill: () => void;
  onDiscardChanges: () => void;
  onStartNewOrder: () => void;
  onCancel: () => void;
  onReprint: () => void;

  // Held orders
  heldOrders: HeldOrder[];
  onResumeOrder: (orderId: string) => void;
  itemCountByOrderId: Record<string, number>;
};

export function PhonePOSScreen(props: PhonePOSScreenProps) {
  const [showCart, setShowCart] = useState(false);
  const insets = useSafeAreaInsets();

  const renderProduct = ({ item }: { item: Product }) => (
    <Pressable
      onPress={() => props.onAddProduct(item)}
      className="bg-white rounded-xl border border-[#c5d9eb] p-3 flex-1 mx-1 my-1 shadow-sm"
      style={{ minHeight: 80 }}
    >
      <Text className="text-[13px] font-bold text-[#0f2744] mb-1" numberOfLines={2}>
        {item.name}
      </Text>
      <Text className="text-[12px] font-bold" style={{ color: colors.primary }}>
        ₹{item.price.toFixed(2)}
      </Text>
    </Pressable>
  );

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View className="bg-white px-4 py-3 border-b border-[#e8f2fa]">
      <View className="flex-row justify-between mb-2">
        <View className="flex-row items-center flex-1 pr-2">
          <Text className="text-[13px] font-bold text-[#0f2744]">{item.product_name}</Text>
          {item.kot_sent && (
            <View className="bg-[#e8f2fa] px-2 py-0.5 rounded ml-2">
              <Text className="text-[10px] text-[#0066b2] font-bold">Sent</Text>
            </View>
          )}
        </View>
        <Text className="text-[13px] text-[#0f2744]">₹{(item.price * item.qty).toFixed(2)}</Text>
      </View>
      <View className="flex-row justify-between items-center h-11">
        <View className="flex-row items-center bg-[#f8fafc] rounded-lg border border-[#c5d9eb]">
          <Pressable
            onPress={() => props.onDecrementItem(item.id)}
            className="w-10 h-10 items-center justify-center"
          >
            <Minus size={16} color="#5b6b7c" />
          </Pressable>
          <Text className="text-sm font-bold text-[#0f2744] w-6 text-center">{item.qty}</Text>
          <Pressable
            onPress={() => props.onIncrementItem(item.id)}
            className="w-10 h-10 items-center justify-center"
          >
            <Plus size={16} color="#0066b2" />
          </Pressable>
        </View>
        <Pressable
          onPress={() => props.onRemoveItem(item.id)}
          className="w-11 h-11 items-center justify-center rounded-lg bg-red-50"
        >
          <Trash2 size={18} color="#ef4444" />
        </Pressable>
      </View>
    </View>
  );

  const renderActions = () => {
    if (props.isReadOnlyView) {
      return (
        <View className="flex-row gap-2">
          <Pressable
            onPress={props.onReprint}
            className="flex-1 h-11 items-center justify-center rounded-xl bg-white border border-[#c5d9eb]"
          >
            <Text className="text-sm font-bold text-[#0f2744]">Reprint</Text>
          </Pressable>
          <Pressable
            onPress={props.onStartNewOrder}
            className="flex-1 h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-sm font-bold text-white">Start New Order</Text>
          </Pressable>
        </View>
      );
    }

    if (props.isEditingUnpaid) {
      return (
        <View className="flex-row gap-2">
          <Pressable
            onPress={props.onDiscardChanges}
            className="flex-1 h-11 items-center justify-center rounded-xl bg-white border border-[#c5d9eb]"
          >
            <Text className="text-sm font-bold text-[#0f2744]">Discard</Text>
          </Pressable>
          <Pressable
            onPress={props.onSaveKot}
            className="flex-1 h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-sm font-bold text-white">Save KOT</Text>
          </Pressable>
        </View>
      );
    }

    if (props.orderStatus === 'draft') {
      return (
        <View className="flex-col gap-2">
          <View className="flex-row gap-2">
            <Pressable
              onPress={props.onHoldOrder}
              className="flex-1 h-11 items-center justify-center rounded-xl bg-white border border-[#c5d9eb]"
            >
              <Text className="text-sm font-bold text-[#0f2744]">Hold</Text>
            </Pressable>
            <Pressable
              onPress={props.onReset}
              className="flex-1 h-11 items-center justify-center rounded-xl bg-white border border-[#c5d9eb]"
            >
              <Text className="text-sm font-bold text-[#0f2744]">Reset</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={props.onSaveKot}
            className="w-full h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-sm font-bold text-white">Save KOT</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View className="flex-col gap-2">
        <View className="flex-row gap-2">
          <Pressable
            onPress={props.onCancel}
            className="flex-1 h-11 items-center justify-center rounded-xl bg-red-50 border border-red-200"
          >
            <Text className="text-sm font-bold text-red-600">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={props.onSaveAndPrint}
            className="flex-1 h-11 items-center justify-center rounded-xl bg-white border border-[#c5d9eb]"
          >
            <Text className="text-sm font-bold text-[#0f2744]">Print</Text>
          </Pressable>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={props.onSaveKot}
            className="flex-1 h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.primaryDeep }}
          >
            <Text className="text-sm font-bold text-white">Save KOT</Text>
          </Pressable>
          <Pressable
            onPress={props.onSettle}
            className="flex-1 h-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-sm font-bold text-white">Settle ₹{props.totalAmount.toFixed(2)}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const totalItems = props.cartItems.reduce((acc, item) => acc + item.qty, 0);

  if (showCart) {
    return (
      <View className="flex-1 bg-white" style={{ paddingBottom: insets.bottom }}>
        {/* Header */}
        <PhoneScreenHeader
          title="Current Cart"
          subtitle={`${totalItems} item${totalItems === 1 ? '' : 's'} · ${props.orderName}`}
          onBack={() => setShowCart(false)}
        />

        {/* Cart Items */}
        <FlatList
          data={props.cartItems}
          keyExtractor={(item) => item.id}
          renderItem={renderCartItem}
          className="flex-1 bg-[#f8fafc]"
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-10">
              <ShoppingCart size={48} color="#c5d9eb" />
              <Text className="text-[#5b6b7c] mt-4 font-medium">Cart is empty</Text>
            </View>
          }
        />

        {/* Totals & Actions Footer */}
        <View className="bg-white border-t border-[#c5d9eb] px-4 py-4 shadow-lg" style={{ paddingBottom: insets.bottom + 90 }}>
          <View className="flex-row justify-between mb-1">
            <Text className="text-sm text-[#5b6b7c]">Subtotal</Text>
            <Text className="text-sm font-medium text-[#0f2744]">₹{props.subtotal.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between mb-3 pb-3 border-b border-[#e8f2fa]">
            <Text className="text-sm text-[#5b6b7c]">Tax (5%)</Text>
            <Text className="text-sm font-medium text-[#0f2744]">₹{props.taxAmount.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between mb-4">
            <Text className="text-base font-bold text-[#0f2744]">Total</Text>
            <Text className="text-lg font-bold" style={{ color: colors.primary }}>
              ₹{props.totalAmount.toFixed(2)}
            </Text>
          </View>

          {renderActions()}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      {/* Top Header */}
      <PhoneScreenHeader
        title="POS Billing"
        subtitle={props.orderName || 'New Order'}
      />

      {/* Search Bar */}
      <View className="px-3 py-2 border-b border-[#e8f2fa]">
        <View className="flex-row items-center bg-[#f8fafc] rounded-xl px-3 h-12 border border-[#c5d9eb]">
          <Search size={20} color="#5b6b7c" />
          <TextInput
            className="flex-1 ml-2 text-base text-[#0f2744]"
            placeholder="Search items..."
            placeholderTextColor="#5b6b7c"
            value={props.searchQuery}
            onChangeText={props.onSearchChange}
          />
        </View>
      </View>

      {/* Categories */}
      <View className="border-b border-[#e8f2fa]">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-2 py-2">
          <Pressable
            onPress={() => props.onSelectCategory(null)}
            className={`h-9 px-4 rounded-full items-center justify-center mr-2 border ${
              props.selectedCategoryId === null
                ? 'bg-[#0066b2] border-[#0066b2]'
                : 'bg-white border-[#c5d9eb]'
            }`}
          >
            <Text className={`text-sm font-medium ${props.selectedCategoryId === null ? 'text-white' : 'text-[#5b6b7c]'}`}>
              All
            </Text>
          </Pressable>
          {props.categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => props.onSelectCategory(cat.id)}
              className={`h-9 px-4 rounded-full items-center justify-center mr-2 border ${
                props.selectedCategoryId === cat.id
                  ? 'bg-[#0066b2] border-[#0066b2]'
                  : 'bg-white border-[#c5d9eb]'
              }`}
            >
              <Text className={`text-sm font-medium ${props.selectedCategoryId === cat.id ? 'text-white' : 'text-[#5b6b7c]'}`}>
                {cat.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Product Grid */}
      {props.catalogLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : props.catalogError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-[#ef4444] text-center mb-4">{props.catalogError}</Text>
          <Pressable
            onPress={props.onRetryCatalog}
            className="h-11 px-6 bg-[#0066b2] rounded-xl items-center justify-center"
          >
            <Text className="text-white font-bold">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={props.products}
          keyExtractor={(item) => item.id}
          renderItem={renderProduct}
          numColumns={2}
          contentContainerStyle={{ padding: 8, paddingBottom: 140 }} // Extra padding for cart bar + tab bar
          className="flex-1 bg-[#f8fafc]"
        />
      )}

      {/* Floating Cart Bar */}
      <View 
        className="absolute left-0 right-0 px-4"
        style={{ bottom: insets.bottom + 84 }}
      >
        <Pressable
          onPress={() => setShowCart(true)}
          className="flex-row items-center h-14 rounded-2xl px-4 shadow-lg flex-1"
          style={{ backgroundColor: colors.primary }}
        >
          <View className="flex-row items-center flex-1">
            <ShoppingCart size={24} color="white" />
            <View className="ml-3">
              {totalItems > 0 ? (
                <>
                  <Text className="text-white font-bold">{totalItems} items</Text>
                  <Text className="text-white/80 text-xs">₹{props.totalAmount.toFixed(2)}</Text>
                </>
              ) : (
                <Text className="text-white font-medium">Start adding items</Text>
              )}
            </View>
          </View>
          {totalItems > 0 && (
            <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center">
              <ChevronRight size={20} color="white" />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}
