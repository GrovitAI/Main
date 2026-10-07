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

export type FinanceTab = 'overview' | 'ledger' | 'cashbook' | 'dayclose' | 'catalog';

export const EXPENSE_PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'other'] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

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
  /** Recorded ledger expenses of the branch accounts in view; built-in categories left out. */
  expensesTotal: number;
  expensesCount: number;
  /** Recorded ledger income of those accounts; income from our own accounts is left out when every branch is in view. */
  otherIncome: number;
  otherIncomeCount: number;
  /** With one branch in view: goods billed to it by another of our accounts in the range. */
  suppliesFromKitchen: number;
  /** Supplier invoices dated in the range. Information only: a purchase is in expenses once paid. */
  purchasesTotal: number;
  purchasesCount: number;
  /** Cash received via settlements and cash-mode ledger income. */
  cashIn: number;
  /** Cash paid out via ledger expenses and cash refunds. */
  cashOut: number;
  paymentSplit: PaymentSplitEntry[];
  expensesByCategory: CategorySpend[];
};

/** Derived, never stored — see finance-utils.computeProfitAndLoss(). */
export type ProfitAndLoss = {
  collectedRevenue: number;
  refundsTotal: number;
  netRevenue: number;
  /** Ledger income on top of the tills' revenue. */
  otherIncome: number;
  expensesTotal: number;
  /** Goods billed to the branch in view by the kitchen. */
  suppliesFromKitchen: number;
  /** Information only; purchases are inside expensesTotal once paid. */
  purchasesTotal: number;
  totalOutflow: number;
  netCashFlow: number;
  /** netCashFlow / (netRevenue + otherIncome), 0..1 range (may be negative). 0 when no income. */
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

export type LedgerEntryKind = 'sale' | 'income' | 'expense' | 'refund';

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

/**
 * How a payable or receivable is settled. 'offset' clears a receivable from
 * one of our own accounts against what this account owes that account: no
 * cash moves, so it is never a mode for a hand-recorded entry.
 */
export const SETTLE_MODES = ['cash', 'bank', 'offset'] as const;
export type SettleMode = (typeof SETTLE_MODES)[number];
/** What a stored entry can carry: a settlement payment may be an offset. */
export type EntryMode = SettleMode;
/** The document that posted an entry: an inventory purchase or dispatch, or a cash count. */
export type LedgerSourceType = 'purchase' | 'dispatch' | 'cash_count';

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
  /**
   * A stable key for the categories the system posts into or treats
   * specially: 'purchases', 'branch_supplies', 'cash_difference',
   * 'opening_balance', 'partners'. null for the owner's own categories.
   */
  system_key: string | null;
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
  /** The other one of our own accounts a payable or receivable is with: a branch that owes the kitchen for goods. */
  counterparty_account_id: string | null;
  /** The purchase or dispatch that posted this entry; null for a hand-recorded one. */
  source_type: LedgerSourceType | null;
  source_id: string | null;
  kind: LedgerKind;
  status: LedgerStatus;
  amount: number;
  amount_paise: number;
  mode: EntryMode | null;
  transfer_from: LedgerMode | null;
  transfer_to: LedgerMode | null;
  /** YYYY-MM-DD, the day the money moved. */
  transaction_date: string;
  /** YYYY-MM-DD, when a payable is to be paid or a receivable collected; null when not set or not a due. */
  due_date: string | null;
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
  /** Where the photo or PDF of the bill sits in storage; null when none is attached. */
  receipt_path: string | null;
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
  /** Only kept on a payable or receivable. */
  due_date: string | null;
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
  /** '' when no due date. */
  due_date: string;
  category_id: string;
  subcategory_id: string;
  particular_id: string;
  particulars: string;
  counterparty: string;
  reference_no: string;
  notes: string;
};

export type EntryFormErrors = Partial<Record<keyof EntryFormValues, string>>;

