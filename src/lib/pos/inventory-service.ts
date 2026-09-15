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
  primary_unit_id?: string | null;
  conversion_factor?: number | null;
  primary_unit_short_name?: string;
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

export type InventoryAuditModule =
  | 'materials'
  | 'purchases'
  | 'adjustments'
  | 'suppliers'
  | 'wastage'
  | 'categories'
  | 'units';

export type InventoryAuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'ADJUST' | 'WASTAGE';

export type InventoryAuditLog = {
  id: string;
  tenant_id: string;
  branch_id: string;
  module_name: InventoryAuditModule;
  record_id: string;
  action_type: InventoryAuditAction;
  old_value: unknown;
  new_value: unknown;
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

export type InventoryTransferRequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Partially Dispatched'
  | 'Dispatched'
  | 'Partially Received'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

export type InventoryTransferRequest = {
  id: string;
  tenant_id: string;
  branch_id: string;
  request_number: string;
  from_branch_id: string;
  to_branch_id: string;
  request_date: string;
  status: InventoryTransferRequestStatus;
  remarks: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  // UI helpers
  from_branch_name?: string;
  to_branch_name?: string;
  items?: InventoryTransferRequestItem[];
};

export type InventoryTransferRequestItem = {
  id: string;
  tenant_id: string;
  branch_id: string;
  transfer_request_id: string;
  material_id: string;
  requested_quantity: number;
  approved_quantity: number | null;
  received_quantity?: number | null;
  created_at: string;
  material_name?: string;
  unit_short_name?: string;
};

export type InventoryDispatch = {
  id: string;
  tenant_id: string;
  branch_id: string;
  dispatch_number: string;
  transfer_request_id: string | null;
  from_branch_id: string;
  to_branch_id: string;
  dispatch_date: string;
  status: 'Dispatched' | 'Received';
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // UI helpers
  from_branch_name?: string;
  to_branch_name?: string;
  transfer_request_number?: string;
  items?: InventoryDispatchItem[];
};

export type InventoryDispatchItem = {
  id: string;
  tenant_id: string;
  branch_id: string;
  dispatch_id: string;
  material_id: string;
  dispatched_quantity: number;
  received_quantity: number | null;
  created_at: string;
  material_name?: string;
  unit_short_name?: string;
};

export type InventoryTransferVariance = {
  id: string;
  tenant_id: string;
  branch_id: string;
  dispatch_item_id: string;
  material_id: string;
  dispatched_qty: number;
  received_qty: number;
  variance_qty: number;
  reason: string;
  created_at: string;
};

export type InventoryTransferEvent = {
  id: string;
  tenant_id: string;
  branch_id: string;
  transfer_request_id: string;
  event_type: 'Created' | 'Approved' | 'Dispatched' | 'Received' | 'Cancelled' | 'Rejected';
  performed_by: string;
  notes: string | null;
  created_at: string;
};

export type InventoryRecipe = {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  description: string | null;
  yield_quantity: number;
  yield_unit: string;
  cost_snapshot: number;
  version_no: number;
  effective_from: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  recipe_code: string;
  recipe_name: string;
  menu_item_id: string | null;
};

export type InventoryRecipeItem = {
  id: string;
  recipe_id: string;
  material_id: string;
  quantity: number;
  created_at: string;
  material_name?: string;
};

export type InventoryConsumptionBatch = {
  id: string;
  tenant_id: string;
  branch_id: string;
  bill_id: string;
  status: 'Pending' | 'Processed' | 'Failed';
  total_cost_snapshot: number;
  created_at: string;
  processed_at: string | null;
};

export type InventoryConsumptionJob = {
  id: string;
  tenant_id: string;
  branch_id: string;
  batch_id: string;
  material_id: string;
  quantity_to_deduct: number;
  status: 'Pending' | 'Processed' | 'Failed';
  attempt_count: number;
  last_attempt_at: string | null;
  processed_by: string | null;
  retry_after: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
};

export type ConsumptionWorkerResult = {
  processed: number;
  failed: number;
  deferred: number;
};

export type PendingConsumptionSummary = {
  pending: number;
  failed: number;
};

export type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  branch_type: 'RESTAURANT' | 'CENTRAL_KITCHEN' | 'WAREHOUSE';
  created_at: string;
};

// ─── INTERNAL ROW SHAPES (live DB columns, including PostgREST joins) ─────────

type MaterialNameJoin = { material_name: string | null } | null;
type MaterialWithUnitJoin = {
  material_name: string | null;
  unit: { short_name: string | null } | null;
} | null;

type MaterialRow = InventoryMaterial & {
  primary_unit_id?: string | null;
  conversion_factor?: number | null;
  category: { category_name: string | null } | null;
  unit: { short_name: string | null } | null;
  primary_unit: { short_name: string | null } | null;
};

type UnitNameRow = { id: string; unit_name: string | null; short_name: string | null };
type IdRow = { id: string };
type BranchNameRow = { id: string; name: string | null };

type PurchaseHeaderRow = InventoryPurchaseHeader & {
  supplier: { supplier_name: string | null } | null;
};
type PurchaseItemRow = InventoryPurchaseItem & { material: MaterialNameJoin };
type LedgerRow = InventoryStockLedger & { material: MaterialNameJoin };
type AdjustmentRow = InventoryAdjustment & { material: MaterialNameJoin };
type WastageRow = InventoryWastage & { material: MaterialNameJoin };
type AlertRow = InventoryAlert & { material: MaterialNameJoin };

type MaterialStockRow = {
  id: string;
  current_stock: number | null;
  average_cost: number | null;
  material_name?: string | null;
};

type TransferRequestRow = {
  id: string;
  tenant_id: string;
  requesting_branch_id: string;
  supplying_branch_id: string;
  request_number: string;
  status: InventoryTransferRequestStatus;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

type TransferRequestItemRow = {
  id: string;
  request_id: string;
  material_id: string;
  requested_qty: number | null;
  approved_qty: number | null;
  received_qty: number | null;
  created_at?: string | null;
  material?: MaterialWithUnitJoin;
};

type TransferRequestWithItemsRow = TransferRequestRow & { items: TransferRequestItemRow[] | null };

type DispatchRow = {
  id: string;
  request_id: string | null;
  dispatch_number: string;
  dispatched_at: string;
  received_at: string | null;
  status: 'Dispatched' | 'Received';
};

type DispatchItemRow = {
  id: string;
  dispatch_id: string;
  material_id: string;
  quantity: number | null;
  received_quantity: number | null;
  created_at?: string | null;
  material?: MaterialWithUnitJoin;
};

type DispatchWithRequestRow = DispatchRow & {
  request: TransferRequestRow | null;
  items: DispatchItemRow[] | null;
};

type RecipeRow = {
  id: string;
  tenant_id: string;
  recipe_code: string | null;
  recipe_name: string | null;
  menu_item_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  yield_quantity: number | null;
  yield_unit: string | null;
  cost_snapshot: number | null;
  version_no?: number | null;
  effective_from?: string | null;
};

type RecipeItemRow = InventoryRecipeItem & { material: MaterialNameJoin };

type ProductRow = {
  id: string;
  name: string | null;
  recipe_id: string | null;
};

type BillItemRow = { product_id: string | null; qty: number | null };

type CreateDispatchRpcResult = {
  dispatch: DispatchRow;
  request_status: InventoryTransferRequestStatus;
  request_number: string;
  from_branch_id: string;
  to_branch_id: string;
};

type ReceiveDispatchRpcResult = {
  already_received: boolean;
  request_status: InventoryTransferRequestStatus;
};

type KpiPurchaseRow = { purchase_date: string; grand_total: number | null };
type KpiPurchaseItemRow = { material_id: string; quantity: number | null; line_total: number | null };
type KpiWastageRow = { cost_impact: number | null };

// ─── ERROR HANDLING ───────────────────────────────────────────────────────────

const TABLES_UNAVAILABLE_MESSAGE = 'Inventory tables are not available. Contact support.';

type DescribedError = { code: string; message: string; status: number | null };

function describeError(err: unknown): DescribedError {
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : '';
    const message =
      typeof record.message === 'string'
        ? record.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = typeof record.status === 'number' ? record.status : null;
    return { code, message, status };
  }
  return { code: '', message: String(err), status: null };
}

/**
 * Logs the real database error and returns a fixed, user-safe message.
 * A missing table (42P01 / HTTP 404) is surfaced as a support-facing message
 * instead of silently falling back to local data.
 */
function reportError(fn: string, err: unknown, fallback: string): string {
  const { code, message, status } = describeError(err);
  console.error(`[inventory-service] ${fn}:`, code || status || 'UNKNOWN', message);
  if (code === '42P01' || status === 404) {
    return TABLES_UNAVAILABLE_MESSAGE;
  }
  return fallback;
}

function mapTransferRpcError(fn: string, err: unknown): string {
  const { code, message } = describeError(err);
  console.error(`[inventory-service] ${fn}:`, code || 'UNKNOWN', message);

  if (code === 'PGRST202') {
    return 'Inventory transfer service is not deployed yet.';
  }
  const stockMatch = /INSUFFICIENT_STOCK:(.*)$/.exec(message);
  if (stockMatch) {
    const name = stockMatch[1].trim() || 'this material';
    return `Not enough stock of ${name} at the supplying branch.`;
  }
  if (message.includes('DISPATCH_REQUEST_CLOSED')) {
    return 'This transfer request is already closed.';
  }
  if (message.includes('_FORBIDDEN')) {
    return 'You cannot perform this action for that branch.';
  }
  if (message.includes('_NOT_FOUND')) {
    return 'Transfer request not found.';
  }
  return 'Unable to complete the transfer. Please try again.';
}

function isUuid(val: string | null | undefined): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toNumber(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @deprecated The local-storage seed engine has been removed; inventory data is
 * always read from Supabase. Kept as a no-op so existing call sites keep compiling.
 */
export function initializeLocalSeeder(_forceReset = false): void {
  // intentionally empty
}

// ─── 1. CATEGORIES ───────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<ServiceResult<InventoryCategory[]>> {
  try {
    const { tenant_id } = getTenantContext();

    // Categories are a tenant-wide catalog shared by every branch.
    const { data, error } = await supabase
      .from('inventory_categories')
      .select('*')
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .order('category_name', { ascending: true });

    if (error) {
      return { data: null, error: reportError('fetchCategories', error, 'Unable to load categories.') };
    }
    return { data: (data ?? []) as InventoryCategory[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchCategories', err, 'Unable to load categories.') };
  }
}

export async function saveCategory(category: Partial<InventoryCategory>): Promise<ServiceResult<InventoryCategory>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
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

    const { data, error } = await supabase
      .from('inventory_categories')
      .upsert({ id: category.id || undefined, ...fullCategory })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('saveCategory', error, 'Unable to save category.') };
    }
    return { data: data as InventoryCategory, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('saveCategory', err, 'Unable to save category.') };
  }
}

export async function deleteCategory(id: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { error } = await supabase
      .from('inventory_categories')
      .update({ deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: false, error: reportError('deleteCategory', error, 'Unable to delete category.') };
    }
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('deleteCategory', err, 'Unable to delete category.') };
  }
}

// ─── 2. UNITS ────────────────────────────────────────────────────────────────

