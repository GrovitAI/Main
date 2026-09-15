/**
 * POST /api/staff/create
 *
 * Creates a Supabase Auth user + staff profile on the server with the
 * service-role key. Replaces the previous client-side `supabase.auth.signUp`
 * call, which let any signed-in user mint accounts and could swap the
 * administrator's own session for the new user's.
 *
 * Requires the Vercel environment variable SUPABASE_SERVICE_ROLE_KEY
 * (server-only, never EXPO_PUBLIC_).
 */
import { createClient } from '@supabase/supabase-js';
import {
  applyCors,
  authenticate,
  forbidden,
  getClientIp,
  isUuid,
  methodNotAllowed,
  rateLimit,
  readJsonBody,
  readString,
  resolveBranchId,
  sendJson,
  unauthorized,
  type ApiRequest,
  type ApiResponse,
} from '../../src/lib/server/api-auth';

const ROLES = ['owner', 'admin', 'manager', 'cashier', 'kitchen', 'accountant'] as const;
type Role = (typeof ROLES)[number];

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** A manager may not create a role above their own. */
function canAssignRole(callerRole: Role, targetRole: Role): boolean {
  const rank: Record<Role, number> = { owner: 5, admin: 4, manager: 3, cashier: 2, kitchen: 1, accountant: 1 };
  return rank[targetRole] < rank[callerRole] || callerRole === 'owner';
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (applyCors(req, res, 'POST')) return;
  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  const caller = await authenticate(req);
  if (!caller) {
    unauthorized(res);
    return;
  }
  if (!caller.isManager) {
    forbidden(res, 'Only owners, admins and managers can create staff accounts.');
    return;
  }

  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  if (!serviceRoleKey || !supabaseUrl) {
    sendJson(res, 503, {
      error: 'Staff creation is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY to the Vercel project environment.',
    });
    return;
  }

  try {
    const body = readJsonBody(req);
    const name = readString(body.name);
    const email = readString(body.email)?.toLowerCase() ?? null;
    const password = typeof body.password === 'string' ? body.password : '';
    const role = readString(body.role) as Role | null;

    if (!name || !email || !EMAIL_RE.test(email)) {
      sendJson(res, 400, { error: 'A name and a valid email are required.' });
      return;
    }
    if (password.length < 8) {
      sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
      return;
    }
    if (!role || !ROLES.includes(role)) {
      sendJson(res, 400, { error: 'Invalid role.' });
      return;
    }
    if (!canAssignRole(caller.role, role)) {
      forbidden(res, 'You cannot assign a role equal to or above your own.');
      return;
    }
    if (!isUuid(body.branch_id)) {
      sendJson(res, 400, { error: 'A branch is required.' });
      return;
    }
    const branchId = await resolveBranchId(caller, body.branch_id);
    if (!branchId || (!caller.isTenantWide && branchId !== caller.branchId)) {
      forbidden(res, 'You cannot add staff to that branch.');
      return;
    }

    const allowed = await rateLimit(caller.db, `staff:create:${caller.tenantId}:${getClientIp(req)}`, 20, 3600);
    if (!allowed) {
      sendJson(res, 429, { error: 'Too many accounts created recently. Please wait.' });
      return;
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // 1. Auth user (email confirmed immediately — the manager vouches for it).
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, tenant_id: caller.tenantId },
    });
    if (createError || !created.user) {
      const message = createError?.message ?? '';
      const duplicate = /already|exists|registered/i.test(message);
      console.error('[API /staff/create] createUser failed:', createError?.status, message);
      sendJson(res, duplicate ? 409 : 500, {
        error: duplicate ? 'An account with this email already exists.' : 'Unable to create the login account.',
      });
      return;
    }

    // 2. Staff profile
    const { data: staff, error: staffError } = await admin
      .from('staff')
      .insert({
        tenant_id: caller.tenantId,
        branch_id: branchId,
        auth_user_id: created.user.id,
        name,
        email,
        role,
        status: 'active',
      })
      .select('id, tenant_id, branch_id, auth_user_id, name, email, role, status, created_at, last_login_at')
      .single();

    if (staffError || !staff) {
      console.error('[API /staff/create] staff insert failed:', staffError?.code, staffError?.message);
      // Roll back the auth user so the email is not left orphaned.
      await admin.auth.admin.deleteUser(created.user.id);
      sendJson(res, 500, { error: 'Unable to save the staff profile.' });
      return;
    }

    sendJson(res, 200, { data: staff });
  } catch (err) {
    console.error('[API /staff/create] Exception:', err instanceof Error ? err.message : err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
}
