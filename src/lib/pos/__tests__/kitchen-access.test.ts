import { KITCHEN_PERMISSIONS, type KitchenAccess } from '../kitchen-access-types';
import { PERMISSION_GROUPS, PRESETS, auditText, can, canFix, dateBlock, fullAccess, isDayLocked, lockSummary, presetFor } from '../kitchen-access-utils';
import { parseAccess } from '../kitchen-access-service';

jest.mock('@/lib/pos/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/pos/tenant-context', () => ({ getTenantContext: jest.fn(() => ({ tenant_id: 'tenant', branch_id: 'kitchen' })) }));
jest.mock('@/lib/pos/kitchen-service', () => ({ kitchenBranch: () => ({ id: 'kitchen', name: 'Kitchen' }) }));

const today = '2026-10-12';
const clerk: KitchenAccess = { ...fullAccess(today), preset: 'clerk', permissions: PRESETS.find((p) => p.id === 'clerk')?.permissions ?? [] };
const localDay = (iso: string): string => iso.slice(0, 10);

test('every permission is offered to the owner exactly once', () => {
  const offered = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
  expect([...offered].sort()).toEqual([...KITCHEN_PERMISSIONS].sort());
});

test('presets are recognised, and anything else is custom', () => {
  for (const p of PRESETS) expect(presetFor([...p.permissions].reverse())).toBe(p.id);
  expect(presetFor(['entries.send'])).toBe('custom');
});

test('a clerk records today only; locked days stop everyone but the owner', () => {
  expect(dateBlock(clerk, today)).toBeNull();
  expect(dateBlock(clerk, '2026-10-11')).toMatch(/today’s entries only/);
  expect(dateBlock(clerk, '2026-10-13')).toMatch(/future/);
  const locked = { ...fullAccess(today), lockedThrough: '2026-10-11' };
  expect(isDayLocked(locked, '2026-10-11')).toBe(true);
  expect(dateBlock(locked, '2026-10-10')).toMatch(/locked/);
  expect(dateBlock({ ...locked, isOwner: true }, '2026-10-10')).toBeNull();
});

test('own entries are fixable only on the day they were made', () => {
  const entry = { created_by_id: 'me', created_at: `${today}T05:00:00Z` };
  expect(canFix(clerk, entry, 'me', localDay)).toBe(true);
  expect(canFix(clerk, entry, 'someone-else', localDay)).toBe(false);
  expect(canFix(clerk, { ...entry, created_at: '2026-10-11T05:00:00Z' }, 'me', localDay)).toBe(false);
  expect(canFix(fullAccess(today), { created_by_id: null, created_at: '2026-01-01T00:00:00Z' }, 'me', localDay)).toBe(true);
});

test('the owner can do everything whatever the list says', () => {
  expect(can({ ...clerk, isOwner: true }, 'money.opening')).toBe(true);
  expect(can(clerk, 'money.opening')).toBe(false);
});

test('access from the database is parsed defensively', () => {
  const a = parseAccess({ is_owner: false, preset: 'clerk', permissions: ['entries.send', 'bogus'], today, locked_through: '2026-10-10', auto_lock: true, open_until_hour: 9 }, today);
  expect(a.permissions).toEqual(['entries.send']);
  expect(a.lockedThrough).toBe('2026-10-10');
  expect(parseAccess(null, today).permissions.length).toBe(KITCHEN_PERMISSIONS.length);
});

test('lock and change-log wording', () => {
  expect(lockSummary(fullAccess(today))).toBe('No days are locked.');
  expect(lockSummary({ ...fullAccess(today), autoLock: true, openUntilHour: 11, lockThrough: '2026-09-30' })).toBe('Each day locks at 11 am the next day, and everything up to 30 Sep is locked.');
  const row = { id: '1', createdAt: '', actorName: 'Rasmil', action: 'locked_day_change', subject: 'entry', onDate: '2026-10-05', reason: 'Late bill', details: {} };
  expect(auditText(row)).toEqual({ title: 'Changed a locked day', detail: 'dated 5 Oct · “Late bill”' });
});
