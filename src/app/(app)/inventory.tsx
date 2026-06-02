import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
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
  ArrowUp,
  BarChart3,
  Bell,
  Boxes,
  Calendar,
  Check,
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
  X,
} from 'lucide-react-native';
import Svg, { Circle, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/lib/pos/brand';
import {
  fetchCategories,
  fetchUnits,
  fetchSuppliers,
  fetchMaterials,
  fetchPurchases,
  createPurchase,
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
  type InventoryCategory,
  type InventoryUnit,
  type InventorySupplier,
  type InventoryMaterial,
  type InventoryPurchaseHeader,
  type InventoryAdjustment,
  type InventoryWastage,
  type InventoryAuditLog,
  type InventoryAlert,
  type DashboardKPIs,
} from '@/lib/pos/inventory-service';

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
  | 'reports'
  | 'alerts'
  | 'units'
  | 'categories';

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

  // ─── FILTER STATES ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // ─── MODAL STATES ──────────────────────────────────────────────────────────
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Partial<InventoryMaterial> | null>(null);

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<InventorySupplier> | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<InventoryCategory> | null>(null);

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);

  // ─── TRANSACT BUILDING STATES ──────────────────────────────────────────────
  // New Purchase states
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseInvoiceNum, setPurchaseInvoiceNum] = useState('');
  const [purchasePaymentMode, setPurchasePaymentMode] = useState('UPI');
  const [purchaseTransportCharges, setPurchaseTransportCharges] = useState('0');
  const [purchaseRemarks, setPurchaseRemarks] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<{ material_id: string; quantity: string; unit_price: string }[]>([
    { material_id: '', quantity: '', unit_price: '' },
  ]);
  const [purchaseLocation, setPurchaseLocation] = useState('Dry Storage');

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

  // ─── DATA LOADER ───────────────────────────────────────────────────────────

  const loadAllData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMsg(null);
    try {
      initializeLocalSeeder();

      const [kpiRes, matRes, catRes, unitRes, supRes, purRes, wstRes, adjRes, audRes, alrtRes] = await Promise.all([
        fetchInventoryDashboardKPIs(),
        fetchMaterials(),
        fetchCategories(),
        fetchUnits(),
        fetchSuppliers(),
        fetchPurchases(),
        fetchWastage(),
        fetchAdjustments(),
        fetchAuditLogs(),
        fetchAlerts(),
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
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to fetch inventory records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // ─── FILTERS ───────────────────────────────────────────────────────────────

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchSearch =
        m.material_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.material_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.barcode && m.barcode.includes(searchQuery));
      const matchCat = selectedCategoryFilter === 'all' || m.category_id === selectedCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [materials, searchQuery, selectedCategoryFilter]);

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
      await saveMaterial(payload);
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
      await saveSupplier(payload);
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
      await saveCategory(payload);
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

  const handleOpenPurchaseModal = () => {
    setModalError(null);
    setPurchaseSupplierId('');
    setPurchaseInvoiceNum('');
    setPurchaseItems([{ material_id: '', quantity: '', unit_price: '' }]);
    setPurchaseTransportCharges('0');
    setPurchaseRemarks('');
    setIsPurchaseModalOpen(true);
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
      const headerPayload = {
        purchase_date: new Date().toISOString(),
        supplier_id: purchaseSupplierId,
        invoice_number: purchaseInvoiceNum || null,
        invoice_date: new Date().toISOString(),
        payment_mode: purchasePaymentMode,
        subtotal: purchaseItems.reduce((acc, itm) => acc + Number(itm.quantity) * Number(itm.unit_price), 0),
        discount_amount: 0,
        tax_amount: 0,
        transport_charges: Number(purchaseTransportCharges) || 0,
        other_charges: 0,
        grand_total:
          purchaseItems.reduce((acc, itm) => acc + Number(itm.quantity) * Number(itm.unit_price), 0) +
          (Number(purchaseTransportCharges) || 0),
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
          line_total: Number(itm.quantity) * Number(itm.unit_price),
        }));

      await createPurchase(headerPayload, finalItems, purchaseLocation);
      setIsPurchaseModalOpen(false);
      setPurchaseSupplierId('');
      setPurchaseItems([{ material_id: '', quantity: '', unit_price: '' }]);
      setPurchaseRemarks('');
      setPurchaseInvoiceNum('');
      setPurchaseTransportCharges('0');
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
      await createWastage(payload);
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
      await createAdjustment(payload);
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
    setPurchaseItems([...purchaseItems, { material_id: '', quantity: '', unit_price: '' }]);
  };

  const handleUpdatePurchaseLine = (idx: number, key: string, value: string) => {
    const next = [...purchaseItems];
    next[idx] = { ...next[idx], [key]: value };
    setPurchaseItems(next);
  };

  const handleRemovePurchaseLine = (idx: number) => {
    if (purchaseItems.length === 1) return;
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
    return (
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-5 flex-wrap gap-4">
          <View className="flex-1 min-w-[240px] flex-row bg-white border border-slate-200 rounded-2xl items-center px-4 py-2.5 shadow-sm">
            <Search size={18} color="#64748b" className="mr-2" />
            <TextInput
              placeholder="Search materials..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 text-sm text-slate-800 outline-none"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <X size={16} color="#64748b" />
              </Pressable>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-w-[40%] flex-grow-0">
            <View className="flex-row py-1">
              <Pressable
                onPress={() => setSelectedCategoryFilter('all')}
                className={`px-4 py-2 rounded-full mr-2 border ${
                  selectedCategoryFilter === 'all' ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'
                }`}
              >
                <Text className={`text-xs font-bold ${selectedCategoryFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>
                  All
                </Text>
              </Pressable>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedCategoryFilter(c.id)}
                  className={`px-4 py-2 rounded-full mr-2 border ${
                    selectedCategoryFilter === c.id ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-bold ${selectedCategoryFilter === c.id ? 'text-white' : 'text-slate-600'}`}>
                    {c.category_name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={() => handleOpenMaterialModal()}
            className="flex-row bg-blue-600 items-center justify-center py-3 px-5 rounded-2xl shadow-md active:scale-95 transition-transform"
          >
            <Plus size={16} color="white" className="mr-1.5" />
            <Text className="text-sm font-bold text-white">Add Raw Material</Text>
          </Pressable>
        </View>

        <FlatList
          key="materials-flatlist"
          data={filteredMaterials}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 items-center justify-center">
              <Boxes size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No materials found</Text>
              <Text className="text-xs text-slate-400 mt-1">Try resetting search filters or register a new raw ingredient.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isOut = item.current_stock === 0;
            const isLow = item.current_stock > 0 && item.current_stock <= item.reorder_level;

            let badgeColor = 'bg-emerald-50 border-emerald-200 text-emerald-700';
            let badgeText = 'Normal';
            if (isOut) {
              badgeColor = 'bg-rose-50 border-rose-200 text-rose-700';
              badgeText = 'Out of Stock';
            } else if (isLow) {
              badgeColor = 'bg-amber-50 border-amber-200 text-amber-700';
              badgeText = 'Low Stock';
            }

            return (
              <View className="bg-white border border-slate-200 rounded-2xl p-3.5 mb-3 flex-row items-center justify-between shadow-sm">
                <View className="flex-row items-center flex-1 mr-3">
                  <View className="w-10 h-10 bg-blue-50 rounded-xl items-center justify-center mr-3">
                    <Boxes size={18} color={colors.primary} />
                  </View>
                  <View className="flex-1 mr-2">
                    <View className="flex-row items-center mb-0.5 flex-wrap">
                      <Text className="text-sm font-black text-slate-800 mr-2">{item.material_name}</Text>
                      <Text className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-md uppercase">
                        {item.material_code}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap items-center">
                      <Text className="text-[11px] text-slate-400 mr-2.5">Cat: {item.category_name}</Text>
                      <Text className="text-[11px] text-slate-400 mr-2.5">Unit: {item.unit_short_name}</Text>
                      {item.barcode && <Text className="text-[11px] text-slate-400 mr-2.5">SKU: {item.barcode}</Text>}
                      {item.hsn_code && <Text className="text-[11px] text-slate-400">HSN: {item.hsn_code}</Text>}
                    </View>
                    <View className="flex-row mt-1.5 pt-1.5 border-t border-slate-50">
                      <Text className="text-[9.5px] text-slate-400 font-semibold uppercase tracking-wider mr-2">
                        Location Splits:
                      </Text>
                      <Text className="text-[11px] font-semibold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        {item.category_name === 'Raw Meats' ? 'Freezer' : 'Dry Storage'}: {item.current_stock}{' '}
                        {item.unit_short_name}
                      </Text>
                    </View>
                  </View>
                </View>

                <View className="flex-row items-center gap-4 flex-wrap">
                  <View className="items-end">
                    <Text className="text-xs font-black text-slate-900">
                      {item.current_stock} {item.unit_short_name}
                    </Text>
                    <View className={`border rounded-full px-1.5 py-0.5 mt-0.5 ${badgeColor}`}>
                      <Text className="text-[8px] font-bold uppercase">{badgeText}</Text>
                    </View>
                  </View>

                  <View className="items-end border-l border-slate-100 pl-4">
                    <Text className="text-[10px] text-slate-400">Avg Cost</Text>
                    <Text className="text-xs font-extrabold text-slate-800 mt-0.5">₹{item.average_cost.toFixed(2)}</Text>
                  </View>

                  <View className="flex-row items-center border-l border-slate-100 pl-4 gap-1.5">
                    <Pressable
                      onPress={() => handleOpenMaterialModal(item)}
                      className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg items-center justify-center active:scale-95"
                    >
                      <FileText size={14} color="#64748b" />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeleteMaterialItem(item.id)}
                      className="w-8 h-8 bg-slate-50 border border-rose-100 rounded-lg items-center justify-center active:scale-95"
                    >
                      <Trash2 size={14} color="#e11d48" />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
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
    return (
      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-6 flex-wrap gap-4">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-slate-800">Purchase Invoices & Procurement Records</Text>
            <Text className="text-xs text-slate-500">Record freight invoices, payment histories, and stock updates.</Text>
          </View>
          <Pressable
            onPress={handleOpenPurchaseModal}
            className="flex-row bg-blue-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-md active:scale-95 transition-transform"
          >
            <Plus size={14} color="white" className="mr-1" />
            <Text className="text-xs font-bold text-white">Record Purchase</Text>
          </Pressable>
        </View>

        <FlatList
          key="purchases-flatlist"
          data={purchases}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 w-full items-center justify-center">
              <Truck size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No purchase invoices recorded yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm">
              <View className="flex-row justify-between items-center flex-wrap gap-2 mb-3">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 bg-emerald-50 rounded-xl items-center justify-center mr-3">
                    <Truck size={20} color="#10b981" />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-800">{item.purchase_number}</Text>
                    <Text className="text-[11px] text-slate-400">
                      {new Date(item.purchase_date).toLocaleDateString()} • By {item.created_by}
                    </Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-black text-slate-900">₹{item.grand_total.toLocaleString('en-IN')}</Text>
                  <Text className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">
                    {item.payment_mode}
                  </Text>
                </View>
              </View>

              <View className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mt-2">
                <View className="flex-row justify-between mb-2 flex-wrap">
                  <Text className="text-xs font-semibold text-slate-400">Supplier Name:</Text>
                  <Text className="text-xs font-bold text-slate-700">{item.supplier_name}</Text>
                </View>
                {item.invoice_number && (
                  <View className="flex-row justify-between mb-2 flex-wrap">
                    <Text className="text-xs font-semibold text-slate-400">Invoice Number:</Text>
                    <Text className="text-xs font-bold text-slate-700 uppercase">{item.invoice_number}</Text>
                  </View>
                )}
                {item.invoice_file_url && (
                  <View className="flex-row justify-between mb-2 flex-wrap items-center">
                    <Text className="text-xs font-semibold text-slate-400">Attachment:</Text>
                    <View className="flex-row items-center bg-blue-50 border border-blue-100 rounded px-2 py-0.5">
                      <FileText size={10} color={colors.primary} className="mr-1" />
                      <Text className="text-[9px] font-bold text-blue-700 uppercase">invoice.pdf</Text>
                    </View>
                  </View>
                )}
                {item.remarks && (
                  <View className="flex-row justify-between pt-2 border-t border-slate-200/80 flex-wrap">
                    <Text className="text-xs font-semibold text-slate-400">Remarks:</Text>
                    <Text className="text-xs text-slate-500 italic">{item.remarks}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        />
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
        <View className="flex-row justify-between items-center mb-6 flex-wrap gap-4">
          <View className="flex-1 mr-4">
            <Text className="text-sm font-bold text-slate-800">Inventory Stock Transfers & Ledger Logs</Text>
            <Text className="text-xs text-slate-500">Record physical audits, correct ledger weights, or log location transfers.</Text>
          </View>
          <Pressable
            onPress={handleOpenAdjustmentModal}
            className="flex-row bg-blue-600 items-center justify-center py-2.5 px-4 rounded-xl shadow-md active:scale-95 transition-transform"
          >
            <Plus size={14} color="white" className="mr-1" />
            <Text className="text-xs font-bold text-white">Manual Adjustment</Text>
          </Pressable>
        </View>

        <FlatList
          key="adjustments-flatlist"
          data={adjustments}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 w-full items-center justify-center">
              <RefreshCw size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No stock adjustments recorded</Text>
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
                        Reason: {item.reason} • Target: {item.location_id}
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
      </View>
    );
  };

  const renderReports = () => {
    return (
      <View className="flex-col gap-6">
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
        <View className="mb-6">
          <Text className="text-sm font-bold text-slate-800">Units of Measurement (UoM)</Text>
          <Text className="text-xs text-slate-500">Ensure standardized quantities across recipes, purchases, and wastage sheets.</Text>
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
      case 'reports':
        return renderReports();
      case 'alerts':
        return renderAudit();
      case 'units':
        return renderUnits();
      case 'categories':
        return renderCategories();
      default:
        return renderDashboard();
    }
  };

  const getTabTitle = () => {
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
      case 'reports':
        return 'Deep analytics and monthly margin metrics';
      case 'alerts':
        return 'Critical system logs and low stock notifications';
      case 'units':
        return 'Configure global recipe weight units';
      case 'categories':
        return 'Classify storage items and classify waste';
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
      {width >= 768 && (
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
            {SIDEBAR_ITEMS.map((item) => {
              const IconComponent = item.icon;
              const isActive = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setActiveTab(item.id);
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

        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          {errorMsg && (
            <View className="mb-6 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex-row items-center">
              <AlertTriangle size={20} color="#e11d48" className="mr-3" />
              <Text className="text-xs font-bold text-rose-700">{errorMsg}</Text>
            </View>
          )}

          {renderActiveTabPanel()}
        </ScrollView>
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
              {SIDEBAR_ITEMS.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setActiveTab(item.id);
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

      {/* 3. Record Purchase Invoice Modal */}
      <Modal visible={isPurchaseModalOpen} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[90%] md:w-[60%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-base font-black text-slate-900">Record Procurement Invoice</Text>
              <Pressable
                onPress={() => {
                  setIsPurchaseModalOpen(false);
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
              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-grow min-w-[160px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Choose Supplier*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {suppliers.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => setPurchaseSupplierId(s.id)}
                        className={`p-2 rounded mb-1 ${purchaseSupplierId === s.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{s.supplier_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="flex-grow min-w-[160px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Invoice / Bill Number*</Text>
                  <TextInput
                    value={purchaseInvoiceNum}
                    onChangeText={setPurchaseInvoiceNum}
                    placeholder="e.g., INV-8976"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3 flex-wrap gap-2">
                <View className="flex-1 min-w-[100px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Payment Mode*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Cash', 'UPI', 'Bank Transfer', 'Credit Card'].map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => setPurchasePaymentMode(m)}
                        className={`p-2 rounded mb-1 ${purchasePaymentMode === m ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{m}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="flex-1 min-w-[100px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Freight (₹)</Text>
                  <TextInput
                    value={purchaseTransportCharges}
                    onChangeText={setPurchaseTransportCharges}
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                  />
                </View>
                <View className="flex-1 min-w-[100px] gap-1">
                  <Text className="text-[10px] font-black text-slate-500 uppercase">Storage Destination</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Dry Storage', 'Freezer', 'Central Kitchen'].map((loc) => (
                      <Pressable
                        key={loc}
                        onPress={() => setPurchaseLocation(loc)}
                        className={`p-2 rounded mb-1 ${purchaseLocation === loc ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-[10px] font-bold">{loc}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="border-t border-slate-100 pt-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-bold text-slate-800">Procurement Items Details</Text>
                  <Pressable
                    onPress={handleAddPurchaseLine}
                    className="flex-row bg-slate-100 border border-slate-200 rounded-xl px-3 py-1 items-center"
                  >
                    <Plus size={12} color="#64748b" className="mr-1" />
                    <Text className="text-[10px] font-bold text-slate-600">Add Line</Text>
                  </Pressable>
                </View>

                {purchaseItems.map((itm, idx) => (
                  <View key={idx} className="flex-row justify-between items-end mb-3 gap-2 border-b border-slate-50 pb-2">
                    <View className="w-[45%] gap-1">
                      <Text className="text-[9px] font-bold text-slate-400">Choose Raw Material</Text>
                      <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[60px] p-1">
                        {materials.map((m) => (
                          <Pressable
                            key={m.id}
                            onPress={() => handleUpdatePurchaseLine(idx, 'material_id', m.id)}
                            className={`p-1.5 rounded mb-1 ${itm.material_id === m.id ? 'bg-blue-100' : ''}`}
                          >
                            <Text className="text-[9px] font-bold">
                              {m.material_name} ({m.material_code})
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View className="w-[20%] gap-1">
                      <Text className="text-[9px] font-bold text-slate-400">Qty</Text>
                      <TextInput
                        value={itm.quantity}
                        onChangeText={(val) => handleUpdatePurchaseLine(idx, 'quantity', val)}
                        placeholder="0.0"
                        keyboardType="numeric"
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                      />
                    </View>
                    <View className="w-[20%] gap-1">
                      <Text className="text-[9px] font-bold text-slate-400">Rate (₹)</Text>
                      <TextInput
                        value={itm.unit_price}
                        onChangeText={(val) => handleUpdatePurchaseLine(idx, 'unit_price', val)}
                        placeholder="0.0"
                        keyboardType="numeric"
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                      />
                    </View>
                    <Pressable
                      onPress={() => handleRemovePurchaseLine(idx)}
                      className="w-9 h-9 bg-rose-50 border border-rose-100 rounded-xl items-center justify-center mb-0.5 active:scale-95"
                    >
                      <X size={14} color="#e11d48" />
                    </Pressable>
                  </View>
                ))}
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-[10px] font-black text-slate-500 uppercase">Procurement Notes / Remarks</Text>
                <TextInput
                  value={purchaseRemarks}
                  onChangeText={setPurchaseRemarks}
                  placeholder="Log specific details, cargo vehicle numbers..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                />
              </View>
            </ScrollView>

            <Pressable onPress={handleRecordPurchase} className="bg-emerald-600 py-3 rounded-2xl items-center mt-5">
              <Text className="text-xs font-bold text-white">Record Procurement Invoice</Text>
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
    </View>
  );
}
