import type { UserRole } from './session-context';

/**
 * Who may look across branches: pick another branch, or see "All branches".
 *
 * Owners only. An admin runs one branch, so reports and finance show them that
 * branch and nothing else, the same as a manager or cashier. Every branch
 * picker and every service that resolves a branch scope asks this one
 * question, so the rule cannot drift between screens.
 */
export function canViewAllBranches(role: UserRole | null | undefined): boolean {
  return role === 'owner';
}
