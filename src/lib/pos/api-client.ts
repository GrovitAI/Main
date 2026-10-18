/**
 * Authenticated fetch for the app's own serverless API (/api/*).
 *
 * Every request carries the current Supabase access token as a Bearer
 * header. The server verifies it and derives tenant / branch / role from the
 * caller's staff profile, so callers must never send those in the body as a
 * source of truth (they are ignored server-side).
 */
import { supabase } from './supabase';

export type ApiResult<T> = { data: T | null; error: string | null; status: number };

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    // Expo does not serve Vercel functions. The staging launcher runs those
    // separately on loopback; production web requests remain same-origin.
    const stagingApi = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (process.env.EXPO_PUBLIC_APP_ENV === 'staging' && stagingApi) {
      try {
        const url = new URL(stagingApi);
        if (
          url.protocol === 'http:' &&
          (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
          !url.username && !url.password && url.pathname === '/' &&
          !url.search && !url.hash
        ) {
          return url.origin;
        }
      } catch {
        // An invalid override must never redirect the caller's access token.
      }
    }
    return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.leleban.grovitai.com';
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Performs an authenticated JSON request to /api/<path>.
 * Never throws; network and HTTP failures come back as `error`.
 */
/** Said when this device's sign-in has been ended (task 253). */
export const SIGNED_OUT_MESSAGE = 'This device was signed out. Sign in again.';

export async function apiFetch<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  if (!token) {
    return { data: null, error: 'Your session has expired. Please sign in again.', status: 401 };
  }
  const first = await send<T>(path, init, token);
  if (first.status !== 401) return first;

  // Task 253: the server could not verify the sign-in. Renew it once and try again. When the
  // session itself is gone (ended on Supabase, for example by a sign-out elsewhere), sign out on
  // this device so the login screen shows, rather than a screen that keeps failing quietly.
  const { data, error } = await supabase.auth.refreshSession();
  const renewed = data.session?.access_token ?? null;
  if (error || !renewed) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return { data: null, error: SIGNED_OUT_MESSAGE, status: 401 };
  }
  return send<T>(path, init, renewed);
}

async function send<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown },
  token: string,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : `Request failed (${response.status}).`;
      return { data: null, error: message, status: response.status };
    }

    return { data: payload as T, error: null, status: response.status };
  } catch {
    return { data: null, error: 'Network error. Please check your connection.', status: 0 };
  }
}
