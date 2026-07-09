import { useSessionStore } from './use-session-store';
import type { BranchScope } from './session-context';

export const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
export const BRANCH_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

/**
 * Compatibility flag for gradual migration of legacy services.
 * TODO: Remove before v1.0 release.
 * When set to true (Option B): ALL branch scope falls back to homeBranchId to keep legacy services compiling.
 * Once all services are migrated to requireBranchContext(), this flag will be removed, and
 * TenantContext.branch_id will be changed to string | undefined for compile-time safety.
 */
const ALLOW_LEGACY_ALL_BRANCH_FALLBACK = true;

export type TenantContext = {
  tenant_id: string;
  branch_id: string; // Kept as strictly-typed string for backward compatibility
  branch_scope: BranchScope;
};

export function getTenantContext(): TenantContext {
  const session = useSessionStore.getState().session;
  
  if (session) {
    let branchId: string;
    if (session.branchScope.mode === 'single') {
      branchId = session.branchScope.branchId;
    } else {
      // In ALL branches mode, we use the fallback homeBranchId during migration
      branchId = session.homeBranchId;
    }
      
    return {
      tenant_id: session.tenantId,
      branch_id: branchId,
      branch_scope: session.branchScope,
    };
  }
  
  // ============================================================================
  // TEMPORARY DEV FALLBACK
  // Developer Rule: No new feature may rely on this fallback.
  // The fallback exists only until Phase 2.5G.
  // ============================================================================
  return {
    tenant_id: TENANT_ID,
    branch_id: BRANCH_ID,
    branch_scope: { mode: 'single', branchId: BRANCH_ID },
  };
}

/**
 * Security Guard: Asserts that the current session is operating on a single branch scope.
 * Throws a system exception if invoked under ALL branches scope.
 *
 * EVERY mutating/writing service call must invoke this helper first to obtain its target branch ID.
 * Example:
 *   const ctx = getTenantContext();
 *   const branchId = requireBranchContext(ctx);
 */
export function requireBranchContext(context: TenantContext): string {
  if (context.branch_scope.mode === 'all') {
    throw new Error('Grovit Security Guard: Transactional operations require a selected branch.');
  }
  return context.branch_id;
}

/**
 * Alias for requireBranchContext
 */
export const assertSingleBranch = requireBranchContext;
