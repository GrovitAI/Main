# AGENTS.md — Rules for AI Assistants

<!-- Expo versioned docs — read before writing any code -->
Read https://docs.expo.dev/versions/v54.0.0/ before writing any code.
Read PROJECT_CONTEXT.md before every session.

## Non-negotiable rules

1. TypeScript strict — no any, no non-null assertions
2. Every Supabase query must include tenant_id AND branch_id
3. Import tenant context ONLY from src/lib/pos/tenant-context.ts
4. NativeWind for all styling — no StyleSheet unless absolutely necessary
5. No hardcoded colors — use design tokens from src/lib/pos/brand.ts
6. No HTML elements — View, Text, Pressable, FlatList only
7. No next/* imports anywhere
8. No "use client" directives
9. Production grade TypeScript only
10. Never break existing imports
11. Minimal changes — modify only files necessary for the task
12. Never rewrite working modules

## Multi-tenant rules
Every Supabase query must include:
  .eq('tenant_id', TENANT_ID)
  .eq('branch_id', BRANCH_ID)

Import pattern (always):
  import { TENANT_ID, BRANCH_ID } from '@/lib/pos/tenant-context'

Never hardcode UUIDs outside tenant-context.ts.

## Migration rules
- One file per change in supabase/migrations/, applied one at a time and verified before the next
- Every migration that creates a table must, in the same file:
    ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.t FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.t TO service_role;
    GRANT <only what the app needs> ON public.t TO authenticated;   -- or REVOKE ALL if only functions write it
  Supabase stops granting the API roles automatically from 2026-10-30; a table
  without its own grants is unreachable on a fresh database, preview branch or
  db reset. See 20260926000100_explicit_table_grants.sql for the current shape.
- Never grant anon on a table: the app always signs in
- Idempotent: IF NOT EXISTS, CREATE OR REPLACE, and guards, so a file can run twice

## Service layer rules
- All Supabase logic in src/lib/pos/*-service.ts files
- Follow settlement-service.ts as reference architecture
- Every service function needs try/catch
- Every service function needs TypeScript return type
- Never expose raw Supabase errors to UI

## Correctness rules (not premature optimization)
- Settled orders must never appear in active orders fetch
  Always filter in the database: .in('status', ACTIVE_ORDER_STATUSES)
  from open-orders-service.ts. Never fetch all rows and filter on the device
- Settlement must confirm DB write before clearing UI
  Never clear a bill optimistically
- Every bill insert must include tenant_id and branch_id

## Component rules
- Pressable for all touchable elements (not TouchableOpacity)
- FlatList for all lists (not ScrollView + map)
- ActivityIndicator for loading states
- Minimum touch target 44px height
- Always handle loading state
- Always handle error state
- Always handle empty state

## File ownership
- UI screens → src/app/(app)/*.tsx
- Service layer → src/lib/pos/*-service.ts
- Shared components → src/components/ui/
- Screen components → src/components/{feature}/
- State → src/lib/pos/use-orders-store.ts
- Tenant context → src/lib/pos/tenant-context.ts

## Git rules
- Commit after every completed task
- Never commit .env file
- Commit message format: "task N: description"

## Testing and Supabase usage budget
- Read docs/TESTING_USAGE_BUDGET.md before live database/browser verification.
- Run relevant local type/lint/unit checks first. Use mocked services or static sample previews for repeated UI iteration; do not connect them to production.
- Reuse one staging app session. Check the changed flows in one desktop/phone batch, fix material issues, then confirm only affected states. Repeat checks only for a new change, failure or unresolved concern.
- Keep existing Playwright one-worker/no-retry settings. Do not run the full live E2E suite for an unrelated visual change. Required correctness, tenant/branch and migration checks must still run.
- Supabase log investigations default to one project, a specific service and an explicit 5–30 minute incident window. Widen only when necessary; never poll logs or repeat an identical scan without new evidence. Use the Usage dashboard for quota checks, not log queries.
- Check and record a fresh All projects meter before a day's live testing when the previous reading is over 24 hours old; reuse that day's baseline. Dashboard readings can lag, so do not claim exact per-test byte savings or a guaranteed monthly total.
- At the documented warning threshold, move discretionary UI exploration to local/sample checks and minimize cloud verification. Preserve essential release/security/data correctness checks and report budget risk promptly.
- Close agent-created live test tabs after verification; preserve tabs the user is actively testing. Do not leave Orders/KOT test sessions polling unattended. Stop only task-owned servers no longer needed; do not stop the user's active staging server without a request.
- Preserve live refresh speed, stock workers and useful diagnostics. Never suppress failures, alter security logging, pause projects or skip necessary verification just to improve a usage meter.

## What to do if uncertain
- Read PROJECT_CONTEXT.md again
- Check existing service files for patterns
- Ask before assuming architecture
- Never guess — analyze first

## Expo specific rules
- Expo SDK 54 (expo ~54.0.x) — use versioned docs above
- Use Expo Router for all navigation
- Use npx expo install for all packages
- Use EXPO_PUBLIC_ prefix for all env variables
- Use lucide-react-native for all icons
- Use @/ alias for all imports
- NativeWind v4 with Tailwind v3.4.x (pinned to the 3.x line for compatibility)

## What to do if uncertain
- Read PROJECT_CONTEXT.md again
- Check existing service files for patterns
- Ask before assuming architecture
- Never guess — analyze first
