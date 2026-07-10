import { supabase } from './supabase';
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
      return { data: [], error: error.message };
    }

    const mapped: StaffMember[] = (data ?? []).map((row: any) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      branch_id: row.branch_id,
      auth_user_id: row.auth_user_id,
      name: row.name,
      email: row.email,
      role: row.role as UserRole,
      status: row.status,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
      branch_name: row.branches?.name ?? '—',
    }));

    return { data: mapped, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch staff.';
    console.error('[staff-service] fetchStaff exception:', err);
    return { data: [], error: msg };
  }
}

/**
 * Create a new staff member with a Supabase Auth account.
 * The auth user is created first, then the staff record is inserted.
 *
 * Note: This requires the service-role key in a backend function for production.
 * For now it uses the Supabase Admin API via signUp (works when email confirmations are disabled).
 */
export async function createStaff(
  payload: CreateStaffPayload
): Promise<{ data: StaffMember | null; error: string | null }> {
  try {
    const { tenant_id } = getTenantContext();

    // 1. Create the Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    });

    if (authError || !authData.user) {
      console.error('[staff-service] createStaff auth error:', authError);
      return { data: null, error: authError?.message ?? 'Failed to create auth user.' };
    }

    const authUserId = authData.user.id;

    // 2. Insert the staff record
    const { data, error } = await supabase
      .from('staff')
      .insert({
        tenant_id,
        branch_id: payload.branch_id,
        auth_user_id: authUserId,
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        role: payload.role,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('[staff-service] createStaff insert error:', error);
      return { data: null, error: error.message };
    }

    return { data: data as StaffMember, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create staff member.';
    console.error('[staff-service] createStaff exception:', err);
    return { data: null, error: msg };
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
      return { data: null, error: error.message };
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
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to deactivate staff member.';
    console.error('[staff-service] deactivateStaff exception:', err);
    return { error: msg };
  }
}
