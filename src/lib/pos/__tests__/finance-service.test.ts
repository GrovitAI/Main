/**
 * Service-layer tests: tenant/branch scoping, graceful degradation when the
 * finance migration has not been applied, and error mapping.
 *
 * Supabase is faked with a chainable query recorder so we can assert exactly
 * which filters were sent.
 */
/* eslint-disable import/first, @typescript-eslint/no-require-imports --
   jest.mock() calls are hoisted above imports and their factories must use
   require(); isolateModules needs require() to reset the schema cache. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('../use-session-store', () => ({ useSessionStore: { getState: jest.fn() } }));

import { supabase } from '../supabase';
import { getTenantContext } from '../tenant-context';
import { useSessionStore } from '../use-session-store';

const mockFrom = supabase.from as unknown as jest.Mock;
const mockRpc = supabase.rpc as unknown as jest.Mock;
const mockTenantContext = getTenantContext as unknown as jest.Mock;

type QueryLog = { table: string; calls: [string, unknown[]][] };

const queries: QueryLog[] = [];

/** A thenable that records every PostgREST filter applied to it. */
function makeQuery(table: string, result: { data: unknown; error: unknown; count?: number }) {
  const log: QueryLog = { table, calls: [] };
  queries.push(log);
  const query: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    log.calls.push([name, args]);
    return query;
  };
  for (const name of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'or', 'ilike', 'order', 'range', 'limit', 'is', 'insert', 'update', 'upsert']) {
    query[name] = chain(name);
  }
  query.single = () => Promise.resolve(result);
  query.maybeSingle = () => Promise.resolve(result);
  query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query;
}

function filtersFor(table: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const log of queries.filter((q) => q.table === table)) {
    for (const [name, args] of log.calls) {
      if (name === 'eq' && typeof args[0] === 'string') out[args[0]] = args[1];
    }
  }
  return out;
}

const OWNER = { tenant_id: 'tenant-1', branch_id: 'branch-1', role: 'owner', isOwnerOrAdmin: true, canViewAllBranches: true };
const ADMIN = { tenant_id: 'tenant-1', branch_id: 'branch-1', role: 'admin', isOwnerOrAdmin: true, canViewAllBranches: false };
const CASHIER = { tenant_id: 'tenant-1', branch_id: 'branch-1', role: 'cashier', isOwnerOrAdmin: false, canViewAllBranches: false };

const MISSING_COLUMN = { code: '42703', message: 'column does not exist' };
const MISSING_TABLE = { code: 'PGRST205', message: 'table not found' };
const MISSING_FUNCTION = { code: 'PGRST202', message: 'function not found' };

/** Fresh module instance so the schema cache never leaks between tests. */
function loadService(): typeof import('../finance-service') {
  let mod: typeof import('../finance-service') | undefined;
  jest.isolateModules(() => {
    mod = require('../finance-service') as typeof import('../finance-service');
  });
  if (!mod) throw new Error('module load failed');
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  queries.length = 0;
  mockTenantContext.mockReturnValue(OWNER);
  (useSessionStore.getState as jest.Mock).mockReturnValue({ session: { staffId: 'staff-1' } });
});

describe('detectFinanceSchema', () => {
  test('reports every part as present when the migration is applied', async () => {
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null }));
    mockRpc.mockResolvedValue({ data: {}, error: null });

    const { detectFinanceSchema } = loadService();
    expect(await detectFinanceSchema()).toEqual({
      expensesExtended: true,
      categoriesTable: true,
      dayClosuresTable: true,
      refundsExtended: true,
      summaryRpc: true,
    });
  });

  test('reports missing parts when the migration is pending', async () => {
    mockFrom.mockImplementation((t: string) =>
      makeQuery(t, t === 'expenses' ? { data: [], error: MISSING_COLUMN } : { data: null, error: MISSING_TABLE }),
    );
    mockRpc.mockResolvedValue({ data: null, error: MISSING_FUNCTION });

    const { detectFinanceSchema } = loadService();
    expect(await detectFinanceSchema()).toEqual({
      expensesExtended: false,
      categoriesTable: false,
      dayClosuresTable: false,
      refundsExtended: false,
      summaryRpc: false,
    });
  });

  test('a probe that throws is not cached, so a later call can still succeed', async () => {
    mockTenantContext.mockImplementation(() => {
      throw new Error('Active session required');
    });
    const { detectFinanceSchema } = loadService();
    expect((await detectFinanceSchema()).summaryRpc).toBe(false);

    // Session arrives.
    mockTenantContext.mockReturnValue(OWNER);
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null }));
    mockRpc.mockResolvedValue({ data: {}, error: null });
    expect((await detectFinanceSchema()).summaryRpc).toBe(true);
  });
});

