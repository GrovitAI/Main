import printers from '../../../../api/printers';
import printjobs from '../../../../api/printjobs';
import { authenticate, forbidden, readJsonBody } from '@/lib/server/api-auth';
import type { ApiResponse } from '@/lib/server/api-auth';

jest.mock('@/lib/server/api-auth', () => ({
  applyCors: jest.fn(() => false), authenticate: jest.fn(), forbidden: jest.fn(),
  methodNotAllowed: jest.fn(), rateLimit: jest.fn(async () => true),
  readJsonBody: jest.fn(), sendJson: jest.fn(), unauthorized: jest.fn(),
}));
const filters = new Map<string, unknown>();
let registeredBranch = 'branch-a';
function printerQuery(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'limit']) chain[method] = () => chain;
  chain.eq = (name: string, value: unknown) => { filters.set(name, value); return chain; };
  chain.maybeSingle = async () => ({ data: filters.get('tenant_id') === 'tenant' && filters.get('branch_id') === registeredBranch ? { id: 'printer' } : null, error: null });
  return chain;
}
let fetchMock: jest.SpyInstance;
const previousKey = process.env.PRINTNODE_API_KEY;
const response: ApiResponse = { statusCode: 200, setHeader: jest.fn(), end: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks(); filters.clear(); registeredBranch = 'branch-a';
  process.env.PRINTNODE_API_KEY = 'local-test-key';
  (authenticate as jest.Mock).mockResolvedValue({ tenantId: 'tenant', branchId: 'branch-a', isTenantWide: true, isManager: true, db: { from: printerQuery } });
  (readJsonBody as jest.Mock).mockReturnValue({ printerId: 123, base64Content: 'dGVzdA==' });
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response);
});
afterEach(() => { fetchMock.mockRestore(); if (previousKey === undefined) delete process.env.PRINTNODE_API_KEY; else process.env.PRINTNODE_API_KEY = previousKey; });
test('even tenant-wide owners cannot send to another branch printer', async () => {
  registeredBranch = 'branch-b'; await printjobs({ method: 'POST' }, response);
  expect(filters.get('branch_id')).toBe('branch-a'); expect(forbidden).toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});
test('printer status is restricted to the signed-in branch', async () => {
  registeredBranch = 'branch-b'; await printers({ method: 'GET', query: { id: '123' } }, response);
  expect(filters.get('tenant_id')).toBe('tenant'); expect(filters.get('branch_id')).toBe('branch-a');
  expect(forbidden).toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});
test('a registered own-branch printer keeps the existing print workflow', async () => {
  await printjobs({ method: 'POST' }, response);
  expect(forbidden).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledWith('https://api.printnode.com/printjobs', expect.objectContaining({ method: 'POST' }));
});
