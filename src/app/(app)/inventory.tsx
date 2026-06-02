import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  Boxes,
  Calendar,
  Check,
  ChevronRight,
  Database,
  FileText,
  Info,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Truck,
  UploadCloud,
  User,
  X,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/lib/pos/brand';
import {
  fetchCategories,
  fetchUnits,
  fetchSuppliers,
  fetchMaterials,
  fetchStockLevels,
  fetchPurchases,
  fetchPurchaseItems,
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
  type InventoryCategory,
  type InventoryUnit,
  type InventorySupplier,
  type InventoryMaterial,
  type InventoryStockLevel,
  type InventoryPurchaseHeader,
  type InventoryPurchaseItem,
  type InventoryStockLedger,
  type InventoryAdjustment,
  type InventoryWastage,
  type InventoryAuditLog,
  type InventoryAlert,
  type DashboardKPIs,
} from '@/lib/pos/inventory-service';

// ─── TABS DEFINITION ─────────────────────────────────────────────────────────

type TabName = 'dashboard' | 'master' | 'purchases' | 'wastage' | 'audit';

interface TabItem {
  id: TabName;
  label: string;
  icon: any;
}

const TABS: TabItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'master', label: 'Master setup', icon: Database },
  { id: 'purchases', label: 'Purchases', icon: Truck },
  { id: 'wastage', label: 'Wastage Register', icon: AlertTriangle },
  { id: 'audit', label: 'Alerts & Logs', icon: ShieldAlert },
];

