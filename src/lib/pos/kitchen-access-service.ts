/**
 * Kitchen permissions and day locks: what the signed-in person may do, and
 * the owner's team and lock settings. The database enforces every rule
 * (supabase/migrations/20261012140000_kitchen_access.sql and
 * 20261012140100_kitchen_access_enforce.sql); the app only shows and hides.
 */
import { supabase } from './supabase';
import { getTenantContext } from './tenant-context';
import { kitchenBranch } from './kitchen-service';
import { describeKitchenError } from './kitchen-utils';
import { fullAccess, isKitchenPermission } from './kitchen-access-utils';
import type { KitchenAccess, KitchenAuditRow, KitchenLockInput, KitchenPermission, KitchenPreset, KitchenTeamMember } from './kitchen-access-types';
import type { ServiceResult } from './kitchen-types';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const PRESETS: readonly KitchenPreset[] = ['manager', 'clerk', 'storekeeper', 'accounts', 'custom'];
const toPreset = (v: unknown): KitchenPreset => (typeof v === 'string' && (PRESETS as readonly string[]).includes(v) ? (v as KitchenPreset) : 'custom');
const toPermissions = (v: unknown): KitchenPermission[] => (Array.isArray(v) ? v.filter(isKitchenPermission) : []);

function scope(): { p_tenant_id: string; p_branch_id: string } {
  const { tenant_id } = getTenantContext();
  return { p_tenant_id: tenant_id, p_branch_id: kitchenBranch().id };
}

function explain(error: unknown, fallback: string): string {
  const e = isRecord(error) ? error : null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  console.error('[kitchen-access]', code || 'UNKNOWN', message);
  return describeKitchenError(`${code} ${message}`, fallback);
}

/** Missing on a database without the permissions update: the kitchen then works as before. */
const notInstalled = (error: unknown): boolean => isRecord(error) && (error.code === 'PGRST202' || error.code === '42883');

export function parseAccess(value: unknown, today: string): KitchenAccess {
  if (!isRecord(value)) return fullAccess(today);
  const hour = typeof value.open_until_hour === 'number' ? value.open_until_hour : 11;
  return {
    role: str(value.role) ?? 'kitchen',
    isOwner: value.is_owner === true,
    preset: toPreset(value.preset),
    permissions: toPermissions(value.permissions),
    today: str(value.today) ?? today,
    lockedThrough: str(value.locked_through),
    autoLock: value.auto_lock === true,
    openUntilHour: hour,
    lockThrough: str(value.lock_through),
    lockUpdatedBy: str(value.lock_updated_by),
    lockUpdatedAt: str(value.lock_updated_at),
  };
}

export async function fetchKitchenAccess(today: string): Promise<ServiceResult<KitchenAccess>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_my_access', scope());
    if (error) return notInstalled(error) ? { data: fullAccess(today), error: null } : { data: null, error: explain(error, 'Unable to load your kitchen permissions.') };
    return { data: parseAccess(data, today), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load your kitchen permissions.') };
  }
}

export async function fetchKitchenTeam(): Promise<ServiceResult<KitchenTeamMember[]>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_team', scope());
    if (error) return { data: null, error: explain(error, 'Unable to load the kitchen team.') };
    const rows = Array.isArray(data) ? data.filter(isRecord) : [];
    return {
      data: rows.map((r) => ({
        staffId: String(r.staff_id ?? ''),
        name: str(r.name) ?? 'Staff',
        email: str(r.email),
        lastLoginAt: str(r.last_login_at),
        preset: toPreset(r.preset),
        permissions: toPermissions(r.permissions),
        updatedBy: str(r.updated_by),
        updatedAt: str(r.updated_at),
      })).filter((m) => m.staffId),
      error: null,
    };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the kitchen team.') };
  }
}

export async function saveKitchenStaffAccess(staffId: string, preset: KitchenPreset, permissions: readonly KitchenPermission[]): Promise<ServiceResult<true>> {
  try {
    const { error } = await supabase.rpc('kitchen_set_staff_access', { ...scope(), p_staff_id: staffId, p_preset: preset, p_permissions: [...permissions] });
    if (error) return { data: null, error: explain(error, 'Unable to save the permissions.') };
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to save the permissions.') };
  }
}

export async function saveKitchenLock(input: KitchenLockInput, today: string): Promise<ServiceResult<KitchenAccess>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_set_lock', { ...scope(), p_auto_lock: input.autoLock, p_open_until_hour: input.openUntilHour, p_lock_through: input.lockThrough });
    if (error) return { data: null, error: explain(error, 'Unable to save the day lock.') };
    return { data: parseAccess(data, today), error: null };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to save the day lock.') };
  }
}

export async function fetchKitchenAudit(page = 0): Promise<ServiceResult<KitchenAuditRow[]>> {
  try {
    const { data, error } = await supabase.rpc('kitchen_audit_page', { ...scope(), p_page: page });
    if (error) return { data: null, error: explain(error, 'Unable to load the change log.') };
    const rows = Array.isArray(data) ? data.filter(isRecord) : [];
    return {
      data: rows.map((r) => ({
        id: String(r.id ?? ''),
        createdAt: str(r.created_at) ?? '',
        actorName: str(r.actor_name) ?? 'Staff',
        action: str(r.action) ?? '',
        subject: str(r.subject) ?? '',
        onDate: str(r.on_date),
        reason: str(r.reason),
        details: isRecord(r.details) ? r.details : {},
      })),
      error: null,
    };
  } catch (err) {
    return { data: null, error: explain(err, 'Unable to load the change log.') };
  }
}
