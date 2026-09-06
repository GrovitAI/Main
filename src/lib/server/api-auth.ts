/**
 * Server-only helpers for the Vercel serverless functions under /api.
 *
 * Every API request must carry `Authorization: Bearer <Supabase access token>`.
 * We verify the token with Supabase Auth, resolve the caller's `staff` row
 * (tenant, branch, role) and hand back a Supabase client that acts AS THAT
 * USER, so Row Level Security applies to everything the handler does.
 *
 * Tenant and branch are therefore derived from the verified identity, never
 * from the request body.
 *
 * Node.js only — never import from React Native code.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ApiRequest = {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

export type StaffRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'kitchen';

export type AuthenticatedCaller = {
  /** Supabase client bound to the caller's JWT — RLS enforced. */
  db: SupabaseClient;
  userId: string;
  staffId: string;
  tenantId: string;
  branchId: string;
  role: StaffRole;
  name: string;
  email: string | null;
  /** owner / admin: may act on any branch of the tenant. */
  isTenantWide: boolean;
  /** owner / admin / manager. */
  isManager: boolean;
};

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const DEFAULT_ALLOWED_ORIGINS = ['https://dinein.grovit.com'];

function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function allowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_ORIGINS;
}

function headerValue(req: ApiRequest, name: string): string | undefined {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Applies a strict CORS policy. Returns true when the request was a
 * pre-flight that has already been answered.
 */
export function applyCors(req: ApiRequest, res: ApiResponse, methods: string): boolean {
  const origin = headerValue(req, 'origin');
  const isAllowed =
    !!origin &&
    (allowedOrigins().includes(origin) ||
      (!isProduction() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) && allowedOrigins().includes('*.vercel.app'));

  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', `${methods},OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.statusCode = isAllowed || !origin ? 204 : 403;
    res.end();
    return true;
  }
  return false;
}

export function sendJson(res: ApiResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function readJsonBody(req: ApiRequest): Record<string, unknown> {
  const body = req.body;
  if (body && typeof body === 'object') {
    return body as Record<string, unknown>;
  }
  if (typeof body === 'string' && body.length > 0) {
    try {
      const parsed: unknown = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function getClientIp(req: ApiRequest): string {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headerValue(req, 'x-real-ip') || 'unknown';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Builds a Supabase client that sends the caller's JWT on every request.
 * RLS policies evaluate against that user.
 */
export function createUserScopedClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Verifies the bearer token and resolves the caller's staff profile.
 * Returns null when the request is not authenticated.
 */
export async function authenticate(req: ApiRequest): Promise<AuthenticatedCaller | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[api-auth] Supabase URL / anon key are not configured on the server.');
    return null;
  }

  const authHeader = headerValue(req, 'authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (token.length === 0) return null;

  const db = createUserScopedClient(token);
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) {
    return null;
  }

  const { data: staff, error: staffError } = await db
    .from('staff')
    .select('id, tenant_id, branch_id, role, name, email')
    .eq('auth_user_id', userData.user.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (staffError || !staff) {
    return null;
  }

  const role = String(staff.role) as StaffRole;
  const isTenantWide = role === 'owner' || role === 'admin';
  return {
    db,
    userId: userData.user.id,
    staffId: String(staff.id),
    tenantId: String(staff.tenant_id),
    branchId: String(staff.branch_id),
    role,
    name: typeof staff.name === 'string' ? staff.name : 'Staff',
    email: typeof staff.email === 'string' ? staff.email : null,
    isTenantWide,
    isManager: isTenantWide || role === 'manager',
  };
}

/**
 * Resolves the branch a request may act on. Branch-bound roles are always
 * pinned to their own branch; tenant-wide roles may name another branch of
 * the same tenant (verified through RLS-scoped lookup).
 */
export async function resolveBranchId(
  caller: AuthenticatedCaller,
  requestedBranchId: unknown
): Promise<string | null> {
  if (!caller.isTenantWide) {
    return caller.branchId;
  }
  if (!isUuid(requestedBranchId) || requestedBranchId === caller.branchId) {
    return caller.branchId;
  }
  const { data } = await caller.db
    .from('branches')
    .select('id')
    .eq('id', requestedBranchId)
    .eq('tenant_id', caller.tenantId)
    .maybeSingle();
  return data ? requestedBranchId : null;
}

/**
 * Durable fixed-window rate limit backed by the `check_rate_limit` RPC.
 * Fails open (allows) if the RPC is unavailable, but logs loudly.
 */
export async function rateLimit(
  db: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await db.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('[api-auth] check_rate_limit unavailable:', error.message);
    return true;
  }
  return data !== false;
}

export function unauthorized(res: ApiResponse): void {
  sendJson(res, 401, { error: 'Sign in required.' });
}

export function forbidden(res: ApiResponse, message = 'You do not have permission to do this.'): void {
  sendJson(res, 403, { error: message });
}

export function methodNotAllowed(res: ApiResponse): void {
  sendJson(res, 405, { error: 'Method not allowed' });
}
