import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Receipt,
  X,
  CreditCard,
  Clock,
  Award,
  Sparkles,
  ChevronRight,
  Search,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Check,
} from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { PhoneScreenHeader } from '@/components/phone/PhoneScreenHeader';
import { DatePickerModal } from '@/components/ui/DatePickerModal';

export interface PhoneAnalyticsScreenProps {
  kpiData: {
    totalSales: number;
    totalOrders: number;
    avgOrderValue: number;
    itemsSold: number;
    totalTax: number;
    totalDiscounts?: number;
    collectedRevenue?: number;
    pendingCollections?: number;
    cancelledOrders: number;
    cancelledSales?: number;
    salesTrend?: number;
  };
  royaltyData?: {
    enabled: boolean;
    storeShare: number;
    royaltyShare: number;
  };
  chartsData: {
    salesTrend: { label: string; value: number; orders?: number }[];
    rushHours: { hour: string; sales: number }[];
    paymentSplits: { label: string; value: number; percentage?: number }[];
  };
  topProducts: { id: string; name: string; sold: number; revenue: number }[];
  itemSales: { id: string; name: string; quantity: number; revenue: number }[];
  filterState: {
    datePreset: string;
    selectedBranchId?: string;
  };
  branches: { id: string; name: string }[];
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  loading?: boolean;
  errorMsg?: string | null;
  onRetry?: () => void;
  isFilterSheetOpen: boolean;
  onOpenFilter: () => void;
  onCloseFilter: () => void;
  onSelectDatePreset: (preset: string) => void;
  onApplyCustomRange?: (start: string, end: string, startTime?: string, endTime?: string) => void;
  onSelectBranch: (branchId: string | null) => void;
  onExportCSV: () => void;
}

const PRESET_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7days', label: 'Last 7 Days' },
  { key: '30days', label: 'Last 30 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
];