export async function fetchUnits(): Promise<ServiceResult<InventoryUnit[]>> {
  try {
    const { tenant_id } = getTenantContext();

    // Units are a tenant-wide catalog shared by every branch.
    const { data, error } = await supabase
      .from('inventory_units')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    if (error) {
      return { data: null, error: reportError('fetchUnits', error, 'Unable to load units.') };
    }
    return { data: (data ?? []) as InventoryUnit[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchUnits', err, 'Unable to load units.') };
  }
}

export async function saveUnit(unit: Partial<InventoryUnit>): Promise<ServiceResult<InventoryUnit>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    let duplicateQuery = supabase
      .from('inventory_units')
      .select('id, unit_name, short_name')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true);

    if (unit.id) {
      duplicateQuery = duplicateQuery.neq('id', unit.id);
    }

    const { data: existingData, error: dupErr } = await duplicateQuery;
    if (dupErr) {
      return { data: null, error: reportError('saveUnit', dupErr, 'Unable to save unit.') };
    }

    const existingUnits = (existingData ?? []) as UnitNameRow[];
    const newUnitName = (unit.unit_name || '').toLowerCase().trim();
    const newShortName = (unit.short_name || '').toLowerCase().trim();
    const hasDupName = existingUnits.some((u) => (u.unit_name || '').toLowerCase().trim() === newUnitName);
    const hasDupShort = existingUnits.some((u) => (u.short_name || '').toLowerCase().trim() === newShortName);
    if (hasDupName) {
      return { data: null, error: 'A unit with this name already exists.' };
    }
    if (hasDupShort) {
      return { data: null, error: 'A unit with this abbreviation (short name) already exists.' };
    }

    const code = unit.unit_code || `UN${Math.floor(10 + Math.random() * 90)}`;
    const dbPayload = {
      tenant_id,
      branch_id,
      unit_code: code,
      unit_name: unit.unit_name || 'Unnamed Unit',
      short_name: unit.short_name || code.toLowerCase(),
      is_active: unit.is_active !== false,
    };

    const { data, error } = await supabase
      .from('inventory_units')
      .upsert({ ...(unit.id ? { id: unit.id } : {}), ...dbPayload })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('saveUnit', error, 'Unable to save unit.') };
    }
    return { data: data as InventoryUnit, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('saveUnit', err, 'Unable to save unit.') };
  }
}

export async function deleteUnit(id: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { error } = await supabase
      .from('inventory_units')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: false, error: reportError('deleteUnit', error, 'Unable to delete unit.') };
    }
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('deleteUnit', err, 'Unable to delete unit.') };
  }
}

// ─── 3. SUPPLIERS ────────────────────────────────────────────────────────────

export async function fetchSuppliers(): Promise<ServiceResult<InventorySupplier[]>> {
  try {
    const { tenant_id } = getTenantContext();

    // Suppliers are a tenant-wide catalog shared by every branch.
    const { data, error } = await supabase
      .from('inventory_suppliers')
      .select('*')
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .order('supplier_name', { ascending: true });

    if (error) {
      return { data: null, error: reportError('fetchSuppliers', error, 'Unable to load suppliers.') };
    }
    return { data: (data ?? []) as InventorySupplier[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchSuppliers', err, 'Unable to load suppliers.') };
  }
}

export async function saveSupplier(supplier: Partial<InventorySupplier>): Promise<ServiceResult<InventorySupplier>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    let duplicateQuery = supabase
      .from('inventory_suppliers')
      .select('id')
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .ilike('supplier_name', supplier.supplier_name?.trim() || '');

    if (supplier.id) {
      duplicateQuery = duplicateQuery.neq('id', supplier.id);
    }

    const { data: dupSup, error: dupErr } = await duplicateQuery.maybeSingle();
    if (dupErr) {
      return { data: null, error: reportError('saveSupplier', dupErr, 'Unable to save supplier.') };
    }
    if (dupSup) {
      return { data: null, error: 'A supplier with this name already exists.' };
    }

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

    const { data, error } = await supabase
      .from('inventory_suppliers')
      .upsert({ id: supplier.id || undefined, ...fullSupplier })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('saveSupplier', error, 'Unable to save supplier.') };
    }
    return { data: data as InventorySupplier, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('saveSupplier', err, 'Unable to save supplier.') };
  }
}

export async function deleteSupplier(id: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { error } = await supabase
      .from('inventory_suppliers')
      .update({ deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: false, error: reportError('deleteSupplier', error, 'Unable to delete supplier.') };
    }
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('deleteSupplier', err, 'Unable to delete supplier.') };
  }
}

export function getNextMaterialCode(materials: InventoryMaterial[]): string {
  let maxNum = 0;
  for (const m of materials) {
    if (m.material_code) {
      const match = m.material_code.match(/^MAT(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(2, '0');
  return `MAT${padded}`;
}

// ─── 4. MATERIALS ────────────────────────────────────────────────────────────

export async function fetchMaterials(branchId?: string, includeDeleted = false): Promise<ServiceResult<InventoryMaterial[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const targetBranchId = branchId || branch_id;

    // The material catalog is tenant-wide (shared across branches for transfers);
    // stock quantities are read per branch from inventory_material_stock_levels.
    let query = supabase
      .from('inventory_materials')
      .select(`
        *,
        category:inventory_categories(category_name),
        unit:inventory_units!inventory_unit_id(short_name),
        primary_unit:inventory_units!primary_unit_id(short_name)
      `)
      .eq('tenant_id', tenant_id);

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data: matData, error: matErr } = await query.order('material_name', { ascending: true });

    if (matErr) {
      return { data: null, error: reportError('fetchMaterials', matErr, 'Unable to load materials.') };
    }

    const { data: stockData, error: stockErr } = await supabase
      .from('inventory_material_stock_levels')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', targetBranchId);

    if (stockErr) {
      return { data: null, error: reportError('fetchMaterials', stockErr, 'Unable to load materials.') };
    }

    const mats = (matData ?? []) as MaterialRow[];
    const stockLvls = (stockData ?? []) as InventoryStockLevel[];

    const formatted: InventoryMaterial[] = mats.map((m) => {
      const materialLevels = stockLvls.filter((l) => l.material_id === m.id);
      const sumStock = materialLevels.reduce((sum, l) => sum + toNumber(l.current_stock), 0);
      const { category, unit, primary_unit, ...rest } = m;
      return {
        ...rest,
        current_stock: sumStock,
        category_name: category?.category_name || 'Uncategorized',
        unit_short_name: unit?.short_name || 'units',
        primary_unit_id: m.primary_unit_id ?? null,
        conversion_factor: m.conversion_factor ?? null,
        primary_unit_short_name: primary_unit?.short_name || '',
      };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchMaterials', err, 'Unable to load materials.') };
  }
}

export async function saveMaterial(material: Partial<InventoryMaterial>): Promise<ServiceResult<InventoryMaterial>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    let duplicateQuery = supabase
      .from('inventory_materials')
      .select('id')
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .ilike('material_name', material.material_name?.trim() || '');

    if (material.id) {
      duplicateQuery = duplicateQuery.neq('id', material.id);
    }

    const { data: dupMat, error: dupErr } = await duplicateQuery.maybeSingle();
    if (dupErr) {
      return { data: null, error: reportError('saveMaterial', dupErr, 'Unable to save material.') };
    }
    if (dupMat) {
      return { data: null, error: 'A material with this name already exists.' };
    }

    let code = material.material_code;
    if (!code) {
      const matsRes = await fetchMaterials(undefined, true);
      const existing = matsRes.data || [];
      if (!material.id) {
        code = getNextMaterialCode(existing);
      } else {
        const match = existing.find((m) => m.id === material.id);
        code = match ? match.material_code : '';
      }
    }

    const openingStock = toNumber(material.opening_stock);
    const currentStock = material.id ? toNumber(material.current_stock) : openingStock;
    const reorderLevel = toNumber(material.reorder_level);
    const averageCost = toNumber(material.average_cost);
    const lastPurchasePrice = toNumber(material.last_purchase_price) || averageCost;
    const conversionFactor =
      material.conversion_factor !== undefined && material.conversion_factor
        ? toNumber(material.conversion_factor)
        : null;

    const fullMaterial = {
      tenant_id,
      branch_id,
      material_code: code,
      material_name: material.material_name || 'Unnamed Material',
      category_id: material.category_id || null,
      inventory_unit_id: material.inventory_unit_id || null,
      primary_unit_id: material.primary_unit_id !== undefined ? material.primary_unit_id : null,
      conversion_factor: conversionFactor,
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

    const { data, error } = await supabase
      .from('inventory_materials')
      .upsert({ id: material.id || undefined, ...fullMaterial })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('saveMaterial', error, 'Unable to save material.') };
    }
    return { data: data as InventoryMaterial, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('saveMaterial', err, 'Unable to save material.') };
  }
}

export async function deleteMaterial(id: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { error } = await supabase
      .from('inventory_materials')
      .update({ deleted_at: new Date().toISOString(), deleted_by: 'Owner Staff' })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: false, error: reportError('deleteMaterial', error, 'Unable to delete material.') };
    }
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('deleteMaterial', err, 'Unable to delete material.') };
  }
}

// ─── 5. STOCK LEVELS (LOCATION-WISE) ──────────────────────────────────────────

export async function fetchStockLevels(materialId?: string): Promise<ServiceResult<InventoryStockLevel[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase.from('inventory_material_stock_levels').select('*').eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);
    if (materialId) query = query.eq('material_id', materialId);

    const { data, error } = await query;
    if (error) {
      return { data: null, error: reportError('fetchStockLevels', error, 'Unable to load stock levels.') };
    }
    return { data: (data ?? []) as InventoryStockLevel[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchStockLevels', err, 'Unable to load stock levels.') };
  }
}

// ─── 6. VENDOR PRICES ────────────────────────────────────────────────────────

export async function fetchVendorPrices(materialId?: string): Promise<ServiceResult<InventoryVendorPrice[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase.from('inventory_material_vendor_prices').select('*').eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);
    if (materialId) query = query.eq('material_id', materialId);

    const { data, error } = await query;
    if (error) {
      return { data: null, error: reportError('fetchVendorPrices', error, 'Unable to load vendor prices.') };
    }
    return { data: (data ?? []) as InventoryVendorPrice[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchVendorPrices', err, 'Unable to load vendor prices.') };
  }
}

// ─── 7. PURCHASES ────────────────────────────────────────────────────────────

export async function fetchPurchases(): Promise<ServiceResult<InventoryPurchaseHeader[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase
      .from('inventory_purchase_headers')
      .select(`
        *,
        supplier:inventory_suppliers(supplier_name)
      `)
      .eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);

    const { data, error } = await query.order('purchase_date', { ascending: false });

    if (error) {
      return { data: null, error: reportError('fetchPurchases', error, 'Unable to load purchases.') };
    }

    const rows = (data ?? []) as PurchaseHeaderRow[];
    const formatted: InventoryPurchaseHeader[] = rows.map((p) => {
      const { supplier, ...rest } = p;
      return { ...rest, supplier_name: supplier?.supplier_name || 'Unknown Supplier' };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchPurchases', err, 'Unable to load purchases.') };
  }
}

