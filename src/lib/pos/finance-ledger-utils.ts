/**
 * Finance ledger — pure helpers. No Supabase, no React.
 *
 * The rules that matter (who may edit, until when) are enforced by the
 * database; the mirrors here only decide what the screen offers, so a clerk
 * never taps a button the server would refuse.
 */
import { canViewAllBranches } from './branch-access';
import type {
  CatalogItem,
  CatalogKind,
  CatalogLevel,
  DueBucket,
  DuesSummaryRow,
  EntryFieldChange,
  EntryFormErrors,
  EntryFormValues,
  EntryMode,
  FinanceAccount,
  FinanceEntry,
  FinanceEntryInput,
  FinanceRules,
  LedgerFilters,
  LedgerKind,
  LedgerSourceType,
  SettleEntryInput,
  SettleFormErrors,
  SettleFormValues,
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

export const LEDGER_MODE_LABELS: Record<EntryMode, string> = {
  cash: 'Cash',
  bank: 'Bank',
  offset: 'Offset',
};

/** Where an entry the inventory module posted came from. */
export const LEDGER_SOURCE_LABELS: Record<LedgerSourceType, string> = {
  purchase: 'Posted from a purchase in Inventory',
  dispatch: 'Posted from a dispatch in Inventory',
  cash_count: 'Posted from a cash count',
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

/**
 * The accounts a user keeps books for: the owner, all of them; anyone else, the
 * account of their own branch. Mirrors finance_account_in_scope() in the
 * database, which is what actually enforces it; this only keeps the screen from
 * offering accounts the database would refuse. Other accounts stay available
 * as the payer of an entry ("paid by another account").
 */
export function accountsInScope(
  accounts: readonly FinanceAccount[],
  role: UserRole | null | undefined,
  branchId: string | null | undefined,
): FinanceAccount[] {
  if (!role) return [];
  if (canViewAllBranches(role)) return [...accounts];
  return accounts.filter((a) => a.kind === 'branch' && a.branch_id !== null && a.branch_id === branchId);
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

// ─── Payables, receivables, paid from ────────────────────────────────────────

/** What is still to be paid or collected on a payable or receivable. */
export function remainingAmount(entry: Pick<FinanceEntry, 'amount' | 'settled'>): number {
  return Math.max(0, Math.round((entry.amount - entry.settled) * 100) / 100);
}

/** Owners and clerks may record the payment of an open payable or receivable. */
export function canSettleEntry(entry: Pick<FinanceEntry, 'kind' | 'status'>, role: UserRole | null | undefined): boolean {
  if (entry.status !== 'open') return false;
  if (entry.kind !== 'payable' && entry.kind !== 'receivable') return false;
  return isFinanceOwner(role) || isFinanceClerk(role);
}

/**
 * A receivable from one of our own accounts (a branch owing the kitchen for
 * goods) can be cleared against what this account owes that account, with
 * no cash moving. The database caps the amount at what is actually owed.
 */
export function canOffsetEntry(entry: Pick<FinanceEntry, 'kind' | 'status' | 'counterparty_account_id'>): boolean {
  return entry.status === 'open' && entry.kind === 'receivable' && entry.counterparty_account_id !== null;
}

/**
 * "Owed by Kolathur" on a receivable and "Owed to Kolathur" on a payable
 * when the other side is one of our own accounts; null otherwise.
 */
export function counterpartyCaption(
  entry: Pick<FinanceEntry, 'kind' | 'counterparty_account_id'>,
  accountName: (id: string) => string,
): string | null {
  if (!entry.counterparty_account_id) return null;
  if (entry.kind === 'receivable') return `Owed by ${accountName(entry.counterparty_account_id)}`;
  if (entry.kind === 'payable') return `Owed to ${accountName(entry.counterparty_account_id)}`;
  return null;
}

// ─── Due dates ───────────────────────────────────────────────────────────────

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

export type DueStatus = {
  bucket: DueBucket;
  /** Days until the due date; negative when it has passed. null without a due date. */
  days: number | null;
  /** "Overdue 3 days", "Due today", "Due in 5 days", "Due 28 Oct" or "No due date". */
  label: string;
};

/**
 * How soon an open payable or receivable is due, as of `today` (YYYY-MM-DD).
 * null for anything that is not an open due. Mirrors the buckets of
 * finance_dues_summary() in the database.
 */
export function dueStatus(entry: Pick<FinanceEntry, 'kind' | 'status' | 'due_date'>, today: string): DueStatus | null {
  if (entry.status !== 'open' || (entry.kind !== 'payable' && entry.kind !== 'receivable')) return null;
  if (!entry.due_date) return { bucket: 'undated', days: null, label: 'No due date' };
  const days = daysBetween(today, entry.due_date);
  if (days === null) return { bucket: 'undated', days: null, label: 'No due date' };
  if (days < 0) return { bucket: 'overdue', days, label: `Overdue ${-days} ${days === -1 ? 'day' : 'days'}` };
  if (days === 0) return { bucket: 'week', days, label: 'Due today' };
  if (days <= 7) return { bucket: 'week', days, label: `Due in ${days} ${days === 1 ? 'day' : 'days'}` };
  const [, month, day] = entry.due_date.split('-');
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1] ?? '';
  return { bucket: 'later', days, label: `Due ${Number(day)} ${monthName}`.trim() };
}

export type DuesTotals = { total: number; overdue: number; week: number; later: number; undated: number; entries: number };

function emptyDuesTotals(): DuesTotals {
  return { total: 0, overdue: 0, week: 0, later: 0, undated: 0, entries: 0 };
}

/** What is to pay and to collect across the given accounts, by how soon it is due. */
export function summarizeDues(rows: readonly DuesSummaryRow[], accountIds?: readonly string[]): { payables: DuesTotals; receivables: DuesTotals } {
  const payables = emptyDuesTotals();
  const receivables = emptyDuesTotals();
  const scope = accountIds ? new Set(accountIds) : null;
  for (const row of rows) {
    if (scope && !scope.has(row.account_id)) continue;
    const target = row.kind === 'payable' ? payables : receivables;
    target[row.bucket] = Math.round((target[row.bucket] + row.amount) * 100) / 100;
    target.total = Math.round((target.total + row.amount) * 100) / 100;
    target.entries += row.entries;
  }
  return { payables, receivables };
}

// ─── Quick actions ───────────────────────────────────────────────────────────

export type QuickEntryKey = 'paid' | 'received' | 'owe' | 'owed' | 'moved';

/** The five everyday entries, each a short form of the full sheet with the kind already chosen. */
export const QUICK_ENTRY_PRESETS: readonly { key: QuickEntryKey; kind: LedgerKind; label: string; title: string }[] = [
  { key: 'paid', kind: 'expense', label: 'Paid a bill', title: 'Paid a bill' },
  { key: 'received', kind: 'income', label: 'Received money', title: 'Received money' },
  { key: 'owe', kind: 'payable', label: 'We owe', title: 'We owe someone' },
  { key: 'owed', kind: 'receivable', label: 'Owed to us', title: 'Someone owes us' },
  { key: 'moved', kind: 'transfer', label: 'Moved money', title: 'Moved money' },
];

/** A payable or receivable moves no money until it is settled, so it has no paying account. */
export function kindCanHavePayer(kind: LedgerKind): boolean {
  return kind !== 'payable' && kind !== 'receivable';
}

/** The label for the second account picker, by which way the money moves. */
export function payerLabel(kind: LedgerKind): string {
  if (kind === 'income' || kind === 'receivable') return 'Received by';
  if (kind === 'transfer') return 'From account';
  return 'Paid from';
}

/**
 * "Paid by Velachery · for Central Kitchen" when another account paid; null
 * for the everyday case, where the row's account name says it all.
 */
export function payerCaption(
  entry: Pick<FinanceEntry, 'kind' | 'account_id' | 'paid_from_account_id'>,
  accountName: (id: string) => string,
): string | null {
  if (!entry.paid_from_account_id || entry.paid_from_account_id === entry.account_id) return null;
  const payer = accountName(entry.paid_from_account_id);
  const owner = accountName(entry.account_id);
  if (entry.kind === 'income') return `Received by ${payer} · for ${owner}`;
  if (entry.kind === 'transfer') return `From ${payer} · to ${owner}`;
  return `Paid by ${payer} · for ${owner}`;
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

/** Active itself and under active parents, so the picker can offer it. */
export function isCatalogUsable(catalog: readonly CatalogItem[], id: string | null): boolean {
  let current = catalogById(catalog, id);
  let guard = 0;
  while (current && guard < 4) {
    if (!current.is_active) return false;
    if (!current.parent_id) return true;
    current = catalogById(catalog, current.parent_id);
    guard += 1;
  }
  return current === null ? false : true;
}

export const CATALOG_LEVEL_LABELS: Record<CatalogLevel, string> = {
  category: 'Category',
  subcategory: 'Sub-category',
  particular: 'Particular',
};

export function childLevel(level: CatalogLevel): CatalogLevel | null {
  if (level === 'category') return 'subcategory';
  if (level === 'subcategory') return 'particular';
  return null;
}

/** Items under a parent, active or not, in the owner's order. What the Catalog screen lists. */
export function catalogSiblings(catalog: readonly CatalogItem[], parentId: string | null): CatalogItem[] {
  return catalog
    .filter((item) => item.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export const CATALOG_NAME_MAX = 60;

/** Why a name cannot be used among these siblings, or null when it can. */
export function validateCatalogName(name: string, siblings: readonly CatalogItem[], excludeId: string | null = null): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Give it a name.';
  if (trimmed.length > CATALOG_NAME_MAX) return `Keep the name under ${CATALOG_NAME_MAX} characters.`;
  const lower = trimmed.toLowerCase();
  if (siblings.some((s) => s.id !== excludeId && s.name.trim().toLowerCase() === lower)) return 'That name is already in use here.';
  return null;
}

/** The sort order a new item takes: after the last sibling. */
export function nextSortOrder(siblings: readonly CatalogItem[]): number {
  return siblings.reduce((max, s) => Math.max(max, s.sort_order), 0) + 10;
}

/**
 * Moves one item a step up or down among its siblings and returns fresh sort
 * orders for all of them (10, 20, 30…), or null when it is already at the end.
 */
export function moveCatalogSibling(
  siblings: readonly CatalogItem[],
  id: string,
  direction: 'up' | 'down',
): { id: string; sort_order: number }[] | null {
  const ordered = [...siblings].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const index = ordered.findIndex((s) => s.id === id);
  if (index < 0) return null;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return null;
  const moved = ordered[index];
  const other = ordered[target];
  if (!moved || !other) return null;
  ordered[index] = other;
  ordered[target] = moved;
  return ordered.map((s, i) => ({ id: s.id, sort_order: (i + 1) * 10 }));
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
    .filter((item) => !item.is_system && item.name.toLowerCase().includes(needle) && isCatalogUsable(catalog, item.id))
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
    paid_from_account_id: '',
    kind: 'expense',
    amount: '',
    mode: 'cash',
    transfer_from: 'cash',
    transfer_to: 'bank',
    transaction_date: defaultDate,
    due_date: '',
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
    paid_from_account_id: entry.paid_from_account_id ?? '',
    kind: entry.kind,
    amount: entry.amount.toString(),
    // An offset settlement is never edited by hand; the form only knows cash and bank.
    mode: entry.mode && entry.mode !== 'offset' ? entry.mode : 'cash',
    transfer_from: entry.transfer_from ?? 'cash',
    transfer_to: entry.transfer_to ?? 'bank',
    transaction_date: entry.transaction_date,
    due_date: entry.due_date ?? '',
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
  const isDue = values.kind === 'payable' || values.kind === 'receivable';
  const dueDate = isDue ? values.due_date.trim() : '';
  if (dueDate.length > 0 && (!ISO_DATE.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) {
    errors.due_date = 'Use the calendar, or type the date as YYYY-MM-DD.';
  } else if (dueDate.length > 0 && ISO_DATE.test(values.transaction_date) && dueDate < values.transaction_date) {
    errors.due_date = 'The due date cannot be before the transaction date.';
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
  // A payable or receivable has no payer yet; the same account on both sides is "no other payer".
  const payer = kindCanHavePayer(values.kind) ? emptyToNull(values.paid_from_account_id) : null;
  return {
    ok: true,
    value: {
      account_id: values.account_id,
      paid_from_account_id: payer === values.account_id ? null : payer,
      kind: values.kind,
      amount,
      mode: isTransfer ? null : values.mode,
      transfer_from: isTransfer ? values.transfer_from : null,
      transfer_to: isTransfer ? values.transfer_to : null,
      transaction_date: values.transaction_date,
      due_date: dueDate.length > 0 ? dueDate : null,
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

// ─── Settle form ─────────────────────────────────────────────────────────────

export function emptySettleForm(entry: FinanceEntry, defaultDate: string): SettleFormValues {
  return {
    amount: remainingAmount(entry).toString(),
    mode: 'cash',
    transaction_date: defaultDate,
    paid_from_account_id: '',
    reference_no: '',
    notes: '',
  };
}

export type SettleValidation = { ok: true; value: SettleEntryInput } | { ok: false; errors: SettleFormErrors };

/**
 * `owed` is what the entry's account owes the counterparty account right
 * now, the most an offset can clear; pass it when the mode is 'offset'.
 */
export function validateSettleForm(values: SettleFormValues, entry: FinanceEntry, owed?: number): SettleValidation {
  const errors: SettleFormErrors = {};
  const remaining = remainingAmount(entry);
  const amount = parseAmountInput(values.amount);
  const offset = values.mode === 'offset';
  if (offset && !canOffsetEntry(entry)) errors.mode = 'Only a receivable from one of our own accounts can be offset.';
  if (amount === null) errors.amount = 'Enter an amount like 1250 or 1250.50.';
  else if (amount <= 0) errors.amount = 'The amount must be more than zero.';
  else if (amount > remaining + 0.004) errors.amount = `Only ${remaining.toFixed(2)} remains on this entry.`;
  else if (offset && owed !== undefined && amount > owed + 0.004) errors.amount = `Only ${owed.toFixed(2)} is owed to that account to offset against.`;
  if (!ISO_DATE.test(values.transaction_date) || Number.isNaN(Date.parse(values.transaction_date))) {
    errors.transaction_date = 'Use the calendar, or type the date as YYYY-MM-DD.';
  }
  if (values.reference_no.length > 60) errors.reference_no = 'Keep the reference under 60 characters.';
  if (values.notes.length > 500) errors.notes = 'Keep notes under 500 characters.';
  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };
  // An offset is always "paid from" the counterparty; the database sets that itself.
  const payer = offset ? null : emptyToNull(values.paid_from_account_id);
  return {
    ok: true,
    value: {
      entry_id: entry.id,
      amount,
      mode: values.mode,
      transaction_date: values.transaction_date,
      paid_from_account_id: payer === entry.account_id ? null : payer,
      reference_no: emptyToNull(values.reference_no),
      notes: emptyToNull(values.notes),
    },
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

/**
 * How many rows a phone keeps as it scrolls. Past this the list stops
 * growing and asks for a narrower range, so memory stays bounded.
 */
export const LEDGER_MAX_ROWS = 1000;

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
    counterparty: null,
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
  paid_from_account_id: 'Paid from',
  kind: 'Kind',
  status: 'Status',
  amount_paise: 'Amount',
  mode: 'Paid via',
  transfer_from: 'From',
  transfer_to: 'To',
  transaction_date: 'Transaction date',
  due_date: 'Due date',
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
    if (field === 'account_id' || field === 'paid_from_account_id') return lookups.accounts.find((a) => a.id === value)?.name ?? String(value);
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