describe('branch scoping', () => {
  test('a cashier is pinned to their own branch even when asking for another', async () => {
    mockTenantContext.mockReturnValue(CASHIER);
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null, count: 0 }));
    mockRpc.mockResolvedValue({ data: {}, error: null });

    const { fetchExpenses } = loadService();
    await fetchExpenses({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      branchId: 'someone-elses-branch',
      category: null,
      paymentMethod: null,
      search: '',
      includeVoid: false,
      page: 0,
      pageSize: 50,
    });

    const filters = filtersFor('expenses');
    expect(filters.tenant_id).toBe('tenant-1');
    expect(filters.branch_id).toBe('branch-1');
  });

  test('an admin is pinned to their own branch, whether asking for all or for another', async () => {
    mockTenantContext.mockReturnValue(ADMIN);
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null, count: 0 }));
    mockRpc.mockResolvedValue({ data: {}, error: null });

    const { fetchExpenses } = loadService();
    for (const branchId of [null, 'someone-elses-branch']) {
      await fetchExpenses({
        startDate: '2026-09-01',
        endDate: '2026-09-07',
        branchId,
        category: null,
        paymentMethod: null,
        search: '',
        includeVoid: false,
        page: 0,
        pageSize: 50,
      });

      const filters = filtersFor('expenses');
      expect(filters.tenant_id).toBe('tenant-1');
      expect(filters.branch_id).toBe('branch-1');
    }
  });

  test('an owner viewing all branches sends no branch filter', async () => {
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null, count: 0 }));
    mockRpc.mockResolvedValue({ data: {}, error: null });

    const { fetchExpenses } = loadService();
    await fetchExpenses({
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      branchId: null,
      category: null,
      paymentMethod: null,
      search: '',
      includeVoid: false,
      page: 0,
      pageSize: 50,
    });

    const filters = filtersFor('expenses');
    expect(filters.tenant_id).toBe('tenant-1');
    expect(filters.branch_id).toBeUndefined();
  });

  test('every expense insert carries tenant_id and branch_id', async () => {
    const inserts: Record<string, unknown>[] = [];
    mockFrom.mockImplementation((t: string) => {
      const q = makeQuery(t, { data: { id: 'e1', amount: 100, category: 'Rent', date: '2026-09-05' }, error: null });
      q.insert = (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return q;
      };
      return q;
    });
    mockRpc.mockResolvedValue({ data: {}, error: null });

    const { createExpense } = loadService();
    await createExpense(
      {
        amount: 100,
        category: 'Rent',
        description: null,
        expense_date: '2026-09-05',
        payment_method: 'cash',
        payee: null,
        reference_no: null,
        notes: null,
      },
      null,
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0].tenant_id).toBe('tenant-1');
    expect(inserts[0].branch_id).toBe('branch-1');
    expect(inserts[0].created_by).toBe('staff-1');
  });
});

describe('graceful degradation', () => {
  test('categories fall back to the built-in list when the table is absent', async () => {
    mockFrom.mockImplementation((t: string) =>
      makeQuery(t, t === 'expense_categories' ? { data: null, error: MISSING_TABLE } : { data: [], error: null }),
    );
    mockRpc.mockResolvedValue({ data: {}, error: null });

    const { fetchExpenseCategories } = loadService();
    const { data, error } = await fetchExpenseCategories();
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(10);
    expect(data?.map((c) => c.name)).toContain('Rent');
  });

  test('voiding is refused with a clear message before the migration', async () => {
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: null, error: MISSING_COLUMN }));
    mockRpc.mockResolvedValue({ data: null, error: MISSING_FUNCTION });

    const { voidExpense } = loadService();
    const { data, error } = await voidExpense('e1', 'duplicate entry');
    expect(data).toBeNull();
    expect(error).toContain('migration');
  });

  test('a void with no reason is rejected without touching the database', async () => {
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null }));
    mockRpc.mockResolvedValue({ data: {}, error: null });

    const { voidExpense } = loadService();
    queries.length = 0;
    const { error } = await voidExpense('e1', '   ');
    expect(error).toContain('reason is required');
    expect(queries.filter((q) => q.table === 'expenses' && q.calls.some(([n]) => n === 'update'))).toHaveLength(0);
  });

  test('day close cannot be saved before the migration', async () => {
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: null, error: MISSING_TABLE }));
    mockRpc.mockResolvedValue({ data: null, error: MISSING_FUNCTION });

    const { saveDayClosure } = loadService();
    const { error } = await saveDayClosure(
      { business_date: '2026-09-05', opening_cash: 0, counted_cash: 100, notes: null },
      { business_date: '2026-09-05', cashSales: 0, cashRefunds: 0, cashExpenses: 0, cashSettlementCount: 0, cashExpenseCount: 0 },
      'close',
      'branch-1',
    );
    expect(error).toContain('migration');
  });
});

