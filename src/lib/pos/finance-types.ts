/**
 * Finance module — shared TypeScript contracts.
 *
 * Money convention: every rupee amount is a `number` in rupees (matches the
 * existing bills/settlements columns). Paise are derived with
 * finance-utils.toPaise() whenever exact arithmetic is required.
 */

export type ServiceResult<T> = {
  data: T | null;
  error: string | null;
};

export type FinancePreset = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'custom';

export type FinanceTab = 'overview' | 'ledger' | 'expenses' | 'cashbook' | 'dayclose' | 'catalog';

export const EXPENSE_PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'other'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export type ExpenseStatus = 'recorded' | 'void';

export type Expense = {
  id: string;
  tenant_id: string;
  branch_id: string;
  amount: number;
  amount_paise: number;
  category: string;
  description: string | null;
  /** Calendar date the expense belongs to — YYYY-MM-DD (DB column `date`). */
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  payee: string | null;
  reference_no: string | null;
  notes: string | null;
  receipt_url: string | null;
  status: ExpenseStatus;
  void_reason: string | null;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ExpenseInput = {
  amount: number;
  category: string;
  description: string | null;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  payee: string | null;
  reference_no: string | null;
  notes: string | null;
};

/** Raw form values before validation (everything is a string from TextInput). */
export type ExpenseFormValues = {
  amount: string;
  category: string;
  description: string;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  payee: string;
  reference_no: string;
  notes: string;
};

export type ExpenseFormErrors = Partial<Record<keyof ExpenseFormValues, string>>;

export type ExpenseCategory = {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type ExpenseListFilters = {
  startDate: string;
  endDate: string;
  /** null/undefined = all accessible branches (owner/admin only). */
  branchId: string | null;
  category: string | null;
  paymentMethod: ExpensePaymentMethod | null;
  search: string;
  includeVoid: boolean;
  page: number;
  pageSize: number;
};

export type ExpensePage = {
  rows: Expense[];
  total: number;
  page: number;
  pageSize: number;
};

export type FinanceFilters = {
  preset: FinancePreset;
  /** YYYY-MM-DD business dates (inclusive). */
  startDate: string;
  endDate: string;
  /** null = all accessible branches (owner/admin). */
  branchId: string | null;
};

export type PaymentSplitEntry = {
  payment_type: string;
  total: number;
  count: number;
};

export type CategorySpend = {
  category: string;
  total: number;
  count: number;
};

export type FinanceSummary = {
  /** Paid, non-complimentary bill totals settled in range. */
  grossSales: number;
  billCount: number;
  /** Money actually received (settlement rows) for paid, non-complimentary bills. */
  collectedRevenue: number;
  pendingCollections: number;
  taxCollected: number;
  discountsGiven: number;
  complimentaryValue: number;
  refundsTotal: number;
  refundsCount: number;
  expensesTotal: number;
  expensesCount: number;
  purchasesTotal: number;
  purchasesCount: number;
  /** Cash received via settlements. */
  cashIn: number;
  /** Cash paid out via expenses and cash refunds. */
  cashOut: number;
  paymentSplit: PaymentSplitEntry[];
  expensesByCategory: CategorySpend[];
};

/** Derived, never stored — see finance-utils.computeProfitAndLoss(). */
export type ProfitAndLoss = {
  collectedRevenue: number;
  refundsTotal: number;
  netRevenue: number;
  expensesTotal: number;
  purchasesTotal: number;
  totalOutflow: number;
  netCashFlow: number;
  /** netCashFlow / netRevenue, 0..1 range (may be negative). 0 when no revenue. */
  margin: number;
};

export type FinanceDailyPoint = {
  /** YYYY-MM-DD business date. */
  date: string;
  revenue: number;
  orders: number;
  expenses: number;
  net: number;
};

export type LedgerEntryKind = 'sale' | 'expense' | 'refund';

export type LedgerEntry = {
  id: string;
  kind: LedgerEntryKind;
  occurred_at: string;
  business_date: string;
  title: string;
  subtitle: string | null;
  payment_method: string;
  amount: number;
  direction: 'in' | 'out';
  reference: string | null;
};

export type LedgerTotals = {
  totalIn: number;
  totalOut: number;
  net: number;
  cashIn: number;
  cashOut: number;
  entryCount: number;
};

export type DayClosureStatus = 'open' | 'closed';

export type DayClosure = {
  id: string;
  tenant_id: string;
  branch_id: string;
  business_date: string;
  opening_cash: number;
  cash_sales: number;
  cash_refunds: number;
  cash_expenses: number;
  expected_cash: number;
  counted_cash: number | null;
  variance: number | null;
  notes: string | null;
  status: DayClosureStatus;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Live figures computed from settlements/expenses for a business date. */
export type DayCloseComputation = {
  business_date: string;
  cashSales: number;
  cashRefunds: number;
  cashExpenses: number;
  cashSettlementCount: number;
  cashExpenseCount: number;
};

export type DayClosureInput = {
  business_date: string;
  opening_cash: number;
  counted_cash: number | null;
  notes: string | null;
};

/**
 * Which parts of the proposed finance migration are present in the database.
 * The UI uses this to degrade gracefully instead of failing.
 */
export type FinanceSchemaStatus = {
  expensesExtended: boolean;
  categoriesTable: boolean;
  dayClosuresTable: boolean;
  refundsExtended: boolean;
  summaryRpc: boolean;
};

// ─── Ledger (docs/FINANCE_LEDGER_PLAN.md) ────────────────────────────────────

export const LEDGER_KINDS = ['income', 'expense', 'payable', 'receivable', 'transfer'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
/** Kinds a catalog item can preselect; a transfer is never catalogued. */
export type CatalogKind = Exclude<LedgerKind, 'transfer'>;

export const LEDGER_MODES = ['cash', 'bank'] as const;
export type LedgerMode = (typeof LEDGER_MODES)[number];

/** income/expense/transfer: recorded → void. payable/receivable: open → settled or void. */
export type LedgerStatus = 'recorded' | 'open' | 'settled' | 'void';

export type FinanceAccountKind = 'branch' | 'partner';

export type FinanceAccount = {
  id: string;
  tenant_id: string;
  kind: FinanceAccountKind;
  branch_id: string | null;
  staff_id: string | null;
  name: string;
  opening_cash: number;
  opening_bank: number;
  counts_in_partner_profit: boolean;
  sort_order: number;
  is_active: boolean;
};

export type CatalogLevel = 'category' | 'subcategory' | 'particular';

export type CatalogItem = {
  id: string;
  level: CatalogLevel;
  parent_id: string | null;
  name: string;
  /** Preselected kind; null inherits from the parent. */
  default_kind: CatalogKind | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
};

/** A new category, sub-category or particular. */
export type CatalogItemInput = {
  level: CatalogLevel;
  parent_id: string | null;
  name: string;
  default_kind: CatalogKind | null;
  sort_order: number;
};

/** What the owner may change on an existing catalog item. */
export type CatalogItemPatch = Partial<Pick<CatalogItem, 'name' | 'default_kind' | 'is_active' | 'sort_order'>>;

/** Free-text particulars typed into entries that are not in the catalog yet. */
export type FreeTextParticular = { name: string; count: number };

export type FinanceRules = {
  tenant_id: string;
  clerk_sees_balances: boolean;
  clerk_sees_partner_entries: boolean;
  clerk_edits_after_day_end: boolean;
  clerk_can_void: boolean;
  clerk_can_transfer: boolean;
  /** HH:MM, IST. */
  day_end_time: string;
};

export type FinanceEntry = {
  id: string;
  /** Whose books carry the entry ("For"). */
  account_id: string;
  /** Whose cash or bank moved ("Paid from"), when that is another account; null means account_id. */
  paid_from_account_id: string | null;
  kind: LedgerKind;
  status: LedgerStatus;
  amount: number;
  amount_paise: number;
  mode: LedgerMode | null;
  transfer_from: LedgerMode | null;
  transfer_to: LedgerMode | null;
  /** YYYY-MM-DD, the day the money moved. */
  transaction_date: string;
  entered_at: string;
  entered_by: string;
  entered_by_name: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  particular_id: string | null;
  particulars: string;
  counterparty: string | null;
  reference_no: string | null;
  notes: string | null;
  settles_entry_id: string | null;
  settled: number;
  settled_at: string | null;
  void_reason: string | null;
  voided_at: string | null;
  updated_at: string;
  version: number;
};

export type FinanceEntryInput = {
  account_id: string;
  paid_from_account_id: string | null;
  kind: LedgerKind;
  amount: number;
  mode: LedgerMode | null;
  transfer_from: LedgerMode | null;
  transfer_to: LedgerMode | null;
  transaction_date: string;
  category_id: string | null;
  subcategory_id: string | null;
  particular_id: string | null;
  particulars: string;
  counterparty: string | null;
  reference_no: string | null;
  notes: string | null;
};

/** Raw form values before validation (everything is a string from TextInput). */
export type EntryFormValues = {
  account_id: string;
  /** '' when the same account pays. */
  paid_from_account_id: string;
  kind: LedgerKind;
  amount: string;
  mode: LedgerMode;
  transfer_from: LedgerMode;
  transfer_to: LedgerMode;
  transaction_date: string;
  category_id: string;
  subcategory_id: string;
  particular_id: string;
  particulars: string;
  counterparty: string;
  reference_no: string;
  notes: string;
};

export type EntryFormErrors = Partial<Record<keyof EntryFormValues, string>>;

export type LedgerSort = 'transaction_date' | 'entered_at' | 'amount' | 'particulars';
/** 'active' = everything that is not void. */
export type LedgerStatusFilter = 'active' | 'open' | 'settled' | 'void' | 'all';

export type LedgerFilters = {
  startDate: string;
  endDate: string;
  accountId: string | null;
  kind: LedgerKind | null;
  mode: LedgerMode | null;
  categoryId: string | null;
  subcategoryId: string | null;
  particularId: string | null;
  /** staff id */
  enteredBy: string | null;
  status: LedgerStatusFilter;
  search: string;
  sort: LedgerSort;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
};

export type LedgerPage = {
  rows: FinanceEntry[];
  /** null when the page was fetched without counting (pages after the first). */
  total: number | null;
  page: number;
  pageSize: number;
};

export type EntryRevisionAction = 'create' | 'update' | 'void' | 'settle';
export type EntryFieldChange = { from: unknown; to: unknown };

export type EntryRevision = {
  id: string;
  entry_id: string;
  action: EntryRevisionAction;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  changes: Record<string, EntryFieldChange>;
};

export type AccountBalance = {
  account_id: string;
  cash: number;
  bank: number;
};

// ─── Settlement and positions (plan §3, step 2) ──────────────────────────────

export type SettleEntryInput = {
  entry_id: string;
  amount: number;
  mode: LedgerMode;
  transaction_date: string;
  paid_from_account_id: string | null;
  reference_no: string | null;
  notes: string | null;
};

export type SettleFormValues = {
  amount: string;
  mode: LedgerMode;
  transaction_date: string;
  paid_from_account_id: string;
  reference_no: string;
  notes: string;
};

export type SettleFormErrors = Partial<Record<keyof SettleFormValues, string>>;

/** One account owes another, netted over everything one paid for the other. */
export type InterAccountPosition = {
  owed_by: string;
  owed_to: string;
  amount: number;
};

/** The Books card: ledger income and expenses in range, and what is still open. */
export type LedgerAccountSummary = {
  account_id: string;
  income: number;
  expenses: number;
  openPayables: number;
  openReceivables: number;
};
