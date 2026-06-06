import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Bell,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Heart,
  Info,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  User,
  Eye,
  ShoppingCart,
  X,
  Hash,
  CreditCard,
  Home,
  Upload,
  Store,
  MoreVertical,
  Download,
  BookOpen,
} from 'lucide-react-native';
import Svg, { Circle, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { BRANCH_ID, getTenantContext } from '@/lib/pos/tenant-context';
import { colors } from '@/lib/pos/brand';
import {
  fetchCategories,
  fetchUnits,
  fetchSuppliers,
  fetchMaterials,
  fetchPurchases,
  fetchPurchaseItems,
  createPurchase,
  updatePurchaseStatus,
  fetchAdjustments,
  createAdjustment,
  fetchWastage,
  createWastage,
  fetchAuditLogs,
  fetchAlerts,
  markAlertRead,
  fetchInventoryDashboardKPIs,
  initializeLocalSeeder,
  saveMaterial,
  deleteMaterial,
  saveSupplier,
  deleteSupplier,
  saveCategory,
  deleteCategory,
  saveUnit,
  deleteUnit,
  fetchBranches,
  fetchTransferRequests,
  fetchTransferRequestItems,
  createTransferRequest,
  approveTransferRequest,
  rejectTransferRequest,
  cancelTransferRequest,
  createDispatch,
  receiveDispatch,
  fetchDispatchItems,
  fetchTransferEvents,
  fetchDispatches,
  fetchStockLedger,
  fetchRecipes,
  type InventoryCategory,
  type InventoryUnit,
  type InventorySupplier,
  type InventoryMaterial,
  type InventoryPurchaseHeader,
  type InventoryPurchaseItem,
  type InventoryAdjustment,
  type InventoryWastage,
  type InventoryAuditLog,
  type InventoryAlert,
  type DashboardKPIs,
  type Branch,
  type InventoryTransferRequest,
  type InventoryTransferRequestItem,
  type InventoryDispatch,
  type InventoryDispatchItem,
  type InventoryTransferVariance,
  type InventoryTransferEvent,
  type InventoryStockLedger,
  type InventoryRecipe,
} from '@/lib/pos/inventory-service';
import RecipeManagement from '@/components/inventory/RecipeManagement';
import { getProducts, type Product } from '@/lib/pos/products-service';

// ─── LOGO ASSET LOAD ─────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-require-imports */
const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

// ─── TABS DEFINITION ─────────────────────────────────────────────────────────

type TabName =
  | 'dashboard'
  | 'materials'
  | 'purchases'
  | 'suppliers'
  | 'wastage'
  | 'transfers'
  | 'recipes'
  | 'reports'
  | 'alerts'
  | 'units'
  | 'categories'
  | 'record_purchase';

interface SidebarItem {
  id: TabName;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'materials', label: 'Inventory', icon: Boxes },
  { id: 'purchases', label: 'Purchases', icon: Truck },
  { id: 'suppliers', label: 'Suppliers', icon: User },
  { id: 'wastage', label: 'Wastage', icon: Trash2 },
  { id: 'transfers', label: 'Transfers', icon: RefreshCw },
  { id: 'recipes', label: 'Recipes', icon: BookOpen },
  { id: 'reports', label: 'Reports', icon: TrendingUp },
  { id: 'alerts', label: 'Alerts', icon: ShieldAlert },
  { id: 'units', label: 'Units', icon: Database },
  { id: 'categories', label: 'Categories', icon: Tag },
];

// ─── VISUALIZATION HELPER COMPONENTS ─────────────────────────────────────────

function SidebarDecoration() {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, opacity: 0.08, pointerEvents: 'none', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', bottom: -60, left: -30, height: 150, width: 150, borderRadius: 75, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: -30, right: -60, height: 120, width: 120, borderRadius: 60, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: 30, left: -45, height: 130, width: 130, borderRadius: 65, borderWidth: 2, borderColor: '#ffffff' }} />
    </View>
  );
}

