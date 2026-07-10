import { useSessionStore } from './use-session-store';

/**
 * Legacy constants kept for any import sites that haven't been cleaned up yet.
 * @deprecated — Do not use. Remove imports when encountered.
 */
export const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
export const BRANCH_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

export type TenantContext = {
  tenant_id: string;
  branch_id: string;
};

/**
 * Returns the tenant_id and branch_id for the currently logged-in user.
 *
 * Every operational user (cashier, manager, kitchen, owner) is permanently
 * bound to a single branch via their staff record. There is no branch switching
 * in the application context — branch isolation is a property of the login, not the UI.
 *
 * Use this in every Supabase query:
 *   const { tenant_id, branch_id } = getTenantContext();
 *   supabase.from('table').select('*').eq('tenant_id', tenant_id).eq('branch_id', branch_id)
 */
export function getTenantContext(): TenantContext {
  const session = useSessionStore.getState().session;

  if (!session) {
    throw new Error('Grovit Security Exception: Active session required to retrieve tenant context.');
  }

  return {
    tenant_id: session.tenantId,
    branch_id: session.branchId,
  };
}

/**
 * @deprecated — No longer needed. getTenantContext() always returns a single branch.
 * Kept temporarily to avoid breaking settlement-service.ts imports.
 * Remove after settlement-service.ts is updated.
 */
export function requireBranchContext(context: TenantContext): string {
  return context.branch_id;
}

/**
 * @deprecated — Alias for requireBranchContext
 */
export const assertSingleBranch = requireBranchContext;
