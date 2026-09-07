import { useCallback, useEffect, useState } from 'react';

import type { ServiceResult } from '@/lib/pos/inventory-service';

export interface ConsumptionWorkerResult {
  processed: number;
  failed: number;
  deferred: number;
}

export interface PendingConsumptionSummary {
  pending: number;
  failed: number;
}

/**
 * Typed bridge to the consumption-tracking service functions.
 * These exports are being added to inventory-service.ts concurrently; the
 * dynamic import keeps this module compiling independently of that work.
 */
interface TrackingService {
  fetchInventoryTrackingEnabled?: () => Promise<ServiceResult<boolean>>;
  updateInventoryTrackingEnabled?: (enabled: boolean) => Promise<ServiceResult<boolean>>;
  runConsumptionWorker?: () => Promise<ServiceResult<ConsumptionWorkerResult>>;
  fetchPendingConsumptionSummary?: () => Promise<ServiceResult<PendingConsumptionSummary>>;
}

async function loadTrackingService(): Promise<TrackingService> {
  const svc = (await import('@/lib/pos/inventory-service')) as unknown as TrackingService;
  return svc;
}

const NOT_AVAILABLE = 'Inventory tracking service is not available yet.';

export function fetchInventoryTrackingEnabled(): Promise<ServiceResult<boolean>> {
  return loadTrackingService().then((svc) =>
    svc.fetchInventoryTrackingEnabled ? svc.fetchInventoryTrackingEnabled() : { data: null, error: NOT_AVAILABLE }
  );
}

export function updateInventoryTrackingEnabled(enabled: boolean): Promise<ServiceResult<boolean>> {
  return loadTrackingService().then((svc) =>
    svc.updateInventoryTrackingEnabled ? svc.updateInventoryTrackingEnabled(enabled) : { data: null, error: NOT_AVAILABLE }
  );
}

export function runConsumptionWorker(): Promise<ServiceResult<ConsumptionWorkerResult>> {
  return loadTrackingService().then((svc) =>
    svc.runConsumptionWorker ? svc.runConsumptionWorker() : { data: null, error: NOT_AVAILABLE }
  );
}

export function fetchPendingConsumptionSummary(): Promise<ServiceResult<PendingConsumptionSummary>> {
  return loadTrackingService().then((svc) =>
    svc.fetchPendingConsumptionSummary ? svc.fetchPendingConsumptionSummary() : { data: null, error: NOT_AVAILABLE }
  );
}

export interface InventoryTrackingState {
  enabled: boolean;
  isLoadingEnabled: boolean;
  isSaving: boolean;
  summary: PendingConsumptionSummary | null;
  isRunningWorker: boolean;
  lastRun: ConsumptionWorkerResult | null;
  error: string | null;
  setEnabled: (next: boolean) => Promise<void>;
  runWorker: () => Promise<void>;
  refreshSummary: () => Promise<void>;
}

/**
 * Per-branch inventory tracking toggle plus the pending-deduction worker controls.
 * State is persisted in the DB via the service layer (not localStorage).
 */
export function useInventoryTracking(branchId: string): InventoryTrackingState {
  const [enabled, setEnabledState] = useState(false);
  const [isLoadingEnabled, setIsLoadingEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [summary, setSummary] = useState<PendingConsumptionSummary | null>(null);
  const [isRunningWorker, setIsRunningWorker] = useState(false);
  const [lastRun, setLastRun] = useState<ConsumptionWorkerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSummary = useCallback(async (): Promise<void> => {
    try {
      const res = await fetchPendingConsumptionSummary();
      if (res.data) setSummary(res.data);
    } catch {
      // Summary is informational; keep the last known value.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingEnabled(true);
    setError(null);
    fetchInventoryTrackingEnabled()
      .then((res) => {
        if (cancelled) return;
        if (res.error) setError(res.error);
        setEnabledState(res.data === true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tracking setting.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEnabled(false);
      });
    void refreshSummary();
    return () => {
      cancelled = true;
    };
  }, [branchId, refreshSummary]);

  const setEnabled = useCallback(async (next: boolean): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await updateInventoryTrackingEnabled(next);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEnabledState(res.data === true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update tracking setting.');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const runWorker = useCallback(async (): Promise<void> => {
    setIsRunningWorker(true);
    setError(null);
    try {
      const res = await runConsumptionWorker();
      if (res.error) {
        setError(res.error);
        return;
      }
      setLastRun(res.data);
      await refreshSummary();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process pending deductions.');
    } finally {
      setIsRunningWorker(false);
    }
  }, [refreshSummary]);

  return { enabled, isLoadingEnabled, isSaving, summary, isRunningWorker, lastRun, error, setEnabled, runWorker, refreshSummary };
}