function Sparkline({ data, strokeColor = '#0066b2', fillColor = 'rgba(51, 153, 255, 0.1)' }: { data: number[]; strokeColor?: string; fillColor?: string }) {
  if (!data || data.length < 2) return null;
  const width = 120;
  const height = 40;
  const padding = 2;
  const max = Math.max(...data) || 1;
  const min = Math.min(...data) || 0;
  const range = max - min || 1;

  const coords = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - ((val - min) / range) * (height - padding * 2) - padding;
    return { x, y };
  });

  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const cpX1 = curr.x + (next.x - curr.x) / 3;
    const cpY1 = curr.y;
    const cpX2 = curr.x + (2 * (next.x - curr.x)) / 3;
    const cpY2 = next.y;
    path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
  }

  const fillPath = `${path} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Path d={fillPath} fill={fillColor} />
      <Path d={path} fill="none" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  );
}

function CircularProgress({ percentage = 82, size = 52, strokeWidth = 5.5 }: { percentage?: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <View className="items-center justify-center relative" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#16a34a"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text className="text-[10px] font-black text-slate-800">{percentage}%</Text>
      </View>
    </View>
  );
}

function ProcurementLineChart() {
  const width = 360;
  const height = 160;
  const paddingLeft = 35;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 25;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const data = [15000, 22000, 16000, 24000, 21000, 17500];
  const maxVal = 30000;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = data.map((val, idx) => {
    const x = paddingLeft + (idx / (data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
    return { x, y };
  });

  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cpX1 = curr.x + (next.x - curr.x) / 3;
    const cpY1 = curr.y;
    const cpX2 = curr.x + (2 * (next.x - curr.x)) / 3;
    const cpY2 = next.y;
    linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
  }

  const fillPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

  return (
    <View className="w-full overflow-hidden items-center">
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <SvgLinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#3399ff" stopOpacity="0.25" />
            <Stop offset="100%" stopColor="#3399ff" stopOpacity="0.0" />
          </SvgLinearGradient>
        </Defs>

        {[0, 10000, 20000, 30000].map((yVal) => {
          const y = paddingTop + chartHeight - (yVal / maxVal) * chartHeight;
          return (
            <Path key={yVal} d={`M ${paddingLeft} ${y} L ${width - paddingRight} ${y}`} stroke="#f1f5f9" strokeWidth={1} />
          );
        })}

        <SvgText x={5} y={paddingTop + chartHeight + 3} fill="#94a3b8" fontSize="8" fontWeight="black">₹0</SvgText>
        <SvgText x={5} y={paddingTop + chartHeight - (10000 / maxVal) * chartHeight + 3} fill="#94a3b8" fontSize="8" fontWeight="black">₹10K</SvgText>
        <SvgText x={5} y={paddingTop + chartHeight - (20000 / maxVal) * chartHeight + 3} fill="#94a3b8" fontSize="8" fontWeight="black">₹20K</SvgText>
        <SvgText x={5} y={paddingTop + 3} fill="#94a3b8" fontSize="8" fontWeight="black">₹30K</SvgText>

        {months.map((m, idx) => {
          const x = paddingLeft + (idx / (data.length - 1)) * chartWidth;
          return (
            <SvgText key={idx} x={x - 8} y={height - 8} fill="#94a3b8" fontSize="9" fontWeight="black">{m}</SvgText>
          );
        })}

        <Path d={fillPath} fill="url(#chartGradient)" />
        <Path d={linePath} fill="none" stroke="#0066b2" strokeWidth={2.5} strokeLinecap="round" />

        {points.map((p, idx) => (
          <Circle key={idx} cx={p.x} cy={p.y} r={4.5} fill="#0066b2" stroke="#ffffff" strokeWidth={1.5} />
        ))}
      </Svg>
    </View>
  );
}

function WastageDonutChart({ totalLoss = 1440, spoilage = 900, expiry = 350, theft = 190 }: { totalLoss?: number; spoilage?: number; expiry?: number; theft?: number }) {
  const size = 100;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  const total = (spoilage + expiry + theft) || 1;
  const sPct = spoilage / total;
  const ePct = expiry / total;
  const tPct = theft / total;

  const sStroke = circumference * sPct;
  const eStroke = circumference * ePct;
  const tStroke = circumference * tPct;

  return (
    <View className="items-center justify-center relative" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#dc2626"
          strokeWidth={strokeWidth}
          strokeDasharray={`${sStroke} ${circumference}`}
          strokeDashoffset={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f97316"
          strokeWidth={strokeWidth}
          strokeDasharray={`${eStroke} ${circumference}`}
          strokeDashoffset={circumference - sStroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#eab308"
          strokeWidth={strokeWidth}
          strokeDasharray={`${tStroke} ${circumference}`}
          strokeDashoffset={circumference - sStroke - eStroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text className="text-[8px] font-black text-slate-400 uppercase">Total Loss</Text>
        <Text className="text-xs font-black text-slate-800">₹{totalLoss}</Text>
      </View>
    </View>
  );
}

// ─── MAIN SCREEN COMPONENT ───────────────────────────────────────────────────

export default function InventoryScreen() {
  const { width } = useWindowDimensions();
  const numColumns = width >= 768 ? 2 : 1;

  const [activeTab, setActiveTab] = useState<TabName>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMasterExpanded, setIsMasterExpanded] = useState(false);

  // ─── DATA STATES ───────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [purchases, setPurchases] = useState<InventoryPurchaseHeader[]>([]);
  const [wastages, setWastages] = useState<InventoryWastage[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [auditLogs, setAuditLogs] = useState<InventoryAuditLog[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [stockLedger, setStockLedger] = useState<InventoryStockLedger[]>([]);
  const [recipes, setRecipes] = useState<InventoryRecipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [reportsSubTab, setReportsSubTab] = useState<'valuation' | 'margins' | 'variance'>('valuation');

  // ─── FILTER STATES ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'low' | 'out' | 'expiring'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [showOnlyMyItems, setShowOnlyMyItems] = useState(false);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);

  // ─── MODAL STATES ──────────────────────────────────────────────────────────
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Partial<InventoryMaterial> | null>(null);

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<InventorySupplier> | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<InventoryCategory> | null>(null);

  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Partial<InventoryUnit> | null>(null);

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);

  // ─── CENTRAL KITCHEN & TRANSFERS STATES ─────────────────────────────────────
  const [simulatedBranchId, setSimulatedBranchId] = useState<string>(BRANCH_ID);
  const [dbBranches, setDbBranches] = useState<Branch[]>([]);
  const [transferRequests, setTransferRequests] = useState<InventoryTransferRequest[]>([]);
  const [dispatchesList, setDispatchesList] = useState<InventoryDispatch[]>([]);
  const [transferSubTab, setTransferSubTab] = useState<'requests' | 'dispatches' | 'adjustments'>('requests');
  
  // Modals for Transfers
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);

  // Forms & Details for Transfers
  const [newReqFromBranchId, setNewReqFromBranchId] = useState('');
  const [newReqRemarks, setNewReqRemarks] = useState('');
  const [newReqItems, setNewReqItems] = useState<{ material_id: string; requested_quantity: string }[]>([
    { material_id: '', requested_quantity: '' }
  ]);

  const [selectedRequest, setSelectedRequest] = useState<InventoryTransferRequest | null>(null);
  const [reqItemsList, setReqItemsList] = useState<InventoryTransferRequestItem[]>([]);
  const [approvedQuantities, setApprovedQuantities] = useState<Record<string, string>>({});
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({});
  const [approveRemarks, setApproveRemarks] = useState('');

  const [selectedDispatch, setSelectedDispatch] = useState<InventoryDispatch | null>(null);
  const [dispItemsList, setDispItemsList] = useState<InventoryDispatchItem[]>([]);
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, string>>({});
  const [receiveRemarks, setReceiveRemarks] = useState('');

  const [selectedRequestForEvents, setSelectedRequestForEvents] = useState<InventoryTransferRequest | null>(null);
  const [requestEvents, setRequestEvents] = useState<InventoryTransferEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // ─── TRANSACT BUILDING STATES ──────────────────────────────────────────────
  // New Purchase states
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseInvoiceNum, setPurchaseInvoiceNum] = useState('');
  const [purchasePaymentMode, setPurchasePaymentMode] = useState('UPI');
  const [purchaseTransportCharges, setPurchaseTransportCharges] = useState('0');
  const [purchaseRemarks, setPurchaseRemarks] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<{ material_id: string; quantity: string; unit_price: string; gst: string; unit_short_name?: string }[]>([
    { material_id: '', quantity: '', unit_price: '', gst: '0', unit_short_name: '' },
  ]);
  const [purchaseLocation, setPurchaseLocation] = useState('Dry Storage');
  const [purchaseInvoiceDate, setPurchaseInvoiceDate] = useState(new Date().toISOString().split('T')[0]);

  // Redesigned Purchase Modal Dropdown state controls
  const [isSupDropdownOpen, setIsSupDropdownOpen] = useState(false);
  const [isPayDropdownOpen, setIsPayDropdownOpen] = useState(false);
  const [isLocDropdownOpen, setIsLocDropdownOpen] = useState(false);
  const [openLineMatDropdownIdx, setOpenLineMatDropdownIdx] = useState<number | null>(null);
  const [openLineUnitDropdownIdx, setOpenLineUnitDropdownIdx] = useState<number | null>(null);
  const [openLineGstDropdownIdx, setOpenLineGstDropdownIdx] = useState<number | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // New Wastage states
  const [wastageMaterialId, setWastageMaterialId] = useState('');
  const [wastageQty, setWastageQty] = useState('');
  const [wastageReason, setWastageReason] = useState<'Expired' | 'Spoiled' | 'Kitchen Waste' | 'Damage' | 'Theft' | 'Other'>('Spoiled');
  const [wastageLocation, setWastageLocation] = useState('Dry Storage');
  const [wastageRecorder, setWastageRecorder] = useState('Chef Amit');

  // New Adjustment states
  const [adjMaterialId, setAdjMaterialId] = useState('');
  const [adjQty, setAdjQty] = useState('');
  const [adjType, setAdjType] = useState<'Add' | 'Deduct'>('Add');
  const [adjReason, setAdjReason] = useState('Physical Stock Audit');
  const [adjLocation, setAdjLocation] = useState('Dry Storage');
  const [adjRemarks, setAdjRemarks] = useState('');

  // Material Form states
  const [formMatName, setFormMatName] = useState('');
  const [formMatCode, setFormMatCode] = useState('');
  const [formMatCategory, setFormMatCategory] = useState('');
  const [formMatUnit, setFormMatUnit] = useState('');
  const [formMatReorder, setFormMatReorder] = useState('10');
  const [formMatAvgCost, setFormMatAvgCost] = useState('0');
  const [formMatOpening, setFormMatOpening] = useState('0');
  const [formMatBarcode, setFormMatBarcode] = useState('');
  const [formMatHsn, setFormMatHsn] = useState('');
  const [formMatSupplier, setFormMatSupplier] = useState('');

  // Supplier Form states
  const [formSupName, setFormSupName] = useState('');
  const [formSupCode, setFormSupCode] = useState('');
  const [formSupContact, setFormSupContact] = useState('');
  const [formSupPhone, setFormSupPhone] = useState('');
  const [formSupEmail, setFormSupEmail] = useState('');
  const [formSupGst, setFormSupGst] = useState('');
  const [formSupTerms, setFormSupTerms] = useState('Net 15');
  const [formSupNotes, setFormSupNotes] = useState('');

  // Category Form states
  const [formCatName, setFormCatName] = useState('');
  const [formCatCode, setFormCatCode] = useState('');
  const [formCatDesc, setFormCatDesc] = useState('');

  // Unit Form states
  const [formUnitName, setFormUnitName] = useState('');
  const [formUnitCode, setFormUnitCode] = useState('');
  const [formUnitShort, setFormUnitShort] = useState('');

  // Purchase list view state
  const [purSearchQuery, setPurSearchQuery] = useState('');
  const [purStatusFilter, setPurStatusFilter] = useState<'all' | 'Paid' | 'Pending' | 'Overdue'>('all');
  const [purPage, setPurPage] = useState(1);
  const [purPageSize, setPurPageSize] = useState(10);
  const [purOpenActionIdx, setPurOpenActionIdx] = useState<string | null>(null);
  const [purMenuY, setPurMenuY] = useState(0);
  const [purDetailItem, setPurDetailItem] = useState<InventoryPurchaseHeader | null>(null);
  const [purDetailLines, setPurDetailLines] = useState<InventoryPurchaseItem[]>([]);
  const [purDetailLoading, setPurDetailLoading] = useState(false);

  // ─── DATA LOADER ───────────────────────────────────────────────────────────

  const loadAllData = async (silent = false, targetBranchId = simulatedBranchId) => {
    if (!silent) setIsLoading(true);
    setErrorMsg(null);
    try {
      initializeLocalSeeder();

      const [
        kpiRes,
        matRes,
        catRes,
        unitRes,
        supRes,
        purRes,
        wstRes,
        adjRes,
        audRes,
        alrtRes,
        branchRes,
        reqRes,
        dispRes,
        ledgerRes,
        recipesRes,
        prodsRes
      ] = await Promise.all([
        fetchInventoryDashboardKPIs(),
        fetchMaterials(targetBranchId),
        fetchCategories(),
        fetchUnits(),
        fetchSuppliers(),
        fetchPurchases(),
        fetchWastage(),
        fetchAdjustments(),
        fetchAuditLogs(),
        fetchAlerts(),
        fetchBranches(),
        fetchTransferRequests(targetBranchId),
        fetchDispatches(targetBranchId),
        fetchStockLedger(),
        fetchRecipes(),
        getProducts()
      ]);

      if (kpiRes.data) setKpis(kpiRes.data);
      if (matRes.data) setMaterials(matRes.data);
      if (catRes.data) setCategories(catRes.data);
      if (unitRes.data) setUnits(unitRes.data);
      if (supRes.data) setSuppliers(supRes.data);
      if (purRes.data) setPurchases(purRes.data);
      if (wstRes.data) setWastages(wstRes.data);
      if (adjRes.data) setAdjustments(adjRes.data);
      if (audRes.data) setAuditLogs(audRes.data);
      if (alrtRes.data) setAlerts(alrtRes.data);
      if (branchRes.data) setDbBranches(branchRes.data);
      if (reqRes.data) setTransferRequests(reqRes.data);
      if (dispRes.data) setDispatchesList(dispRes.data);
      if (ledgerRes.data) setStockLedger(ledgerRes.data);
      if (recipesRes.data) setRecipes(recipesRes.data);
      if (prodsRes.data) setProducts(prodsRes.data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to fetch inventory records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData(false, simulatedBranchId);
  }, [simulatedBranchId]);

  useEffect(() => {
    if (['materials', 'suppliers', 'units', 'categories'].includes(activeTab)) {
      setIsMasterExpanded(true);
    }
  }, [activeTab]);

  // ─── FILTERS ───────────────────────────────────────────────────────────────

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchSearch =
        m.material_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.material_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.barcode && m.barcode.includes(searchQuery));
      const matchCat = selectedCategoryFilter === 'all' || m.category_id === selectedCategoryFilter;
      
      // Status Filter
      const isOut = m.current_stock === 0;
      const isLow = m.current_stock > 0 && m.current_stock <= m.reorder_level;
      const isHealthy = m.current_stock > m.reorder_level;
      const isExpiringSoon = m.current_stock > 0 && m.current_stock <= m.reorder_level * 0.6;
      
      let matchStatus = true;
      if (statusFilter === 'healthy') matchStatus = isHealthy;
      else if (statusFilter === 'low') matchStatus = isLow;
      else if (statusFilter === 'out') matchStatus = isOut;
      else if (statusFilter === 'expiring') matchStatus = isExpiringSoon;

      // Location Filter
      const itemLocation = m.category_name === 'Raw Meats' ? 'Freezer' : 'Dry Storage';
      const matchLocation = locationFilter === 'all' || itemLocation === locationFilter;

      // My Items Filter (mocked using preferred supplier ID or code check)
      const matchMyItems = !showOnlyMyItems || (m.preferred_supplier_id === 'sup-00000000-0000-0000-0000-000000000001');

      return matchSearch && matchCat && matchStatus && matchLocation && matchMyItems;
    });
  }, [materials, searchQuery, selectedCategoryFilter, statusFilter, locationFilter, showOnlyMyItems]);

  const lowStockMaterials = useMemo(() => {
    return materials.filter((m) => m.current_stock <= m.reorder_level && m.current_stock > 0);
  }, [materials]);

  // ─── ACTION HANDLERS ───────────────────────────────────────────────────────

  const handleOpenMaterialModal = (material?: InventoryMaterial) => {
    setModalError(null);
    if (material) {
      setEditingMaterial(material);
      setFormMatName(material.material_name);
      setFormMatCode(material.material_code);
      setFormMatCategory(material.category_id || '');
      setFormMatUnit(material.inventory_unit_id || '');
      setFormMatReorder(String(material.reorder_level));
      setFormMatAvgCost(String(material.average_cost));
      setFormMatOpening(String(material.opening_stock));
      setFormMatBarcode(material.barcode || '');
      setFormMatHsn(material.hsn_code || '');
      setFormMatSupplier(material.preferred_supplier_id || '');
    } else {
      setEditingMaterial(null);
      setFormMatName('');
      setFormMatCode('');
      setFormMatCategory(categories[0]?.id || '');
      setFormMatUnit(units[0]?.id || '');
      setFormMatReorder('10');
      setFormMatAvgCost('0');
      setFormMatOpening('0');
      setFormMatBarcode('');
      setFormMatHsn('');
      setFormMatSupplier(suppliers[0]?.id || '');
    }
    setIsMaterialModalOpen(true);
  };

  const handleSaveMaterial = async () => {
    if (!formMatName.trim()) {
      setModalError('Material Name is required.');
      return;
    }
    if (!formMatCode.trim()) {
      setModalError('Material Code is required.');
      return;
    }
    if (!formMatCategory) {
      setModalError('Please select a Category.');
      return;
    }
    if (!formMatUnit) {
      setModalError('Please select a Unit of Measurement.');
      return;
    }
    if (!formMatReorder.trim() || isNaN(Number(formMatReorder)) || Number(formMatReorder) < 0) {
      setModalError('Reorder Level must be a valid non-negative number.');
      return;
    }
    if (!formMatOpening.trim() || isNaN(Number(formMatOpening)) || Number(formMatOpening) < 0) {
      setModalError('Opening Stock must be a valid non-negative number.');
      return;
    }
    if (!formMatAvgCost.trim() || isNaN(Number(formMatAvgCost)) || Number(formMatAvgCost) < 0) {
      setModalError('Average Unit Cost must be a valid non-negative number.');
      return;
    }

    setModalError(null);
    setIsLoading(true);
    try {
      const payload: Partial<InventoryMaterial> = {
        id: editingMaterial?.id,
        material_name: formMatName,
        material_code: formMatCode || editingMaterial?.material_code,
        category_id: formMatCategory,
        inventory_unit_id: formMatUnit,
        reorder_level: Number(formMatReorder) || 0,
        average_cost: Number(formMatAvgCost) || 0,
        opening_stock: Number(formMatOpening) || 0,
        current_stock: editingMaterial ? editingMaterial.current_stock : Number(formMatOpening),
        barcode: formMatBarcode || null,
        hsn_code: formMatHsn || null,
        preferred_supplier_id: formMatSupplier || null,
      };
      const res = await saveMaterial(payload);
      if (res.error) throw new Error(res.error);
      setIsMaterialModalOpen(false);
      await loadAllData(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save material.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMaterialItem = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteMaterial(id);
      await loadAllData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenSupplierModal = (supplier?: InventorySupplier) => {
    setModalError(null);
    if (supplier) {
      setEditingSupplier(supplier);
      setFormSupName(supplier.supplier_name);
      setFormSupCode(supplier.supplier_code);
      setFormSupContact(supplier.contact_person || '');
      setFormSupPhone(supplier.phone);
      setFormSupEmail(supplier.email || '');
      setFormSupGst(supplier.gst_number || '');
      setFormSupTerms(supplier.payment_terms || 'Net 15');
      setFormSupNotes(supplier.notes || '');
    } else {
      setEditingSupplier(null);
      setFormSupName('');
      setFormSupCode('');
      setFormSupContact('');
      setFormSupPhone('');
      setFormSupEmail('');
      setFormSupGst('');
      setFormSupTerms('Net 15');
      setFormSupNotes('');
    }
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (!formSupName.trim()) {
      setModalError('Supplier Legal Name is required.');
      return;
    }
    if (!formSupCode.trim()) {
      setModalError('Supplier Code is required.');
      return;
    }
    if (!formSupPhone.trim()) {
      setModalError('Phone Number is required.');
      return;
    }

    setModalError(null);
    setIsLoading(true);
    try {
      const payload: Partial<InventorySupplier> = {
        id: editingSupplier?.id,
        supplier_name: formSupName,
        supplier_code: formSupCode || editingSupplier?.supplier_code,
        contact_person: formSupContact || null,
        phone: formSupPhone,
        email: formSupEmail || null,
        gst_number: formSupGst || null,
        payment_terms: formSupTerms,
        notes: formSupNotes || null,
      };
      const res = await saveSupplier(payload);
      if (res.error) throw new Error(res.error);
      setIsSupplierModalOpen(false);
      await loadAllData(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save supplier.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSupplierItem = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteSupplier(id);
      await loadAllData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCategoryModal = (category?: InventoryCategory) => {
    setModalError(null);
    if (category) {
      setEditingCategory(category);
      setFormCatName(category.category_name);
      setFormCatCode(category.category_code);
      setFormCatDesc(category.description || '');
    } else {
      setEditingCategory(null);
      setFormCatName('');
      setFormCatCode('');
      setFormCatDesc('');
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!formCatName.trim()) {
      setModalError('Category Name is required.');
      return;
    }
    if (!formCatCode.trim()) {
      setModalError('Category Code is required.');
      return;
    }

    setModalError(null);
    setIsLoading(true);
    try {
      const payload: Partial<InventoryCategory> = {
        id: editingCategory?.id,
        category_name: formCatName,
        category_code: formCatCode || editingCategory?.category_code,
        description: formCatDesc || null,
      };
      const res = await saveCategory(payload);
      if (res.error) throw new Error(res.error);
      setIsCategoryModalOpen(false);
      await loadAllData(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save category.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategoryItem = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteCategory(id);
      await loadAllData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenUnitModal = (unit?: InventoryUnit) => {
    setModalError(null);
    if (unit) {
      setEditingUnit(unit);
      setFormUnitName(unit.unit_name);
      setFormUnitCode(unit.unit_code);
      setFormUnitShort(unit.short_name);
    } else {
      setEditingUnit(null);
      setFormUnitName('');
      setFormUnitCode('');
      setFormUnitShort('');
    }
    setIsUnitModalOpen(true);
  };

  const handleSaveUnit = async () => {
    if (!formUnitName.trim()) {
      setModalError('Unit Name is required.');
      return;
    }
    if (!formUnitCode.trim()) {
      setModalError('Unit Code is required.');
      return;
    }
    if (!formUnitShort.trim()) {
      setModalError('Short Display Name is required.');
      return;
    }

    setModalError(null);
    setIsLoading(true);
    try {
      const payload: Partial<InventoryUnit> = {
        id: editingUnit?.id,
        unit_name: formUnitName,
        unit_code: formUnitCode || editingUnit?.unit_code,
        short_name: formUnitShort || editingUnit?.short_name,
        is_active: true,
      };
      const res = await saveUnit(payload);
      if (res.error) throw new Error(res.error);
      setIsUnitModalOpen(false);
      await loadAllData(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save unit.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUnitItem = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteUnit(id);
      await loadAllData(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPurchaseModal = () => {
    setModalError(null);
    setPurchaseSupplierId('');
    setPurchaseInvoiceNum('');
    setPurchaseItems([{ material_id: '', quantity: '', unit_price: '', gst: '0', unit_short_name: '' }]);
    setPurchaseTransportCharges('0');
    setPurchaseRemarks('');
    setPurchaseInvoiceDate(new Date().toISOString().split('T')[0]);
    setActiveTab('record_purchase');
    setIsSupDropdownOpen(false);
    setIsPayDropdownOpen(false);
    setIsLocDropdownOpen(false);
    setOpenLineMatDropdownIdx(null);
    setOpenLineUnitDropdownIdx(null);
    setOpenLineGstDropdownIdx(null);
    setCalendarDate(new Date());
    setIsCalendarOpen(false);
  };

  const handleOpenWastageModal = () => {
    setModalError(null);
    setWastageMaterialId('');
    setWastageQty('');
    setIsWastageModalOpen(true);
  };

  const handleOpenAdjustmentModal = () => {
    setModalError(null);
    setAdjMaterialId('');
    setAdjQty('');
    setAdjRemarks('');
    setIsAdjustmentModalOpen(true);
  };

  // ─── INTERNAL TRANSFERS HANDLERS ───────────────────────────────────────────

  const handleOpenNewRequestModal = () => {
    setModalError(null);
    const ckBranch = dbBranches.find(b => b.branch_type === 'CENTRAL_KITCHEN' || b.branch_type === 'WAREHOUSE');
    setNewReqFromBranchId(ckBranch ? ckBranch.id : '');
    setNewReqRemarks('');
    setNewReqItems([{ material_id: materials[0]?.id || '', requested_quantity: '' }]);
    setIsNewRequestModalOpen(true);
  };

  const handleAddRequestItemRow = () => {
    setNewReqItems([...newReqItems, { material_id: materials[0]?.id || '', requested_quantity: '' }]);
  };

  const handleRemoveRequestItemRow = (index: number) => {
    if (newReqItems.length > 1) {
      setNewReqItems(newReqItems.filter((_, i) => i !== index));
    }
  };

  const handleRequestItemChange = (index: number, field: 'material_id' | 'requested_quantity', value: string) => {
    const next = [...newReqItems];
    next[index][field] = value;
    setNewReqItems(next);
  };

  const handleSaveTransferRequest = async () => {
    if (!newReqFromBranchId) {
      Alert.alert('Error', 'Please select supplying branch.');
      return;
    }
    const validItems = newReqItems.filter(itm => itm.material_id && Number(itm.requested_quantity) > 0);
    if (validItems.length === 0) {
      Alert.alert('Error', 'Please add at least one material with quantity > 0.');
      return;
    }

    setIsLoading(true);
    try {
      const itemsPayload = validItems.map(itm => ({
        material_id: itm.material_id,
        requested_quantity: Number(itm.requested_quantity)
      }));

      const res = await createTransferRequest(
        newReqFromBranchId,
        simulatedBranchId,
        itemsPayload,
        newReqRemarks
      );

      if (res.error) throw new Error(res.error);
      setIsNewRequestModalOpen(false);
      Alert.alert('Success', 'Transfer request created successfully.');
      await loadAllData(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenApprovalModal = async (req: InventoryTransferRequest) => {
    setModalError(null);
    setSelectedRequest(req);
    setApproveRemarks('');
    setIsLoading(true);
    try {
      const res = await fetchTransferRequestItems(req.id);
      if (res.error) throw new Error(res.error);
      const items = res.data || [];
      setReqItemsList(items);

      const initialApproved: Record<string, string> = {};
      const initialDispatch: Record<string, string> = {};
      
      items.forEach(itm => {
        initialApproved[itm.material_id] = String(itm.approved_quantity || itm.requested_quantity);
        initialDispatch[itm.material_id] = String(itm.approved_quantity || itm.requested_quantity);
      });

      setApprovedQuantities(initialApproved);
      setDispatchQuantities(initialDispatch);
      setIsApprovalModalOpen(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load request items.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessApproval = async () => {
    if (!selectedRequest) return;
    const itemsPayload = reqItemsList.map(itm => ({
      material_id: itm.material_id,
      approved_quantity: Number(approvedQuantities[itm.material_id]) || 0
    }));

    setIsLoading(true);
    try {
      const res = await approveTransferRequest(selectedRequest.id, itemsPayload, 'Central Kitchen Staff');
      if (res.error) throw new Error(res.error);
      setIsApprovalModalOpen(false);
      Alert.alert('Success', 'Transfer request approved.');
      await loadAllData(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to approve request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessRejection = async () => {
    if (!selectedRequest) return;
    setIsLoading(true);
    try {
      const res = await rejectTransferRequest(selectedRequest.id, 'Central Kitchen Staff', approveRemarks);
      if (res.error) throw new Error(res.error);
      setIsApprovalModalOpen(false);
      Alert.alert('Success', 'Transfer request rejected.');
      await loadAllData(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reject request.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessCancelRequest = async (requestId: string) => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this transfer request? Any stock reservations will be released.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const res = await cancelTransferRequest(requestId, 'Branch Staff', 'Cancelled by requesting branch.');
              if (res.error) throw new Error(res.error);
              Alert.alert('Success', 'Transfer request cancelled successfully.');
              await loadAllData(true);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel request.');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleProcessDispatch = async () => {
    if (!selectedRequest) return;
    const itemsPayload = reqItemsList.map(itm => ({
      material_id: itm.material_id,
      dispatched_quantity: Number(dispatchQuantities[itm.material_id]) || 0
    })).filter(itm => itm.dispatched_quantity > 0);

    if (itemsPayload.length === 0) {
      Alert.alert('Error', 'Please dispatch at least one item with quantity > 0.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await createDispatch(selectedRequest.id, itemsPayload, approveRemarks, 'Central Kitchen Staff');
      if (res.error) throw new Error(res.error);
      setIsApprovalModalOpen(false);
      Alert.alert('Success', 'Stock dispatch shipment created.');
      await loadAllData(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to dispatch shipment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReceiveModal = async (disp: InventoryDispatch) => {
    setModalError(null);
    setSelectedDispatch(disp);
    setReceiveRemarks('');
    setIsLoading(true);
    try {
      const res = await fetchDispatchItems(disp.id);
      if (res.error) throw new Error(res.error);
      const items = res.data || [];
      setDispItemsList(items);

      const initialReceived: Record<string, string> = {};
      items.forEach(itm => {
        initialReceived[itm.id] = String(itm.dispatched_quantity);
      });
      setReceivedQuantities(initialReceived);
      setIsReceiveModalOpen(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load dispatch items.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessReceive = async () => {
    if (!selectedDispatch) return;
    const itemsPayload = dispItemsList.map(itm => ({
      id: itm.id,
      material_id: itm.material_id,
      dispatched_quantity: itm.dispatched_quantity,
      received_quantity: Number(receivedQuantities[itm.id]) ?? itm.dispatched_quantity
    }));

    setIsLoading(true);
    try {
      const res = await receiveDispatch(selectedDispatch.id, itemsPayload, receiveRemarks, 'Branch Staff');
      if (res.error) throw new Error(res.error);
      setIsReceiveModalOpen(false);
      Alert.alert('Success', 'Shipment receipt recorded and ledger updated.');
      await loadAllData(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to record shipment receipt.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEventsModal = async (req: InventoryTransferRequest) => {
    setSelectedRequestForEvents(req);
    setRequestEvents([]);
    setEventsLoading(true);
    setIsEventsModalOpen(true);
    try {
      const res = await fetchTransferEvents(req.id);
      if (res.error) throw new Error(res.error);
      setRequestEvents(res.data || []);
    } catch (err: any) {
      console.error('Failed to load events', err);
    } finally {
      setEventsLoading(false);
    }
  };

  const handleRecordPurchase = async () => {
    if (!purchaseSupplierId) {
      setModalError('Please select a Supplier.');
      return;
    }
    if (!purchaseInvoiceNum.trim()) {
      setModalError('Invoice / Bill Number is required.');
      return;
    }
    if (!purchasePaymentMode) {
      setModalError('Please select a Payment Mode.');
      return;
    }

    const invalidItems = purchaseItems.some(
      (itm) =>
        !itm.material_id ||
        !itm.quantity ||
        isNaN(Number(itm.quantity)) ||
        Number(itm.quantity) <= 0 ||
        !itm.unit_price ||
        isNaN(Number(itm.unit_price)) ||
        Number(itm.unit_price) <= 0
    );

    if (invalidItems) {
      setModalError('Please enter valid Raw Material, Quantity (> 0), and Unit Price (> 0) for all items.');
      return;
    }

    setModalError(null);
    setIsLoading(true);
    try {
      const subtotal = purchaseItems.reduce((acc, itm) => acc + Number(itm.quantity) * Number(itm.unit_price), 0);
      const tax_amount = purchaseItems.reduce((acc, itm) => acc + (Number(itm.quantity) * Number(itm.unit_price) * (Number(itm.gst || '0') / 100)), 0);
      const freight = Number(purchaseTransportCharges) || 0;
      const grand_total = subtotal + tax_amount + freight;

      const headerPayload = {
        purchase_date: new Date(purchaseInvoiceDate).toISOString(),
        supplier_id: purchaseSupplierId,
        invoice_number: purchaseInvoiceNum || null,
        invoice_date: new Date(purchaseInvoiceDate).toISOString(),
        payment_mode: purchasePaymentMode,
        subtotal: subtotal,
        discount_amount: 0,
        tax_amount: tax_amount,
        transport_charges: freight,
        other_charges: 0,
        grand_total: grand_total,
        invoice_file_url: purchaseInvoiceNum ? `https://supabase.storage/invoice/${purchaseInvoiceNum}.pdf` : null,
        remarks: purchaseRemarks || null,
        created_by: 'Owner Staff',
      };

      const finalItems = purchaseItems
        .filter((itm) => itm.material_id && Number(itm.quantity) > 0)
        .map((itm) => ({
          material_id: itm.material_id,
          quantity: Number(itm.quantity),
          unit_price: Number(itm.unit_price),
          line_total: Number(itm.quantity) * Number(itm.unit_price) * (1 + (Number(itm.gst || '0') / 100)),
        }));

      const res = await createPurchase(headerPayload, finalItems, purchaseLocation);
      if (res.error) throw new Error(res.error);
      setActiveTab('purchases');
      setPurchaseSupplierId('');
      setPurchaseItems([{ material_id: '', quantity: '', unit_price: '', gst: '0', unit_short_name: '' }]);
      setPurchaseRemarks('');
      setPurchaseInvoiceNum('');
      setPurchaseTransportCharges('0');
      setPurchaseInvoiceDate(new Date().toISOString().split('T')[0]);
      await loadAllData(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to record purchase.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordWastage = async () => {
    if (!wastageMaterialId) {
      setModalError('Please choose a Raw Ingredient.');
      return;
    }
    if (!wastageQty.trim() || isNaN(Number(wastageQty)) || Number(wastageQty) <= 0) {
      setModalError('Quantity Lost must be a valid number greater than 0.');
      return;
    }
    if (!wastageReason) {
      setModalError('Please select a Wastage Reason.');
      return;
    }

    setModalError(null);
    setIsLoading(true);
    try {
      const payload = {
        material_id: wastageMaterialId,
        quantity: Number(wastageQty),
        reason: wastageReason,
        location_id: wastageLocation,
        recorded_by: wastageRecorder,
      };
      const res = await createWastage(payload);
      if (res.error) throw new Error(res.error);
      setIsWastageModalOpen(false);
      setWastageMaterialId('');
      setWastageQty('');
      await loadAllData(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to record wastage.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordAdjustment = async () => {
    if (!adjMaterialId) {
      setModalError('Please choose a Raw Ingredient.');
      return;
    }
    if (!adjType) {
      setModalError('Please select an Adjustment Type.');
      return;
    }
    if (!adjQty.trim() || isNaN(Number(adjQty)) || Number(adjQty) <= 0) {
      setModalError('Quantity must be a valid number greater than 0.');
      return;
    }
    if (!adjReason.trim()) {
      setModalError('Audit / Adjust Reason is required.');
      return;
    }

    setModalError(null);
    setIsLoading(true);
    try {
      const payload = {
        material_id: adjMaterialId,
        quantity: Number(adjQty),
        adjustment_type: adjType,
        reason: adjReason,
        location_id: adjLocation,
        remarks: adjRemarks || null,
        created_by: 'Owner Staff',
        adjustment_date: new Date().toISOString(),
      };
      const res = await createAdjustment(payload);
      if (res.error) throw new Error(res.error);
      setIsAdjustmentModalOpen(false);
      setAdjMaterialId('');
      setAdjQty('');
      setAdjRemarks('');
      await loadAllData(true);
    } catch (err: any) {
      setModalError(err.message || 'Failed to record adjustment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAlert = async (id: string) => {
    await markAlertRead(id);
    await loadAllData(true);
  };

  const handleAddPurchaseLine = () => {
    setPurchaseItems([...purchaseItems, { material_id: '', quantity: '', unit_price: '', gst: '0', unit_short_name: '' }]);
  };

  const handleUpdatePurchaseLine = (idx: number, key: string, value: string) => {
    const next = [...purchaseItems];
    next[idx] = { ...next[idx], [key]: value };
    setPurchaseItems(next);
  };

  const handleUpdatePurchaseLineMulti = (idx: number, fields: Partial<{ material_id: string; quantity: string; unit_price: string; gst: string; unit_short_name: string }>) => {
    const next = [...purchaseItems];
    next[idx] = { ...next[idx], ...fields };
    setPurchaseItems(next);
  };

  const handleRemovePurchaseLine = (idx: number) => {
    if (purchaseItems.length === 1) {
      setPurchaseItems([{ material_id: '', quantity: '', unit_price: '', gst: '0', unit_short_name: '' }]);
      return;
    }
    setPurchaseItems(purchaseItems.filter((_, i) => i !== idx));
  };

  // ─── TAB RENDER VIEWS ──────────────────────────────────────────────────────

  const renderDashboard = () => {
    const activeHealth = kpis ? Math.round(100 - (kpis.lowStockCount / (kpis.totalMaterials || 1)) * 100) : 82;

    return (
      <View className="flex-col gap-6">
        <View className="flex-row flex-wrap justify-between gap-4">
          <View className="flex-1 min-w-[220px] bg-white border border-slate-200/80 rounded-3xl p-5 flex-row items-center justify-between shadow-sm">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-8 h-8 rounded-lg bg-blue-50 items-center justify-center">
                  <Boxes size={16} color="#0066b2" />
                </View>
                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Inventory Value</Text>
              </View>
              <Text className="text-2xl font-black text-slate-800 leading-none">
                ₹{kpis ? kpis.inventoryValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '21,285'}
              </Text>
              <Text className="text-[9.5px] text-emerald-600 font-bold mt-2">↑ 12.4% vs last month</Text>
            </View>
            <Sparkline data={[18000, 19500, 17200, 20500, 21285]} strokeColor="#0066b2" />
          </View>

          <View className="flex-1 min-w-[220px] bg-white border border-slate-200/80 rounded-3xl p-5 flex-row items-center justify-between shadow-sm">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-8 h-8 rounded-lg bg-emerald-50 items-center justify-center">
                  <Heart size={16} color="#16a34a" />
                </View>
                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Inventory Health</Text>
              </View>
              <Text className="text-2xl font-black text-slate-800 leading-none">{activeHealth}% Good</Text>
              <Text className="text-[9.5px] text-emerald-600 font-bold mt-2">Good</Text>
            </View>
            <CircularProgress percentage={activeHealth} />
          </View>

          <View className="flex-1 min-w-[220px] bg-white border border-slate-200/80 rounded-3xl p-5 flex-row items-center justify-between shadow-sm">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-8 h-8 rounded-lg bg-amber-50 items-center justify-center">
                  <AlertTriangle size={16} color="#d97706" />
                </View>
                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Wastage</Text>
              </View>
              <Text className="text-2xl font-black text-slate-800 leading-none">
                ₹{kpis ? kpis.wastageCostImpactThisMonth.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '1,440'}
              </Text>
              <Text className="text-[9.5px] text-rose-500 font-bold mt-2">6.7% of purchases</Text>
            </View>
            <Sparkline data={[1200, 1500, 950, 1600, 1440]} strokeColor="#f97316" fillColor="rgba(249, 115, 22, 0.1)" />
          </View>

          <View className="flex-1 min-w-[220px] bg-white border border-slate-200/80 rounded-3xl p-5 flex-row items-center justify-between shadow-sm">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-8 h-8 rounded-lg bg-purple-50 items-center justify-center">
                  <TrendingUp size={16} color="#8b5cf6" />
                </View>
                <Text className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Procurement</Text>
              </View>
              <Text className="text-2xl font-black text-slate-800 leading-none">
                ₹{kpis ? kpis.monthlyPurchasesThisMonth.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '22,950'}
              </Text>
              <Text className="text-[9.5px] text-slate-400 font-bold mt-2">Last purchase: 3 days ago</Text>
            </View>
            <Sparkline data={[19000, 25000, 18500, 24000, 22950]} strokeColor="#8b5cf6" fillColor="rgba(139, 92, 246, 0.1)" />
          </View>
        </View>

        <View className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
          <Text className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Quick Actions</Text>
          <View className="flex-row flex-wrap gap-3">
            <Pressable
              onPress={handleOpenPurchaseModal}
              className="flex-row items-center px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/50 active:scale-95 transition-all"
            >
              <Plus size={14} color="#0066b2" className="mr-1.5" />
              <Text className="text-xs font-bold text-[#0066b2]">+ Add Purchase</Text>
            </Pressable>

            <Pressable
              onPress={handleOpenAdjustmentModal}
              className="flex-row items-center px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 active:scale-95 transition-all"
            >
              <Plus size={14} color="#16a34a" className="mr-1.5" />
              <Text className="text-xs font-bold text-emerald-700">+ Add Stock</Text>
            </Pressable>

            <Pressable
              onPress={handleOpenWastageModal}
              className="flex-row items-center px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100/50 active:scale-95 transition-all"
            >
              <Trash2 size={14} color="#dc2626" className="mr-1.5" />
              <Text className="text-xs font-bold text-rose-700">Record Wastage</Text>
            </Pressable>

            <Pressable
              onPress={() => handleOpenSupplierModal()}
              className="flex-row items-center px-4 py-2.5 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-100/50 active:scale-95 transition-all"
            >
              <User size={14} color="#7c3aed" className="mr-1.5" />
              <Text className="text-xs font-bold text-purple-700">Add Supplier</Text>
            </Pressable>

            <Pressable
              onPress={() => alert('Exported successfully!')}
              className="flex-row items-center px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 active:scale-95 transition-all"
            >
              <FileText size={14} color="#475569" className="mr-1.5" />
              <Text className="text-xs font-bold text-slate-700">Export Report</Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-row flex-wrap justify-between gap-6">
          <View className="flex-1 min-w-[320px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-row items-center gap-2">
                <Text className="text-xs font-black text-slate-800 uppercase tracking-wider">Low Stock Items</Text>
                <View className="bg-amber-100 rounded px-1.5 py-0.5">
                  <Text className="text-[9px] font-extrabold text-amber-700">{lowStockMaterials.length}</Text>
                </View>
              </View>
              <Pressable onPress={() => setActiveTab('materials')}>
                <Text className="text-xs font-bold text-blue-600">View all</Text>
              </Pressable>
            </View>

            {lowStockMaterials.length === 0 ? (
              <View className="py-8 items-center justify-center">
                <Check size={32} color="#16a34a" className="mb-2" />
                <Text className="text-xs font-bold text-slate-500">All materials healthy!</Text>
              </View>
            ) : (
              <View className="gap-2.5">
                <View className="flex-row border-b border-slate-100 pb-1.5">
                  <Text className="flex-1 text-[9.5px] font-black text-slate-400 uppercase">Item</Text>
                  <Text className="w-16 text-right text-[9.5px] font-black text-slate-400 uppercase">Stock</Text>
                  <Text className="w-16 text-right text-[9.5px] font-black text-slate-400 uppercase">Min</Text>
                  <Text className="w-12 text-center text-[9.5px] font-black text-slate-400 uppercase">Unit</Text>
                  <Text className="w-16 text-center text-[9.5px] font-black text-slate-400 uppercase">Action</Text>
                </View>

                {lowStockMaterials.slice(0, 3).map((item) => (
                  <View key={item.id} className="flex-row items-center py-1">
                    <Text className="flex-1 text-xs font-black text-slate-700">{item.material_name}</Text>
                    <Text className="w-16 text-right text-xs font-bold text-red-600">{item.current_stock}</Text>
                    <Text className="w-16 text-right text-xs font-bold text-slate-500">{item.reorder_level}</Text>
                    <Text className="w-12 text-center text-xs font-semibold text-slate-400">{item.unit_short_name || 'ea'}</Text>
                    <Pressable
                      onPress={handleOpenPurchaseModal}
                      className="w-16 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 items-center justify-center active:scale-95"
                    >
                      <Text className="text-[9px] font-bold text-amber-700 uppercase">Reorder</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => setActiveTab('materials')}
              className="border-t border-slate-100 pt-3 mt-4 flex-row items-center justify-center gap-1"
            >
              <Text className="text-xs font-bold text-slate-500">View all low stock items</Text>
              <ChevronRight size={14} color="#64748b" />
            </Pressable>
          </View>

          <View className="flex-1 min-w-[320px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xs font-black text-slate-800 uppercase tracking-wider">Procurement Trend</Text>
              <View className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
                <Text className="text-[10px] font-bold text-slate-500">This Month</Text>
              </View>
            </View>
            <ProcurementLineChart />
          </View>

          <View className="flex-1 min-w-[320px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xs font-black text-slate-800 uppercase tracking-wider">Wastage Breakdown</Text>
              <View className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
                <Text className="text-[10px] font-bold text-slate-500">This Month</Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between pt-2">
              <WastageDonutChart
                totalLoss={kpis ? kpis.wastageCostImpactThisMonth : 1440}
                spoilage={kpis ? Math.round(kpis.wastageCostImpactThisMonth * 0.625) : 900}
                expiry={kpis ? Math.round(kpis.wastageCostImpactThisMonth * 0.243) : 350}
                theft={kpis ? Math.round(kpis.wastageCostImpactThisMonth * 0.132) : 190}
              />
              <View className="flex-1 pl-6 gap-2">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2.5 h-2.5 rounded-full bg-red-600" />
                    <Text className="text-[11px] font-bold text-slate-500">Spoilage</Text>
                  </View>
                  <Text className="text-[11px] font-black text-slate-700">
                    ₹{kpis ? Math.round(kpis.wastageCostImpactThisMonth * 0.625) : 900} (62.5%)
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    <Text className="text-[11px] font-bold text-slate-500">Expiry</Text>
                  </View>
                  <Text className="text-[11px] font-black text-slate-700">
                    ₹{kpis ? Math.round(kpis.wastageCostImpactThisMonth * 0.243) : 350} (24.3%)
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <Text className="text-[11px] font-bold text-slate-500">Theft</Text>
                  </View>
                  <Text className="text-[11px] font-black text-slate-700">
                    ₹{kpis ? Math.round(kpis.wastageCostImpactThisMonth * 0.132) : 190} (13.2%)
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="flex-row flex-wrap justify-between gap-6 mb-6">
          <View className="flex-1 min-w-[280px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
            <Text className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Inventory Activity (Today)</Text>
            <View className="flex-row justify-between">
              <View className="items-center flex-1">
                <View className="w-9 h-9 rounded-full bg-emerald-50 items-center justify-center mb-2">
                  <ArrowUp size={16} color="#10b981" />
                </View>
                <Text className="text-[9.5px] font-bold text-slate-400 uppercase">Purchased</Text>
                <Text className="text-sm font-black text-slate-800 mt-1">₹4,200</Text>
                <Text className="text-[10px] text-slate-400">3 Bills</Text>
              </View>
              <View className="items-center flex-1 border-x border-slate-100">
                <View className="w-9 h-9 rounded-full bg-blue-50 items-center justify-center mb-2">
                  <ArrowDown size={16} color="#3b82f6" />
                </View>
                <Text className="text-[9.5px] font-bold text-slate-400 uppercase">Consumed</Text>
                <Text className="text-sm font-black text-slate-800 mt-1">₹3,100</Text>
                <Text className="text-[10px] text-slate-400">12 Items</Text>
              </View>
              <View className="items-center flex-1">
                <View className="w-9 h-9 rounded-full bg-rose-50 items-center justify-center mb-2">
                  <AlertTriangle size={16} color="#ef4444" />
                </View>
                <Text className="text-[9.5px] font-bold text-slate-400 uppercase">Wastage</Text>
                <Text className="text-sm font-black text-slate-800 mt-1">₹250</Text>
                <Text className="text-[10px] text-slate-400">2 Entries</Text>
              </View>
            </View>
          </View>

          <View className="flex-1 min-w-[280px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xs font-black text-slate-800 uppercase tracking-wider">Recent Activity</Text>
              <Pressable onPress={() => setActiveTab('alerts')}>
                <Text className="text-xs font-bold text-blue-600">View all</Text>
              </Pressable>
            </View>
            <View className="gap-3">
              <View className="flex-row items-start gap-3">
                <View className="w-7 h-7 rounded-full bg-emerald-50 items-center justify-center mt-0.5">
                  <Truck size={13} color="#10b981" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-700 leading-tight">Purchase received from Al Wadi Foods</Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">20 kg Chicken, 10 L Oil, 5 kg Rice</Text>
                </View>
                <Text className="text-[9px] text-slate-400 font-bold">10:42 AM</Text>
              </View>

              <View className="flex-row items-start gap-3">
                <View className="w-7 h-7 rounded-full bg-rose-50 items-center justify-center mt-0.5">
                  <Trash2 size={13} color="#ef4444" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-700 leading-tight">Wastage recorded</Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">2 L Milk spoiled</Text>
                </View>
                <Text className="text-[9px] text-slate-400 font-bold">09:30 AM</Text>
              </View>

              <View className="flex-row items-start gap-3">
                <View className="w-7 h-7 rounded-full bg-purple-50 items-center justify-center mt-0.5">
                  <User size={13} color="#8b5cf6" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-700 leading-tight">New supplier added</Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">Fresh Valley Supplies</Text>
                </View>
                <Text className="text-[9px] text-slate-400 font-bold">Yesterday</Text>
              </View>
            </View>
          </View>

          <View className="flex-1 min-w-[280px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xs font-black text-slate-800 uppercase tracking-wider">Top Consumed Items</Text>
              <View className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5">
                <Text className="text-[10px] font-bold text-slate-500">This Month</Text>
              </View>
            </View>
            <View className="gap-2.5">
              <View className="flex-row border-b border-slate-100 pb-1">
                <Text className="flex-1 text-[9.5px] font-black text-slate-400 uppercase">Item</Text>
                <Text className="w-20 text-right text-[9.5px] font-black text-slate-400 uppercase">Consumed</Text>
                <Text className="w-12 text-center text-[9.5px] font-black text-slate-400 uppercase">Unit</Text>
              </View>
              {[
                { name: 'Chicken', qty: 120, unit: 'kg' },
                { name: 'Vegetable Oil', qty: 60, unit: 'L' },
                { name: 'Rice', qty: 45, unit: 'kg' },
                { name: 'Flour', qty: 40, unit: 'kg' },
                { name: 'Sugar', qty: 25, unit: 'kg' },
              ].map((x, i) => (
                <View key={i} className="flex-row items-center py-0.5">
                  <Text className="flex-1 text-xs font-black text-slate-700">{x.name}</Text>
                  <Text className="w-20 text-right text-xs font-bold text-slate-800">{x.qty}</Text>
                  <Text className="w-12 text-center text-xs font-semibold text-slate-400">{x.unit}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {lowStockMaterials.length > 0 && (
          <Pressable
            onPress={() => setActiveTab('alerts')}
            className="flex-row items-center justify-between bg-rose-50 border border-rose-100 rounded-2xl p-4 shadow-sm active:scale-[98.5%] transition-all"
          >
            <View className="flex-row items-center gap-3">
              <AlertTriangle size={18} color="#dc2626" />
              <Text className="text-xs font-black text-rose-700">
                {lowStockMaterials.length} item{lowStockMaterials.length > 1 ? 's are' : ' is'} low on stock and require{lowStockMaterials.length > 1 ? '' : 's'} attention
              </Text>
            </View>
            <View className="bg-rose-100 border border-rose-200 rounded-lg px-3 py-1.5">
              <Text className="text-[10px] font-black text-rose-800 uppercase">View Alerts</Text>
            </View>
          </Pressable>
        )}
      </View>
    );
  };

  const renderMaterials = () => {
    // ─── UTILITIES & HELPERS ────────────────────────────────────────────────
    const getCategoryEmoji = (catName?: string) => {
      const name = (catName || '').toLowerCase();
      if (name.includes('meat')) return '🥩';
      if (name.includes('dairy') || name.includes('milk') || name.includes('cheese')) return '🥛';
      if (name.includes('veg') || name.includes('tomato')) return '🍅';
      if (name.includes('grain') || name.includes('rice') || name.includes('flour') || name.includes('paste')) return '🌾';
      if (name.includes('oil') || name.includes('spice') || name.includes('condiment')) return '🏺';
      if (name.includes('fruit')) return '🍎';
      if (name.includes('bake') || name.includes('bread')) return '🍞';
      if (name.includes('beverage') || name.includes('drink')) return '🥤';
      return '📦';
    };

    // ─── CALCULATED STATS ──────────────────────────────────────────────────
    const totalItems = materials.length;
    const totalStockValue = materials.reduce((sum, m) => sum + (m.current_stock * m.average_cost), 0);
    const lowStockCount = materials.filter(m => m.current_stock <= m.reorder_level && m.current_stock > 0).length;
    const outOfStockCount = materials.filter(m => m.current_stock === 0).length;
    const pendingPurchasesCount = 8;
    const pendingPurchasesValuation = 48250;

    // ─── CLIENT-SIDE PAGINATION ─────────────────────────────────────────────
    const totalFiltered = filteredMaterials.length;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    const paginated = filteredMaterials.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handlePillClick = (matName: string) => {
      setSearchQuery(matName);
    };

    return (
      <View className="flex-1 flex-col gap-4">
        
        {/* ─── 3. ADVANCED FILTERS CONSOLE ───────────────────────────────────── */}
        <View className="bg-white border border-slate-200 rounded-2xl p-4 gap-3 shadow-xs">
          
          {/* Row 1: Status pills */}
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <View className="flex-row gap-1.5 flex-wrap">
              {[
                { key: 'all', label: 'All' },
                { key: 'healthy', label: 'Healthy' },
                { key: 'low', label: 'Low Stock' },
                { key: 'out', label: 'Out of Stock' },
                { key: 'expiring', label: 'Expiring Soon' },
              ].map((pill) => {
                const isActive = statusFilter === pill.key;
                return (
                  <Pressable
                    key={pill.key}
                    onPress={() => {
                      setStatusFilter(pill.key as any);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-full border active:scale-95 transition-all ${
                      isActive
                        ? 'bg-blue-600 border-blue-600 shadow-sm'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Text className={`text-[11px] font-bold ${isActive ? 'text-white' : 'text-slate-600'}`}>
                      {pill.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <Text className="text-[10px] text-amber-600 font-bold">Auto-Sync Active</Text>
            </View>
          </View>

          {/* Row 2: Search, pickers, my items toggle and actions */}
          <View className="flex-row items-center justify-between flex-wrap gap-3">
            
            {/* Left side filters group */}
            <View className="flex-row items-center gap-2 flex-wrap flex-1 min-w-[280px]">
              
              {/* Search input */}
              <View className="flex-1 min-w-[180px] flex-row bg-slate-50 border border-slate-200 rounded-lg items-center px-3 py-1.5 shadow-inner">
                <Search size={14} color="#64748b" className="mr-1.5" />
                <TextInput
                  placeholder="Search materials..."
                  value={searchQuery}
                  onChangeText={(t) => {
                    setSearchQuery(t);
                    setCurrentPage(1);
                  }}
                  className="flex-1 text-[11px] text-slate-800 outline-none"
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')}>
                    <X size={12} color="#64748b" />
                  </Pressable>
                )}
              </View>

              {/* Category Dropdown */}
              <View className="relative">
                <Pressable
                  onPress={() => {
                    setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                    setIsLocationDropdownOpen(false);
                  }}
                  className="flex-row items-center bg-white border border-slate-200 rounded-lg px-3 py-2 gap-1 active:scale-95 shadow-xs"
                >
                  <Text className="text-[11px] font-bold text-slate-600">
                    {selectedCategoryFilter === 'all'
                      ? 'All Categories'
                      : categories.find((c) => c.id === selectedCategoryFilter)?.category_name || 'Category'}
                  </Text>
                  <ChevronDown size={10} color="#64748b" />
                </Pressable>
                {isCategoryDropdownOpen && (
                  <View className="absolute top-10 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 w-48 p-1">
                    <Pressable
                      onPress={() => {
                        setSelectedCategoryFilter('all');
                        setIsCategoryDropdownOpen(false);
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg hover:bg-slate-50 active:bg-slate-100"
                    >
                      <Text className="text-[11px] font-semibold text-slate-700">All Categories</Text>
                    </Pressable>
                    {categories.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          setSelectedCategoryFilter(c.id);
                          setIsCategoryDropdownOpen(false);
                          setCurrentPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg hover:bg-slate-50 active:bg-slate-100"
                      >
                        <Text className="text-[11px] font-semibold text-slate-700">{c.category_name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Location Dropdown */}
              <View className="relative">
                <Pressable
                  onPress={() => {
                    setIsLocationDropdownOpen(!isLocationDropdownOpen);
                    setIsCategoryDropdownOpen(false);
                  }}
                  className="flex-row items-center bg-white border border-slate-200 rounded-lg px-3 py-2 gap-1 active:scale-95 shadow-xs"
                >
                  <Text className="text-[11px] font-bold text-slate-600">
                    {locationFilter === 'all' ? 'All Locations' : locationFilter}
                  </Text>
                  <ChevronDown size={10} color="#64748b" />
                </Pressable>
                {isLocationDropdownOpen && (
                  <View className="absolute top-10 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 w-40 p-1">
                    {['all', 'Freezer', 'Dry Storage'].map((loc) => (
                      <Pressable
                        key={loc}
                        onPress={() => {
                          setLocationFilter(loc);
                          setIsLocationDropdownOpen(false);
                          setCurrentPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg hover:bg-slate-50 active:bg-slate-100"
                      >
                        <Text className="text-[11px] font-semibold text-slate-700">
                          {loc === 'all' ? 'All Locations' : loc}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Checkbox: Show only my items */}
              <Pressable
                onPress={() => {
                  setShowOnlyMyItems(!showOnlyMyItems);
                  setCurrentPage(1);
                }}
                className="flex-row items-center gap-1.5 px-1 py-1.5 active:opacity-85"
              >
                <View
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                    showOnlyMyItems ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                  }`}
                >
                  {showOnlyMyItems && <Check size={8} color="white" strokeWidth={3} />}
                </View>
                <Text className="text-[11px] font-semibold text-slate-500">Show only my items</Text>
              </Pressable>

            </View>

            {/* Right side actions group */}
            <View className="flex-row items-center gap-1.5 flex-wrap">
              <Pressable
                onPress={handleOpenPurchaseModal}
                className="bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-2.5 py-2 active:scale-95 shadow-xs"
              >
                <Text className="text-[11px] font-bold text-slate-600">+ Purchase</Text>
              </Pressable>
              
              <Pressable
                onPress={handleOpenPurchaseModal}
                className="bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-2.5 py-2 active:scale-95 shadow-xs"
              >
                <Text className="text-[11px] font-bold text-slate-600">+ Receive</Text>
              </Pressable>

              <Pressable
                onPress={handleOpenAdjustmentModal}
                className="bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-2.5 py-2 active:scale-95 shadow-xs"
              >
                <Text className="text-[11px] font-bold text-slate-600">Transfer</Text>
              </Pressable>

              <Pressable
                onPress={handleOpenAdjustmentModal}
                className="bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-2.5 py-2 active:scale-95 shadow-xs"
              >
                <Text className="text-[11px] font-bold text-slate-600">Adjust</Text>
              </Pressable>

              <Pressable
                onPress={() => handleOpenMaterialModal()}
                className="bg-blue-600 hover:bg-blue-700 flex-row items-center gap-1 px-3 py-2 rounded-lg active:scale-95 shadow-xs"
              >
                <Plus size={12} color="white" />
                <Text className="text-[11px] font-bold text-white">Add Raw Material</Text>
              </Pressable>
            </View>

          </View>
        </View>

        {/* ─── 4. INLINE LOW STOCK ALERTS BANNER ──────────────────────────────── */}
        {lowStockMaterials.length > 0 && (
          <View className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 shadow-xs">
            <View className="flex-row justify-between items-center mb-1.5 flex-wrap gap-2">
              <View className="flex-row items-center gap-1.5">
                <AlertTriangle size={14} color="#d97706" />
                <Text className="text-[11px] font-black text-amber-800">
                  Low Stock Alerts ({lowStockMaterials.length})
                </Text>
              </View>
              <Pressable 
                onPress={() => { setStatusFilter('low'); setCurrentPage(1); }}
                className="active:opacity-80"
              >
                <Text className="text-[11px] font-bold text-amber-700">View all low stock →</Text>
              </Pressable>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="py-0.5">
              <View className="flex-row gap-1.5">
                {lowStockMaterials.map((lm) => (
                  <Pressable
                    key={lm.id}
                    onPress={() => handlePillClick(lm.material_name)}
                    className="bg-white border border-amber-200/80 hover:border-amber-300 rounded-full px-2.5 py-0.5 flex-row items-center gap-1 active:scale-95 shadow-xs"
                  >
                    <View className="w-1 h-1 rounded-full bg-amber-500" />
                    <Text className="text-[10px] font-semibold text-slate-600">
                      {lm.material_name}
                    </Text>
                    <Text className="text-[9.5px] font-black text-amber-600">
                      {lm.current_stock} {lm.unit_short_name || 'KG'} left
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ─── 5. STRUCTURED DATA TABLE (EXTREMELY COMPACT) ──────────────────── */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={true} 
          className="w-full bg-white border border-slate-200 rounded-2xl shadow-xs"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={{ minWidth: 1100 }} className="flex-col p-3 flex-1">
            
            {/* Table Header */}
            <View className="flex-row border-b border-slate-100 pb-2.5 mb-0.5 px-2">
              <View style={{ width: '22%' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Item Name</Text>
              </View>
              <View style={{ width: '10%' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Category</Text>
              </View>
              <View style={{ width: '10%' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Location</Text>
              </View>
              <View style={{ width: '15%' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Current Stock</Text>
              </View>
              <View style={{ width: '8%', alignItems: 'center' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Min. Level</Text>
              </View>
              <View style={{ width: '6%', alignItems: 'center' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Unit</Text>
              </View>
              <View style={{ width: '10%', alignItems: 'flex-end' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Avg. Cost</Text>
              </View>
              <View style={{ width: '10%', alignItems: 'flex-end' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Stock Value</Text>
              </View>
              <View style={{ width: '11%', alignItems: 'center' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Status</Text>
              </View>
              <View style={{ width: '8%', alignItems: 'center' }}>
                <Text className="text-[9.5px] font-black text-slate-400 uppercase tracking-wider">Actions</Text>
              </View>
            </View>

            {/* Table Body */}
            {paginated.length === 0 ? (
              <View className="py-16 items-center justify-center flex-1">
                <Boxes size={36} color="#94a3b8" className="mb-3" />
                <Text className="text-sm font-bold text-slate-500">No materials matched your filters</Text>
                <Text className="text-[10px] text-slate-400 mt-0.5">Try resetting search filters or register a new raw ingredient.</Text>
              </View>
            ) : (
              paginated.map((item) => {
                const isOut = item.current_stock === 0;
                const isLow = item.current_stock > 0 && item.current_stock <= item.reorder_level;

                let badgeColor = 'bg-emerald-50 border-emerald-200 text-emerald-700';
                let badgeText = 'Healthy';
                if (isOut) {
                  badgeColor = 'bg-rose-50 border-rose-200 text-rose-700';
                  badgeText = 'Out of Stock';
                } else if (isLow) {
                  badgeColor = 'bg-amber-50 border-amber-200 text-amber-700';
                  badgeText = 'Low Stock';
                }

                const itemLocation = item.category_name === 'Raw Meats' ? 'Freezer' : 'Dry Storage';
                const valuation = item.current_stock * item.average_cost;

                return (
                  <View 
                    key={item.id} 
                    className="flex-row items-center py-2 px-2 border-b border-slate-50 hover:bg-slate-50/50 rounded-xl"
                  >
                    
                    {/* Item Name (Title + Code) */}
                    <View style={{ width: '22%' }} className="justify-center pr-3">
                      <Text className="text-[11.5px] font-black text-slate-800 leading-tight truncate">{item.material_name}</Text>
                      <Text className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        {item.material_code}
                      </Text>
                    </View>

                    {/* Category */}
                    <View style={{ width: '10%' }}>
                      <Text className="text-[11px] font-semibold text-slate-600">{item.category_name || 'N/A'}</Text>
                    </View>

                    {/* Location */}
                    <View style={{ width: '10%' }}>
                      <Text className="text-[11px] font-semibold text-slate-600">{itemLocation}</Text>
                    </View>

                    {/* Current Stock (Val + Level Indicator Bar) */}
                    <View style={{ width: '15%' }} className="flex-col">
                      <Text className={`text-[11px] font-extrabold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-800'}`}>
                        {item.current_stock} {item.unit_short_name}
                      </Text>
                      
                      {/* stock level ratio visual bar */}
                      <View className="w-20 bg-slate-100 h-0.5 rounded-full mt-1 overflow-hidden">
                        <View 
                          className={`h-full ${isOut ? 'bg-slate-300' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${Math.min(Math.max((item.current_stock / (item.reorder_level || 1)) * 100, 0), 100)}%` }} 
                        />
                      </View>
                      <Text className="text-[8.5px] text-slate-400 mt-0.5 font-medium">
                        {item.current_stock} / {item.reorder_level} {item.unit_short_name}
                      </Text>
                    </View>

                    {/* Min Level */}
                    <View style={{ width: '8%', alignItems: 'center' }}>
                      <Text className="text-[11px] font-bold text-slate-700">{item.reorder_level}</Text>
                    </View>

                    {/* Unit */}
                    <View style={{ width: '6%', alignItems: 'center' }}>
                      <Text className="text-[11px] font-black text-slate-400 uppercase">{item.unit_short_name || 'UoM'}</Text>
                    </View>

                    {/* Avg Cost */}
                    <View style={{ width: '10%', alignItems: 'flex-end' }}>
                      <Text className="text-[11px] font-bold text-slate-700">₹{item.average_cost.toFixed(2)}</Text>
                    </View>

                    {/* Stock Value */}
                    <View style={{ width: '10%', alignItems: 'flex-end' }}>
                      <Text className="text-[11px] font-black text-slate-800">
                        ₹{valuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    {/* Status Badge */}
                    <View style={{ width: '11%', alignItems: 'center' }}>
                      <View className={`border rounded-full px-1.5 py-0.5 ${badgeColor} shadow-xs`}>
                        <Text className="text-[8.5px] font-extrabold uppercase tracking-wider">{badgeText}</Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={{ width: '8%' }} className="flex-row items-center justify-center gap-1">
                      <Pressable
                        onPress={() => handleOpenMaterialModal(item)}
                        className="w-6 h-6 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg items-center justify-center active:scale-95 shadow-xs"
                      >
                        <Eye size={10} color="#64748b" />
                      </Pressable>
                      <Pressable
                        onPress={() => handleOpenMaterialModal(item)}
                        className="w-6 h-6 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg items-center justify-center active:scale-95 shadow-xs"
                      >
                        <FileText size={10} color="#64748b" />
                      </Pressable>
                      <Pressable
                        onPress={handleOpenPurchaseModal}
                        className="w-6 h-6 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg items-center justify-center active:scale-95 shadow-xs"
                      >
                        <ShoppingCart size={10} color="#64748b" />
                      </Pressable>
                    </View>

                  </View>
                );
              })
            )}

          </View>
        </ScrollView>

        {/* ─── 6. PAGINATION FOOTER ──────────────────────────────────────────── */}
        <View className="flex-row justify-between items-center px-3 py-1 flex-wrap gap-3">
          <Text className="text-[11px] font-bold text-slate-400">
            Showing {totalFiltered > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, totalFiltered)} of {totalFiltered} items
          </Text>

          <View className="flex-row items-center gap-3 flex-wrap">
            
            {/* Rows per page selector */}
            <View className="flex-row items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-xs">
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Rows per page</Text>
              <Pressable
                onPress={() => {
                  const nextSize = pageSize === 10 ? 25 : pageSize === 25 ? 50 : 10;
                  setPageSize(nextSize);
                  setCurrentPage(1);
                }}
                className="flex-row items-center gap-1 active:opacity-75"
              >
                <Text className="text-[11.5px] font-black text-slate-700">{pageSize}</Text>
                <ChevronDown size={8} color="#64748b" />
              </Pressable>
            </View>

            {/* Page indicators list */}
            {totalPages > 1 && (
              <View className="flex-row gap-1">
                <Pressable
                  onPress={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={`w-6.5 h-6.5 rounded-lg border items-center justify-center active:scale-95 shadow-xs ${
                    currentPage === 1 ? 'border-slate-100 bg-slate-50/50 opacity-40' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Text className="text-[11px] font-black text-slate-500">‹</Text>
                </Pressable>
                
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pageNum = idx + 1;
                  const isActive = currentPage === pageNum;
                  return (
                    <Pressable
                      key={pageNum}
                      onPress={() => setCurrentPage(pageNum)}
                      className={`w-6.5 h-6.5 rounded-lg border items-center justify-center active:scale-95 shadow-xs ${
                        isActive
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <Text className={`text-[11.5px] font-extrabold ${isActive ? 'text-white' : 'text-slate-600'}`}>
                        {pageNum}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`w-6.5 h-6.5 rounded-lg border items-center justify-center active:scale-95 shadow-xs ${
                    currentPage === totalPages ? 'border-slate-100 bg-slate-50/50 opacity-40' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Text className="text-[11px] font-black text-slate-500">›</Text>
                </Pressable>
              </View>
            )}

          </View>
        </View>

      </View>
    );
  };

  const renderSuppliers = () => {
    return (
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-6 flex-wrap gap-4">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-slate-800">Verified Suppliers & Procurement Partners</Text>
            <Text className="text-xs text-slate-500">Compare contract terms, address books, and review supplier configurations.</Text>
          </View>
          <Pressable
            onPress={() => handleOpenSupplierModal()}
            className="flex-row bg-blue-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-sm active:scale-95 transition-transform"
          >
            <Plus size={14} color="white" className="mr-1" />
            <Text className="text-xs font-bold text-white">Add Supplier</Text>
          </Pressable>
        </View>

        <FlatList
          key={`suppliers-grid-${numColumns}`}
          data={suppliers}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns === 2 ? { justifyContent: 'space-between' } : undefined}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 w-full items-center justify-center">
              <User size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No suppliers registered</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className={`${numColumns === 2 ? 'w-[49%]' : 'w-full'} bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm`}>
              <View className="flex-row justify-between items-start mb-2.5">
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-black text-slate-800">{item.supplier_name}</Text>
                  <Text className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    Code: {item.supplier_code}
                  </Text>
                </View>
                <View className="bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                  <Text className="text-[9px] font-bold text-blue-700 uppercase">{item.payment_terms}</Text>
                </View>
              </View>

              <View className="border-t border-slate-100 pt-2 gap-1.5">
                <View className="flex-row items-center">
                  <Text className="text-[11px] font-bold text-slate-400 w-20">Contact:</Text>
                  <Text className="text-[11px] font-semibold text-slate-700">{item.contact_person || 'N/A'}</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-[11px] font-bold text-slate-400 w-20">Phone:</Text>
                  <Text className="text-[11px] font-semibold text-slate-700">{item.phone}</Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-[11px] font-bold text-slate-400 w-20">GST Number:</Text>
                  <Text className="text-[11px] font-semibold text-slate-700 uppercase">{item.gst_number || 'N/A'}</Text>
                </View>
                <View className="flex-row items-start">
                  <Text className="text-[11px] font-bold text-slate-400 w-20">Address:</Text>
                  <Text className="text-[11px] text-slate-500 flex-1">
                    {item.address}, {item.city}, {item.state}
                  </Text>
                </View>
              </View>

              <View className="flex-row justify-between items-center mt-4 pt-2 border-t border-slate-50">
                <Text className="text-[10px] italic text-slate-400">
                  Registered: {new Date(item.created_at).toLocaleDateString()}
                </Text>
                <View className="flex-row gap-1.5">
                  <Pressable
                    onPress={() => handleOpenSupplierModal(item)}
                    className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg items-center justify-center active:scale-95"
                  >
                    <FileText size={14} color="#64748b" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteSupplierItem(item.id)}
                    className="w-8 h-8 bg-slate-50 border border-rose-100 rounded-lg items-center justify-center active:scale-95"
                  >
                    <Trash2 size={14} color="#e11d48" />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderPurchases = () => {
    // ── derive a display-status from status field ──────────────────────────
    // Only 'Completed' = Paid. Draft invoices are Pending (< 30d) or Overdue (≥ 30d).
    const getPayStatus = (p: InventoryPurchaseHeader): 'Paid' | 'Pending' | 'Overdue' => {
      if (p.status === 'Completed') return 'Paid';
      const invoiceDate = new Date(p.purchase_date);
      const diffDays = (Date.now() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 30 ? 'Overdue' : 'Pending';
    };

    // ── filter + search ────────────────────────────────────────────────────
    const filtered = purchases.filter((p) => {
      const q = purSearchQuery.toLowerCase();
      const matchSearch =
        !q ||
        p.purchase_number.toLowerCase().includes(q) ||
        (p.invoice_number || '').toLowerCase().includes(q) ||
        (p.supplier_name || '').toLowerCase().includes(q);
      const payStatus = getPayStatus(p);
      const matchStatus = purStatusFilter === 'all' || payStatus === purStatusFilter;
      return matchSearch && matchStatus;
    });

    // ── pagination ─────────────────────────────────────────────────────────
    const totalPages = Math.ceil(filtered.length / purPageSize) || 1;
    const paginated = filtered.slice((purPage - 1) * purPageSize, purPage * purPageSize);

    // ── summary stats ──────────────────────────────────────────────────────
    const totalAmt = purchases.reduce((s, p) => s + p.grand_total, 0);
    const pendingCount = purchases.filter((p) => getPayStatus(p) !== 'Paid').length;
    const supplierCount = new Set(purchases.map((p) => p.supplier_id)).size;

    return (
      <View className="flex-1 flex-col gap-4">

        {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
        <View className="flex-row justify-between items-start flex-wrap gap-4">
          <View className="flex-1 min-w-[200px]">
            <Text className="text-sm font-black text-slate-800">Purchase Invoices & Procurement Records</Text>
            <Text className="text-xs text-slate-500 mt-0.5">Record freight invoices, payment histories, and stock updates.</Text>
          </View>
          <Pressable
            onPress={handleOpenPurchaseModal}
            className="flex-row bg-[#0066b2] items-center justify-center py-2.5 px-4 rounded-xl shadow-md active:scale-95"
            style={{ gap: 6 }}
          >
            <Plus size={14} color="white" />
            <Text className="text-xs font-black text-white">+ Record Purchase</Text>
          </Pressable>
        </View>

        {/* ── STAT CARDS ──────────────────────────────────────────────── */}
        <View className="flex-row gap-3 flex-wrap">
          {/* Total Invoices */}
          <View className="flex-1 min-w-[140px] bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs flex-row items-center gap-3">
            <View className="w-9 h-9 bg-blue-50 border border-blue-100 rounded-xl items-center justify-center">
              <FileText size={16} color="#0066b2" />
            </View>
            <View>
              <Text className="text-xl font-black text-slate-800 leading-tight">{purchases.length}</Text>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Invoices</Text>
            </View>
          </View>

          {/* Total Amount */}
          <View className="flex-1 min-w-[160px] bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs flex-row items-center gap-3">
            <View className="w-9 h-9 bg-emerald-50 border border-emerald-100 rounded-xl items-center justify-center">
              <ShoppingCart size={16} color="#059669" />
            </View>
            <View>
              <Text className="text-xl font-black text-slate-800 leading-tight">
                ₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Amount</Text>
            </View>
          </View>

          {/* Pending Payments */}
          <View className="flex-1 min-w-[140px] bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs flex-row items-center gap-3">
            <View className="w-9 h-9 bg-amber-50 border border-amber-100 rounded-xl items-center justify-center">
              <AlertTriangle size={16} color="#d97706" />
            </View>
            <View>
              <Text className="text-xl font-black text-slate-800 leading-tight">{pendingCount}</Text>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pending Payments</Text>
            </View>
          </View>

          {/* Suppliers */}
          <View className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-xs flex-row items-center gap-3">
            <View className="w-9 h-9 bg-violet-50 border border-violet-100 rounded-xl items-center justify-center">
              <User size={16} color="#7c3aed" />
            </View>
            <View>
              <Text className="text-xl font-black text-slate-800 leading-tight">{supplierCount || suppliers.length}</Text>
              <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Suppliers</Text>
            </View>
          </View>
        </View>

        {/* ── SEARCH + FILTER BAR ─────────────────────────────────────── */}
        <View className="flex-row items-center gap-3 flex-wrap">
          {/* Search */}
          <View className="flex-1 min-w-[200px] flex-row bg-white border border-slate-200 rounded-xl items-center px-3 py-2 shadow-xs gap-2">
            <Search size={14} color="#94a3b8" />
            <TextInput
              placeholder="Search by PO / Invoice / Supplier..."
              value={purSearchQuery}
              onChangeText={(t) => { setPurSearchQuery(t); setPurPage(1); }}
              className="flex-1 text-[11px] text-slate-800 outline-none"
              placeholderTextColor="#94a3b8"
            />
            {purSearchQuery.length > 0 && (
              <Pressable onPress={() => setPurSearchQuery('')}>
                <X size={12} color="#94a3b8" />
              </Pressable>
            )}
          </View>

          {/* Status filter pills */}
          <View className="flex-row gap-1.5">
            {(['all', 'Paid', 'Pending', 'Overdue'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => { setPurStatusFilter(s); setPurPage(1); }}
                className={`px-3 py-1.5 rounded-lg border active:scale-95 ${
                  purStatusFilter === s
                    ? s === 'Paid' ? 'bg-emerald-600 border-emerald-600'
                      : s === 'Pending' ? 'bg-amber-500 border-amber-500'
                      : s === 'Overdue' ? 'bg-rose-600 border-rose-600'
                      : 'bg-[#0066b2] border-[#0066b2]'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Text className={`text-[11px] font-bold ${purStatusFilter === s ? 'text-white' : 'text-slate-600'}`}>
                  {s === 'all' ? 'All' : s}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Export */}
          <Pressable className="flex-row items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs active:scale-95">
            <Download size={13} color="#64748b" />
            <Text className="text-[11px] font-bold text-slate-600">Export</Text>
          </Pressable>
        </View>

        {/* ── TABLE ───────────────────────────────────────────────────── */}
        <View className="flex-1 bg-white border border-slate-200 shadow-xs" style={{ borderRadius: 16 }}>

          {/* Table Header */}
          <View className="flex-row items-center px-4 py-3 bg-slate-50 border-b border-slate-200">
            <View style={{ width: '18%' }}>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">PO Number</Text>
            </View>
            <View style={{ width: '12%' }}>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Invoice No.</Text>
            </View>
            <View style={{ width: '20%' }}>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Supplier</Text>
            </View>
            <View style={{ width: '14%' }}>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Invoice Date</Text>
            </View>
            <View style={{ width: '16%', alignItems: 'flex-end' }}>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Amount</Text>
            </View>
            <View style={{ width: '12%', alignItems: 'center' }}>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Status</Text>
            </View>
            <View style={{ width: '8%', alignItems: 'center' }}>
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Actions</Text>
            </View>
          </View>

          {/* Table Body */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {paginated.length === 0 ? (
              <View className="py-16 items-center justify-center gap-3">
                <View className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full items-center justify-center">
                  <FileText size={20} color="#94a3b8" />
                </View>
                <Text className="text-sm font-black text-slate-400">No purchase invoices recorded yet</Text>
                <Text className="text-xs text-slate-400">Tap "+ Record Purchase" to add your first invoice</Text>
              </View>
            ) : (
              paginated.map((item, rowIdx) => {
                const payStatus = getPayStatus(item);
                const statusColor =
                  payStatus === 'Paid'
                    ? { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' }
                    : payStatus === 'Overdue'
                    ? { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' }
                    : { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' };
                const statusIcon = payStatus === 'Paid' ? '✓' : payStatus === 'Overdue' ? '⊗' : '◷';
                const displayDate = item.invoice_date || item.purchase_date;
                const dateStr = displayDate
                  ? new Date(displayDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric' })
                  : '—';

                return (
                  <View
                    key={item.id}
                    className={`flex-row items-center px-4 py-3.5 border-b border-slate-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-blue-50/30`}
                  >
                    {/* PO Number */}
                    <View style={{ width: '18%' }}>
                      <Text className="text-[12px] font-black text-[#0066b2]">{item.purchase_number}</Text>
                      <Text className="text-[9px] text-slate-400 font-semibold mt-0.5">By {item.created_by || 'Staff'}</Text>
                    </View>

                    {/* Invoice Number */}
                    <View style={{ width: '12%' }}>
                      <Text className="text-[12px] font-bold text-slate-700">{item.invoice_number || '—'}</Text>
                    </View>

                    {/* Supplier */}
                    <View style={{ width: '20%' }}>
                      <Text className="text-[12px] font-semibold text-slate-700" numberOfLines={1}>
                        {item.supplier_name || suppliers.find((s) => s.id === item.supplier_id)?.supplier_name || '—'}
                      </Text>
                    </View>

                    {/* Invoice Date */}
                    <View style={{ width: '14%' }}>
                      <Text className="text-[12px] font-semibold text-slate-600">{dateStr}</Text>
                    </View>

                    {/* Amount */}
                    <View style={{ width: '16%', alignItems: 'flex-end' }}>
                      <Text className="text-[13px] font-black text-slate-800">
                        ₹{item.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text className="text-[9px] font-bold text-slate-400 mt-0.5">{item.payment_mode}</Text>
                    </View>

                    {/* Status Badge */}
                    <View style={{ width: '12%', alignItems: 'center' }}>
                      <View className={`flex-row items-center gap-1 border rounded-full px-2 py-0.5 ${statusColor.bg} ${statusColor.border}`}>
                        <Text className={`text-[9px] font-black ${statusColor.text}`}>{statusIcon}</Text>
                        <Text className={`text-[9px] font-black ${statusColor.text}`}>{payStatus}</Text>
                      </View>
                    </View>

                    {/* Actions (three-dot menu) */}
                    <View style={{ width: '8%', alignItems: 'center' }}>
                      <Pressable
                        onPress={(e) => {
                          setPurMenuY(e.nativeEvent.pageY);
                          setPurOpenActionIdx(purOpenActionIdx === item.id ? null : item.id);
                        }}
                        className="w-7 h-7 rounded-lg border border-slate-200 bg-white items-center justify-center active:scale-95 hover:bg-slate-50 shadow-xs"
                      >
                        <MoreVertical size={14} color="#64748b" />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>

        {/* ── PAGINATION FOOTER ───────────────────────────────────────── */}
        <View className="flex-row justify-between items-center flex-wrap gap-3">
          <Text className="text-[11px] font-bold text-slate-400">
            Showing {filtered.length > 0 ? (purPage - 1) * purPageSize + 1 : 0} to{' '}
            {Math.min(purPage * purPageSize, filtered.length)} of {filtered.length} invoices
          </Text>

          <View className="flex-row items-center gap-3">
            {/* Rows per page */}
            <View className="flex-row items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-xs">
              <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Rows</Text>
              <Pressable
                onPress={() => { setPurPageSize(purPageSize === 10 ? 25 : purPageSize === 25 ? 50 : 10); setPurPage(1); }}
                className="flex-row items-center gap-1"
              >
                <Text className="text-[11px] font-black text-slate-700">{purPageSize}</Text>
                <ChevronDown size={8} color="#64748b" />
              </Pressable>
            </View>

            {/* Page buttons */}
            {totalPages > 1 && (
              <View className="flex-row gap-1">
                <Pressable
                  onPress={() => setPurPage((p) => Math.max(p - 1, 1))}
                  disabled={purPage === 1}
                  className={`w-7 h-7 rounded-lg border items-center justify-center active:scale-95 shadow-xs ${
                    purPage === 1 ? 'border-slate-100 bg-slate-50 opacity-40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <Text className="text-[11px] font-black text-slate-500">‹</Text>
                </Pressable>

                {Array.from({ length: Math.min(totalPages, 5) }).map((_, idx) => {
                  const pageNum = idx + 1;
                  const isActive = purPage === pageNum;
                  return (
                    <Pressable
                      key={pageNum}
                      onPress={() => setPurPage(pageNum)}
                      className={`w-7 h-7 rounded-lg border items-center justify-center active:scale-95 shadow-xs ${
                        isActive ? 'bg-[#0066b2] border-[#0066b2]' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <Text className={`text-[11px] font-extrabold ${isActive ? 'text-white' : 'text-slate-600'}`}>
                        {pageNum}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => setPurPage((p) => Math.min(p + 1, totalPages))}
                  disabled={purPage === totalPages}
                  className={`w-7 h-7 rounded-lg border items-center justify-center active:scale-95 shadow-xs ${
                    purPage === totalPages ? 'border-slate-100 bg-slate-50 opacity-40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <Text className="text-[11px] font-black text-slate-500">›</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* ── ACTION MENU MODAL ──────────────────────────────────────── */}
        <Modal
          visible={purOpenActionIdx !== null}
          transparent
          animationType="none"
          onRequestClose={() => setPurOpenActionIdx(null)}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setPurOpenActionIdx(null)}>
            <View
              style={{
                position: 'absolute',
                right: 72,
                top: purMenuY,
                backgroundColor: 'white',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.14,
                shadowRadius: 16,
                elevation: 10,
                width: 164,
                padding: 4,
              }}
            >
              {/* View Details */}
              <Pressable
                onPress={async () => {
                  const item = purchases.find((p) => p.id === purOpenActionIdx);
                  if (!item) return;
                  setPurOpenActionIdx(null);
                  setPurDetailItem(item);
                  setPurDetailLoading(true);
                  const res = await fetchPurchaseItems(item.id);
                  setPurDetailLines(res.data ?? []);
                  setPurDetailLoading(false);
                }}
                className="flex-row items-center gap-2 px-3 py-2.5 rounded-lg active:bg-slate-100"
              >
                <Eye size={13} color="#0066b2" />
                <Text className="text-[12px] font-bold text-slate-700">View Details</Text>
              </Pressable>

              {/* Edit Invoice */}
              <Pressable
                onPress={async () => {
                  const item = purchases.find((p) => p.id === purOpenActionIdx);
                  if (!item) return;
                  // Set ALL header fields first
                  setModalError(null);
                  setPurchaseSupplierId(item.supplier_id);
                  setPurchaseInvoiceNum(item.invoice_number ?? '');
                  setPurchasePaymentMode(item.payment_mode);
                  setPurchaseTransportCharges(String(item.transport_charges ?? 0));
                  setPurchaseRemarks(item.remarks ?? '');
                  setPurchaseLocation('Dry Storage');
                  const dateVal = item.invoice_date
                    ? item.invoice_date.split('T')[0]
                    : item.purchase_date.split('T')[0];
                  setPurchaseInvoiceDate(dateVal);
                  setCalendarDate(new Date(dateVal));
                  // Reset dropdown states
                  setIsSupDropdownOpen(false);
                  setIsPayDropdownOpen(false);
                  setIsLocDropdownOpen(false);
                  setIsCalendarOpen(false);
                  setOpenLineMatDropdownIdx(null);
                  setOpenLineUnitDropdownIdx(null);
                  setOpenLineGstDropdownIdx(null);
                  // Fetch and pre-fill line items
                  const linesRes = await fetchPurchaseItems(item.id);
                  if (linesRes.data && linesRes.data.length > 0) {
                    const mappedLines = linesRes.data.map((line) => {
                      const mat = materials.find((m) => m.id === line.material_id);
                      return {
                        material_id: line.material_id,
                        quantity: String(line.quantity),
                        unit_price: String(line.unit_price),
                        gst: '0',
                        unit_short_name: mat?.unit_short_name ?? '',
                      };
                    });
                    setPurchaseItems(mappedLines);
                  } else {
                    setPurchaseItems([{ material_id: '', quantity: '', unit_price: '', gst: '0', unit_short_name: '' }]);
                  }
                  // Navigate then close modal
                  setActiveTab('record_purchase');
                  setPurOpenActionIdx(null);
                }}
                className="flex-row items-center gap-2 px-3 py-2.5 rounded-lg active:bg-slate-100"
              >
                <FileText size={13} color="#0066b2" />
                <Text className="text-[12px] font-bold text-slate-700">Edit Invoice</Text>
              </Pressable>



              {/* Mark as Paid / Unpaid */}
              {(() => {
                const item = purchases.find((p) => p.id === purOpenActionIdx);
                if (!item) return null;
                const isPaid = item.status === 'Completed';
                return (
                  <Pressable
                    onPress={async () => {
                      const newStatus = isPaid ? 'Draft' : 'Completed';
                      setPurOpenActionIdx(null);
                      // Optimistic update
                      setPurchases((prev) =>
                        prev.map((p) => p.id === item.id ? { ...p, status: newStatus } : p)
                      );
                      await updatePurchaseStatus(item.id, newStatus);
                    }}
                    className="flex-row items-center gap-2 px-3 py-2.5 rounded-lg active:bg-emerald-50"
                  >
                    <Check size={13} color={isPaid ? '#64748b' : '#059669'} />
                    <Text
                      className="text-[12px] font-bold"
                      style={{ color: isPaid ? '#64748b' : '#059669' }}
                    >
                      {isPaid ? 'Mark as Unpaid' : 'Mark as Paid'}
                    </Text>
                  </Pressable>
                );
              })()}

              <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 2 }} />

              {/* Delete */}
              <Pressable
                onPress={() => setPurOpenActionIdx(null)}
                className="flex-row items-center gap-2 px-3 py-2.5 rounded-lg active:bg-rose-100"
              >
                <Trash2 size={13} color="#e11d48" />
                <Text className="text-[12px] font-bold text-rose-600">Delete</Text>
              </Pressable>

            </View>
          </Pressable>
        </Modal>

        {/* ── PURCHASE DETAIL SHEET ──────────────────────────────────── */}
        <Modal
          visible={purDetailItem !== null}
          transparent
          animationType="fade"
          onRequestClose={() => { setPurDetailItem(null); setPurDetailLines([]); }}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(15,39,68,0.45)', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => { setPurDetailItem(null); setPurDetailLines([]); }}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                width: '88%',
                maxWidth: 680,
                backgroundColor: 'white',
                borderRadius: 20,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 24,
                elevation: 16,
                overflow: 'hidden',
              }}
            >
              {purDetailItem && (
                <>
                  {/* Sheet Header */}
                  <View style={{ backgroundColor: '#0066b2', padding: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View>
                        <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>{purDetailItem.purchase_number}</Text>
                        <Text style={{ color: '#93c5fd', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                          {purDetailItem.invoice_number ? `Invoice #${purDetailItem.invoice_number}  •  ` : ''}
                          {new Date(purDetailItem.purchase_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => { setPurDetailItem(null); setPurDetailLines([]); }}
                        style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 6 }}
                      >
                        <X size={16} color="white" />
                      </Pressable>
                    </View>

                    {/* Key stats row */}
                    <View style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
                      <View>
                        <Text style={{ color: '#93c5fd', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>Grand Total</Text>
                        <Text style={{ color: 'white', fontSize: 22, fontWeight: '900', marginTop: 2 }}>
                          ₹{purDetailItem.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: '#93c5fd', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>Supplier</Text>
                        <Text style={{ color: 'white', fontSize: 13, fontWeight: '800', marginTop: 2 }}>
                          {purDetailItem.supplier_name || suppliers.find((s) => s.id === purDetailItem!.supplier_id)?.supplier_name || '—'}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: '#93c5fd', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>Payment</Text>
                        <Text style={{ color: 'white', fontSize: 13, fontWeight: '800', marginTop: 2 }}>{purDetailItem.payment_mode}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Line Items */}
                  <View style={{ padding: 20 }}>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                      Line Items
                    </Text>

                    {purDetailLoading ? (
                      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#0066b2" />
                        <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>Loading items...</Text>
                      </View>
                    ) : purDetailLines.length === 0 ? (
                      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                        <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>No line items found for this invoice.</Text>
                      </View>
                    ) : (
                      <>
                        {/* Line items header */}
                        <View style={{ flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 4 }}>
                          <Text style={{ flex: 1, fontSize: 9, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase' }}>Material</Text>
                          <Text style={{ width: 60, fontSize: 9, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' }}>Qty</Text>
                          <Text style={{ width: 80, fontSize: 9, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'right' }}>Unit Price</Text>
                          <Text style={{ width: 90, fontSize: 9, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', textAlign: 'right' }}>Line Total</Text>
                        </View>
                        <ScrollView style={{ maxHeight: 200 }}>
                          {purDetailLines.map((line, i) => (
                            <View
                              key={line.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 8,
                                paddingHorizontal: 8,
                                borderBottomWidth: i < purDetailLines.length - 1 ? 1 : 0,
                                borderBottomColor: '#f1f5f9',
                              }}
                            >
                              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#334155' }} numberOfLines={1}>
                                {line.material_name || materials.find((m) => m.id === line.material_id)?.material_name || '—'}
                              </Text>
                              <Text style={{ width: 60, fontSize: 12, fontWeight: '700', color: '#475569', textAlign: 'center' }}>
                                {line.quantity}
                              </Text>
                              <Text style={{ width: 80, fontSize: 12, fontWeight: '600', color: '#475569', textAlign: 'right' }}>
                                ₹{line.unit_price.toFixed(2)}
                              </Text>
                              <Text style={{ width: 90, fontSize: 13, fontWeight: '800', color: '#0f2744', textAlign: 'right' }}>
                                ₹{line.line_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </Text>
                            </View>
                          ))}
                        </ScrollView>
                      </>
                    )}

                    {/* Totals breakdown */}
                    <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 12, paddingTop: 12, gap: 6 }}>
                      {[
                        { label: 'Subtotal', value: purDetailItem.subtotal },
                        ...(purDetailItem.discount_amount > 0 ? [{ label: 'Discount', value: -purDetailItem.discount_amount }] : []),
                        ...(purDetailItem.tax_amount > 0 ? [{ label: 'Tax (GST)', value: purDetailItem.tax_amount }] : []),
                        ...(purDetailItem.transport_charges > 0 ? [{ label: 'Freight', value: purDetailItem.transport_charges }] : []),
                      ].map(({ label, value }) => (
                        <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600' }}>{label}</Text>
                          <Text style={{ fontSize: 12, color: value < 0 ? '#16a34a' : '#475569', fontWeight: '700' }}>
                            {value < 0 ? '−' : ''}₹{Math.abs(value).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8, marginTop: 2 }}>
                        <Text style={{ fontSize: 14, color: '#0f2744', fontWeight: '900' }}>Grand Total</Text>
                        <Text style={{ fontSize: 14, color: '#0066b2', fontWeight: '900' }}>
                          ₹{purDetailItem.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </Text>
                      </View>
                    </View>

                    {/* Remarks */}
                    {purDetailItem.remarks && (
                      <View style={{ marginTop: 12, backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 }}>
                        <Text style={{ fontSize: 9, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Remarks</Text>
                        <Text style={{ fontSize: 12, color: '#475569' }}>{purDetailItem.remarks}</Text>
                      </View>
                    )}

                    {/* Close button */}
                    <Pressable
                      onPress={() => { setPurDetailItem(null); setPurDetailLines([]); }}
                      style={{ marginTop: 16, backgroundColor: '#0066b2', borderRadius: 10, padding: 12, alignItems: 'center' }}
                    >
                      <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>Close</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>

      </View>
    );
  };


  const renderRecordPurchaseScreen = () => {
    return (
      <View className="bg-white flex-col flex-1 p-6">
        {/* Header with Back Button */}
        <View className="flex-row items-center justify-between mb-6 border-b border-slate-100 pb-4 flex-wrap gap-4">
          <Pressable
            onPress={() => {
              setActiveTab('purchases');
              setModalError(null);
            }}
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50/50 border border-blue-200 active:scale-95 shadow-xs"
          >
            <ArrowLeft size={14} color="#0066b2" />
            <Text className="text-[11px] font-black text-[#0066b2]">Back to Purchases</Text>
          </Pressable>

          <View className="flex-1 min-w-[200px] px-2">
            <Text className="text-lg font-black text-slate-800 leading-tight">
              Record Procurement Invoice
            </Text>
            <Text className="text-[11px] text-slate-400 font-bold mt-0.5">
              Enter invoice details and add items to update your inventory
            </Text>
          </View>

          <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50/50 border border-blue-100 shadow-xs">
            <FileText size={14} color="#0066b2" />
            <Text className="text-[10px] font-black text-[#0066b2] uppercase tracking-wider">
              Procurement Form
            </Text>
          </View>
        </View>

        {modalError && (
          <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
            <AlertTriangle size={16} color="#e11d48" className="mr-2" />
            <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
          </View>
        )}

        {/* SECTION A: INVOICE META DETAILS (STATIONARY/FROZEN) */}
        <View className="flex-col gap-6 mb-6" style={{ zIndex: (isSupDropdownOpen || isPayDropdownOpen || isCalendarOpen || isLocDropdownOpen) ? 3000 : 100, position: 'relative' }}>
            {/* Row 1: Supplier and Invoice Number */}
            <View className="flex-row flex-wrap justify-between gap-y-4" style={{ zIndex: isSupDropdownOpen ? 2000 : 10, position: 'relative' }}>
              
              {/* Supplier dropdown */}
              <View className="flex-1 min-w-[280px] max-w-[49%] gap-1.5 relative" style={{ zIndex: isSupDropdownOpen ? 1000 : 1 }}>
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Supplier *</Text>
                <Pressable
                  onPress={() => {
                    setIsSupDropdownOpen(!isSupDropdownOpen);
                    setIsPayDropdownOpen(false);
                    setIsLocDropdownOpen(false);
                    setOpenLineMatDropdownIdx(null);
                  }}
                  className="flex-row bg-white border border-slate-200 rounded-xl items-center px-3 py-2 justify-between active:scale-[99%]"
                >
                  <View className="flex-row items-center gap-2">
                    <Store size={14} color="#64748b" />
                    <Text className="text-xs font-bold text-slate-700">
                      {purchaseSupplierId
                        ? suppliers.find((s) => s.id === purchaseSupplierId)?.supplier_name
                        : 'Select supplier'}
                    </Text>
                  </View>
                  <ChevronDown size={12} color="#64748b" />
                </Pressable>
                
                <Pressable
                  onPress={() => {
                    setIsSupplierModalOpen(true);
                  }}
                  className="mt-1 flex-row items-center self-start"
                >
                  <Text className="text-[10.5px] font-black text-blue-600">+ Add new supplier</Text>
                </Pressable>

                {isSupDropdownOpen && (
                  <View className="absolute top-[62px] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-1 max-h-[140px] overflow-hidden">
                    <ScrollView nestedScrollEnabled className="flex-col">
                      {suppliers.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() => {
                            setPurchaseSupplierId(s.id);
                            setIsSupDropdownOpen(false);
                          }}
                          className={`p-2 rounded-lg hover:bg-slate-50 active:bg-slate-100 ${
                            purchaseSupplierId === s.id ? 'bg-blue-50/50' : ''
                          }`}
                        >
                          <Text className="text-xs font-bold text-slate-700">{s.supplier_name}</Text>
                        </Pressable>
                      ))}
                      {suppliers.length === 0 && (
                        <View className="p-2 items-center">
                          <Text className="text-[11px] text-slate-400">No suppliers registered</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Invoice / Bill number */}
              <View className="flex-1 min-w-[280px] max-w-[49%] gap-1.5">
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Invoice / Bill Number *</Text>
                <View className="flex-row bg-white border border-slate-200 rounded-xl items-center px-3 py-2 shadow-inner">
                  <Hash size={14} color="#64748b" className="mr-2" />
                  <TextInput
                    value={purchaseInvoiceNum}
                    onChangeText={setPurchaseInvoiceNum}
                    placeholder="e.g., INV-8976"
                    className="flex-1 text-xs text-slate-800 font-bold p-0 outline-none"
                  />
                </View>
              </View>

            </View>

            {/* Row 2: Date, Payment, Freight, Storage */}
            <View className="flex-row flex-wrap justify-between gap-y-4" style={{ zIndex: (isPayDropdownOpen || isCalendarOpen || isLocDropdownOpen) ? 2000 : 5, position: 'relative' }}>
              
              {/* Date Input with Mini Calendar Popup */}
              <View className="flex-1 min-w-[140px] max-w-[23.5%] gap-1.5 relative" style={{ zIndex: 10000 }}>
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Invoice Date *</Text>
                <Pressable
                  onPress={() => {
                    setIsCalendarOpen(!isCalendarOpen);
                    setIsSupDropdownOpen(false);
                    setIsPayDropdownOpen(false);
                    setIsLocDropdownOpen(false);
                    setOpenLineMatDropdownIdx(null);
                  }}
                  className="flex-row bg-white border border-slate-200 rounded-xl items-center px-3 py-2 justify-between active:scale-[99%]"
                >
                  <View className="flex-row items-center gap-2">
                    <Calendar size={14} color="#64748b" />
                    <Text className="text-xs font-bold text-slate-700">{purchaseInvoiceDate}</Text>
                  </View>
                  <ChevronDown size={12} color="#64748b" />
                </Pressable>

                {isCalendarOpen && (
                  <View className="absolute top-[62px] left-0 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-[9999] w-[240px]">
                    {/* Calendar Header */}
                    <View className="flex-row justify-between items-center mb-2 px-1">
                      <Pressable
                        onPress={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                        className="w-5 h-5 rounded-full bg-slate-50 border border-slate-100 items-center justify-center active:scale-90"
                      >
                        <Text className="text-xs font-black text-slate-600">‹</Text>
                      </Pressable>
                      <Text className="text-xs font-black text-slate-800">
                        {calendarDate.toLocaleString('default', { month: 'long' })} {calendarDate.getFullYear()}
                      </Text>
                      <Pressable
                        onPress={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                        className="w-5 h-5 rounded-full bg-slate-50 border border-slate-100 items-center justify-center active:scale-90"
                      >
                        <Text className="text-xs font-black text-slate-600">›</Text>
                      </Pressable>
                    </View>

                    {/* Weekday headers */}
                    <View className="flex-row mb-1">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                        <View key={d} className="w-[14.28%] items-center">
                          <Text className="text-[9px] font-black text-slate-400 uppercase">{d}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Days Grid */}
                    <View className="flex-row flex-wrap">
                      {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, idx) => (
                        <View key={`empty-${idx}`} className="w-[14.28%] py-1" />
                      ))}
                      {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const formattedDay = String(dayNum).padStart(2, '0');
                        const formattedMonth = String(calendarDate.getMonth() + 1).padStart(2, '0');
                        const dateStr = `${calendarDate.getFullYear()}-${formattedMonth}-${formattedDay}`;
                        const isSelected = purchaseInvoiceDate === dateStr;

                        return (
                          <Pressable
                            key={`day-${dayNum}`}
                            onPress={() => {
                              setPurchaseInvoiceDate(dateStr);
                              setIsCalendarOpen(false);
                            }}
                            className={`w-[14.28%] items-center justify-center py-1 rounded-full ${
                              isSelected ? 'bg-blue-600' : 'hover:bg-slate-50 active:bg-slate-100'
                            }`}
                          >
                            <Text className={`text-[10px] font-bold ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                              {dayNum}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              {/* Payment Mode */}
              <View className="flex-1 min-w-[140px] max-w-[23.5%] gap-1.5 relative" style={{ zIndex: isPayDropdownOpen ? 1000 : 1 }}>
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Payment Mode *</Text>
                <Pressable
                  onPress={() => {
                    setIsPayDropdownOpen(!isPayDropdownOpen);
                    setIsSupDropdownOpen(false);
                    setIsLocDropdownOpen(false);
                    setOpenLineMatDropdownIdx(null);
                    setIsCalendarOpen(false);
                  }}
                  className="flex-row bg-white border border-slate-200 rounded-xl items-center px-3 py-2 justify-between active:scale-[99%]"
                >
                  <View className="flex-row items-center gap-2">
                    <CreditCard size={14} color="#64748b" />
                    <Text className="text-xs font-bold text-slate-700">{purchasePaymentMode || 'Select mode'}</Text>
                  </View>
                  <ChevronDown size={12} color="#64748b" />
                </Pressable>

                {isPayDropdownOpen && (
                  <View className="absolute top-[62px] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-1">
                    {['Cash', 'UPI', 'Bank Transfer', 'Credit Card'].map((mode) => (
                      <Pressable
                        key={mode}
                        onPress={() => {
                          setPurchasePaymentMode(mode);
                          setIsPayDropdownOpen(false);
                        }}
                        className={`p-2 rounded-lg hover:bg-slate-50 active:bg-slate-100 ${
                          purchasePaymentMode === mode ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <Text className="text-xs font-bold text-slate-700">{mode}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Freight Charge */}
              <View className="flex-1 min-w-[140px] max-w-[23.5%] gap-1.5">
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Freight (₹)</Text>
                <View className="flex-row bg-white border border-slate-200 rounded-xl items-center px-3 py-2 shadow-inner">
                  <Truck size={14} color="#64748b" className="mr-2" />
                  <TextInput
                    value={purchaseTransportCharges}
                    onChangeText={setPurchaseTransportCharges}
                    placeholder="0.00"
                    keyboardType="numeric"
                    className="flex-1 text-xs text-slate-800 font-bold p-0 outline-none"
                  />
                </View>
              </View>

              {/* Storage Destination */}
              <View className="flex-1 min-w-[140px] max-w-[23.5%] gap-1.5 relative" style={{ zIndex: isLocDropdownOpen ? 1000 : 1 }}>
                <Text className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Storage Destination *</Text>
                <Pressable
                  onPress={() => {
                    setIsLocDropdownOpen(!isLocDropdownOpen);
                    setIsSupDropdownOpen(false);
                    setIsPayDropdownOpen(false);
                    setOpenLineMatDropdownIdx(null);
                    setIsCalendarOpen(false);
                  }}
                  className="flex-row bg-white border border-slate-200 rounded-xl items-center px-3 py-2 justify-between active:scale-[99%]"
                >
                  <View className="flex-row items-center gap-2">
                    <Home size={14} color="#64748b" />
                    <Text className="text-xs font-bold text-slate-700">{purchaseLocation || 'Select location'}</Text>
                  </View>
                  <ChevronDown size={12} color="#64748b" />
                </Pressable>

                {isLocDropdownOpen && (
                  <View className="absolute top-[62px] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-1">
                    {['Dry Storage', 'Freezer', 'Central Kitchen'].map((loc) => (
                      <Pressable
                        key={loc}
                        onPress={() => {
                          setPurchaseLocation(loc);
                          setIsLocDropdownOpen(false);
                        }}
                        className={`p-2 rounded-lg hover:bg-slate-50 active:bg-slate-100 ${
                          purchaseLocation === loc ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <Text className="text-xs font-bold text-slate-700">{loc}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

            </View>
          </View>

          {/* SECTION B: PROCUREMENT LINE ITEMS TABLE (FROZEN HEADERS + SCROLLABLE BODY) */}
          <View className="border-t border-slate-100 pt-4 flex-col flex-1" style={{ zIndex: 1 }}>
            <View className="flex-row justify-between items-center mb-1">
              <View>
                <Text className="text-sm font-black text-slate-800">Procurement Items</Text>
                <Text className="text-[10.5px] font-semibold text-slate-400 mt-0.5">
                  Add the raw materials included in this invoice.
                </Text>
              </View>
              
              <Pressable
                onPress={handleAddPurchaseLine}
                className="bg-[#0066b2] hover:bg-blue-700 flex-row items-center gap-1.5 px-4 py-2.5 rounded-lg active:scale-95 shadow-sm"
              >
                <Plus size={12} color="#ffffff" />
                <Text className="text-xs font-bold text-white">+ Add Item</Text>
              </Pressable>
            </View>

            {/* Structured Columns Header */}
            <View className="flex-row border-b border-slate-100 pb-2 px-1">
              <View style={{ width: '20%' }} className="pr-4">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider">RAW MATERIAL</Text>
              </View>
              <View style={{ width: '10%' }} className="items-center justify-center pr-3">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">UNIT</Text>
              </View>
              <View style={{ width: '11%' }} className="items-center justify-center pr-3">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">QUANTITY</Text>
              </View>
              <View style={{ width: '12%' }} className="items-center justify-center pr-3">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">RATE (₹)</Text>
              </View>
              <View style={{ width: '11%' }} className="items-center justify-center pr-3">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">GST (%)</Text>
              </View>
              <View style={{ width: '13%' }} className="items-center justify-center pr-3">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">GST AMOUNT (₹)</Text>
              </View>
              <View style={{ width: '16%' }} className="items-center justify-center pr-3">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">AMOUNT (₹)</Text>
              </View>
              <View style={{ width: '7%' }} className="items-center justify-center">
                <Text className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">ACTION</Text>
              </View>
            </View>

            {/* Scrollable Table Body List */}
            <ScrollView className="flex-1 mb-2 pr-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View className="flex-col gap-2 pb-6">
                {/* Table Body List */}
                {purchaseItems.length === 0 ? (
              <View className="py-12 bg-white border border-dashed border-slate-200 rounded-2xl items-center justify-center gap-2.5 my-4">
                <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center border border-blue-100">
                  <Boxes size={20} color="#0066b2" />
                </View>
                <Text className="text-xs font-black text-slate-700">No items added yet</Text>
                <Text className="text-[10px] font-semibold text-slate-400">Add your first item to get started</Text>
              </View>
            ) : (
              purchaseItems.map((itm, idx) => {
                const selectedMat = materials.find((m) => m.id === itm.material_id);
                const matUnitShort = selectedMat?.unit_short_name || 'Units';
                const subtotal = (Number(itm.quantity) || 0) * (Number(itm.unit_price) || 0);
                const gstRate = Number(itm.gst || '0');
                const gstAmount = subtotal * (gstRate / 100);
                const amount = subtotal + gstAmount;

                return (
                  <View
                    key={idx}
                    className="flex-row items-center py-3 px-1 border-b border-slate-100 relative"
                    style={{ zIndex: (openLineMatDropdownIdx === idx || openLineGstDropdownIdx === idx || openLineUnitDropdownIdx === idx) ? 999 : 1 }}
                  >
                    
                    {/* Raw Material Select Dropdown */}
                    <View style={{ width: '20%', zIndex: openLineMatDropdownIdx === idx ? 10000 : 1 }} className="relative pr-4">
                      <Pressable
                        onPress={() => {
                          setOpenLineMatDropdownIdx(openLineMatDropdownIdx === idx ? null : idx);
                          setOpenLineUnitDropdownIdx(null);
                          setOpenLineGstDropdownIdx(null);
                          setIsSupDropdownOpen(false);
                          setIsPayDropdownOpen(false);
                          setIsLocDropdownOpen(false);
                          setIsCalendarOpen(false);
                        }}
                        className="flex-row bg-white border border-slate-200 rounded-lg w-full px-2 py-1 items-center justify-between shadow-xs active:scale-[98%]"
                      >
                        <View className="flex-col flex-1 pr-1">
                          <Text className="text-[11px] font-bold text-slate-700 truncate">
                            {selectedMat ? selectedMat.material_name : 'Select raw material'}
                          </Text>
                          {selectedMat && (
                            <Text className="text-[9px] text-slate-400 font-bold mt-0.5">
                              {selectedMat.material_code}
                            </Text>
                          )}
                        </View>
                        <ChevronDown size={10} color="#64748b" />
                      </Pressable>

                      {openLineMatDropdownIdx === idx && (
                        <View className="absolute top-[36px] left-0 right-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-[9999] p-1 max-h-[140px] overflow-hidden" style={{ zIndex: 10000 }}>
                          <ScrollView nestedScrollEnabled className="flex-col">
                            {materials.map((m) => (
                              <Pressable
                                key={m.id}
                                onPress={() => {
                                  handleUpdatePurchaseLineMulti(idx, {
                                    material_id: m.id,
                                    unit_short_name: m.unit_short_name || 'units',
                                  });
                                  setOpenLineMatDropdownIdx(null);
                                }}
                                className={`p-1.5 rounded-md hover:bg-slate-50 active:bg-slate-100 ${
                                  itm.material_id === m.id ? 'bg-blue-50/50' : ''
                                }`}
                              >
                                <Text className="text-[10px] font-semibold text-slate-700">
                                  {m.material_name} ({m.material_code})
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>

                    {/* Unit Box (Dropdown) */}
                    <View style={{ width: '10%', zIndex: openLineUnitDropdownIdx === idx ? 10000 : 1 }} className="items-center justify-center relative pr-3">
                      <Pressable
                        onPress={() => {
                          setOpenLineUnitDropdownIdx(openLineUnitDropdownIdx === idx ? null : idx);
                          setOpenLineMatDropdownIdx(null);
                          setOpenLineGstDropdownIdx(null);
                          setIsSupDropdownOpen(false);
                          setIsPayDropdownOpen(false);
                          setIsLocDropdownOpen(false);
                          setIsCalendarOpen(false);
                        }}
                        className="flex-row bg-white border border-slate-200 rounded-lg w-full px-2 py-1 items-center justify-between shadow-xs active:scale-[98%]"
                      >
                        <Text className="text-[11px] font-bold text-slate-700 truncate text-center flex-1">
                          {itm.unit_short_name || (selectedMat ? matUnitShort : 'Unit')}
                        </Text>
                        <ChevronDown size={10} color="#64748b" />
                      </Pressable>

                      {openLineUnitDropdownIdx === idx && (
                        <View className="absolute top-[36px] left-0 right-3 bg-white border border-slate-200 rounded-xl shadow-lg z-[9999] p-1 max-h-[140px] overflow-hidden" style={{ zIndex: 10000 }}>
                          <ScrollView nestedScrollEnabled className="flex-col">
                            {units.map((u) => (
                              <Pressable
                                key={u.id}
                                onPress={() => {
                                  handleUpdatePurchaseLine(idx, 'unit_short_name', u.short_name);
                                  setOpenLineUnitDropdownIdx(null);
                                }}
                                className={`p-1.5 rounded-md hover:bg-slate-50 active:bg-slate-100 ${
                                  (itm.unit_short_name || matUnitShort) === u.short_name ? 'bg-blue-50/50' : ''
                                }`}
                              >
                                <Text className="text-[10px] font-semibold text-slate-700">
                                  {u.unit_name} ({u.short_name})
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>

                    {/* Quantity input */}
                    <View style={{ width: '11%' }} className="items-center justify-center pr-3">
                      <TextInput
                        value={itm.quantity}
                        onChangeText={(val) => handleUpdatePurchaseLine(idx, 'quantity', val)}
                        placeholder="0.00"
                        keyboardType="numeric"
                        className="bg-white border border-slate-200 rounded-lg w-full px-2 py-1 text-[11px] font-bold text-slate-800 shadow-inner text-center outline-none"
                      />
                    </View>

                    {/* Rate / price input */}
                    <View style={{ width: '12%' }} className="items-center justify-center pr-3">
                      <TextInput
                        value={itm.unit_price}
                        onChangeText={(val) => handleUpdatePurchaseLine(idx, 'unit_price', val)}
                        placeholder="0.00"
                        keyboardType="numeric"
                        className="bg-white border border-slate-200 rounded-lg w-full px-2 py-1 text-[11px] font-bold text-slate-800 shadow-inner text-center outline-none"
                      />
                    </View>

                    {/* GST dropdown */}
                    <View style={{ width: '11%', zIndex: openLineGstDropdownIdx === idx ? 10000 : 1 }} className="items-center justify-center relative pr-3">
                      <Pressable
                        onPress={() => {
                          setOpenLineGstDropdownIdx(openLineGstDropdownIdx === idx ? null : idx);
                          setOpenLineMatDropdownIdx(null);
                          setOpenLineUnitDropdownIdx(null);
                          setIsSupDropdownOpen(false);
                          setIsPayDropdownOpen(false);
                          setIsLocDropdownOpen(false);
                          setIsCalendarOpen(false);
                        }}
                        className="flex-row bg-white border border-slate-200 rounded-lg w-full px-2 py-1 items-center justify-between shadow-xs active:scale-[98%]"
                      >
                        <Text className="text-[11px] font-bold text-slate-700 text-center flex-1">
                          {itm.gst || '0'}%
                        </Text>
                        <ChevronDown size={10} color="#64748b" />
                      </Pressable>

                      {openLineGstDropdownIdx === idx && (
                        <View className="absolute top-[36px] left-0 right-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-[9999] p-1" style={{ zIndex: 10000 }}>
                          {['0', '5', '12', '18', '28'].map((gstVal) => (
                            <Pressable
                              key={gstVal}
                              onPress={() => {
                                handleUpdatePurchaseLine(idx, 'gst', gstVal);
                                setOpenLineGstDropdownIdx(null);
                              }}
                              className={`p-1.5 rounded-md hover:bg-slate-50 active:bg-slate-100 ${
                                itm.gst === gstVal ? 'bg-blue-50/50' : ''
                              }`}
                            >
                              <Text className="text-[10px] font-semibold text-slate-700 text-center">{gstVal}%</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>

                    {/* GST Amount Column */}
                    <View style={{ width: '13%' }} className="items-center justify-center pr-3">
                      <View className="bg-white border border-slate-200 rounded-lg w-full px-2 py-1 items-center justify-center shadow-xs">
                        <Text className="text-[11px] font-bold text-slate-500">
                          {gstAmount.toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {/* Amount Column */}
                    <View style={{ width: '16%' }} className="items-center justify-center pr-3">
                      <Text className="text-xs font-black text-slate-800 text-center">
                        {amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    {/* Row Trash Remove item */}
                    <View style={{ width: '7%' }} className="items-center justify-center">
                      <Pressable
                        onPress={() => handleRemovePurchaseLine(idx)}
                        className="w-8 h-8 bg-rose-50 border border-rose-100 rounded-lg items-center justify-center active:scale-90"
                      >
                        <Trash2 size={12} color="#dc2626" />
                      </Pressable>
                    </View>

                  </View>
                );
              })
            )}

            {/* Add more items button at the bottom of the list */}
            {purchaseItems.length > 0 && (
              <Pressable
                onPress={handleAddPurchaseLine}
                className="mt-4 border border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/20 hover:bg-blue-50/50 py-3 rounded-2xl flex-row items-center justify-center gap-2 active:scale-[99%]"
              >
                <Plus size={14} color="#0066b2" />
                <Text className="text-xs font-black text-blue-600">Add more items to this invoice</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>

      {/* SECTION C: HORIZONTAL CALCULATIONS SUMMARY BAR */}
      <View className="bg-slate-50/70 border border-slate-200/80 rounded-2xl py-3 px-5 flex-row items-center justify-between mt-4 mb-2">
        {/* 1. Total Items */}
        <View className="flex-1 flex-row items-center justify-center pl-2">
          <View className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 items-center justify-center mr-2">
            <Boxes size={14} color="#0066b2" />
          </View>
          <View>
            <Text className="text-xs font-black text-slate-700">{purchaseItems.length}</Text>
            <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Items</Text>
          </View>
        </View>

        <View className="w-[1px] h-8 bg-slate-200" />

        {/* 2. Total Quantity */}
        <View className="flex-1 items-center justify-center">
          <Text className="text-xs font-black text-slate-700">
            {purchaseItems.reduce((acc, itm) => acc + (Number(itm.quantity) || 0), 0).toFixed(2)}
          </Text>
          <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Total Quantity</Text>
        </View>

        <View className="w-[1px] h-8 bg-slate-200" />

        {/* 3. Total Before Tax (Subtotal) */}
        <View className="flex-1 items-center justify-center">
          <Text className="text-xs font-black text-slate-700">
            ₹{purchaseItems.reduce((acc, itm) => acc + (Number(itm.quantity) || 0) * (Number(itm.unit_price) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Total Before Tax</Text>
        </View>

        <View className="w-[1px] h-8 bg-slate-200" />

        {/* 4. Total GST */}
        <View className="flex-1 items-center justify-center">
          <Text className="text-xs font-black text-slate-700">
            ₹{purchaseItems.reduce((acc, itm) => acc + ((Number(itm.quantity) || 0) * (Number(itm.unit_price) || 0) * (Number(itm.gst || '0') / 100)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Total GST</Text>
        </View>

        <View className="w-[1px] h-8 bg-slate-200" />

        {/* 5. Freight */}
        <View className="flex-1 items-center justify-center">
          <Text className="text-xs font-black text-slate-700">
            ₹{(Number(purchaseTransportCharges) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Freight</Text>
        </View>

        <View className="w-[1px] h-8 bg-slate-200" />

        {/* 6. Total Amount */}
        <View className="flex-1 items-end pr-2 justify-center">
          <Text className="text-sm font-black text-[#0066b2]">
            ₹{(
              purchaseItems.reduce((acc, itm) => acc + (Number(itm.quantity) || 0) * (Number(itm.unit_price) || 0), 0) +
              purchaseItems.reduce((acc, itm) => acc + ((Number(itm.quantity) || 0) * (Number(itm.unit_price) || 0) * (Number(itm.gst || '0') / 100)), 0) +
              (Number(purchaseTransportCharges) || 0)
            ).toFixed(2)}
          </Text>
          <Text className="text-[9px] font-bold text-[#0066b2] uppercase tracking-wider mt-0.5">Total Amount</Text>
        </View>
      </View>

          {/* FOOTER ACTIONS */}
          <View className="border-t border-slate-100 pt-4 mt-2 flex-row justify-end items-center gap-3">
            <Pressable
              onPress={() => {
                setActiveTab('purchases');
                setModalError(null);
              }}
              className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl items-center active:scale-95"
            >
              <Text className="text-xs font-bold text-slate-600">Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleRecordPurchase}
              className="px-5 py-2.5 bg-[#0066b2] hover:bg-blue-700 rounded-xl items-center active:scale-95 shadow-sm"
            >
              <Text className="text-xs font-bold text-white">Record Procurement Invoice</Text>
            </Pressable>
          </View>

      </View>
    );
  };

  const renderWastage = () => {
    return (
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-6 flex-wrap gap-4">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-slate-800">Wastage & Spoilage Register</Text>
            <Text className="text-xs text-slate-500">Log spoiled materials, physical damage, and calculate cost impacts.</Text>
          </View>
          <Pressable
            onPress={handleOpenWastageModal}
            className="flex-row bg-rose-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-md active:scale-95 transition-transform"
          >
            <Plus size={14} color="white" className="mr-1" />
            <Text className="text-xs font-bold text-white">Record Wastage</Text>
          </Pressable>
        </View>

        <FlatList
          key="wastage-flatlist"
          data={wastages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 w-full items-center justify-center">
              <AlertTriangle size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No wastage recorded this month</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm">
              <View className="flex-row justify-between items-center flex-wrap gap-2">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 bg-rose-50 rounded-xl items-center justify-center mr-3">
                    <AlertTriangle size={20} color="#e11d48" />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-800">{item.material_name}</Text>
                    <Text className="text-xs text-slate-400">
                      Reason: {item.reason} • Source: {item.location_id}
                    </Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-black text-rose-700">₹{item.cost_impact.toFixed(2)}</Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">Qty lost: {item.quantity}</Text>
                </View>
              </View>

              <View className="flex-row justify-between pt-3 mt-3 border-t border-slate-100 items-center flex-wrap gap-1">
                <Text className="text-[11px] text-slate-400 font-semibold">Recorded by {item.recorded_by}</Text>
                <Text className="text-[11px] text-slate-400">
                  {new Date(item.recorded_at).toLocaleDateString()} {new Date(item.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderTransfers = () => {
    return (
      <View className="flex-1">
        {/* Branch Simulator switcher */}
        <View className="bg-slate-100 border border-slate-200 p-3 rounded-2xl mb-6 flex-row items-center justify-between flex-wrap gap-3">
          <View className="flex-row items-center">
            <View className="w-2.5 h-2.5 bg-blue-600 rounded-full mr-2" />
            <Text className="text-xs font-black text-slate-700 uppercase tracking-wider">Simulate Active Branch:</Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setSimulatedBranchId('bbbbbbbb-0000-0000-0000-000000000001')}
              className={`px-3 py-1.5 rounded-xl border ${
                simulatedBranchId === 'bbbbbbbb-0000-0000-0000-000000000001'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-white border-slate-200'
              }`}
              style={{ minHeight: 40 }}
            >
              <Text
                className={`text-[11px] font-bold ${
                  simulatedBranchId === 'bbbbbbbb-0000-0000-0000-000000000001' ? 'text-white' : 'text-slate-600'
                }`}
              >
                Main Restaurant
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSimulatedBranchId('cccccccc-0000-0000-0000-000000000001')}
              className={`px-3 py-1.5 rounded-xl border ${
                simulatedBranchId === 'cccccccc-0000-0000-0000-000000000001'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-white border-slate-200'
              }`}
              style={{ minHeight: 40 }}
            >
              <Text
                className={`text-[11px] font-bold ${
                  simulatedBranchId === 'cccccccc-0000-0000-0000-000000000001' ? 'text-white' : 'text-slate-600'
                }`}
              >
                Central Kitchen
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Header Title with Primary Action */}
        <View className="flex-row justify-between items-center mb-6 flex-wrap gap-4">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-slate-800">Internal Supply Chain & Transfers</Text>
            <Text className="text-xs text-slate-500">
              Manage transfer requests between your outlets and the Central Kitchen.
            </Text>
          </View>
          {transferSubTab === 'requests' && simulatedBranchId === 'bbbbbbbb-0000-0000-0000-000000000001' && (
            <Pressable
              onPress={handleOpenNewRequestModal}
              className="flex-row bg-blue-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-md active:scale-95"
              style={{ minHeight: 44 }}
            >
              <Plus size={14} color="white" className="mr-1" />
              <Text className="text-xs font-bold text-white">Create Transfer Request</Text>
            </Pressable>
          )}
          {transferSubTab === 'adjustments' && (
            <Pressable
              onPress={handleOpenAdjustmentModal}
              className="flex-row bg-blue-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-md active:scale-95"
              style={{ minHeight: 44 }}
            >
              <Plus size={14} color="white" className="mr-1" />
              <Text className="text-xs font-bold text-white">Manual Adjustment</Text>
            </Pressable>
          )}
        </View>

        {/* Sub tabs selector */}
        <View className="flex-row bg-slate-100 p-1 rounded-2xl mb-4 border border-slate-200/60 max-w-md">
          <Pressable
            onPress={() => setTransferSubTab('requests')}
            className={`flex-1 items-center justify-center py-2 rounded-xl ${
              transferSubTab === 'requests' ? 'bg-white shadow-sm' : ''
            }`}
            style={{ minHeight: 40 }}
          >
            <Text className={`text-xs font-bold ${transferSubTab === 'requests' ? 'text-blue-700' : 'text-slate-500'}`}>
              Requests
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTransferSubTab('dispatches')}
            className={`flex-1 items-center justify-center py-2 rounded-xl ${
              transferSubTab === 'dispatches' ? 'bg-white shadow-sm' : ''
            }`}
            style={{ minHeight: 40 }}
          >
            <Text className={`text-xs font-bold ${transferSubTab === 'dispatches' ? 'text-blue-700' : 'text-slate-500'}`}>
              Dispatches
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTransferSubTab('adjustments')}
            className={`flex-1 items-center justify-center py-2 rounded-xl ${
              transferSubTab === 'adjustments' ? 'bg-white shadow-sm' : ''
            }`}
            style={{ minHeight: 40 }}
          >
            <Text className={`text-xs font-bold ${transferSubTab === 'adjustments' ? 'text-blue-700' : 'text-slate-500'}`}>
              Adjustments
            </Text>
          </Pressable>
        </View>

        {/* Sub tab contents */}
        {transferSubTab === 'requests' && (
          <FlatList
            key="requests-list"
            data={transferRequests}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="py-20 w-full items-center justify-center">
                <RefreshCw size={48} color="#94a3b8" className="mb-4" />
                <Text className="text-base font-bold text-slate-500">No transfer requests logged</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isCreator = item.to_branch_id === simulatedBranchId;
              const isSupplier = item.from_branch_id === simulatedBranchId;
              
              let statusColor = 'bg-slate-100 text-slate-600 border-slate-200';
              if (item.status === 'Pending') statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
              else if (item.status === 'Approved') statusColor = 'bg-blue-50 text-blue-700 border-blue-200';
              else if (item.status === 'Partially Dispatched') statusColor = 'bg-purple-50 text-purple-700 border-purple-200';
              else if (item.status === 'Dispatched') statusColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
              else if (item.status === 'Completed') statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              else if (item.status === 'Rejected') statusColor = 'bg-rose-50 text-rose-700 border-rose-200';
              else if (item.status === 'Cancelled') statusColor = 'bg-slate-100 text-slate-500 border-slate-200';

              return (
                <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm">
                  <View className="flex-row justify-between items-start flex-wrap gap-2 mb-2">
                    <View>
                      <Text className="text-xs font-black text-slate-400 uppercase tracking-wider">{item.request_number}</Text>
                      <Text className="text-sm font-bold text-slate-800 mt-0.5">
                        {item.to_branch_name} Request
                      </Text>
                    </View>
                    <View className={`border rounded-lg px-2.5 py-1 ${statusColor}`}>
                      <Text className="text-[10px] font-black uppercase tracking-wider">{item.status}</Text>
                    </View>
                  </View>

                  <View className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100">
                    <Text className="text-xs text-slate-500 font-medium">
                      From supplying branch: <Text className="font-bold text-slate-700">{item.from_branch_name}</Text>
                    </Text>
                    <Text className="text-xs text-slate-500 font-medium mt-1">
                      Request Date: <Text className="font-bold text-slate-700">{new Date(item.request_date).toLocaleDateString()}</Text>
                    </Text>
                    {item.remarks && (
                      <Text className="text-xs text-slate-400 italic mt-2">"{item.remarks}"</Text>
                    )}
                  </View>

                  {/* Actions */}
                  <View className="flex-row justify-between items-center flex-wrap gap-2">
                    <Pressable
                      onPress={() => handleOpenEventsModal(item)}
                      className="flex-row items-center"
                      style={{ minHeight: 44 }}
                    >
                      <Info size={12} color="#475569" className="mr-1" />
                      <Text className="text-xs font-bold text-slate-600">Event Logs</Text>
                    </Pressable>

                    <View className="flex-row gap-2">
                      {isCreator && item.status === 'Pending' && (
                        <Pressable
                          onPress={() => handleProcessCancelRequest(item.id)}
                          className="bg-rose-50 border border-rose-200 py-1.5 px-3 rounded-lg active:scale-95"
                          style={{ minHeight: 44 }}
                        >
                          <Text className="text-xs font-bold text-rose-700">Cancel Request</Text>
                        </Pressable>
                      )}
                      
                      {isSupplier && (item.status === 'Pending' || item.status === 'Approved' || item.status === 'Partially Dispatched') && (
                        <Pressable
                          onPress={() => handleOpenApprovalModal(item)}
                          className="bg-blue-600 py-1.5 px-3 rounded-lg active:scale-95 shadow-sm"
                          style={{ minHeight: 44 }}
                        >
                          <Text className="text-xs font-bold text-white">
                            {item.status === 'Pending' ? 'Review & Approve' : 'Dispatch Stock'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {transferSubTab === 'dispatches' && (
          <FlatList
            key="dispatches-list"
            data={dispatchesList}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="py-20 w-full items-center justify-center">
                <Truck size={48} color="#94a3b8" className="mb-4" />
                <Text className="text-base font-bold text-slate-500">No dispatches logged</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isReceiver = item.to_branch_id === simulatedBranchId;
              const isReceived = item.status === 'Received';
              
              let statusColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
              if (isReceived) statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';

              return (
                <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm">
                  <View className="flex-row justify-between items-start flex-wrap gap-2 mb-2">
                    <View>
                      <Text className="text-xs font-black text-slate-400 uppercase tracking-wider">{item.dispatch_number}</Text>
                      <Text className="text-sm font-bold text-slate-800 mt-0.5">
                        {item.from_branch_name} → {item.to_branch_name}
                      </Text>
                    </View>
                    <View className={`border rounded-lg px-2.5 py-1 ${statusColor}`}>
                      <Text className="text-[10px] font-black uppercase tracking-wider">{item.status}</Text>
                    </View>
                  </View>

                  <View className="bg-slate-50 rounded-xl p-3 mb-3 border border-slate-100">
                    <Text className="text-xs text-slate-500 font-medium">
                      Date shipped: <Text className="font-bold text-slate-700">{new Date(item.dispatch_date).toLocaleDateString()}</Text>
                    </Text>
                    {item.remarks && (
                      <Text className="text-xs text-slate-400 italic mt-2">"{item.remarks}"</Text>
                    )}
                  </View>

                  {isReceiver && !isReceived && (
                    <Pressable
                      onPress={() => handleOpenReceiveModal(item)}
                      className="bg-emerald-600 py-2 items-center justify-center rounded-xl shadow-sm active:scale-95"
                      style={{ minHeight: 44 }}
                    >
                      <Text className="text-xs font-bold text-white">Verify & Receive Shipment</Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        )}

        {transferSubTab === 'adjustments' && (
          <FlatList
            key="adjustments-list"
            data={adjustments}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="py-20 w-full items-center justify-center">
                <RefreshCw size={48} color="#94a3b8" className="mb-4" />
                <Text className="text-base font-bold text-slate-500">No manual adjustments recorded</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isAdd = item.adjustment_type === 'Add';
              return (
                <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm">
                  <View className="flex-row justify-between items-center flex-wrap gap-2">
                    <View className="flex-row items-center">
                      <View className={`w-10 h-10 ${isAdd ? 'bg-emerald-50' : 'bg-rose-50'} rounded-xl items-center justify-center mr-3`}>
                        <RefreshCw size={20} color={isAdd ? '#10b981' : '#ef4444'} />
                      </View>
                      <View>
                        <Text className="text-sm font-bold text-slate-800">{item.material_name}</Text>
                        <Text className="text-xs text-slate-400">
                          Reason: {item.reason} • Location: {item.location_id}
                        </Text>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className={`text-sm font-black ${isAdd ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isAdd ? '+' : '-'}{item.quantity}
                      </Text>
                      <Text className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(item.adjustment_date).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  {item.remarks && (
                    <View className="bg-slate-50 rounded-lg p-2.5 mt-2.5 border border-slate-100">
                      <Text className="text-[11px] text-slate-500 italic">Remarks: {item.remarks}</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    );
  };

  const renderReports = () => {
    // Helper to render Valuation & Wastage (the existing reports)
    const renderValuation = () => (
      <View className="flex-row justify-between flex-wrap gap-4">
        <View className="flex-1 min-w-[320px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
          <Text className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Stock Valuation by Category</Text>
          {categories.map((c) => {
            const catMats = materials.filter((m) => m.category_id === c.id);
            const val = catMats.reduce((acc, curr) => acc + curr.current_stock * curr.average_cost, 0);
            const totalVal = materials.reduce((acc, curr) => acc + curr.current_stock * curr.average_cost, 0) || 1;
            const pct = Math.round((val / totalVal) * 100);
            return (
              <View key={c.id} className="mb-4">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-xs font-semibold text-slate-600">{c.category_name}</Text>
                  <Text className="text-xs font-bold text-slate-800">
                    ₹{val.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({pct}%)
                  </Text>
                </View>
                <View className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <View className="bg-blue-600 h-full" style={{ width: `${pct}%` }} />
                </View>
              </View>
            );
          })}
        </View>

        <View className="flex-1 min-w-[320px] bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
          <Text className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Wastage Leakage Analysis</Text>
          <View className="flex-row items-center justify-between p-4 bg-rose-50/50 border border-rose-100 rounded-2xl mb-4">
            <View>
              <Text className="text-[9px] font-black text-rose-800 uppercase">Monthly Leakage</Text>
              <Text className="text-2xl font-black text-rose-900 mt-1">
                ₹{kpis ? kpis.wastageCostImpactThisMonth.toLocaleString() : '1,440'}
              </Text>
            </View>
            <View className="bg-rose-100 rounded-xl p-2">
              <AlertTriangle size={20} color="#dc2626" />
            </View>
          </View>
          <Text className="text-xs text-slate-500 leading-relaxed font-medium">
            Leakage primarily consists of Spoilage (62.5%) and Expirations (24.3%). We advise adjusting reorder levels
            to maintain optimal raw meat and dairy stocks.
          </Text>
        </View>
      </View>
    );

    // Helper to render Margin Analysis Dashboard
    const renderMarginAnalysis = () => {
      // Find products that have recipes linked
      const marginProducts = products.filter(p => p.recipe_id);
      
      // Calculate average margins
      let totalCost = 0;
      let totalRetail = 0;
      let profitProductsCount = 0;
      let lowMarginProductsCount = 0;

      const items = marginProducts.map(p => {
        const recipe = recipes.find(r => r.id === p.recipe_id);
        const recipeCost = recipe ? recipe.cost_snapshot : 0;
        const marginAmt = p.price - recipeCost;
        const marginPct = p.price > 0 ? (marginAmt / p.price) * 100 : 0;
        
        totalCost += recipeCost;
        totalRetail += p.price;
        if (marginPct >= 50) profitProductsCount++;
        else lowMarginProductsCount++;

        return {
          ...p,
          recipeCost,
          marginAmt,
          marginPct
        };
      });

      const avgFoodCostPct = totalRetail > 0 ? (totalCost / totalRetail) * 100 : 0;
      const avgMarginPct = totalRetail > 0 ? ((totalRetail - totalCost) / totalRetail) * 100 : 0;

      return (
        <View className="flex-col gap-6">
          {/* Summary Cards */}
          <View className="flex-row gap-4 flex-wrap">
            <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
              <Text className="text-slate-500 font-semibold text-xs">Target Food Cost %</Text>
              <Text className="text-2xl font-black text-slate-800 mt-1 font-mono">{avgFoodCostPct.toFixed(1)}%</Text>
              <Text className="text-[10px] text-slate-400 mt-1">Lower is better (ideal: 25-35%)</Text>
            </View>
            <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
              <Text className="text-slate-500 font-semibold text-xs">Average Profit Margin %</Text>
              <Text className={`text-2xl font-black mt-1 font-mono ${avgMarginPct >= 60 ? 'text-emerald-600' : 'text-amber-500'}`}>
                {avgMarginPct.toFixed(1)}%
              </Text>
              <Text className="text-[10px] text-slate-400 mt-1">Higher is better (target: &gt;60%)</Text>
            </View>
            <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
              <Text className="text-slate-500 font-semibold text-xs">Healthy Margin Products</Text>
              <Text className="text-2xl font-black text-emerald-600 mt-1 font-mono">{profitProductsCount}</Text>
              <Text className="text-[10px] text-slate-400 mt-1">Products with margin &gt;= 50%</Text>
            </View>
            <View className="flex-1 min-w-[200px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
              <Text className="text-slate-500 font-semibold text-xs">Low Margin Warning</Text>
              <Text className={`text-2xl font-black mt-1 font-mono ${lowMarginProductsCount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                {lowMarginProductsCount}
              </Text>
              <Text className="text-[10px] text-slate-400 mt-1">Products with margin &lt; 50%</Text>
            </View>
          </View>

          {/* Table */}
          <View className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <Text className="text-sm font-black text-slate-800 mb-4 uppercase tracking-wider">Product Cost & Profitability Ledger</Text>
            {items.length === 0 ? (
              <View className="py-12 items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl">
                <Text className="text-slate-400 text-xs font-semibold">No products currently linked to recipe schemas.</Text>
              </View>
            ) : (
              <View className="border border-slate-200 rounded-2xl overflow-hidden">
                <View className="flex-row bg-slate-50 p-3 border-b border-slate-200">
                  <Text className="flex-[2] text-[10px] font-black text-slate-500 uppercase">Product</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Retail Price</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Recipe Cost</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Margin</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Margin %</Text>
                </View>
                <FlatList
                  data={items}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const isHealthy = item.marginPct >= 50;
                    return (
                      <View className="flex-row p-3 border-b border-slate-100 items-center">
                        <Text className="flex-[2] text-xs font-bold text-slate-800">{item.name}</Text>
                        <Text className="flex-1 text-xs font-semibold text-slate-600 text-right font-mono">₹{item.price.toFixed(2)}</Text>
                        <Text className="flex-1 text-xs font-semibold text-slate-600 text-right font-mono">₹{item.recipeCost.toFixed(2)}</Text>
                        <Text className={`flex-1 text-xs font-bold text-right font-mono ${isHealthy ? 'text-emerald-600' : 'text-amber-600'}`}>
                          ₹{item.marginAmt.toFixed(2)}
                        </Text>
                        <View className="flex-1 items-end justify-center">
                          <View className={`px-2 py-0.5 rounded border ${isHealthy ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                            <Text className={`text-[10px] font-mono font-black ${isHealthy ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {item.marginPct.toFixed(1)}%
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  }}
                />
              </View>
            )}
          </View>
        </View>
      );
    };

    // Helper to render Theoretical vs Actual Variance Report
    const renderVarianceReport = () => {
      // Aggregate consumption and variance for each material
      const items = materials.map(m => {
        const branchLedger = stockLedger.filter(l => l.branch_id === simulatedBranchId && l.material_id === m.id);

        // Theoretical: Recipe Consumption qty_out
        const theoreticalQty = branchLedger
          .filter(l => l.transaction_type === 'Recipe Consumption')
          .reduce((acc, curr) => acc + (curr.qty_out || 0), 0);

        // Actual: Recipe Consumption + Wastage + manual Stock audit adjustments + Transfers Out
        const recipeCons = theoreticalQty;
        const wastageCons = branchLedger
          .filter(l => l.transaction_type === 'Wastage')
          .reduce((acc, curr) => acc + (curr.qty_out || 0), 0);
        const adjustmentDeductions = branchLedger
          .filter(l => l.transaction_type === 'Adjustment')
          .reduce((acc, curr) => acc + (curr.qty_out || 0) - (curr.qty_in || 0), 0);
        const transferDeductions = branchLedger
          .filter(l => l.transaction_type === 'Transfer Out')
          .reduce((acc, curr) => acc + (curr.qty_out || 0), 0);

        const actualQty = recipeCons + wastageCons + adjustmentDeductions + transferDeductions;
        const varianceQty = actualQty - theoreticalQty;
        const costImpact = varianceQty * (m.average_cost || 0);

        return {
          ...m,
          theoreticalQty,
          actualQty,
          varianceQty,
          costImpact
        };
      }).filter(itm => itm.theoreticalQty > 0 || itm.actualQty > 0);

      const totalLossImpact = items.reduce((acc, curr) => acc + (curr.costImpact > 0 ? curr.costImpact : 0), 0);

      return (
        <View className="flex-col gap-6">
          {/* Summary KPIs */}
          <View className="flex-row gap-4 flex-wrap">
            <View className="flex-1 min-w-[240px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-4">
              <View className="p-3 bg-rose-50 border border-rose-100 rounded-2xl">
                <AlertTriangle size={20} color="#dc2626" />
              </View>
              <View>
                <Text className="text-slate-500 font-semibold text-xs">Total Variance Cost Impact</Text>
                <Text className="text-2xl font-black text-rose-600 mt-1 font-mono">₹{totalLossImpact.toFixed(2)}</Text>
                <Text className="text-[10px] text-slate-400 mt-1 font-medium">Financial value of inventory discrepancies</Text>
              </View>
            </View>
            <View className="flex-1 min-w-[240px] bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex-row items-center gap-4">
              <View className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <Check size={20} color="#16a34a" />
              </View>
              <View>
                <Text className="text-slate-500 font-semibold text-xs">Discrepancy Materials Count</Text>
                <Text className="text-2xl font-black text-slate-800 mt-1 font-mono">
                  {items.filter(itm => Math.abs(itm.varianceQty) > 0.01).length}
                </Text>
                <Text className="text-[10px] text-slate-400 mt-1 font-medium">Ingredients with physical deviations</Text>
              </View>
            </View>
          </View>

          {/* Variance Ledger Table */}
          <View className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <Text className="text-sm font-black text-slate-800 mb-4 uppercase tracking-wider">Theoretical vs Actual Variance Register</Text>
            {items.length === 0 ? (
              <View className="py-12 items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl">
                <Text className="text-slate-400 text-xs font-semibold">No physical or theoretical consumption recorded for this branch.</Text>
              </View>
            ) : (
              <View className="border border-slate-200 rounded-2xl overflow-hidden">
                <View className="flex-row bg-slate-50 p-3 border-b border-slate-200">
                  <Text className="flex-[2] text-[10px] font-black text-slate-500 uppercase">Ingredient</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Theoretical</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Actual</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Variance</Text>
                  <Text className="flex-1 text-[10px] font-black text-slate-500 uppercase text-right">Cost Impact</Text>
                </View>
                <FlatList
                  data={items}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const hasDiscrepancy = Math.abs(item.varianceQty) > 0.01;
                    return (
                      <View className="flex-row p-3 border-b border-slate-100 items-center">
                        <View className="flex-[2]">
                          <Text className="text-xs font-bold text-slate-800">{item.material_name}</Text>
                          <Text className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1 py-0.5 rounded uppercase self-start mt-1">
                            {item.material_code}
                          </Text>
                        </View>
                        <Text className="flex-1 text-xs font-semibold text-slate-600 text-right font-mono">
                          {item.theoreticalQty.toFixed(2)} {item.unit_short_name}
                        </Text>
                        <Text className="flex-1 text-xs font-semibold text-slate-600 text-right font-mono">
                          {item.actualQty.toFixed(2)} {item.unit_short_name}
                        </Text>
                        <Text className={`flex-1 text-xs font-bold text-right font-mono ${item.varianceQty > 0.01 ? 'text-rose-600' : 'text-slate-600'}`}>
                          {item.varianceQty > 0 ? '+' : ''}{item.varianceQty.toFixed(2)} {item.unit_short_name}
                        </Text>
                        <Text className={`flex-1 text-xs font-bold text-right font-mono ${item.costImpact > 0.01 ? 'text-rose-600' : 'text-slate-600'}`}>
                          ₹{item.costImpact.toFixed(2)}
                        </Text>
                      </View>
                    );
                  }}
                />
              </View>
            )}
          </View>
        </View>
      );
    };

    return (
      <View className="flex-col gap-6">
        {/* Branch Simulator & Reports Sub-Tab switcher */}
        <View className="bg-slate-100 border border-slate-200 p-3 rounded-2xl mb-1 flex-row items-center justify-between flex-wrap gap-3">
          <View className="flex-row items-center gap-4 flex-wrap">
            <View className="flex-row items-center">
              <View className="w-2.5 h-2.5 bg-blue-600 rounded-full mr-2" />
              <Text className="text-xs font-black text-slate-700 uppercase tracking-wider">Reports Branch:</Text>
            </View>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setSimulatedBranchId('bbbbbbbb-0000-0000-0000-000000000001')}
                className={`px-3 py-1.5 rounded-xl border ${
                  simulatedBranchId === 'bbbbbbbb-0000-0000-0000-000000000001'
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-slate-200'
                }`}
                style={{ minHeight: 40 }}
              >
                <Text className={`text-[11px] font-bold ${simulatedBranchId === 'bbbbbbbb-0000-0000-0000-000000000001' ? 'text-white' : 'text-slate-600'}`}>
                  Main Restaurant
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSimulatedBranchId('cccccccc-0000-0000-0000-000000000001')}
                className={`px-3 py-1.5 rounded-xl border ${
                  simulatedBranchId === 'cccccccc-0000-0000-0000-000000000001'
                    ? 'bg-blue-600 border-blue-600'
                    : 'bg-white border-slate-200'
                }`}
                style={{ minHeight: 40 }}
              >
                <Text className={`text-[11px] font-bold ${simulatedBranchId === 'cccccccc-0000-0000-0000-000000000001' ? 'text-white' : 'text-slate-600'}`}>
                  Central Kitchen
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="flex-row gap-1">
            <Pressable
              onPress={() => setReportsSubTab('valuation')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                reportsSubTab === 'valuation'
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-slate-200 text-text-secondary active:bg-slate-50'
              }`}
            >
              <Text className={`text-[10px] font-bold ${reportsSubTab === 'valuation' ? 'text-white' : 'text-text-secondary'}`}>
                Valuation & Wastage
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setReportsSubTab('margins')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                reportsSubTab === 'margins'
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-slate-200 text-text-secondary active:bg-slate-50'
              }`}
            >
              <Text className={`text-[10px] font-bold ${reportsSubTab === 'margins' ? 'text-white' : 'text-text-secondary'}`}>
                Margin Analysis
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setReportsSubTab('variance')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                reportsSubTab === 'variance'
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-slate-200 text-text-secondary active:bg-slate-50'
              }`}
            >
              <Text className={`text-[10px] font-bold ${reportsSubTab === 'variance' ? 'text-white' : 'text-text-secondary'}`}>
                Variance Report
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Dynamic sub tab layout content */}
        {reportsSubTab === 'valuation' && renderValuation()}
        {reportsSubTab === 'margins' && renderMarginAnalysis()}
        {reportsSubTab === 'variance' && renderVarianceReport()}
      </View>
    );
  };

  const renderAudit = () => {
    return (
      <View className="flex-row justify-between flex-wrap gap-6">
        <View className="flex-1 min-w-[320px] flex-col">
          <Text className="text-sm font-bold text-slate-800 mb-4">Active Stock Alerts & Thresholds</Text>
          <FlatList
            key="alerts-flatlist"
            data={alerts}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="py-20 w-full items-center justify-center">
                <Check size={48} color="#16a34a" className="mb-4" />
                <Text className="text-base font-bold text-slate-500">All alerts cleared</Text>
              </View>
            }
            renderItem={({ item }) => {
              let alertColor = 'border-amber-200 bg-amber-50/50';
              if (item.alert_type === 'Out of Stock') alertColor = 'border-rose-200 bg-rose-50/50';

              return (
                <View className={`border rounded-xl p-3 mb-3 ${alertColor} shadow-sm`}>
                  <View className="flex-row justify-between items-start mb-2 flex-wrap gap-1">
                    <Text className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700">
                      {item.alert_type}
                    </Text>
                    {!item.is_read && (
                      <Pressable
                        onPress={() => handleMarkAlert(item.id)}
                        className="bg-slate-200 border border-slate-300 rounded px-2 py-0.5"
                      >
                        <Text className="text-[9px] font-bold text-slate-600">Acknowledge</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text className="text-xs font-semibold text-slate-800 leading-relaxed mb-1">{item.message}</Text>
                  <Text className="text-[9px] text-slate-400 italic">{new Date(item.created_at).toLocaleString()}</Text>
                </View>
              );
            }}
          />
        </View>

        <View className="flex-1 min-w-[320px] flex-col">
          <Text className="text-sm font-bold text-slate-800 mb-4">Operations Audit Log</Text>
          <FlatList
            key="audit-flatlist"
            data={auditLogs}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="py-20 w-full items-center justify-center">
                <FileText size={48} color="#94a3b8" className="mb-4" />
                <Text className="text-base font-bold text-slate-500">No logs found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
                <View className="flex-row justify-between items-center mb-1 flex-wrap gap-1">
                  <Text className="text-xs font-bold text-slate-800">Module: {item.module_name.toUpperCase()}</Text>
                  <Text className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase">
                    {item.action_type}
                  </Text>
                </View>
                <Text className="text-[10px] text-slate-500 mb-2">Recorded on item: {item.performed_by}</Text>
                <View className="flex-row justify-between items-center border-t border-slate-50 pt-2 flex-wrap gap-1">
                  <Text className="text-[10px] text-slate-400 font-semibold">Performed by: {item.performed_by}</Text>
                  <Text className="text-[10px] text-slate-400">
                    {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      </View>
    );
  };

  const renderUnits = () => {
    return (
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-6 flex-wrap gap-4">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-slate-800">Units of Measurement (UoM)</Text>
            <Text className="text-xs text-slate-500">Ensure standardized quantities across recipes, purchases, and wastage sheets.</Text>
          </View>
          <Pressable
            onPress={() => handleOpenUnitModal()}
            className="flex-row bg-blue-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-sm active:scale-95 transition-transform"
          >
            <Plus size={14} color="white" className="mr-1" />
            <Text className="text-xs font-bold text-white">Add Unit</Text>
          </Pressable>
        </View>

        <FlatList
          data={units}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 w-full items-center justify-center">
              <Boxes size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No units defined</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-4">
                <View className="w-10 h-10 bg-blue-50 rounded-xl items-center justify-center mr-3">
                  <Text className="text-xs font-black text-blue-700">{item.short_name}</Text>
                </View>
                <View>
                  <Text className="text-sm font-black text-slate-800">{item.unit_name}</Text>
                  <Text className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-md uppercase mt-0.5 self-start">
                    Code: {item.unit_code}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-1.5">
                <Pressable
                  onPress={() => handleOpenUnitModal(item)}
                  className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg items-center justify-center active:scale-95"
                >
                  <FileText size={14} color="#64748b" />
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteUnitItem(item.id)}
                  className="w-8 h-8 bg-slate-50 border border-rose-100 rounded-lg items-center justify-center active:scale-95"
                >
                  <Trash2 size={14} color="#e11d48" />
                </Pressable>
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderCategories = () => {
    return (
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-6 flex-wrap gap-4">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-slate-800">Classification & Product Categories</Text>
            <Text className="text-xs text-slate-500">Audit stock lists, categorize materials, and trace spoils targets.</Text>
          </View>
          <Pressable
            onPress={() => handleOpenCategoryModal()}
            className="flex-row bg-blue-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-sm active:scale-95 transition-transform"
          >
            <Plus size={14} color="white" className="mr-1" />
            <Text className="text-xs font-bold text-white">Add Category</Text>
          </Pressable>
        </View>

        <FlatList
          key="categories-flatlist"
          data={categories}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 w-full items-center justify-center">
              <Tag size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No categories logged</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-4">
                <View className="w-10 h-10 bg-blue-50 rounded-xl items-center justify-center mr-3">
                  <Tag size={18} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center mb-0.5 flex-wrap">
                    <Text className="text-sm font-black text-slate-800 mr-2">{item.category_name}</Text>
                    <Text className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-md uppercase">
                      {item.category_code}
                    </Text>
                  </View>
                  <Text className="text-xs text-slate-400 font-semibold">{item.description || 'No description logged.'}</Text>
                </View>
              </View>

              <View className="flex-row items-center gap-1.5">
                <Pressable
                  onPress={() => handleOpenCategoryModal(item)}
                  className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg items-center justify-center active:scale-95"
                >
                  <FileText size={14} color="#64748b" />
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteCategoryItem(item.id)}
                  className="w-8 h-8 bg-slate-50 border border-rose-100 rounded-lg items-center justify-center active:scale-95"
                >
                  <Trash2 size={14} color="#e11d48" />
                </Pressable>
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderRecipes = () => {
    return <RecipeManagement />;
  };

  const renderActiveTabPanel = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'materials':
        return renderMaterials();
      case 'purchases':
        return renderPurchases();
      case 'suppliers':
        return renderSuppliers();
      case 'wastage':
        return renderWastage();
      case 'transfers':
        return renderTransfers();
      case 'recipes':
        return renderRecipes();
      case 'reports':
        return renderReports();
      case 'alerts':
        return renderAudit();
      case 'units':
        return renderUnits();
      case 'categories':
        return renderCategories();
      case 'record_purchase':
        return renderRecordPurchaseScreen();
      default:
        return renderDashboard();
    }
  };

  const getTabTitle = () => {
    if (activeTab === 'record_purchase') {
      return 'Record Procurement Invoice';
    }
    const matched = SIDEBAR_ITEMS.find((s) => s.id === activeTab);
    return matched ? matched.label : 'Inventory Center';
  };

  const getTabSubtitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Overview of your inventory performance';
      case 'materials':
        return 'Manage raw ingredients and physical stocks';
      case 'purchases':
        return 'Record and trace procurement billing history';
      case 'suppliers':
        return 'Supplier records and payments directory';
      case 'wastage':
        return 'Maintain controls on spoils and ingredient losses';
      case 'transfers':
        return 'Ledger adjustments and internal branch transfers';
      case 'recipes':
        return 'Standardize menu recipe details, cost breakdown and margins';
      case 'reports':
        return 'Deep analytics and monthly margin metrics';
      case 'alerts':
        return 'Critical system logs and low stock notifications';
      case 'units':
        return 'Configure global recipe weight units';
      case 'categories':
        return 'Classify storage items and classify waste';
      case 'record_purchase':
        return 'Enter invoice details and items to update your inventory';
      default:
        return 'Enterprise Restaurant Control Cockpit';
    }
  };

  if (isLoading && !kpis) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-sm text-slate-400 mt-2">Compiling inventory cockpit ledger...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 flex-row">
      {/* LEFT SIDEBAR (Web/Tablet view) */}
      {width >= 768 && activeTab !== 'record_purchase' && (
        <View style={{ width: 180, minWidth: 180, maxWidth: 180, overflow: 'hidden' }} className="flex-col h-full">
          <LinearGradient
            colors={['#0251b8', '#013b8c', '#012f70']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <SidebarDecoration />

          <View style={{ width: '100%', alignSelf: 'stretch', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}>
            <Image
              source={leLabanLogo}
              style={{ height: 48, width: 75, resizeMode: 'contain', opacity: 0.96 }}
              accessibilityLabel="Le Leban logo"
            />
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: -0.3, color: '#FFFFFF', marginTop: 4 }}>
              Inventory Center
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: '#10b981' }} />
              <Text style={{ marginLeft: 4, fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.8)' }}>
                Online
              </Text>
            </View>
          </View>

          <ScrollView className="flex-1 px-3 py-4 gap-1" showsVerticalScrollIndicator={false}>
            {/* Dashboard */}
            <Pressable
              onPress={() => {
                setActiveTab('dashboard');
                setIsMobileMenuOpen(false);
              }}
              style={({ hovered, pressed }: any) => [
                {
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  height: 40,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                },
                activeTab === 'dashboard' && {
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(255,255,255,0.10)',
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.08,
                  shadowRadius: 12,
                  elevation: 2,
                },
                activeTab !== 'dashboard' && hovered && {
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  transform: [{ translateX: 2 }],
                },
                pressed && {
                  opacity: 0.85,
                  transform: [{ scale: 0.98 }]
                }
              ]}
            >
              {activeTab === 'dashboard' && (
                <LinearGradient
                  colors={['rgba(58,120,220,0.95)', 'rgba(35,95,190,0.95)']}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14 }}
                />
              )}
              <BarChart3 size={14} color={activeTab === 'dashboard' ? '#ffffff' : 'rgba(255, 255, 255, 0.8)'} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: activeTab === 'dashboard' ? '600' : '500',
                  color: activeTab === 'dashboard' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.8)',
                }}
              >
                Dashboard
              </Text>
            </Pressable>

            {/* Master Collapsible Group Header */}
            <Pressable
              onPress={() => setIsMasterExpanded(!isMasterExpanded)}
              style={({ hovered, pressed }: any) => [
                {
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  height: 40,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                },
                hovered && {
                  backgroundColor: 'rgba(255,255,255,0.08)',
                },
                pressed && {
                  opacity: 0.85,
                }
              ]}
            >
              <Database size={14} color="rgba(255, 255, 255, 0.8)" />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: 'rgba(255, 255, 255, 0.8)',
                  flex: 1,
                }}
              >
                Master Setup
              </Text>
              {isMasterExpanded ? (
                <ChevronDown size={12} color="rgba(255, 255, 255, 0.6)" />
              ) : (
                <ChevronRight size={12} color="rgba(255, 255, 255, 0.6)" />
              )}
            </Pressable>

            {/* Master Sub-items */}
            {isMasterExpanded && (
              <View style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)', marginLeft: 16, marginBottom: 8, gap: 4 }}>
                {[
                  { id: 'materials', label: 'Raw Materials', icon: Boxes },
                  { id: 'suppliers', label: 'Suppliers', icon: User },
                  { id: 'units', label: 'Units', icon: Database },
                  { id: 'categories', label: 'Categories', icon: Tag }
                ].map((sub) => {
                  const SubIcon = sub.icon;
                  const isActive = activeTab === sub.id;
                  return (
                    <Pressable
                      key={sub.id}
                      onPress={() => {
                        setActiveTab(sub.id as TabName);
                        setIsMobileMenuOpen(false);
                      }}
                      style={({ hovered, pressed }: any) => [
                        {
                          borderRadius: 10,
                          paddingHorizontal: 8,
                          height: 32,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 2,
                        },
                        isActive && {
                          backgroundColor: 'rgba(58,120,220,0.3)',
                          borderLeftWidth: 2,
                          borderLeftColor: '#3399ff',
                        },
                        !isActive && hovered && {
                          backgroundColor: 'rgba(255,255,255,0.05)',
                        },
                        pressed && { opacity: 0.85 }
                      ]}
                    >
                      <SubIcon size={12} color={isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'} />
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: isActive ? '600' : '500',
                          color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                        }}
                      >
                        {sub.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Other main items */}
            {[
              { id: 'purchases', label: 'Purchases', icon: Truck },
              { id: 'wastage', label: 'Wastage', icon: Trash2 },
              { id: 'transfers', label: 'Transfers', icon: RefreshCw },
              { id: 'reports', label: 'Reports', icon: TrendingUp },
              { id: 'alerts', label: 'Alerts', icon: ShieldAlert }
            ].map((item) => {
              const IconComponent = item.icon;
              const isActive = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setActiveTab(item.id as TabName);
                    setIsMobileMenuOpen(false);
                  }}
                  style={({ hovered, pressed }: any) => [
                    {
                      borderRadius: 14,
                      paddingHorizontal: 12,
                      height: 40,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    },
                    isActive && {
                      borderTopWidth: 1,
                      borderTopColor: 'rgba(255,255,255,0.10)',
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.08,
                      shadowRadius: 12,
                      elevation: 2,
                    },
                    !isActive && hovered && {
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      transform: [{ translateX: 2 }],
                    },
                    pressed && {
                      opacity: 0.85,
                      transform: [{ scale: 0.98 }]
                    }
                  ]}
                >
                  {isActive && (
                    <LinearGradient
                      colors={['rgba(58,120,220,0.95)', 'rgba(35,95,190,0.95)']}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14 }}
                    />
                  )}
                  <IconComponent size={14} color={isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.8)'} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: isActive ? '600' : '500',
                      color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.8)',
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: '#002040' }}>
            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: '600', textAlign: 'center' }}>
              ABC Branch
            </Text>
            <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 2 }}>
              © 2026 Le Leban • v2.4.0
            </Text>
          </View>
        </View>
      )}

      {/* RIGHT MAIN PANEL */}
      <View className="flex-1 flex-col">
        {/* Header Bar */}
        {activeTab !== 'record_purchase' && (
          <View className="bg-white border-b border-slate-200 px-6 py-4 flex-row items-center justify-between shadow-sm">
            <View className="flex-row items-center gap-3">
              {width < 768 && (
                <Pressable
                  onPress={() => setIsMobileMenuOpen(true)}
                  className="w-10 h-10 bg-slate-100 rounded-xl items-center justify-center active:scale-95"
                >
                  <Menu size={20} color="#0f2744" />
                </Pressable>
              )}
              <View>
                <Text className="text-base font-black text-slate-800 leading-none">{getTabTitle()}</Text>
                <Text className="text-[11px] text-slate-400 font-bold mt-0.5">{getTabSubtitle()}</Text>
              </View>
            </View>

            <View className="flex-row items-center gap-4">
              <View className="relative">
                <Pressable className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-full items-center justify-center active:scale-95">
                  <Bell size={18} color="#475569" />
                </Pressable>
                <View className="absolute top-0 right-0 bg-red-500 rounded-full w-4 h-4 items-center justify-center border border-white">
                  <Text className="text-[8px] font-black text-white leading-none">3</Text>
                </View>
              </View>

              <View className="flex-row items-center gap-2 border-l border-slate-200 pl-4">
                <View className="w-9 h-9 rounded-full bg-blue-600 items-center justify-center">
                  <Text className="text-xs font-black text-white">RA</Text>
                </View>
                <View className="hidden md:flex">
                  <Text className="text-xs font-black text-slate-800 leading-none">Rami Abou Jaoude</Text>
                  <Text className="text-[9.5px] text-slate-400 font-bold mt-0.5">Manager</Text>
                </View>
              </View>

              <View className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-row items-center gap-2">
                <Calendar size={14} color="#475569" />
                <Text className="text-[10px] font-black text-slate-600">Jun 1 - Jun 30, 2024</Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'record_purchase' ? (
          <View className="flex-1 p-0">
            {errorMsg && (
              <View className="mx-6 mt-6 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex-row items-center">
                <AlertTriangle size={20} color="#e11d48" className="mr-3" />
                <Text className="text-xs font-bold text-rose-700">{errorMsg}</Text>
              </View>
            )}
            {renderActiveTabPanel()}
          </View>
        ) : (
          <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
            {errorMsg && (
              <View className="mb-6 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex-row items-center">
                <AlertTriangle size={20} color="#e11d48" className="mr-3" />
                <Text className="text-xs font-bold text-rose-700">{errorMsg}</Text>
              </View>
            )}
            {renderActiveTabPanel()}
          </ScrollView>
        )}
      </View>

      {/* MOBILE MENU DRAWER MODAL */}
      <Modal visible={isMobileMenuOpen && width < 768} animationType="slide" transparent>
        <View className="flex-1 bg-black/60 flex-row">
          <View style={{ width: 180, minWidth: 180, maxWidth: 180, overflow: 'hidden' }} className="flex-col h-full">
            <LinearGradient
              colors={['#0251b8', '#013b8c', '#012f70']}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <SidebarDecoration />

            <View style={{ width: '100%', alignSelf: 'stretch', paddingTop: 28, paddingBottom: 20, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.12)', alignItems: 'center' }}>
              <View className="flex-row items-center justify-between w-full">
                <Image
                  source={leLabanLogo}
                  style={{ height: 40, width: 62, resizeMode: 'contain', opacity: 0.96 }}
                  accessibilityLabel="Le Leban logo"
                />
                <Pressable onPress={() => setIsMobileMenuOpen(false)} className="p-1 rounded-lg">
                  <X size={16} color="white" />
                </Pressable>
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', marginTop: 4 }}>
                Inventory Center
              </Text>
            </View>

            <ScrollView className="flex-1 px-3 py-4 gap-1.5" showsVerticalScrollIndicator={false}>
              {/* Dashboard */}
              <Pressable
                onPress={() => {
                  setActiveTab('dashboard');
                  setIsMobileMenuOpen(false);
                }}
                style={({ pressed }: any) => [
                  {
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    height: 40,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  },
                  activeTab === 'dashboard' && {
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(255,255,255,0.10)',
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    elevation: 2,
                  },
                  pressed && {
                    opacity: 0.85,
                    transform: [{ scale: 0.98 }]
                  }
                ]}
              >
                {activeTab === 'dashboard' && (
                  <LinearGradient
                    colors={['rgba(58,120,220,0.95)', 'rgba(35,95,190,0.95)']}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14 }}
                  />
                )}
                <BarChart3 size={14} color={activeTab === 'dashboard' ? '#ffffff' : 'rgba(255, 255, 255, 0.8)'} />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: activeTab === 'dashboard' ? '600' : '500',
                    color: activeTab === 'dashboard' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.8)',
                  }}
                >
                  Dashboard
                </Text>
              </Pressable>

              {/* Master Collapsible Group Header */}
              <Pressable
                onPress={() => setIsMasterExpanded(!isMasterExpanded)}
                style={({ pressed }: any) => [
                  {
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    height: 40,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  },
                  pressed && {
                    opacity: 0.85,
                  }
                ]}
              >
                <Database size={14} color="rgba(255, 255, 255, 0.8)" />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '500',
                    color: 'rgba(255, 255, 255, 0.8)',
                    flex: 1,
                  }}
                >
                  Master Setup
                </Text>
                {isMasterExpanded ? (
                  <ChevronDown size={12} color="rgba(255, 255, 255, 0.6)" />
                ) : (
                  <ChevronRight size={12} color="rgba(255, 255, 255, 0.6)" />
                )}
              </Pressable>

              {/* Master Sub-items */}
              {isMasterExpanded && (
                <View style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)', marginLeft: 14, marginBottom: 8, gap: 4 }}>
                  {[
                    { id: 'materials', label: 'Raw Materials', icon: Boxes },
                    { id: 'suppliers', label: 'Suppliers', icon: User },
                    { id: 'units', label: 'Units', icon: Database },
                    { id: 'categories', label: 'Categories', icon: Tag }
                  ].map((sub) => {
                    const SubIcon = sub.icon;
                    const isActive = activeTab === sub.id;
                    return (
                      <Pressable
                        key={sub.id}
                        onPress={() => {
                          setActiveTab(sub.id as TabName);
                          setIsMobileMenuOpen(false);
                        }}
                        style={({ pressed }: any) => [
                          {
                            borderRadius: 10,
                            paddingHorizontal: 8,
                            height: 32,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 2,
                          },
                          isActive && {
                            backgroundColor: 'rgba(58,120,220,0.3)',
                            borderLeftWidth: 2,
                            borderLeftColor: '#3399ff',
                          },
                          pressed && { opacity: 0.85 }
                        ]}
                      >
                        <SubIcon size={12} color={isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'} />
                        <Text
                          style={{
                            fontSize: 10.5,
                            fontWeight: isActive ? '600' : '500',
                            color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                          }}
                        >
                          {sub.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Other main items */}
              {[
                { id: 'purchases', label: 'Purchases', icon: Truck },
                { id: 'wastage', label: 'Wastage', icon: Trash2 },
                { id: 'transfers', label: 'Transfers', icon: RefreshCw },
                { id: 'reports', label: 'Reports', icon: TrendingUp },
                { id: 'alerts', label: 'Alerts', icon: ShieldAlert }
              ].map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setActiveTab(item.id as TabName);
                      setIsMobileMenuOpen(false);
                    }}
                    style={({ pressed }: any) => [
                      {
                        borderRadius: 14,
                        paddingHorizontal: 10,
                        height: 40,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      },
                      isActive && {
                        borderTopWidth: 1,
                        borderTopColor: 'rgba(255,255,255,0.10)',
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.08,
                        shadowRadius: 12,
                        elevation: 2,
                      },
                      pressed && {
                        opacity: 0.85,
                        transform: [{ scale: 0.98 }]
                      }
                    ]}
                  >
                    {isActive && (
                      <LinearGradient
                        colors={['rgba(58,120,220,0.95)', 'rgba(35,95,190,0.95)']}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14 }}
                      />
                    )}
                    <IconComponent size={14} color={isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.8)'} />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: isActive ? '600' : '500',
                        color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.8)',
                      }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <Pressable className="flex-1" onPress={() => setIsMobileMenuOpen(false)} />
        </View>
      </Modal>

      {/* ─── MODAL DIALOGS ─────────────────────────────────────────────────── */}

      {/* 0.1. New Transfer Request Modal */}
      <Modal visible={isNewRequestModalOpen} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[90%] md:w-[60%] rounded-3xl p-6 shadow-2xl max-h-[90%]">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">New Stock Transfer Request</Text>
              <Pressable onPress={() => setIsNewRequestModalOpen(false)}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView className="pr-2 gap-4" showsVerticalScrollIndicator={false}>
              {/* Supplying Branch Selector */}
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Supply Branch (Source)*</Text>
                <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[100px] p-2">
                  {dbBranches
                    .filter(b => b.branch_type === 'CENTRAL_KITCHEN' || b.branch_type === 'WAREHOUSE')
                    .map(b => (
                      <Pressable
                        key={b.id}
                        onPress={() => setNewReqFromBranchId(b.id)}
                        className={`p-2.5 rounded-lg mb-1 flex-row items-center ${
                          newReqFromBranchId === b.id ? 'bg-blue-100' : ''
                        }`}
                        style={{ minHeight: 44 }}
                      >
                        <Text className="text-xs font-bold text-slate-800">{b.name} ({b.branch_type})</Text>
                      </Pressable>
                    ))}
                </ScrollView>
              </View>

              {/* Items Table */}
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase mb-2">Request Items*</Text>
                {newReqItems.map((item, idx) => (
                  <View key={idx} className="flex-row items-center gap-2 mb-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <View className="flex-1 gap-1">
                      <Text className="text-[9px] font-bold text-slate-400 uppercase">Material</Text>
                      <ScrollView className="bg-white border border-slate-200 rounded-lg max-h-[80px] p-1">
                        {materials.map(m => (
                          <Pressable
                            key={m.id}
                            onPress={() => handleRequestItemChange(idx, 'material_id', m.id)}
                            className={`p-1.5 rounded mb-0.5 ${
                              item.material_id === m.id ? 'bg-blue-50' : ''
                            }`}
                            style={{ minHeight: 32 }}
                          >
                            <Text className="text-[10px] text-slate-700 font-bold">{m.material_name}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View className="w-24 gap-1">
                      <Text className="text-[9px] font-bold text-slate-400 uppercase">Quantity</Text>
                      <TextInput
                        value={item.requested_quantity}
                        onChangeText={(val) => handleRequestItemChange(idx, 'requested_quantity', val)}
                        placeholder="Qty"
                        keyboardType="numeric"
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800"
                        style={{ minHeight: 36 }}
                      />
                    </View>
                    {newReqItems.length > 1 && (
                      <Pressable
                        onPress={() => handleRemoveRequestItemRow(idx)}
                        className="w-8 h-8 items-center justify-center bg-rose-50 border border-rose-100 rounded-lg active:scale-95"
                        style={{ minHeight: 44, minWidth: 44 }}
                      >
                        <Trash2 size={14} color="#e11d48" />
                      </Pressable>
                    )}
                  </View>
                ))}
                
                <Pressable
                  onPress={handleAddRequestItemRow}
                  className="flex-row bg-slate-100 border border-slate-200 items-center justify-center py-2 rounded-xl mt-1 active:scale-95"
                  style={{ minHeight: 44 }}
                >
                  <Plus size={14} color="#475569" className="mr-1" />
                  <Text className="text-xs font-bold text-slate-600">Add Material Row</Text>
                </Pressable>
              </View>

              {/* Remarks */}
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Remarks / Instructions</Text>
                <TextInput
                  value={newReqRemarks}
                  onChangeText={setNewReqRemarks}
                  placeholder="e.g. Urgent stock replenishment"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800"
                  style={{ minHeight: 44 }}
                />
              </View>
            </ScrollView>

            <View className="flex-row justify-end gap-3 border-t border-slate-100 pt-4 mt-4">
              <Pressable
                onPress={() => setIsNewRequestModalOpen(false)}
                className="bg-slate-100 border border-slate-200 py-2.5 px-5 rounded-xl active:scale-95"
                style={{ minHeight: 44 }}
              >
                <Text className="text-xs font-bold text-slate-600">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveTransferRequest}
                className="bg-blue-600 py-2.5 px-5 rounded-xl active:scale-95 shadow-md"
                style={{ minHeight: 44 }}
              >
                <Text className="text-xs font-bold text-white">Submit Request</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 0.2. Review, Approve & Dispatch Request Modal */}
      <Modal visible={isApprovalModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[90%] md:w-[60%] rounded-3xl p-6 shadow-2xl max-h-[90%]">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">Review Request: {selectedRequest?.request_number}</Text>
              <Pressable onPress={() => setIsApprovalModalOpen(false)}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView className="pr-2 gap-4" showsVerticalScrollIndicator={false}>
              <View className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <Text className="text-xs text-slate-600">Requesting outlet: <Text className="font-bold text-slate-800">{selectedRequest?.to_branch_name}</Text></Text>
                {selectedRequest?.remarks && (
                  <Text className="text-xs text-slate-500 mt-1 italic">Remarks: "{selectedRequest.remarks}"</Text>
                )}
              </View>

              <Text className="text-[10px] font-black text-slate-500 uppercase mt-2 mb-1">Verify approved & dispatched quantities</Text>
              
              {reqItemsList.map((itm) => (
                <View key={itm.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-2">
                  <Text className="text-xs font-bold text-slate-800">{itm.material_name}</Text>
                  <Text className="text-[10px] text-slate-400 font-semibold mb-2">Requested: {itm.requested_quantity} {itm.unit_short_name}</Text>
                  
                  <View className="flex-row gap-3">
                    {selectedRequest?.status === 'Pending' && (
                      <View className="flex-1 gap-1">
                        <Text className="text-[9px] font-black text-slate-500 uppercase">Approved Quantity</Text>
                        <TextInput
                          value={approvedQuantities[itm.material_id] || ''}
                          onChangeText={(val) => setApprovedQuantities({ ...approvedQuantities, [itm.material_id]: val })}
                          keyboardType="numeric"
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800"
                          style={{ minHeight: 36 }}
                        />
                      </View>
                    )}

                    {(selectedRequest?.status === 'Approved' || selectedRequest?.status === 'Partially Dispatched') && (
                      <View className="flex-1 gap-1">
                        <Text className="text-[9px] font-black text-slate-500 uppercase">Dispatch Quantity</Text>
                        <TextInput
                          value={dispatchQuantities[itm.material_id] || ''}
                          onChangeText={(val) => setDispatchQuantities({ ...dispatchQuantities, [itm.material_id]: val })}
                          keyboardType="numeric"
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800"
                          style={{ minHeight: 36 }}
                        />
                      </View>
                    )}
                  </View>
                </View>
              ))}

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Remarks / Notes</Text>
                <TextInput
                  value={approveRemarks}
                  onChangeText={setApproveRemarks}
                  placeholder="Approve remarks or reason for rejection/variance"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800"
                  style={{ minHeight: 44 }}
                />
              </View>
            </ScrollView>

            <View className="flex-row justify-between items-center border-t border-slate-100 pt-4 mt-4 flex-wrap gap-2">
              <View className="flex-row gap-2">
                {selectedRequest?.status === 'Pending' && (
                  <Pressable
                    onPress={handleProcessRejection}
                    className="bg-rose-50 border border-rose-200 py-2.5 px-4 rounded-xl active:scale-95"
                    style={{ minHeight: 44 }}
                  >
                    <Text className="text-xs font-bold text-rose-700">Reject Request</Text>
                  </Pressable>
                )}
              </View>

              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setIsApprovalModalOpen(false)}
                  className="bg-slate-100 border border-slate-200 py-2.5 px-4 rounded-xl active:scale-95"
                  style={{ minHeight: 44 }}
                >
                  <Text className="text-xs font-bold text-slate-600">Close</Text>
                </Pressable>

                {selectedRequest?.status === 'Pending' && (
                  <Pressable
                    onPress={handleProcessApproval}
                    className="bg-blue-600 py-2.5 px-4 rounded-xl active:scale-95 shadow-md"
                    style={{ minHeight: 44 }}
                  >
                    <Text className="text-xs font-bold text-white">Approve Request</Text>
                  </Pressable>
                )}

                {(selectedRequest?.status === 'Approved' || selectedRequest?.status === 'Partially Dispatched') && (
                  <Pressable
                    onPress={handleProcessDispatch}
                    className="bg-indigo-600 py-2.5 px-4 rounded-xl active:scale-95 shadow-md"
                    style={{ minHeight: 44 }}
                  >
                    <Text className="text-xs font-bold text-white">Create Dispatch</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* 0.3. Receive Shipment Verification Modal */}
      <Modal visible={isReceiveModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[90%] md:w-[60%] rounded-3xl p-6 shadow-2xl max-h-[90%]">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">Verify & Receive: {selectedDispatch?.dispatch_number}</Text>
              <Pressable onPress={() => setIsReceiveModalOpen(false)}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView className="pr-2 gap-4" showsVerticalScrollIndicator={false}>
              <View className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <Text className="text-xs text-slate-600">Shipped from branch: <Text className="font-bold text-slate-800">{selectedDispatch?.from_branch_name}</Text></Text>
                {selectedDispatch?.remarks && (
                  <Text className="text-xs text-slate-500 mt-1 italic">Remarks: "{selectedDispatch.remarks}"</Text>
                )}
              </View>

              <Text className="text-[10px] font-black text-slate-500 uppercase mt-2 mb-1">Verify physical weights / counts</Text>
              
              {dispItemsList.map((itm) => (
                <View key={itm.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-2">
                  <Text className="text-xs font-bold text-slate-800">{itm.material_name}</Text>
                  <Text className="text-[10px] text-slate-400 font-semibold mb-2">Dispatched: {itm.dispatched_quantity} {itm.unit_short_name}</Text>
                  
                  <View className="gap-1">
                    <Text className="text-[9px] font-black text-slate-500 uppercase">Received Quantity</Text>
                    <TextInput
                      value={receivedQuantities[itm.id] || ''}
                      onChangeText={(val) => setReceivedQuantities({ ...receivedQuantities, [itm.id]: val })}
                      keyboardType="numeric"
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800"
                      style={{ minHeight: 36 }}
                    />
                  </View>
                </View>
              ))}

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Variance Reason (If discrepancy)</Text>
                <TextInput
                  value={receiveRemarks}
                  onChangeText={setReceiveRemarks}
                  placeholder="e.g. 1 unit damaged in transit"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800"
                  style={{ minHeight: 44 }}
                />
              </View>
            </ScrollView>

            <View className="flex-row justify-end gap-3 border-t border-slate-100 pt-4 mt-4">
              <Pressable
                onPress={() => setIsReceiveModalOpen(false)}
                className="bg-slate-100 border border-slate-200 py-2.5 px-4 rounded-xl active:scale-95"
                style={{ minHeight: 44 }}
              >
                <Text className="text-xs font-bold text-slate-600">Close</Text>
              </Pressable>
              <Pressable
                onPress={handleProcessReceive}
                className="bg-emerald-600 py-2.5 px-4 rounded-xl active:scale-95 shadow-md"
                style={{ minHeight: 44 }}
              >
                <Text className="text-xs font-bold text-white">Record Receipt & Update Stock</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 0.4. Event Logs Timeline Modal */}
      <Modal visible={isEventsModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[90%] md:w-[50%] rounded-3xl p-6 shadow-2xl max-h-[80%]">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">Audit Trail: {selectedRequestForEvents?.request_number}</Text>
              <Pressable onPress={() => setIsEventsModalOpen(false)}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {eventsLoading ? (
              <ActivityIndicator size="small" color="#0284c7" className="my-10" />
            ) : (
              <ScrollView className="pr-2 gap-4" showsVerticalScrollIndicator={false}>
                {requestEvents.length === 0 ? (
                  <Text className="text-xs text-slate-500 text-center my-6">No event logs recorded for this request.</Text>
                ) : (
                  requestEvents.map((evt, idx) => (
                    <View key={evt.id} className="flex-row mb-4">
                      {/* Left timeline indicator */}
                      <View className="items-center mr-3">
                        <View className="w-2.5 h-2.5 bg-blue-600 rounded-full" />
                        {idx < requestEvents.length - 1 && (
                          <View className="w-0.5 bg-slate-200 flex-1 my-1" />
                        )}
                      </View>
                      
                      {/* Event content */}
                      <View className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <View className="flex-row justify-between items-center mb-1 flex-wrap gap-1">
                          <Text className="text-xs font-black text-slate-800">{evt.event_type}</Text>
                          <Text className="text-[9px] text-slate-400">
                            {new Date(evt.created_at).toLocaleDateString()} {new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <Text className="text-xs text-slate-600">{evt.notes}</Text>
                        <Text className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Performed by: {evt.performed_by}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <View className="flex-row justify-end border-t border-slate-100 pt-4 mt-4">
              <Pressable
                onPress={() => setIsEventsModalOpen(false)}
                className="bg-slate-100 border border-slate-200 py-2 px-5 rounded-xl active:scale-95"
                style={{ minHeight: 44 }}
              >
                <Text className="text-xs font-bold text-slate-600">Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 1. Add/Edit Material Modal */}
      <Modal visible={isMaterialModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[85%] md:w-[50%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">
                {editingMaterial ? 'Edit Raw Ingredient' : 'Register New Raw Material'}
              </Text>
              <Pressable
                onPress={() => {
                  setIsMaterialModalOpen(false);
                  setModalError(null);
                }}
              >
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[400px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Material Name*</Text>
                <TextInput
                  value={formMatName}
                  onChangeText={setFormMatName}
                  placeholder="e.g., Premium Tahini Paste"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Code*</Text>
                  <TextInput
                    value={formMatCode}
                    onChangeText={setFormMatCode}
                    placeholder="e.g., MAT05"
                    editable={!editingMaterial}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">SKU Barcode</Text>
                  <TextInput
                    value={formMatBarcode}
                    onChangeText={setFormMatBarcode}
                    placeholder="e.g., 89012345..."
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Category*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {categories.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => setFormMatCategory(c.id)}
                        className={`p-2 rounded mb-1 ${formMatCategory === c.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{c.category_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Unit UoM*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {units.map((u) => (
                      <Pressable
                        key={u.id}
                        onPress={() => setFormMatUnit(u.id)}
                        className={`p-2 rounded mb-1 ${formMatUnit === u.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">
                          {u.unit_name} ({u.short_name})
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">HSN Code</Text>
                  <TextInput
                    value={formMatHsn}
                    onChangeText={setFormMatHsn}
                    placeholder="e.g., 2103"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Preferred Supplier</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {suppliers.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => setFormMatSupplier(s.id)}
                        className={`p-2 rounded mb-1 ${formMatSupplier === s.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{s.supplier_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[90px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Reorder Level*</Text>
                  <TextInput
                    value={formMatReorder}
                    onChangeText={setFormMatReorder}
                    placeholder="10"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[90px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Opening Stock*</Text>
                  <TextInput
                    value={formMatOpening}
                    onChangeText={setFormMatOpening}
                    placeholder="0"
                    keyboardType="numeric"
                    editable={!editingMaterial}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[90px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Avg Cost (₹)*</Text>
                  <TextInput
                    value={formMatAvgCost}
                    onChangeText={setFormMatAvgCost}
                    placeholder="0"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>
            </ScrollView>

            <Pressable onPress={handleSaveMaterial} className="bg-blue-600 py-3 rounded-2xl items-center mt-5">
              <Text className="text-xs font-bold text-white">Save Material</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 2. Add/Edit Supplier Modal */}
      <Modal visible={isSupplierModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[85%] md:w-[50%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">
                {editingSupplier ? 'Edit Supplier Profile' : 'Register New Supplier'}
              </Text>
              <Pressable
                onPress={() => {
                  setIsSupplierModalOpen(false);
                  setModalError(null);
                }}
              >
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[400px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Supplier Legal Name*</Text>
                <TextInput
                  value={formSupName}
                  onChangeText={setFormSupName}
                  placeholder="e.g., Le Jardin Farms Ltd."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Supplier Code*</Text>
                  <TextInput
                    value={formSupCode}
                    onChangeText={setFormSupCode}
                    placeholder="e.g., SUP03"
                    editable={!editingSupplier}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Contact Person</Text>
                  <TextInput
                    value={formSupContact}
                    onChangeText={setFormSupContact}
                    placeholder="e.g., Anand Rao"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Phone Number*</Text>
                  <TextInput
                    value={formSupPhone}
                    onChangeText={setFormSupPhone}
                    placeholder="e.g., +91 9999999999"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Email Address</Text>
                  <TextInput
                    value={formSupEmail}
                    onChangeText={setFormSupEmail}
                    placeholder="e.g., sales@lejardinfarms.in"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">GST Number</Text>
                  <TextInput
                    value={formSupGst}
                    onChangeText={setFormSupGst}
                    placeholder="e.g., 29BBBBB..."
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Payment Terms</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Net 15', 'Net 30', 'Cash on Delivery', 'Advance'].map((term) => (
                      <Pressable
                        key={term}
                        onPress={() => setFormSupTerms(term)}
                        className={`p-2 rounded mb-1 ${formSupTerms === term ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{term}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Supplier Notes</Text>
                <TextInput
                  value={formSupNotes}
                  onChangeText={setFormSupNotes}
                  placeholder="Payment details, alternate contacts..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>
            </ScrollView>

            <Pressable onPress={handleSaveSupplier} className="bg-blue-600 py-3 rounded-2xl items-center mt-5">
              <Text className="text-xs font-bold text-white">Save Supplier</Text>
            </Pressable>
          </View>
        </View>
      </Modal>



      {/* 4. Record Wastage Modal */}
      <Modal visible={isWastageModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[85%] md:w-[40%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">Record Spoils & Wastage</Text>
              <Pressable
                onPress={() => {
                  setIsWastageModalOpen(false);
                  setModalError(null);
                }}
              >
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[400px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Choose Ingredient*</Text>
                <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                  {materials.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setWastageMaterialId(m.id)}
                      className={`p-2 rounded mb-1 ${wastageMaterialId === m.id ? 'bg-blue-100' : ''}`}
                    >
                      <Text className="text-[10px] font-bold">
                        {m.material_name} ({m.current_stock} left)
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Quantity Lost*</Text>
                  <TextInput
                    value={wastageQty}
                    onChangeText={setWastageQty}
                    placeholder="e.g., 2.5"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Location Source</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Dry Storage', 'Freezer', 'Central Kitchen'].map((loc) => (
                      <Pressable
                        key={loc}
                        onPress={() => setWastageLocation(loc)}
                        className={`p-2 rounded mb-1 ${wastageLocation === loc ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{loc}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-grow min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Wastage Reason*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Expired', 'Spoiled', 'Kitchen Waste', 'Damage', 'Theft', 'Other'].map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setWastageReason(r as any)}
                        className={`p-2 rounded mb-1 ${wastageReason === r ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{r}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="flex-grow min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Recorded By</Text>
                  <TextInput
                    value={wastageRecorder}
                    onChangeText={setWastageRecorder}
                    placeholder="e.g., Chef Amit"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>
            </ScrollView>

            <Pressable onPress={handleRecordWastage} className="bg-rose-600 py-3 rounded-2xl items-center mt-5">
              <Text className="text-xs font-bold text-white">Log Wastage Cost Impact</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 5. Manual Adjustment Modal */}
      <Modal visible={isAdjustmentModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[85%] md:w-[40%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">Manual Inventory Stock Adjustment</Text>
              <Pressable
                onPress={() => {
                  setIsAdjustmentModalOpen(false);
                  setModalError(null);
                }}
              >
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[400px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Choose Ingredient*</Text>
                <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                  {materials.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setAdjMaterialId(m.id)}
                      className={`p-2 rounded mb-1 ${adjMaterialId === m.id ? 'bg-blue-100' : ''}`}
                    >
                      <Text className="text-[10px] font-bold">
                        {m.material_name} ({m.current_stock} left)
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-grow min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Adjustment Type*</Text>
                  <View className="flex-row gap-2 mt-1">
                    <Pressable
                      onPress={() => setAdjType('Add')}
                      className={`flex-1 py-2 rounded-xl items-center border ${
                        adjType === 'Add'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text className="text-[10px] font-bold">Add (+)</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setAdjType('Deduct')}
                      className={`flex-1 py-2 rounded-xl items-center border ${
                        adjType === 'Deduct'
                          ? 'bg-rose-50 border-rose-500 text-rose-700 font-bold'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text className="text-[10px] font-bold">Deduct (-)</Text>
                    </Pressable>
                  </View>
                </View>
                <View className="flex-grow min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Quantity*</Text>
                  <TextInput
                    value={adjQty}
                    onChangeText={setAdjQty}
                    placeholder="e.g., 5.0"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-grow min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Adjustment Location</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Dry Storage', 'Freezer', 'Central Kitchen'].map((loc) => (
                      <Pressable
                        key={loc}
                        onPress={() => setAdjLocation(loc)}
                        className={`p-2 rounded mb-1 ${adjLocation === loc ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{loc}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="flex-grow min-w-[140px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Reason*</Text>
                  <TextInput
                    value={adjReason}
                    onChangeText={setAdjReason}
                    placeholder="e.g., Physical Stock Audit"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Remarks</Text>
                <TextInput
                  value={adjRemarks}
                  onChangeText={setAdjRemarks}
                  placeholder="Record why this change was logged manually..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>
            </ScrollView>

            <Pressable onPress={handleRecordAdjustment} className="bg-blue-600 py-3 rounded-2xl items-center mt-5">
              <Text className="text-xs font-bold text-white">Record Adjust Movement</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 6. Add/Edit Category Modal */}
      <Modal visible={isCategoryModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[85%] md:w-[40%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">
                {editingCategory ? 'Edit Category Profile' : 'Create New Category'}
              </Text>
              <Pressable
                onPress={() => {
                  setIsCategoryModalOpen(false);
                  setModalError(null);
                }}
              >
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[400px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Category Name*</Text>
                <TextInput
                  value={formCatName}
                  onChangeText={setFormCatName}
                  placeholder="e.g., Dairy & Milks"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Category Code (Short)*</Text>
                <TextInput
                  value={formCatCode}
                  onChangeText={setFormCatCode}
                  placeholder="e.g., CAT04"
                  editable={!editingCategory}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Description</Text>
                <TextInput
                  value={formCatDesc}
                  onChangeText={setFormCatDesc}
                  placeholder="Record what materials fit this category..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>
            </ScrollView>

            <Pressable onPress={handleSaveCategory} className="bg-blue-600 py-3 rounded-2xl items-center mt-5">
              <Text className="text-xs font-bold text-white">Save Category</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 7. Add/Edit Unit Modal */}
      <Modal visible={isUnitModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[85%] md:w-[40%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">
                {editingUnit ? 'Edit Unit Profile' : 'Create New Unit'}
              </Text>
              <Pressable
                onPress={() => {
                  setIsUnitModalOpen(false);
                  setModalError(null);
                }}
              >
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[400px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Unit Name*</Text>
                <TextInput
                  value={formUnitName}
                  onChangeText={setFormUnitName}
                  placeholder="e.g., Kilograms"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Unit Code (System)*</Text>
                <TextInput
                  value={formUnitCode}
                  onChangeText={setFormUnitCode}
                  placeholder="e.g., KG"
                  editable={!editingUnit}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Short Name (Display)*</Text>
                <TextInput
                  value={formUnitShort}
                  onChangeText={setFormUnitShort}
                  placeholder="e.g., kg"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>
            </ScrollView>

            <Pressable onPress={handleSaveUnit} className="bg-blue-600 py-3 rounded-2xl items-center mt-5">
              <Text className="text-xs font-bold text-white">Save Unit</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
