import { canRaiseTransferRequest, isSupplyBranch } from '@/lib/pos/transfer-access';

const outlet = { id: 'outlet', branch_type: 'RESTAURANT' as const };
const kitchen = { id: 'kitchen', branch_type: 'CENTRAL_KITCHEN' as const };
const warehouse = { id: 'warehouse', branch_type: 'WAREHOUSE' as const };

describe('isSupplyBranch', () => {
  it('treats the central kitchen and a warehouse as suppliers', () => {
    expect(isSupplyBranch(kitchen)).toBe(true);
    expect(isSupplyBranch(warehouse)).toBe(true);
  });

  it('treats a restaurant as an outlet', () => {
    expect(isSupplyBranch(outlet)).toBe(false);
  });
});

describe('canRaiseTransferRequest', () => {
  it('lets an outlet raise a request when there is a kitchen to ask', () => {
    expect(canRaiseTransferRequest('outlet', [outlet, kitchen])).toBe(true);
  });

  it('does not let the kitchen raise a request against itself', () => {
    expect(canRaiseTransferRequest('kitchen', [outlet, kitchen])).toBe(false);
  });

  it('hides the button when the tenant has no supply branch (the demo tenant)', () => {
    expect(canRaiseTransferRequest('outlet', [outlet])).toBe(false);
  });

  it('hides the button until the branch list has loaded', () => {
    expect(canRaiseTransferRequest('outlet', [])).toBe(false);
  });

  it('hides the button for a branch id that is not in the list', () => {
    expect(canRaiseTransferRequest('elsewhere', [outlet, kitchen])).toBe(false);
  });
});
