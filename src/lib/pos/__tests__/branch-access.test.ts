import { canViewAllBranches } from '@/lib/pos/branch-access';

describe('canViewAllBranches', () => {
  it('lets the owner look across branches', () => {
    expect(canViewAllBranches('owner')).toBe(true);
  });

  it('keeps an admin inside their own branch', () => {
    expect(canViewAllBranches('admin')).toBe(false);
  });

  it('keeps every other role inside their own branch', () => {
    expect(canViewAllBranches('manager')).toBe(false);
    expect(canViewAllBranches('accountant')).toBe(false);
    expect(canViewAllBranches('cashier')).toBe(false);
    expect(canViewAllBranches('kitchen')).toBe(false);
  });

  it('treats a missing role as no access', () => {
    expect(canViewAllBranches(null)).toBe(false);
    expect(canViewAllBranches(undefined)).toBe(false);
  });
});
