/**
 * Render smoke tests for the finance module.
 *
 * The Supabase service layer is mocked, so these assert the UI contract only:
 * every screen mounts, shows loading / error / empty / data states, and reads
 * its numbers from the store.
 */
/* eslint-disable import/first, @typescript-eslint/no-require-imports --
   jest.mock() calls are hoisted above imports and their factories must use
   require(). */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// The session store reaches AsyncStorage, which has no native module under Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// lucide-react-native ships ESM that Jest does not transform; every icon
// renders as an inert view. Icons carry no assertions here.
jest.mock('lucide-react-native', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        const Icon = () => React.createElement(View, null);
        Icon.displayName = String(name);
        return Icon;
      },
    },
  );
});
jest.mock('@/lib/pos/finance-service');
jest.mock('@/lib/pos/finance-ledger-service');
jest.mock('@/lib/pos/use-session-store');

import * as financeService from '@/lib/pos/finance-service';
import * as ledgerService from '@/lib/pos/finance-ledger-service';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { useFinanceStore } from '@/lib/pos/use-finance-store';
import { useLedgerStore } from '@/lib/pos/use-ledger-store';
import { emptyFinanceSummary } from '@/lib/pos/finance-utils';
import type { Expense, FinanceSchemaStatus } from '@/lib/pos/finance-types';
import { FinanceScreen } from '../FinanceScreen';
import { PhoneFinanceScreen } from '../PhoneFinanceScreen';
import { FinanceOverviewTab } from '../FinanceOverviewTab';
import { ExpensesTab } from '../ExpensesTab';
import { CashBookTab } from '../CashBookTab';
import { DayCloseTab } from '../DayCloseTab';

const mocked = financeService as jest.Mocked<typeof financeService>;
const mockedLedger = ledgerService as jest.Mocked<typeof ledgerService>;

const RULES = {
  tenant_id: 'tenant-1',
  clerk_sees_balances: false,
  clerk_sees_partner_entries: false,
  clerk_edits_after_day_end: false,
  clerk_can_void: false,
  clerk_can_transfer: false,
  day_end_time: '00:00',
};

const ACCOUNTS = [
  { id: 'acct-ck', tenant_id: 'tenant-1', kind: 'branch' as const, branch_id: 'branch-1', staff_id: null, name: 'Central Kitchen', opening_cash: 0, opening_bank: 0, counts_in_partner_profit: true, sort_order: 1, is_active: true },
  { id: 'acct-owner', tenant_id: 'tenant-1', kind: 'partner' as const, branch_id: null, staff_id: 'staff-1', name: 'Owner', opening_cash: 0, opening_bank: 0, counts_in_partner_profit: false, sort_order: 100, is_active: true },
];

const CATALOG = [
  { id: 'cat-util', level: 'category' as const, parent_id: null, name: 'Utilities', default_kind: 'expense' as const, sort_order: 1, is_system: false, is_active: true },
  { id: 'sub-elec', level: 'subcategory' as const, parent_id: 'cat-util', name: 'Electricity', default_kind: null, sort_order: 1, is_system: false, is_active: true },
  { id: 'par-eb', level: 'particular' as const, parent_id: 'sub-elec', name: 'EB bill', default_kind: null, sort_order: 1, is_system: false, is_active: true },
];

function makeEntry(over: Partial<import('@/lib/pos/finance-types').FinanceEntry> = {}): import('@/lib/pos/finance-types').FinanceEntry {
  return {
    id: 'entry-1',
    account_id: 'acct-ck',
    paid_from_account_id: null,
    kind: 'expense',
    status: 'recorded',
    amount: 1250,
    amount_paise: 125000,
    mode: 'cash',
    transfer_from: null,
    transfer_to: null,
    transaction_date: '2026-09-15',
    entered_at: '2026-09-15T04:30:00.000Z',
    entered_by: 'staff-1',
    entered_by_name: 'Owner',
    category_id: 'cat-util',
    subcategory_id: 'sub-elec',
    particular_id: 'par-eb',
    particulars: 'EB bill',
    counterparty: 'TANGEDCO',
    reference_no: null,
    notes: null,
    settles_entry_id: null,
    settled: 0,
    settled_at: null,
    void_reason: null,
    voided_at: null,
    updated_at: '2026-09-15T04:30:00.000Z',
    version: 1,
    ...over,
  };
}

