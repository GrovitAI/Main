import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';

// ─── TYPES & INTERFACES ───────────────────────────────────────────────────────

export type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

export type InventoryCategory = {
  id: string;
  tenant_id: string;
  branch_id: string;
  category_code: string;
  category_name: string;
  description: string | null;
  is_active: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryUnit = {
  id: string;
  tenant_id: string;
  branch_id: string;
  unit_code: string;
  unit_name: string;
  short_name: string;
  is_active: boolean;
};

export type InventorySupplier = {
  id: string;
  tenant_id: string;
  branch_id: string;
  supplier_code: string;
  supplier_name: string;
  contact_person: string | null;
  phone: string;
  alternate_phone: string | null;
  email: string | null;
  gst_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryMaterial = {
  id: string;
  tenant_id: string;
  branch_id: string;
  material_code: string;
  material_name: string;
  category_id: string | null;
  inventory_unit_id: string | null;
  opening_stock: number;
  current_stock: number;
  reorder_level: number;
  average_cost: number;
  last_purchase_price: number;
  inventory_value: number;
  barcode: string | null;
  hsn_code: string | null;
  preferred_supplier_id: string | null;
  is_active: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  // Join properties populated for UI
  category_name?: string;
  unit_short_name?: string;
};

export type InventoryStockLevel = {
  id: string;
  tenant_id: string;
  branch_id: string;
  material_id: string;
  location_id: string; // e.g., 'Freezer', 'Dry Storage', 'Central Kitchen'
  current_stock: number;
  reserved_stock: number;
  available_stock: number;
  updated_at: string;
};

export type InventoryVendorPrice = {
  id: string;
  tenant_id: string;
  branch_id: string;
  material_id: string;
  supplier_id: string;
  purchase_price: number;
  effective_date: string;
  created_at: string;
};

export type InventoryPurchaseHeader = {
  id: string;
  tenant_id: string;
  branch_id: string;
  purchase_number: string;
  purchase_date: string;
  supplier_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  payment_mode: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  transport_charges: number;
  other_charges: number;
  grand_total: number;
  invoice_file_url: string | null;
  remarks: string | null;
  status: 'Draft' | 'Completed';
  created_by: string | null;
  created_at: string;
  supplier_name?: string;
};

export type InventoryPurchaseItem = {
  id: string;
  tenant_id: string;
  branch_id: string;
  purchase_header_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
  material_name?: string;
};

export type InventoryStockLedger = {
  id: string;
  tenant_id: string;
  branch_id: string;
  material_id: string;
  transaction_date: string;
  transaction_type: string; // 'Purchase', 'Adjustment', 'Wastage'
  reference_type: string | null;
  reference_id: string | null;
  qty_in: number;
  qty_out: number;
  balance_stock: number;
  unit_cost: number;
  total_value: number;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  material_name?: string;
};

export type InventoryAdjustment = {
  id: string;
  tenant_id: string;
  branch_id: string;
  material_id: string;
  adjustment_date: string;
  quantity: number;
  adjustment_type: 'Add' | 'Deduct';
  reason: string;
  remarks: string | null;
  location_id: string;
  created_by: string | null;
  created_at: string;
  material_name?: string;
};

export type InventoryWastage = {
  id: string;
  tenant_id: string;
  branch_id: string;
  material_id: string;
  quantity: number;
  reason: 'Expired' | 'Spoiled' | 'Kitchen Waste' | 'Damage' | 'Theft' | 'Other';
  cost_impact: number;
  location_id: string;
  recorded_by: string;
  recorded_at: string;
  material_name?: string;
};

export type InventoryAuditLog = {
  id: string;
  tenant_id: string;
  branch_id: string;
  module_name: 'materials' | 'purchases' | 'adjustments' | 'suppliers' | 'wastage' | 'categories' | 'units';
  record_id: string;
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'ADJUST' | 'WASTAGE';
  old_value: any;
  new_value: any;
  performed_by: string;
  created_at: string;
};

export type InventoryAlert = {
  id: string;
  tenant_id: string;
  branch_id: string;
  material_id: string;
  alert_type: 'Low Stock' | 'Out of Stock' | 'Negative Stock' | 'Cost Spike';
  message: string;
  is_read: boolean;
  created_at: string;
  material_name?: string;
};

export type DashboardKPIs = {
  totalMaterials: number;
  outOfStockCount: number;
  lowStockCount: number;
  activeSuppliersCount: number;
  monthlyPurchasesThisMonth: number;
  monthlyPurchasesPrevMonth: number;
  purchaseCostTrendPercentage: number;
  inventoryValuation: number;
  inventoryTurnoverRatio: number;
  wastageCostImpactThisMonth: number;
  topPurchasedMaterials: {
    material_id: string;
    material_name: string;
    quantity: number;
    total_spend: number;
  }[];
};

// ─── LOCAL STORAGE FALLBACK SEED DATA ──────────────────────────────────────────

const LOCAL_STORAGE_KEYS = {
  CATEGORIES: 'grovit_inv_categories_v1',
  UNITS: 'grovit_inv_units_v1',
  SUPPLIERS: 'grovit_inv_suppliers_v1',
  MATERIALS: 'grovit_inv_materials_v1',
  STOCK_LEVELS: 'grovit_inv_stock_levels_v1',
  VENDOR_PRICES: 'grovit_inv_vendor_prices_v1',
  PURCHASE_HEADERS: 'grovit_inv_purchases_v1',
  PURCHASE_ITEMS: 'grovit_inv_purchase_items_v1',
  STOCK_LEDGER: 'grovit_inv_ledger_v1',
  ADJUSTMENTS: 'grovit_inv_adjustments_v1',
  WASTAGE: 'grovit_inv_wastage_v1',
  AUDIT_LOGS: 'grovit_inv_audit_logs_v1',
  ALERTS: 'grovit_inv_alerts_v1',
};

// Global switch to bypass remote calls once a database table does not exist
let forceLocalFallback = false;

function isLocalStorageAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function getLocalData<T>(key: string, defaultVal: T): T {
  if (!isLocalStorageAvailable()) return defaultVal;
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    saveLocalData(key, defaultVal);
    return defaultVal;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultVal;
  }
}

function saveLocalData<T>(key: string, data: T): void {
  if (isLocalStorageAvailable()) {
    window.localStorage.setItem(key, JSON.stringify(data));
  }
}

// ─── AUTOSEEDER ENGINE ──────────────────────────────────────────────────────────

export function initializeLocalSeeder(forceReset = false): void {
  if (!isLocalStorageAvailable()) return;

  const tenant = getTenantContext();

  // If already seeded and not forcing reset, skip
  if (!forceReset && window.localStorage.getItem(LOCAL_STORAGE_KEYS.CATEGORIES)) {
    return;
  }

  // 1. Categories
  const categories: InventoryCategory[] = [
    {
      id: 'cat-00000000-0000-0000-0000-000000000001',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      category_code: 'CAT01',
      category_name: 'Raw Meats',
      description: 'Raw non-veg restaurant ingredients',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'cat-00000000-0000-0000-0000-000000000002',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      category_code: 'CAT02',
      category_name: 'Oils & Spices',
      description: 'Condiments, oils, and general cooking materials',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'cat-00000000-0000-0000-0000-000000000003',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      category_code: 'CAT03',
      category_name: 'Pastes & Grains',
      description: 'Semolina, Tahini, Flours, Rice etc.',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 2. Units
  const units: InventoryUnit[] = [
    { id: 'unit-kg', tenant_id: tenant.tenant_id, branch_id: tenant.branch_id, unit_code: 'KG', unit_name: 'Kilograms', short_name: 'kg', is_active: true },
    { id: 'unit-l', tenant_id: tenant.tenant_id, branch_id: tenant.branch_id, unit_code: 'L', unit_name: 'Litres', short_name: 'l', is_active: true },
    { id: 'unit-pcs', tenant_id: tenant.tenant_id, branch_id: tenant.branch_id, unit_code: 'PCS', unit_name: 'Pieces', short_name: 'pcs', is_active: true },
  ];

  // 3. Suppliers
  const suppliers: InventorySupplier[] = [
    {
      id: 'sup-00000000-0000-0000-0000-000000000001',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      supplier_code: 'SUP01',
      supplier_name: 'Modern Foods Distributing',
      contact_person: 'Ramesh Kumar',
      phone: '+91 9845012345',
      alternate_phone: null,
      email: 'orders@modernfoods.com',
      gst_number: '29AAAAA1111A1Z1',
      address: '22, Industrial Suburb, Yeshwanthpur',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560022',
      payment_terms: 'Net 15',
      notes: 'Preferred vendor for chicken and dry flour goods',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'sup-00000000-0000-0000-0000-000000000002',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      supplier_code: 'SUP02',
      supplier_name: 'Le Jardin Farms',
      contact_person: 'Priya Mehta',
      phone: '+91 8876543210',
      alternate_phone: null,
      email: 'fresh@lejardinfarms.in',
      gst_number: '29BBBBB2222B2Z2',
      address: 'Farms Sector 4, Devanahalli',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '562110',
      payment_terms: 'Cash on Delivery',
      notes: 'Provides organic oils and premium spreads',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 4. Materials (Chicken Breast, Olive Oil, Tahini Paste)
  const materials: InventoryMaterial[] = [
    {
      id: 'mat-00000000-0000-0000-0000-000000000001',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_code: 'MAT01',
      material_name: 'Chicken Breast (Boneless)',
      category_id: 'cat-00000000-0000-0000-0000-000000000001',
      inventory_unit_id: 'unit-kg',
      opening_stock: 50.0,
      current_stock: 45.0,
      reorder_level: 25.0,
      average_cost: 280.0,
      last_purchase_price: 280.0,
      inventory_value: 12600.0,
      barcode: '8901234567890',
      hsn_code: '0207',
      preferred_supplier_id: 'sup-00000000-0000-0000-0000-000000000001',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'mat-00000000-0000-0000-0000-000000000002',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_code: 'MAT02',
      material_name: 'Extra Virgin Olive Oil',
      category_id: 'cat-00000000-0000-0000-0000-000000000002',
      inventory_unit_id: 'unit-l',
      opening_stock: 20.0,
      current_stock: 8.0, // Trigging Low Stock!
      reorder_level: 15.0,
      average_cost: 720.0,
      last_purchase_price: 750.0,
      inventory_value: 5760.0,
      barcode: '8909876543210',
      hsn_code: '1509',
      preferred_supplier_id: 'sup-00000000-0000-0000-0000-000000000002',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'mat-00000000-0000-0000-0000-000000000003',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_code: 'MAT03',
      material_name: ' Tahini Paste Premium',
      category_id: 'cat-00000000-0000-0000-0000-000000000003',
      inventory_unit_id: 'unit-kg',
      opening_stock: 10.0,
      current_stock: 6.5,
      reorder_level: 5.0,
      average_cost: 450.0,
      last_purchase_price: 450.0,
      inventory_value: 2925.0,
      barcode: '8905647382910',
      hsn_code: '2103',
      preferred_supplier_id: 'sup-00000000-0000-0000-0000-000000000002',
      is_active: true,
      deleted_at: null,
      deleted_by: null,
      created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 5. Stock Levels (Freezer & Dry Storage locations)
  const stockLevels: InventoryStockLevel[] = [
    {
      id: 'lvl-1',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000001',
      location_id: 'Freezer',
      current_stock: 45.0,
      reserved_stock: 0,
      available_stock: 45.0,
      updated_at: new Date().toISOString(),
    },
    {
      id: 'lvl-2',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000002',
      location_id: 'Dry Storage',
      current_stock: 8.0,
      reserved_stock: 0,
      available_stock: 8.0,
      updated_at: new Date().toISOString(),
    },
    {
      id: 'lvl-3',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000003',
      location_id: 'Dry Storage',
      current_stock: 6.5,
      reserved_stock: 0,
      available_stock: 6.5,
      updated_at: new Date().toISOString(),
    },
  ];

  // 6. Supplier pricing records
  const vendorPrices: InventoryVendorPrice[] = [
    {
      id: 'prc-1',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000001',
      supplier_id: 'sup-00000000-0000-0000-0000-000000000001',
      purchase_price: 280.0,
      effective_date: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'prc-2',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000002',
      supplier_id: 'sup-00000000-0000-0000-0000-000000000002',
      purchase_price: 720.0,
      effective_date: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'prc-3',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000003',
      supplier_id: 'sup-00000000-0000-0000-0000-000000000002',
      purchase_price: 450.0,
      effective_date: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 7. Purchase History (to calculate KPI Month-over-Month trend)
  // Let's create one purchase last month (May) and one this month (June)
  const purchases: InventoryPurchaseHeader[] = [
    {
      id: 'p-may',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      purchase_number: 'PO-2026-0001',
      purchase_date: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(), // Mid May
      supplier_id: 'sup-00000000-0000-0000-0000-000000000001',
      invoice_number: 'INV-7865',
      invoice_date: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
      payment_mode: 'UPI',
      subtotal: 14000.0,
      discount_amount: 500.0,
      tax_amount: 700.0,
      transport_charges: 200.0,
      other_charges: 0.0,
      grand_total: 14400.0,
      invoice_file_url: null,
      remarks: 'Seeded purchase for historical trend',
      status: 'Completed',
      created_by: 'Owner Staff',
      created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'p-june',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      purchase_number: 'PO-2026-0002',
      purchase_date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), // Early June
      supplier_id: 'sup-00000000-0000-0000-0000-000000000002',
      invoice_number: 'INV-1092',
      invoice_date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      payment_mode: 'Bank Transfer',
      subtotal: 8000.0,
      discount_amount: 0.0,
      tax_amount: 400.0,
      transport_charges: 150.0,
      other_charges: 0.0,
      grand_total: 8550.0,
      invoice_file_url: 'https://example.com/invoice.pdf',
      remarks: 'Current month invoice attached',
      status: 'Completed',
      created_by: 'Owner Staff',
      created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  const purchaseItems: InventoryPurchaseItem[] = [
    {
      id: 'pi-1',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      purchase_header_id: 'p-may',
      material_id: 'mat-00000000-0000-0000-0000-000000000001',
      quantity: 50.0,
      unit_price: 280.0,
      line_total: 14000.0,
      created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'pi-2',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      purchase_header_id: 'p-june',
      material_id: 'mat-00000000-0000-0000-0000-000000000002',
      quantity: 10.0,
      unit_price: 800.0,
      line_total: 8000.0,
      created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 8. Stock Ledger
  const ledger: InventoryStockLedger[] = [
    {
      id: 'ld-1',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000001',
      transaction_date: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      transaction_type: 'Opening Stock',
      reference_type: null,
      reference_id: null,
      qty_in: 50.0,
      qty_out: 0,
      balance_stock: 50.0,
      unit_cost: 280.0,
      total_value: 14000.0,
      remarks: 'Initial opening stock registration',
      created_by: 'Owner Staff',
      created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'ld-2',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000001',
      transaction_date: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
      transaction_type: 'Consumption',
      reference_type: 'Kitchen KOT',
      reference_id: null,
      qty_in: 0,
      qty_out: 5.0,
      balance_stock: 45.0,
      unit_cost: 280.0,
      total_value: 12600.0,
      remarks: 'Daily kitchen replenishment KOT deduction',
      created_by: 'System Kitchen',
      created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'ld-3',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000002',
      transaction_date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      transaction_type: 'Purchase',
      reference_type: 'Purchase Invoice',
      reference_id: 'p-june',
      qty_in: 10.0,
      qty_out: 0,
      balance_stock: 18.0,
      unit_cost: 800.0,
      total_value: 14400.0,
      remarks: 'Replenished stock from supplier',
      created_by: 'Owner Staff',
      created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 9. Wastage Register
  const wastage: InventoryWastage[] = [
    {
      id: 'w-1',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000002',
      quantity: 2.0,
      reason: 'Spoiled',
      cost_impact: 1440.0, // 2l * 720 avg_cost
      location_id: 'Dry Storage',
      recorded_by: 'Chef Amit',
      recorded_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 10. Audit Logs
  const auditLogs: InventoryAuditLog[] = [
    {
      id: 'aud-1',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      module_name: 'materials',
      record_id: 'mat-00000000-0000-0000-0000-000000000002',
      action_type: 'CREATE',
      old_value: null,
      new_value: { name: 'Olive Oil', code: 'MAT02' },
      performed_by: 'Owner Staff',
      created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    },
  ];

  // 11. Alerts
  const alerts: InventoryAlert[] = [
    {
      id: 'alrt-1',
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: 'mat-00000000-0000-0000-0000-000000000002',
      alert_type: 'Low Stock',
      message: 'Extra Virgin Olive Oil stock levels are below reorder thresholds (8.00 l left, reorder level is 15.00 l).',
      is_read: false,
      created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    },
  ];

  saveLocalData(LOCAL_STORAGE_KEYS.CATEGORIES, categories);
  saveLocalData(LOCAL_STORAGE_KEYS.UNITS, units);
  saveLocalData(LOCAL_STORAGE_KEYS.SUPPLIERS, suppliers);
  saveLocalData(LOCAL_STORAGE_KEYS.MATERIALS, materials);
  saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEVELS, stockLevels);
  saveLocalData(LOCAL_STORAGE_KEYS.VENDOR_PRICES, vendorPrices);
  saveLocalData(LOCAL_STORAGE_KEYS.PURCHASE_HEADERS, purchases);
  saveLocalData(LOCAL_STORAGE_KEYS.PURCHASE_ITEMS, purchaseItems);
  saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEDGER, ledger);
  saveLocalData(LOCAL_STORAGE_KEYS.WASTAGE, wastage);
  saveLocalData(LOCAL_STORAGE_KEYS.ADJUSTMENTS, [] as InventoryAdjustment[]);
  saveLocalData(LOCAL_STORAGE_KEYS.AUDIT_LOGS, auditLogs);
  saveLocalData(LOCAL_STORAGE_KEYS.ALERTS, alerts);
}

// ─── SERVICE IMPLEMENTATIONS ───────────────────────────────────────────────────

/**
 * Handle Supabase errors or missing tables automatically by falling back to LocalStorage
 */
async function handleQueryError(error: any, callerName: string): Promise<boolean> {
  if (error && (error.code === '42P01' || error.status === 404 || forceLocalFallback)) {
    if (!forceLocalFallback) {
      console.warn(`[InventoryService] ${callerName} failed with code ${error.code}. Tables do not exist. Falling back to local storage engine.`);
      forceLocalFallback = true;
      initializeLocalSeeder();
    }
    return true;
  }
  return false;
}

// ─── 1. CATEGORIES ───────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<ServiceResult<InventoryCategory[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('*')
        .eq('tenant_id', tenant_id)
        .is('deleted_at', null)
        .order('category_name', { ascending: true });

      if (error) {
        if (await handleQueryError(error, 'fetchCategories')) {
          return fetchCategoriesLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryCategory[], error: null };
    } else {
      return fetchCategoriesLocal(tenant_id);
    }
  } catch (err: any) {
    if (await handleQueryError(err, 'fetchCategories')) {
      const tenant = getTenantContext();
      return fetchCategoriesLocal(tenant.tenant_id);
    }
    return { data: null, error: err.message || 'Error occurred.' };
  }
}

function fetchCategoriesLocal(tenantId: string): ServiceResult<InventoryCategory[]> {
  const all = getLocalData<InventoryCategory[]>(LOCAL_STORAGE_KEYS.CATEGORIES, []);
  const active = all.filter(c => c.tenant_id === tenantId && !c.deleted_at);
  return { data: active, error: null };
}

export async function saveCategory(category: Partial<InventoryCategory>): Promise<ServiceResult<InventoryCategory>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const id = category.id || Math.random().toString(36).substr(2, 9);
    const code = category.category_code || `CAT${Math.floor(10 + Math.random() * 90)}`;
    const fullCategory = {
      tenant_id,
      branch_id,
      category_code: code,
      category_name: category.category_name || 'Unnamed Category',
      description: category.description || null,
      is_active: category.is_active !== false,
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    };

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_categories')
        .upsert({ id: category.id || undefined, ...fullCategory })
        .select('*')
        .single();

      if (error) {
        if (await handleQueryError(error, 'saveCategory')) {
          return saveCategoryLocal({ id, ...fullCategory });
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryCategory, error: null };
    } else {
      return saveCategoryLocal({ id, ...fullCategory });
    }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error saving category.' };
  }
}

function saveCategoryLocal(category: any): ServiceResult<InventoryCategory> {
  const all = getLocalData<InventoryCategory[]>(LOCAL_STORAGE_KEYS.CATEGORIES, []);
  const idx = all.findIndex(c => c.id === category.id);
  const now = new Date().toISOString();

  let finalObj: InventoryCategory;
  if (idx >= 0) {
    finalObj = { ...all[idx], ...category, updated_at: now };
    all[idx] = finalObj;
  } else {
    finalObj = { ...category, id: category.id, created_at: now, updated_at: now };
    all.push(finalObj);
  }

  saveLocalData(LOCAL_STORAGE_KEYS.CATEGORIES, all);
  recordAuditLogLocal('categories', finalObj.id, idx >= 0 ? 'UPDATE' : 'CREATE', idx >= 0 ? all[idx] : null, finalObj);
  return { data: finalObj, error: null };
}

export async function deleteCategory(id: string): Promise<ServiceResult<boolean>> {
  try {
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_categories')
        .update({ deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' })
        .eq('id', id);

      if (error) {
        if (await handleQueryError(error, 'deleteCategory')) {
          return deleteCategoryLocal(id);
        }
        return { data: false, error: error.message };
      }
      return { data: true, error: null };
    } else {
      return deleteCategoryLocal(id);
    }
  } catch (err: any) {
    return { data: false, error: err.message || 'Error deleting category.' };
  }
}

function deleteCategoryLocal(id: string): ServiceResult<boolean> {
  const all = getLocalData<InventoryCategory[]>(LOCAL_STORAGE_KEYS.CATEGORIES, []);
  const idx = all.findIndex(c => c.id === id);
  if (idx >= 0) {
    const old = all[idx];
    all[idx] = { ...old, deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' };
    saveLocalData(LOCAL_STORAGE_KEYS.CATEGORIES, all);
    recordAuditLogLocal('categories', id, 'DELETE', old, all[idx]);
    return { data: true, error: null };
  }
  return { data: false, error: 'Category not found.' };
}


// ─── 2. UNITS ────────────────────────────────────────────────────────────────

export async function fetchUnits(): Promise<ServiceResult<InventoryUnit[]>> {
  try {
    const { tenant_id } = getTenantContext();

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_units')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('is_active', true);

      if (error) {
        if (await handleQueryError(error, 'fetchUnits')) {
          return fetchUnitsLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryUnit[], error: null };
    } else {
      return fetchUnitsLocal(tenant_id);
    }
  } catch (err: any) {
    if (await handleQueryError(err, 'fetchUnits')) {
      const tenant = getTenantContext();
      return fetchUnitsLocal(tenant.tenant_id);
    }
    return { data: null, error: err.message || 'Error occurred.' };
  }
}

function fetchUnitsLocal(tenantId: string): ServiceResult<InventoryUnit[]> {
  const all = getLocalData<InventoryUnit[]>(LOCAL_STORAGE_KEYS.UNITS, []);
  const active = all.filter(u => u.tenant_id === tenantId && u.is_active);
  return { data: active, error: null };
}

export async function saveUnit(unit: Partial<InventoryUnit>): Promise<ServiceResult<InventoryUnit>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const id = unit.id || Math.random().toString(36).substr(2, 9);
    const code = unit.unit_code || `UN${Math.floor(10 + Math.random() * 90)}`;
    const fullUnit = {
      tenant_id,
      branch_id,
      unit_code: code,
      unit_name: unit.unit_name || 'Unnamed Unit',
      short_name: unit.short_name || code.toLowerCase(),
      is_active: unit.is_active !== false,
      updated_at: new Date().toISOString(),
    };

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_units')
        .upsert({ id: unit.id || undefined, ...fullUnit })
        .select('*')
        .single();

      if (error) {
        if (await handleQueryError(error, 'saveUnit')) {
          return saveUnitLocal({ id, ...fullUnit });
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryUnit, error: null };
    } else {
      return saveUnitLocal({ id, ...fullUnit });
    }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error saving unit.' };
  }
}

function saveUnitLocal(unit: any): ServiceResult<InventoryUnit> {
  const all = getLocalData<InventoryUnit[]>(LOCAL_STORAGE_KEYS.UNITS, []);
  const idx = all.findIndex(u => u.id === unit.id);
  const now = new Date().toISOString();

  let finalObj: InventoryUnit;
  if (idx >= 0) {
    finalObj = { ...all[idx], ...unit, updated_at: now };
    all[idx] = finalObj;
  } else {
    finalObj = { ...unit, id: unit.id, created_at: now, updated_at: now };
    all.push(finalObj);
  }

  saveLocalData(LOCAL_STORAGE_KEYS.UNITS, all);
  recordAuditLogLocal('units', finalObj.id, idx >= 0 ? 'UPDATE' : 'CREATE', idx >= 0 ? all[idx] : null, finalObj);
  return { data: finalObj, error: null };
}

export async function deleteUnit(id: string): Promise<ServiceResult<boolean>> {
  try {
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_units')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        if (await handleQueryError(error, 'deleteUnit')) {
          return deleteUnitLocal(id);
        }
        return { data: false, error: error.message };
      }
      return { data: true, error: null };
    } else {
      return deleteUnitLocal(id);
    }
  } catch (err: any) {
    return { data: false, error: err.message || 'Error deleting unit.' };
  }
}

function deleteUnitLocal(id: string): ServiceResult<boolean> {
  const all = getLocalData<InventoryUnit[]>(LOCAL_STORAGE_KEYS.UNITS, []);
  const idx = all.findIndex(u => u.id === id);
  if (idx >= 0) {
    const old = all[idx];
    all[idx] = { ...old, is_active: false };
    saveLocalData(LOCAL_STORAGE_KEYS.UNITS, all);
    recordAuditLogLocal('units', id, 'DELETE', old, all[idx]);
    return { data: true, error: null };
  }
  return { data: false, error: 'Unit not found.' };
}


// ─── 3. SUPPLIERS ────────────────────────────────────────────────────────────

export async function fetchSuppliers(): Promise<ServiceResult<InventorySupplier[]>> {
  try {
    const { tenant_id } = getTenantContext();

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_suppliers')
        .select('*')
        .eq('tenant_id', tenant_id)
        .is('deleted_at', null)
        .order('supplier_name', { ascending: true });

      if (error) {
        if (await handleQueryError(error, 'fetchSuppliers')) {
          return fetchSuppliersLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventorySupplier[], error: null };
    } else {
      return fetchSuppliersLocal(tenant_id);
    }
  } catch (err: any) {
    if (await handleQueryError(err, 'fetchSuppliers')) {
      const tenant = getTenantContext();
      return fetchSuppliersLocal(tenant.tenant_id);
    }
    return { data: null, error: err.message || 'Error occurred.' };
  }
}

function fetchSuppliersLocal(tenantId: string): ServiceResult<InventorySupplier[]> {
  const all = getLocalData<InventorySupplier[]>(LOCAL_STORAGE_KEYS.SUPPLIERS, []);
  const active = all.filter(s => s.tenant_id === tenantId && !s.deleted_at);
  return { data: active, error: null };
}

export async function saveSupplier(supplier: Partial<InventorySupplier>): Promise<ServiceResult<InventorySupplier>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const id = supplier.id || Math.random().toString(36).substr(2, 9);
    const code = supplier.supplier_code || `SUP${Math.floor(10 + Math.random() * 90)}`;
    const fullSupplier = {
      tenant_id,
      branch_id,
      supplier_code: code,
      supplier_name: supplier.supplier_name || 'Unnamed Supplier',
      contact_person: supplier.contact_person || null,
      phone: supplier.phone || '',
      alternate_phone: supplier.alternate_phone || null,
      email: supplier.email || null,
      gst_number: supplier.gst_number || null,
      address: supplier.address || null,
      city: supplier.city || null,
      state: supplier.state || null,
      pincode: supplier.pincode || null,
      payment_terms: supplier.payment_terms || 'Net 15',
      notes: supplier.notes || null,
      is_active: supplier.is_active !== false,
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    };

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_suppliers')
        .upsert({ id: supplier.id || undefined, ...fullSupplier })
        .select('*')
        .single();

      if (error) {
        if (await handleQueryError(error, 'saveSupplier')) {
          return saveSupplierLocal({ id, ...fullSupplier });
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventorySupplier, error: null };
    } else {
      return saveSupplierLocal({ id, ...fullSupplier });
    }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error saving supplier.' };
  }
}

function saveSupplierLocal(supplier: any): ServiceResult<InventorySupplier> {
  const all = getLocalData<InventorySupplier[]>(LOCAL_STORAGE_KEYS.SUPPLIERS, []);
  const idx = all.findIndex(s => s.id === supplier.id);
  const now = new Date().toISOString();

  let finalObj: InventorySupplier;
  if (idx >= 0) {
    finalObj = { ...all[idx], ...supplier, updated_at: now };
    all[idx] = finalObj;
  } else {
    finalObj = { ...supplier, id: supplier.id, created_at: now, updated_at: now };
    all.push(finalObj);
  }

  saveLocalData(LOCAL_STORAGE_KEYS.SUPPLIERS, all);
  recordAuditLogLocal('suppliers', finalObj.id, idx >= 0 ? 'UPDATE' : 'CREATE', idx >= 0 ? all[idx] : null, finalObj);
  return { data: finalObj, error: null };
}

export async function deleteSupplier(id: string): Promise<ServiceResult<boolean>> {
  try {
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_suppliers')
        .update({ deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' })
        .eq('id', id);

      if (error) {
        if (await handleQueryError(error, 'deleteSupplier')) {
          return deleteSupplierLocal(id);
        }
        return { data: false, error: error.message };
      }
      return { data: true, error: null };
    } else {
      return deleteSupplierLocal(id);
    }
  } catch (err: any) {
    return { data: false, error: err.message || 'Error deleting supplier.' };
  }
}

function deleteSupplierLocal(id: string): ServiceResult<boolean> {
  const all = getLocalData<InventorySupplier[]>(LOCAL_STORAGE_KEYS.SUPPLIERS, []);
  const idx = all.findIndex(s => s.id === id);
  if (idx >= 0) {
    const old = all[idx];
    all[idx] = { ...old, deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' };
    saveLocalData(LOCAL_STORAGE_KEYS.SUPPLIERS, all);
    recordAuditLogLocal('suppliers', id, 'DELETE', old, all[idx]);
    return { data: true, error: null };
  }
  return { data: false, error: 'Supplier not found.' };
}


// ─── 4. MATERIALS ────────────────────────────────────────────────────────────

export async function fetchMaterials(): Promise<ServiceResult<InventoryMaterial[]>> {
  try {
    const { tenant_id } = getTenantContext();

    if (!forceLocalFallback) {
      // Direct raw query join logic
      const { data, error } = await supabase
        .from('inventory_materials')
        .select(`
          *,
          category:inventory_categories(category_name),
          unit:inventory_units(short_name)
        `)
        .eq('tenant_id', tenant_id)
        .is('deleted_at', null)
        .order('material_name', { ascending: true });

      if (error) {
        if (await handleQueryError(error, 'fetchMaterials')) {
          return fetchMaterialsLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }

      // Flat mapping data joins
      const formatted = (data || []).map((m: any) => ({
        ...m,
        category_name: m.category?.category_name || 'Uncategorized',
        unit_short_name: m.unit?.short_name || 'units',
      }));

      return { data: formatted as InventoryMaterial[], error: null };
    } else {
      return fetchMaterialsLocal(tenant_id);
    }
  } catch (err: any) {
    if (await handleQueryError(err, 'fetchMaterials')) {
      const tenant = getTenantContext();
      return fetchMaterialsLocal(tenant.tenant_id);
    }
    return { data: null, error: err.message || 'Error occurred.' };
  }
}

function fetchMaterialsLocal(tenantId: string): ServiceResult<InventoryMaterial[]> {
  const all = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  const categories = getLocalData<InventoryCategory[]>(LOCAL_STORAGE_KEYS.CATEGORIES, []);
  const units = getLocalData<InventoryUnit[]>(LOCAL_STORAGE_KEYS.UNITS, []);

  const active = all.filter(m => m.tenant_id === tenantId && !m.deleted_at);

  const formatted = active.map(m => {
    const cat = categories.find(c => c.id === m.category_id);
    const unt = units.find(u => u.id === m.inventory_unit_id);
    return {
      ...m,
      category_name: cat ? cat.category_name : 'Uncategorized',
      unit_short_name: unt ? unt.short_name : 'units',
    };
  });

  return { data: formatted, error: null };
}

export async function saveMaterial(material: Partial<InventoryMaterial>): Promise<ServiceResult<InventoryMaterial>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const id = material.id || Math.random().toString(36).substr(2, 9);
    const code = material.material_code || `MAT${Math.floor(10 + Math.random() * 90)}`;
    
    const openingStock = Number(material.opening_stock) || 0;
    const currentStock = material.id ? (Number(material.current_stock) || 0) : openingStock;
    const reorderLevel = Number(material.reorder_level) || 0;
    const averageCost = Number(material.average_cost) || 0;
    const lastPurchasePrice = Number(material.last_purchase_price) || averageCost;
    
    const fullMaterial = {
      tenant_id,
      branch_id,
      material_code: code,
      material_name: material.material_name || 'Unnamed Material',
      category_id: material.category_id || null,
      inventory_unit_id: material.inventory_unit_id || null,
      opening_stock: openingStock,
      current_stock: currentStock,
      reorder_level: reorderLevel,
      average_cost: averageCost,
      last_purchase_price: lastPurchasePrice,
      inventory_value: currentStock * averageCost,
      barcode: material.barcode || null,
      hsn_code: material.hsn_code || null,
      preferred_supplier_id: material.preferred_supplier_id || null,
      is_active: material.is_active !== false,
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    };

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_materials')
        .upsert({ id: material.id || undefined, ...fullMaterial })
        .select('*')
        .single();

      if (error) {
        if (await handleQueryError(error, 'saveMaterial')) {
          return saveMaterialLocal({ id, ...fullMaterial });
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryMaterial, error: null };
    } else {
      return saveMaterialLocal({ id, ...fullMaterial });
    }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error saving material.' };
  }
}

function saveMaterialLocal(material: any): ServiceResult<InventoryMaterial> {
  const all = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  const idx = all.findIndex(m => m.id === material.id);
  const now = new Date().toISOString();

  let finalObj: InventoryMaterial;
  if (idx >= 0) {
    finalObj = { 
      ...all[idx], 
      ...material, 
      inventory_value: (material.current_stock ?? all[idx].current_stock) * (material.average_cost ?? all[idx].average_cost),
      updated_at: now 
    };
    all[idx] = finalObj;
  } else {
    finalObj = { ...material, id: material.id, created_at: now, updated_at: now };
    all.push(finalObj);
    
    // Auto seed an initial stock level inside Dry Storage for a brand new item
    const stockLevels = getLocalData<InventoryStockLevel[]>(LOCAL_STORAGE_KEYS.STOCK_LEVELS, []);
    stockLevels.push({
      id: `lvl-${Math.random().toString(36).substr(2, 9)}`,
      tenant_id: material.tenant_id,
      branch_id: material.branch_id,
      material_id: finalObj.id,
      location_id: 'Dry Storage',
      current_stock: finalObj.current_stock,
      reserved_stock: 0,
      available_stock: finalObj.current_stock,
      updated_at: now,
    });
    saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEVELS, stockLevels);
  }

  saveLocalData(LOCAL_STORAGE_KEYS.MATERIALS, all);
  recordAuditLogLocal('materials', finalObj.id, idx >= 0 ? 'UPDATE' : 'CREATE', idx >= 0 ? all[idx] : null, finalObj);
  
  // Re-check low stock rules
  evaluateStockAlertsLocal(finalObj.id);

  return { data: finalObj, error: null };
}

export async function deleteMaterial(id: string): Promise<ServiceResult<boolean>> {
  try {
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_materials')
        .update({ deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' })
        .eq('id', id);

      if (error) {
        if (await handleQueryError(error, 'deleteMaterial')) {
          return deleteMaterialLocal(id);
        }
        return { data: false, error: error.message };
      }
      return { data: true, error: null };
    } else {
      return deleteMaterialLocal(id);
    }
  } catch (err: any) {
    return { data: false, error: err.message || 'Error deleting material.' };
  }
}

function deleteMaterialLocal(id: string): ServiceResult<boolean> {
  const all = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  const idx = all.findIndex(m => m.id === id);
  if (idx >= 0) {
    const old = all[idx];
    all[idx] = { ...old, deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' };
    saveLocalData(LOCAL_STORAGE_KEYS.MATERIALS, all);
    recordAuditLogLocal('materials', id, 'DELETE', old, all[idx]);
    return { data: true, error: null };
  }
  return { data: false, error: 'Material not found.' };
}


// ─── 5. STOCK LEVELS (LOCATION-WISE) ──────────────────────────────────────────

export async function fetchStockLevels(materialId?: string): Promise<ServiceResult<InventoryStockLevel[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      let query = supabase.from('inventory_material_stock_levels').select('*').eq('tenant_id', tenant_id);
      if (materialId) query = query.eq('material_id', materialId);
      
      const { data, error } = await query;
      if (error) {
        if (await handleQueryError(error, 'fetchStockLevels')) {
          return fetchStockLevelsLocal(materialId);
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryStockLevel[], error: null };
    } else {
      return fetchStockLevelsLocal(materialId);
    }
  } catch (err: any) {
    return fetchStockLevelsLocal(materialId);
  }
}

function fetchStockLevelsLocal(materialId?: string): ServiceResult<InventoryStockLevel[]> {
  const tenant = getTenantContext();
  const all = getLocalData<InventoryStockLevel[]>(LOCAL_STORAGE_KEYS.STOCK_LEVELS, []);
  let filtered = all.filter(lvl => lvl.tenant_id === tenant.tenant_id);
  if (materialId) {
    filtered = filtered.filter(lvl => lvl.material_id === materialId);
  }
  return { data: filtered, error: null };
}


// ─── 6. VENDOR PRICES ────────────────────────────────────────────────────────

export async function fetchVendorPrices(materialId?: string): Promise<ServiceResult<InventoryVendorPrice[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      let query = supabase.from('inventory_material_vendor_prices').select('*').eq('tenant_id', tenant_id);
      if (materialId) query = query.eq('material_id', materialId);
      
      const { data, error } = await query;
      if (error) {
        if (await handleQueryError(error, 'fetchVendorPrices')) {
          return fetchVendorPricesLocal(materialId);
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryVendorPrice[], error: null };
    } else {
      return fetchVendorPricesLocal(materialId);
    }
  } catch (err: any) {
    return fetchVendorPricesLocal(materialId);
  }
}

function fetchVendorPricesLocal(materialId?: string): ServiceResult<InventoryVendorPrice[]> {
  const tenant = getTenantContext();
  const all = getLocalData<InventoryVendorPrice[]>(LOCAL_STORAGE_KEYS.VENDOR_PRICES, []);
  let filtered = all.filter(p => p.tenant_id === tenant.tenant_id);
  if (materialId) {
    filtered = filtered.filter(p => p.material_id === materialId);
  }
  return { data: filtered, error: null };
}


// ─── 7. PURCHASES ────────────────────────────────────────────────────────────

export async function fetchPurchases(): Promise<ServiceResult<InventoryPurchaseHeader[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_purchase_headers')
        .select(`
          *,
          supplier:inventory_suppliers(supplier_name)
        `)
        .eq('tenant_id', tenant_id)
        .order('purchase_date', { ascending: false });

      if (error) {
        if (await handleQueryError(error, 'fetchPurchases')) {
          return fetchPurchasesLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }

      const formatted = (data || []).map((p: any) => ({
        ...p,
        supplier_name: p.supplier?.supplier_name || 'Unknown Supplier',
      }));

      return { data: formatted as InventoryPurchaseHeader[], error: null };
    } else {
      return fetchPurchasesLocal(tenant_id);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    return fetchPurchasesLocal(tenant.tenant_id);
  }
}

function fetchPurchasesLocal(tenantId: string): ServiceResult<InventoryPurchaseHeader[]> {
  const all = getLocalData<InventoryPurchaseHeader[]>(LOCAL_STORAGE_KEYS.PURCHASE_HEADERS, []);
  const suppliers = getLocalData<InventorySupplier[]>(LOCAL_STORAGE_KEYS.SUPPLIERS, []);
  
  const filtered = all.filter(p => p.tenant_id === tenantId);
  
  const formatted = filtered.map(p => {
    const sup = suppliers.find(s => s.id === p.supplier_id);
    return {
      ...p,
      supplier_name: sup ? sup.supplier_name : 'Unknown Supplier',
    };
  });

  return { data: formatted, error: null };
}

export async function fetchPurchaseItems(purchaseId: string): Promise<ServiceResult<InventoryPurchaseItem[]>> {
  try {
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_purchase_items')
        .select(`
          *,
          material:inventory_materials(material_name)
        `)
        .eq('purchase_header_id', purchaseId);

      if (error) {
        if (await handleQueryError(error, 'fetchPurchaseItems')) {
          return fetchPurchaseItemsLocal(purchaseId);
        }
        return { data: null, error: error.message };
      }

      const formatted = (data || []).map((i: any) => ({
        ...i,
        material_name: i.material?.material_name || 'Unknown Material',
      }));

      return { data: formatted as InventoryPurchaseItem[], error: null };
    } else {
      return fetchPurchaseItemsLocal(purchaseId);
    }
  } catch (err: any) {
    return fetchPurchaseItemsLocal(purchaseId);
  }
}

function fetchPurchaseItemsLocal(purchaseId: string): ServiceResult<InventoryPurchaseItem[]> {
  const all = getLocalData<InventoryPurchaseItem[]>(LOCAL_STORAGE_KEYS.PURCHASE_ITEMS, []);
  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  
  const filtered = all.filter(i => i.purchase_header_id === purchaseId);
  const formatted = filtered.map(i => {
    const mat = materials.find(m => m.id === i.material_id);
    return {
      ...i,
      material_name: mat ? mat.material_name : 'Unknown Material',
    };
  });

  return { data: formatted, error: null };
}

/**
 * Creates a purchase and automates cost averaging, ledger logs, pricing history logs, location stock splits, and audit logs.
 */
export async function createPurchase(
  header: Omit<InventoryPurchaseHeader, 'id' | 'tenant_id' | 'branch_id' | 'purchase_number' | 'created_at' | 'status'>,
  items: Omit<InventoryPurchaseItem, 'id' | 'tenant_id' | 'branch_id' | 'purchase_header_id' | 'created_at'>[],
  location_id = 'Dry Storage'
): Promise<ServiceResult<InventoryPurchaseHeader>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const purchaseId = `p-${Math.random().toString(36).substr(2, 9)}`;
    const purchaseNum = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const fullHeader: InventoryPurchaseHeader = {
      ...header,
      id: purchaseId,
      tenant_id,
      branch_id,
      purchase_number: purchaseNum,
      status: 'Completed',
      created_at: new Date().toISOString(),
    };

    if (!forceLocalFallback) {
      // For real Supabase, execution usually occurs inside a database transaction RPC.
      // Since writing complex transaction RPC handlers in a dual-fallback mode is prone to remote permission errors,
      // we will perform atomic upsert actions and trigger the localStorage logic if they fail.
      
      const { data, error } = await supabase
        .from('inventory_purchase_headers')
        .insert(fullHeader)
        .select('*')
        .single();

      if (error) {
        if (await handleQueryError(error, 'createPurchase')) {
          return createPurchaseLocal(fullHeader, items, location_id);
        }
        return { data: null, error: error.message };
      }

      // Bulk save purchase items
      const finalItems = items.map(itm => ({
        ...itm,
        id: `pi-${Math.random().toString(36).substr(2, 9)}`,
        tenant_id,
        branch_id,
        purchase_header_id: data.id,
        created_at: new Date().toISOString(),
      }));

      await supabase.from('inventory_purchase_items').insert(finalItems);
      
      // Update individual material stocks + cost averages
      for (const itm of items) {
        // Average Cost Formula: ((Current Stock * Avg Cost) + (Qty * Cost)) / (Current Stock + Qty)
        const { data: matData } = await supabase.from('inventory_materials').select('*').eq('id', itm.material_id).single();
        if (matData) {
          const currentStock = Number(matData.current_stock) || 0;
          const currentAvgCost = Number(matData.average_cost) || 0;
          const purchasedQty = Number(itm.quantity) || 0;
          const unitPrice = Number(itm.unit_price) || 0;

          const totalStock = currentStock + purchasedQty;
          const nextAvgCost = totalStock > 0 
            ? ((currentStock * currentAvgCost) + (purchasedQty * unitPrice)) / totalStock
            : unitPrice;

          // Update material
          await supabase.from('inventory_materials').update({
            current_stock: totalStock,
            average_cost: nextAvgCost,
            last_purchase_price: unitPrice,
            inventory_value: totalStock * nextAvgCost,
            updated_at: new Date().toISOString()
          }).eq('id', itm.material_id);

          // Update location stock level
          const { data: stockLvl } = await supabase
            .from('inventory_material_stock_levels')
            .select('*')
            .eq('material_id', itm.material_id)
            .eq('location_id', location_id)
            .single();

          if (stockLvl) {
            await supabase.from('inventory_material_stock_levels').update({
              current_stock: Number(stockLvl.current_stock) + purchasedQty,
              available_stock: Number(stockLvl.available_stock) + purchasedQty,
              updated_at: new Date().toISOString()
            }).eq('id', stockLvl.id);
          } else {
            await supabase.from('inventory_material_stock_levels').insert({
              tenant_id,
              branch_id,
              material_id: itm.material_id,
              location_id,
              current_stock: purchasedQty,
              available_stock: purchasedQty,
              reserved_stock: 0,
            });
          }

          // Log vendor price history
          await supabase.from('inventory_material_vendor_prices').insert({
            tenant_id,
            branch_id,
            material_id: itm.material_id,
            supplier_id: header.supplier_id,
            purchase_price: unitPrice,
            effective_date: new Date().toISOString(),
          });

          // Stock ledger
          await supabase.from('inventory_stock_ledger').insert({
            tenant_id,
            branch_id,
            material_id: itm.material_id,
            transaction_date: new Date().toISOString(),
            transaction_type: 'Purchase',
            reference_type: 'Purchase Invoice',
            reference_id: data.id,
            qty_in: purchasedQty,
            qty_out: 0,
            balance_stock: totalStock,
            unit_cost: unitPrice,
            total_value: purchasedQty * unitPrice,
            remarks: `Purchased from supplier via PO ${purchaseNum}`,
            created_by: header.created_by,
          });
        }
      }

      return { data: data as InventoryPurchaseHeader, error: null };
    } else {
      return createPurchaseLocal(fullHeader, items, location_id);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    const mockId = `p-${Math.random().toString(36).substr(2, 9)}`;
    const mockHeader: InventoryPurchaseHeader = {
      ...header,
      id: mockId,
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      purchase_number: `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'Completed',
      created_at: new Date().toISOString(),
    };
    return createPurchaseLocal(mockHeader, items, location_id);
  }
}

function createPurchaseLocal(
  headerObj: InventoryPurchaseHeader,
  items: Omit<InventoryPurchaseItem, 'id' | 'tenant_id' | 'branch_id' | 'purchase_header_id' | 'created_at'>[],
  location_id: string
): ServiceResult<InventoryPurchaseHeader> {
  const now = new Date().toISOString();
  
  // 1. Add Purchase Header
  const purchases = getLocalData<InventoryPurchaseHeader[]>(LOCAL_STORAGE_KEYS.PURCHASE_HEADERS, []);
  purchases.push(headerObj);
  saveLocalData(LOCAL_STORAGE_KEYS.PURCHASE_HEADERS, purchases);

  // 2. Add Purchase Items
  const purchaseItems = getLocalData<InventoryPurchaseItem[]>(LOCAL_STORAGE_KEYS.PURCHASE_ITEMS, []);
  const ledger = getLocalData<InventoryStockLedger[]>(LOCAL_STORAGE_KEYS.STOCK_LEDGER, []);
  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  const stockLevels = getLocalData<InventoryStockLevel[]>(LOCAL_STORAGE_KEYS.STOCK_LEVELS, []);
  const vendorPrices = getLocalData<InventoryVendorPrice[]>(LOCAL_STORAGE_KEYS.VENDOR_PRICES, []);

  for (const itm of items) {
    const itemId = `pi-${Math.random().toString(36).substr(2, 9)}`;
    const fullItem: InventoryPurchaseItem = {
      ...itm,
      id: itemId,
      tenant_id: headerObj.tenant_id,
      branch_id: headerObj.branch_id,
      purchase_header_id: headerObj.id,
      created_at: now,
    };
    purchaseItems.push(fullItem);

    // 3. Automate Stock Increments & Price Averaging
    const matIdx = materials.findIndex(m => m.id === itm.material_id);
    if (matIdx >= 0) {
      const mat = materials[matIdx];
      const currentStock = Number(mat.current_stock) || 0;
      const currentAvgCost = Number(mat.average_cost) || 0;
      const purchasedQty = Number(itm.quantity) || 0;
      const purchaseCost = Number(itm.unit_price) || 0;

      const totalStock = currentStock + purchasedQty;
      // Weighted average calculation formula
      const finalAverageCost = totalStock > 0 
        ? ((currentStock * currentAvgCost) + (purchasedQty * purchaseCost)) / totalStock
        : purchaseCost;

      materials[matIdx] = {
        ...mat,
        current_stock: totalStock,
        average_cost: finalAverageCost,
        last_purchase_price: purchaseCost,
        inventory_value: totalStock * finalAverageCost,
        updated_at: now,
      };

      // 4. Update Location Stock level
      const lvlIdx = stockLevels.findIndex(lvl => lvl.material_id === itm.material_id && lvl.location_id === location_id);
      if (lvlIdx >= 0) {
        const currentLvl = stockLevels[lvlIdx];
        stockLevels[lvlIdx] = {
          ...currentLvl,
          current_stock: Number(currentLvl.current_stock) + purchasedQty,
          available_stock: Number(currentLvl.available_stock) + purchasedQty,
          updated_at: now,
        };
      } else {
        stockLevels.push({
          id: `lvl-${Math.random().toString(36).substr(2, 9)}`,
          tenant_id: headerObj.tenant_id,
          branch_id: headerObj.branch_id,
          material_id: itm.material_id,
          location_id: location_id,
          current_stock: purchasedQty,
          reserved_stock: 0,
          available_stock: purchasedQty,
          updated_at: now,
        });
      }

      // 5. Append Supplier Price History
      vendorPrices.push({
        id: `prc-${Math.random().toString(36).substr(2, 9)}`,
        tenant_id: headerObj.tenant_id,
        branch_id: headerObj.branch_id,
        material_id: itm.material_id,
        supplier_id: headerObj.supplier_id,
        purchase_price: purchaseCost,
        effective_date: now,
        created_at: now,
      });

      // 6. Log transaction inside stock movement ledger
      ledger.push({
        id: `ld-${Math.random().toString(36).substr(2, 9)}`,
        tenant_id: headerObj.tenant_id,
        branch_id: headerObj.branch_id,
        material_id: itm.material_id,
        transaction_date: now,
        transaction_type: 'Purchase',
        reference_type: 'Purchase Invoice',
        reference_id: headerObj.id,
        qty_in: purchasedQty,
        qty_out: 0,
        balance_stock: totalStock,
        unit_cost: purchaseCost,
        total_value: purchasedQty * purchaseCost,
        remarks: `Recorded invoice purchase via PO ${headerObj.purchase_number}`,
        created_by: headerObj.created_by,
        created_at: now,
      });
      
      evaluateStockAlertsLocal(itm.material_id);
    }
  }

  saveLocalData(LOCAL_STORAGE_KEYS.PURCHASE_ITEMS, purchaseItems);
  saveLocalData(LOCAL_STORAGE_KEYS.MATERIALS, materials);
  saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEVELS, stockLevels);
  saveLocalData(LOCAL_STORAGE_KEYS.VENDOR_PRICES, vendorPrices);
  saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEDGER, ledger);

  recordAuditLogLocal('purchases', headerObj.id, 'CREATE', null, headerObj);

  return { data: headerObj, error: null };
}


// ─── 8. STOCK MOVEMENT LEDGER ──────────────────────────────────────────────────

export async function fetchStockLedger(materialId?: string): Promise<ServiceResult<InventoryStockLedger[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      let query = supabase
        .from('inventory_stock_ledger')
        .select(`
          *,
          material:inventory_materials(material_name)
        `)
        .eq('tenant_id', tenant_id)
        .order('transaction_date', { ascending: false });

      if (materialId) query = query.eq('material_id', materialId);

      const { data, error } = await query;
      if (error) {
        if (await handleQueryError(error, 'fetchStockLedger')) {
          return fetchStockLedgerLocal(materialId);
        }
        return { data: null, error: error.message };
      }

      const formatted = (data || []).map((l: any) => ({
        ...l,
        material_name: l.material?.material_name || 'Unknown Material',
      }));

      return { data: formatted as InventoryStockLedger[], error: null };
    } else {
      return fetchStockLedgerLocal(materialId);
    }
  } catch (err: any) {
    return fetchStockLedgerLocal(materialId);
  }
}

function fetchStockLedgerLocal(materialId?: string): ServiceResult<InventoryStockLedger[]> {
  const tenant = getTenantContext();
  const ledger = getLocalData<InventoryStockLedger[]>(LOCAL_STORAGE_KEYS.STOCK_LEDGER, []);
  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);

  let filtered = ledger.filter(l => l.tenant_id === tenant.tenant_id);
  if (materialId) {
    filtered = filtered.filter(l => l.material_id === materialId);
  }

  const formatted = filtered.map(l => {
    const mat = materials.find(m => m.id === l.material_id);
    return {
      ...l,
      material_name: mat ? mat.material_name : 'Unknown Material',
    };
  }).sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

  return { data: formatted, error: null };
}


// ─── 9. ADJUSTMENTS & WASTAGE REGISTER ─────────────────────────────────────────

export async function fetchAdjustments(): Promise<ServiceResult<InventoryAdjustment[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_adjustments')
        .select(`
          *,
          material:inventory_materials(material_name)
        `)
        .eq('tenant_id', tenant_id)
        .order('adjustment_date', { ascending: false });

      if (error) {
        if (await handleQueryError(error, 'fetchAdjustments')) {
          return fetchAdjustmentsLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }

      const formatted = (data || []).map((a: any) => ({
        ...a,
        material_name: a.material?.material_name || 'Unknown Material',
      }));

      return { data: formatted as InventoryAdjustment[], error: null };
    } else {
      return fetchAdjustmentsLocal(tenant_id);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    return fetchAdjustmentsLocal(tenant.tenant_id);
  }
}

function fetchAdjustmentsLocal(tenantId: string): ServiceResult<InventoryAdjustment[]> {
  const all = getLocalData<InventoryAdjustment[]>(LOCAL_STORAGE_KEYS.ADJUSTMENTS, []);
  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  
  const filtered = all.filter(a => a.tenant_id === tenantId);
  const formatted = filtered.map(a => {
    const mat = materials.find(m => m.id === a.material_id);
    return {
      ...a,
      material_name: mat ? mat.material_name : 'Unknown Material',
    };
  }).sort((a, b) => new Date(b.adjustment_date).getTime() - new Date(a.adjustment_date).getTime());

  return { data: formatted, error: null };
}

export async function createAdjustment(
  adjustment: Omit<InventoryAdjustment, 'id' | 'tenant_id' | 'branch_id' | 'created_at'>
): Promise<ServiceResult<InventoryAdjustment>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const id = `adj-${Math.random().toString(36).substr(2, 9)}`;
    const fullAdjustment: InventoryAdjustment = {
      ...adjustment,
      id,
      tenant_id,
      branch_id,
      created_at: new Date().toISOString(),
    };

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_adjustments')
        .insert(fullAdjustment)
        .select('*')
        .single();

      if (error) {
        if (await handleQueryError(error, 'createAdjustment')) {
          return createAdjustmentLocal(fullAdjustment);
        }
        return { data: null, error: error.message };
      }

      // Update material stock level + ledger log
      const { data: mat } = await supabase.from('inventory_materials').select('*').eq('id', adjustment.material_id).single();
      if (mat) {
        const qtyAdj = Number(adjustment.quantity) || 0;
        const currentTotal = Number(mat.current_stock) || 0;
        const isDeduct = adjustment.adjustment_type === 'Deduct';
        const newTotal = isDeduct ? (currentTotal - qtyAdj) : (currentTotal + qtyAdj);

        await supabase.from('inventory_materials').update({
          current_stock: newTotal,
          inventory_value: newTotal * Number(mat.average_cost),
          updated_at: new Date().toISOString()
        }).eq('id', adjustment.material_id);

        const { data: stockLvl } = await supabase
          .from('inventory_material_stock_levels')
          .select('*')
          .eq('material_id', adjustment.material_id)
          .eq('location_id', adjustment.location_id)
          .single();

        if (stockLvl) {
          const currentLoc = Number(stockLvl.current_stock) || 0;
          const newLoc = isDeduct ? (currentLoc - qtyAdj) : (currentLoc + qtyAdj);
          await supabase.from('inventory_material_stock_levels').update({
            current_stock: newLoc,
            available_stock: newLoc,
            updated_at: new Date().toISOString()
          }).eq('id', stockLvl.id);
        }

        await supabase.from('inventory_stock_ledger').insert({
          tenant_id,
          branch_id,
          material_id: adjustment.material_id,
          transaction_date: new Date().toISOString(),
          transaction_type: 'Adjustment',
          reference_type: 'Stock Adjustment',
          reference_id: data.id,
          qty_in: isDeduct ? 0 : qtyAdj,
          qty_out: isDeduct ? qtyAdj : 0,
          balance_stock: newTotal,
          unit_cost: Number(mat.average_cost),
          total_value: qtyAdj * Number(mat.average_cost),
          remarks: `Stock Adjustment: ${adjustment.reason}. ${adjustment.remarks || ''}`,
          created_by: adjustment.created_by,
        });
      }

      return { data: data as InventoryAdjustment, error: null };
    } else {
      return createAdjustmentLocal(fullAdjustment);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    const id = `adj-${Math.random().toString(36).substr(2, 9)}`;
    return createAdjustmentLocal({
      ...adjustment,
      id,
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      created_at: new Date().toISOString(),
    });
  }
}

function createAdjustmentLocal(adjObj: InventoryAdjustment): ServiceResult<InventoryAdjustment> {
  const now = new Date().toISOString();
  const all = getLocalData<InventoryAdjustment[]>(LOCAL_STORAGE_KEYS.ADJUSTMENTS, []);
  all.push(adjObj);
  saveLocalData(LOCAL_STORAGE_KEYS.ADJUSTMENTS, all);

  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  const stockLevels = getLocalData<InventoryStockLevel[]>(LOCAL_STORAGE_KEYS.STOCK_LEVELS, []);
  const ledger = getLocalData<InventoryStockLedger[]>(LOCAL_STORAGE_KEYS.STOCK_LEDGER, []);

  const matIdx = materials.findIndex(m => m.id === adjObj.material_id);
  if (matIdx >= 0) {
    const mat = materials[matIdx];
    const qtyAdj = Number(adjObj.quantity) || 0;
    const isDeduct = adjObj.adjustment_type === 'Deduct';
    const originalStock = Number(mat.current_stock) || 0;
    const finalStock = isDeduct ? (originalStock - qtyAdj) : (originalStock + qtyAdj);

    materials[matIdx] = {
      ...mat,
      current_stock: finalStock,
      inventory_value: finalStock * Number(mat.average_cost),
      updated_at: now,
    };
    saveLocalData(LOCAL_STORAGE_KEYS.MATERIALS, materials);

    // Update location stock level
    const lvlIdx = stockLevels.findIndex(lvl => lvl.material_id === adjObj.material_id && lvl.location_id === adjObj.location_id);
    if (lvlIdx >= 0) {
      const originalLoc = Number(stockLevels[lvlIdx].current_stock) || 0;
      stockLevels[lvlIdx] = {
        ...stockLevels[lvlIdx],
        current_stock: isDeduct ? (originalLoc - qtyAdj) : (originalLoc + qtyAdj),
        available_stock: isDeduct ? (originalLoc - qtyAdj) : (originalLoc + qtyAdj),
        updated_at: now,
      };
    } else {
      stockLevels.push({
        id: `lvl-${Math.random().toString(36).substr(2, 9)}`,
        tenant_id: adjObj.tenant_id,
        branch_id: adjObj.branch_id,
        material_id: adjObj.material_id,
        location_id: adjObj.location_id,
        current_stock: isDeduct ? -qtyAdj : qtyAdj,
        reserved_stock: 0,
        available_stock: isDeduct ? -qtyAdj : qtyAdj,
        updated_at: now,
      });
    }
    saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEVELS, stockLevels);

    // Ledger Movement
    ledger.push({
      id: `ld-${Math.random().toString(36).substr(2, 9)}`,
      tenant_id: adjObj.tenant_id,
      branch_id: adjObj.branch_id,
      material_id: adjObj.material_id,
      transaction_date: now,
      transaction_type: 'Adjustment',
      reference_type: 'Stock Adjustment',
      reference_id: adjObj.id,
      qty_in: isDeduct ? 0 : qtyAdj,
      qty_out: isDeduct ? qtyAdj : 0,
      balance_stock: finalStock,
      unit_cost: Number(mat.average_cost),
      total_value: qtyAdj * Number(mat.average_cost),
      remarks: `Adjustment (${adjObj.adjustment_type}): ${adjObj.reason}. ${adjObj.remarks || ''}`,
      created_by: adjObj.created_by,
      created_at: now,
    });
    saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEDGER, ledger);

    recordAuditLogLocal('adjustments', adjObj.id, 'ADJUST', null, adjObj);
    evaluateStockAlertsLocal(adjObj.material_id);
  }

  return { data: adjObj, error: null };
}

// ─── 10. WASTAGE REGISTER ───────────────────────────────────────────────────

export async function fetchWastage(): Promise<ServiceResult<InventoryWastage[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_wastage')
        .select(`
          *,
          material:inventory_materials(material_name)
        `)
        .eq('tenant_id', tenant_id)
        .order('recorded_at', { ascending: false });

      if (error) {
        if (await handleQueryError(error, 'fetchWastage')) {
          return fetchWastageLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }

      const formatted = (data || []).map((w: any) => ({
        ...w,
        material_name: w.material?.material_name || 'Unknown Material',
      }));

      return { data: formatted as InventoryWastage[], error: null };
    } else {
      return fetchWastageLocal(tenant_id);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    return fetchWastageLocal(tenant.tenant_id);
  }
}

function fetchWastageLocal(tenantId: string): ServiceResult<InventoryWastage[]> {
  const all = getLocalData<InventoryWastage[]>(LOCAL_STORAGE_KEYS.WASTAGE, []);
  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  
  const filtered = all.filter(w => w.tenant_id === tenantId);
  const formatted = filtered.map(w => {
    const mat = materials.find(m => m.id === w.material_id);
    return {
      ...w,
      material_name: mat ? mat.material_name : 'Unknown Material',
    };
  }).sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

  return { data: formatted, error: null };
}

export async function createWastage(
  record: Omit<InventoryWastage, 'id' | 'tenant_id' | 'branch_id' | 'recorded_at' | 'cost_impact'>
): Promise<ServiceResult<InventoryWastage>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const id = `wst-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Fetch material average cost to calculate exact cost impact
    let averageCost = 0;
    if (!forceLocalFallback) {
      const { data: mat } = await supabase.from('inventory_materials').select('average_cost').eq('id', record.material_id).single();
      if (mat) averageCost = Number(mat.average_cost) || 0;
    } else {
      const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
      const mat = materials.find(m => m.id === record.material_id);
      if (mat) averageCost = Number(mat.average_cost) || 0;
    }

    const costImpact = Number(record.quantity) * averageCost;

    const fullWastage: InventoryWastage = {
      ...record,
      id,
      tenant_id,
      branch_id,
      cost_impact: costImpact,
      recorded_at: now,
    };

    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_wastage')
        .insert(fullWastage)
        .select('*')
        .single();

      if (error) {
        if (await handleQueryError(error, 'createWastage')) {
          return createWastageLocal(fullWastage);
        }
        return { data: null, error: error.message };
      }

      // Atomic stock deduct
      const { data: matData } = await supabase.from('inventory_materials').select('*').eq('id', record.material_id).single();
      if (matData) {
        const qty = Number(record.quantity) || 0;
        const currentStock = Number(matData.current_stock) || 0;
        const newStock = Math.max(0, currentStock - qty);

        await supabase.from('inventory_materials').update({
          current_stock: newStock,
          inventory_value: newStock * Number(matData.average_cost),
          updated_at: new Date().toISOString()
        }).eq('id', record.material_id);

        // Deduct location stock
        const { data: stockLvl } = await supabase
          .from('inventory_material_stock_levels')
          .select('*')
          .eq('material_id', record.material_id)
          .eq('location_id', record.location_id)
          .single();

        if (stockLvl) {
          const newLoc = Math.max(0, Number(stockLvl.current_stock) - qty);
          await supabase.from('inventory_material_stock_levels').update({
            current_stock: newLoc,
            available_stock: newLoc,
            updated_at: new Date().toISOString()
          }).eq('id', stockLvl.id);
        }

        // Ledger
        await supabase.from('inventory_stock_ledger').insert({
          tenant_id,
          branch_id,
          material_id: record.material_id,
          transaction_date: now,
          transaction_type: 'Wastage',
          reference_type: 'Wastage Log',
          reference_id: data.id,
          qty_in: 0,
          qty_out: qty,
          balance_stock: newStock,
          unit_cost: Number(matData.average_cost),
          total_value: costImpact,
          remarks: `Wastage logged: ${record.reason}. Recorded by ${record.recorded_by}`,
          created_by: record.recorded_by,
        });
      }

      return { data: data as InventoryWastage, error: null };
    } else {
      return createWastageLocal(fullWastage);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    const id = `wst-${Math.random().toString(36).substr(2, 9)}`;
    const costImpact = Number(record.quantity) * 280; // simple fallback rate
    return createWastageLocal({
      ...record,
      id,
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      cost_impact: costImpact,
      recorded_at: new Date().toISOString(),
    });
  }
}

function createWastageLocal(wastageObj: InventoryWastage): ServiceResult<InventoryWastage> {
  const now = new Date().toISOString();
  const all = getLocalData<InventoryWastage[]>(LOCAL_STORAGE_KEYS.WASTAGE, []);
  all.push(wastageObj);
  saveLocalData(LOCAL_STORAGE_KEYS.WASTAGE, all);

  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  const stockLevels = getLocalData<InventoryStockLevel[]>(LOCAL_STORAGE_KEYS.STOCK_LEVELS, []);
  const ledger = getLocalData<InventoryStockLedger[]>(LOCAL_STORAGE_KEYS.STOCK_LEDGER, []);

  const matIdx = materials.findIndex(m => m.id === wastageObj.material_id);
  if (matIdx >= 0) {
    const mat = materials[matIdx];
    const qty = Number(wastageObj.quantity) || 0;
    const current = Number(mat.current_stock) || 0;
    const finalStock = Math.max(0, current - qty);

    materials[matIdx] = {
      ...mat,
      current_stock: finalStock,
      inventory_value: finalStock * Number(mat.average_cost),
      updated_at: now,
    };
    saveLocalData(LOCAL_STORAGE_KEYS.MATERIALS, materials);

    // Update location stock level
    const lvlIdx = stockLevels.findIndex(lvl => lvl.material_id === wastageObj.material_id && lvl.location_id === wastageObj.location_id);
    if (lvlIdx >= 0) {
      const originalLoc = Number(stockLevels[lvlIdx].current_stock) || 0;
      stockLevels[lvlIdx] = {
        ...stockLevels[lvlIdx],
        current_stock: Math.max(0, originalLoc - qty),
        available_stock: Math.max(0, originalLoc - qty),
        updated_at: now,
      };
    }
    saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEVELS, stockLevels);

    // Stock movement log
    ledger.push({
      id: `ld-${Math.random().toString(36).substr(2, 9)}`,
      tenant_id: wastageObj.tenant_id,
      branch_id: wastageObj.branch_id,
      material_id: wastageObj.material_id,
      transaction_date: now,
      transaction_type: 'Wastage',
      reference_type: 'Wastage Register',
      reference_id: wastageObj.id,
      qty_in: 0,
      qty_out: qty,
      balance_stock: finalStock,
      unit_cost: Number(mat.average_cost),
      total_value: wastageObj.cost_impact,
      remarks: `Wastage logged (${wastageObj.reason}). Cost impact: ₹${wastageObj.cost_impact.toFixed(2)}`,
      created_by: wastageObj.recorded_by,
      created_at: now,
    });
    saveLocalData(LOCAL_STORAGE_KEYS.STOCK_LEDGER, ledger);

    recordAuditLogLocal('wastage', wastageObj.id, 'WASTAGE', null, wastageObj);
    evaluateStockAlertsLocal(wastageObj.material_id);
  }

  return { data: wastageObj, error: null };
}


// ─── 11. AUDIT LOGGING ────────────────────────────────────────────────────────

export async function fetchAuditLogs(): Promise<ServiceResult<InventoryAuditLog[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_audit_logs')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        if (await handleQueryError(error, 'fetchAuditLogs')) {
          return fetchAuditLogsLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }
      return { data: data as InventoryAuditLog[], error: null };
    } else {
      return fetchAuditLogsLocal(tenant_id);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    return fetchAuditLogsLocal(tenant.tenant_id);
  }
}

function fetchAuditLogsLocal(tenantId: string): ServiceResult<InventoryAuditLog[]> {
  const all = getLocalData<InventoryAuditLog[]>(LOCAL_STORAGE_KEYS.AUDIT_LOGS, []);
  const filtered = all.filter(a => a.tenant_id === tenantId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { data: filtered, error: null };
}

function recordAuditLogLocal(
  module: 'materials' | 'purchases' | 'adjustments' | 'suppliers' | 'wastage' | 'categories' | 'units',
  recordId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ADJUST' | 'WASTAGE',
  oldVal: any,
  newVal: any
) {
  const tenant = getTenantContext();
  const all = getLocalData<InventoryAuditLog[]>(LOCAL_STORAGE_KEYS.AUDIT_LOGS, []);
  
  all.push({
    id: `aud-${Math.random().toString(36).substr(2, 9)}`,
    tenant_id: tenant.tenant_id,
    branch_id: tenant.branch_id,
    module_name: module,
    record_id: recordId,
    action_type: action,
    old_value: oldVal ? JSON.parse(JSON.stringify(oldVal)) : null,
    new_value: newVal ? JSON.parse(JSON.stringify(newVal)) : null,
    performed_by: 'Owner Staff',
    created_at: new Date().toISOString(),
  });

  saveLocalData(LOCAL_STORAGE_KEYS.AUDIT_LOGS, all);
}


// ─── 12. ALERTS ──────────────────────────────────────────────────────────────

export async function fetchAlerts(): Promise<ServiceResult<InventoryAlert[]>> {
  try {
    const { tenant_id } = getTenantContext();
    if (!forceLocalFallback) {
      const { data, error } = await supabase
        .from('inventory_alerts')
        .select(`
          *,
          material:inventory_materials(material_name)
        `)
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false });

      if (error) {
        if (await handleQueryError(error, 'fetchAlerts')) {
          return fetchAlertsLocal(tenant_id);
        }
        return { data: null, error: error.message };
      }

      const formatted = (data || []).map((a: any) => ({
        ...a,
        material_name: a.material?.material_name || 'Unknown Material',
      }));

      return { data: formatted as InventoryAlert[], error: null };
    } else {
      return fetchAlertsLocal(tenant_id);
    }
  } catch (err: any) {
    const tenant = getTenantContext();
    return fetchAlertsLocal(tenant.tenant_id);
  }
}

