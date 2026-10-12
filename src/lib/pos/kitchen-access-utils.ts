import { KITCHEN_PERMISSIONS, type KitchenAccess, type KitchenAuditRow, type KitchenPermission, type KitchenPreset } from './kitchen-access-types';

/** Plain names for each permission, grouped as the owner sees them. */
export const PERMISSION_GROUPS: readonly { title: string; items: readonly { key: KitchenPermission; label: string; hint?: string }[] }[] = [
  { title: 'Entries', items: [
    { key: 'entries.send', label: 'Send items to branches' },
    { key: 'entries.receive', label: 'Record money from branches' },
    { key: 'entries.buy', label: 'Record purchases' },
    { key: 'entries.pay', label: 'Pay vendors' },
    { key: 'entries.spend', label: 'Record other expenses' },
    { key: 'entries.batch', label: 'Record batches made' },
    { key: 'entries.count', label: 'Record stock counts' },
    { key: 'entries.backdate', label: 'Enter earlier dates', hint: 'Without this, entries are for today only' },
  ] },
  { title: 'Corrections', items: [
    { key: 'fix.own', label: 'Edit or void own entries', hint: 'Only on the day they were made' },
    { key: 'fix.any', label: 'Edit or void anyone’s entries' },
  ] },
  { title: 'Invoices', items: [
    { key: 'invoices.create', label: 'Create invoices' },
    { key: 'invoices.receive', label: 'Record invoice payments' },
    { key: 'invoices.cancel', label: 'Cancel invoices' },
  ] },
  { title: 'Money', items: [
    { key: 'money.view', label: 'See Cash and Bank balances' },
    { key: 'money.move', label: 'Move money between Cash and Bank' },
    { key: 'money.opening', label: 'Set opening balances' },
  ] },
  { title: 'Lists', items: [
    { key: 'setup.items', label: 'Add and edit items and prices' },
    { key: 'setup.parties', label: 'Add and edit branches and vendors' },
    { key: 'setup.categories', label: 'Add and edit categories' },
    { key: 'setup.roster', label: 'Add and edit attendance staff' },
  ] },
  { title: 'Attendance and reports', items: [
    { key: 'attendance.mark', label: 'Mark attendance' },
    { key: 'reports.view', label: 'See analytics and reports' },
    { key: 'reports.export', label: 'Export reports' },
    { key: 'amounts.view', label: 'See amounts and prices', hint: 'Off shows quantities only' },
    { key: 'audit.view', label: 'See the change log' },
  ] },
];

const ALL: readonly KitchenPermission[] = KITCHEN_PERMISSIONS;

/** The starting roles. The owner can switch any permission on or off after picking one. */
export const PRESETS: readonly { id: Exclude<KitchenPreset, 'custom'>; label: string; summary: string; permissions: readonly KitchenPermission[] }[] = [
  { id: 'manager', label: 'Kitchen manager', summary: 'Everything except permissions and day locks', permissions: ALL },
  { id: 'clerk', label: 'Entry clerk', summary: 'Sends, purchases, batches and counts; fixes own entries the same day',
    permissions: ['entries.send', 'entries.buy', 'entries.batch', 'entries.count', 'fix.own', 'attendance.mark', 'amounts.view'] },
  { id: 'storekeeper', label: 'Store keeper', summary: 'Quantities only: batches, counts and sends, no money',
    permissions: ['entries.send', 'entries.batch', 'entries.count', 'fix.own', 'attendance.mark'] },
  { id: 'accounts', label: 'Accounts', summary: 'Money, payments, invoices and reports; no stock entries',
    permissions: ['entries.receive', 'entries.pay', 'entries.spend', 'entries.backdate', 'fix.own', 'invoices.create', 'invoices.receive', 'invoices.cancel',
      'money.view', 'money.move', 'money.opening', 'reports.view', 'reports.export', 'amounts.view', 'audit.view'] },
];

export const presetLabel = (preset: KitchenPreset): string => PRESETS.find((p) => p.id === preset)?.label ?? 'Custom';

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));

/** The starting role these permissions match exactly, or custom. */
export function presetFor(permissions: readonly KitchenPermission[]): KitchenPreset {
  return PRESETS.find((p) => sameSet(p.permissions, permissions))?.id ?? 'custom';
}

export const isKitchenPermission = (value: unknown): value is KitchenPermission =>
  typeof value === 'string' && (ALL as readonly string[]).includes(value);