const FULL_SCHEMA: FinanceSchemaStatus = {
  expensesExtended: true,
  categoriesTable: true,
  dayClosuresTable: true,
  refundsExtended: true,
  summaryRpc: true,
};

const SESSION = {
  sessionId: 's',
  userId: 'u',
  staffId: 'staff-1',
  tenantId: 'tenant-1',
  tenantName: 'Le Leban',
  role: 'owner' as const,
  displayName: 'Owner',
  branchId: 'branch-1',
  branchName: 'Main Branch',
  accessibleBranches: [
    {
      id: 'branch-1',
      tenant_id: 'tenant-1',
      name: 'Main Branch',
      code: 'MB',
      address: null,
      phone: null,
      gstin: null,
      invoice_prefix: 'INV',
      branch_type: 'RESTAURANT',
      is_active: true,
    },
  ],
  terminalId: null,
  terminalCode: '',
  terminalName: '',
  terminalStatus: 'REGISTERED' as const,
  permissions: [],
  createdAt: '',
  expiresAt: '',
  lastValidatedAt: '',
  issuedAt: '',
  jwtExpiresAt: '',
  lastActivityAt: '',
};

function makeExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    tenant_id: 'tenant-1',
    branch_id: 'branch-1',
    amount: 1500,
    amount_paise: 150000,
    category: 'Rent',
    description: 'September rent',
    expense_date: '2026-09-05',
    payment_method: 'cash',
    payee: 'Landlord',
    reference_no: 'REF-1',
    notes: null,
    receipt_url: null,
    status: 'recorded',
    void_reason: null,
    voided_at: null,
    created_by: null,
    created_at: '2026-09-05T10:00:00.000Z',
    updated_at: null,
    ...over,
  };
}

/** Every visible string in the rendered tree, flattened into one haystack. */
function textOf(tree: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string' || typeof node === 'number') {
      out.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    // react-test-renderer JSON nodes carry `children` at the top level.
    if (node && typeof node === 'object') {
      walk((node as { children?: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return out.join(' | ');
}

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 1024, height: 768 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderTree(element: React.ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{element}</SafeAreaProvider>,
    );
  });
  if (!tree) throw new Error('render failed');
  return tree;
}

/** Unmounting flushes pending store subscriptions, so it needs act() too. */
function unmountTree(tree: ReactTestRenderer): void {
  act(() => {
    tree.unmount();
  });
}

const INITIAL_STATE = useFinanceStore.getState();
const INITIAL_LEDGER_STATE = useLedgerStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useFinanceStore.setState(INITIAL_STATE, true);
  useLedgerStore.setState(INITIAL_LEDGER_STATE, true);

  mockedLedger.fetchFinanceAccounts.mockResolvedValue({ data: ACCOUNTS, error: null });
  mockedLedger.fetchFinanceCatalog.mockResolvedValue({ data: CATALOG, error: null });
  mockedLedger.fetchFinanceRules.mockResolvedValue({ data: RULES, error: null });
  mockedLedger.fetchLedgerEntries.mockResolvedValue({ data: { rows: [makeEntry()], total: 1, page: 0, pageSize: 50 }, error: null });
  mockedLedger.fetchAccountBalances.mockResolvedValue({ data: [{ account_id: 'acct-ck', cash: 4250, bank: 120000 }], error: null });
  mockedLedger.fetchEntryRevisions.mockResolvedValue({ data: [], error: null });
  mockedLedger.fetchInterAccountPositions.mockResolvedValue({ data: [], error: null });
  mockedLedger.fetchLedgerSummary.mockResolvedValue({ data: [], error: null });
  (useSessionStore as unknown as jest.Mock).mockImplementation(
    (selector: (s: { session: typeof SESSION }) => unknown) => selector({ session: SESSION }),
  );
  Object.assign(useSessionStore, { getState: () => ({ session: SESSION }) });

  mocked.detectFinanceSchema.mockResolvedValue(FULL_SCHEMA);
  mocked.fetchExpenseCategories.mockResolvedValue({
    data: [{ id: 'c1', tenant_id: 'tenant-1', name: 'Rent', sort_order: 10, is_active: true }],
    error: null,
  });
  mocked.fetchFinanceOverview.mockResolvedValue({
    data: {
      summary: {
        ...emptyFinanceSummary(),
        grossSales: 125000,
        billCount: 42,
        collectedRevenue: 120000,
        pendingCollections: 5000,
        expensesTotal: 30000,
        expensesCount: 7,
        purchasesTotal: 20000,
        paymentSplit: [{ payment_type: 'cash', total: 70000, count: 20 }],
        expensesByCategory: [{ category: 'Rent', total: 30000, count: 7 }],
      },
      series: [{ date: '2026-09-05', revenue: 120000, orders: 42, expenses: 30000, net: 90000 }],
      degraded: false,
    },
    error: null,
  });
  mocked.fetchExpenses.mockResolvedValue({
    data: { rows: [makeExpense()], total: 1, page: 0, pageSize: 50 },
    error: null,
  });
  mocked.fetchLedger.mockResolvedValue({
    data: [
      {
        id: 'sale:1',
        kind: 'sale',
        occurred_at: '2026-09-05T16:30:00.000Z',
        business_date: '2026-09-05',
        title: 'Invoice INV-0001',
        subtitle: 'Bill settlement',
        payment_method: 'cash',
        amount: 2500,
        direction: 'in',
        reference: null,
      },
    ],
    error: null,
  });
  mocked.computeDayClose.mockResolvedValue({
    data: {
      business_date: '2026-09-05',
      cashSales: 5000,
      cashRefunds: 0,
      cashExpenses: 750,
      cashSettlementCount: 12,
      cashExpenseCount: 2,
    },
    error: null,
  });
  mocked.fetchDayClosure.mockResolvedValue({ data: null, error: null });
  mocked.fetchRecentDayClosures.mockResolvedValue({ data: [], error: null });
});