export async function fetchPurchaseItems(purchaseId: string): Promise<ServiceResult<InventoryPurchaseItem[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase
      .from('inventory_purchase_items')
      .select(`
        *,
        material:inventory_materials(material_name)
      `)
      .eq('tenant_id', tenant_id)
      .eq('purchase_header_id', purchaseId);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);

    const { data, error } = await query;

    if (error) {
      return { data: null, error: reportError('fetchPurchaseItems', error, 'Unable to load purchase items.') };
    }

    const rows = (data ?? []) as PurchaseItemRow[];
    const formatted: InventoryPurchaseItem[] = rows.map((i) => {
      const { material, ...rest } = i;
      return { ...rest, material_name: material?.material_name || 'Unknown Material' };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchPurchaseItems', err, 'Unable to load purchase items.') };
  }
}

/**
 * Creates a purchase and automates cost averaging, ledger logs, pricing history logs and location stock splits.
 */
export async function createPurchase(
  header: Omit<InventoryPurchaseHeader, 'id' | 'tenant_id' | 'branch_id' | 'purchase_number' | 'created_at' | 'status'>,
  items: Omit<InventoryPurchaseItem, 'id' | 'tenant_id' | 'branch_id' | 'purchase_header_id' | 'created_at'>[],
  location_id = 'Dry Storage'
): Promise<ServiceResult<InventoryPurchaseHeader>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const purchaseNum = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const supabaseHeader = {
      ...header,
      tenant_id,
      branch_id,
      purchase_number: purchaseNum,
      status: 'Completed' as const,
      created_at: now,
    };

    const { data, error } = await supabase
      .from('inventory_purchase_headers')
      .insert(supabaseHeader)
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('createPurchase', error, 'Unable to save purchase.') };
    }

    const savedHeader = data as InventoryPurchaseHeader;

    const finalItems = items.map((itm) => ({
      ...itm,
      tenant_id,
      branch_id,
      purchase_header_id: savedHeader.id,
      created_at: now,
    }));

    const { error: itemsErr } = await supabase.from('inventory_purchase_items').insert(finalItems);
    if (itemsErr) {
      return { data: null, error: reportError('createPurchase', itemsErr, 'Unable to save purchase items.') };
    }

    for (const itm of items) {
      const { data: matRaw, error: matErr } = await supabase
        .from('inventory_materials')
        .select('id, current_stock, average_cost')
        .eq('id', itm.material_id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (matErr) {
        return { data: null, error: reportError('createPurchase', matErr, 'Unable to update material stock.') };
      }

      const matData = matRaw as MaterialStockRow | null;
      if (!matData) continue;

      // Average Cost Formula: ((Current Stock * Avg Cost) + (Qty * Cost)) / (Current Stock + Qty)
      const currentStock = toNumber(matData.current_stock);
      const currentAvgCost = toNumber(matData.average_cost);
      const purchasedQty = toNumber(itm.quantity);
      const unitPrice = toNumber(itm.unit_price);

      const totalStock = currentStock + purchasedQty;
      const nextAvgCost =
        totalStock > 0 ? (currentStock * currentAvgCost + purchasedQty * unitPrice) / totalStock : unitPrice;

      const { error: matUpdErr } = await supabase
        .from('inventory_materials')
        .update({
          current_stock: totalStock,
          average_cost: nextAvgCost,
          last_purchase_price: unitPrice,
          inventory_value: totalStock * nextAvgCost,
          updated_at: now,
        })
        .eq('id', itm.material_id)
        .eq('tenant_id', tenant_id);

      if (matUpdErr) {
        return { data: null, error: reportError('createPurchase', matUpdErr, 'Unable to update material stock.') };
      }

      const { data: lvlRows, error: lvlErr } = await supabase
        .from('inventory_material_stock_levels')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .eq('material_id', itm.material_id)
        .eq('location_id', location_id)
        .limit(1);

      if (lvlErr) {
        return { data: null, error: reportError('createPurchase', lvlErr, 'Unable to update stock levels.') };
      }

      const stockLvl = ((lvlRows ?? []) as InventoryStockLevel[])[0] ?? null;

      if (stockLvl) {
        const { error: lvlUpdErr } = await supabase
          .from('inventory_material_stock_levels')
          .update({
            current_stock: toNumber(stockLvl.current_stock) + purchasedQty,
            available_stock: toNumber(stockLvl.available_stock) + purchasedQty,
            updated_at: now,
          })
          .eq('id', stockLvl.id)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);
        if (lvlUpdErr) {
          return { data: null, error: reportError('createPurchase', lvlUpdErr, 'Unable to update stock levels.') };
        }
      } else {
        const { error: lvlInsErr } = await supabase.from('inventory_material_stock_levels').insert({
          tenant_id,
          branch_id,
          material_id: itm.material_id,
          location_id,
          current_stock: purchasedQty,
          available_stock: purchasedQty,
          reserved_stock: 0,
        });
        if (lvlInsErr) {
          return { data: null, error: reportError('createPurchase', lvlInsErr, 'Unable to update stock levels.') };
        }
      }

      const { error: priceErr } = await supabase.from('inventory_material_vendor_prices').insert({
        tenant_id,
        branch_id,
        material_id: itm.material_id,
        supplier_id: header.supplier_id,
        purchase_price: unitPrice,
        effective_date: now,
      });
      if (priceErr) {
        console.error('[inventory-service] createPurchase (vendor price):', priceErr.code, priceErr.message);
      }

      const { error: ledgerErr } = await supabase.from('inventory_stock_ledger').insert({
        tenant_id,
        branch_id,
        material_id: itm.material_id,
        transaction_date: now,
        transaction_type: 'Purchase',
        reference_type: 'Purchase Invoice',
        reference_id: savedHeader.id,
        qty_in: purchasedQty,
        qty_out: 0,
        balance_stock: totalStock,
        unit_cost: unitPrice,
        total_value: purchasedQty * unitPrice,
        remarks: `Purchased from supplier via PO ${purchaseNum}`,
        created_by: header.created_by,
      });
      if (ledgerErr) {
        return { data: null, error: reportError('createPurchase', ledgerErr, 'Unable to write stock ledger.') };
      }
    }

    return { data: savedHeader, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('createPurchase', err, 'Unable to save purchase.') };
  }
}

// ─── UPDATE PURCHASE PAYMENT STATUS ──────────────────────────────────────────

export async function updatePurchaseStatus(
  purchaseId: string,
  status: 'Completed' | 'Draft'
): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { error } = await supabase
      .from('inventory_purchase_headers')
      .update({ status })
      .eq('id', purchaseId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id);

    if (error) {
      return { data: null, error: reportError('updatePurchaseStatus', error, 'Unable to update purchase status.') };
    }
    await recordAuditLog('purchases', purchaseId, 'UPDATE', null, { status });
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('updatePurchaseStatus', err, 'Unable to update purchase status.') };
  }
}

// ─── 8. STOCK MOVEMENT LEDGER ──────────────────────────────────────────────────

export async function fetchStockLedger(materialId?: string): Promise<ServiceResult<InventoryStockLedger[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase
      .from('inventory_stock_ledger')
      .select(`
        *,
        material:inventory_materials(material_name)
      `)
      .eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);
    if (materialId) query = query.eq('material_id', materialId);

    const { data, error } = await query.order('transaction_date', { ascending: false });
    if (error) {
      return { data: null, error: reportError('fetchStockLedger', error, 'Unable to load stock ledger.') };
    }

    const rows = (data ?? []) as LedgerRow[];
    const formatted: InventoryStockLedger[] = rows.map((l) => {
      const { material, ...rest } = l;
      return { ...rest, material_name: material?.material_name || 'Unknown Material' };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchStockLedger', err, 'Unable to load stock ledger.') };
  }
}

// ─── 9. ADJUSTMENTS ────────────────────────────────────────────────────────────

export async function fetchAdjustments(): Promise<ServiceResult<InventoryAdjustment[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase
      .from('inventory_adjustments')
      .select(`
        *,
        material:inventory_materials(material_name)
      `)
      .eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);

    const { data, error } = await query.order('adjustment_date', { ascending: false });
    if (error) {
      return { data: null, error: reportError('fetchAdjustments', error, 'Unable to load adjustments.') };
    }

    const rows = (data ?? []) as AdjustmentRow[];
    const formatted: InventoryAdjustment[] = rows.map((a) => {
      const { material, ...rest } = a;
      return { ...rest, material_name: material?.material_name || 'Unknown Material' };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchAdjustments', err, 'Unable to load adjustments.') };
  }
}

export async function createAdjustment(
  adjustment: Omit<InventoryAdjustment, 'id' | 'tenant_id' | 'branch_id' | 'created_at'>
): Promise<ServiceResult<InventoryAdjustment>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('inventory_adjustments')
      .insert({ ...adjustment, tenant_id, branch_id, created_at: now })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('createAdjustment', error, 'Unable to save adjustment.') };
    }

    const saved = data as InventoryAdjustment;

    const { data: matRaw, error: matErr } = await supabase
      .from('inventory_materials')
      .select('id, current_stock, average_cost')
      .eq('id', adjustment.material_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (matErr) {
      return { data: null, error: reportError('createAdjustment', matErr, 'Unable to update material stock.') };
    }

    const mat = matRaw as MaterialStockRow | null;
    if (mat) {
      const qtyAdj = toNumber(adjustment.quantity);
      const currentTotal = toNumber(mat.current_stock);
      const isDeduct = adjustment.adjustment_type === 'Deduct';
      const newTotal = isDeduct ? currentTotal - qtyAdj : currentTotal + qtyAdj;
      const avgCost = toNumber(mat.average_cost);

      const { error: matUpdErr } = await supabase
        .from('inventory_materials')
        .update({
          current_stock: newTotal,
          inventory_value: newTotal * avgCost,
          updated_at: now,
        })
        .eq('id', adjustment.material_id)
        .eq('tenant_id', tenant_id);
      if (matUpdErr) {
        return { data: null, error: reportError('createAdjustment', matUpdErr, 'Unable to update material stock.') };
      }

      const { data: lvlRows, error: lvlErr } = await supabase
        .from('inventory_material_stock_levels')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .eq('material_id', adjustment.material_id)
        .eq('location_id', adjustment.location_id)
        .limit(1);
      if (lvlErr) {
        return { data: null, error: reportError('createAdjustment', lvlErr, 'Unable to update stock levels.') };
      }

      const stockLvl = ((lvlRows ?? []) as InventoryStockLevel[])[0] ?? null;
      if (stockLvl) {
        const currentLoc = toNumber(stockLvl.current_stock);
        const newLoc = isDeduct ? currentLoc - qtyAdj : currentLoc + qtyAdj;
        const { error: lvlUpdErr } = await supabase
          .from('inventory_material_stock_levels')
          .update({ current_stock: newLoc, available_stock: newLoc, updated_at: now })
          .eq('id', stockLvl.id)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);
        if (lvlUpdErr) {
          return { data: null, error: reportError('createAdjustment', lvlUpdErr, 'Unable to update stock levels.') };
        }
      }

      const { error: ledgerErr } = await supabase.from('inventory_stock_ledger').insert({
        tenant_id,
        branch_id,
        material_id: adjustment.material_id,
        transaction_date: now,
        transaction_type: 'Adjustment',
        reference_type: 'Stock Adjustment',
        reference_id: saved.id,
        qty_in: isDeduct ? 0 : qtyAdj,
        qty_out: isDeduct ? qtyAdj : 0,
        balance_stock: newTotal,
        unit_cost: avgCost,
        total_value: qtyAdj * avgCost,
        remarks: `Stock Adjustment: ${adjustment.reason}. ${adjustment.remarks || ''}`,
        created_by: adjustment.created_by,
      });
      if (ledgerErr) {
        return { data: null, error: reportError('createAdjustment', ledgerErr, 'Unable to write stock ledger.') };
      }
    }

    return { data: saved, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('createAdjustment', err, 'Unable to save adjustment.') };
  }
}

