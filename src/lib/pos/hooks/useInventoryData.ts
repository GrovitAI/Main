import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  fetchAdjustments,
  fetchAlerts,
  fetchAuditLogs,
  fetchBranches,
  fetchCategories,
  fetchDispatches,
  fetchInventoryDashboardKPIs,
  fetchMaterials,
  fetchPurchases,
  fetchRecipes,
  fetchStockLedger,
  fetchSuppliers,
  fetchTransferRequests,
  fetchUnits,
  fetchWastage,
  initializeLocalSeeder,
  type Branch,
  type DashboardKPIs,
  type InventoryAdjustment,
  type InventoryAlert,
  type InventoryAuditLog,
  type InventoryCategory,
  type InventoryDispatch,
  type InventoryMaterial,
  type InventoryPurchaseHeader,
  type InventoryRecipe,
  type InventoryStockLedger,
  type InventorySupplier,
  type InventoryTransferRequest,
  type InventoryUnit,
  type InventoryWastage,
  type ServiceResult,
} from '@/lib/pos/inventory-service';
import { getProducts, type Product } from '@/lib/pos/products-service';
import type { InventoryData, InventoryEntity, InventoryTabName } from '@/components/inventory/inventory-types';

const TAB_DEPENDENCIES: Record<InventoryTabName, InventoryEntity[]> = {
  dashboard: ['kpis', 'materials', 'purchases', 'wastages', 'suppliers'],
  materials: ['materials', 'categories', 'units', 'suppliers', 'purchases'],
  purchases: ['purchases', 'suppliers', 'materials', 'categories', 'units'],
  suppliers: ['suppliers'],
  wastage: ['wastages', 'materials', 'adjustments'],
  transfers: ['transferRequests', 'dispatchesList', 'dbBranches', 'materials', 'adjustments', 'categories'],
  recipes: ['recipes', 'materials', 'products'],
  reports: ['stockLedger', 'materials', 'wastages', 'purchases', 'categories', 'kpis', 'products', 'recipes'],
  alerts: ['alerts', 'auditLogs'],
  units: ['units'],
  categories: ['categories'],
  record_purchase: ['purchases', 'suppliers', 'materials', 'categories', 'units'],
};

/**
 * Owns all shared inventory data and the lazy per-tab loader.
 * Entities are fetched only when the active tab needs them and are cached
 * until invalidated via `reload` or until the branch changes.
 */
export function useInventoryData(activeTab: InventoryTabName, branchId: string): InventoryData {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  const [dbBranches, setDbBranches] = useState<Branch[]>([]);
  const [transferRequests, setTransferRequests] = useState<InventoryTransferRequest[]>([]);
  const [dispatchesList, setDispatchesList] = useState<InventoryDispatch[]>([]);

  const loadedEntities = useRef<Set<InventoryEntity>>(new Set());
  const lastFetchedBranchId = useRef<string | null>(null);
  const initialLoadDone = useRef(false);

  const loadEntity = useCallback(async (entity: InventoryEntity, targetBranchId: string): Promise<void> => {
    const apply = async <T,>(fetcher: () => Promise<ServiceResult<T>>, set: (data: T) => void) => {
      const res = await fetcher();
      if (res.data !== null) {
        set(res.data);
        loadedEntities.current.add(entity);
      }
    };

    switch (entity) {
      case 'kpis':
        return apply(fetchInventoryDashboardKPIs, setKpis);
      case 'materials':
        return apply(() => fetchMaterials(targetBranchId), setMaterials);
      case 'categories':
        return apply(fetchCategories, setCategories);
      case 'units':
        return apply(fetchUnits, setUnits);
      case 'suppliers':
        return apply(fetchSuppliers, setSuppliers);
      case 'purchases':
        return apply(fetchPurchases, setPurchases);
      case 'wastages':
        return apply(fetchWastage, setWastages);
      case 'adjustments':
        return apply(fetchAdjustments, setAdjustments);
      case 'auditLogs':
        return apply(fetchAuditLogs, setAuditLogs);
      case 'alerts':
        return apply(fetchAlerts, setAlerts);
      case 'dbBranches':
        return apply(fetchBranches, setDbBranches);
      case 'transferRequests':
        return apply(() => fetchTransferRequests(targetBranchId), setTransferRequests);
      case 'dispatchesList':
        return apply(() => fetchDispatches(targetBranchId), setDispatchesList);
      case 'stockLedger':
        return apply(() => fetchStockLedger(), setStockLedger);
      case 'recipes':
        return apply(fetchRecipes, setRecipes);
      case 'products':
        return apply(getProducts, setProducts);
      default:
        return;
    }
  }, []);

  const loadAllData = useCallback(async (silent: boolean, targetBranchId: string): Promise<void> => {
    if (lastFetchedBranchId.current !== targetBranchId) {
      loadedEntities.current.clear();
      lastFetchedBranchId.current = targetBranchId;
    }

    const needed = TAB_DEPENDENCIES[activeTab].filter((d) => !loadedEntities.current.has(d));
    if (needed.length === 0) {
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setIsLoading(false);
      }
      return;
    }

    if (!silent) setIsLoading(true);
    setErrorMsg(null);

    try {
      initializeLocalSeeder();
      await Promise.all(needed.map((entity) => loadEntity(entity, targetBranchId)));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error && err.message ? err.message : 'Unable to fetch inventory records.');
    } finally {
      initialLoadDone.current = true;
      setIsLoading(false);
    }
  }, [activeTab, loadEntity]);

  // Single loader effect: non-silent on the very first load, silent afterwards
  // (tab changes and branch changes refresh in the background).
  useEffect(() => {
    void loadAllData(initialLoadDone.current, branchId);
  }, [branchId, loadAllData]);

  // Re-focus on the screen invalidates the active tab's data and refetches silently.
  useFocusEffect(
    useCallback(() => {
      TAB_DEPENDENCIES[activeTab].forEach((d) => loadedEntities.current.delete(d));
      void loadAllData(true, branchId);
    }, [activeTab, branchId, loadAllData])
  );

  const reload = useCallback(async (entities: InventoryEntity[]): Promise<void> => {
    entities.forEach((entity) => loadedEntities.current.delete(entity));
    await loadAllData(true, branchId);
  }, [loadAllData, branchId]);

  const patchPurchase = useCallback((id: string, patch: Partial<InventoryPurchaseHeader>) => {
    setPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  return useMemo<InventoryData>(() => ({
    kpis,
    materials,
    categories,
    units,
    suppliers,
    purchases,
    wastages,
    adjustments,
    auditLogs,
    alerts,
    stockLedger,
    recipes,
    products,
    dbBranches,
    transferRequests,
    dispatchesList,
    isLoading,
    errorMsg,
    reload,
    patchPurchase,
  }), [
    kpis, materials, categories, units, suppliers, purchases, wastages, adjustments, auditLogs, alerts,
    stockLedger, recipes, products, dbBranches, transferRequests, dispatchesList, isLoading, errorMsg,
    reload, patchPurchase,
  ]);
}
