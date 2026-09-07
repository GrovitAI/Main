import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '@/lib/pos/useResponsive';
import { PhoneAnalyticsScreen } from '@/components/phone/PhoneAnalyticsScreen';
import Svg, {
  Path,
  Rect,
  Circle,
  Text as SvgText,
  G,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import {
  TrendingUp,
  ShoppingCart,
  DollarSign,
  Percent,
  ShoppingBag,
  XCircle,
  Calendar,
  ArrowLeft,
  Clock,
  CreditCard,
  TrendingDown,
  Award,
  RotateCcw,
  Activity,
  ChevronRight,
} from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import {
  fetchAnalyticsDashboard,
  AnalyticsFilters,
  AnalyticsDashboard,
  SalesSeriesPoint,
  ProductInsight,
  PaymentSplit,
} from '@/lib/analytics/analytics-service';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { Building2, Download } from 'lucide-react-native';

export default function AnalyticsScreen() {

  const { session } = useSessionStore();
  const insets = useSafeAreaInsets();
  const { isPhone, width: windowWidth } = useResponsive();

  // Branch filter — relevant for owner and admin
  const isOwnerOrAdmin = session?.role === 'owner' || session?.role === 'admin';
  const accessibleBranches = session?.accessibleBranches ?? [];
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null); // null = all branches

  // State for filters
  const [preset, setPreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'month' | 'custom'>('7days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('23:00');
  const [advancedTime, setAdvancedTime] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Request sequencing and mount tracking to prevent race conditions on rapid filter clicking
  const latestRequestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Layout responsiveness
  const [salesChartWidth, setSalesChartWidth] = useState(600);
  const [ordersChartWidth, setOrdersChartWidth] = useState(300);
  const [rushChartWidth, setRushChartWidth] = useState(300);

  // Data fetching state
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<AnalyticsDashboard | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Franchise mode & royalty state
  const [isFranchiseMode, setIsFranchiseMode] = useState(false);
  const [royaltyRate, setRoyaltyRate] = useState(5.0);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedFranchise = window.localStorage.getItem('franchiseMode');
      if (storedFranchise !== null) {
        setIsFranchiseMode(storedFranchise === 'true');
      }
      const storedRate = window.localStorage.getItem('franchiseRoyaltyRate');
      if (storedRate !== null) {
        const parsed = parseFloat(storedRate);
        if (!isNaN(parsed)) setRoyaltyRate(parsed);
      }
    }
  }, []);

  const toggleFranchiseMode = (val: boolean) => {
    setIsFranchiseMode(val);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('franchiseMode', String(val));
    }
  };

  const updateRoyaltyRate = (rate: number) => {
    // Clamp between 1.0% and 10.0%
    const clamped = Math.max(1.0, Math.min(10.0, rate));
    setRoyaltyRate(clamped);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('franchiseRoyaltyRate', String(clamped));
    }
  };

  const decreaseRoyaltyRate = () => updateRoyaltyRate(royaltyRate - 0.5);
  const increaseRoyaltyRate = () => updateRoyaltyRate(royaltyRate + 0.5);

  // Dynamic date preset calculations
  /** Narrows a label coming from the phone screen to a known preset id. */
  const toDatePreset = (value: string): typeof preset => {
    const normalised = value.toLowerCase().replace(/\s+/g, '');
    switch (normalised) {
      case 'today':
      case 'yesterday':
      case '7days':
      case '30days':
      case 'month':
      case 'custom':
        return normalised;
      default:
        return 'today';
    }
  };

  const applyPreset = (presetType: typeof preset) => {
    setPreset(presetType);
    if (presetType === 'custom') {
      setIsDatePickerOpen(true);
      return;
    }
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (presetType === 'today') {
      start = now;
      end = now;
    } else if (presetType === 'yesterday') {
      start = new Date();
      start.setDate(now.getDate() - 1);
      end = new Date();
      end.setDate(now.getDate() - 1);
    } else if (presetType === '7days') {
      start = new Date();
      start.setDate(now.getDate() - 6);
      end = now;
    } else if (presetType === '30days') {
      start = new Date();
      start.setDate(now.getDate() - 29);
      end = now;
    } else if (presetType === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = now;
    } else {
      // Custom: let the user type manually
      return;
    }

    const formatLocalISO = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setStartDate(formatLocalISO(start));
    setEndDate(formatLocalISO(end));
  };

  // Initialize
  useEffect(() => {
    applyPreset('7days');
  }, []);

  // Validation regex
  const isValidDate = (str: string) => /^\d{4}-\d{2}-\d{2}$/.test(str);

  // Fetch logic with race condition guards
  const loadDashboard = async () => {
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return;
    }
    const currentRequestId = ++latestRequestIdRef.current;
    setLoading(true);
    setErrorMsg(null);

    try {
      const filters: AnalyticsFilters = {
        startDate,
        endDate,
        ...(advancedTime ? { startTime, endTime } : {}),
        // Pass selected branch for owner; undefined means all branches
        ...(isOwnerOrAdmin && selectedBranchId ? { branchId: selectedBranchId } : {}),
      };

      const res = await fetchAnalyticsDashboard(filters);

      // Discard stale out-of-order responses or if component unmounted
      if (!isMountedRef.current || currentRequestId !== latestRequestIdRef.current) {
        return;
      }

      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setDashboardData(res.data);
      }
    } catch (err) {
      if (!isMountedRef.current || currentRequestId !== latestRequestIdRef.current) {
        return;
      }
      console.error('[AnalyticsScreen] Error fetching dashboard:', err);
      setErrorMsg('Failed to update analytics dashboard.');
    } finally {
      if (isMountedRef.current && currentRequestId === latestRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleExportCSV = () => {
    if (!dashboardData || !dashboardData.rawTransactions || dashboardData.rawTransactions.length === 0) {
      return;
    }

    // Helper: escape CSV cell values to prevent breaking structure
    const escapeCsv = (str: string) => {
      if (str === null || str === undefined) return '';
      const stringified = String(str);
      if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        return `"${stringified.replace(/"/g, '""')}"`;
      }
      return stringified;
    };

    const headers = [
      'Bill Number',
      'Date/Time',
      'Branch Name',
      'Items Summary',
      'Subtotal (Rs)',
      'Tax (Rs)',
      'Discount (Rs)',
      'Total Amount (Rs)',
      'Status'
    ];

    const csvRows = [headers.join(',')];

    dashboardData.rawTransactions.forEach((tx) => {
      const formattedDate = new Date(tx.created_at).toLocaleString('en-IN');
      const row = [
        escapeCsv(tx.invoice_number),
        escapeCsv(formattedDate),
        escapeCsv(tx.branch_name),
        escapeCsv(tx.items_summary),
        tx.subtotal.toFixed(2),
        tx.tax_amount.toFixed(2),
        tx.discount_amount.toFixed(2),
        tx.total_amount.toFixed(2),
        escapeCsv(tx.status.toUpperCase())
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    
    if (typeof window !== 'undefined') {
      const link = document.createElement('a');
      link.setAttribute('href', csvContent);
      link.setAttribute('download', `grovit_sales_report_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportItemWiseCSV = () => {
    if (!dashboardData || !dashboardData.itemWiseReport || dashboardData.itemWiseReport.length === 0) {
      return;
    }

    const escapeCsv = (str: string) => {
      if (str === null || str === undefined) return '';
      const stringified = String(str);
      if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        return `"${stringified.replace(/"/g, '""')}"`;
      }
      return stringified;
    };

    const headers = ['Menu Item Name', 'Quantity Sold', 'Total Sales Amount (Rs)'];
    const csvRows = [headers.join(',')];

    dashboardData.itemWiseReport.forEach((item) => {
      const row = [
        escapeCsv(item.item_name),
        item.qty.toString(),
        item.revenue.toFixed(2)
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'));
    
    if (typeof window !== 'undefined') {
      const link = document.createElement('a');
      link.setAttribute('href', csvContent);
      link.setAttribute('download', `grovit_item_wise_sales_${startDate}_to_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [startDate, endDate, startTime, endTime, advancedTime, selectedBranchId]);

  const kpis = dashboardData?.kpis;

  // Render Skeleton Loader for KPI and Charts
  const renderKpiSkeleton = () => (
    <View className="flex-row flex-wrap justify-between gap-4">
      {Array.from({ length: 6 }).map((_, idx) => (
        <View
          key={idx}
          className="flex-1 min-w-[150px] bg-white border border-border/40 rounded-2xl p-5 shadow-sm animate-pulse"
        >
          <View className="w-10 h-10 rounded-xl bg-surfaceTint mb-3" />
          <View className="h-6 w-20 bg-surfaceTint rounded mb-2" />
          <View className="h-4 w-12 bg-surfaceTint/60 rounded" />
        </View>
      ))}
    </View>
  );

  const renderChartSkeleton = () => (
    <View className="bg-white border border-border/40 rounded-2xl p-6 shadow-sm h-[260px] justify-between animate-pulse mb-6">
      <View className="h-5 w-40 bg-surfaceTint rounded" />
      <View className="h-[150px] bg-surfaceTint/40 rounded-xl w-full" />
      <View className="flex-row justify-between">
        <View className="h-3.5 w-12 bg-surfaceTint/50 rounded" />
        <View className="h-3.5 w-12 bg-surfaceTint/50 rounded" />
        <View className="h-3.5 w-12 bg-surfaceTint/50 rounded" />
      </View>
    </View>
  );

  // --- CHART RENDERING ---

  // Sales Trend Area Chart
  const salesChart = useMemo(() => {
    if (!dashboardData || dashboardData.salesByDay.length === 0) return null;
    const data = dashboardData.salesByDay;
    const maxSales = Math.max(...data.map((p) => (typeof p?.sales === 'number' && !isNaN(p.sales) ? p.sales : 0)), 500);

    const height = 220;
    const paddingX = 45;
    const paddingY = 30;

    const points = data.map((p, idx) => {
      const salesVal = typeof p?.sales === 'number' && !isNaN(p.sales) ? p.sales : 0;
      const x =
        data.length > 1
          ? paddingX + (idx / (data.length - 1)) * Math.max(10, salesChartWidth - paddingX * 2)
          : salesChartWidth / 2;
      const y = height - paddingY - (maxSales > 0 ? (salesVal / maxSales) * (height - paddingY * 2) : 0);
      return { x: isNaN(x) ? paddingX : x, y: isNaN(y) ? height - paddingY : y, label: p.label || '', sales: salesVal };
    });

    const linePath =
      points.length > 1
        ? points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
        : points.length === 1
        ? `M ${points[0].x - 15} ${points[0].y} L ${points[0].x + 15} ${points[0].y}`
        : '';
    const areaPath =
      points.length > 1
        ? `${linePath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
        : points.length === 1
        ? `M ${points[0].x - 15} ${points[0].y} L ${points[0].x + 15} ${points[0].y} L ${points[0].x + 15} ${height - paddingY} L ${points[0].x - 15} ${height - paddingY} Z`
        : '';

    return (
      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) setSalesChartWidth(w);
        }}
        className="bg-white border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm mb-6"
      >
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-base font-bold text-textPrimary">Sales Trend Overview</Text>
            <Text className="text-xs text-textSecondary">Revenue daily trajectory</Text>
          </View>
          <View className="flex-row items-center space-x-1.5">
            <TrendingUp size={16} color={colors.primary} />
            <Text className="text-xs font-bold text-primary">₹ {Math.round(kpis?.totalSales || 0).toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <Svg width={Math.max(100, salesChartWidth)} height={height}>
          <Defs>
            <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.0} />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          <Line
            x1={paddingX}
            y1={paddingY}
            x2={Math.max(paddingX + 10, salesChartWidth - paddingX)}
            y2={paddingY}
            stroke="#e8f2fa"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <Line
            x1={paddingX}
            y1={height / 2}
            x2={Math.max(paddingX + 10, salesChartWidth - paddingX)}
            y2={height / 2}
            stroke="#e8f2fa"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <Line
            x1={paddingX}
            y1={height - paddingY}
            x2={Math.max(paddingX + 10, salesChartWidth - paddingX)}
            y2={height - paddingY}
            stroke={colors.border}
            strokeWidth={1.5}
          />

          {/* Reference values on Y axis */}
          <SvgText
            x={paddingX - 8}
            y={paddingY + 4}
            fontSize={9}
            fill={colors.textSecondary}
            textAnchor="end"
          >
            ₹{Math.round(maxSales).toLocaleString('en-IN')}
          </SvgText>
          <SvgText
            x={paddingX - 8}
            y={height / 2 + 4}
            fontSize={9}
            fill={colors.textSecondary}
            textAnchor="end"
          >
            ₹{Math.round(maxSales / 2).toLocaleString('en-IN')}
          </SvgText>
          <SvgText
            x={paddingX - 8}
            y={height - paddingY + 4}
            fontSize={9}
            fill={colors.textSecondary}
            textAnchor="end"
          >
            ₹0
          </SvgText>

          {points.length > 0 && (
            <>
              {/* Fill area */}
              {areaPath ? <Path d={areaPath} fill="url(#areaGrad)" /> : null}
              {/* Stroke line */}
              {linePath ? <Path d={linePath} fill="none" stroke={colors.primary} strokeWidth={2.5} /> : null}

              {/* Data points */}
              {points.map((p, idx) => (
                <G key={idx}>
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={4.5}
                    fill="#ffffff"
                    stroke={colors.primary}
                    strokeWidth={2}
                  />
                  {/* Floating labels for peaks or selected */}
                  {(idx === 0 || idx === points.length - 1 || p.sales === maxSales) && p.sales > 0 && (
                    <SvgText
                      x={p.x}
                      y={p.y - 8}
                      fontSize={8.5}
                      fill={colors.textPrimary}
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      ₹{Math.round(p.sales)}
                    </SvgText>
                  )}
                  {/* Date labels */}
                  {data.length <= 10 || idx % 2 === 0 ? (
                    <SvgText
                      x={p.x}
                      y={height - 10}
                      fontSize={8.5}
                      fill={colors.textSecondary}
                      textAnchor="middle"
                    >
                      {p.label}
                    </SvgText>
                  ) : null}
                </G>
              ))}
            </>
          )}
        </Svg>
      </View>
    );
  }, [dashboardData, salesChartWidth]);

  // Orders Bar Chart
  const ordersChart = useMemo(() => {
    if (!dashboardData || dashboardData.ordersByDay.length === 0) return null;
    const data = dashboardData.ordersByDay;
    const maxOrders = Math.max(...data.map((p) => (typeof p?.orders === 'number' && !isNaN(p.orders) ? p.orders : 0)), 5);

    const height = 180;
    const paddingX = 35;
    const paddingY = 25;

    return (
      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) setOrdersChartWidth(w);
        }}
        className="flex-1 bg-white border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm mb-6"
      >
        <View className="mb-4">
          <Text className="text-base font-bold text-textPrimary">Daily Orders Count</Text>
          <Text className="text-xs text-textSecondary">Order frequency distribution</Text>
        </View>

        <Svg width={Math.max(100, ordersChartWidth)} height={height}>
          {/* Bottom baseline */}
          <Line
            x1={paddingX}
            y1={height - paddingY}
            x2={Math.max(paddingX + 10, ordersChartWidth - paddingX)}
            y2={height - paddingY}
            stroke={colors.border}
            strokeWidth={1}
          />

          {data.map((p, idx) => {
            const availableWidth = Math.max(20, ordersChartWidth - paddingX * 2);
            const slotWidth = availableWidth / Math.max(1, data.length);
            const barWidth = Math.max(6, Math.min(28, slotWidth - 8));
            const x = paddingX + idx * slotWidth + (slotWidth - barWidth) / 2;
            const ordersVal = typeof p?.orders === 'number' && !isNaN(p.orders) ? p.orders : 0;
            const barHeight = maxOrders > 0 ? (ordersVal / maxOrders) * (height - paddingY * 2) : 0;
            const safeBarHeight = isNaN(barHeight) ? 0 : Math.max(0, barHeight);
            const y = height - paddingY - safeBarHeight;

            return (
              <G key={idx}>
                {/* Bar */}
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(1.5, safeBarHeight)}
                  fill={colors.primaryLight}
                  rx={4}
                />
                {/* Count value label */}
                {ordersVal > 0 && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={y - 4}
                    fontSize={8.5}
                    fontWeight="bold"
                    fill={colors.textPrimary}
                    textAnchor="middle"
                  >
                    {ordersVal}
                  </SvgText>
                )}
                {/* Date Label */}
                {data.length <= 10 || idx % 2 === 0 ? (
                  <SvgText
                    x={x + barWidth / 2}
                    y={height - 8}
                    fontSize={8.5}
                    fill={colors.textSecondary}
                    textAnchor="middle"
                  >
                    {p.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </View>
    );
  }, [dashboardData, ordersChartWidth]);

  // Hourly Rush Hour Chart
  const rushChart = useMemo(() => {
    if (!dashboardData || dashboardData.salesByHour.length === 0) return null;
    const data = dashboardData.salesByHour;
    const maxHourSales = Math.max(...data.map((p) => (typeof p?.sales === 'number' && !isNaN(p.sales) ? p.sales : 0)), 100);

    const height = 180;
    const paddingX = 35;
    const paddingY = 25;

    return (
      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) setRushChartWidth(w);
        }}
        className="flex-1 bg-white border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm mb-6"
      >
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-base font-bold text-textPrimary">Rush Hours Analysis</Text>
            <Text className="text-xs text-textSecondary">Hourly revenue distribution</Text>
          </View>
          <Clock size={16} color={colors.textSecondary} />
        </View>

        <Svg width={Math.max(100, rushChartWidth)} height={height}>
          {/* Bottom baseline */}
          <Line
            x1={paddingX}
            y1={height - paddingY}
            x2={Math.max(paddingX + 10, rushChartWidth - paddingX)}
            y2={height - paddingY}
            stroke={colors.border}
            strokeWidth={1}
          />

          {data.map((p, idx) => {
            const availableWidth = Math.max(20, rushChartWidth - paddingX * 2);
            const slotWidth = availableWidth / 24;
            const barWidth = Math.max(2, slotWidth - 2);
            const x = paddingX + idx * slotWidth + (slotWidth - barWidth) / 2;
            const salesVal = typeof p?.sales === 'number' && !isNaN(p.sales) ? p.sales : 0;
            const barHeight = maxHourSales > 0 ? (salesVal / maxHourSales) * (height - paddingY * 2) : 0;
            const safeBarHeight = isNaN(barHeight) ? 0 : Math.max(0, barHeight);
            const y = height - paddingY - safeBarHeight;

            // Only print labels every 4 hours to avoid overlaps
            const showLabel = idx % 4 === 0 || idx === 23;

            return (
              <G key={idx}>
                {/* Bar */}
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(1, safeBarHeight)}
                  fill={salesVal === maxHourSales ? colors.primaryDeep : colors.accent}
                  rx={1.5}
                />
                {/* Hour indicator label */}
                {showLabel && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={height - 8}
                    fontSize={7.5}
                    fill={colors.textSecondary}
                    textAnchor="middle"
                  >
                    {String(p?.hour || '').slice(0, 2)}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      </View>
    );
  }, [dashboardData, rushChartWidth]);

  // Payment Segmented Ring (Donut) Chart
  const paymentSplitRing = useMemo(() => {
    if (!dashboardData || dashboardData.paymentSplit.length === 0) {
      return (
        <View className="bg-white border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm flex-1 min-w-[280px] mb-6 items-center justify-center">
          <Text className="text-sm text-textSecondary py-10">No payments found in range</Text>
        </View>
      );
    }
    const data = dashboardData.paymentSplit;
    const totalAmt = data.reduce((acc, p) => acc + (typeof p?.total === 'number' && !isNaN(p.total) ? p.total : 0), 0);

    const radius = 50;
    const strokeWidth = 14;
    const center = 75;
    const circumference = 2 * Math.PI * radius; // ~314.16

    let accumulatedOffset = 0;

    const paymentColors: Record<string, string> = {
      UPI: colors.primaryLight,
      CASH: colors.primary,
      CARD: colors.accent,
    };

    return (
      <View className={`bg-white border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm flex-1 min-w-[280px] mb-6 ${isPhone ? 'flex-col' : 'flex-row items-center justify-between'}`}>
        <View className={`${isPhone ? 'mb-6 w-full' : 'mr-4 flex-1'}`}>
          <Text className="text-base font-bold text-textPrimary">Payment Splits</Text>
          <Text className="text-xs text-textSecondary mb-4">Method allocation share</Text>

          {data.map((item, idx) => {
            const itemTotal = typeof item?.total === 'number' && !isNaN(item.total) ? item.total : 0;
            const pct = totalAmt > 0 ? (itemTotal / totalAmt) * 100 : 0;
            const itemColor = paymentColors[item.payment_type] || '#5b6b7c';
            return (
              <View key={idx} className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center space-x-2">
                  <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: itemColor }} />
                  <Text className="text-xs font-bold text-textPrimary">{item.payment_type}</Text>
                </View>
                <Text className="text-xs text-textSecondary font-semibold">
                  {pct.toFixed(0)}% (₹{Math.round(itemTotal).toLocaleString('en-IN')})
                </Text>
              </View>
            );
          })}
        </View>

        <View className="items-center justify-center w-[150px] h-[150px] self-center">
          <Svg width={150} height={150}>
            {data.map((item, idx) => {
              const itemTotal = typeof item?.total === 'number' && !isNaN(item.total) ? item.total : 0;
              const fraction = totalAmt > 0 ? Math.max(0, itemTotal / totalAmt) : 0;
              const sliceLength = isNaN(fraction) ? 0 : fraction * circumference;
              const itemColor = paymentColors[item.payment_type] || '#5b6b7c';
              const offset = isNaN(accumulatedOffset) ? 0 : accumulatedOffset;
              accumulatedOffset += sliceLength;

              return (
                <Circle
                  key={idx}
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={itemColor}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${sliceLength.toFixed(1)} ${circumference.toFixed(1)}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${center} ${center})`}
                />
              );
            })}

            {/* Inner Dashboard Circle Details */}
            <Circle cx={center} cy={center} r={radius - strokeWidth / 2} fill="#ffffff" />
            <SvgText
              x={center}
              y={center - 4}
              fontSize={8.5}
              fontWeight="bold"
              fill={colors.textSecondary}
              textAnchor="middle"
            >
              TOTAL
            </SvgText>
            <SvgText
              x={center}
              y={center + 12}
              fontSize={11.5}
              fontWeight="bold"
              fill={colors.textPrimary}
              textAnchor="middle"
            >
              ₹{Math.round(totalAmt).toLocaleString('en-IN')}
            </SvgText>
          </Svg>
        </View>
      </View>
    );
  }, [dashboardData, isPhone]);

  // Product leaderboards side-by-side or stacked
  const productIntelligence = useMemo(() => {
    if (!dashboardData) return null;

    const { topSellingItems, leastSellingItems, highestRevenueItems } = dashboardData;

    const renderList = (title: string, icon: React.ReactNode, list: ProductInsight[], isRevenue: boolean = false) => (
      <View className="flex-1 min-w-[280px] bg-white border border-border/60 rounded-2xl p-5 shadow-sm">
        <View className="flex-row items-center space-x-2 mb-4 border-b border-border/40 pb-2">
          {icon}
          <Text className="text-sm font-bold text-textPrimary">{title}</Text>
        </View>

        {list.length === 0 ? (
          <View className="py-12 items-center justify-center">
            <Text className="text-xs text-textSecondary">No data recorded</Text>
          </View>
        ) : (
          list.map((item, idx) => {
            // Ranking badges
            let rankBg = 'bg-surfaceTint';
            let rankText = 'text-textSecondary';
            if (idx === 0) {
              rankBg = 'bg-[#ffd700]'; // gold
              rankText = 'text-[#664d03]';
            } else if (idx === 1) {
              rankBg = 'bg-[#c0c0c0]'; // silver
              rankText = 'text-[#495057]';
            } else if (idx === 2) {
              rankBg = 'bg-[#cd7f32]'; // bronze
              rankText = 'text-[#ffffff]';
            }

            return (
              <View key={idx} className="flex-row items-center justify-between py-2 border-b border-border/30 last:border-b-0">
                <View className="flex-row items-center space-x-2.5 flex-1 mr-2">
                  <View className={`w-5 h-5 rounded-full items-center justify-center ${rankBg}`}>
                    <Text className={`text-[9px] font-bold ${rankText}`}>#{idx + 1}</Text>
                  </View>
                  <Text className="text-xs font-semibold text-textPrimary truncate flex-1" numberOfLines={1}>
                    {item.item_name}
                  </Text>
                </View>
                <Text className="text-xs font-bold text-textSecondary shrink-0">
                  {isRevenue ? `₹${Math.round(item.revenue).toLocaleString('en-IN')}` : `${item.qty} sold`}
                </Text>
              </View>
            );
          })
        )}
      </View>
    );

    return (
      <View className="flex-row flex-wrap gap-6 mb-6">
        {renderList('Top Selling Items', <Award size={16} color="#ffd700" />, topSellingItems, false)}
        {renderList('Highest Revenue Items', <TrendingUp size={16} color={colors.primary} />, highestRevenueItems, true)}
        {renderList('Least Sold Items', <TrendingDown size={16} color="#ef4444" />, leastSellingItems, false)}
      </View>
    );
  }, [dashboardData]);

  // Comprehensive Item-Wise Sales Performance Report
  const itemWiseReportSection = useMemo(() => {
    if (!dashboardData || !dashboardData.itemWiseReport || dashboardData.itemWiseReport.length === 0) {
      return null;
    }

    return (
      <View className="bg-white border border-border/60 rounded-2xl p-5 shadow-sm mb-6">
        <View className="flex-row items-center justify-between mb-4 border-b border-border/40 pb-2">
          <View className="flex-row items-center space-x-2">
            <Building2 size={16} color={colors.primary} />
            <Text className="text-sm font-bold text-textPrimary">Item-Wise Sales Performance</Text>
          </View>
          <Text className="text-xs text-textSecondary font-semibold">
            {dashboardData.itemWiseReport.length} unique items sold
          </Text>
        </View>

        <View className="max-h-[300px] overflow-y-auto">
          {/* Table Header */}
          <View className="flex-row justify-between py-2 border-b border-border/40 bg-surfaceTint px-2 rounded-lg gap-2">
            <Text className="text-xs font-bold text-textSecondary flex-1">Menu Item</Text>
            <Text className="text-xs font-bold text-textSecondary flex-1 min-w-[60px] text-center">Qty Sold</Text>
            <Text className="text-xs font-bold text-textSecondary flex-1 min-w-[60px] text-right">Revenue (Rs)</Text>
          </View>

          {/* Table Rows */}
          {dashboardData.itemWiseReport.map((item, idx) => (
            <View key={idx} className="flex-row justify-between items-center py-2.5 border-b border-border/30 px-2 gap-2 last:border-b-0">
              <Text className="text-xs font-medium text-textPrimary flex-1" numberOfLines={1}>
                {item.item_name}
              </Text>
              <Text className="text-xs font-bold text-textSecondary flex-1 min-w-[60px] text-center">
                {item.qty}
              </Text>
              <Text className="text-xs font-bold text-textPrimary flex-1 min-w-[60px] text-right">
                ₹{item.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }, [dashboardData]);

  // Main Dashboard Content Grid
  // KPI cards: 2 per row on phone, 3 on tablet, 5 on desktop.
  // Without an explicit basis all ten cards squeeze into one row and truncate.
  const kpiColumns = windowWidth >= 1280 ? 5 : windowWidth >= 768 ? 3 : 2;
  const kpiCardStyle = {
    flexGrow: 1,
    // Subtract the row gap share so the intended column count actually fits.
    flexBasis: `${100 / kpiColumns - 3}%` as const,
    minWidth: 132,
    maxWidth: '100%' as const,
  };

  const renderDashboardContent = () => {
    if (loading && !dashboardData) {
      return (
        <View className="space-y-6">
          {renderKpiSkeleton()}
          {renderChartSkeleton()}
        </View>
      );
    }

    if (errorMsg) {
      return (
        <View className="items-center justify-center py-20 bg-white border border-border/40 rounded-2xl shadow-sm p-6">
          <XCircle size={44} color="#ef4444" />
          <Text className="text-base font-bold text-textPrimary mt-4">{errorMsg}</Text>
          <Text className="text-xs text-textSecondary mt-2">Could not retrieve dashboard metrics</Text>
          <Pressable
            onPress={loadDashboard}
            className="mt-6 bg-primary px-5 py-2.5 rounded-xl flex-row items-center space-x-2 active:opacity-90 min-h-[44px]"
          >
            <RotateCcw size={16} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Retry Analytics</Text>
          </Pressable>
        </View>
      );
    }

    const isDashboardEmpty =
      !dashboardData ||
      (dashboardData.kpis.totalSales === 0 &&
        dashboardData.kpis.totalOrders === 0 &&
        dashboardData.topSellingItems.length === 0);

    const totalSales = kpis?.totalSales || 0;
    const royaltyAmount = (totalSales * royaltyRate) / 100;
    const netSales = totalSales - royaltyAmount;

    return (
      <View className="space-y-6">
        {/* KPIs ROW */}
        {kpis && (
          <View className="flex-row flex-wrap justify-between gap-4">
            {/* 1. Total Sales */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Total Sales</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>
                ₹{Math.round(kpis.totalSales).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* 2. Total Orders */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Total Orders</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>{kpis.totalOrders}</Text>
            </View>

            {/* 3. AOV */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Avg Order</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>
                ₹{Math.round(kpis.avgOrderValue).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* 4. Items Sold */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Items Sold</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>{kpis.itemsSold}</Text>
            </View>

            {/* 5. Tax Collected */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Tax</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>
                ₹{Math.round(kpis.taxCollected).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* 6. Cancelled Orders */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Cancelled</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>{kpis.cancelledOrders}</Text>
            </View>

            {/* 7. Collected Revenue */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Revenue</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>
                ₹{Math.round(kpis.collectedRevenue || 0).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* 8. Pending Collections */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Pending</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>
                ₹{Math.round(kpis.pendingCollections || 0).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* 9. Total Discounts */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Discounts</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>
                ₹{Math.round(kpis.totalDiscounts || 0).toLocaleString('en-IN')}
              </Text>
            </View>

            {/* 10. Cancelled Sales */}
            <View style={kpiCardStyle} className="bg-white border border-border/50 rounded-2xl p-4 shadow-sm justify-center">
              <Text className="text-[11px] font-bold text-textSecondary uppercase tracking-wider" numberOfLines={1}>Cancelled Sales</Text>
              <Text className="text-lg lg:text-xl font-black text-textPrimary mt-1" numberOfLines={1}>
                ₹{Math.round(kpis.cancelledSales || 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        )}

        {/* Franchise Royalty Calculator Card */}
        <View className="bg-white border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm">
          {/* Header with Switch */}
          <View className="flex-row items-center justify-between border-b border-border/40 pb-4 mb-4">
            <View className="flex-row items-center space-x-3">
              <View className="w-9 h-9 rounded-xl bg-orange-50 items-center justify-center">
                <Percent size={18} color="#f97316" />
              </View>
              <View>
                <Text className="text-base font-bold text-textPrimary">Franchise Royalty Tracker</Text>
                <Text className="text-xs text-textSecondary">Calculates franchise partner fees and splits</Text>
              </View>
            </View>
            <View className="flex-row items-center space-x-2">
              <Text className="text-xs font-bold text-textSecondary">{isFranchiseMode ? 'Franchise Active' : 'Off'}</Text>
              <Switch
                value={isFranchiseMode}
                onValueChange={toggleFranchiseMode}
                trackColor={{ false: '#e2e8f0', true: colors.primary }}
                thumbColor={isFranchiseMode ? '#FFFFFF' : '#f4f4f5'}
              />
            </View>
          </View>

          {isFranchiseMode ? (
            <View>
              {/* Rate Controls */}
              <View className="flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                <View className="flex-row items-center space-x-4">
                  <Text className="text-sm font-semibold text-textSecondary">Royalty Rate:</Text>
                  <View className="flex-row items-center bg-surfaceTint rounded-xl p-1 border border-border/40">
                    <Pressable
                      onPress={decreaseRoyaltyRate}
                      className="w-8 h-8 rounded-lg bg-white items-center justify-center border border-border/40 active:bg-surfaceTint"
                    >
                      <Text className="text-sm font-bold text-textPrimary">-</Text>
                    </Pressable>
                    <Text className="text-sm font-black text-textPrimary px-4">{royaltyRate.toFixed(1)}%</Text>
                    <Pressable
                      onPress={increaseRoyaltyRate}
                      className="w-8 h-8 rounded-lg bg-white items-center justify-center border border-border/40 active:bg-surfaceTint"
                    >
                      <Text className="text-sm font-bold text-textPrimary">+</Text>
                    </Pressable>
                  </View>
                </View>
                <Text className="text-xs text-textSecondary italic">
                  Royalty rate can be adjusted from 1.0% to 10.0%.
                </Text>
              </View>

              {/* Metrics Split */}
              <View className="flex-row flex-wrap justify-between gap-4 mb-6">
                {/* Gross Sales */}
                <View className="flex-1 min-w-[120px] bg-surfaceTint/40 border border-border/30 rounded-xl p-4">
                  <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider">Gross Revenue</Text>
                  <Text className="text-lg font-black text-textPrimary mt-1">
                    ₹{Math.round(totalSales).toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* Royalty Amount */}
                <View className="flex-1 min-w-[120px] bg-orange-50/40 border border-orange-200/40 rounded-xl p-4">
                  <Text className="text-[10px] font-bold text-[#f97316] uppercase tracking-wider">Royalty Fee ({royaltyRate.toFixed(1)}%)</Text>
                  <Text className="text-lg font-black text-[#f97316] mt-1">
                    - ₹{Math.round(royaltyAmount).toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* Net Revenue */}
                <View className="flex-1 min-w-[120px] bg-green-50/40 border border-green-200/40 rounded-xl p-4">
                  <Text className="text-[10px] font-bold text-[#10b981] uppercase tracking-wider">Net Store Share ({(100 - royaltyRate).toFixed(1)}%)</Text>
                  <Text className="text-lg font-black text-[#10b981] mt-1">
                    ₹{Math.round(netSales).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* Visual Split Bar */}
              <View className="mb-2">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-[11px] font-bold text-textSecondary">Revenue Allocation Split</Text>
                  <Text className="text-[11px] font-bold text-textPrimary">
                    Owner: {(100 - royaltyRate).toFixed(1)}% | Partner: {royaltyRate.toFixed(1)}%
                  </Text>
                </View>
                <View className="w-full h-3 bg-orange-500 rounded-full overflow-hidden flex-row">
                  <View
                    style={{ width: `${100 - royaltyRate}%` }}
                    className="h-full bg-green-500 rounded-l-full"
                  />
                  <View
                    style={{ width: `${royaltyRate}%` }}
                    className="h-full bg-orange-500 rounded-r-full"
                  />
                </View>
                <View className="flex-row items-center justify-between mt-1.5">
                  <View className="flex-row items-center space-x-1">
                    <View className="w-2 h-2 rounded-full bg-green-500" />
                    <Text className="text-[10px] text-textSecondary font-semibold">Store Share</Text>
                  </View>
                  <View className="flex-row items-center space-x-1">
                    <View className="w-2 h-2 rounded-full bg-orange-500" />
                    <Text className="text-[10px] text-textSecondary font-semibold">Royalty Fee</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View className="py-4 items-center justify-center bg-surfaceTint/20 rounded-xl border border-dashed border-border/60">
              <Text className="text-xs text-textSecondary font-semibold text-center px-4">
                Royalty tracking is currently disabled. Toggle Franchise Mode to track partner fees.
              </Text>
            </View>
          )}
        </View>

        {isDashboardEmpty ? (
          <View className="items-center justify-center py-20 bg-white border border-border/40 rounded-2xl shadow-sm p-6">
            <Activity size={38} color={colors.textSecondary} />
            <Text className="text-base font-bold text-textPrimary mt-4">No Transactions Recorded</Text>
            <Text className="text-xs text-textSecondary mt-2">
              No sales data was found in selected range. Create paid bills to test dashboard.
            </Text>
          </View>
        ) : (
          <>
            {/* Area Chart Section */}
            {salesChart}

            {/* Sub Charts: Orders Daily Split + Rush Hours */}
            <View className="flex-col lg:flex-row gap-6">
              {ordersChart}
              {rushChart}
            </View>

            {/* Leaderboard Lists */}
            <View>
              <Text className="text-base font-bold text-textPrimary mb-3">Product Menu Intelligence</Text>
              {productIntelligence}
            </View>

            {/* Item-Wise Sales Performance */}
            {itemWiseReportSection}

            {/* Payment breakdowns */}
            <View className="flex-col lg:flex-row gap-6">
              {paymentSplitRing}
            </View>
          </>
        )}
      </View>
    );
  };

  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  if (isPhone) {
    const kpis = dashboardData?.kpis;
    return (
      <PhoneAnalyticsScreen
        kpiData={{
          totalSales: kpis?.totalSales || 0,
          totalOrders: kpis?.totalOrders || 0,
          avgOrderValue: kpis?.avgOrderValue || 0,
          itemsSold: kpis?.itemsSold || 0,
          totalTax: kpis?.taxCollected || 0,
          totalDiscounts: kpis?.totalDiscounts || 0,
          collectedRevenue: kpis?.collectedRevenue || kpis?.totalSales || 0,
          pendingCollections: kpis?.pendingCollections || 0,
          cancelledOrders: kpis?.cancelledOrders || 0,
          cancelledSales: kpis?.cancelledSales || 0,
          salesTrend: 0,
        }}
        royaltyData={{
          enabled: isFranchiseMode,
          storeShare: 100 - royaltyRate,
          royaltyShare: royaltyRate,
        }}
        chartsData={{
          salesTrend: (dashboardData?.salesByDay || []).map((t) => ({
            label: t.label,
            value: t.sales || 0,
            orders: t.orders || 0,
          })),
          rushHours: (dashboardData?.salesByHour || []).map((r) => ({
            hour: r.hour,
            sales: r.sales || 0,
          })),
          paymentSplits: (dashboardData?.paymentSplit || []).map((p) => ({
            label: p.payment_type || 'Other',
            value: p.total || 0,
          })),
        }}
        topProducts={(dashboardData?.topSellingItems || []).map((item, idx) => ({
          id: String(idx),
          name: item.item_name,
          sold: item.qty || 0,
          revenue: item.revenue || 0,
        }))}
        itemSales={(dashboardData?.itemWiseReport || []).map((item, idx) => ({
          id: String(idx),
          name: item.item_name,
          quantity: item.qty || 0,
          revenue: item.revenue || 0,
        }))}
        filterState={{
          datePreset: preset,
          selectedBranchId: selectedBranchId || undefined,
        }}
        branches={accessibleBranches.map((b) => ({ id: b.id, name: b.name }))}
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        loading={loading}
        errorMsg={errorMsg}
        onRetry={loadDashboard}
        isFilterSheetOpen={isFilterSheetOpen}
        onOpenFilter={() => setIsFilterSheetOpen(true)}
        onCloseFilter={() => setIsFilterSheetOpen(false)}
        onSelectDatePreset={(p) => applyPreset(toDatePreset(p))}
        onApplyCustomRange={(start, end, startT, endT) => {
          setStartDate(start);
          setEndDate(end);
          if (startT) setStartTime(startT);
          if (endT) setEndTime(endT);
          setPreset('custom');
        }}
        onSelectBranch={(bId) => setSelectedBranchId(bId)}
        onExportCSV={handleExportCSV}
      />
    );
  }

  return (
    <View className="flex-1 bg-surfaceTint" style={{ paddingTop: insets.top }}>
      {/* HEADER SECTION */}
      <View className={`bg-white border-b border-border/60 py-4 px-4 md:px-6 shadow-sm ${isPhone ? 'flex-col items-start gap-4' : 'flex-row items-center justify-between'}`}>
        <View className="flex-row items-center space-x-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push('/orders');
            }}
            className="w-10 h-10 rounded-full border border-border items-center justify-center active:bg-surfaceTint flex"
          >
            <ArrowLeft size={18} color={colors.textPrimary} />
          </Pressable>
          <View>
            <Text className="text-lg font-black text-textPrimary">Analytics Command Center</Text>
            <Text className="text-xs text-textSecondary">Restaurant operations & revenue overview</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-3">
          {dashboardData && dashboardData.rawTransactions && dashboardData.rawTransactions.length > 0 && (
            <Pressable
              onPress={handleExportCSV}
              id="btn-export-csv"
              className="px-4 py-2 rounded-xl bg-primary flex-row items-center gap-1.5 active:opacity-90"
            >
              <Download size={14} color="#fff" />
              <Text className="text-white text-xs font-bold">Export Transactions</Text>
            </Pressable>
          )}
          {dashboardData && dashboardData.itemWiseReport && dashboardData.itemWiseReport.length > 0 && (
            <Pressable
              onPress={handleExportItemWiseCSV}
              id="btn-export-item-wise-csv"
              className="px-4 py-2 rounded-xl bg-emerald-600 flex-row items-center gap-1.5 active:opacity-90"
            >
              <Download size={14} color="#fff" />
              <Text className="text-white text-xs font-bold">Export Item Sales</Text>
            </Pressable>
          )}
          {loading && <ActivityIndicator color={colors.primary} size="small" />}
        </View>
      </View>

      {/* FILTER CONTROL TOOLBAR */}
      <View className="bg-white border-b border-border/40 py-3.5 px-4 md:px-6 shadow-sm">

        {/* ── Branch Filter (owner/admin only) ── */}
        {isOwnerOrAdmin && accessibleBranches.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Branch
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {/* All Branches chip */}
              <Pressable
                onPress={() => { setSelectedBranchId(null); }}
                id="branch-filter-all"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                  borderWidth: 1.5,
                  borderColor: selectedBranchId === null ? '#0066b2' : '#E2E8F0',
                  backgroundColor: selectedBranchId === null ? '#EFF6FF' : '#F8FAFC',
                }}
              >
                <Building2 size={12} color={selectedBranchId === null ? '#0066b2' : '#94A3B8'} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: selectedBranchId === null ? '#0066b2' : '#64748B' }}>
                  All Branches
                </Text>
              </Pressable>
              {/* Individual branch chips */}
              {accessibleBranches.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => { setSelectedBranchId(b.id); }}
                  id={`branch-filter-${b.id}`}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: selectedBranchId === b.id ? '#0066b2' : '#E2E8F0',
                    backgroundColor: selectedBranchId === b.id ? '#EFF6FF' : '#F8FAFC',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: selectedBranchId === b.id ? '#0066b2' : '#64748B' }}>
                    {b.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View className="flex-row flex-wrap items-center gap-2">
          {/* Quick presets list */}
          {(['today', 'yesterday', '7days', '30days', 'month', 'custom'] as const).map((presetKey) => {
            const presetLabels = {
              today: 'Today',
              yesterday: 'Yesterday',
              '7days': '7 Days',
              '30days': '30 Days',
              month: 'This Month',
              custom: 'Custom',
            };
            const isActive = preset === presetKey;

            return (
              <Pressable
                key={presetKey}
                onPress={() => applyPreset(presetKey)}
                className={`px-4 py-2 rounded-xl border flex items-center justify-center ${
                  isActive
                    ? 'bg-primary border-primary'
                    : 'bg-white border-border hover:bg-surfaceTint'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isActive ? 'text-white' : 'text-textSecondary'
                  }`}
                >
                  {presetLabels[presetKey]}
                </Text>
              </Pressable>
            );
          })}

          {/* Calendar Picker Trigger Button */}
          <Pressable
            onPress={() => setIsDatePickerOpen(true)}
            id="btn-open-analytics-date-picker"
            className="px-3.5 py-2 rounded-xl border border-primary/40 bg-primary/10 flex-row items-center space-x-1.5 active:opacity-80 ml-auto"
          >
            <Calendar size={14} color={colors.primary} />
            <Text className="text-xs font-bold text-primary">
              {startDate && endDate ? `${startDate} → ${endDate}` : 'Select Dates'}
            </Text>
          </Pressable>
        </View>

        {/* Custom Range Picker Fields */}
        {preset === 'custom' && (
          <Pressable
            onPress={() => setIsDatePickerOpen(true)}
            className="flex-row flex-wrap items-center gap-4 mt-3 bg-surfaceTint/50 p-4 rounded-xl border border-border/40 active:opacity-90 cursor-pointer"
          >
            <View className="flex-1 min-w-[120px]">
              <Text className="text-[10px] font-black text-textSecondary mb-1.5 uppercase tracking-wider">
                Start Date
              </Text>
              <View className="px-3.5 py-2 border border-border rounded-xl bg-white justify-center">
                <Text className="text-textPrimary text-xs font-semibold">
                  {startDate || 'YYYY-MM-DD'}
                </Text>
              </View>
            </View>
            <View className="flex-1 min-w-[120px]">
              <Text className="text-[10px] font-black text-textSecondary mb-1.5 uppercase tracking-wider">
                End Date
              </Text>
              <View className="px-3.5 py-2 border border-border rounded-xl bg-white justify-center">
                <Text className="text-textPrimary text-xs font-semibold">
                  {endDate || 'YYYY-MM-DD'}
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Optional Time Filters */}
        <Pressable
          onPress={() => setAdvancedTime(!advancedTime)}
          className="flex-row items-center space-x-2 mt-3.5 py-1"
        >
          <View
            className={`w-4 h-4 rounded border items-center justify-center ${
              advancedTime ? 'bg-primary border-primary' : 'border-border'
            }`}
          >
            {advancedTime && <View className="w-1.5 h-1.5 rounded-full bg-white" />}
          </View>
          <Text className="text-xs text-textSecondary font-bold">
            Filter by business hours (e.g. Lunch/Dinner split analysis)
          </Text>
        </Pressable>

        {advancedTime && (
          <View className="flex-row flex-wrap items-center gap-4 mt-2.5 bg-surfaceTint/50 p-4 rounded-xl border border-border/40">
            <View className="flex-1 min-w-[100px]">
              <Text className="text-[10px] font-black text-textSecondary mb-1.5 uppercase tracking-wider">
                Start Time (HH:MM)
              </Text>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                className="px-3.5 py-2 border border-border rounded-xl text-textPrimary text-xs bg-white font-semibold"
              />
            </View>
            <View className="flex-1 min-w-[100px]">
              <Text className="text-[10px] font-black text-textSecondary mb-1.5 uppercase tracking-wider">
                End Time (HH:MM)
              </Text>
              <TextInput
                value={endTime}
                onChangeText={setEndTime}
                placeholder="23:00"
                className="px-3.5 py-2 border border-border rounded-xl text-textPrimary text-xs bg-white font-semibold"
              />
            </View>
          </View>
        )}
      </View>

      {/* DASHBOARD GRAPHICS GRID PANEL */}
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={renderDashboardContent()}
        contentContainerStyle={{ padding: isPhone ? 16 : 24, paddingBottom: 100 }}
        className="flex-1"
        showsVerticalScrollIndicator={false}
      />

      {/* Interactive Date Picker Modal */}
      <DatePickerModal
        visible={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        startDate={startDate}
        endDate={endDate}
        startTime={startTime}
        endTime={endTime}
        showTimePicker={advancedTime}
        onApply={(start, end, startT, endT) => {
          setStartDate(start);
          setEndDate(end);
          if (startT) setStartTime(startT);
          if (endT) setEndTime(endT);
          setPreset('custom');
        }}
      />
    </View>
  );
}