// ─── 10. WASTAGE REGISTER ───────────────────────────────────────────────────

export async function fetchWastage(): Promise<ServiceResult<InventoryWastage[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase
      .from('inventory_wastage')
      .select(`
        *,
        material:inventory_materials(material_name)
      `)
      .eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);

    const { data, error } = await query.order('recorded_at', { ascending: false });
    if (error) {
      return { data: null, error: reportError('fetchWastage', error, 'Unable to load wastage records.') };
    }

    const rows = (data ?? []) as WastageRow[];
    const formatted: InventoryWastage[] = rows.map((w) => {
      const { material, ...rest } = w;
      return { ...rest, material_name: material?.material_name || 'Unknown Material' };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchWastage', err, 'Unable to load wastage records.') };
  }
}

export async function createWastage(
  record: Omit<InventoryWastage, 'id' | 'tenant_id' | 'branch_id' | 'recorded_at' | 'cost_impact'>
): Promise<ServiceResult<InventoryWastage>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const now = new Date().toISOString();

    const { data: matRaw, error: matErr } = await supabase
      .from('inventory_materials')
      .select('id, current_stock, average_cost')
      .eq('id', record.material_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (matErr) {
      return { data: null, error: reportError('createWastage', matErr, 'Unable to save wastage record.') };
    }

    const matData = matRaw as MaterialStockRow | null;
    const averageCost = matData ? toNumber(matData.average_cost) : 0;
    const qty = toNumber(record.quantity);
    const costImpact = qty * averageCost;

    const { data, error } = await supabase
      .from('inventory_wastage')
      .insert({ ...record, tenant_id, branch_id, cost_impact: costImpact, recorded_at: now })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('createWastage', error, 'Unable to save wastage record.') };
    }

    const saved = data as InventoryWastage;

    if (matData) {
      const currentStock = toNumber(matData.current_stock);
      const newStock = Math.max(0, currentStock - qty);

      const { error: matUpdErr } = await supabase
        .from('inventory_materials')
        .update({
          current_stock: newStock,
          inventory_value: newStock * averageCost,
          updated_at: now,
        })
        .eq('id', record.material_id)
        .eq('tenant_id', tenant_id);
      if (matUpdErr) {
        return { data: null, error: reportError('createWastage', matUpdErr, 'Unable to update material stock.') };
      }

      const { data: lvlRows, error: lvlErr } = await supabase
        .from('inventory_material_stock_levels')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .eq('material_id', record.material_id)
        .eq('location_id', record.location_id)
        .limit(1);
      if (lvlErr) {
        return { data: null, error: reportError('createWastage', lvlErr, 'Unable to update stock levels.') };
      }

      const stockLvl = ((lvlRows ?? []) as InventoryStockLevel[])[0] ?? null;
      if (stockLvl) {
        const newLoc = Math.max(0, toNumber(stockLvl.current_stock) - qty);
        const { error: lvlUpdErr } = await supabase
          .from('inventory_material_stock_levels')
          .update({ current_stock: newLoc, available_stock: newLoc, updated_at: now })
          .eq('id', stockLvl.id)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);
        if (lvlUpdErr) {
          return { data: null, error: reportError('createWastage', lvlUpdErr, 'Unable to update stock levels.') };
        }
      }

      const { error: ledgerErr } = await supabase.from('inventory_stock_ledger').insert({
        tenant_id,
        branch_id,
        material_id: record.material_id,
        transaction_date: now,
        transaction_type: 'Wastage',
        reference_type: 'Wastage Log',
        reference_id: saved.id,
        qty_in: 0,
        qty_out: qty,
        balance_stock: newStock,
        unit_cost: averageCost,
        total_value: costImpact,
        remarks: `Wastage logged: ${record.reason}. Recorded by ${record.recorded_by}`,
        created_by: record.recorded_by,
      });
      if (ledgerErr) {
        return { data: null, error: reportError('createWastage', ledgerErr, 'Unable to write stock ledger.') };
      }
    }

    return { data: saved, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('createWastage', err, 'Unable to save wastage record.') };
  }
}

// ─── 11. AUDIT LOGGING ────────────────────────────────────────────────────────

export async function fetchAuditLogs(): Promise<ServiceResult<InventoryAuditLog[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase.from('inventory_audit_logs').select('*').eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) {
      return { data: null, error: reportError('fetchAuditLogs', error, 'Unable to load audit logs.') };
    }
    return { data: (data ?? []) as InventoryAuditLog[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchAuditLogs', err, 'Unable to load audit logs.') };
  }
}

function toPlainJson(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return null;
  }
}

export async function recordAuditLog(
  module: InventoryAuditModule,
  recordId: string,
  action: InventoryAuditAction,
  oldVal: unknown,
  newVal: unknown
): Promise<void> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { error } = await supabase.from('inventory_audit_logs').insert({
      tenant_id,
      branch_id,
      module_name: module,
      record_id: recordId,
      action_type: action,
      old_value: toPlainJson(oldVal),
      new_value: toPlainJson(newVal),
      performed_by: 'Owner Staff',
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[inventory-service] recordAuditLog:', error.code, error.message);
    }
  } catch (err: unknown) {
    const { code, message } = describeError(err);
    console.error('[inventory-service] recordAuditLog:', code || 'UNKNOWN', message);
  }
}

// ─── 12. ALERTS ──────────────────────────────────────────────────────────────

export async function fetchAlerts(): Promise<ServiceResult<InventoryAlert[]>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase
      .from('inventory_alerts')
      .select(`
        *,
        material:inventory_materials(material_name)
      `)
      .eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return { data: null, error: reportError('fetchAlerts', error, 'Unable to load alerts.') };
    }

    const rows = (data ?? []) as AlertRow[];
    const formatted: InventoryAlert[] = rows.map((a) => {
      const { material, ...rest } = a;
      return { ...rest, material_name: material?.material_name || 'Unknown Material' };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchAlerts', err, 'Unable to load alerts.') };
  }
}

export async function markAlertRead(id: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
    let query = supabase.from('inventory_alerts').update({ is_read: true }).eq('id', id).eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);

    const { error } = await query;
    if (error) {
      return { data: false, error: reportError('markAlertRead', error, 'Unable to update alert.') };
    }
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('markAlertRead', err, 'Unable to update alert.') };
  }
}

// ─── 13. DASHBOARD KPIS & VALUATIONS ──────────────────────────────────────────

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function fetchInventoryDashboardKPIs(): Promise<ServiceResult<DashboardKPIs>> {
  try {
    const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();

    const materialsRes = await fetchMaterials();
    if (materialsRes.error || !materialsRes.data) {
      return { data: null, error: materialsRes.error || 'Unable to compile inventory KPIs.' };
    }
    const tenantMaterials = materialsRes.data;

    const { count: supplierCount, error: supErr } = await supabase
      .from('inventory_suppliers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .eq('is_active', true);
    if (supErr) {
      return { data: null, error: reportError('fetchInventoryDashboardKPIs', supErr, 'Unable to compile inventory KPIs.') };
    }

    const now = new Date();
    const currentMonthStr = monthKey(now);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = monthKey(prevMonthStart);

    let purchaseQuery = supabase
      .from('inventory_purchase_headers')
      .select('purchase_date, grand_total')
      .eq('tenant_id', tenant_id)
      .eq('status', 'Completed')
      .gte('purchase_date', prevMonthStart.toISOString());
    if (!isOwnerOrAdmin) purchaseQuery = purchaseQuery.eq('branch_id', branch_id);

    const { data: purchaseData, error: purErr } = await purchaseQuery;
    if (purErr) {
      return { data: null, error: reportError('fetchInventoryDashboardKPIs', purErr, 'Unable to compile inventory KPIs.') };
    }

    let itemQuery = supabase
      .from('inventory_purchase_items')
      .select('material_id, quantity, line_total')
      .eq('tenant_id', tenant_id);
    if (!isOwnerOrAdmin) itemQuery = itemQuery.eq('branch_id', branch_id);

    const { data: itemData, error: itemErr } = await itemQuery;
    if (itemErr) {
      return { data: null, error: reportError('fetchInventoryDashboardKPIs', itemErr, 'Unable to compile inventory KPIs.') };
    }

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let wastageQuery = supabase
      .from('inventory_wastage')
      .select('cost_impact')
      .eq('tenant_id', tenant_id)
      .gte('recorded_at', currentMonthStart.toISOString());
    if (!isOwnerOrAdmin) wastageQuery = wastageQuery.eq('branch_id', branch_id);

    const { data: wastageData, error: wasErr } = await wastageQuery;
    if (wasErr) {
      return { data: null, error: reportError('fetchInventoryDashboardKPIs', wasErr, 'Unable to compile inventory KPIs.') };
    }

    // 1. Valuation + stock health
    let inventoryValuation = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    for (const mat of tenantMaterials) {
      const stock = toNumber(mat.current_stock);
      const cost = toNumber(mat.average_cost);
      // Stock goes below zero when sales consume a material nobody has
      // recorded buying. The shelf still holds nothing, so it is worth
      // nothing and counts as out of stock; it must not pull the total down.
      inventoryValuation += Math.max(0, stock) * cost;
      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= toNumber(mat.reorder_level)) {
        lowStockCount++;
      }
    }

    // 2. Purchases month-over-month
    let monthlyPurchasesThisMonth = 0;
    let monthlyPurchasesPrevMonth = 0;
    for (const p of (purchaseData ?? []) as KpiPurchaseRow[]) {
      const date = String(p.purchase_date || '');
      if (date.startsWith(currentMonthStr)) {
        monthlyPurchasesThisMonth += toNumber(p.grand_total);
      } else if (date.startsWith(prevMonthStr)) {
        monthlyPurchasesPrevMonth += toNumber(p.grand_total);
      }
    }
    const purchaseCostTrendPercentage =
      monthlyPurchasesPrevMonth > 0
        ? ((monthlyPurchasesThisMonth - monthlyPurchasesPrevMonth) / monthlyPurchasesPrevMonth) * 100
        : 0;

    // 3. Wastage cost impact this month
    let wastageCostImpactThisMonth = 0;
    for (const w of (wastageData ?? []) as KpiWastageRow[]) {
      wastageCostImpactThisMonth += toNumber(w.cost_impact);
    }

    // 4. Inventory turnover ratio (indicative: estimated COGS vs valuation)
    const estimatedCOGS = monthlyPurchasesThisMonth * 0.78;
    const averageValuation = inventoryValuation > 0 ? inventoryValuation : 10000;
    const inventoryTurnoverRatio = Number((estimatedCOGS / averageValuation).toFixed(2));

    // 5. Top purchased materials
    const materialSpends: Record<string, { name: string; qty: number; spend: number }> = {};
    for (const item of (itemData ?? []) as KpiPurchaseItemRow[]) {
      const mat = tenantMaterials.find((m) => m.id === item.material_id);
      if (!mat) continue;
      if (!materialSpends[item.material_id]) {
        materialSpends[item.material_id] = { name: mat.material_name, qty: 0, spend: 0 };
      }
      materialSpends[item.material_id].qty += toNumber(item.quantity);
      materialSpends[item.material_id].spend += toNumber(item.line_total);
    }

    const topPurchasedMaterials = Object.entries(materialSpends)
      .map(([material_id, val]) => ({
        material_id,
        material_name: val.name,
        quantity: val.qty,
        total_spend: val.spend,
      }))
      .sort((a, b) => b.total_spend - a.total_spend)
      .slice(0, 5);

    const kpis: DashboardKPIs = {
      totalMaterials: tenantMaterials.length,
      outOfStockCount,
      lowStockCount,
      activeSuppliersCount: supplierCount ?? 0,
      monthlyPurchasesThisMonth,
      monthlyPurchasesPrevMonth,
      purchaseCostTrendPercentage,
      inventoryValuation,
      inventoryTurnoverRatio,
      wastageCostImpactThisMonth,
      topPurchasedMaterials,
    };

    return { data: kpis, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchInventoryDashboardKPIs', err, 'Unable to compile inventory KPIs.') };
  }
}

// ─── 14. CENTRAL KITCHEN & TRANSFERS ─────────────────────────────────────────

export async function fetchBranches(): Promise<ServiceResult<Branch[]>> {
  try {
    const { tenant_id } = getTenantContext();
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('name', { ascending: true });

    if (error) {
      return { data: null, error: reportError('fetchBranches', error, 'Unable to load branches.') };
    }
    return { data: (data ?? []) as Branch[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchBranches', err, 'Unable to load branches.') };
  }
}

async function fetchBranchNameMap(tenantId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('branches').select('id, name').eq('tenant_id', tenantId);
  if (error) {
    console.error('[inventory-service] fetchBranchNameMap:', error.code, error.message);
    return new Map();
  }
  return new Map(((data ?? []) as BranchNameRow[]).map((b) => [b.id, b.name || 'Unknown Branch']));
}

function mapTransferRequestItem(
  itm: TransferRequestItemRow,
  tenantId: string,
  branchId: string
): InventoryTransferRequestItem {
  return {
    id: itm.id,
    tenant_id: tenantId,
    branch_id: branchId,
    transfer_request_id: itm.request_id,
    material_id: itm.material_id,
    requested_quantity: toNumber(itm.requested_qty),
    approved_quantity: itm.approved_qty !== null && itm.approved_qty !== undefined ? toNumber(itm.approved_qty) : null,
    received_quantity: itm.received_qty !== null && itm.received_qty !== undefined ? toNumber(itm.received_qty) : null,
    created_at: itm.created_at || new Date().toISOString(),
    material_name: itm.material?.material_name || 'Unknown Material',
    unit_short_name: itm.material?.unit?.short_name || 'units',
  };
}

export async function fetchTransferRequests(branchId?: string): Promise<ServiceResult<InventoryTransferRequest[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const activeBranchId = branchId || branch_id;

    const { data, error } = await supabase
      .from('inventory_transfer_requests')
      .select(`
        *,
        items:inventory_transfer_request_items(
          *,
          material:inventory_materials(material_name, unit:inventory_units!inventory_unit_id(short_name))
        )
      `)
      .eq('tenant_id', tenant_id)
      .or(`supplying_branch_id.eq.${activeBranchId},requesting_branch_id.eq.${activeBranchId}`)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: reportError('fetchTransferRequests', error, 'Unable to load transfer requests.') };
    }

    const branchMap = await fetchBranchNameMap(tenant_id);
    const rows = (data ?? []) as TransferRequestWithItemsRow[];

    const formatted: InventoryTransferRequest[] = rows.map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      branch_id: r.requesting_branch_id,
      request_number: r.request_number,
      from_branch_id: r.supplying_branch_id,
      to_branch_id: r.requesting_branch_id,
      request_date: r.created_at,
      status: r.status,
      remarks: r.notes,
      created_by: 'System User',
      approved_by: r.approved_by,
      approved_at: r.approved_at,
      rejected_by: r.rejected_by,
      rejected_at: r.rejected_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      from_branch_name: branchMap.get(r.supplying_branch_id) || 'Unknown Branch',
      to_branch_name: branchMap.get(r.requesting_branch_id) || 'Unknown Branch',
      items: (r.items ?? []).map((itm) => mapTransferRequestItem(itm, r.tenant_id, r.requesting_branch_id)),
    }));

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchTransferRequests', err, 'Unable to load transfer requests.') };
  }
}

