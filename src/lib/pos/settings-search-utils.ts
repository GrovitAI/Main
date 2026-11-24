/**
 * Task 338: searching Settings. Every setting a person can change is listed here with the page it is on
 * and the words they might type for it ("qr", "footer", "owner code"). A search shows the matching
 * settings, and a tap opens the page that holds the setting. What a login may not see never matches.
 */

export type SettingsPaneId = 'printers' | 'receipt' | 'tables' | 'approvals' | 'finance' | 'about';

export type SettingsEntry = {
  id: string;
  /** The page it opens: a Settings page, or the Central Kitchen. */
  pane: SettingsPaneId | 'kitchen';
  title: string;
  /** What it does, in a few words, shown under the title. */
  detail: string;
  keywords: readonly string[];
  /** Who sees it: everyone, managers and above, owners and admins, or owners only. */
  who: 'all' | 'manager' | 'admin' | 'owner';
};

export type SettingsAccess = { manager: boolean; admin: boolean; owner: boolean; finance: boolean };

export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  { id: 'printers', pane: 'printers', title: 'Printers', detail: 'Bill and kitchen printers on the counter PC', keywords: ['printer', 'print', 'thermal', 'printnode', 'refresh', 'online', 'offline'], who: 'all' },
  { id: 'printer-use', pane: 'printers', title: 'Printer in use', detail: 'Switch a printer on or off for the till', keywords: ['printer', 'enable', 'disable', 'active'], who: 'all' },
  { id: 'printer-role', pane: 'printers', title: 'What a printer prints', detail: 'Bills or kitchen orders', keywords: ['printer', 'bills', 'kitchen', 'kot', 'ticket', 'role'], who: 'all' },
  { id: 'printer-main', pane: 'printers', title: 'Main bill printer', detail: 'Where bills go when several printers print bills', keywords: ['printer', 'default', 'bill'], who: 'all' },
  { id: 'printer-test', pane: 'printers', title: 'Print a test page', detail: 'Check a printer works', keywords: ['printer', 'test', 'page'], who: 'all' },
  { id: 'receipt', pane: 'receipt', title: 'Receipt footer', detail: 'The line at the bottom of a bill', keywords: ['bill', 'thank you', 'message', 'text', 'bottom'], who: 'all' },
  { id: 'tables', pane: 'tables', title: 'Table ordering', detail: 'Let customers order from a QR code on the table', keywords: ['qr', 'table', 'customer', 'scan', 'menu', 'order', 'switch', 'on', 'off'], who: 'manager' },
  { id: 'tables-outlet', pane: 'tables', title: 'Outlet for table ordering', detail: 'Each outlet has its own tables and switch', keywords: ['outlet', 'branch', 'qr', 'table'], who: 'owner' },
  { id: 'tables-add', pane: 'tables', title: 'Add tables', detail: 'Numbered after the last table', keywords: ['table', 'qr', 'new', 'number'], who: 'manager' },
  { id: 'tables-print', pane: 'tables', title: 'Print all QR codes', detail: 'A sheet of table cards, four to a page', keywords: ['qr', 'table', 'print', 'sheet', 'download'], who: 'manager' },
  { id: 'tables-new-code', pane: 'tables', title: 'New QR code for a table', detail: 'The old printed code stops working', keywords: ['qr', 'table', 'replace', 'reset', 'leaked'], who: 'manager' },
  { id: 'approvals', pane: 'approvals', title: 'Approvals', detail: 'Till actions that need the owner’s code', keywords: ['owner code', 'cancel', 'discount', 'approve', 'permission', 'pin'], who: 'admin' },
  { id: 'finance', pane: 'finance', title: 'Finance', detail: 'Accounts and rules', keywords: ['accounts', 'cash', 'bank', 'rules', 'expense', 'money'], who: 'owner' },
  { id: 'about', pane: 'about', title: 'About this device', detail: 'Version, currency and print protocol', keywords: ['version', 'inr', 'currency', 'esc/pos', 'protocol', 'bridge', 'app'], who: 'all' },
  { id: 'kitchen', pane: 'kitchen', title: 'Central Kitchen', detail: 'Books, stock and what each branch owes', keywords: ['central', 'kitchen', 'stock', 'books', 'vendors', 'branches'], who: 'admin' },
];

/** What this login may see. Finance also needs the finance module to be on. */
export function visibleEntries(entries: readonly SettingsEntry[], access: SettingsAccess): SettingsEntry[] {
  return entries.filter((e) => {
    if (e.pane === 'finance' && !(access.owner && access.finance)) return false;
    if (e.who === 'all') return true;
    if (e.who === 'manager') return access.manager;
    if (e.who === 'admin') return access.admin;
    return access.owner;
  });
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The entries every typed word appears in (in the title, the detail or the keywords), best first: a title
 * that starts with what was typed, then one that contains it, then the rest in their usual order.
 */
export function searchSettings(entries: readonly SettingsEntry[], query: string): SettingsEntry[] {
  const words = norm(query).split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const scored = entries.flatMap((entry, order) => {
    const title = norm(entry.title);
    const hay = [title, norm(entry.detail), ...entry.keywords.map(norm)].join(' ');
    if (!words.every((w) => hay.includes(w))) return [];
    const rank = words.every((w) => title.startsWith(w) || title.includes(` ${w}`)) ? 0 : words.every((w) => title.includes(w)) ? 1 : 2;
    return [{ entry, rank, order }];
  });
  return scored.sort((a, b) => a.rank - b.rank || a.order - b.order).map((s) => s.entry);
}