describe('overview', () => {
  test('uses the RPCs and maps their payload when they exist', async () => {
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null }));
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_finance_summary') {
        return Promise.resolve({
          data: {
            grossSales: 1000,
            billCount: 3,
            collectedRevenue: 950,
            expensesTotal: 200,
            purchasesTotal: 100,
            cashIn: 500,
            cashOut: 200,
            paymentSplit: [{ payment_type: 'CASH', total: 500, count: 2 }],
            expensesByCategory: [{ category: 'Rent', total: 200, count: 1 }],
          },
          error: null,
        });
      }
      return Promise.resolve({
        data: [{ date: '2026-09-05', revenue: 950, orders: 3, expenses: 200, net: 750 }],
        error: null,
      });
    });

    const { fetchFinanceOverview } = loadService();
    const { data, error } = await fetchFinanceOverview({
      preset: 'custom',
      startDate: '2026-09-05',
      endDate: '2026-09-05',
      branchId: null,
    });

    expect(error).toBeNull();
    expect(data?.degraded).toBe(false);
    expect(data?.summary.collectedRevenue).toBe(950);
    expect(data?.summary.paymentSplit[0].payment_type).toBe('cash');
    expect(data?.series).toHaveLength(1);
  });

  test('falls back to client aggregation and flags the result as degraded', async () => {
    mockRpc.mockResolvedValue({ data: null, error: MISSING_FUNCTION });
    mockFrom.mockImplementation((t: string) => {
      if (t === 'bills') {
        return makeQuery(t, {
          data: [
            {
              id: 'b1',
              status: 'paid',
              payment_status: 'paid',
              total_amount: 500,
              subtotal: 500,
              tax_amount: 0,
              discount_amount: 0,
              discount_type: null,
              discount_value: 0,
              settled_at: '2026-09-05T16:30:00.000Z',
              created_at: '2026-09-05T16:00:00.000Z',
            },
          ],
          error: null,
        });
      }
      if (t === 'settlements') {
        return makeQuery(t, {
          data: [{ bill_id: 'b1', payment_type: 'cash', amount: 500, created_at: '2026-09-05T16:30:00.000Z' }],
          error: null,
        });
      }
      if (t === 'expenses') {
        return makeQuery(t, {
          data: [{ id: 'e1', amount: 120, category: 'Rent', date: '2026-09-05', created_at: '2026-09-05T10:00:00.000Z' }],
          error: null,
        });
      }
      return makeQuery(t, { data: [], error: null });
    });

    const { fetchFinanceOverview } = loadService();
    const { data, error } = await fetchFinanceOverview({
      preset: 'custom',
      startDate: '2026-09-05',
      endDate: '2026-09-05',
      branchId: null,
    });

    expect(error).toBeNull();
    expect(data?.degraded).toBe(true);
    expect(data?.summary.collectedRevenue).toBe(500);
    expect(data?.summary.cashIn).toBe(500);
    expect(data?.summary.expensesTotal).toBe(120);
    expect(data?.series[0]).toMatchObject({ date: '2026-09-05', revenue: 500, orders: 1, expenses: 120, net: 380 });
  });

  test('a database failure returns a friendly message, never the raw error', async () => {
    mockFrom.mockImplementation((t: string) => makeQuery(t, { data: [], error: null }));
    // The schema probe succeeds (the RPC exists), but the real call is denied.
    // A permission error must surface, not silently fall back to client math.
    mockRpc.mockImplementation((_name: string, params: { p_start_date?: string }) =>
      params?.p_start_date === '1970-01-01'
        ? Promise.resolve({ data: {}, error: null })
        : Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied for table bills' } }),
    );

    const { detectFinanceSchema, fetchFinanceOverview } = loadService();
    expect((await detectFinanceSchema()).summaryRpc).toBe(true);
    const { data, error } = await fetchFinanceOverview({
      preset: 'custom',
      startDate: '2026-09-05',
      endDate: '2026-09-05',
      branchId: null,
    });

    expect(data).toBeNull();
    expect(error).toBe('Unable to load the finance summary.');
    expect(error).not.toContain('permission denied');
  });
});
