/**
 * Finance ledger — pure helpers. No Supabase, no React.
 *
 * The rules that matter (who may edit, until when) are enforced by the
 * database; the mirrors here only decide what the screen offers, so a clerk
 * never taps a button the server would refuse.
 */
import type {
  CatalogItem,
  CatalogKind,
  EntryFieldChange,
  EntryFormErrors,
  EntryFormValues,
  FinanceEntry,
  FinanceEntryInput,
  FinanceRules,
  LedgerFilters,
  LedgerKind,
  LedgerMode,
} from './finance-types';
import type { UserRole } from './session-context';
import { EXPENSE_MAX_AMOUNT, getPresetDateRange, parseAmountInput } from './finance-utils';

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  income: 'Income',
  expense: 'Expense',
  payable: 'Payable',
  receivable: 'Receivable',
  transfer: 'Transfer',
};

export const LEDGER_MODE_LABELS: Record<LedgerMode, string> = {
  cash: 'Cash',
  bank: 'Bank',
};

/** Money in for income and receivables, out for expenses and payables. */
export function entryDirection(kind: LedgerKind): 'in' | 'out' | 'move' {
  if (kind === 'income' || kind === 'receivable') return 'in';
  if (kind === 'transfer') return 'move';
  return 'out';
}

export function isFinanceOwner(role: UserRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function isFinanceClerk(role: UserRole | null | undefined): boolean {
  return role === 'accountant' || role === 'manager';
}

// ─── Ledger day ──────────────────────────────────────────────────────────────

const IST_OFFSET_MINUTES = 5 * 60 + 30;

function parseDayEnd(dayEnd: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(dayEnd);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The YYYY-MM-DD ledger day an instant belongs to in IST, given when the
 * ledger day ends. Mirrors finance_ledger_day() in the database.
 */
export function ledgerDayOf(at: Date, dayEnd: string): string {
  const shifted = new Date(at.getTime() + (IST_OFFSET_MINUTES - parseDayEnd(dayEnd)) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Whether the signed-in user may edit an entry right now. Mirrors
 * finance_can_edit(): owners always, clerks their own until the day ends
 * unless the owner has switched that rule on.
 */
export function canEditEntry(
  entry: FinanceEntry,
  role: UserRole | null | undefined,
  staffId: string | null | undefined,
  rules: FinanceRules | null,
  now: Date = new Date(),
): boolean {
  if (entry.status === 'void') return false;
  if (isFinanceOwner(role)) return true;
  if (!isFinanceClerk(role) || !staffId || entry.entered_by !== staffId) return false;
  if (!rules) return false;
  if (rules.clerk_edits_after_day_end) return true;
  return ledgerDayOf(new Date(entry.entered_at), rules.day_end_time) === ledgerDayOf(now, rules.day_end_time);
}

export function canVoidEntry(role: UserRole | null | undefined, rules: FinanceRules | null): boolean {
  return isFinanceOwner(role) || (isFinanceClerk(role) && (rules?.clerk_can_void ?? false));
}

export function canTransfer(role: UserRole | null | undefined, rules: FinanceRules | null): boolean {
  return isFinanceOwner(role) || (isFinanceClerk(role) && (rules?.clerk_can_transfer ?? false));
}

export function canSeeBalances(role: UserRole | null | undefined, rules: FinanceRules | null): boolean {
  return isFinanceOwner(role) || (isFinanceClerk(role) && (rules?.clerk_sees_balances ?? false));
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export function catalogChildren(catalog: readonly CatalogItem[], parentId: string | null): CatalogItem[] {
  return catalog
    .filter((item) => item.parent_id === parentId && item.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function catalogById(catalog: readonly CatalogItem[], id: string | null): CatalogItem | null {
  if (!id) return null;
  return catalog.find((item) => item.id === id) ?? null;
}

/** The kind an item preselects, walking up to the category when it inherits. */
export function resolveCatalogKind(catalog: readonly CatalogItem[], id: string | null): CatalogKind | null {
  let current = catalogById(catalog, id);
  let guard = 0;
  while (current && guard < 4) {
    if (current.default_kind) return current.default_kind;
    current = catalogById(catalog, current.parent_id);
    guard += 1;
  }
  return null;
}

export type CatalogSuggestion = {
  item: CatalogItem;
  category: CatalogItem | null;
  subcategory: CatalogItem | null;
  /** "Utilities › Electricity" for a particular, "Utilities" for a subcategory. */
  path: string;
};

/**
 * Items whose name contains the typed text, particulars first, then
 * sub-categories, then categories. What the entry form shows under the
 * particulars box.
 */
export function suggestCatalog(catalog: readonly CatalogItem[], query: string, limit = 8): CatalogSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const rank: Record<CatalogItem['level'], number> = { particular: 0, subcategory: 1, category: 2 };
  return catalog
    .filter((item) => item.is_active && !item.is_system && item.name.toLowerCase().includes(needle))
    .sort((a, b) => rank[a.level] - rank[b.level] || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((item) => {
      const parent = catalogById(catalog, item.parent_id);
      const grand = parent ? catalogById(catalog, parent.parent_id) : null;
      const category = item.level === 'category' ? item : item.level === 'subcategory' ? parent : grand;
      const subcategory = item.level === 'subcategory' ? item : item.level === 'particular' ? parent : null;
      const path = [category?.name, subcategory?.name].filter((s): s is string => Boolean(s) && s !== item.name).join(' › ');
      return { item, category, subcategory, path };
    });
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function emptyEntryForm(accountId: string, defaultDate: string): EntryFormValues {
  return {
    account_id: accountId,
    kind: 'expense',
    amount: '',
    mode: 'cash',
    transfer_from: 'cash',
    transfer_to: 'bank',
    transaction_date: defaultDate,
    category_id: '',
    subcategory_id: '',
    particular_id: '',
    particulars: '',
    counterparty: '',
    reference_no: '',
    notes: '',
  };
}

export function entryToFormValues(entry: FinanceEntry): EntryFormValues {
  return {
    account_id: entry.account_id,
    kind: entry.kind,
    amount: entry.amount.toString(),
    mode: entry.mode ?? 'cash',
    transfer_from: entry.transfer_from ?? 'cash',
    transfer_to: entry.transfer_to ?? 'bank',
    transaction_date: entry.transaction_date,
    category_id: entry.category_id ?? '',
    subcategory_id: entry.subcategory_id ?? '',
    particular_id: entry.particular_id ?? '',
    particulars: entry.particulars,
    counterparty: entry.counterparty ?? '',
    reference_no: entry.reference_no ?? '',
    notes: entry.notes ?? '',
  };
}

export type EntryValidation = { ok: true; value: FinanceEntryInput } | { ok: false; errors: EntryFormErrors };

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateEntryForm(values: EntryFormValues): EntryValidation {
  const errors: EntryFormErrors = {};
  const amount = parseAmountInput(values.amount);
  if (amount === null) errors.amount = 'Enter an amount like 1250 or 1250.50.';
  else if (amount <= 0) errors.amount = 'The amount must be more than zero.';
  else if (amount > EXPENSE_MAX_AMOUNT) errors.amount = 'That is above the one crore limit for a single entry.';

  if (!values.account_id) errors.account_id = 'Pick whose books this belongs to.';
  if (!ISO_DATE.test(values.transaction_date) || Number.isNaN(Date.parse(values.transaction_date))) {
    errors.transaction_date = 'Use the calendar, or type the date as YYYY-MM-DD.';
  }
  const particulars = values.particulars.trim();
  if (particulars.length === 0) errors.particulars = 'Say what this was for.';
  else if (particulars.length > 120) errors.particulars = 'Keep the particulars under 120 characters.';
  if (values.kind === 'transfer' && values.transfer_from === values.transfer_to) {
    errors.transfer_to = 'A transfer moves money between cash and bank.';
  }
  if (values.counterparty.length > 120) errors.counterparty = 'Keep this under 120 characters.';
  if (values.reference_no.length > 60) errors.reference_no = 'Keep the reference under 60 characters.';
  if (values.notes.length > 500) errors.notes = 'Keep notes under 500 characters.';

  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };

  const isTransfer = values.kind === 'transfer';
  return {
    ok: true,
    value: {
      account_id: values.account_id,
      kind: values.kind,
      amount,
      mode: isTransfer ? null : values.mode,
      transfer_from: isTransfer ? values.transfer_from : null,
      transfer_to: isTransfer ? values.transfer_to : null,
      transaction_date: values.transaction_date,
      category_id: isTransfer ? null : emptyToNull(values.category_id),
      subcategory_id: isTransfer ? null : emptyToNull(values.subcategory_id),
      particular_id: isTransfer ? null : emptyToNull(values.particular_id),
      particulars,
      counterparty: emptyToNull(values.counterparty),
      reference_no: emptyToNull(values.reference_no),
      notes: emptyToNull(values.notes),
    },
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

export function initialLedgerFilters(now: Date = new Date()): LedgerFilters {
  const range = getPresetDateRange('month', undefined, now);
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    accountId: null,
    kind: null,
    mode: null,
    categoryId: null,
    subcategoryId: null,
    particularId: null,
    enteredBy: null,
    status: 'active',
    search: '',
    sort: 'transaction_date',
    sortDir: 'desc',
    page: 0,
    pageSize: 50,
  };
}

// ─── Edit history ────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  account_id: 'Account',
  kind: 'Kind',
  status: 'Status',
  amount_paise: 'Amount',
  mode: 'Paid via',
  transfer_from: 'From',
  transfer_to: 'To',
  transaction_date: 'Transaction date',
  category_id: 'Category',
  subcategory_id: 'Sub-category',
  particular_id: 'Particular',
  particulars: 'Particulars',
  counterparty: 'Paid to / received from',
  reference_no: 'Reference',
  notes: 'Notes',
  settles_entry_id: 'Settles',
  settled_paise: 'Settled',
  void_reason: 'Void reason',
};

export type ChangeLine = { field: string; label: string; from: string; to: string };

/**
 * Turns one revision's raw changes into readable lines. Ids resolve to names
 * through the lookups given; paise show as rupees.
 */
export function describeChanges(
  changes: Record<string, EntryFieldChange>,
  lookups: { catalog: readonly CatalogItem[]; accounts: readonly { id: string; name: string }[] },
  formatMoney: (rupees: number) => string,
): ChangeLine[] {
  const render = (field: string, value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (field === 'amount_paise' || field === 'settled_paise') {
      return typeof value === 'number' ? formatMoney(value / 100) : String(value);
    }
    if (field === 'account_id') return lookups.accounts.find((a) => a.id === value)?.name ?? String(value);
    if (field === 'category_id' || field === 'subcategory_id' || field === 'particular_id') {
      return catalogById(lookups.catalog, String(value))?.name ?? String(value);
    }
    if (field === 'kind' && typeof value === 'string' && value in LEDGER_KIND_LABELS) {
      return LEDGER_KIND_LABELS[value as LedgerKind];
    }
    return String(value);
  };
  return Object.entries(changes)
    .filter(([field]) => field in FIELD_LABELS)
    .map(([field, change]) => ({
      field,
      label: FIELD_LABELS[field],
      from: render(field, change.from),
      to: render(field, change.to),
    }));
}