/** Before the database answers (or on an older database), the kitchen behaves as it always has. */
export function fullAccess(today: string): KitchenAccess {
  return { role: 'kitchen', isOwner: false, preset: 'manager', permissions: ALL, today, lockedThrough: null, autoLock: false, openUntilHour: 11, lockThrough: null, lockUpdatedBy: null, lockUpdatedAt: null };
}

export const can = (access: KitchenAccess, permission: KitchenPermission): boolean => access.isOwner || access.permissions.includes(permission);
export const canAny = (access: KitchenAccess, permissions: readonly KitchenPermission[]): boolean => permissions.some((p) => can(access, p));

/** True when a change dated `day` (YYYY-MM-DD) falls on a locked day. */
export const isDayLocked = (access: KitchenAccess, day: string): boolean => !!access.lockedThrough && day <= access.lockedThrough;

/**
 * What stops this login from saving on `day`, in words, or null when it may.
 * The owner is never stopped by a lock; they give a reason instead.
 */
export function dateBlock(access: KitchenAccess, day: string): string | null {
  if (day > access.today) return 'Entries cannot be dated in the future.';
  if (isDayLocked(access, day) && !access.isOwner) return `${dayText(day)} is locked. Ask the owner to correct it.`;
  if (day < access.today && !can(access, 'entries.backdate')) return 'This login records today’s entries only.';
  return null;
}

/** May this login edit or void the entry? (fix.any, or fix.own on the day it was made.) */
export function canFix(access: KitchenAccess, entry: { created_by_id?: string | null; created_at: string }, userId: string | null, localDay: (iso: string) => string): boolean {
  if (can(access, 'fix.any')) return true;
  return can(access, 'fix.own') && !!userId && entry.created_by_id === userId && localDay(entry.created_at) === access.today;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** "5 Oct" from "2026-10-05". */
export function dayText(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`.trim();
}

/** "11 am", "12 noon", "6 pm". */
export function hourText(hour: number): string {
  if (hour === 0) return '12 midnight';
  if (hour === 12) return '12 noon';
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

/** One sentence describing how days lock now. */
export function lockSummary(access: KitchenAccess): string {
  const parts: string[] = [];
  if (access.autoLock) parts.push(`each day locks at ${hourText(access.openUntilHour)} the next day`);
  if (access.lockThrough) parts.push(`everything up to ${dayText(access.lockThrough)} is locked`);
  if (parts.length === 0) return 'No days are locked.';
  const text = parts.join(', and ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

const ACTIONS: Record<string, string> = {
  locked_day_change: 'Changed a locked day',
  entry_voided: 'Voided an entry',
  entry_edited: 'Edited an entry',
  access_changed: 'Changed permissions',
  lock_changed: 'Changed the day lock',
  invoice_cancelled: 'Cancelled an invoice',
  money_moved: 'Moved money',
  money_move_voided: 'Voided a money move',
  opening_set: 'Set opening balances',
};

/** A change-log row as a headline and a detail line. */
export function auditText(row: KitchenAuditRow): { title: string; detail: string } {
  const title = ACTIONS[row.action] ?? row.action;
  const bits: string[] = [];
  const d = row.details;
  if (row.action === 'access_changed') {
    const name = typeof d.name === 'string' ? d.name : 'A login';
    const preset = typeof d.preset === 'string' && ['manager', 'clerk', 'storekeeper', 'accounts', 'custom'].includes(d.preset) ? presetLabel(d.preset as KitchenPreset) : 'Custom';
    bits.push(`${name} → ${preset}`);
  } else if (row.action === 'lock_changed') {
    const after = typeof d.after === 'object' && d.after !== null ? (d.after as Record<string, unknown>) : {};
    const auto = after.auto_lock === true && typeof after.open_until_hour === 'number' ? `auto-lock at ${hourText(after.open_until_hour)}` : 'auto-lock off';
    bits.push(typeof after.lock_through === 'string' ? `${auto}, locked up to ${dayText(after.lock_through)}` : auto);
  } else if (typeof d.type === 'string' && typeof d.created_by === 'string') {
    bits.push(`${d.type} by ${d.created_by}`);
  }
  if (row.onDate && row.action !== 'lock_changed' && row.action !== 'access_changed') bits.push(`dated ${dayText(row.onDate)}`);
  if (row.reason && row.reason !== 'Edited') bits.push(`“${row.reason}”`);
  return { title, detail: bits.join(' · ') };
}
