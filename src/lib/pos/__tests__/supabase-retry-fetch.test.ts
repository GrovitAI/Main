import { isRetryableRead, retryingFetch, type Fetch } from '../supabase-retry-fetch';

const BASE = 'https://example.supabase.co';
const ok = (status = 200): Response => ({ status } as Response);

describe('isRetryableRead', () => {
  it('retries table reads and read-only functions only', () => {
    expect(isRetryableRead(`${BASE}/rest/v1/kitchen_items?select=*`, 'GET')).toBe(true);
    expect(isRetryableRead(`${BASE}/rest/v1/rpc/kitchen_my_access`, 'POST')).toBe(true);
    expect(isRetryableRead(`${BASE}/rest/v1/rpc/kitchen_invoice_workspace`, 'POST')).toBe(true);
    expect(isRetryableRead(`${BASE}/rest/v1/rpc/kitchen_post_entry`, 'POST')).toBe(false);
    expect(isRetryableRead(`${BASE}/rest/v1/kitchen_items`, 'POST')).toBe(false);
    expect(isRetryableRead(`${BASE}/rest/v1/kitchen_items?id=eq.1`, 'PATCH')).toBe(false);
    expect(isRetryableRead(`${BASE}/auth/v1/token?grant_type=refresh_token`, 'POST')).toBe(false);
  });
});

describe('retryingFetch', () => {
  it('tries a read again after a network failure', async () => {
    const base = jest.fn<Promise<Response>, Parameters<Fetch>>()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(ok());
    const res = await retryingFetch(base, [0, 0])(`${BASE}/rest/v1/rpc/kitchen_my_access`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('tries a read again on a gateway error, and gives up after the last wait', async () => {
    const base = jest.fn<Promise<Response>, Parameters<Fetch>>().mockResolvedValue(ok(503));
    const res = await retryingFetch(base, [0, 0])(`${BASE}/rest/v1/kitchen_items`);
    expect(res.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('throws the last failure when every try fails', async () => {
    const base = jest.fn<Promise<Response>, Parameters<Fetch>>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(retryingFetch(base, [0, 0])(`${BASE}/rest/v1/kitchen_items`)).rejects.toThrow('Failed to fetch');
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('never repeats a write', async () => {
    const base = jest.fn<Promise<Response>, Parameters<Fetch>>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(retryingFetch(base, [0, 0])(`${BASE}/rest/v1/rpc/kitchen_post_entry`, { method: 'POST' })).rejects.toThrow();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('does not retry a request the app called off', async () => {
    const controller = new AbortController();
    controller.abort();
    const base = jest.fn<Promise<Response>, Parameters<Fetch>>().mockRejectedValue(new Error('Aborted'));
    await expect(retryingFetch(base, [0, 0])(`${BASE}/rest/v1/kitchen_items`, { signal: controller.signal })).rejects.toThrow('Aborted');
    expect(base).toHaveBeenCalledTimes(1);
  });
});
