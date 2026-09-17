import { accountsInScope } from '@/lib/pos/finance-ledger-utils';
import type { FinanceAccount } from '@/lib/pos/finance-types';

function account(id: string, kind: FinanceAccount['kind'], branchId: string | null): FinanceAccount {
  return {
    id,
    tenant_id: 'tenant-1',
    kind,
    branch_id: branchId,
    staff_id: kind === 'partner' ? `staff-${id}` : null,
    name: id,
    opening_cash: 0,
    opening_bank: 0,
    counts_in_partner_profit: false,
    sort_order: 0,
    is_active: true,
  };
}

const ACCOUNTS = [
  account('kolathur', 'branch', 'branch-kol'),
  account('velachery', 'branch', 'branch-vel'),
  account('kitchen', 'branch', 'branch-ck'),
  account('partner-a', 'partner', null),
  account('partner-b', 'partner', null),
];

describe('accountsInScope', () => {
  it('gives the owner every account', () => {
    expect(accountsInScope(ACCOUNTS, 'owner', 'branch-kol').map((a) => a.id)).toEqual([
      'kolathur',
      'velachery',
      'kitchen',
      'partner-a',
      'partner-b',
    ]);
  });

  it('gives an admin only the account of their own branch', () => {
    expect(accountsInScope(ACCOUNTS, 'admin', 'branch-vel').map((a) => a.id)).toEqual(['velachery']);
    expect(accountsInScope(ACCOUNTS, 'admin', 'branch-kol').map((a) => a.id)).toEqual(['kolathur']);
  });

  it('never gives a partner account to anyone but the owner', () => {
    for (const role of ['admin', 'manager', 'accountant'] as const) {
      expect(accountsInScope(ACCOUNTS, role, 'branch-kol').some((a) => a.kind === 'partner')).toBe(false);
    }
  });

  it('gives nothing when the branch is unknown', () => {
    expect(accountsInScope(ACCOUNTS, 'admin', null)).toEqual([]);
    expect(accountsInScope(ACCOUNTS, 'manager', undefined)).toEqual([]);
    expect(accountsInScope(ACCOUNTS, null, 'branch-kol')).toEqual([]);
  });
});