describe('FinanceScreen', () => {
  test('mounts and initialises the store once a session exists', async () => {
    const tree = renderTree(<FinanceScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocked.detectFinanceSchema).toHaveBeenCalled();
    expect(textOf(tree)).toContain('Finance');
    unmountTree(tree);
  });

  test('asks the user to sign in when there is no session', () => {
    (useSessionStore as unknown as jest.Mock).mockImplementation(
      (selector: (s: { session: null }) => unknown) => selector({ session: null }),
    );
    const tree = renderTree(<FinanceScreen />);
    expect(textOf(tree)).toContain('Sign in to view finance');
    unmountTree(tree);
  });
});

describe('PhoneFinanceScreen', () => {
  const noop = () => undefined;
  const filters = { preset: '7days' as const, startDate: '2026-09-01', endDate: '2026-09-07', branchId: null };

  function renderPhone(): ReactTestRenderer {
    return renderTree(
      <PhoneFinanceScreen
        activeTab="overview"
        filters={filters}
        branches={[{ id: 'branch-1', name: 'Main Branch' }]}
        canPickBranch
        loading={false}
        schema={FULL_SCHEMA}
        onTab={noop}
        onPreset={noop}
        onCustomRange={noop}
        onBranch={noop}
        onRefresh={noop}
      />,
    );
  }

  test('shows the branch, the active range and all four tabs', () => {
    const tree = renderPhone();
    const text = textOf(tree);
    expect(text).toContain('All branches');
    expect(text).toContain('1 Sep – 7 Sep 2026');
    for (const label of ['Overview', 'Ledger', 'Cash Book', 'Day Close']) {
      expect(text).toContain(label);
    }
    // The presets live in the sheet, which is closed until asked for.
    expect(text).not.toContain('This Month');
    unmountTree(tree);
  });

  test('the quick-add button switches to the Ledger and asks for a blank form', () => {
    const onTab = jest.fn();
    const tree = renderTree(
      <PhoneFinanceScreen
        activeTab="overview"
        filters={filters}
        branches={[{ id: 'branch-1', name: 'Main Branch' }]}
        canPickBranch
        loading={false}
        schema={FULL_SCHEMA}
        onTab={onTab}
        onPreset={noop}
        onCustomRange={noop}
        onBranch={noop}
        onRefresh={noop}
      />,
    );
    const [button] = tree.root.findAllByProps({ accessibilityLabel: 'Record an entry' });
    const { onPress } = button.props as { onPress: () => void };
    act(() => {
      onPress();
    });
    expect(onTab).toHaveBeenCalledWith('ledger');
    expect(useLedgerStore.getState().newEntryRequested).toBe(true);
    unmountTree(tree);
  });

  test('the Filters button opens the sheet with the presets and the branch picker', () => {
    const tree = renderPhone();
    const [button] = tree.root.findAllByProps({ accessibilityLabel: 'Open finance filters' });
    const { onPress } = button.props as { onPress: () => void };
    act(() => {
      onPress();
    });
    const text = textOf(tree);
    expect(text).toContain('This Month');
    expect(text).toContain('Main Branch');
    unmountTree(tree);
  });
});