export async function fetchTransferRequestItems(requestId: string): Promise<ServiceResult<InventoryTransferRequestItem[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    // inventory_transfer_request_items has no tenant columns; RLS scopes it via its parent request.
    const { data, error } = await supabase
      .from('inventory_transfer_request_items')
      .select(`
        *,
        material:inventory_materials(material_name, unit:inventory_units!inventory_unit_id(short_name))
      `)
      .eq('request_id', requestId);

    if (error) {
      return { data: null, error: reportError('fetchTransferRequestItems', error, 'Unable to load transfer request items.') };
    }

    const rows = (data ?? []) as TransferRequestItemRow[];
    return { data: rows.map((itm) => mapTransferRequestItem(itm, tenant_id, branch_id)), error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchTransferRequestItems', err, 'Unable to load transfer request items.') };
  }
}

export async function createTransferRequest(
  fromBranchId: string,
  toBranchId: string,
  items: { material_id: string; requested_quantity: number }[],
  remarks?: string
): Promise<ServiceResult<InventoryTransferRequest>> {
  try {
    const { tenant_id } = getTenantContext();
    const now = new Date().toISOString();
    const requestId = uuidv4();
    const createdBy = 'Owner Staff';

    const { data: headerRaw, error: headerErr } = await supabase
      .from('inventory_transfer_requests')
      .insert({
        id: requestId,
        tenant_id,
        requesting_branch_id: toBranchId,
        supplying_branch_id: fromBranchId,
        request_number: `TRF-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
        status: 'Pending',
        notes: remarks || null,
        updated_at: now,
      })
      .select('*')
      .single();

    if (headerErr) {
      return { data: null, error: reportError('createTransferRequest', headerErr, 'Unable to create transfer request.') };
    }

    const headerData = headerRaw as TransferRequestRow;

    const itemsPayload = items.map((itm) => ({
      request_id: headerData.id,
      material_id: itm.material_id,
      requested_qty: itm.requested_quantity,
      approved_qty: null,
      received_qty: null,
    }));

    const { error: itemsErr } = await supabase.from('inventory_transfer_request_items').insert(itemsPayload);
    if (itemsErr) {
      return { data: null, error: reportError('createTransferRequest', itemsErr, 'Unable to save transfer request items.') };
    }

    const { error: eventErr } = await supabase.from('inventory_transfer_events').insert({
      tenant_id,
      branch_id: toBranchId,
      transfer_request_id: headerData.id,
      event_type: 'Created',
      performed_by: createdBy,
      notes: 'Transfer request raised.',
    });
    if (eventErr) {
      console.error('[inventory-service] createTransferRequest (event):', eventErr.code, eventErr.message);
    }

    const returnedRequest: InventoryTransferRequest = {
      id: headerData.id,
      tenant_id: headerData.tenant_id,
      branch_id: headerData.requesting_branch_id,
      request_number: headerData.request_number,
      from_branch_id: headerData.supplying_branch_id,
      to_branch_id: headerData.requesting_branch_id,
      request_date: headerData.created_at,
      status: headerData.status,
      remarks: headerData.notes,
      created_by: createdBy,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      created_at: headerData.created_at,
      updated_at: headerData.updated_at,
    };

    return { data: returnedRequest, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('createTransferRequest', err, 'Unable to create transfer request.') };
  }
}

export async function approveTransferRequest(
  requestId: string,
  items: { material_id: string; approved_quantity: number }[],
  approvedBy: string
): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id } = getTenantContext();
    const now = new Date().toISOString();
    const approvedByUuid = isUuid(approvedBy) ? approvedBy : tenant_id;

    const { data: reqRaw, error: reqErr } = await supabase
      .from('inventory_transfer_requests')
      .update({
        status: 'Approved',
        approved_by: approvedByUuid,
        approved_at: now,
        updated_at: now,
      })
      .eq('id', requestId)
      .eq('tenant_id', tenant_id)
      .select('*')
      .single();

    if (reqErr) {
      return { data: false, error: reportError('approveTransferRequest', reqErr, 'Unable to approve transfer request.') };
    }

    const reqData = reqRaw as TransferRequestRow;
    const supplyingBranchId = reqData.supplying_branch_id;

    for (const itm of items) {
      const { error: itemErr } = await supabase
        .from('inventory_transfer_request_items')
        .update({ approved_qty: itm.approved_quantity })
        .eq('request_id', requestId)
        .eq('material_id', itm.material_id);
      if (itemErr) {
        return { data: false, error: reportError('approveTransferRequest', itemErr, 'Unable to approve transfer request.') };
      }

      const { data: lvlRows, error: lvlErr } = await supabase
        .from('inventory_material_stock_levels')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('branch_id', supplyingBranchId)
        .eq('material_id', itm.material_id)
        .limit(1);
      if (lvlErr) {
        return { data: false, error: reportError('approveTransferRequest', lvlErr, 'Unable to reserve stock.') };
      }

      const activeLvl = ((lvlRows ?? []) as InventoryStockLevel[])[0] ?? null;

      if (activeLvl) {
        const newReserved = toNumber(activeLvl.reserved_stock) + itm.approved_quantity;
        const current = toNumber(activeLvl.current_stock);
        const { error: updErr } = await supabase
          .from('inventory_material_stock_levels')
          .update({ reserved_stock: newReserved, available_stock: current - newReserved, updated_at: now })
          .eq('id', activeLvl.id)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', supplyingBranchId);
        if (updErr) {
          return { data: false, error: reportError('approveTransferRequest', updErr, 'Unable to reserve stock.') };
        }
      } else {
        const { error: insErr } = await supabase.from('inventory_material_stock_levels').insert({
          tenant_id,
          branch_id: supplyingBranchId,
          material_id: itm.material_id,
          location_id: 'Main Storage',
          current_stock: 0,
          reserved_stock: itm.approved_quantity,
          available_stock: -itm.approved_quantity,
        });
        if (insErr) {
          return { data: false, error: reportError('approveTransferRequest', insErr, 'Unable to reserve stock.') };
        }
      }
    }

    const { error: eventErr } = await supabase.from('inventory_transfer_events').insert({
      tenant_id,
      branch_id: supplyingBranchId,
      transfer_request_id: requestId,
      event_type: 'Approved',
      performed_by: approvedBy,
      notes: 'Transfer request approved.',
    });
    if (eventErr) {
      console.error('[inventory-service] approveTransferRequest (event):', eventErr.code, eventErr.message);
    }

    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('approveTransferRequest', err, 'Unable to approve transfer request.') };
  }
}

export async function rejectTransferRequest(
  requestId: string,
  rejectedBy: string,
  reason?: string
): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id } = getTenantContext();
    const now = new Date().toISOString();
    const rejectedByUuid = isUuid(rejectedBy) ? rejectedBy : tenant_id;

    const { data: reqRaw, error: fetchErr } = await supabase
      .from('inventory_transfer_requests')
      .select('supplying_branch_id')
      .eq('id', requestId)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (fetchErr) {
      return { data: false, error: reportError('rejectTransferRequest', fetchErr, 'Unable to reject transfer request.') };
    }
    const reqData = reqRaw as Pick<TransferRequestRow, 'supplying_branch_id'> | null;
    if (!reqData) {
      return { data: false, error: 'Transfer request not found.' };
    }

    const { error } = await supabase
      .from('inventory_transfer_requests')
      .update({ status: 'Rejected', rejected_by: rejectedByUuid, rejected_at: now, updated_at: now })
      .eq('id', requestId)
      .eq('tenant_id', tenant_id);

    if (error) {
      return { data: false, error: reportError('rejectTransferRequest', error, 'Unable to reject transfer request.') };
    }

    const { error: eventErr } = await supabase.from('inventory_transfer_events').insert({
      tenant_id,
      branch_id: reqData.supplying_branch_id,
      transfer_request_id: requestId,
      event_type: 'Rejected',
      performed_by: rejectedBy,
      notes: reason || 'Transfer request rejected.',
    });
    if (eventErr) {
      console.error('[inventory-service] rejectTransferRequest (event):', eventErr.code, eventErr.message);
    }

    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('rejectTransferRequest', err, 'Unable to reject transfer request.') };
  }
}

/**
 * Ships goods from the supplying branch. Runs atomically in the `create_dispatch`
 * RPC: stock is refused (not clamped) when insufficient.
 */
export async function createDispatch(
  requestId: string,
  items: { material_id: string; dispatched_quantity: number }[],
  remarks?: string,
  createdBy?: string
): Promise<ServiceResult<InventoryDispatch>> {
  try {
    const { tenant_id } = getTenantContext();
    const author = createdBy || 'Owner Staff';

    const { data, error } = await supabase.rpc('create_dispatch', {
      p_tenant_id: tenant_id,
      p_request_id: requestId,
      p_items: items.map((itm) => ({
        material_id: itm.material_id,
        dispatched_quantity: itm.dispatched_quantity,
      })),
      p_remarks: remarks ?? null,
      p_created_by: author,
    });

    if (error) {
      return { data: null, error: mapTransferRpcError('createDispatch', error) };
    }

    const result = data as CreateDispatchRpcResult | null;
    if (!result || !result.dispatch) {
      console.error('[inventory-service] createDispatch:', 'EMPTY_RESULT', 'RPC returned no dispatch');
      return { data: null, error: 'Unable to complete the transfer. Please try again.' };
    }

    const disp = result.dispatch;
    const returnedDispatch: InventoryDispatch = {
      id: disp.id,
      tenant_id,
      branch_id: result.from_branch_id,
      dispatch_number: disp.dispatch_number,
      transfer_request_id: requestId,
      from_branch_id: result.from_branch_id,
      to_branch_id: result.to_branch_id,
      dispatch_date: disp.dispatched_at,
      status: disp.status,
      remarks: remarks || null,
      created_by: author,
      created_at: disp.dispatched_at,
      updated_at: disp.dispatched_at,
      transfer_request_number: result.request_number,
    };

    return { data: returnedDispatch, error: null };
  } catch (err: unknown) {
    return { data: null, error: mapTransferRpcError('createDispatch', err) };
  }
}

/**
 * Books goods in at the requesting branch. Runs atomically in the `receive_dispatch`
 * RPC and is idempotent: a second submit is reported as success without writing.
 */
export async function receiveDispatch(
  dispatchId: string,
  items: { id: string; material_id: string; received_quantity: number; dispatched_quantity: number }[],
  remarks?: string,
  receivedBy?: string
): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id } = getTenantContext();
    const author = receivedBy || 'Owner Staff';

    const { data, error } = await supabase.rpc('receive_dispatch', {
      p_tenant_id: tenant_id,
      p_dispatch_id: dispatchId,
      p_items: items.map((itm) => ({
        id: itm.id,
        material_id: itm.material_id,
        received_quantity: itm.received_quantity,
        dispatched_quantity: itm.dispatched_quantity,
      })),
      p_remarks: remarks ?? null,
      p_received_by: author,
    });

    if (error) {
      return { data: false, error: mapTransferRpcError('receiveDispatch', error) };
    }

    const result = data as ReceiveDispatchRpcResult | null;
    if (result?.already_received) {
      return { data: true, error: null };
    }
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: mapTransferRpcError('receiveDispatch', err) };
  }
}

export async function fetchDispatches(branchId?: string): Promise<ServiceResult<InventoryDispatch[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const activeBranchId = branchId || branch_id;

    // inventory_dispatches has no tenant columns; scope through the parent request.
    const { data, error } = await supabase
      .from('inventory_dispatches')
      .select(`
        *,
        request:inventory_transfer_requests!inner(*),
        items:inventory_dispatch_items(
          *,
          material:inventory_materials(material_name, unit:inventory_units!inventory_unit_id(short_name))
        )
      `)
      .eq('request.tenant_id', tenant_id)
      .or(`supplying_branch_id.eq.${activeBranchId},requesting_branch_id.eq.${activeBranchId}`, {
        referencedTable: 'request',
      })
      .order('dispatched_at', { ascending: false });

    if (error) {
      return { data: null, error: reportError('fetchDispatches', error, 'Unable to load dispatches.') };
    }

    const rows = ((data ?? []) as DispatchWithRequestRow[]).filter((d) => {
      const req = d.request;
      if (!req || req.tenant_id !== tenant_id) return false;
      return req.requesting_branch_id === activeBranchId || req.supplying_branch_id === activeBranchId;
    });

    const branchMap = await fetchBranchNameMap(tenant_id);

    const formatted: InventoryDispatch[] = [];
    for (const d of rows) {
      const req = d.request;
      if (!req) continue;
      formatted.push({
        id: d.id,
        tenant_id,
        branch_id: req.supplying_branch_id,
        dispatch_number: d.dispatch_number,
        transfer_request_id: d.request_id,
        from_branch_id: req.supplying_branch_id,
        to_branch_id: req.requesting_branch_id,
        dispatch_date: d.dispatched_at,
        status: d.status,
        remarks: req.notes,
        created_by: 'System User',
        created_at: d.dispatched_at,
        updated_at: d.dispatched_at,
        from_branch_name: branchMap.get(req.supplying_branch_id) || 'Unknown Branch',
        to_branch_name: branchMap.get(req.requesting_branch_id) || 'Unknown Branch',
        transfer_request_number: req.request_number,
        items: (d.items ?? []).map((itm) => ({
          id: itm.id,
          tenant_id,
          branch_id: req.supplying_branch_id,
          dispatch_id: itm.dispatch_id,
          material_id: itm.material_id,
          dispatched_quantity: toNumber(itm.quantity),
          received_quantity:
            itm.received_quantity !== null && itm.received_quantity !== undefined ? toNumber(itm.received_quantity) : null,
          created_at: itm.created_at || d.dispatched_at,
          material_name: itm.material?.material_name || 'Unknown Material',
          unit_short_name: itm.material?.unit?.short_name || 'units',
        })),
      });
    }

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchDispatches', err, 'Unable to load dispatches.') };
  }
}

export async function fetchDispatchItems(dispatchId: string): Promise<ServiceResult<InventoryDispatchItem[]>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    // inventory_dispatch_items has no tenant columns; RLS scopes it via its parent dispatch/request.
    const { data, error } = await supabase
      .from('inventory_dispatch_items')
      .select(`
        *,
        material:inventory_materials(material_name, unit:inventory_units!inventory_unit_id(short_name))
      `)
      .eq('dispatch_id', dispatchId);

    if (error) {
      return { data: null, error: reportError('fetchDispatchItems', error, 'Unable to load dispatch items.') };
    }

    const { data: dispRaw, error: dispErr } = await supabase
      .from('inventory_dispatches')
      .select('request_id')
      .eq('id', dispatchId)
      .maybeSingle();
    if (dispErr) {
      return { data: null, error: reportError('fetchDispatchItems', dispErr, 'Unable to load dispatch items.') };
    }
    const dispData = dispRaw as Pick<DispatchRow, 'request_id'> | null;

    let reqItemsMap = new Map<string, number | null>();
    if (dispData?.request_id) {
      const { data: reqItemsRaw, error: reqItemsErr } = await supabase
        .from('inventory_transfer_request_items')
        .select('material_id, received_qty')
        .eq('request_id', dispData.request_id);
      if (reqItemsErr) {
        console.error('[inventory-service] fetchDispatchItems (request items):', reqItemsErr.code, reqItemsErr.message);
      }
      const reqItems = (reqItemsRaw ?? []) as Pick<TransferRequestItemRow, 'material_id' | 'received_qty'>[];
      reqItemsMap = new Map(reqItems.map((ri) => [ri.material_id, ri.received_qty]));
    }

    const rows = (data ?? []) as DispatchItemRow[];
    const formatted: InventoryDispatchItem[] = rows.map((itm) => {
      const received = reqItemsMap.get(itm.material_id);
      return {
        id: itm.id,
        tenant_id,
        branch_id,
        dispatch_id: itm.dispatch_id,
        material_id: itm.material_id,
        dispatched_quantity: toNumber(itm.quantity),
        received_quantity: received !== undefined && received !== null ? toNumber(received) : null,
        created_at: itm.created_at || new Date().toISOString(),
        material_name: itm.material?.material_name || 'Unknown Material',
        unit_short_name: itm.material?.unit?.short_name || 'units',
      };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchDispatchItems', err, 'Unable to load dispatch items.') };
  }
}

export async function fetchTransferEvents(requestId: string): Promise<ServiceResult<InventoryTransferEvent[]>> {
  try {
    const { tenant_id } = getTenantContext();
    // Events for a request span both branches, so only the tenant filter applies.
    const { data, error } = await supabase
      .from('inventory_transfer_events')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('transfer_request_id', requestId)
      .order('created_at', { ascending: true });

    if (error) {
      return { data: null, error: reportError('fetchTransferEvents', error, 'Unable to load transfer events.') };
    }
    return { data: (data ?? []) as InventoryTransferEvent[], error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchTransferEvents', err, 'Unable to load transfer events.') };
  }
}

export async function cancelTransferRequest(
  requestId: string,
  cancelledBy: string,
  reason?: string
): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id } = getTenantContext();
    const now = new Date().toISOString();

    const { data: reqRaw, error: fetchErr } = await supabase
      .from('inventory_transfer_requests')
      .select('*')
      .eq('id', requestId)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (fetchErr) {
      return { data: false, error: reportError('cancelTransferRequest', fetchErr, 'Unable to cancel transfer request.') };
    }
    const req = reqRaw as TransferRequestRow | null;
    if (!req) {
      return { data: false, error: 'Transfer request not found.' };
    }

    const { data: reqItemsRaw, error: reqItemsErr } = await supabase
      .from('inventory_transfer_request_items')
      .select('*')
      .eq('request_id', requestId);
    if (reqItemsErr) {
      return { data: false, error: reportError('cancelTransferRequest', reqItemsErr, 'Unable to cancel transfer request.') };
    }
    const reqItems = (reqItemsRaw ?? []) as TransferRequestItemRow[];

    const supplyingBranchId = req.supplying_branch_id;

    const { error: updateErr } = await supabase
      .from('inventory_transfer_requests')
      .update({ status: 'Cancelled', updated_at: now })
      .eq('id', requestId)
      .eq('tenant_id', tenant_id);

    if (updateErr) {
      return { data: false, error: reportError('cancelTransferRequest', updateErr, 'Unable to cancel transfer request.') };
    }

    if (req.status === 'Approved' || req.status === 'Partially Dispatched') {
      const { data: dispRaw, error: dispErr } = await supabase
        .from('inventory_dispatches')
        .select('id')
        .eq('request_id', requestId);
      if (dispErr) {
        console.error('[inventory-service] cancelTransferRequest (dispatches):', dispErr.code, dispErr.message);
      }

      const dispatchIds = ((dispRaw ?? []) as IdRow[]).map((d) => d.id);
      let dispItems: DispatchItemRow[] = [];
      if (dispatchIds.length > 0) {
        const { data: dispItemsRaw, error: dispItemsErr } = await supabase
          .from('inventory_dispatch_items')
          .select('*')
          .in('dispatch_id', dispatchIds);
        if (dispItemsErr) {
          console.error('[inventory-service] cancelTransferRequest (dispatch items):', dispItemsErr.code, dispItemsErr.message);
        }
        dispItems = (dispItemsRaw ?? []) as DispatchItemRow[];
      }

      for (const ri of reqItems) {
        const approved = toNumber(ri.approved_qty);
        const totalDispatched = dispItems
          .filter((di) => di.material_id === ri.material_id)
          .reduce((sum, di) => sum + toNumber(di.quantity), 0);
        const remainingReserved = Math.max(0, approved - totalDispatched);

        if (remainingReserved > 0) {
          const { data: lvlRows, error: lvlErr } = await supabase
            .from('inventory_material_stock_levels')
            .select('*')
            .eq('tenant_id', tenant_id)
            .eq('branch_id', supplyingBranchId)
            .eq('material_id', ri.material_id)
            .limit(1);
          if (lvlErr) {
            console.error('[inventory-service] cancelTransferRequest (stock levels):', lvlErr.code, lvlErr.message);
            continue;
          }

          const activeLvl = ((lvlRows ?? []) as InventoryStockLevel[])[0] ?? null;
          if (activeLvl) {
            const nextReserved = Math.max(0, toNumber(activeLvl.reserved_stock) - remainingReserved);
            const { error: updErr } = await supabase
              .from('inventory_material_stock_levels')
              .update({
                reserved_stock: nextReserved,
                available_stock: toNumber(activeLvl.current_stock) - nextReserved,
                updated_at: now,
              })
              .eq('id', activeLvl.id)
              .eq('tenant_id', tenant_id)
              .eq('branch_id', supplyingBranchId);
            if (updErr) {
              console.error('[inventory-service] cancelTransferRequest (release stock):', updErr.code, updErr.message);
            }
          }
        }
      }
    }

    const { error: eventErr } = await supabase.from('inventory_transfer_events').insert({
      tenant_id,
      branch_id: supplyingBranchId,
      transfer_request_id: requestId,
      event_type: 'Cancelled',
      performed_by: cancelledBy,
      notes: reason || 'Transfer request cancelled.',
    });
    if (eventErr) {
      console.error('[inventory-service] cancelTransferRequest (event):', eventErr.code, eventErr.message);
    }

    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('cancelTransferRequest', err, 'Unable to cancel transfer request.') };
  }
}

// ─── 15. RECIPES ─────────────────────────────────────────────────────────────

function mapRecipeRow(r: RecipeRow, fallbackNow?: string): InventoryRecipe {
  const now = fallbackNow || new Date().toISOString();
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    branch_id: '',
    name: r.recipe_name || 'Unnamed Recipe',
    description: null,
    yield_quantity: toNumber(r.yield_quantity) || 1,
    yield_unit: r.yield_unit || 'portion',
    cost_snapshot: toNumber(r.cost_snapshot),
    version_no: toNumber(r.version_no) || 1,
    effective_from: r.effective_from || r.created_at || now,
    is_active: r.is_active,
    created_at: r.created_at || now,
    updated_at: r.updated_at || now,
    recipe_code: r.recipe_code || '',
    recipe_name: r.recipe_name || 'Unnamed Recipe',
    menu_item_id: r.menu_item_id || null,
  };
}

export async function fetchRecipes(): Promise<ServiceResult<InventoryRecipe[]>> {
  try {
    const { tenant_id } = getTenantContext();
    // inventory_recipes is tenant-scoped only (no branch_id column).
    const { data, error } = await supabase
      .from('inventory_recipes')
      .select(`
        id,
        tenant_id,
        recipe_code,
        recipe_name,
        menu_item_id,
        is_active,
        created_at,
        updated_at,
        yield_quantity,
        yield_unit,
        cost_snapshot
      `)
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('recipe_name', { ascending: true });

    if (error) {
      return { data: null, error: reportError('fetchRecipes', error, 'Unable to load recipes.') };
    }

    const rows = (data ?? []) as RecipeRow[];
    return { data: rows.map((r) => mapRecipeRow(r)), error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchRecipes', err, 'Unable to load recipes.') };
  }
}

export async function fetchRecipeItems(recipeId: string): Promise<ServiceResult<InventoryRecipeItem[]>> {
  try {
    // inventory_recipe_items has no tenant columns; RLS scopes it via its parent recipe.
    const { data, error } = await supabase
      .from('inventory_recipe_items')
      .select(`
        *,
        material:inventory_materials(material_name)
      `)
      .eq('recipe_id', recipeId);

    if (error) {
      return { data: null, error: reportError('fetchRecipeItems', error, 'Unable to load recipe items.') };
    }

    const rows = (data ?? []) as RecipeItemRow[];
    const formatted: InventoryRecipeItem[] = rows.map((itm) => {
      const { material, ...rest } = itm;
      return { ...rest, material_name: material?.material_name || 'Unknown Material' };
    });

    return { data: formatted, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchRecipeItems', err, 'Unable to load recipe items.') };
  }
}

export async function saveRecipe(
  recipe: Partial<InventoryRecipe>,
  items: { material_id: string; quantity: number }[]
): Promise<ServiceResult<InventoryRecipe>> {
  try {
    const { tenant_id } = getTenantContext();
    const now = new Date().toISOString();

    const recipePayload = {
      tenant_id,
      recipe_code: recipe.recipe_code || '',
      recipe_name: recipe.recipe_name || recipe.name || 'Unnamed Recipe',
      menu_item_id: recipe.menu_item_id || null,
      is_active: recipe.is_active !== false,
      yield_quantity: toNumber(recipe.yield_quantity) || 1,
      yield_unit: recipe.yield_unit || 'portion',
      cost_snapshot: toNumber(recipe.cost_snapshot),
      updated_at: now,
    };

    const { data: savedRaw, error: recipeErr } = await supabase
      .from('inventory_recipes')
      .upsert({ id: recipe.id || undefined, ...recipePayload })
      .select('*')
      .single();

    if (recipeErr) {
      return { data: null, error: reportError('saveRecipe', recipeErr, 'Unable to save recipe.') };
    }

    const savedRecipe = savedRaw as RecipeRow;

    const { error: delErr } = await supabase.from('inventory_recipe_items').delete().eq('recipe_id', savedRecipe.id);
    if (delErr) {
      return { data: null, error: reportError('saveRecipe', delErr, 'Unable to save recipe items.') };
    }

    if (items.length > 0) {
      const itemsPayload = items.map((itm) => ({
        recipe_id: savedRecipe.id,
        material_id: itm.material_id,
        quantity: itm.quantity,
      }));

      const { error: itemsErr } = await supabase.from('inventory_recipe_items').insert(itemsPayload);
      if (itemsErr) {
        return { data: null, error: reportError('saveRecipe', itemsErr, 'Unable to save recipe items.') };
      }
    }

    return { data: mapRecipeRow(savedRecipe, now), error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('saveRecipe', err, 'Unable to save recipe.') };
  }
}

export async function deleteRecipe(id: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id } = getTenantContext();
    const { error } = await supabase
      .from('inventory_recipes')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', tenant_id);

    if (error) {
      return { data: false, error: reportError('deleteRecipe', error, 'Unable to delete recipe.') };
    }
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('deleteRecipe', err, 'Unable to delete recipe.') };
  }
}

// ─── 16. INVENTORY TRACKING SETTING ──────────────────────────────────────────

export async function fetchInventoryTrackingEnabled(): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const { data, error } = await supabase
      .from('pos_settings')
      .select('inventory_tracking_enabled')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { data: null, error: reportError('fetchInventoryTrackingEnabled', error, 'Unable to load inventory tracking setting.') };
    }

    const row = data as { inventory_tracking_enabled: boolean | null } | null;
    if (!row || row.inventory_tracking_enabled === null || row.inventory_tracking_enabled === undefined) {
      return { data: true, error: null };
    }
    return { data: row.inventory_tracking_enabled === true, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchInventoryTrackingEnabled', err, 'Unable to load inventory tracking setting.') };
  }
}

export async function updateInventoryTrackingEnabled(enabled: boolean): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const { data: updated, error: updErr } = await supabase
      .from('pos_settings')
      .update({ inventory_tracking_enabled: enabled })
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .select('id');

    if (updErr) {
      return { data: null, error: reportError('updateInventoryTrackingEnabled', updErr, 'Unable to save inventory tracking setting.') };
    }

    if (((updated ?? []) as IdRow[]).length === 0) {
      const { error: insErr } = await supabase
        .from('pos_settings')
        .insert({ tenant_id, branch_id, inventory_tracking_enabled: enabled });
      if (insErr) {
        return { data: null, error: reportError('updateInventoryTrackingEnabled', insErr, 'Unable to save inventory tracking setting.') };
      }
    }

    return { data: enabled, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('updateInventoryTrackingEnabled', err, 'Unable to save inventory tracking setting.') };
  }
}

// ─── 17. RECIPE CONSUMPTION ──────────────────────────────────────────────────

/**
 * Inserts a Pending consumption batch for a bill. Settlement now does this
 * inside the `settle_order` RPC; this export remains for manual/legacy use.
 */
export async function createConsumptionBatch(
  billId: string,
  totalCostSnapshot = 0
): Promise<ServiceResult<InventoryConsumptionBatch>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('inventory_consumption_batches')
      .insert({
        tenant_id,
        branch_id,
        bill_id: billId,
        status: 'Pending',
        total_cost_snapshot: totalCostSnapshot,
        created_at: now,
        processed_at: null,
      })
      .select('*')
      .single();

    if (error) {
      return { data: null, error: reportError('createConsumptionBatch', error, 'Unable to create consumption batch.') };
    }
    return { data: data as InventoryConsumptionBatch, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('createConsumptionBatch', err, 'Unable to create consumption batch.') };
  }
}

async function markBatchProcessed(batchId: string, tenantId: string, branchId: string, totalCost?: number): Promise<void> {
  const payload: { status: 'Processed'; processed_at: string; total_cost_snapshot?: number } = {
    status: 'Processed',
    processed_at: new Date().toISOString(),
  };
  if (totalCost !== undefined) payload.total_cost_snapshot = totalCost;

  const { error } = await supabase
    .from('inventory_consumption_batches')
    .update(payload)
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId);
  if (error) {
    console.error('[inventory-service] markBatchProcessed:', error.code, error.message);
  }
}

/**
 * Client-side processor for a single consumption batch. The pg_cron worker
 * (`process_consumption_batches`) is the primary processor; this remains for
 * manual/legacy use.
 */
export async function processConsumptionBatch(batchId: string): Promise<ServiceResult<boolean>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();
    const now = new Date().toISOString();

    const { data: batchRaw, error: batchErr } = await supabase
      .from('inventory_consumption_batches')
      .select('*')
      .eq('id', batchId)
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .maybeSingle();

    if (batchErr) {
      return { data: false, error: reportError('processConsumptionBatch', batchErr, 'Unable to process consumption batch.') };
    }
    const batch = batchRaw as InventoryConsumptionBatch | null;
    if (!batch) {
      return { data: false, error: 'Consumption batch not found.' };
    }
    if (batch.status === 'Processed') return { data: true, error: null };

    const { data: billItemsRaw, error: itemsErr } = await supabase
      .from('bill_items')
      .select('product_id, qty')
      .eq('bill_id', batch.bill_id);

    if (itemsErr) {
      return { data: false, error: reportError('processConsumptionBatch', itemsErr, 'Unable to process consumption batch.') };
    }

    const billItems = (billItemsRaw ?? []) as BillItemRow[];
    const productIds = billItems.map((bi) => bi.product_id).filter((id): id is string => Boolean(id));
    if (productIds.length === 0) {
      await markBatchProcessed(batchId, tenant_id, branch_id);
      return { data: true, error: null };
    }

    const trackingRes = await fetchInventoryTrackingEnabled();
    const isTrackingEnabled = trackingRes.data !== false;
    if (!isTrackingEnabled) {
      await markBatchProcessed(batchId, tenant_id, branch_id);
      return { data: true, error: null };
    }

    const { data: productsRaw, error: prodErr } = await supabase
      .from('products')
      .select('id, name, recipe_id')
      .eq('tenant_id', tenant_id)
      .eq('branch_id', branch_id)
      .in('id', productIds);
    if (prodErr) {
      return { data: false, error: reportError('processConsumptionBatch', prodErr, 'Unable to process consumption batch.') };
    }
    const products = (productsRaw ?? []) as ProductRow[];

    const recipeIdsFromProducts = products.map((p) => p.recipe_id).filter((id): id is string => Boolean(id));

    const recipes: RecipeRow[] = [];
    const seenRecipeIds = new Set<string>();
    const recipeColumns = 'id, tenant_id, recipe_code, recipe_name, menu_item_id, is_active, created_at, updated_at, yield_quantity, yield_unit, cost_snapshot';

    const { data: byMenuRaw, error: byMenuErr } = await supabase
      .from('inventory_recipes')
      .select(recipeColumns)
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .in('menu_item_id', productIds);
    if (byMenuErr) {
      return { data: false, error: reportError('processConsumptionBatch', byMenuErr, 'Unable to process consumption batch.') };
    }
    for (const r of (byMenuRaw ?? []) as RecipeRow[]) {
      if (!seenRecipeIds.has(r.id)) {
        recipes.push(r);
        seenRecipeIds.add(r.id);
      }
    }

    if (recipeIdsFromProducts.length > 0) {
      const { data: byIdRaw, error: byIdErr } = await supabase
        .from('inventory_recipes')
        .select(recipeColumns)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .in('id', recipeIdsFromProducts);
      if (byIdErr) {
        return { data: false, error: reportError('processConsumptionBatch', byIdErr, 'Unable to process consumption batch.') };
      }
      for (const r of (byIdRaw ?? []) as RecipeRow[]) {
        if (!seenRecipeIds.has(r.id)) {
          recipes.push(r);
          seenRecipeIds.add(r.id);
        }
      }
    }

    const findRecipe = (prod: ProductRow): RecipeRow | undefined =>
      recipes.find((r) => (prod.recipe_id && r.id === prod.recipe_id) || r.menu_item_id === prod.id);

    const trackedProducts = products.filter((p) => findRecipe(p) !== undefined);
    if (trackedProducts.length === 0) {
      await markBatchProcessed(batchId, tenant_id, branch_id);
      return { data: true, error: null };
    }

    const { data: recipeItemsRaw, error: recipeItemsErr } = await supabase
      .from('inventory_recipe_items')
      .select('*')
      .in('recipe_id', recipes.map((r) => r.id));
    if (recipeItemsErr) {
      return { data: false, error: reportError('processConsumptionBatch', recipeItemsErr, 'Unable to process consumption batch.') };
    }
    const recipeItems = (recipeItemsRaw ?? []) as InventoryRecipeItem[];

    const jobsToInsert: {
      tenant_id: string;
      branch_id: string;
      batch_id: string;
      material_id: string;
      quantity_to_deduct: number;
      status: 'Pending';
    }[] = [];

    for (const bi of billItems) {
      const prod = trackedProducts.find((p) => p.id === bi.product_id);
      if (!prod) continue;
      const recipe = findRecipe(prod);
      if (!recipe) continue;

      for (const ri of recipeItems.filter((item) => item.recipe_id === recipe.id)) {
        const qtyToDeduct = (toNumber(ri.quantity) / (toNumber(recipe.yield_quantity) || 1)) * toNumber(bi.qty);
        if (qtyToDeduct > 0) {
          jobsToInsert.push({
            tenant_id,
            branch_id,
            batch_id: batchId,
            material_id: ri.material_id,
            quantity_to_deduct: qtyToDeduct,
            status: 'Pending',
          });
        }
      }
    }

    if (jobsToInsert.length === 0) {
      await markBatchProcessed(batchId, tenant_id, branch_id);
      return { data: true, error: null };
    }

    const { data: insertedRaw, error: jobsInsertErr } = await supabase
      .from('inventory_consumption_jobs')
      .insert(jobsToInsert)
      .select('*');

    if (jobsInsertErr) {
      return { data: false, error: reportError('processConsumptionBatch', jobsInsertErr, 'Unable to process consumption batch.') };
    }

    const insertedJobs = (insertedRaw ?? []) as InventoryConsumptionJob[];
    let totalCost = 0;

    for (const job of insertedJobs) {
      try {
        const { data: lvlRows, error: lvlErr } = await supabase
          .from('inventory_material_stock_levels')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id)
          .eq('material_id', job.material_id)
          .limit(1);
        if (lvlErr) throw lvlErr;

        const activeLvl = ((lvlRows ?? []) as InventoryStockLevel[])[0] ?? null;
        const deduct = toNumber(job.quantity_to_deduct);
        let nextStock = 0;

        if (activeLvl) {
          nextStock = Math.max(0, toNumber(activeLvl.current_stock) - deduct);
          const reserved = toNumber(activeLvl.reserved_stock);
          const { error: updErr } = await supabase
            .from('inventory_material_stock_levels')
            .update({ current_stock: nextStock, available_stock: nextStock - reserved, updated_at: now })
            .eq('id', activeLvl.id)
            .eq('tenant_id', tenant_id)
            .eq('branch_id', branch_id);
          if (updErr) throw updErr;
        } else {
          nextStock = -deduct;
          const { error: insErr } = await supabase.from('inventory_material_stock_levels').insert({
            tenant_id,
            branch_id,
            material_id: job.material_id,
            location_id: 'Main Storage',
            current_stock: nextStock,
            reserved_stock: 0,
            available_stock: nextStock,
          });
          if (insErr) throw insErr;
        }

        const { data: matRaw, error: matErr } = await supabase
          .from('inventory_materials')
          .select('id, average_cost, material_name')
          .eq('id', job.material_id)
          .eq('tenant_id', tenant_id)
          .maybeSingle();
        if (matErr) throw matErr;

        const mat = matRaw as MaterialStockRow | null;
        const unitCost = mat ? toNumber(mat.average_cost) : 0;
        totalCost += deduct * unitCost;

        const { error: ledgerErr } = await supabase.from('inventory_stock_ledger').insert({
          tenant_id,
          branch_id,
          material_id: job.material_id,
          transaction_date: now,
          transaction_type: 'Recipe Consumption',
          reference_type: 'Sales Bill Batch',
          reference_id: batchId,
          qty_in: 0,
          qty_out: deduct,
          balance_stock: nextStock,
          unit_cost: unitCost,
          total_value: nextStock * unitCost,
          remarks: `Recipe consumption for POS bill. Batch: ${batchId}`,
          created_by: 'System Worker',
        });
        if (ledgerErr) throw ledgerErr;

        const { error: jobUpdErr } = await supabase
          .from('inventory_consumption_jobs')
          .update({ status: 'Processed', processed_at: now, processed_by: 'System Worker' })
          .eq('id', job.id)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);
        if (jobUpdErr) throw jobUpdErr;
      } catch (jobErr: unknown) {
        const { code, message } = describeError(jobErr);
        console.error(`[inventory-service] processConsumptionBatch (job ${job.id}):`, code || 'UNKNOWN', message);
        const { error: failErr } = await supabase
          .from('inventory_consumption_jobs')
          .update({
            status: 'Failed',
            attempt_count: toNumber(job.attempt_count) + 1,
            error_message: message || 'Job deduction failed',
            last_attempt_at: now,
          })
          .eq('id', job.id)
          .eq('tenant_id', tenant_id)
          .eq('branch_id', branch_id);
        if (failErr) {
          console.error('[inventory-service] processConsumptionBatch (mark failed):', failErr.code, failErr.message);
        }
      }
    }

    await markBatchProcessed(batchId, tenant_id, branch_id, totalCost);
    return { data: true, error: null };
  } catch (err: unknown) {
    return { data: false, error: reportError('processConsumptionBatch', err, 'Unable to process consumption batch.') };
  }
}

/**
 * Manually triggers the server-side consumption worker (managers only).
 */
export async function runConsumptionWorker(): Promise<ServiceResult<ConsumptionWorkerResult>> {
  try {
    const { data, error } = await supabase.rpc('run_consumption_worker');

    if (error) {
      const { code, message } = describeError(error);
      console.error('[inventory-service] runConsumptionWorker:', code || 'UNKNOWN', message);
      if (code === 'PGRST202') {
        return { data: null, error: 'Inventory consumption worker is not deployed yet.' };
      }
      if (message.includes('WORKER_FORBIDDEN') || code === '42501') {
        return { data: null, error: 'Only managers can run the consumption worker.' };
      }
      return { data: null, error: 'Unable to process pending stock deductions.' };
    }

    const result = data as Partial<ConsumptionWorkerResult> | null;
    return {
      data: {
        processed: toNumber(result?.processed),
        failed: toNumber(result?.failed),
        deferred: toNumber(result?.deferred),
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: reportError('runConsumptionWorker', err, 'Unable to process pending stock deductions.') };
  }
}

export async function fetchPendingConsumptionSummary(): Promise<ServiceResult<PendingConsumptionSummary>> {
  try {
    const { tenant_id, branch_id } = getTenantContext();

    const countByStatus = async (status: 'Pending' | 'Failed'): Promise<number> => {
      const { count, error } = await supabase
        .from('inventory_consumption_batches')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('branch_id', branch_id)
        .eq('status', status);
      if (error) throw error;
      return count ?? 0;
    };

    const [pending, failed] = await Promise.all([countByStatus('Pending'), countByStatus('Failed')]);
    return { data: { pending, failed }, error: null };
  } catch (err: unknown) {
    return { data: null, error: reportError('fetchPendingConsumptionSummary', err, 'Unable to load pending stock deductions.') };
  }
}
