import type { Branch } from './inventory-service';

/** Branches that supply the outlets. A transfer request is raised against one of these. */
const SUPPLY_BRANCH_TYPES: ReadonlySet<Branch['branch_type']> = new Set(['CENTRAL_KITCHEN', 'WAREHOUSE']);

export function isSupplyBranch(branch: Pick<Branch, 'branch_type'>): boolean {
  return SUPPLY_BRANCH_TYPES.has(branch.branch_type);
}

/**
 * Whether the branch being viewed may raise a transfer request. It must be an
 * outlet — a supply branch fulfils requests, it does not raise them — and the
 * tenant must have a supply branch to request from. Until the branch list has
 * loaded nothing is known, so the answer is no.
 */
export function canRaiseTransferRequest(
  viewedBranchId: string,
  branches: readonly Pick<Branch, 'id' | 'branch_type'>[]
): boolean {
  const viewed = branches.find((b) => b.id === viewedBranchId);
  if (!viewed || isSupplyBranch(viewed)) return false;
  return branches.some(isSupplyBranch);
}
