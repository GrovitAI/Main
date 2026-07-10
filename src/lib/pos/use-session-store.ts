import { create } from 'zustand';
import { storage } from './storage';
import { supabase } from './supabase';
import { getPermissionsForRole, type PosSession, type UserRole, type Branch, type TerminalStatus } from './session-context';

function generateUuid(): string {
  // Standard RFC4122 v4 UUID generator in pure JS
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getOrGenerateDeviceUuid(): Promise<string> {
  let uuid = await storage.getDeviceId();
  if (!uuid) {
    uuid = generateUuid();
    await storage.setDeviceId(uuid);
  }
  return uuid;
}

type SessionState = {
  session: PosSession | null;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  updateActivity: () => void;
  clearError: () => void;
};

export const useSessionStore = create<SessionState>((set) => {
  // Listen for auth state changes on initialization
  supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') {
      set({ session: null });
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('grovit_active_order_id');
        window.localStorage.removeItem('grovit_printed_orders');
      }
    }
  });

  return {
    session: null,
    isLoading: false,
    error: null,

    clearError: () => set({ error: null }),

    signIn: async (email, password) => {
      set({ isLoading: true, error: null });
      try {
        // 1. Authenticate with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError || !authData.user) {
          throw new Error(authError?.message || 'Invalid email or password.');
        }

        const authUser = authData.user;

        // 2. Fetch staff profile (must be active and not soft-deleted)
        const { data: staff, error: staffError } = await supabase
          .from('staff')
          .select('*')
          .eq('auth_user_id', authUser.id)
          .eq('status', 'active')
          .is('deleted_at', null)
          .maybeSingle();

        if (staffError) {
          throw new Error('Database error loading staff profile.');
        }

        if (!staff) {
          await supabase.auth.signOut();
          throw new Error('Your account is inactive or suspended. Contact your manager.');
        }

        const role = staff.role as UserRole;
        const tenantId = staff.tenant_id;
        // Every user is permanently bound to their assigned branch
        const branchId = staff.branch_id;

        // Fetch tenant details
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', tenantId)
          .maybeSingle();
        const tenantName = tenant?.name || 'Le Leban';

        // Fetch branch details
        const { data: branch } = await supabase
          .from('branches')
          .select('name')
          .eq('id', branchId)
          .maybeSingle();
        const branchName = branch?.name || 'Main Branch';

        // 3. Load accessible branches (for owner reports filter; others get own branch only)
        let accessibleBranches: Branch[] = [];
        if (role === 'owner') {
          const { data: bData } = await supabase
            .from('branches')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('name');
          accessibleBranches = (bData || []) as Branch[];
        } else {
          // Cashier / Manager / Kitchen — only their own branch
          const { data: bData } = await supabase
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .maybeSingle();
          if (bData) {
            accessibleBranches = [bData as Branch];
          }
        }

        // 4. Resolve terminal matching
        const deviceUuid = await getOrGenerateDeviceUuid();
        let terminalId: string | null = null;
        let terminalCode = 'UNKNOWN_DEVICE';
        let terminalName = 'Unregistered Device';
        let terminalStatus: TerminalStatus = 'UNKNOWN_DEVICE';

        const { data: terminal } = await supabase
          .from('pos_terminals')
          .select('*')
          .eq('device_uuid', deviceUuid)
          .eq('branch_id', branchId)
          .maybeSingle();

        if (terminal) {
          terminalId = terminal.id;
          terminalCode = terminal.terminal_code;
          terminalName = terminal.friendly_name;
          terminalStatus = terminal.status === 'active' ? 'REGISTERED' : 'DISABLED';
        }

        // 5. Update last login timestamp in background
        void supabase
          .from('staff')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', staff.id);

        // 6. Build the final PosSession object
        const permissions = getPermissionsForRole(role);
        const expiresAt = authData.session?.expires_at
          ? new Date(authData.session.expires_at * 1000).toISOString()
          : new Date(Date.now() + 3600 * 1000).toISOString();

        const session: PosSession = {
          sessionId: generateUuid(),
          userId: authUser.id,
          staffId: staff.id,
          tenantId,
          tenantName,
          role,
          displayName: staff.name,
          branchId,
          branchName,
          accessibleBranches,
          terminalId,
          terminalCode,
          terminalName,
          terminalStatus,
          permissions,
          createdAt: new Date().toISOString(),
          expiresAt,
          lastValidatedAt: new Date().toISOString(),
          issuedAt: new Date().toISOString(),
          jwtExpiresAt: expiresAt,
          lastActivityAt: new Date().toISOString(),
        };

        set({ session, isLoading: false });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Authentication failed.';
        console.error('[useSessionStore] signIn failed:', err);
        set({ error: message, isLoading: false });
      }
    },

    signOut: async () => {
      set({ isLoading: true, error: null });
      try {
        await supabase.auth.signOut();
        set({ session: null, isLoading: false });
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem('grovit_active_order_id');
          window.localStorage.removeItem('grovit_printed_orders');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Logout failed.';
        console.error('[useSessionStore] signOut failed:', err);
        set({ error: message, isLoading: false, session: null });
      }
    },

    restoreSession: async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (!authData.session || !authData.session.user) {
          set({ session: null });
          return false;
        }

        const authUser = authData.session.user;

        // Verify profile is still active
        const { data: staff, error: staffError } = await supabase
          .from('staff')
          .select('*')
          .eq('auth_user_id', authUser.id)
          .eq('status', 'active')
          .is('deleted_at', null)
          .maybeSingle();

        if (staffError || !staff) {
          await supabase.auth.signOut();
          set({ session: null });
          return false;
        }

        const role = staff.role as UserRole;
        const tenantId = staff.tenant_id;
        const branchId = staff.branch_id;

        // Fetch tenant details
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', tenantId)
          .maybeSingle();
        const tenantName = tenant?.name || 'Le Leban';

        // Fetch branch details
        const { data: branch } = await supabase
          .from('branches')
          .select('name')
          .eq('id', branchId)
          .maybeSingle();
        const branchName = branch?.name || 'Main Branch';

        // Load accessible branches
        let accessibleBranches: Branch[] = [];
        if (role === 'owner') {
          const { data: bData } = await supabase
            .from('branches')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('name');
          accessibleBranches = (bData || []) as Branch[];
        } else {
          const { data: bData } = await supabase
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .maybeSingle();
          if (bData) {
            accessibleBranches = [bData as Branch];
          }
        }

        // Fetch terminal registry status
        const deviceUuid = await getOrGenerateDeviceUuid();
        let terminalId: string | null = null;
        let terminalCode = 'UNKNOWN_DEVICE';
        let terminalName = 'Unregistered Device';
        let terminalStatus: TerminalStatus = 'UNKNOWN_DEVICE';

        const { data: terminal } = await supabase
          .from('pos_terminals')
          .select('*')
          .eq('device_uuid', deviceUuid)
          .eq('branch_id', branchId)
          .maybeSingle();

        if (terminal) {
          terminalId = terminal.id;
          terminalCode = terminal.terminal_code;
          terminalName = terminal.friendly_name;
          terminalStatus = terminal.status === 'active' ? 'REGISTERED' : 'DISABLED';
        }

        const permissions = getPermissionsForRole(role);
        const expiresAt = authData.session.expires_at
          ? new Date(authData.session.expires_at * 1000).toISOString()
          : new Date(Date.now() + 3600 * 1000).toISOString();

        const session: PosSession = {
          sessionId: generateUuid(),
          userId: authUser.id,
          staffId: staff.id,
          tenantId,
          tenantName,
          role,
          displayName: staff.name,
          branchId,
          branchName,
          accessibleBranches,
          terminalId,
          terminalCode,
          terminalName,
          terminalStatus,
          permissions,
          createdAt: new Date().toISOString(),
          expiresAt,
          lastValidatedAt: new Date().toISOString(),
          issuedAt: new Date().toISOString(),
          jwtExpiresAt: expiresAt,
          lastActivityAt: new Date().toISOString(),
        };

        set({ session });
        return true;
      } catch (err) {
        console.error('[useSessionStore] restoreSession failed:', err);
        set({ session: null });
        return false;
      }
    },

    updateActivity: () => {
      set((state) => {
        if (!state.session) return {};
        return {
          session: {
            ...state.session,
            lastActivityAt: new Date().toISOString(),
          },
        };
      });
    },
  };
});