export default function InventoryScreen() {
  const { width } = useWindowDimensions();
  const numColumns = width >= 768 ? 2 : 1;
  const [activeTab, setActiveTab] = useState<TabName>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [masterSubTab, setMasterSubTab] = useState<'materials' | 'suppliers'>('materials');

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

  // ─── CORE LOADER ───────────────────────────────────────────────────────────

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

  // ─── MEMOIZED FILTERS ──────────────────────────────────────────────────────

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      const matchSearch =
        m.material_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.material_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.barcode && m.barcode.includes(searchQuery));
      const matchCat = selectedCategoryFilter === 'all' || m.category_id === selectedCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [materials, searchQuery, selectedCategoryFilter]);

  // ─── HANDLERS ──────────────────────────────────────────────────────────────

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
    if (!formMatReorder.trim()) {
      setModalError('Reorder Level is required.');
      return;
    }
    if (isNaN(Number(formMatReorder)) || Number(formMatReorder) < 0) {
      setModalError('Reorder Level must be a valid non-negative number.');
      return;
    }
    if (!formMatOpening.trim()) {
      setModalError('Opening Stock is required.');
      return;
    }
    if (isNaN(Number(formMatOpening)) || Number(formMatOpening) < 0) {
      setModalError('Opening Stock must be a valid non-negative number.');
      return;
    }
    if (!formMatAvgCost.trim()) {
      setModalError('Average Unit Cost is required.');
      return;
    }
    if (isNaN(Number(formMatAvgCost)) || Number(formMatAvgCost) < 0) {
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
      console.error(err);
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

  // Supplier handlers
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
      console.error(err);
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

  // Transaction trigger helpers to handle modal reset
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

  // Transaction triggers
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
      itm => !itm.material_id || !itm.quantity || isNaN(Number(itm.quantity)) || Number(itm.quantity) <= 0 || !itm.unit_price || isNaN(Number(itm.unit_price)) || Number(itm.unit_price) <= 0
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
        subtotal: purchaseItems.reduce((acc, itm) => acc + (Number(itm.quantity) * Number(itm.unit_price)), 0),
        discount_amount: 0,
        tax_amount: 0,
        transport_charges: Number(purchaseTransportCharges) || 0,
        other_charges: 0,
        grand_total: purchaseItems.reduce((acc, itm) => acc + (Number(itm.quantity) * Number(itm.unit_price)), 0) + (Number(purchaseTransportCharges) || 0),
        invoice_file_url: purchaseInvoiceNum ? `https://supabase.storage/invoice/${purchaseInvoiceNum}.pdf` : null,
        remarks: purchaseRemarks || null,
        created_by: 'Owner Staff',
      };

      const finalItems = purchaseItems
        .filter(itm => itm.material_id && Number(itm.quantity) > 0)
        .map(itm => ({
          material_id: itm.material_id,
          quantity: Number(itm.quantity),
          unit_price: Number(itm.unit_price),
          line_total: Number(itm.quantity) * Number(itm.unit_price),
        }));

      await createPurchase(headerPayload, finalItems, purchaseLocation);
      setIsPurchaseModalOpen(false);
      // Reset builder
      setPurchaseSupplierId('');
      setPurchaseItems([{ material_id: '', quantity: '', unit_price: '' }]);
      setPurchaseRemarks('');
      setPurchaseInvoiceNum('');
      setPurchaseTransportCharges('0');
      await loadAllData(true);
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || 'Failed to record purchase invoice.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordWastage = async () => {
    if (!wastageMaterialId) {
      setModalError('Please choose a Raw Ingredient.');
      return;
    }
    if (!wastageQty.trim()) {
      setModalError('Quantity Lost is required.');
      return;
    }
    if (isNaN(Number(wastageQty)) || Number(wastageQty) <= 0) {
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
      console.error(err);
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
    if (!adjQty.trim()) {
      setModalError('Quantity is required.');
      return;
    }
    if (isNaN(Number(adjQty)) || Number(adjQty) <= 0) {
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
      console.error(err);
      setModalError(err.message || 'Failed to record adjustment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAlert = async (id: string) => {
    await markAlertRead(id);
    await loadAllData(true);
  };

  // ─── RENDER SUB-VIEWS ──────────────────────────────────────────────────────

  const renderDashboard = () => {
    if (!kpis) return null;

    const cards = [
      { label: 'Total Valuation', val: `₹${kpis.inventoryValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: 'bg-blue-50 border-blue-200 text-blue-900', desc: 'Total asset capitalization' },
      { label: 'Active Items', val: kpis.totalMaterials, color: 'bg-slate-50 border-slate-200 text-slate-900', desc: 'Raw ingredients & materials' },
      { label: 'Low Stock Alert', val: kpis.lowStockCount, color: kpis.lowStockCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900', desc: 'Items below threshold' },
      { label: 'Out of Stock', val: kpis.outOfStockCount, color: kpis.outOfStockCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-900', desc: 'Requires immediate order' },
      { label: 'Active Suppliers', val: kpis.activeSuppliersCount, color: 'bg-emerald-50 border-emerald-200 text-emerald-900', desc: 'Verified vendors registered' },
      { label: 'Turnover Ratio', val: `${kpis.inventoryTurnoverRatio}x`, color: 'bg-purple-50 border-purple-200 text-purple-900', desc: 'Monthly kitchen utilization' },
    ];

    return (
      <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
        {/* KPI Grid */}
        <View className="flex-row flex-wrap justify-between mb-6">
          {cards.map((card, idx) => (
            <View key={idx} className={`w-[31%] p-5 rounded-2xl border mb-5 ${card.color} shadow-sm`}>
              <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{card.label}</Text>
              <Text className="text-3xl font-bold mb-1">{card.val}</Text>
              <Text className="text-[11px] text-slate-400 font-medium">{card.desc}</Text>
            </View>
          ))}
        </View>

        {/* Dynamic trends */}
        <View className="flex-row justify-between mb-8">
          {/* Purchase Cost Trend */}
          <View className="w-[48%] bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-slate-800">Monthly Procurement Volume</Text>
              <TrendingUp size={20} color={colors.primary} />
            </View>
            <View className="flex-row items-baseline mb-3">
              <Text className="text-4xl font-extrabold text-slate-900">₹{kpis.monthlyPurchasesThisMonth.toLocaleString('en-IN')}</Text>
              <Text className="text-xs text-slate-400 ml-2">this month</Text>
            </View>

            <View className="flex-row items-center pt-3 border-t border-slate-100">
              {kpis.purchaseCostTrendPercentage >= 0 ? (
                <ArrowUp size={16} color="#e11d48" className="mr-1" />
              ) : (
                <ArrowDown size={16} color="#16a34a" className="mr-1" />
              )}
              <Text className={`text-xs font-semibold ${kpis.purchaseCostTrendPercentage >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {Math.abs(kpis.purchaseCostTrendPercentage).toFixed(1)}% {kpis.purchaseCostTrendPercentage >= 0 ? 'increase' : 'decrease'}
              </Text>
              <Text className="text-xs text-slate-400 ml-1">vs previous month (₹{kpis.monthlyPurchasesPrevMonth.toLocaleString()})</Text>
            </View>
          </View>

          {/* Wastage Register leakage */}
          <View className="w-[48%] bg-rose-50/50 border border-rose-100 p-6 rounded-3xl shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-rose-900">Wastage Cost Impact</Text>
              <AlertTriangle size={20} color="#e11d48" />
            </View>
            <View className="flex-row items-baseline mb-3">
              <Text className="text-4xl font-extrabold text-rose-900">₹{kpis.wastageCostImpactThisMonth.toLocaleString('en-IN')}</Text>
              <Text className="text-xs text-rose-500/80 ml-2">lost this month</Text>
            </View>
            <Text className="text-xs text-rose-700/80 leading-relaxed font-medium">
              Leakage detected via kitchen spoils, expirations, and thefts. Target reduction rate is 5% of monthly purchase volume.
            </Text>
          </View>
        </View>

        {/* Top Purchased Materials list */}
        <View className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm mb-12">
          <Text className="text-lg font-bold text-slate-900 mb-4">Top Procurement Items Leaderboard</Text>
          {kpis.topPurchasedMaterials.length === 0 ? (
            <Text className="text-sm text-slate-400 py-4 italic">No transactions recorded yet.</Text>
          ) : (
            <View>
              {kpis.topPurchasedMaterials.map((item, idx) => (
                <View key={item.material_id} className="flex-row items-center justify-between py-3 border-b border-slate-100 last:border-0">
                  <View className="flex-row items-center">
                    <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mr-3">
                      <Text className="text-xs font-bold text-slate-600">#{idx + 1}</Text>
                    </View>
                    <Text className="text-sm font-semibold text-slate-800">{item.material_name}</Text>
                  </View>
                  <View className="flex-row items-center">
                    <Text className="text-xs text-slate-400 mr-6">Qty: {item.quantity}</Text>
                    <Text className="text-sm font-bold text-slate-900">₹{item.total_spend.toLocaleString()}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderMaterials = () => {
    return (
      <View className="flex-1 px-6 pt-4">
        {/* Search Bar + Add Button */}
        <View className="flex-row justify-between items-center mb-5">
          <View className="flex-1 flex-row bg-white border border-slate-200 rounded-2xl items-center px-4 py-2.5 shadow-sm mr-4">
            <Search size={18} color="#64748b" className="mr-2" />
            <TextInput
              placeholder="Search materials by name, code or SKU barcode..."
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

          {/* Category Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mr-4 max-w-[40%] flex-grow-0">
            <View className="flex-row py-1">
              <Pressable
                onPress={() => setSelectedCategoryFilter('all')}
                className={`px-4 py-2 rounded-full mr-2 border ${selectedCategoryFilter === 'all' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200'}`}
              >
                <Text className={`text-xs font-semibold ${selectedCategoryFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>All</Text>
              </Pressable>
              {categories.map(c => (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedCategoryFilter(c.id)}
                  className={`px-4 py-2 rounded-full mr-2 border ${selectedCategoryFilter === c.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200'}`}
                >
                  <Text className={`text-xs font-semibold ${selectedCategoryFilter === c.id ? 'text-white' : 'text-slate-600'}`}>{c.category_name}</Text>
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

        {/* Materials Table List */}
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
              <View className="bg-white border border-slate-200 rounded-2xl p-3.5 mb-3 flex-row items-center justify-between shadow-sm hover:border-blue-400 transition-all">
                <View className="flex-row items-center flex-1">
                  <View className="w-10 h-10 bg-blue-50 rounded-xl items-center justify-center mr-3">
                    <Boxes size={18} color={colors.primary} />
                  </View>
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center mb-0.5">
                      <Text className="text-sm font-black text-slate-800 mr-2">{item.material_name}</Text>
                      <Text className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-md uppercase">{item.material_code}</Text>
                    </View>
                    <View className="flex-row flex-wrap items-center">
                      <Text className="text-[11px] text-slate-400 mr-2.5">Cat: {item.category_name}</Text>
                      <Text className="text-[11px] text-slate-400 mr-2.5">Unit: {item.unit_short_name}</Text>
                      {item.barcode && <Text className="text-[11px] text-slate-400 mr-2.5">SKU: {item.barcode}</Text>}
                      {item.hsn_code && <Text className="text-[11px] text-slate-400">HSN: {item.hsn_code}</Text>}
                    </View>
                    {/* Location Stock Levels */}
                    <View className="flex-row mt-1.5 pt-1.5 border-t border-slate-50">
                      <Text className="text-[9.5px] text-slate-400 font-semibold uppercase tracking-wider mr-2">Location Splits:</Text>
                      <Text className="text-[11px] font-semibold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        {item.category_name === 'Raw Meats' ? 'Freezer' : 'Dry Storage'}: {item.current_stock} {item.unit_short_name}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Stock levels and options */}
                <View className="flex-row items-center">
                  <View className="items-end mr-4">
                    <Text className="text-xs font-black text-slate-900">{item.current_stock} {item.unit_short_name}</Text>
                    <View className={`border rounded-full px-1.5 py-0.5 mt-0.5 ${badgeColor}`}>
                      <Text className="text-[8px] font-bold uppercase">{badgeText}</Text>
                    </View>
                  </View>

                  <View className="items-end mr-4 border-l border-slate-100 pl-4">
                    <Text className="text-[10px] text-slate-400">Avg Cost</Text>
                    <Text className="text-xs font-extrabold text-slate-800 mt-0.5">₹{item.average_cost.toFixed(2)}</Text>
                  </View>

                  <View className="flex-row items-center border-l border-slate-100 pl-4 gap-1.5">
                    <Pressable
                      onPress={() => handleOpenMaterialModal(item)}
                      className="w-7.5 h-7.5 bg-slate-50 border border-slate-200 rounded-lg items-center justify-center hover:bg-blue-50 active:scale-95 transition-transform"
                    >
                      <FileText size={13} color="#64748b" />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeleteMaterialItem(item.id)}
                      className="w-7.5 h-7.5 bg-slate-50 border border-rose-100 rounded-lg items-center justify-center hover:bg-rose-50 active:scale-95 transition-transform"
                    >
                      <Trash2 size={13} color="#e11d48" />
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
      <View className="flex-1 px-6 pt-4">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-bold text-slate-800">Verified Suppliers & Procurement Partners</Text>
            <Text className="text-xs text-slate-500">Add suppliers, compare contract terms, and review supplier logs</Text>
          </View>
          <Pressable
            onPress={() => handleOpenSupplierModal()}
            className="flex-row bg-blue-600 items-center justify-center py-2 px-3.5 rounded-xl shadow-sm active:scale-95 transition-transform"
          >
            <Plus size={13} color="white" className="mr-1" />
            <Text className="text-xs font-bold text-white">Add Supplier</Text>
          </Pressable>
        </View>

        {/* Suppliers directory grid */}
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
            <View className={`${numColumns === 2 ? 'w-[49%]' : 'w-full'} bg-white border border-slate-200 rounded-2xl p-3.5 mb-3.5 shadow-sm`}>
              <View className="flex-row justify-between items-start mb-2.5">
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-black text-slate-800">{item.supplier_name}</Text>
                  <Text className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Code: {item.supplier_code}</Text>
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
                  <Text className="text-[11px] text-slate-500 flex-1">{item.address}, {item.city}, {item.state}</Text>
                </View>
              </View>

              <View className="flex-row justify-between items-center mt-4.5 pt-2 border-t border-slate-50">
                <Text className="text-[10px] italic text-slate-400">Created: {new Date(item.created_at).toLocaleDateString()}</Text>
                <View className="flex-row gap-1.5">
                  <Pressable
                    onPress={() => handleOpenSupplierModal(item)}
                    className="w-7.5 h-7.5 bg-slate-50 border border-slate-200 rounded-lg items-center justify-center hover:bg-blue-50 active:scale-95 transition-transform"
                  >
                    <FileText size={13} color="#64748b" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteSupplierItem(item.id)}
                    className="w-7.5 h-7.5 bg-slate-50 border border-rose-100 rounded-lg items-center justify-center hover:bg-rose-50 active:scale-95 transition-transform"
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
      <View className="flex-1 px-6 pt-4">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-bold text-slate-800">Purchase Invoices & Order Procurement</Text>
            <Text className="text-xs text-slate-500">Record supplier invoices, transport charges, and automate cost averaging</Text>
          </View>

          <View className="flex-row gap-2">
            <Pressable
              onPress={handleOpenAdjustmentModal}
              className="flex-row bg-slate-100 items-center justify-center py-3 px-5 rounded-2xl active:scale-95 transition-transform"
            >
              <Info size={16} color="#64748b" className="mr-1.5" />
              <Text className="text-sm font-bold text-slate-600">Manual Stock Adjustment</Text>
            </Pressable>

            <Pressable
              onPress={handleOpenPurchaseModal}
              className="flex-row bg-blue-600 items-center justify-center py-3 px-5 rounded-2xl shadow-md active:scale-95 transition-transform"
            >
              <Plus size={16} color="white" className="mr-1.5" />
              <Text className="text-sm font-bold text-white">Record Purchase Invoice</Text>
            </Pressable>
          </View>
        </View>

        {/* Purchase Orders List */}
        <FlatList
          key="purchases-flatlist"
          data={purchases}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="py-20 w-full items-center justify-center">
              <Truck size={48} color="#94a3b8" className="mb-4" />
              <Text className="text-base font-bold text-slate-500">No purchase records registered</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white border border-slate-200 rounded-2xl p-3.5 mb-3 shadow-sm">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 bg-emerald-50 rounded-xl items-center justify-center mr-3">
                    <Truck size={20} color="#10b981" />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-800">{item.purchase_number}</Text>
                    <Text className="text-xs text-slate-400">{new Date(item.purchase_date).toLocaleDateString()} • Recorded by {item.created_by}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-base font-extrabold text-slate-900">₹{item.grand_total.toLocaleString('en-IN')}</Text>
                  <Text className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">Payment: {item.payment_mode}</Text>
                </View>
              </View>

              <View className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mt-2">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-xs font-semibold text-slate-400">Supplier Name:</Text>
                  <Text className="text-xs font-bold text-slate-700">{item.supplier_name}</Text>
                </View>
                {item.invoice_number && (
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-xs font-semibold text-slate-400">Invoice Number:</Text>
                    <Text className="text-xs font-bold text-slate-700 uppercase">{item.invoice_number}</Text>
                  </View>
                )}
                {item.invoice_file_url && (
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-xs font-semibold text-slate-400">Attachment Copy:</Text>
                    <View className="flex-row items-center bg-blue-50 border border-blue-100 rounded px-2 py-0.5">
                      <FileText size={10} color={colors.primary} className="mr-1" />
                      <Text className="text-[9px] font-bold text-blue-700 uppercase">invoice.pdf</Text>
                    </View>
                  </View>
                )}
                {item.remarks && (
                  <View className="flex-row justify-between pt-2 border-t border-slate-200">
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
      <View className="flex-1 px-6 pt-4">
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-bold text-slate-800">Wastage & Kitchen Spoils Register</Text>
            <Text className="text-xs text-slate-500">Maintain high accuracy on spoiled products, thefts, damages, and negative adjustments</Text>
          </View>
          <Pressable
            onPress={handleOpenWastageModal}
            className="flex-row bg-rose-600 items-center justify-center py-3 px-5 rounded-2xl shadow-md active:scale-95 transition-transform"
          >
            <Plus size={16} color="white" className="mr-1.5" />
            <Text className="text-sm font-bold text-white">Record Spoils / Wastage</Text>
          </Pressable>
        </View>

        {/* Wastage list */}
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
            <View className="bg-white border border-slate-200 rounded-2xl p-3.5 mb-3 shadow-sm">
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 bg-rose-50 rounded-xl items-center justify-center mr-3">
                    <AlertTriangle size={20} color="#e11d48" />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-800">{item.material_name}</Text>
                    <Text className="text-xs text-slate-400">Reason: {item.reason} • Location: {item.location_id}</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-base font-extrabold text-rose-700">₹{item.cost_impact.toFixed(2)}</Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">Qty lost: {item.quantity}</Text>
                </View>
              </View>

              <View className="flex-row justify-between pt-3 mt-3 border-t border-slate-100 items-center">
                <Text className="text-[11px] text-slate-400 font-semibold">Recorded by {item.recorded_by}</Text>
                <Text className="text-[11px] text-slate-400">{new Date(item.recorded_at).toLocaleDateString()} {new Date(item.recorded_at).toLocaleTimeString()}</Text>
              </View>
            </View>
          )}
        />
      </View>
    );
  };

  const renderAudit = () => {
    return (
      <View className="flex-1 px-6 pt-4 flex-row justify-between">
        {/* Left Side: System Alerts */}
        <View className="w-[48%] flex-col">
          <Text className="text-base font-bold text-slate-800 mb-4">Active Stock Alerts & Thresholds</Text>
          <FlatList
            key="alerts-flatlist"
            data={alerts}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              let alertColor = 'border-amber-200 bg-amber-50/50';
              if (item.alert_type === 'Out of Stock') alertColor = 'border-rose-200 bg-rose-50/50';

              return (
                <View className={`border rounded-xl p-3 mb-3 ${alertColor} shadow-sm`}>
                  <View className="flex-row justify-between items-start mb-2">
                    <Text className="text-xs font-extrabold uppercase tracking-wider text-slate-700">{item.alert_type}</Text>
                    {!item.is_read && (
                      <Pressable
                        onPress={() => handleMarkAlert(item.id)}
                        className="bg-slate-200 border border-slate-300 rounded px-2 py-0.5"
                      >
                        <Text className="text-[9px] font-bold text-slate-600">Acknowledge</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text className="text-xs font-medium text-slate-800 leading-relaxed mb-1">{item.message}</Text>
                  <Text className="text-[10px] text-slate-400 italic">{new Date(item.created_at).toLocaleString()}</Text>
                </View>
              );
            }}
          />
        </View>

        {/* Right Side: Audit Logs */}
        <View className="w-[48%] flex-col">
          <Text className="text-base font-bold text-slate-800 mb-4">Operations Audit Log (Who Changed What)</Text>
          <FlatList
            key="audit-flatlist"
            data={auditLogs}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View className="bg-white border border-slate-100 rounded-xl p-3 mb-3 shadow-sm">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-xs font-bold text-slate-800">Module: {item.module_name.toUpperCase()}</Text>
                  <Text className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase">{item.action_type}</Text>
                </View>
                <Text className="text-[10px] text-slate-500 mb-2">Operation recorded on record ID: {item.record_id}</Text>
                <View className="flex-row justify-between items-center border-t border-slate-50 pt-2">
                  <Text className="text-[10px] text-slate-400 font-semibold">Performed by: {item.performed_by}</Text>
                  <Text className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</Text>
                </View>
              </View>
            )}
          />
        </View>
      </View>
    );
  };

  const renderMaster = () => {
    return (
      <View className="flex-1">
        {/* Sub pill navigation */}
        <View className="flex-row bg-slate-100 border border-slate-200/60 rounded-2xl p-1 mx-6 mt-4 self-start shadow-sm mb-2">
          <Pressable
            onPress={() => setMasterSubTab('materials')}
            className={`flex-row items-center px-6 py-2.5 rounded-xl gap-2 active:scale-95 transition-all ${
              masterSubTab === 'materials' ? 'bg-white shadow-sm' : ''
            }`}
          >
            <Boxes size={15} color={masterSubTab === 'materials' ? '#0066b2' : '#64748b'} />
            <Text
              className={`text-xs font-bold ${
                masterSubTab === 'materials' ? 'text-[#0066b2]' : 'text-slate-500'
              }`}
            >
              Raw Materials Master
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMasterSubTab('suppliers')}
            className={`flex-row items-center px-6 py-2.5 rounded-xl gap-2 active:scale-95 transition-all ${
              masterSubTab === 'suppliers' ? 'bg-white shadow-sm' : ''
            }`}
          >
            <User size={15} color={masterSubTab === 'suppliers' ? '#0066b2' : '#64748b'} />
            <Text
              className={`text-xs font-bold ${
                masterSubTab === 'suppliers' ? 'text-[#0066b2]' : 'text-slate-500'
              }`}
            >
              Supplier Master Directory
            </Text>
          </Pressable>
        </View>

        {masterSubTab === 'materials' ? renderMaterials() : renderSuppliers()}
      </View>
    );
  };

  const renderActiveTabPanel = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'master':
        return renderMaster();
      case 'purchases':
        return renderPurchases();
      case 'wastage':
        return renderWastage();
      case 'audit':
        return renderActiveTabPanelWithLogs();
      default:
        return renderDashboard();
    }
  };

  // Dedicated helper to bypass TS rules
  const renderActiveTabPanelWithLogs = () => {
    return renderAudit();
  };

  // ─── TRANSACT ITEM BUILDER SUB-ELEMENTS ────────────────────────────────────

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

  // ─── GENERAL LAYOUT ────────────────────────────────────────────────────────

  if (isLoading && !kpis) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-sm text-slate-400 mt-2">Compiling inventory ledger...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      {/* Branded Top Header Surface */}
      <LinearGradient
        colors={['#024db1', '#01389e']}
        style={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 14,
          height: 84,
          justifyContent: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#E2E8F0', fontFamily: 'Outfit, "Avenir Next", system-ui, sans-serif', letterSpacing: -0.5 }}>
              Le Leban Inventory Center
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#E0F2FE', marginTop: 1, opacity: 0.9 }}>
              Enterprise Restaurant Procurement & Spoilage Register
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh inventory"
            onPress={() => loadAllData()}
            style={({ pressed }: any) => [
              {
                width: 36,
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            {isLoading
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <RefreshCw color="#FFFFFF" size={16} />
            }
          </Pressable>
        </View>
      </LinearGradient>

      {/* Tabs list */}
      <View className="bg-white border-b border-slate-200 px-8 flex-row items-center gap-4 shadow-sm">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              className={`flex-row items-center py-4 px-5 border-b-[3px] gap-2.5 active:scale-95 transition-all ${
                isActive ? 'border-[#0066b2]' : 'border-transparent'
              }`}
            >
              <TabIcon size={18} color={isActive ? '#0066b2' : '#64748b'} />
              <Text
                style={{
                  color: isActive ? '#0066b2' : '#64748b',
                  fontSize: 14.5,
                  fontWeight: isActive ? '800' : '600',
                  letterSpacing: 0.2,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Primary content area */}
      <View className="flex-1 pb-24">
        {errorMsg && (
          <View className="m-6 bg-rose-50 border border-rose-200 rounded-2xl p-4 flex-row items-center">
            <AlertTriangle size={20} color="#e11d48" className="mr-3" />
            <Text className="text-sm font-bold text-rose-700">{errorMsg}</Text>
          </View>
        )}
        {renderActiveTabPanel()}
      </View>

      {/* ─── MODAL DRAWERS ───────────────────────────────────────────────────── */}

      {/* 1. Add/Edit Material Modal */}
      <Modal visible={isMaterialModalOpen} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[50%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-lg font-bold text-slate-900">{editingMaterial ? 'Edit Raw Ingredient' : 'Register New Raw Material'}</Text>
              <Pressable onPress={() => { setIsMaterialModalOpen(false); setModalError(null); }}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[500px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-xs font-bold text-slate-500">Material Name*</Text>
                <TextInput
                  value={formMatName}
                  onChangeText={setFormMatName}
                  placeholder="e.g., Premium Tahini Paste"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Code (Unique Identifier)*</Text>
                  <TextInput
                    value={formMatCode}
                    onChangeText={setFormMatCode}
                    placeholder="e.g., MAT05"
                    editable={!editingMaterial}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">SKU Barcode (Optional)</Text>
                  <TextInput
                    value={formMatBarcode}
                    onChangeText={setFormMatBarcode}
                    placeholder="e.g., 89012345..."
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Category*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {categories.map(c => (
                      <Pressable
                        key={c.id}
                        onPress={() => setFormMatCategory(c.id)}
                        className={`p-2 rounded mb-1 ${formMatCategory === c.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{c.category_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Unit of Measurement*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {units.map(u => (
                      <Pressable
                        key={u.id}
                        onPress={() => setFormMatUnit(u.id)}
                        className={`p-2 rounded mb-1 ${formMatUnit === u.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{u.unit_name} ({u.short_name})</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">HSN Code (GST)</Text>
                  <TextInput
                    value={formMatHsn}
                    onChangeText={setFormMatHsn}
                    placeholder="e.g., 2103"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Preferred Supplier</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {suppliers.map(s => (
                      <Pressable
                        key={s.id}
                        onPress={() => setFormMatSupplier(s.id)}
                        className={`p-2 rounded mb-1 ${formMatSupplier === s.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{s.supplier_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[31%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Reorder Level*</Text>
                  <TextInput
                    value={formMatReorder}
                    onChangeText={setFormMatReorder}
                    placeholder="10"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[31%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Opening Stock*</Text>
                  <TextInput
                    value={formMatOpening}
                    onChangeText={setFormMatOpening}
                    placeholder="0"
                    keyboardType="numeric"
                    editable={!editingMaterial}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[31%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Average Unit Cost (₹)*</Text>
                  <TextInput
                    value={formMatAvgCost}
                    onChangeText={setFormMatAvgCost}
                    placeholder="0"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>
            </ScrollView>

            <Pressable
              onPress={handleSaveMaterial}
              className="bg-blue-600 py-3 rounded-2xl items-center mt-5"
            >
              <Text className="text-sm font-bold text-white">Save Material</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 2. Add/Edit Supplier Modal */}
      <Modal visible={isSupplierModalOpen} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[50%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-lg font-bold text-slate-900">{editingSupplier ? 'Edit Supplier Profile' : 'Register New Supplier'}</Text>
              <Pressable onPress={() => { setIsSupplierModalOpen(false); setModalError(null); }}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[500px] pr-2 gap-4">
              <View className="gap-1 mb-3">
                <Text className="text-xs font-bold text-slate-500">Supplier Legal Name*</Text>
                <TextInput
                  value={formSupName}
                  onChangeText={setFormSupName}
                  placeholder="e.g., Le Jardin Farms Ltd."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Supplier Code*</Text>
                  <TextInput
                    value={formSupCode}
                    onChangeText={setFormSupCode}
                    placeholder="e.g., SUP03"
                    editable={!editingSupplier}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Contact Person Name</Text>
                  <TextInput
                    value={formSupContact}
                    onChangeText={setFormSupContact}
                    placeholder="e.g., Anand Rao"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Phone Number*</Text>
                  <TextInput
                    value={formSupPhone}
                    onChangeText={setFormSupPhone}
                    placeholder="e.g., +91 9999999999"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Email Address</Text>
                  <TextInput
                    value={formSupEmail}
                    onChangeText={setFormSupEmail}
                    placeholder="e.g., sales@lejardinfarms.in"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">GST Number</Text>
                  <TextInput
                    value={formSupGst}
                    onChangeText={setFormSupGst}
                    placeholder="e.g., 29BBBBB..."
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Payment Terms</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Net 15', 'Net 30', 'Cash on Delivery', 'Advance'].map(term => (
                      <Pressable
                        key={term}
                        onPress={() => setFormSupTerms(term)}
                        className={`p-2 rounded mb-1 ${formSupTerms === term ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{term}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-xs font-bold text-slate-500">Supplier Notes</Text>
                <TextInput
                  value={formSupNotes}
                  onChangeText={setFormSupNotes}
                  placeholder="Payment bank details, alternate contacts..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </View>
            </ScrollView>

            <Pressable
              onPress={handleSaveSupplier}
              className="bg-blue-600 py-3 rounded-2xl items-center mt-5"
            >
              <Text className="text-sm font-bold text-white">Save Supplier</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 3. Record Purchase Invoice Modal */}
      <Modal visible={isPurchaseModalOpen} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[60%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-lg font-bold text-slate-900">Record Procurement Supplier Invoice</Text>
              <Pressable onPress={() => { setIsPurchaseModalOpen(false); setModalError(null); }}>
                <X size={20} color="#64748b" />
              </Pressable>
            </View>

            {modalError && (
              <View className="mb-4 bg-rose-50 border border-rose-100 rounded-xl p-3 flex-row items-center">
                <AlertTriangle size={16} color="#e11d48" className="mr-2" />
                <Text className="text-xs font-bold text-rose-700">{modalError}</Text>
              </View>
            )}

            <ScrollView className="max-h-[500px] pr-2 gap-4">
              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Choose Supplier*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {suppliers.map(s => (
                      <Pressable
                        key={s.id}
                        onPress={() => setPurchaseSupplierId(s.id)}
                        className={`p-2 rounded mb-1 ${purchaseSupplierId === s.id ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{s.supplier_name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Invoice / Bill Number*</Text>
                  <TextInput
                    value={purchaseInvoiceNum}
                    onChangeText={setPurchaseInvoiceNum}
                    placeholder="e.g., INV-8976"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[31%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Payment Mode*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Cash', 'UPI', 'Bank Transfer', 'Credit Card'].map(m => (
                      <Pressable
                        key={m}
                        onPress={() => setPurchasePaymentMode(m)}
                        className={`p-2 rounded mb-1 ${purchasePaymentMode === m ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{m}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="w-[31%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Transport / Freight (₹)</Text>
                  <TextInput
                    value={purchaseTransportCharges}
                    onChangeText={setPurchaseTransportCharges}
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[31%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Storage Location Destination</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Dry Storage', 'Freezer', 'Central Kitchen'].map(loc => (
                      <Pressable
                        key={loc}
                        onPress={() => setPurchaseLocation(loc)}
                        className={`p-2 rounded mb-1 ${purchaseLocation === loc ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{loc}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Items multi builder line */}
              <View className="border-t border-slate-100 pt-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-sm font-bold text-slate-800">Procurement Items Details</Text>
                  <Pressable
                    onPress={handleAddPurchaseLine}
                    className="flex-row bg-slate-100 border border-slate-200 rounded-xl px-3 py-1 items-center"
                  >
                    <Plus size={12} color="#64748b" className="mr-1" />
                    <Text className="text-[11px] font-bold text-slate-600">Add Item Line</Text>
                  </Pressable>
                </View>

                {purchaseItems.map((itm, idx) => (
                  <View key={idx} className="flex-row justify-between items-end mb-3 gap-2 border-b border-slate-50 pb-2">
                    <View className="w-[45%] gap-1">
                      <Text className="text-[10px] font-bold text-slate-400">Choose Raw Material</Text>
                      <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[60px] p-1">
                        {materials.map(m => (
                          <Pressable
                            key={m.id}
                            onPress={() => handleUpdatePurchaseLine(idx, 'material_id', m.id)}
                            className={`p-1.5 rounded mb-1 ${itm.material_id === m.id ? 'bg-blue-100' : ''}`}
                          >
                            <Text className="text-[10px] font-semibold">{m.material_name} ({m.material_code})</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View className="w-[20%] gap-1">
                      <Text className="text-[10px] font-bold text-slate-400">Qty</Text>
                      <TextInput
                        value={itm.quantity}
                        onChangeText={(val) => handleUpdatePurchaseLine(idx, 'quantity', val)}
                        placeholder="0.0"
                        keyboardType="numeric"
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                      />
                    </View>
                    <View className="w-[20%] gap-1">
                      <Text className="text-[10px] font-bold text-slate-400">Unit Price (₹)</Text>
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
                <Text className="text-xs font-bold text-slate-500">Procurement Notes / Remarks</Text>
                <TextInput
                  value={purchaseRemarks}
                  onChangeText={setPurchaseRemarks}
                  placeholder="Log specific details, transport vehicle numbers..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </View>
            </ScrollView>

            <Pressable
              onPress={handleRecordPurchase}
              className="bg-emerald-600 py-3 rounded-2xl items-center mt-5"
            >
              <Text className="text-sm font-bold text-white">Record Procurement Invoice</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 4. Record Wastage Modal */}
      <Modal visible={isWastageModalOpen} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[40%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-lg font-bold text-slate-900">Record Kitchen Waste & Spoils</Text>
              <Pressable onPress={() => { setIsWastageModalOpen(false); setModalError(null); }}>
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
                <Text className="text-xs font-bold text-slate-500">Choose Raw Ingredient*</Text>
                <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                  {materials.map(m => (
                    <Pressable
                      key={m.id}
                      onPress={() => setWastageMaterialId(m.id)}
                      className={`p-2 rounded mb-1 ${wastageMaterialId === m.id ? 'bg-blue-100' : ''}`}
                    >
                      <Text className="text-xs font-semibold">{m.material_name} ({m.current_stock} left)</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Quantity Lost*</Text>
                  <TextInput
                    value={wastageQty}
                    onChangeText={setWastageQty}
                    placeholder="e.g., 2.5"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Deduct Location Source</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Dry Storage', 'Freezer', 'Central Kitchen'].map(loc => (
                      <Pressable
                        key={loc}
                        onPress={() => setWastageLocation(loc)}
                        className={`p-2 rounded mb-1 ${wastageLocation === loc ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{loc}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Wastage Reason*</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Expired', 'Spoiled', 'Kitchen Waste', 'Damage', 'Theft', 'Other'].map(r => (
                      <Pressable
                        key={r}
                        onPress={() => setWastageReason(r as any)}
                        className={`p-2 rounded mb-1 ${wastageReason === r ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{r}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Recorded By Staff Name</Text>
                  <TextInput
                    value={wastageRecorder}
                    onChangeText={setWastageRecorder}
                    placeholder="e.g., Chef Amit"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>
            </ScrollView>

            <Pressable
              onPress={handleRecordWastage}
              className="bg-rose-600 py-3 rounded-2xl items-center mt-5"
            >
              <Text className="text-sm font-bold text-white">Log Wastage Cost Impact</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 5. Manual Adjustment Modal */}
      <Modal visible={isAdjustmentModalOpen} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-6">
          <View className="bg-white w-[40%] rounded-3xl p-6 shadow-2xl">
            <View className="flex-row justify-between items-center border-b border-slate-100 pb-4 mb-4">
              <Text className="text-lg font-bold text-slate-900">Manual Inventory Stock Adjustment</Text>
              <Pressable onPress={() => { setIsAdjustmentModalOpen(false); setModalError(null); }}>
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
                <Text className="text-xs font-bold text-slate-500">Choose Raw Ingredient*</Text>
                <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                  {materials.map(m => (
                    <Pressable
                      key={m.id}
                      onPress={() => setAdjMaterialId(m.id)}
                      className={`p-2 rounded mb-1 ${adjMaterialId === m.id ? 'bg-blue-100' : ''}`}
                    >
                      <Text className="text-xs font-semibold">{m.material_name} ({m.current_stock} left)</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Adjustment Type*</Text>
                  <View className="flex-row gap-2 mt-1">
                    <Pressable
                      onPress={() => setAdjType('Add')}
                      className={`flex-1 py-2 rounded-xl items-center border ${adjType === 'Add' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <Text className="text-xs font-semibold">Add (+)</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setAdjType('Deduct')}
                      className={`flex-1 py-2 rounded-xl items-center border ${adjType === 'Deduct' ? 'bg-rose-50 border-rose-500 text-rose-700 font-bold' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <Text className="text-xs font-semibold">Deduct (-)</Text>
                    </Pressable>
                  </View>
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Quantity*</Text>
                  <TextInput
                    value={adjQty}
                    onChangeText={setAdjQty}
                    placeholder="e.g., 5.0"
                    keyboardType="numeric"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>

              <View className="flex-row justify-between mb-3">
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Adjustment Location Source</Text>
                  <ScrollView className="bg-slate-50 border border-slate-200 rounded-xl max-h-[80px] p-2">
                    {['Dry Storage', 'Freezer', 'Central Kitchen'].map(loc => (
                      <Pressable
                        key={loc}
                        onPress={() => setAdjLocation(loc)}
                        className={`p-2 rounded mb-1 ${adjLocation === loc ? 'bg-blue-100' : ''}`}
                      >
                        <Text className="text-xs font-semibold">{loc}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
                <View className="w-[48%] gap-1">
                  <Text className="text-xs font-bold text-slate-500">Audit / Adjust Reason*</Text>
                  <TextInput
                    value={adjReason}
                    onChangeText={setAdjReason}
                    placeholder="e.g., Physical Stock Audit"
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                  />
                </View>
              </View>

              <View className="gap-1 mb-3">
                <Text className="text-xs font-bold text-slate-500">Remarks / Explanations</Text>
                <TextInput
                  value={adjRemarks}
                  onChangeText={setAdjRemarks}
                  placeholder="Record why this change was logged manually..."
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </View>
            </ScrollView>

            <Pressable
              onPress={handleRecordAdjustment}
              className="bg-blue-600 py-3 rounded-2xl items-center mt-5"
            >
              <Text className="text-sm font-bold text-white">Record Adjust Movement</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
