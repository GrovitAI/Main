import { SETTINGS_ENTRIES, searchSettings, visibleEntries, type SettingsAccess } from '@/lib/pos/settings-search-utils';

const cashier: SettingsAccess = { manager: false, admin: false, owner: false, finance: true };
const manager: SettingsAccess = { manager: true, admin: false, owner: false, finance: true };
const admin: SettingsAccess = { manager: true, admin: true, owner: false, finance: true };
const owner: SettingsAccess = { manager: true, admin: true, owner: true, finance: true };
const ids = (list: readonly { id: string }[]): string[] => list.map((e) => e.id);

describe('what a login can find', () => {
  it('shows a cashier only the printer, receipt and device settings', () => {
    expect(new Set(visibleEntries(SETTINGS_ENTRIES, cashier).map((e) => e.pane))).toEqual(new Set(['printers', 'receipt', 'about']));
  });
  it('adds table ordering for a manager, and approvals with Central Kitchen for an admin', () => {
    expect(visibleEntries(SETTINGS_ENTRIES, manager).map((e) => e.pane)).toContain('tables');
    expect(visibleEntries(SETTINGS_ENTRIES, manager).map((e) => e.pane)).not.toContain('approvals');
    expect(visibleEntries(SETTINGS_ENTRIES, admin).map((e) => e.pane)).toEqual(expect.arrayContaining(['approvals', 'kitchen']));
    expect(ids(visibleEntries(SETTINGS_ENTRIES, admin))).not.toContain('tables-outlet');
  });
  it('shows the outlet picker and Finance to the owner only, and Finance only with the module on', () => {
    expect(ids(visibleEntries(SETTINGS_ENTRIES, owner))).toEqual(expect.arrayContaining(['tables-outlet', 'finance']));
    expect(ids(visibleEntries(SETTINGS_ENTRIES, { ...owner, finance: false }))).not.toContain('finance');
    expect(ids(visibleEntries(SETTINGS_ENTRIES, admin))).not.toContain('finance');
  });
});

describe('searchSettings', () => {
  const all = visibleEntries(SETTINGS_ENTRIES, owner);

  it('finds nothing for an empty search', () => {
    expect(searchSettings(all, '')).toEqual([]);
    expect(searchSettings(all, '   ')).toEqual([]);
  });

  it('finds a setting by a word it is known by, not just its name', () => {
    expect(ids(searchSettings(all, 'qr'))).toEqual(expect.arrayContaining(['tables', 'tables-print', 'tables-new-code']));
    expect(ids(searchSettings(all, 'footer'))).toEqual(['receipt']);
    expect(ids(searchSettings(all, 'owner code'))).toEqual(['approvals']);
    expect(ids(searchSettings(all, 'esc/pos'))).toEqual(['about']);
  });

  it('needs every word typed, in any order, and ignores case and spacing', () => {
    expect(ids(searchSettings(all, '  PRINT   qr '))).toContain('tables-print');
    expect(ids(searchSettings(all, 'qr print'))).toContain('tables-print');
    expect(searchSettings(all, 'qr zzz')).toEqual([]);
  });

  it('puts a title that starts with the search first', () => {
    const found = ids(searchSettings(all, 'table'));
    expect(found[0]).toBe('tables');
    // A title that only mentions it comes after one that starts with it.
    expect(found.indexOf('tables')).toBeLessThan(found.indexOf('tables-new-code'));
    expect(found).not.toContain('printer-test');
  });

  it('never finds what the login may not see', () => {
    const visible = visibleEntries(SETTINGS_ENTRIES, cashier);
    expect(searchSettings(visible, 'qr')).toEqual([]);
    expect(searchSettings(visible, 'finance')).toEqual([]);
    expect(ids(searchSettings(visible, 'printer'))).toContain('printers');
  });
});
