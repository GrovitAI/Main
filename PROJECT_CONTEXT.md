# Grovit — Project Context

## What is Grovit
Grovit is a production-grade multi-tenant SaaS POS platform
for restaurants in India.

One platform. Multiple restaurant businesses.
Each restaurant is a tenant. Each tenant has multiple branches.

## Products
- dinein.grovit.com → POS (billing, KOT, kitchen display)
- fin.grovit.com → Finance (expenses, settlements, reports)
- admin.grovit.com → Internal Grovit dashboard
- kitchen.grovit.com → Kitchen display

## Distribution
- Web URL → desktop, tablet, mobile browser
- Android → APK direct install
- iOS → TestFlight beta distribution
All three from this single Expo codebase.

## Tech Stack
- Expo SDK 56 + React Native
- TypeScript (strict mode, no any)
- NativeWind v4 (Tailwind syntax)
- Expo Router v3 (file based routing)
- Supabase PostgreSQL (Mumbai region)
- Zustand (state management)
- EAS (builds + OTA updates)
- lucide-react-native (icons)

## Design System (Le Leban logo)
- Primary / center blue: #0066b2
- Deep edge blue: #004a8d
- Highlight swoosh: #3399ff
- Accent: #93c5fd
- Surface tint: #e8f2fa
- Background: #ffffff
- Text primary: #0f2744
- Text secondary: #5b6b7c
- Border: #c5d9eb
- Tablet first, mobile friendly
- Minimum touch target: 44px
- Rounded cards, clean minimal UI

## Multi-Tenant Architecture
Every Supabase query must include tenant_id AND branch_id.
Both are sourced ONLY from: src/lib/pos/tenant-context.ts

Current values (hardcoded until auth is built):
- tenant_id: aaaaaaaa-0000-0000-0000-000000000001 (Le Leban)
- branch_id: bbbbbbbb-0000-0000-0000-000000000001 (Main Branch)

This will be replaced by Supabase Auth session later.
Do not hardcode these values anywhere else.

## Database Schema (Supabase — do not modify)
Tables:
- tenants
- branches
- staff
- categories
- products
- open_orders
- open_order_items
- kots
- kot_items
- bills
- bill_items
- settlements
- expenses
- tax_configs
- tenant_features
- subscriptions
- settings
- printers

## Folder Structure
src/
  app/
    _layout.tsx              → Root layout
    (auth)/
      _layout.tsx
      login.tsx              → Login screen
    (app)/
      _layout.tsx            → Bottom tab navigation
      index.tsx              → Dashboard
      orders.tsx             → Open orders
      billing.tsx            → POS billing
      kitchen.tsx            → Kitchen KOT display
      finance.tsx            → Finance module
      settings.tsx           → Settings (hidden from tabs)
  lib/
    pos/
      supabase.ts            → Supabase client
      tenant-context.ts      → Hardcoded tenant + branch IDs
      order-types.ts         → Shared TypeScript types
      order-utils.ts         → Order calculation helpers
      settlement-service.ts  → Settlement Supabase logic
      settlement-utils.ts    → Settlement calculation helpers
      open-orders-service.ts → Open orders Supabase logic
      use-orders-store.ts    → Zustand order state
      brand.ts               → Design tokens
      constants.ts           → App constants
      navigation.ts          → Nav items + route helpers
  components/
    ui/                      → Shared primitive components
    layout/                  → Shell, header, sidebar
    orders/                  → Order specific components
    pos/                     → POS specific components
    dashboard/               → Dashboard specific components

## Service Layer Pattern
All Supabase logic lives in src/lib/pos/*-service.ts
Reference architecture: src/lib/pos/settlement-service.ts

Every service file must:
- Import supabase from src/lib/pos/supabase.ts
- Import TENANT_ID, BRANCH_ID from src/lib/pos/tenant-context.ts
- Include tenant_id and branch_id on every query
- Have proper TypeScript return types
- Have try/catch on every async function
- Never expose raw Supabase errors to UI

## Roles and Access

### Cashier
Default screen: Orders
Tabs: POS | Orders | Kitchen | Settings
Settings: limited to printer and operational config

### Manager
Default screen: Orders
Tabs: POS | Orders | Kitchen | Finance | Settings
Settings: full except user management and billing

### Owner
Default screen: Dashboard
Tabs: Dashboard | POS | Orders | Kitchen | Finance | Analytics | Settings
Settings: full access to everything

### Role source
Stored in staff.role column in Supabase.
During development hardcoded in src/lib/pos/session-context.ts
as CURRENT_ROLE = 'owner'.
Will be replaced by auth session after Task 7.

## Current Progress
✅ Task 1: Expo foundation, navigation, service layer
🟡 Task 2: Role-based navigation + screen structure (in progress)
⬜ Task 3: POS billing screen (core cashier workflow)
⬜ Task 4: Orders screen with live Supabase data
⬜ Task 5: KOT generation + Kitchen display
⬜ Task 6: Settlement flow
⬜ Task 7: Finance module
⬜ Task 8: Analytics screen
⬜ Task 9: Dashboard screen (owner)
⬜ Task 10: Auth (Supabase email + Google login)
⬜ Task 11: Settings screen (role-based content)
⬜ Task 12: Responsive polish
⬜ Task 13: PWA + EAS build + TestFlight + APK

## Business Workflow
Customer orders
→ Cashier creates open order
→ KOT sent to kitchen
→ Kitchen prepares
→ Customer may add more items
→ Additional KOT if needed
→ Customer confirms done
→ Cashier settles bill
→ Receipt printed
→ Order closed

## Key Architectural Decisions
1. item_name stored on bill_items separately
   → historical preservation, menu changes don't alter old bills

2. Incremental KOT
   → only new items since last KOT generate a new ticket
   → kot_sent boolean on open_order_items tracks this

3. Soft deletes only
   → settled orders set status = 'settled', never hard deleted
   → active order queries always filter .eq('status', 'open')

4. Optimistic UI for orders (NOT for settlement)
   → orders update instantly, roll back on failure
   → settlement waits for DB confirmation before clearing UI

5. Multi-tenant from day one
   → every table has tenant_id + branch_id
   → RLS will be added after auth is built

6. Hardcoded tenant context now → auth session later
   → changing tenant-context.ts is the only file that needs
      updating when auth is added

## What This Is NOT
- Not a single restaurant app
- Not a web-only app
- Not a native-only app
- Not a single-tenant system
- Not a monolith with separate codebases per platform

## Reference
Competitor product: uses Expo, React Native, web + Android + iOS
from one codebase. Distributed via TestFlight + APK + web URL.
Grovit follows the same model with better architecture.