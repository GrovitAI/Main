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
export async function apiFetch<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  if (!token) {
    return { data: null, error: 'Your session has expired. Please sign in again.', status: 401 };
  }

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
