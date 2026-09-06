/**
 * Server-side Supabase client factory for the approval API.
 *
 * The approval database layer no longer uses a shared anonymous client.
 * Every handler authenticates the caller first (see src/lib/server/api-auth.ts)
 * and passes the caller-scoped client into the approval-service functions,
 * so Row Level Security applies to every read and write.
 */
export { createUserScopedClient as createApprovalDbClient } from '../server/api-auth';
export type { SupabaseClient as ApprovalDbClient } from '@supabase/supabase-js';
