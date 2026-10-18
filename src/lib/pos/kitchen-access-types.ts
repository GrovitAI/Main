/** Every permission a kitchen login can hold (kitchen_all_permissions in the database). */
export const KITCHEN_PERMISSIONS = [
  'entries.send', 'entries.receive', 'entries.buy', 'entries.pay', 'entries.spend', 'entries.batch', 'entries.count', 'entries.backdate',
  'entries.issue',
  'fix.own', 'fix.any',
  'invoices.create', 'invoices.receive', 'invoices.cancel',
  'money.view', 'money.move', 'money.opening',
  'setup.items', 'setup.parties', 'setup.categories', 'setup.roster',
  'attendance.mark', 'reports.view', 'reports.export', 'amounts.view', 'audit.view',
] as const;

export type KitchenPermission = (typeof KITCHEN_PERMISSIONS)[number];
export type KitchenPreset = 'manager' | 'clerk' | 'storekeeper' | 'accounts' | 'custom';

/** What the signed-in person may do in this kitchen, and how its days are locked. */
export type KitchenAccess = {
  role: string;
  isOwner: boolean;
  preset: KitchenPreset;
  permissions: readonly KitchenPermission[];
  /** Today in India, from the database clock. */
  today: string;
  /** The last locked day (automatic lock or the owner's date), or null. */
  lockedThrough: string | null;
  autoLock: boolean;
  /** With the automatic lock, yesterday stays open until this hour today. */
  openUntilHour: number;
  /** The owner's own "locked up to" date. */
  lockThrough: string | null;
  lockUpdatedBy: string | null;
  lockUpdatedAt: string | null;
};

export type KitchenTeamMember = {
  staffId: string;
  name: string;
  email: string | null;
  lastLoginAt: string | null;
  preset: KitchenPreset;
  permissions: KitchenPermission[];
  updatedBy: string | null;
  updatedAt: string | null;
};

export type KitchenAuditRow = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  subject: string;
  onDate: string | null;
  reason: string | null;
  details: Record<string, unknown>;
};

export type KitchenLockInput = { autoLock: boolean; openUntilHour: number; lockThrough: string | null };
