import { apiFetch, SIGNED_OUT_MESSAGE } from '@/lib/pos/api-client';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: { auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-staging-token' } } }),
    refreshSession: jest.fn(),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  } },
}));

describe('API destination for staging web', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalEnv = process.env.EXPO_PUBLIC_APP_ENV;
  const originalApi = process.env.EXPO_PUBLIC_API_BASE_URL;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true, value: { location: { origin: 'http://localhost:8081' } },
    });
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: null }),
    } as Response);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalEnv === undefined) delete process.env.EXPO_PUBLIC_APP_ENV;
    else process.env.EXPO_PUBLIC_APP_ENV = originalEnv;
    if (originalApi === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = originalApi;
  });

  it('routes staging web to its explicit local API with the existing session token', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'staging';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8083/';
    await apiFetch('/api/staff/create', { method: 'POST', body: {} });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8083/api/staff/create', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-staging-token' }),
    }));
  });

  it.each([
    'https://www.leleban.grovitai.com',
    'http://localhost.evil.example:8083',
    'http://user:password@localhost:8083',
    'http://localhost:8083/path',
    'http://localhost:8083/?secret=value',
    'not a URL',
  ])('never sends the staging token to an unsafe override: %s', async (api) => {
    process.env.EXPO_PUBLIC_APP_ENV = 'staging';
    process.env.EXPO_PUBLIC_API_BASE_URL = api;
    await apiFetch('/api/staff/create');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8081/api/staff/create', expect.anything());
  });

  it('keeps production web on its own origin even with a local override', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true, value: { location: { origin: 'https://www.leleban.grovitai.com' } },
    });
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:8083';
    await apiFetch('/api/staff/create');
    expect(fetchMock).toHaveBeenCalledWith('https://www.leleban.grovitai.com/api/staff/create', expect.anything());
  });
});

describe('a sign-in the server cannot verify (task 253)', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://www.leleban.grovitai.com' } } });
    fetchMock = jest.spyOn(globalThis, 'fetch');
    (supabase.auth.signOut as jest.Mock).mockClear();
  });
  afterEach(() => {
    fetchMock.mockRestore();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  it('renews the sign-in once and retries with the new token', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Sign in required.' })).mockResolvedValueOnce(reply(200, [{ id: 1 }]));
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({ data: { session: { access_token: 'fresh-token' } }, error: null });
    const res = await apiFetch<{ id: number }[]>('/api/printers');
    expect(res).toEqual({ data: [{ id: 1 }], error: null, status: 200 });
    expect(fetchMock).toHaveBeenLastCalledWith('https://www.leleban.grovitai.com/api/printers', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
    }));
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('signs out on this device only when the session is gone', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Sign in required.' }));
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({ data: { session: null }, error: { message: 'Invalid Refresh Token: Refresh Token Not Found' } });
    const res = await apiFetch('/api/printers');
    expect(res).toEqual({ data: null, error: SIGNED_OUT_MESSAGE, status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
