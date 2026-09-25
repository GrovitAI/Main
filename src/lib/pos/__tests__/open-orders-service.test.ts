/**
 * fetchOpenOrders(): the till's active-orders query must filter by status in
 * the database and always scope to the session's branch. Supabase is faked
 * with a chainable query recorder so we can assert exactly which filters
 * were sent.
 */
/* eslint-disable import/first, @typescript-eslint/no-require-imports --
   jest.mock() calls are hoisted above imports and their factories must use
   require(). */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('../tenant-context', () => ({ getTenantContext: jest.fn() }));
jest.mock('../supabase-debug', () => ({ logSupabaseError: jest.fn() }));

import { supabase } from '../supabase';
import { getTenantContext } from '../tenant-context';
import { ACTIVE_ORDER_STATUSES, fetchOpenOrders } from '../open-orders-service';

const mockFrom = supabase.from as unknown as jest.Mock;
const mockTenantContext = getTenantContext as unknown as jest.Mock;

type Call = [string, unknown[]];

/** A thenable that records every PostgREST filter applied to it. */
function makeQuery(result: { data: unknown; error: unknown }): { query: Record<string, unknown>; calls: Call[] } {
  const calls: Call[] = [];
  const query: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    calls.push([name, args]);
    return query;
  };
  for (const name of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'range']) {
    query[name] = chain(name);
  }
  query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { query, calls };
}

function eqFilters(calls: Call[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, args] of calls) {
    if (name === 'eq' && typeof args[0] === 'string') out[args[0]] = args[1];
  }
  return out;
}

function inFilters(calls: Call[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, args] of calls) {
    if (name === 'in' && typeof args[0] === 'string') out[args[0]] = args[1];
  }
  return out;
}

const OWNER = { tenant_id: 'tenant-1', branch_id: 'branch-1', role: 'owner', isOwnerOrAdmin: true, canViewAllBranches: true };
const CASHIER = { tenant_id: 'tenant-1', branch_id: 'branch-1', role: 'cashier', isOwnerOrAdmin: false, canViewAllBranches: false };

const ROWS = [
  { id: 'o-1', status: 'unpaid', tenant_id: 'tenant-1', branch_id: 'branch-1', created_at: '2026-09-25T10:00:00Z' },
  { id: 'o-2', status: 'in_kitchen', tenant_id: 'tenant-1', branch_id: 'branch-1', created_at: '2026-09-25T09:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockTenantContext.mockReturnValue(CASHIER);
});

describe('ACTIVE_ORDER_STATUSES', () => {
  it('is exactly the live billing statuses, excluding parked and settled ones', () => {
    expect([...ACTIVE_ORDER_STATUSES].sort()).toEqual(['in_kitchen', 'open', 'unpaid']);
    for (const settled of ['paid', 'completed', 'cancelled', 'held', 'draft']) {
      expect(ACTIVE_ORDER_STATUSES).not.toContain(settled);
    }
  });
});

describe('fetchOpenOrders', () => {
  it('filters by status in the database, not on the device', async () => {
    const { query, calls } = makeQuery({ data: ROWS, error: null });
    mockFrom.mockReturnValue(query);

    const result = await fetchOpenOrders();

    expect(mockFrom).toHaveBeenCalledWith('open_orders');
    expect(inFilters(calls)).toEqual({ status: [...ACTIVE_ORDER_STATUSES] });
    expect(result).toEqual({ data: ROWS, error: null });
  });

  it('scopes a cashier to tenant and branch', async () => {
    const { query, calls } = makeQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await fetchOpenOrders();

    expect(eqFilters(calls)).toEqual({ tenant_id: 'tenant-1', branch_id: 'branch-1' });
  });

  it('scopes an owner to their branch as well, since a till belongs to one branch', async () => {
    mockTenantContext.mockReturnValue(OWNER);
    const { query, calls } = makeQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await fetchOpenOrders();

    expect(eqFilters(calls)).toEqual({ tenant_id: 'tenant-1', branch_id: 'branch-1' });
  });

  it('orders newest first', async () => {
    const { query, calls } = makeQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await fetchOpenOrders();

    expect(calls).toContainEqual(['order', ['created_at', { ascending: false }]]);
  });

  it('maps a database error to a plain message without leaking it', async () => {
    const { query } = makeQuery({ data: null, error: { code: '42501', message: 'permission denied for table open_orders' } });
    mockFrom.mockReturnValue(query);

    const result = await fetchOpenOrders();

    expect(result).toEqual({ data: null, error: 'Unable to load orders.' });
  });

  it('returns an empty list, not null, when nothing is active', async () => {
    const { query } = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(query);

    const result = await fetchOpenOrders();

    expect(result).toEqual({ data: [], error: null });
  });
});