export type LedgerSort = 'transaction_date' | 'due_date' | 'entered_at' | 'amount' | 'particulars';
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
  /** The exact name in "Paid to / Received from", matched without regard to case. */
  counterparty: string | null;
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
  mode: SettleMode;
  transaction_date: string;
  paid_from_account_id: string | null;
  reference_no: string | null;
  notes: string | null;
};

export type SettleFormValues = {
  amount: string;
  mode: SettleMode;
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

/** How soon an open payable or receivable is due. */
export type DueBucket = 'overdue' | 'week' | 'later' | 'undated';

/** What is open in one account, by kind and by how soon it is due. */
export type DuesSummaryRow = {
  account_id: string;
  kind: 'payable' | 'receivable';
  bucket: DueBucket;
  amount: number;
  entries: number;
};

/** A name offered in "Paid to / Received from". */
export type CounterpartySuggestion = {
  name: string;
  source: 'used' | 'supplier' | 'staff';
  /** How many ledger entries already carry the name. */
  uses: number;
};

// ─── Statements ──────────────────────────────────────────────────────────────

/** Whose statement: a vendor or customer by name, or one of our own accounts against the books in view. */
export type StatementSubject =
  | { type: 'name'; name: string }
  | { type: 'account'; accountId: string; homeAccountId: string };

export type StatementRow = {
  entry: FinanceEntry;
  /** What this row added to what is owed. */
  billed: number;
  /** What this row paid off. */
  paid: number;
  /** Running balance after this row. */
  balance: number;
};

export type Statement = {
  rows: StatementRow[];
  billed: number;
  paid: number;
  /** The closing balance; its meaning is in `direction`. */
  balance: number;
  /**
   * Who owes whom when the balance is not zero. For a name: 'they_owe' (a
   * customer still to pay us) or 'we_owe' (a vendor still to be paid). For an
   * account: 'they_owe' when that account owes the home account.
   */
  direction: 'they_owe' | 'we_owe' | 'settled';
  /** The list stopped at the fetch limit; older rows may be missing. */
  truncated: boolean;
};

/** A photo or PDF of a bill picked on the device, ready to upload. */
export type ReceiptFile = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  /** In a browser the picker hands over the file itself. */
  file?: Blob | null;
};

// ─── Regulars (entry templates) ──────────────────────────────────────────────

/** A saved entry recorded again each month: rent, a salary, a subscription. */
export type EntryTemplate = {
  id: string;
  account_id: string;
  paid_from_account_id: string | null;
  kind: CatalogKind;
  /** The usual amount in rupees; 0 asks for it each time. */
  amount: number;
  mode: LedgerMode | null;
  category_id: string | null;
  subcategory_id: string | null;
  particular_id: string | null;
  particulars: string;
  counterparty: string | null;
  /** Day of the month a payable or receivable made from this falls due. */
  due_day: number | null;
  sort_order: number;
  is_active: boolean;
  /** YYYY-MM-DD, the transaction date it was last recorded with. */
  last_recorded_on: string | null;
};

export type EntryTemplateInput = Omit<EntryTemplate, 'id' | 'sort_order' | 'is_active' | 'last_recorded_on'>;

// ─── Cash counts ─────────────────────────────────────────────────────────────

export type CashCount = {
  id: string;
  account_id: string;
  mode: LedgerMode;
  /** YYYY-MM-DD */
  counted_on: string;
  expected: number;
  counted: number;
  /** counted − expected. Positive is a surplus, negative a shortage. */
  difference: number;
  adjustment_entry_id: string | null;
  note: string | null;
  counted_by_name: string | null;
  created_at: string;
};

export type CashCountInput = {
  account_id: string;
  mode: LedgerMode;
  counted: number;
  counted_on: string;
  note: string | null;
  /** Post the difference into the ledger so the books match the count. */
  adjust: boolean;
};

/** The Books card: ledger income and expenses in range, and what is still open. */
export type LedgerAccountSummary = {
  account_id: string;
  income: number;
  expenses: number;
  openPayables: number;
  openReceivables: number;
};
