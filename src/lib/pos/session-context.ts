export type Permission =
  | 'discount'
  | 'void'
  | 'refund'
  | 'reports'
  | 'inventory'
  | 'staff_manage'
  | 'tenant_settings';

export type UserRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'kitchen';

export type TerminalStatus = 'REGISTERED' | 'PENDING_APPROVAL' | 'DISABLED' | 'UNKNOWN_DEVICE';

export type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  invoice_prefix: string;
  branch_type: string | null;
  is_active: boolean;
  created_at?: string;
};

export type PosSession = {
  sessionId: string;                 // unique UUID generated on session instantiation
  userId: string;                    // auth.users.id
  staffId: string;                   // public.staff.id
  tenantId: string;                  // staff.tenant_id
  tenantName: string;                // tenants.name
  role: UserRole;                    // staff.role
  displayName: string;               // staff.name

  branchId: string;                  // staff.branch_id — always the logged-in user's branch
  branchName: string;                // branches.name
  accessibleBranches: Branch[];      // All branches in tenant (owner/admin) or own branch only

  terminalId: string | null;         // pos_terminals.id
  terminalCode: string;              // pos_terminals.terminal_code
  terminalName: string;              // pos_terminals.friendly_name
  terminalStatus: TerminalStatus;    // Registration status constraint

  permissions: Permission[];         // Operational permission claims

  // Security & Audit timestamps
  createdAt: string;                 // ISO string of session instantiation
  expiresAt: string;                 // ISO string of session JWT expiry
  lastValidatedAt: string;           // ISO string of last backend check
  issuedAt: string;                  // ISO string when session was created/authenticated
  jwtExpiresAt: string;              // ISO string when the underlying Supabase JWT expires
  lastActivityAt: string;            // ISO string of last user interaction (for idle-out blocks)
};

// Map roles to their static permissions
export function getPermissionsForRole(role: UserRole): Permission[] {
  switch (role) {
    case 'owner':
      return [
        'discount',
        'void',
        'refund',
        'reports',
        'inventory',
        'staff_manage',
        'tenant_settings',
      ];
    case 'admin':
      return [
        'discount',
        'void',
        'refund',
        'reports',
        'inventory',
        'staff_manage',
      ];
    case 'manager':
      return [
        'discount',
        'void',
        'reports',
        'inventory',
        'staff_manage',
      ];
    case 'cashier':
      return [
        'discount',
      ];
    case 'kitchen':
      return [];
    default:
      return [];
  }
}

// Temporary fallback role for backward compatibility during dev
export const CURRENT_ROLE: UserRole = 'owner';
export const CURRENT_SESSION_ID = '00000000-0000-0000-0000-000000000000';
export const CURRENT_TERMINAL_ID = '00000000-0000-0000-0000-000000000000';
