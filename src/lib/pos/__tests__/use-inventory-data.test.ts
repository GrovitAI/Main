import { act, createElement, type ReactElement } from 'react';
import { useFocusEffect } from 'expo-router';
import * as services from '@/lib/pos/inventory-service';
import { getProducts } from '@/lib/pos/products-service';
import { useInventoryData } from '@/lib/pos/hooks/useInventoryData';
import type { InventoryData, InventoryTabName } from '@/components/inventory/inventory-types';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react') as typeof import('react');
  return { useFocusEffect: jest.fn((effect: () => void) => useEffect(effect, [effect])) };
});
jest.mock('@/lib/pos/inventory-service', () => ({
  fetchAdjustments: jest.fn(), fetchAlerts: jest.fn(), fetchAuditLogs: jest.fn(), fetchBranches: jest.fn(),
  fetchCategories: jest.fn(), fetchDispatches: jest.fn(), fetchInventoryDashboardKPIs: jest.fn(),
  fetchMaterials: jest.fn(), fetchPurchases: jest.fn(), fetchRecipes: jest.fn(), fetchStockLedger: jest.fn(),
  fetchSuppliers: jest.fn(), fetchTransferRequests: jest.fn(), fetchUnits: jest.fn(), fetchWastage: jest.fn(),
  initializeLocalSeeder: jest.fn(),
}));
jest.mock('@/lib/pos/products-service', () => ({ getProducts: jest.fn() }));


// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (element: ReactElement) => { update: (element: ReactElement) => void; unmount: () => void };
};
type Result = { data: { id: string }[] | null; error: string | null };
function deferred() {
  let resolve: (value: Result) => void = () => { throw new Error('Promise not initialized'); };
  const promise = new Promise<Result>((finish) => { resolve = finish; });
  return { promise, resolve };
}

let tree: ReturnType<typeof renderer.create> | undefined;
let current: InventoryData | undefined;
function Reader({ tab, branch }: { tab: InventoryTabName; branch: string }): null {
  current = useInventoryData(tab, branch);
  return null;
}
async function mount(tab: InventoryTabName = 'suppliers', branch = 'branch-a'): Promise<void> {
  await act(async () => { tree = renderer.create(createElement(Reader, { tab, branch })); });
}

beforeEach(() => {
  jest.clearAllMocks();
  current = undefined;
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const [name, fn] of Object.entries(services)) {
    if (name !== 'initializeLocalSeeder' && jest.isMockFunction(fn)) fn.mockResolvedValue({ data: [], error: null });
  }
  (getProducts as jest.Mock).mockResolvedValue({ data: [], error: null });
  const originalError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('react-test-renderer is deprecated')) return;
    originalError(...args);
  });
});
afterEach(async () => {
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
});

test('initial and focus loads share one pending entity request', async () => {
  const pending = deferred();
  (services.fetchSuppliers as jest.Mock).mockReturnValue(pending.promise);
  await mount();
  expect(services.fetchSuppliers).toHaveBeenCalledTimes(1);
  expect(current?.isLoading).toBe(true);
  await act(async () => { pending.resolve({ data: [{ id: 'supplier' }], error: null }); });
  expect(current?.suppliers[0]?.id).toBe('supplier');
  expect(current?.isLoading).toBe(false);
});

test('focus refresh still reads current data after the initial request completes', async () => {
  await mount();
  (services.fetchSuppliers as jest.Mock).mockResolvedValue({ data: [{ id: 'updated' }], error: null });
  const focus = (useFocusEffect as jest.Mock).mock.calls.at(-1)?.[0] as (() => void) | undefined;
  await act(async () => { focus?.(); });
  expect(services.fetchSuppliers).toHaveBeenCalledTimes(2);
  expect(current?.suppliers[0]?.id).toBe('updated');
});

test('refresh after a save starts a fresh read and ignores the pre-save response', async () => {
  const old = deferred();
  const fresh = deferred();
  (services.fetchSuppliers as jest.Mock).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  await mount();
  let reload: Promise<void> | undefined;
  await act(async () => { reload = current?.reload(['suppliers']); });
  expect(services.fetchSuppliers).toHaveBeenCalledTimes(2);
  await act(async () => { fresh.resolve({ data: [{ id: 'after-save' }], error: null }); await reload; });
  expect(current?.isLoading).toBe(false);
  await act(async () => { old.resolve({ data: [{ id: 'before-save' }], error: null }); });
  expect(current?.suppliers[0]?.id).toBe('after-save');
  expect(current?.isLoading).toBe(false);
});

test('branch switches cannot apply an old response, including A to B to A', async () => {
  const firstA = deferred();
  const b = deferred();
  const latestA = deferred();
  (services.fetchMaterials as jest.Mock).mockReturnValueOnce(firstA.promise).mockReturnValueOnce(b.promise).mockReturnValueOnce(latestA.promise);
  await mount('materials');
  await act(async () => { tree?.update(createElement(Reader, { tab: 'materials', branch: 'branch-b' })); });
  await act(async () => { tree?.update(createElement(Reader, { tab: 'materials', branch: 'branch-a' })); });
  expect(services.fetchMaterials).toHaveBeenCalledTimes(3);
  await act(async () => { latestA.resolve({ data: [{ id: 'latest-a' }], error: null }); });
  await act(async () => { firstA.resolve({ data: [{ id: 'old-a' }], error: null }); b.resolve({ data: [{ id: 'b' }], error: null }); });
  expect(current?.materials[0]?.id).toBe('latest-a');
  expect(current?.isLoading).toBe(false);
});

test('switching tabs shares their common in-flight entities', async () => {
  const materials = deferred();
  (services.fetchMaterials as jest.Mock).mockReturnValue(materials.promise);
  await mount('dashboard');
  await act(async () => { tree?.update(createElement(Reader, { tab: 'materials', branch: 'branch-a' })); });
  expect(services.fetchMaterials).toHaveBeenCalledTimes(1);
  await act(async () => { materials.resolve({ data: [{ id: 'material' }], error: null }); });
  expect(current?.materials[0]?.id).toBe('material');
});

test('failed entities remain retryable and loading finishes after the other requests settle', async () => {
  const materials = deferred();
  (services.fetchMaterials as jest.Mock).mockReturnValue(materials.promise);
  (services.fetchSuppliers as jest.Mock).mockResolvedValue({ data: null, error: 'Unable to load suppliers.' });
  await mount('materials');
  expect(current?.isLoading).toBe(true);
  await act(async () => { materials.resolve({ data: [], error: null }); });
  expect(current?.isLoading).toBe(false);
  expect(current?.errorMsg).toBe('Unable to load suppliers.');
  (services.fetchSuppliers as jest.Mock).mockResolvedValue({ data: [{ id: 'recovered' }], error: null });
  await act(async () => { await current?.reload(['suppliers']); });
  expect(current?.errorMsg).toBeNull();
  expect(current?.suppliers[0]?.id).toBe('recovered');
});
