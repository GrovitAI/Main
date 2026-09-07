import type {
  DashboardKPIs,
  InventoryAdjustment,
  InventoryAlert,
  InventoryAuditLog,
  InventoryCategory,
  InventoryDispatch,
  InventoryMaterial,
  InventoryPurchaseHeader,
  InventoryRecipe,
  InventoryStockLedger,
  InventorySupplier,
  InventoryTransferRequest,
  InventoryUnit,
  InventoryWastage,
  Branch,
} from '@/lib/pos/inventory-service';
import type { Product } from '@/lib/pos/products-service';

/** Tabs rendered by the inventory router. */
export type InventoryTabName =
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

/** Data entities that can be lazily loaded per tab. */
export type InventoryEntity =
  | 'kpis'
  | 'materials'
  | 'categories'
  | 'units'
  | 'suppliers'
  | 'purchases'
  | 'wastages'
  | 'adjustments'
  | 'auditLogs'
  | 'alerts'
  | 'dbBranches'
  | 'transferRequests'
  | 'dispatchesList'
  | 'stockLedger'
  | 'recipes'
  | 'products';

/** Shared inventory data passed down from `useInventoryData`. */
export interface InventoryData {
  kpis: DashboardKPIs | null;
  materials: InventoryMaterial[];
  categories: InventoryCategory[];
  units: InventoryUnit[];
  suppliers: InventorySupplier[];
  purchases: InventoryPurchaseHeader[];
  wastages: InventoryWastage[];
  adjustments: InventoryAdjustment[];
  auditLogs: InventoryAuditLog[];
  alerts: InventoryAlert[];
  stockLedger: InventoryStockLedger[];
  recipes: InventoryRecipe[];
  products: Product[];
  dbBranches: Branch[];
  transferRequests: InventoryTransferRequest[];
  dispatchesList: InventoryDispatch[];
  isLoading: boolean;
  errorMsg: string | null;
  /** Invalidate the given entities and silently refetch those needed by the active tab. */
  reload: (entities: InventoryEntity[]) => Promise<void>;
  /** Optimistically patch a purchase header in local state (e.g. status toggle). */
  patchPurchase: (id: string, patch: Partial<InventoryPurchaseHeader>) => void;
}

/** One line on the record-purchase form. */
export interface PurchaseLine {
  material_id: string;
  quantity: string;
  pack_size: string;
  unit_price: string;
  gst: string;
  unit_short_name?: string;
}

export const EMPTY_PURCHASE_LINE: PurchaseLine = {
  material_id: '',
  quantity: '',
  pack_size: '1',
  unit_price: '',
  gst: '0',
  unit_short_name: '',
};

export type WastageReason = 'Expired' | 'Spoiled' | 'Kitchen Waste' | 'Damage' | 'Theft' | 'Other';

export const WASTAGE_REASONS: WastageReason[] = ['Expired', 'Spoiled', 'Kitchen Waste', 'Damage', 'Theft', 'Other'];

export const STORAGE_LOCATIONS = ['Dry Storage', 'Freezer', 'Central Kitchen'] as const;

/** Format an error of unknown shape into a user-facing message. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/** Web-only outline reset for TextInput (typed so no `as any` is needed at call sites). */
export const WEB_NO_OUTLINE = { outlineStyle: 'none' } as unknown as Record<string, never>;
