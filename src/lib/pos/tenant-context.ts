import { useSessionStore } from './use-session-store';
import type { UserRole } from './session-context';

/**
 * Legacy constants kept for any import sites that haven't been cleaned up yet.
 * @deprecated — Do not use. Remove imports when encountered.
 */
export const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
export const BRANCH_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

export type TenantContext = {
  tenant_id: string;
  branch_id: string;
  role: UserRole;
  /**
   * True for owner and admin roles.
   * Management queries (orders, settlements, inventory) should skip the
   * branch_id filter when this is true so owners can see across all branches.
   */
  isOwnerOrAdmin: boolean;
};

/**
 * Returns the tenant/branch context for the currently logged-in user.
 *
 * - Cashier / Manager / Kitchen: branch_id = their assigned branch.
 * - Owner / Admin: branch_id = their home branch, but isOwnerOrAdmin = true.
 *   Management service calls should check isOwnerOrAdmin and omit the
 *   branch_id filter to show cross-branch data.
 */
export function getTenantContext(): TenantContext {
  const session = useSessionStore.getState().session;

  if (!session) {
    throw new Error('Grovit Security Exception: Active session required to retrieve tenant context.');
  }

  const isOwnerOrAdmin = session.role === 'owner' || session.role === 'admin';

  return {
    tenant_id: session.tenantId,
    branch_id: session.branchId,
    role: session.role,
    isOwnerOrAdmin,
  };
}

/**
 * @deprecated — No longer needed. getTenantContext() always returns a single branch.
 * Kept temporarily to avoid breaking settlement-service.ts imports.
 */
export function requireBranchContext(context: TenantContext): string {
  return context.branch_id;
}

/**
 * @deprecated — Alias for requireBranchContext
 */
export const assertSingleBranch = requireBranchContext;