function fetchAlertsLocal(tenantId: string): ServiceResult<InventoryAlert[]> {
  const all = getLocalData<InventoryAlert[]>(LOCAL_STORAGE_KEYS.ALERTS, []);
  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  
  const filtered = all.filter(a => a.tenant_id === tenantId);
  const formatted = filtered.map(a => {
    const mat = materials.find(m => m.id === a.material_id);
    return {
      ...a,
      material_name: mat ? mat.material_name : 'Unknown Material',
    };
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { data: formatted, error: null };
}

export async function markAlertRead(id: string): Promise<ServiceResult<boolean>> {
  try {
    if (!forceLocalFallback) {
      const { error } = await supabase.from('inventory_alerts').update({ is_read: true }).eq('id', id);
      if (error) {
        if (await handleQueryError(error, 'markAlertRead')) {
          return markAlertReadLocal(id);
        }
        return { data: false, error: error.message };
      }
      return { data: true, error: null };
    } else {
      return markAlertReadLocal(id);
    }
  } catch (err: any) {
    return markAlertReadLocal(id);
  }
}

function markAlertReadLocal(id: string): ServiceResult<boolean> {
  const all = getLocalData<InventoryAlert[]>(LOCAL_STORAGE_KEYS.ALERTS, []);
  const idx = all.findIndex(a => a.id === id);
  if (idx >= 0) {
    all[idx].is_read = true;
    saveLocalData(LOCAL_STORAGE_KEYS.ALERTS, all);
    return { data: true, error: null };
  }
  return { data: false, error: 'Alert not found.' };
}

/**
 * Checks stock levels of a material and inserts or clears low-stock/out-of-stock alert entries.
 */
function evaluateStockAlertsLocal(materialId: string) {
  const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
  const alerts = getLocalData<InventoryAlert[]>(LOCAL_STORAGE_KEYS.ALERTS, []);
  const tenant = getTenantContext();

  const mat = materials.find(m => m.id === materialId);
  if (!mat) return;

  const current = Number(mat.current_stock) || 0;
  const reorder = Number(mat.reorder_level) || 0;

  // Clear previous alerts for this material
  const cleanedAlerts = alerts.filter(a => a.material_id !== materialId);

  if (current === 0) {
    cleanedAlerts.push({
      id: `alrt-${Math.random().toString(36).substr(2, 9)}`,
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: materialId,
      alert_type: 'Out of Stock',
      message: `${mat.material_name} is completely OUT of stock! Kitchen operations might be affected.`,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } else if (current < 0) {
    cleanedAlerts.push({
      id: `alrt-${Math.random().toString(36).substr(2, 9)}`,
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: materialId,
      alert_type: 'Negative Stock',
      message: `${mat.material_name} stock went negative (${current.toFixed(2)}). Please perform a physical audit.`,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  } else if (current <= reorder) {
    cleanedAlerts.push({
      id: `alrt-${Math.random().toString(36).substr(2, 9)}`,
      tenant_id: tenant.tenant_id,
      branch_id: tenant.branch_id,
      material_id: materialId,
      alert_type: 'Low Stock',
      message: `${mat.material_name} is running low (${current.toFixed(2)} left vs reorder level ${reorder.toFixed(2)}).`,
      is_read: false,
      created_at: new Date().toISOString(),
    });
  }

  saveLocalData(LOCAL_STORAGE_KEYS.ALERTS, cleanedAlerts);
}


// ─── 13. DASHBOARD KPIS & VALUATIONS ──────────────────────────────────────────

export async function fetchInventoryDashboardKPIs(): Promise<ServiceResult<DashboardKPIs>> {
  try {
    const tenant = getTenantContext();
    // Always calculate KPIs on combined datasets in localStorage fallback
    // to guarantee rapid dashboard loads and zero remote bottlenecks!
    initializeLocalSeeder();

    const materials = getLocalData<InventoryMaterial[]>(LOCAL_STORAGE_KEYS.MATERIALS, []);
    const suppliers = getLocalData<InventorySupplier[]>(LOCAL_STORAGE_KEYS.SUPPLIERS, []);
    const purchases = getLocalData<InventoryPurchaseHeader[]>(LOCAL_STORAGE_KEYS.PURCHASE_HEADERS, []);
    const purchaseItems = getLocalData<InventoryPurchaseItem[]>(LOCAL_STORAGE_KEYS.PURCHASE_ITEMS, []);
    const wastage = getLocalData<InventoryWastage[]>(LOCAL_STORAGE_KEYS.WASTAGE, []);

    // Filters
    const tenantMaterials = materials.filter(m => m.tenant_id === tenant.tenant_id && !m.deleted_at);
    const activeSuppliers = suppliers.filter(s => s.tenant_id === tenant.tenant_id && !s.deleted_at);
    const tenantPurchases = purchases.filter(p => p.tenant_id === tenant.tenant_id && p.status === 'Completed');

    // 1. Valuation Sum
    let inventoryValuation = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    for (const mat of tenantMaterials) {
      const stock = Number(mat.current_stock) || 0;
      const cost = Number(mat.average_cost) || 0;
      inventoryValuation += (stock * cost);

      if (stock === 0) {
        outOfStockCount++;
      } else if (stock <= Number(mat.reorder_level)) {
        lowStockCount++;
      }
    }

    // 2. Purchases Month-over-Month Trend
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Get last month string
    let prevYear = now.getFullYear();
    let prevMonth = now.getMonth(); // previous index
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear--;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    let monthlyPurchasesThisMonth = 0;
    let monthlyPurchasesPrevMonth = 0;

    for (const p of tenantPurchases) {
      if (p.purchase_date.startsWith(currentMonthStr)) {
        monthlyPurchasesThisMonth += Number(p.grand_total) || 0;
      } else if (p.purchase_date.startsWith(prevMonthStr)) {
        monthlyPurchasesPrevMonth += Number(p.grand_total) || 0;
      }
    }

    let purchaseCostTrendPercentage = 0;
    if (monthlyPurchasesPrevMonth > 0) {
      purchaseCostTrendPercentage = ((monthlyPurchasesThisMonth - monthlyPurchasesPrevMonth) / monthlyPurchasesPrevMonth) * 100;
    }

    // 3. Wastage Cost Impact
    let wastageCostImpactThisMonth = 0;
    const tenantWastage = wastage.filter(w => w.tenant_id === tenant.tenant_id);
    for (const w of tenantWastage) {
      if (w.recorded_at.startsWith(currentMonthStr)) {
        wastageCostImpactThisMonth += Number(w.cost_impact) || 0;
      }
    }

    // 4. Inventory Turnover Ratio (Mock calculation indicator: standard COGS vs average valuation)
    const mockCOGS = monthlyPurchasesThisMonth * 0.78; // average kitchen cost consumption ratio
    const averageValuation = inventoryValuation > 0 ? inventoryValuation : 10000;
    const inventoryTurnoverRatio = Number((mockCOGS / averageValuation).toFixed(2));

    // 5. Top Purchased Materials
    const materialSpends: Record<string, { name: string; qty: number; spend: number }> = {};
    for (const item of purchaseItems) {
      if (item.tenant_id !== tenant.tenant_id) continue;
      const mat = tenantMaterials.find(m => m.id === item.material_id);
      if (!mat) continue;
      if (!materialSpends[item.material_id]) {
        materialSpends[item.material_id] = { name: mat.material_name, qty: 0, spend: 0 };
      }
      materialSpends[item.material_id].qty += Number(item.quantity);
      materialSpends[item.material_id].spend += Number(item.line_total);
    }

    const topPurchasedMaterials = Object.entries(materialSpends).map(([material_id, val]) => ({
      material_id,
      material_name: val.name,
      quantity: val.qty,
      total_spend: val.spend,
    })).sort((a, b) => b.total_spend - a.total_spend).slice(0, 5);

    const kpis: DashboardKPIs = {
      totalMaterials: tenantMaterials.length,
      outOfStockCount,
      lowStockCount,
      activeSuppliersCount: activeSuppliers.length,
      monthlyPurchasesThisMonth,
      monthlyPurchasesPrevMonth,
      purchaseCostTrendPercentage,
      inventoryValuation,
      inventoryTurnoverRatio,
      wastageCostImpactThisMonth,
      topPurchasedMaterials,
    };

    return { data: kpis, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Error compiling KPIs.' };
  }
}
