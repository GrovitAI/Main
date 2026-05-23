# AGENTS.md — Rules for AI Assistants

<!-- Expo versioned docs — read before writing any code -->
Read https://docs.expo.dev/versions/v56.0.0/ before writing any code.
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

## Service layer rules
- All Supabase logic in src/lib/pos/*-service.ts files
- Follow settlement-service.ts as reference architecture
- Every service function needs try/catch
- Every service function needs TypeScript return type
- Never expose raw Supabase errors to UI

## Correctness rules (not premature optimization)
- Settled orders must never appear in active orders fetch
  Always filter: .eq('status', 'open')
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

## What to do if uncertain
- Read PROJECT_CONTEXT.md again
- Check existing service files for patterns
- Ask before assuming architecture
- Never guess — analyze first

## Expo specific rules
- Expo SDK 56 — use versioned docs above
- Use Expo Router for all navigation
- Use npx expo install for all packages
- Use EXPO_PUBLIC_ prefix for all env variables
- Use lucide-react-native for all icons
- Use @/ alias for all imports
- NativeWind v4 with Tailwind v3.4.17 (pinned for compatibility)

## What to do if uncertain
- Read PROJECT_CONTEXT.md again
- Check existing service files for patterns
- Ask before assuming architecture
- Never guess — analyze first