export function PhoneAnalyticsScreen({
  kpiData,
  royaltyData,
  chartsData,
  topProducts,
  itemSales,
  filterState,
  branches,
  startDate = '',
  endDate = '',
  startTime = '11:30',
  endTime = '02:30',
  loading = false,
  errorMsg = null,
  onRetry,
  isFilterSheetOpen,
  onOpenFilter,
  onCloseFilter,
  onSelectDatePreset,
  onApplyCustomRange,
  onSelectBranch,
  onExportCSV,
}: PhoneAnalyticsScreenProps) {
  const [searchItemQuery, setSearchItemQuery] = useState('');
  const [isDatePickerModalOpen, setIsDatePickerModalOpen] = useState(false);

  const formatCurrency = (val?: number | null) => {
    const num = typeof val === 'number' && !isNaN(val) && isFinite(val) ? val : 0;
    return `₹${Math.round(num).toLocaleString('en-IN')}`;
  };

  const formatCurrencyDetailed = (val?: number | null) => {
    const num = typeof val === 'number' && !isNaN(val) && isFinite(val) ? val : 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Calculate chart metrics safely
  const salesTrendList = chartsData?.salesTrend || [];
  const rushHoursList = chartsData?.rushHours || [];
  const paymentSplitsList = chartsData?.paymentSplits || [];

  const maxSaleValue = Math.max(
    ...salesTrendList.map((s) => (typeof s?.value === 'number' && !isNaN(s.value) ? s.value : 0)),
    100
  );
  const maxRushValue = Math.max(
    ...rushHoursList.map((r) => (typeof r?.sales === 'number' && !isNaN(r.sales) ? r.sales : 0)),
    100
  );
  const totalPaymentSum =
    paymentSplitsList.reduce(
      (acc, p) => acc + (typeof p?.value === 'number' && !isNaN(p.value) ? p.value : 0),
      0
    ) || 1;

  // Filter items safely
  const filteredItems = (itemSales || []).filter((item) =>
    (item?.name || '').toLowerCase().includes((searchItemQuery || '').toLowerCase())
  );

  const selectedBranchName = filterState?.selectedBranchId
    ? (branches || []).find((b) => b?.id === filterState.selectedBranchId)?.name || 'Branch'
    : 'All Branches';

  const currentPresetKey = (filterState?.datePreset || '7days').toLowerCase();

  const handlePresetClick = (presetKey: string) => {
    if (presetKey === 'custom') {
      setIsDatePickerModalOpen(true);
    } else {
      onSelectDatePreset(presetKey);
    }
  };

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Top Header */}
      <PhoneScreenHeader
        title="Analytics"
        subtitle={`${selectedBranchName} · ${(filterState?.datePreset || '7days').toUpperCase()}`}
        rightContent={
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onExportCSV}
              className="w-10 h-10 items-center justify-center rounded-xl bg-white border border-[#E2E8F0] shadow-sm"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Download size={18} color="#0066B2" />
            </Pressable>
            <Pressable
              testID="analytics-filter-btn"
              onPress={onOpenFilter}
              className="w-10 h-10 items-center justify-center rounded-xl bg-[#0066B2] shadow-sm"
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <Filter size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        }
      />

      {/* Date Preset Filter Bar */}
      <View className="bg-white border-b border-[#E2E8F0] py-2.5 px-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
        >
          {PRESET_OPTIONS.map((opt) => {
            const isActive = currentPresetKey === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => handlePresetClick(opt.key)}
                className="px-4 py-2 rounded-full mr-2 min-h-[38px] items-center justify-center border"
                style={({ pressed }) => [
                  {
                    backgroundColor: isActive ? '#002D5A' : '#F1F5F9',
                    borderColor: isActive ? '#002D5A' : '#E2E8F0',
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Text
                  className="text-xs font-bold"
                  style={{ color: isActive ? '#FFFFFF' : '#475569' }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ERROR BANNER */}
        {errorMsg && (
          <View className="bg-rose-50 border border-rose-200 p-4 rounded-2xl mb-4 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-bold text-rose-800">Unable to load report</Text>
              <Text className="text-[11px] text-rose-600 mt-0.5">{errorMsg}</Text>
            </View>
            {onRetry && (
              <Pressable
                onPress={onRetry}
                className="bg-rose-600 px-3.5 py-1.5 rounded-xl"
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              >
                <Text className="text-xs font-bold text-white">Retry</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* LOADING INDICATOR */}
        {loading && (
          <View className="py-4 items-center justify-center flex-row gap-2 mb-2">
            <ActivityIndicator size="small" color="#0066B2" />
            <Text className="text-xs font-semibold text-[#0066B2]">Updating analytics report...</Text>
          </View>
        )}

        {/* HERO REVENUE CARD */}
        <View
          className="rounded-3xl p-5 mb-5 shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#002D5A',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Subtle Glow Overlay */}
          <View
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 140,
              height: 140,
              borderRadius: 70,
              backgroundColor: 'rgba(0, 102, 178, 0.4)',
            }}
          />

          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-white/80 text-xs font-bold tracking-wider uppercase">
              Total Net Revenue
            </Text>
            <View className="flex-row items-center bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-400/30">
              <TrendingUp size={12} color="#34D399" />
              <Text className="text-emerald-300 text-[11px] font-bold ml-1">Live Verified</Text>
            </View>
          </View>

          <Text className="text-white text-3xl font-extrabold tracking-tight mb-4">
            {formatCurrencyDetailed(kpiData.totalSales)}
          </Text>

          <View className="flex-row items-center justify-between pt-3.5 border-t border-white/10">
            <View>
              <Text className="text-white/60 text-[11px]">Tax Collected</Text>
              <Text className="text-white font-bold text-sm mt-0.5">
                {formatCurrency(kpiData.totalTax)}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-white/60 text-[11px]">Discounts</Text>
              <Text className="text-amber-300 font-bold text-sm mt-0.5">
                {formatCurrency(kpiData.totalDiscounts || 0)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-white/60 text-[11px]">Avg Per Order</Text>
              <Text className="text-white font-bold text-sm mt-0.5">
                {formatCurrency(kpiData.avgOrderValue)}
              </Text>
            </View>
          </View>
        </View>

        {/* PRIMARY 4-KPI GRID */}
        <View className="flex-row flex-wrap justify-between gap-y-3 mb-5">
          {/* Total Orders */}
          <View className="w-[48.5%] bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
            <View className="w-9 h-9 rounded-xl bg-blue-50 items-center justify-center mb-3">
              <Receipt size={18} color="#0066B2" />
            </View>
            <Text className="text-[#64748B] text-xs font-semibold">Total Orders</Text>
            <Text className="text-[#0F2744] text-2xl font-bold mt-1">
              {kpiData.totalOrders}
            </Text>
          </View>

          {/* Items Sold */}
          <View className="w-[48.5%] bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
            <View className="w-9 h-9 rounded-xl bg-emerald-50 items-center justify-center mb-3">
              <ShoppingBag size={18} color="#059669" />
            </View>
            <Text className="text-[#64748B] text-xs font-semibold">Items Dispatched</Text>
            <Text className="text-[#0F2744] text-2xl font-bold mt-1">
              {kpiData.itemsSold}
            </Text>
          </View>

          {/* Collected Revenue */}
          <View className="w-[48.5%] bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
            <View className="w-9 h-9 rounded-xl bg-purple-50 items-center justify-center mb-3">
              <CreditCard size={18} color="#7C3AED" />
            </View>
            <Text className="text-[#64748B] text-xs font-semibold">Collected</Text>
            <Text className="text-[#0F2744] text-xl font-bold mt-1">
              {formatCurrency(kpiData.collectedRevenue || kpiData.totalSales)}
            </Text>
          </View>

          {/* Pending Collections */}
          <View className="w-[48.5%] bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm">
            <View className="w-9 h-9 rounded-xl bg-amber-50 items-center justify-center mb-3">
              <Clock size={18} color="#D97706" />
            </View>
            <Text className="text-[#64748B] text-xs font-semibold">Pending Drafts</Text>
            <Text className="text-[#0F2744] text-xl font-bold mt-1">
              {formatCurrency(kpiData.pendingCollections || 0)}
            </Text>
          </View>
        </View>

        {/* FRANCHISE ROYALTY CARD (IF ENABLED) */}
        {royaltyData?.enabled && (
          <View className="bg-white p-4 rounded-2xl border border-[#C5D9EB] mb-5 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <ShieldCheck size={18} color="#0066B2" />
                <Text className="text-sm font-bold text-[#0F2744]">
                  Franchise Royalty Split
                </Text>
              </View>
              <Text className="text-xs font-bold text-[#0066B2]">
                {typeof royaltyData?.royaltyShare === 'number' && !isNaN(royaltyData.royaltyShare)
                  ? royaltyData.royaltyShare
                  : 5}
                % Rate
              </Text>
            </View>

            {(() => {
              const rawStore = royaltyData?.storeShare;
              const rawRoyalty = royaltyData?.royaltyShare;
              const safeStore = typeof rawStore === 'number' && !isNaN(rawStore) ? Math.max(0, Math.min(100, rawStore)) : 95;
              const safeRoyalty = typeof rawRoyalty === 'number' && !isNaN(rawRoyalty) ? Math.max(0, Math.min(100, rawRoyalty)) : 5;
              return (
                <>
                  <View className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex-row mb-3">
                    <View
                      style={{ width: `${safeStore}%` }}
                      className="bg-[#0066B2] h-full"
                    />
                    <View
                      style={{ width: `${safeRoyalty}%` }}
                      className="bg-amber-500 h-full"
                    />
                  </View>

                  <View className="flex-row justify-between">
                    <View>
                      <Text className="text-[11px] text-[#64748B]">Branch Share</Text>
                      <Text className="text-base font-bold text-[#0F2744]">
                        {formatCurrency((kpiData.totalSales * safeStore) / 100)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[11px] text-[#64748B]">HQ Royalty</Text>
                      <Text className="text-base font-bold text-amber-600">
                        {formatCurrency((kpiData.totalSales * safeRoyalty) / 100)}
                      </Text>
                    </View>
                  </View>
                </>
              );
            })()}
          </View>
        )}

        {/* SALES TRAJECTORY BAR CHART */}
        <View className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm mb-5">
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-base font-bold text-[#0F2744]">
                Sales Trajectory
              </Text>
              <Text className="text-xs text-[#64748B]">Daily revenue distribution</Text>
            </View>
            <View className="bg-blue-50 px-2.5 py-1 rounded-lg">
              <Text className="text-xs font-bold text-[#0066B2]">
                {salesTrendList.length} Days
              </Text>
            </View>
          </View>

          {salesTrendList.length > 0 ? (
            <View className="pt-2">
              <View className="flex-row items-end justify-between h-36 pt-2 pb-1 border-b border-[#E2E8F0]">
                {salesTrendList.map((item, idx) => {
                  const val = typeof item?.value === 'number' && !isNaN(item.value) ? item.value : 0;
                  const calcHeight = maxSaleValue > 0 ? (val / maxSaleValue) * 100 : 0;
                  const heightPercent =
                    isNaN(calcHeight) || !isFinite(calcHeight)
                      ? 12
                      : Math.min(100, Math.max(12, calcHeight));
                  const isTopDay = val === maxSaleValue && val > 0;
                  return (
                    <View key={idx} className="items-center flex-1 mx-0.5">
                      <Text className="text-[9px] text-[#64748B] font-medium mb-1">
                        {val > 0 ? `₹${Math.round(val / 1000)}k` : ''}
                      </Text>
                      <View
                        style={{
                          height: `${heightPercent}%`,
                          backgroundColor: isTopDay ? '#0066B2' : '#94A3B8',
                        }}
                        className="w-full max-w-[28px] rounded-t-md"
                      />
                    </View>
                  );
                })}
              </View>
              <View className="flex-row justify-between pt-2">
                {salesTrendList.map((item, idx) => (
                  <Text key={idx} className="text-[10px] text-[#64748B] font-medium flex-1 text-center">
                    {String(item?.label || '').slice(0, 3)}
                  </Text>
                ))}
              </View>
            </View>
          ) : (
            <View className="py-8 items-center justify-center">
              <Text className="text-sm text-[#94A3B8]">No sales records for selected range</Text>
            </View>
          )}
        </View>

        {/* PAYMENT METHOD BREAKDOWN */}
        <View className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm mb-5">
          <Text className="text-base font-bold text-[#0F2744] mb-1">
            Payment Methods
          </Text>
          <Text className="text-xs text-[#64748B] mb-4">Volume & transaction breakdown</Text>

          <View className="gap-3">
            {paymentSplitsList.map((item, idx) => {
              const val = typeof item?.value === 'number' && !isNaN(item.value) ? item.value : 0;
              const calcPct = totalPaymentSum > 0 ? (val / totalPaymentSum) * 100 : 0;
              const pct = isNaN(calcPct) || !isFinite(calcPct) ? 0 : Math.max(0, Math.min(100, Math.round(calcPct)));
              const label = String(item?.label || 'Other');
              const lowerLabel = label.toLowerCase();
              const isUpi = lowerLabel.includes('upi') || lowerLabel.includes('qr');
              const isCash = lowerLabel.includes('cash');
              const isCard = lowerLabel.includes('card');

              const barColor = isUpi ? '#7C3AED' : isCash ? '#059669' : isCard ? '#0066B2' : '#F59E0B';

              return (
                <View key={idx}>
                  <View className="flex-row justify-between items-center mb-1.5">
                    <Text className="text-xs font-bold text-[#0F2744] capitalize">
                      {label}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xs font-bold text-[#0F2744]">
                        {formatCurrency(val)}
                      </Text>
                      <Text className="text-xs text-[#64748B] w-9 text-right font-semibold">
                        {pct}%
                      </Text>
                    </View>
                  </View>
                  <View className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <View
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                      className="h-full rounded-full"
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* TOP SELLING PRODUCTS LEADERBOARD */}
        <View className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm mb-5">
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-base font-bold text-[#0F2744]">
                Top Selling Products
              </Text>
              <Text className="text-xs text-[#64748B]">Best performers by revenue</Text>
            </View>
            <Award size={20} color="#F59E0B" />
          </View>

          {(topProducts || []).length > 0 ? (
            <View className="gap-2.5">
              {(topProducts || []).slice(0, 5).map((prod, idx) => {
                const rankMedal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                return (
                  <View
                    key={prod?.id || idx}
                    className="flex-row items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]"
                  >
                    <View className="flex-row items-center flex-1 pr-3">
                      <Text className="text-base mr-3 w-6 text-center font-bold">
                        {rankMedal}
                      </Text>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-[#0F2744]" numberOfLines={1}>
                          {prod?.name || 'Dish'}
                        </Text>
                        <Text className="text-[11px] text-[#64748B]">
                          {prod?.sold || 0} orders sold
                        </Text>
                      </View>
                    </View>
                    <Text className="text-sm font-bold text-[#0066B2]">
                      {formatCurrency(prod?.revenue || 0)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="py-6 items-center justify-center">
              <Text className="text-sm text-[#94A3B8]">No product sales recorded yet</Text>
            </View>
          )}
        </View>

        {/* ITEM-WISE DETAILED REPORT */}
        <View className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm mb-5">
          <Text className="text-base font-bold text-[#0F2744] mb-1">
            Menu Item Intelligence
          </Text>
          <Text className="text-xs text-[#64748B] mb-3">
            All sold items ({filteredItems.length})
          </Text>

          {/* Search bar */}
          <View className="flex-row items-center bg-[#F1F5F9] rounded-xl px-3 h-11 border border-[#E2E8F0] mb-3">
            <Search size={16} color="#64748B" />
            <TextInput
              className="flex-1 ml-2 text-sm text-[#0F2744]"
              placeholder="Search sold items..."
              placeholderTextColor="#94A3B8"
              value={searchItemQuery}
              onChangeText={setSearchItemQuery}
            />
            {searchItemQuery ? (
              <Pressable onPress={() => setSearchItemQuery('')}>
                <X size={16} color="#64748B" />
              </Pressable>
            ) : null}
          </View>

          <View className="gap-2">
            {filteredItems.slice(0, 10).map((item, idx) => (
              <View
                key={idx}
                className="flex-row items-center justify-between py-2 border-b border-slate-100"
              >
                <View className="flex-1 pr-2">
                  <Text className="text-xs font-semibold text-[#0F2744]" numberOfLines={1}>
                    {item?.name || 'Dish'}
                  </Text>
                  <Text className="text-[10px] text-[#64748B]">
                    {item?.quantity || 0} units sold
                  </Text>
                </View>
                <Text className="text-xs font-bold text-[#0F2744]">
                  {formatCurrency(item?.revenue || 0)}
                </Text>
              </View>
            ))}
            {filteredItems.length === 0 && (
              <Text className="text-center text-xs text-[#94A3B8] py-4">
                No items match search query
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* FILTER BOTTOM SHEET MODAL */}
      {isFilterSheetOpen && (
        <Modal
          visible={isFilterSheetOpen}
          animationType="slide"
          transparent
          onRequestClose={onCloseFilter}
        >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl p-5 border-t border-[#E2E8F0] max-h-[80%]">
            <View className="flex-row items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
              <Text className="text-lg font-bold text-[#0F2744]">Filter Reports</Text>
              <Pressable
                testID="filter-modal-close-btn"
                onPress={onCloseFilter}
                className="w-9 h-9 items-center justify-center rounded-full bg-slate-100"
              >
                <X size={20} color="#0F2744" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Date Presets */}
              <Text className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2.5">
                Date Range
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-5">
                {PRESET_OPTIONS.map((opt) => {
                  const isSelected = currentPresetKey === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => {
                        onCloseFilter();
                        handlePresetClick(opt.key);
                      }}
                      className="px-4 py-2.5 rounded-xl border flex-row items-center"
                      style={({ pressed }) => [
                        {
                          backgroundColor: isSelected ? '#0066B2' : '#FFFFFF',
                          borderColor: isSelected ? '#0066B2' : '#CBD5E1',
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      {isSelected && (
                        <View style={{ marginRight: 6 }}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      )}
                      <Text
                        className="text-xs font-bold"
                        style={{ color: isSelected ? '#FFFFFF' : '#0F2744' }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Branch Selector (for Owners & Admins) */}
              {branches.length > 0 && (
                <>
                  <Text className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2.5">
                    Branch Location
                  </Text>
                  <View className="gap-2 mb-6">
                    <Pressable
                      onPress={() => {
                        onSelectBranch(null);
                        onCloseFilter();
                      }}
                      className="p-3 rounded-xl border flex-row items-center justify-between"
                      style={({ pressed }) => [
                        {
                          backgroundColor: !filterState.selectedBranchId ? '#EFF6FF' : '#FFFFFF',
                          borderColor: !filterState.selectedBranchId ? '#0066B2' : '#CBD5E1',
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <View className="flex-row items-center gap-2">
                        <Building2 size={16} color="#0066B2" />
                        <Text className="text-sm font-bold text-[#0F2744]">All Branches</Text>
                      </View>
                      {!filterState.selectedBranchId && <Check size={18} color="#0066B2" />}
                    </Pressable>

                    {branches.map((b) => {
                      const isSelected = filterState.selectedBranchId === b.id;
                      return (
                        <Pressable
                          key={b.id}
                          onPress={() => {
                            onSelectBranch(b.id);
                            onCloseFilter();
                          }}
                          className="p-3 rounded-xl border flex-row items-center justify-between"
                          style={({ pressed }) => [
                            {
                              backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                              borderColor: isSelected ? '#0066B2' : '#CBD5E1',
                              opacity: pressed ? 0.8 : 1,
                            },
                          ]}
                        >
                          <View className="flex-row items-center gap-2">
                            <Building2 size={16} color="#64748B" />
                            <Text className="text-sm font-bold text-[#0F2744]">{b.name}</Text>
                          </View>
                          {isSelected && <Check size={18} color="#0066B2" />}
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}

      {/* Interactive Custom Date Picker Modal for Phones */}
      <DatePickerModal
        visible={isDatePickerModalOpen}
        onClose={() => setIsDatePickerModalOpen(false)}
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        onApply={(start, end, startT, endT) => {
          setIsDatePickerModalOpen(false);
          if (onApplyCustomRange) {
            onApplyCustomRange(start, end, startT, endT);
          } else {
            onSelectDatePreset('custom');
          }
        }}
      />
    </View>
  );
}