describe('Overview tab', () => {
  test('renders the KPI values from the store', async () => {
    await act(async () => {
      await useFinanceStore.getState().loadOverview();
    });
    const tree = renderTree(<FinanceOverviewTab />);
    const text = textOf(tree);
    expect(text).toContain('Collected revenue');
    expect(text).toContain('₹1,20,000');
    expect(text).toContain('Net cash flow');
    // 120000 − 30000 expenses − 20000 purchases
    expect(text).toContain('+₹70,000');
    unmountTree(tree);
  });

  test('surfaces a service error with a retry affordance', async () => {
    mocked.fetchFinanceOverview.mockResolvedValue({ data: null, error: 'Unable to load the finance overview.' });
    await act(async () => {
      await useFinanceStore.getState().loadOverview();
    });
    const tree = renderTree(<FinanceOverviewTab />);
    const text = textOf(tree);
    expect(text).toContain('Unable to load the finance overview.');
    expect(text).toContain('Retry');
    unmountTree(tree);
  });
});

describe('Expenses tab', () => {
  test('lists expenses returned by the service', async () => {
    useFinanceStore.setState({ schema: FULL_SCHEMA });
    await act(async () => {
      await useFinanceStore.getState().loadExpenses(0);
    });
    const tree = renderTree(<ExpensesTab />);
    const text = textOf(tree);
    expect(text).toContain('Rent');
    expect(text).toContain('September rent');
    expect(text).toContain('₹1,500');
    unmountTree(tree);
  });

  test('shows an empty state with a call to action', async () => {
    mocked.fetchExpenses.mockResolvedValue({ data: { rows: [], total: 0, page: 0, pageSize: 50 }, error: null });
    await act(async () => {
      await useFinanceStore.getState().loadExpenses(0);
    });
    const tree = renderTree(<ExpensesTab />);
    const text = textOf(tree);
    expect(text).toContain('No expenses in this range');
    expect(text).toContain('Add first expense');
    unmountTree(tree);
  });
});

describe('Cash book tab', () => {
  test('groups entries under a business-day header', async () => {
    await act(async () => {
      await useFinanceStore.getState().loadLedger();
    });
    const tree = renderTree(<CashBookTab />);
    const text = textOf(tree);
    expect(text).toContain('Invoice INV-0001');
    expect(text).toContain('Money in');
    expect(text).toContain('Sat, 5 Sep 2026');
    unmountTree(tree);
  });
});

describe('Day close tab', () => {
  test('computes the expected till from live cash figures', async () => {
    useFinanceStore.setState({ schema: FULL_SCHEMA, filters: { ...useFinanceStore.getState().filters, branchId: 'branch-1' } });
    await act(async () => {
      await useFinanceStore.getState().loadDayClose();
    });
    const tree = renderTree(<DayCloseTab />);
    const text = textOf(tree);
    expect(text).toContain('Cash reconciliation');
    expect(text).toContain('Expected in till');
    // 0 opening + 5000 sales − 0 refunds − 750 expenses
    expect(text).toContain('₹4,250');
    expect(text).toContain('Close day');
    unmountTree(tree);
  });

  test('owners must pick a branch before closing a day', async () => {
    useFinanceStore.setState({ filters: { ...useFinanceStore.getState().filters, branchId: null } });
    const tree = renderTree(<DayCloseTab />);
    expect(textOf(tree)).toContain('Pick a branch to close a day');
    unmountTree(tree);
  });
});
