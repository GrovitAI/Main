import React from 'react';
import { View, Text, Pressable, FlatList, TextInput, ScrollView } from 'react-native';
import { 
  PackageSearch, 
  AlertTriangle, 
  Info, 
  Search,
  DollarSign,
  TrendingDown,
  Truck,
  Users
} from 'lucide-react-native';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';
import { colors } from '@/lib/pos/brand';

export type InventoryTab = 'dashboard' | 'stock' | 'alerts';

export interface InventoryMaterial {
  id: string;
  name: string;
  stockLevel: number;
  unit: string;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface InventoryAlert {
  id: string;
  type: 'low_stock' | 'expired';
  itemName: string;
  details: string;
}

export interface PhoneInventoryScreenProps {
  activeTab: InventoryTab;
  onTabChange: (tab: InventoryTab) => void;
  
  // Dashboard Props
  kpis: {
    totalValue: number;
    lowStockCount: number;
    pendingDispatches: number;
    activeSuppliers: number;
  };
  
  // Stock Props
  searchQuery: string;
  onSearchChange: (query: string) => void;
  materials: InventoryMaterial[];
  
  // Alerts Props
  alerts: InventoryAlert[];

  onMenuPress: () => void;
}

export function PhoneInventoryScreen({
  activeTab,
  onTabChange,
  kpis,
  searchQuery,
  onSearchChange,
  materials,
  alerts,
  onMenuPress,
}: PhoneInventoryScreenProps) {
  
  const renderDashboard = () => (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 16 }}>
      <View className="flex-row gap-4">
        <View className="flex-1 bg-white p-4 rounded-xl border border-[#c5d9eb]">
          <View className="flex-row items-center gap-2 mb-2">
            <DollarSign size={20} color={colors.primary} />
            <Text className="text-[#5b6b7c] font-medium">Total Value</Text>
          </View>
          <Text className="text-2xl font-bold text-[#0f2744]">
            ₹{kpis.totalValue.toFixed(2)}
          </Text>
        </View>
        
        <View className="flex-1 bg-white p-4 rounded-xl border border-[#c5d9eb]">
          <View className="flex-row items-center gap-2 mb-2">
            <TrendingDown size={20} color={colors.primary} />
            <Text className="text-[#5b6b7c] font-medium">Low Stock</Text>
          </View>
          <Text className="text-2xl font-bold text-[#0f2744]">
            {kpis.lowStockCount}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-4">
        <View className="flex-1 bg-white p-4 rounded-xl border border-[#c5d9eb]">
          <View className="flex-row items-center gap-2 mb-2">
            <Truck size={20} color={colors.primary} />
            <Text className="text-[#5b6b7c] font-medium">Dispatches</Text>
          </View>
          <Text className="text-2xl font-bold text-[#0f2744]">
            {kpis.pendingDispatches}
          </Text>
        </View>
        
        <View className="flex-1 bg-white p-4 rounded-xl border border-[#c5d9eb]">
          <View className="flex-row items-center gap-2 mb-2">
            <Users size={20} color={colors.primary} />
            <Text className="text-[#5b6b7c] font-medium">Suppliers</Text>
          </View>
          <Text className="text-2xl font-bold text-[#0f2744]">
            {kpis.activeSuppliers}
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  const getStatusStyle = (status: InventoryMaterial['status']) => {
    switch (status) {
      case 'in_stock':
        return { bg: 'bg-green-100', text: 'text-green-800', label: 'In Stock' };
      case 'low_stock':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Low Stock' };
      case 'out_of_stock':
        return { bg: 'bg-red-100', text: 'text-red-800', label: 'Out of Stock' };
      default:
        return { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Unknown' };
    }
  };

  const renderStock = () => (
    <View className="flex-1">
      <View className="p-4 border-b border-[#c5d9eb] bg-white">
        <View className="flex-row items-center bg-[#e8f2fa] px-3 py-2 rounded-lg">
          <Search size={20} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search materials..."
            placeholderTextColor={colors.textSecondary}
            className="flex-1 ml-2 text-[#0f2744] text-base"
          />
        </View>
      </View>
      
      <FlatList
        data={materials}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 12 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-8">
            <PackageSearch size={48} color={colors.textSecondary} opacity={0.5} />
            <Text className="text-[#5b6b7c] text-lg mt-4">No materials found</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusStyle = getStatusStyle(item.status);
          return (
            <View className="bg-white p-4 rounded-xl border border-[#c5d9eb] flex-row items-center justify-between">
              <View className="flex-1 mr-4">
                <Text className="text-lg font-semibold text-[#0f2744] mb-1">
                  {item.name}
                </Text>
                <Text className="text-[#5b6b7c]">
                  {item.stockLevel} {item.unit}
                </Text>
              </View>
              <View className={`px-3 py-1 rounded-full ${statusStyle.bg}`}>
                <Text className={`text-sm font-medium ${statusStyle.text}`}>
                  {statusStyle.label}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );

  const renderAlerts = () => (
    <FlatList
      data={alerts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 12 }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center py-8">
          <Info size={48} color={colors.textSecondary} opacity={0.5} />
          <Text className="text-[#5b6b7c] text-lg mt-4">No active alerts</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="bg-white p-4 rounded-xl border border-red-200 flex-row items-start gap-3">
          <AlertTriangle size={24} color="#ef4444" className="mt-1" />
          <View className="flex-1">
            <Text className="text-lg font-semibold text-[#0f2744] mb-1">
              {item.itemName}
            </Text>
            <Text className="text-[#5b6b7c]">{item.details}</Text>
          </View>
          <View className="bg-red-100 px-3 py-1 rounded-full">
            <Text className="text-xs font-bold text-red-800 uppercase tracking-wider">
              {item.type.replace('_', ' ')}
            </Text>
          </View>
        </View>
      )}
    />
  );

  return (
    <View className="flex-1 bg-white">
      <PhoneScreenHeader 
        title="Inventory" 
        onMenuPress={onMenuPress} 
      />

      {/* Read-only Banner */}
      <View className="bg-[#e8f2fa] p-3 flex-row items-start gap-2 border-b border-[#c5d9eb]">
        <Info size={20} color={colors.primary} className="mt-0.5" />
        <Text className="flex-1 text-[#0f2744] text-sm leading-5">
          For full inventory management (purchases, wastage, transfers), please use tablet or desktop.
        </Text>
      </View>

      {/* 3-Tab Pill Selector */}
      <View className="flex-row p-4 gap-2 bg-white border-b border-[#c5d9eb]">
        {(['dashboard', 'stock', 'alerts'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => onTabChange(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              aria-selected={isActive}
              className={`flex-1 py-2 rounded-full items-center justify-center min-h-[44px] ${
                isActive ? 'bg-[#0066b2]' : 'bg-[#e8f2fa]'
              }`}
            >
              <Text
                className={`text-sm font-semibold capitalize ${
                  isActive ? 'text-white' : 'text-[#0f2744]'
                }`}
              >
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-1 bg-slate-50">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'stock' && renderStock()}
        {activeTab === 'alerts' && renderAlerts()}
      </View>
    </View>
  );
}
