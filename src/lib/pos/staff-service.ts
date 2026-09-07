import { supabase } from './supabase';
import { apiFetch } from './api-client';
import { getTenantContext } from './tenant-context';
import type { UserRole } from './session-context';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffMember = {
  id: string;
  tenant_id: string;
  branch_id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  created_at: string;
  last_login_at: string | null;
  // Joined field when fetched with branch data
  branch_name?: string;
};

export type CreateStaffPayload = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branch_id: string;
};

export type UpdateStaffPayload = {
  name?: string;
  role?: UserRole;
  branch_id?: string;
  status?: 'active' | 'inactive';
};

/** Shape returned by the staff list query (staff joined with its branch). */
type StaffQueryRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  /** PostgREST returns the embedded branch as an array. */
  branches?: { name?: string | null }[] | { name?: string | null } | null;
};

/** Reads the joined branch name whether PostgREST embeds one row or an array. */
function branchNameOf(row: StaffQueryRow): string | null {
  const branches = row.branches;
  if (Array.isArray(branches)) {
    return branches[0]?.name ?? null;
  }
  return branches?.name ?? null;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Fetch all staff for the current tenant, joined with branch name.
 */
export async function fetchStaff(): Promise<{ data: StaffMember[]; error: string | null }> {
  try {
    const { tenant_id } = getTenantContext();

    const { data, error } = await supabase
      .from('staff')
      .select(`
        id,
        tenant_id,
        branch_id,
        auth_user_id,
        name,
        email,
        role,
        status,
        created_at,
        last_login_at,
        branches ( name )
      `)
      .eq('tenant_id', tenant_id)
      .is('deleted_at', null)
      .order('name');

    if (error) {
      console.error('[staff-service] fetchStaff error:', error);
      return { data: [], error: 'Unable to load staff.' };
    }

    const mapped: StaffMember[] = (data ?? []).map((row: StaffQueryRow) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      auth_user_id: row.auth_user_id,
      name: row.name,
      email: row.email,
      role: row.role as UserRole,
      status: row.status === 'active' ? 'active' : 'inactive',
      created_at: row.created_at,
      last_login_at: row.last_login_at,
      branch_name: branchNameOf(row) ?? '—',
    }));

    return { data: mapped, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch staff.';
    console.error('[staff-service] fetchStaff exception:', err);
    return { data: [], error: msg };
  }
}

/**
 * Create a new staff member. The auth account and the staff profile are created
 * server-side (/api/staff/create) with the service-role key, after the caller's
 * own role has been verified. The administrator's session is never touched.
 */
export async function createStaff(
  payload: CreateStaffPayload
): Promise<{ data: StaffMember | null; error: string | null }> {
  try {
    const res = await apiFetch<{ data: StaffMember }>('/api/staff/create', {
      method: 'POST',
      body: {
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        role: payload.role,
        branch_id: payload.branch_id,
      },
    });
    if (res.error || !res.data?.data) {
      return { data: null, error: res.error ?? 'Failed to create staff member.' };
    }
    return { data: res.data.data, error: null };
  } catch (err) {
    console.error('[staff-service] createStaff exception:', err);
    return { data: null, error: 'Failed to create staff member.' };
  }
}

/**
 * Update an existing staff member's role, branch, or status.
 * Does NOT update password or email (requires admin flow).
 */
export async function updateStaff(
  staffId: string,
  payload: UpdateStaffPayload
): Promise<{ data: StaffMember | null; error: string | null }> {
  try {
    const { tenant_id } = getTenantContext();

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates['name'] = payload.name.trim();
    if (payload.role !== undefined) updates['role'] = payload.role;
    if (payload.branch_id !== undefined) updates['branch_id'] = payload.branch_id;
    if (payload.status !== undefined) updates['status'] = payload.status;

    const { data, error } = await supabase
      .from('staff')
      .update(updates)
      .eq('id', staffId)
      .eq('tenant_id', tenant_id)
      .select()
      .single();

    if (error) {
      console.error('[staff-service] updateStaff error:', error);
      return { data: null, error: 'Unable to update staff member.' };
    }

    return { data: data as StaffMember, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update staff member.';
    console.error('[staff-service] updateStaff exception:', err);
    return { data: null, error: msg };
  }
}

/**
 * Soft-delete a staff member (sets deleted_at timestamp and status to inactive).
 * Does NOT remove the auth user.
 */
export async function deactivateStaff(
  staffId: string
): Promise<{ error: string | null }> {
  try {
    const { tenant_id } = getTenantContext();

    const { error } = await supabase
      .from('staff')
      .update({
        status: 'inactive',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', staffId)
      .eq('tenant_id', tenant_id);

    if (error) {
      console.error('[staff-service] deactivateStaff error:', error);
      return { error: 'Unable to deactivate staff member.' };
    }

    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to deactivate staff member.';
    console.error('[staff-service] deactivateStaff exception:', err);
    return { error: msg };
  }
}
