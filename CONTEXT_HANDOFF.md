# CONTEXT_HANDOFF.md — Grovit AI POS System & Codebase Architecture

> **Target Audience**: AI Coding Assistants (Claude Code) & Engineering Team  
> **Repository**: `C:\Users\Might\Grovit`  
> **Stack**: Expo SDK 56 (aligned with Expo 54 runtime for Expo Go) / React Native 0.81 / React 19 / TypeScript Strict / NativeWind v4 (Tailwind v3.4.19) / Supabase PostgreSQL / Vercel Serverless  
> **Last Updated**: 2026-09-06  

---

## 1. What the Product Is

**Grovit AI POS** is a multi-tenant SaaS Point of Sale (POS), Kitchen Order Ticket (KOT), Financial Settlement, and Inventory Supply Chain platform engineered for restaurant chains, central kitchens, and retail food outlets in India. The application serves multi-unit restaurant brands (reference tenant: *Le Leban*) operating multiple physical store branches, central preparation kitchens, and distribution warehouses. It is delivered as a single unified codebase targeting three distribution channels: desktop/tablet/mobile Web (`dinein.grovit.com`), Android APK, and iOS via TestFlight / Expo Go. Multi-tenancy is enforced from the database upward: every operational query must explicitly filter by `tenant_id` and `branch_id`, imported exclusively from `@/lib/pos/tenant-context`.

---

## 2. Architecture Map

### Folder Structure (`src/`)

```text
src/
├── app/                              # Expo Router file-based routes
│   ├── _layout.tsx                   # App root: SafeAreaProvider, global ApprovalProvider, Stack
│   ├── (auth)/                       # Authentication route group
│   │   ├── _layout.tsx               # Auth stack navigator
│   │   └── login.tsx                 # Supabase email/password login & branch selector
│   └── (app)/                        # Authenticated app route group with floating Tab Navigator
│       ├── _layout.tsx               # Floating responsive bottom tab bar with animated indicator
│       ├── index.tsx                 # POS Terminal / Billing screen (desktop/tablet & phone switcher)
│       ├── orders.tsx                # Active orders & paginated sales/order history ledger
│       ├── analytics.tsx             # Analytics Command Center (KPIs, sales trends, item reports)
│       ├── inventory.tsx             # Raw materials, stock transfers, dispatches, recipes (BOM)
│       ├── menu.tsx                  # Sellable catalog, categories, product pricing & soft-deletes
│       ├── branches.tsx              # Store location CRUD & branch configuration (Owner/Admin)
│       ├── staff.tsx                 # Staff accounts, roles, access PINs, branch assignments
│       ├── settings.tsx              # Printers, operating hours, tax rules, approval policy matrix
│       ├── kitchen.tsx               # Kitchen Display System (KDS) live incoming KOT tickets
│       ├── dashboard.tsx             # Executive redirect route
│       ├── billing.tsx               # POS terminal route alias
│       └── expenses.tsx              # Petty cash & store expense tracking
├── components/
│   ├── approval/                     # Global manager approval governance modal & OTP inputs
│   │   ├── ApprovalCodeDialog.tsx    # 6-digit OTP authorization dialog with 5-minute countdown
│   │   ├── ApprovalDialogContainer.tsx # Single global dialog container mounted at root layout
│   │   └── ReasonDialog.tsx          # Audit reason dialog (security ShieldCheck styling)
│   ├── inventory/                    # Material forms, transfer sheets, dispatch cards
│   ├── layout/                       # Responsive headers, sidebar rails, layout wrappers
│   ├── orders/                       # OrderCard, OrderDetailModal, filter pill bars
│   ├── phone/                        # Dedicated mobile phone presentation screens:
│   │   ├── PhoneAnalyticsScreen.tsx  # Mobile 4-KPI grid, date filter pills, sales trend chart
│   │   ├── PhoneInventoryScreen.tsx  # Mobile read-only stock levels & low-stock alerts
│   │   ├── PhoneMenuScreen.tsx       # Mobile catalog browser with category scroll
│   │   ├── PhoneOrdersScreen.tsx     # Mobile active cards, detail sheets, history ledger
│   │   ├── PhonePOSScreen.tsx        # Mobile 2-column product grid + slide-over cart
│   │   └── PhoneScreenHeader.tsx     # Mobile header with insets padding & action slots
│   ├── pos/                          # POS desktop widgets: OrderPanel, ProductCard, SettlementModal
│   ├── settings/                     # ApprovalPoliciesScreen, PrinterSettingsScreen
│   └── ui/                           # Primitives: DatePickerModal, Button, Input, Modal, Badge
└── lib/
    ├── analytics/
    │   └── analytics-service.ts      # Client service executing 4 PostgreSQL aggregation RPCs
    ├── approval/                     # Approval Engine client, context, hashing, email utilities
    ├── printer/                      # ESC/POS direct TCP raw socket & PrintNode cloud drivers
    └── pos/                          # Core POS service layer, stores, tenant context, brand tokens
```

---

### Service Layer Inventory (`src/lib/pos/`)

All Supabase operations live in `src/lib/pos/*-service.ts` (or `src/lib/analytics/` & `src/lib/printer/`). Every function wraps queries in `try/catch`, returns `Promise<ServiceResult<T>>` (`{ data, error }`), and strictly includes `tenant_id` and `branch_id`.

| Service File | Purpose | Main Exported Functions |
| :--- | :--- | :--- |
| `open-orders-service.ts` | Cart management, KOT ticket generation, open orders lifecycle, immutable bill creation (`createOrUpdateBill`), and sales history ledger queries. | `getOpenOrders()`, `createOpenOrder()`, `updateOpenOrderItems()`, `saveKot()`, `createOrUpdateBill()`, `cancelOpenOrder()`, `fetchBillsLedger()`, `fetchBillsAggregateKpis()` |
| `settlement-service.ts` | Reference architecture service for payment settlement (Cash, UPI, Card, Complimentary) with strict DB confirmation before UI clearing. | `settleOrderById()`, `getSettlementsForBill()`, `verifySettlementPayload()` |
| `analytics-service.ts` | Server-side financial analytics aggregation via 4 PostgreSQL RPC functions, eliminating 1000-row limits and URL length bugs. | `fetchAnalyticsDashboard()`, `getEmptyDashboard()` |
| `inventory-service.ts` | Raw materials master, supplier directory, inter-branch transfer requisitions, dispatches, variance logs, Bill of Materials recipes, async deduction queues. | `fetchMaterials()`, `createMaterial()`, `createTransferRequest()`, `dispatchTransfer()`, `receiveDispatch()`, `fetchRecipes()`, `createRecipe()` |
| `menu-service.ts` | Menu category & sellable product catalog CRUD, soft-delete toggling, and price management. | `fetchCategories()`, `fetchProducts()`, `createProduct()`, `updateProduct()`, `softDeleteProduct()` |
| `menu-import-service.ts` | Excel / CSV parser for bulk importing menu products and category taxonomies. | `parseMenuFile()`, `importMenuBatch()` |
| `material-import-service.ts` | Excel / CSV parser for bulk importing raw material inventory and opening stock. | `parseMaterialFile()`, `importMaterialBatch()` |
| `branch-service.ts` | Branch location management, store hours configuration, tax settings, and branch profile queries. | `fetchBranches()`, `createBranch()`, `updateBranch()`, `deleteBranch()` |
| `staff-service.ts` | Staff user account provisioning, role assignment (`owner`, `manager`, `cashier`, `kitchen`), and PIN management. | `fetchStaffMembers()`, `createStaffMember()`, `updateStaffMember()`, `deactivateStaffMember()` |
| `printer-db-service.ts` | Supabase database queries for branch printer routing profiles and hardware configs. | `fetchBranchPrinters()`, `savePrinterConfig()`, `deletePrinterConfig()` |
| `printer-service.ts` / `printService.ts` | Thermal printer hardware driver supporting dual-mode printing: direct ESC/POS network sockets, PrintNode cloud API, and browser fallback. | `printKotTicket()`, `printCustomerBill()`, `testPrinterConnection()` |
| `products-service.ts` | Fast catalog query service feeding the cashier product grid. | `fetchActiveCatalog()`, `fetchProductsByCategory()` |
| `approval-service.ts` / `approval.service.ts` | Client interface communicating with `/api/approval/*` serverless functions for 6-digit OTP verification. | `requestApproval()`, `verifyApprovalCode()`, `completeApproval()`, `resendApprovalCode()` |
| `reporting-utils.ts` | Business day operating window math (11:30 AM – 02:30 AM IST cutoff) and ISO timestamp bounds calculation. | `getBusinessDayBounds()`, `getBusinessDate()`, `getEffectiveReportingTimestamp()` |
| `tenant-context.ts` | Authoritative source of truth for multi-tenant context (`TENANT_ID`, `BRANCH_ID`, `getTenantContext()`). | `getTenantContext()`, `TENANT_ID`, `BRANCH_ID` |
| `brand.ts` | Central design tokens: primary blue (`#0066b2`), deep navy (`#004a8d`), text, borders, radii. | `colors`, `typography`, `shadows` |
| `useResponsive.ts` | JavaScript window dimension hook detecting phone vs tablet vs desktop layouts. | `useResponsive()` (`isPhone`, `isTablet`, `isDesktop`, `screenWidth`) |
| `tab-config.ts` | Role-based tab definitions, route matching, icon mappings, and initial screen resolution for phones/tablets. | `getTabsForRole()`, `getInitialRouteNameForRole()`, `getTabConfigForRoute()` |

---

### Screen Routes (`src/app/(app)/`)

- `index.tsx`: Main POS terminal. Desktop renders `Sidebar` + `ProductGrid` + `OrderPanel` + `SettlementModal`. Phones render `PhonePOSScreen`.
- `orders.tsx`: Orders management. Active Orders tab (unpaid/draft/held cards) and Sales & Order History tab (server-side paginated bill ledger, aggregate KPI header, detail modal). Phones render `PhoneOrdersScreen`.
- `analytics.tsx`: Financial dashboard. 4-KPI summary, revenue trend chart, hourly rush chart, payment distribution, item performance table, CSV export. Phones render `PhoneAnalyticsScreen`.
- `inventory.tsx`: Multi-tab inventory cockpit: Master Setup, Material Stocks, Transfers, Dispatches, Recipes (BOM), Alerts. Phones render `PhoneInventoryScreen`.
- `menu.tsx`: Menu catalog setup: categories, products, prices, modifier groups, soft-deletes. Phones render `PhoneMenuScreen`.
- `branches.tsx`: Branch management for owners: physical location profiles, GSTIN/FSSAI metadata, printer bindings.
- `staff.tsx`: Staff directory: user roles, PIN security hashes, branch access assignments.
- `settings.tsx`: System settings: operating hours, GST rates, printer configurations, and branch approval policy management matrix.
- `kitchen.tsx`: Kitchen Order Ticket (KOT) live dispatch display for prep stations.
- `billing.tsx` / `dashboard.tsx` / `expenses.tsx`: Navigation route aliases and petty expense management.

---

### State Management (Zustand Stores)

1. **`use-orders-store.ts` (`useOrdersStore`)**:
   - Holds active cart state: `cartItems`, `orderName`, `orderStatus`, `orderIndex`, `activeOrderId`, `heldOrders`.
   - Financial totals: `subtotal`, `taxAmount`, `discountAmount`, `discountType`, `discountValue`, `totalAmount`.
   - Concurrency mutex: `isMutating` (locks UI across all network requests).
   - Edit state: `isEditingUnpaid`, `hasUnsavedChanges`, `isReadOnlyView`.
2. **`use-session-store.ts` (`useSessionStore`)**:
   - Holds staff profile: `session`, `staffId`, `role` (`owner`, `manager`, `cashier`, `kitchen`), `name`.
   - Multi-branch context: `accessibleBranches`, `activeBranchId`, `activeBranchName`.
   - Lifecycle: `isRestoring` (true during initial token restore).
3. **`ApprovalContext.tsx` (`useApprovalFlow`)**:
   - React Context holding global approval modal state (`isOpen`, `action`, `resourceId`, `reason`, `attemptsRemaining`, `error`).
   - Standardized entry point: `requestApproval({ action, resourceType, resourceId, onApproved })`.

---

### Navigation Structure & Constraints

- **Root Layout (`src/app/_layout.tsx`)**: Permanently mounts `<Stack>` containing `(auth)` and `(app)`. Wraps tree in `<SafeAreaProvider>` and `<ApprovalProvider>`. When `isRestoring` is true, displays a full-screen loading overlay (`#004a8d`) rather than unmounting the stack.
- **App Layout (`src/app/(app)/_layout.tsx`)**: Permanently mounts `<Tabs>`. Renders custom responsive bottom dock with sliding pill animation.
- **Initial Route Resolution**: Role-based and device-based initial route selection is declarative via `getInitialRouteNameForRole(role, isPhone)` in `tab-config.ts` (e.g. Phone Cashier/Owner $\rightarrow$ `analytics` or `index`). **Never use mount-time `useEffect(router.replace)`**, as this causes root navigation context errors.
- **Screen Lifecycle**: Screens use `useFocusEffect()` from `expo-router` for refresh on tab activation. Direct usage of raw `useNavigation()` or `navigation.addListener` is strictly avoided.

---

## 3. Database and Backend

### Database Tables (Supabase PostgreSQL `ap-south-1`)

- **Master Data**: `tenants`, `branches`, `staff`, `categories`, `products`, `pos_settings`, `printers`.
- **Transactions**: `open_orders`, `open_order_items`, `kots`, `kot_items`, `bills`, `bill_items`, `settlements`.
- **Supply Chain**: `inventory_materials`, `inventory_categories`, `inventory_units`, `inventory_recipes`, `inventory_transfer_requests`, `inventory_transfer_request_items`, `inventory_dispatches`, `inventory_dispatch_items`, `inventory_transfer_variances`, `inventory_transfer_events`.
- **Queues & Governance**: `inventory_consumption_batches`, `inventory_consumption_jobs`, `branch_approval_settings`, `branch_approval_settings_history`, `approval_requests`.

### Key PostgreSQL RPC Functions

The analytics layer runs exclusively on server-side RPC functions deployed in Supabase:

1. **`get_analytics_summary(p_tenant_id, p_branch_id, p_start_ts, p_end_ts, p_timezone)`**: Aggregates 12 core financial metrics: `totalSales`, `totalOrders`, `avgOrderValue`, `itemsSold`, `taxCollected`, `cancelledOrders`, `collectedRevenue`, `pendingCollections`, `totalDiscounts`, `cancelledSales`, `complimentaryValue`, `complimentaryCount`.
2. **`get_analytics_sales_trend(p_tenant_id, p_branch_id, p_start_ts, p_end_ts, p_timezone)`**: Groups sales and order volume by business date and by 24 operating hours (accounting for 11:30 AM – 02:30 AM cutoff).
3. **`get_analytics_payment_split(p_tenant_id, p_branch_id, p_start_ts, p_end_ts)`**: Aggregates revenue breakdown by payment mode (`cash`, `upi`, `card`, `complimentary`).
4. **`get_analytics_item_performance(p_tenant_id, p_branch_id, p_start_ts, p_end_ts)`**: Computes sold quantity and total revenue per item across all settled bills within the date range.

### Schema Constraints & Migration Scripts

- **`scratch/clean-duplicate-bills.sql`**: Added `UNIQUE(open_order_id)` constraint on `bills`.
- **`scratch/03_production_fk_hardening.sql` & `scratch/harden-foreign-keys.sql`**: Hardened foreign-key delete cascades across `open_order_items`, `bill_items`, and `kot_items`.
- **`scratch/migration_analytics_rpcs.sql`**: Contains complete DDL for the 4 PostgreSQL analytics aggregation RPC functions with `SECURITY INVOKER`.

### Serverless API Layer (`api/` deployed via Vercel)

All serverless functions in `/api/*` run in pure Node.js and import `@/lib/approval/approval-supabase` (pure Node `@supabase/supabase-js` client) to isolate them from React Native packages:

- `POST /api/approval/request`: Generates 6-digit OTP, computes SHA-256 HMAC hash (`approval_code_hash`), inserts `approval_requests`, and sends notification email via Google Workspace SMTP with anti-enumeration timing.
- `POST /api/approval/verify`: Validates submitted OTP against hash. Enforces 5-minute expiry and max 5 failed attempts.
- `POST /api/approval/complete`: Transitions verified OTP status to `COMPLETED` (single-use enforcement).
- `POST /api/approval/resend`: Issues fresh OTP for an active request.
- `GET/POST /api/approval/settings`: Reads and updates branch approval policy matrix.
- `api/printers.ts` & `api/printjobs.ts`: Cloud print job spooling.
- `vercel.json`: Handles SPA rewrites (`/((?!api/).*)` $\rightarrow$ `/index.html`) and cache headers for static assets.

---

## 4. Business Rules That Must Not Be Broken

1. **Multi-Tenant Isolation**: Every Supabase query must include `.eq('tenant_id', TENANT_ID).eq('branch_id', BRANCH_ID)`.
2. **Order Lifecycle**:
   - An order starts in `draft`.
   - Tapping "Save KOT" creates incremental KOT tickets (`kot_sent = false` only) and transitions order to `in_kitchen`.
   - Tapping "Save & Print" generates an immutable invoice (`INV-XXXX`) with status `unpaid`.
   - Tapping "Settle" records payment and sets status to `paid`.
   - Cancelling an active order requires `CANCEL_BILL` manager approval and transitions status to `cancelled`.
3. **One Open Order Produces Exactly One Bill**:
   - Enforced by DB constraint `UNIQUE(open_order_id)`.
   - Handled in `open-orders-service.ts` via **Insert-or-Return-Existing** pattern: on PostgreSQL error `23505`, catches the error and retrieves the existing bill without overwriting.
4. **Settlement Confirmation First (Never Optimistic)**:
   - Cart UI state is cleared **only after database settlement confirmation**. The UI must never optimistically assume settlement success.
5. **Immutable Receipts & Static Item Snapshots**:
   - Once settled, `bills` and `settlements` are never updated.
   - `bill_items` snapshots item names, unit prices, GST rates, HSN codes, and modifiers at the moment of bill creation. Subsequent changes in `products` do not alter historical receipts.
6. **Paired Integer-Paise Math**:
   - Receipts store rupee values alongside exact integer paise (`subtotal_paise`, `tax_paise`, `discount_paise`, `grand_total_paise`) to eliminate JavaScript floating-point drift.
7. **Business Day Operating Window (11:30 AM – 02:30 AM IST)**:
   - Configured in `reporting-utils.ts` (`DEFAULT_BUSINESS_DAY_CONFIG`).
   - Transactions occurring between 12:00 AM and 02:30 AM IST belong to the **previous calendar day's business shift**.
8. **Complimentary Settlement**:
   - Settle total to ₹0.00, set discount to 100% (`discount_type = 'percent', discount_value = 100`), record payment mode as `complimentary`, and require **`COMPLIMENTARY_BILL` Manager Approval**.
9. **Manager Approval Governance**:
   - 4 protected POS actions: `REPRINT_BILL`, `CANCEL_BILL`, `APPLY_DISCOUNT`, `COMPLIMENTARY_BILL`.
   - If policy is enabled for the branch, prompts Reason Dialog followed by 6-digit OTP code.
   - If policy is disabled, prompts Reason Dialog for audit logging and bypasses OTP.
   - Verified OTP codes transition to `COMPLETED` immediately to prevent code reuse.

---

## 5. Chronological Work History

The repository contains ~353 commits following the strict standard `"task N: description"`.

### Phase Breakdown

- **Tasks 1–4: Foundation & Baseline POS**
  - Configured Expo SDK, Expo Router, Supabase client, tenant context, Le Leban brand tokens (`#0066b2`, `#004a8d`).
  - Built left boutique category rail, product grid, and baseline cashier cart.
- **Tasks 5–11 & 18–28: Order Lifecycle, KOT & Printing**
  - Built incremental KOT ticket generator (`kots` / `kot_items`), draft cart persistence, and held orders popover.
  - Built dual ESC/POS raw socket and PrintNode printer drivers. Added keyboard shortcuts (F2, F8, /, Esc, Ctrl+Enter).
- **Tasks 31–37: Duplicate Bill Prevention & Write Hardening**
  - Eliminated all un-awaited fire-and-forget background writes.
  - Applied `UNIQUE(open_order_id)` constraint on `bills`. Implemented Insert-or-Return-Existing pattern (`23505` error handling).
  - Hardened frontend mutation locking (`isMutating = true`).
- **Tasks 32–36 & 55–64: Manager Approval Governance Engine**
  - Built Vercel serverless `/api/approval/*` endpoints with SHA-256 HMAC OTP hashing and Google Workspace SMTP delivery.
  - Implemented single global `<ApprovalProvider>` at `src/app/_layout.tsx`.
  - Built `ApprovalPoliciesScreen` for branch-level policy management and ReasonDialog audit logging.
- **Tasks 41–56: Orders History & Business Day Reporting**
  - Built server-side paginated sales ledger with aggregate KPI calculations.
  - Implemented business day window calculation (11:30 AM – 02:30 AM IST cutoff) in `reporting-utils.ts`.
- **Tasks 66–67: Analytics Migration to PostgreSQL RPCs**
  - Migrated Analytics dashboard from raw client-side REST queries to 4 parallel PostgreSQL RPC functions (`get_analytics_summary`, `get_analytics_sales_trend`, `get_analytics_payment_split`, `get_analytics_item_performance`).
- **Tasks 69–75: Expo SDK & Dependency Alignment**
  - Aligned dependencies with Expo SDK 56 / SDK 54 patch versions for Expo Go mobile testing.
  - Configured `react-native-worklets` and `react-native-reanimated` Babel plugins.
- **Tasks 76–85: Mobile Responsiveness & Phone UI**
  - Built dedicated mobile components in `src/components/phone/` (`PhonePOSScreen`, `PhoneOrdersScreen`, `PhoneAnalyticsScreen`, `PhoneInventoryScreen`, `PhoneMenuScreen`, `PhoneScreenHeader`).
  - Replaced NativeWind responsive CSS breakpoints with JavaScript window checks (`useResponsive.ts`).
- **Tasks 14–17: iOS Navigation & Analytics Filter Stabilization**
  - Stabilized navigation hierarchy, fixed `react-native-css-interop` upgrade warnings, and polished mobile analytics filters.

### Most Recent 10 Commits

1. `27ed8cc` (`task 17`): Polished mobile analytics filter UI (active pill with check indicator, elevation shadow, active date context banner), renamed KPI "Items Dispatched" $\rightarrow$ "Items Sold", removed download document button from mobile header.
2. `90f969e` (`task 16`): Eliminated dynamic `react-native-css-interop` upgrade crash in `PhoneAnalyticsScreen.tsx` by replacing dynamic class switching in `PRESET_OPTIONS.map` with static classes and inline `style` objects.
3. `590eab7` (`task 15`): Stabilized navigation hierarchy: kept root `<Stack>` and `<Tabs>` permanently mounted with overlay loading spinners during `isRestoring`; eliminated mount-time `router.replace('/analytics')` redirects in `index.tsx` and `orders.tsx`.
4. `8f70dce` (`task 14`): Fixed iOS analytics filter crash with deterministic IST bounds, NaN geometry guards in sales trend chart, and touch event handling.
5. `826d62a` (`task 85`): Fixed `NavigationContainer` context error: replaced direct `useNavigation()` calls with `useFocusEffect()` from `expo-router`.
6. `4758f2c` (`task 84`): Fixed mobile menu edit modal layout, approval policies UI, and analytics filter state stability.
7. `2d72457` (`task 83`): Completed full application test suite and fixed hidden modal pointer event blocking.
8. `9778a7b` (`task 82`): Centered bottom tab labels and resolved analytics filter timezone and branch permission handling.
9. `02e6bd2` (`task 81`): Reworked mobile menu catalog, fixed bottom tab bar layout, and streamlined analytics and settings.
10. `f52a3c3` (`task 80`): Built mobile management layout, premium analytics command center, and removed splash video.

---

## 6. Known Issues, Fragile Areas, and Recent Bug Patterns

### 1. `react-native-css-interop` Dynamic Class Upgrades & Navigation Context Crash
- **Symptom**: Tapping a filter chip or button throws: `"Couldn't find a navigation context. Have you wrapped your app with 'NavigationContainer'?"` with stack trace showing `React.createContext$argument_0.get__getKey` $\rightarrow$ `entries` $\rightarrow$ `replace` $\rightarrow$ `render-component.js`.
- **Root Cause**: In NativeWind v4, dynamically swapping structural Tailwind classes (e.g. ``className={`... ${isActive ? 'bg-[#002D5A] shadow-sm' : 'bg-[#F1F5F9] border'}`}``) on a `Pressable` causes `react-native-css-interop`'s dev-mode warning handler to call `stringify(originalProps)`. `stringify` recursively runs `Object.entries()` across props and React Fiber closures, evaluating `@react-navigation`'s default `NavigationStateContext.getKey` getter which throws the missing context error.
- **Rule**: For dynamic colors, borders, or state toggling on interactive components, use **static `className` for base layout** and pass dynamic values via **React Native `style`** (e.g. `style={{ backgroundColor: isActive ? '#0066B2' : '#FFFFFF' }}`). Never pass `className` to SVG icon components (`<Check className="mr-1.5" />`).

### 2. Navigation Hierarchy Unmounting & Mount-Time Redirects
- **Symptom**: App crashes on initial load or during auth restore with navigation context errors.
- **Root Cause**: Conditionally unmounting `<Stack>` or `<Tabs>` while `isRestoring` is true destroys the React Navigation container. Calling `router.replace()` inside mount `useEffect` in child screens causes race conditions with Expo Router.
- **Rule**: Keep `<Stack>` in `src/app/_layout.tsx` and `<Tabs>` in `src/app/(app)/_layout.tsx` permanently mounted. Use a full-screen loading overlay during `isRestoring`. Set initial routes declaratively in `src/lib/pos/tab-config.ts` (`getInitialRouteNameForRole`).

### 3. NaN Chart Geometry in React Native SVG
- **Symptom**: Analytics screen crashes on iOS when rendering zero-sales days or empty date ranges.
- **Root Cause**: Dividing by zero (`val / maxSaleValue * 100`) produces `NaN` or `Infinity`, which crashes the iOS native layout engine when passed as a height percentage.
- **Rule**: Always guard SVG / bar heights:
  ```ts
  const calcHeight = maxSaleValue > 0 ? (val / maxSaleValue) * 100 : 0;
  const heightPercent = isNaN(calcHeight) || !isFinite(calcHeight) ? 12 : Math.min(100, Math.max(12, calcHeight));
  ```

### 4. NativeWind Media Queries vs JS Width Checks
- **Symptom**: Inconsistent layout collapsing or invisible elements when using `hidden md:flex` across Web and Native.
- **Rule**: Use `const { isPhone, isTablet, isDesktop } = useResponsive();` from `@/lib/pos/useResponsive` for responsive conditional rendering.

### 5. Hidden Modal Pointer Event Interception
- **Symptom**: Web screen becomes unclickable even when modals are invisible.
- **Rule**: Always conditionally render modals (`{isOpen && <Modal ... />}`) or ensure `pointerEvents="none"` when hidden.

---

## 7. Conventions and Rules for Making Changes

1. **Strict TypeScript**: No `any`, no non-null assertions (`!`). Use explicit interfaces and service return types.
2. **Multi-Tenant Rules**:
   - Every Supabase query must include:
     ```ts
     .eq('tenant_id', TENANT_ID)
     .eq('branch_id', BRANCH_ID)
     ```
   - Import exclusively from: `import { TENANT_ID, BRANCH_ID } from '@/lib/pos/tenant-context'`.
3. **Service Layer Pattern**:
   - All Supabase logic resides in `src/lib/pos/*-service.ts` or `src/lib/analytics/`.
   - Every function must use `try/catch` and return `Promise<ServiceResult<T>>` (`{ data, error }`).
   - Never expose raw database errors to the UI.
4. **UI & Component Rules**:
   - Use `Pressable` for touchable elements (never `TouchableOpacity`). Minimum touch target is 44px.
   - Use `FlatList` for all lists (never `ScrollView + map`).
   - Always handle all three states: **Loading**, **Error**, **Empty**.
   - No HTML elements (`div`, `span`, `button`). Use `View`, `Text`, `Pressable`, `TextInput`.
   - No `next/*` imports, no `"use client"` directives.
5. **Git Rules**:
   - Commit after every completed task.
   - Never commit `.env` files.
   - Commit message format: `"task N: description"`.

---

## 8. Environment and Running

### Environment Variables

The app expects these environment variables in `.env` (prefixed with `EXPO_PUBLIC_` for Expo):

- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL (`https://<project-ref>.supabase.co`).
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public API key.
- `EXPO_PUBLIC_PRINTNODE_API_KEY`: PrintNode cloud printing API key.
- `SMTP_HOST`: Google Workspace SMTP host (`smtp.gmail.com`).
- `SMTP_PORT`: SMTP port (`465` or `587`).
- `SMTP_USER`: SMTP authenticated email user.
- `SMTP_PASS`: SMTP app-specific password.
- `SMTP_FROM`: Formatted sender email address.

*(Never log, display, or commit plaintext credentials).*

### How to Run

```bash
# Start for Web Development
npm run web
# or
npx expo start --web

# Start for Mobile (Expo Go on Physical iOS/Android)
npx expo start --tunnel

# Run TypeScript Typecheck (Must pass with 0 errors)
npx tsc --noEmit

# Verify iOS Hermes Native Bundle Export
npx expo export --platform ios
```

### Pinned Dependencies & SDK Notes

- `tailwindcss`: `^3.4.19` (pinned for compatibility with NativeWind v4).
- `nativewind`: `^4.2.4`.
- `react-native-reanimated`: `~4.1.1` (requires `react-native-reanimated/plugin` in `babel.config.js`).
- `react-native-worklets`: `0.5.1` (required by NativeWind v4 Babel preset).
- `expo`: `~54.0.36` (configured for stable compatibility with current Expo Go iOS app client).

---

## 9. Open Threads and Pending Decisions

1. **Local `.env` File**: The local `.env` file is modified with active development keys. It should never be staged or committed to git.
2. **`scratch/` Folder Utilities**: The `scratch/` directory contains 122 ad-hoc test scripts, Playwright test runners (`test_full_suite.js`, `test_analytics_filters.js`), screenshot utilities, and migration SQL files (`migration_analytics_rpcs.sql`, `03_production_fk_hardening.sql`). These are reference and verification tools, not part of the production application bundle.
3. **Future Auth Migration**: `src/lib/pos/tenant-context.ts` currently provides fallback tenant and branch IDs (`aaaaaaaa-0000-0000-0000-000000000001` / `bbbbbbbb-0000-0000-0000-000000000001`). When multi-tenant authentication is fully transitioned to live session tokens, `getTenantContext()` in `tenant-context.ts` will dynamically derive credentials from `useSessionStore.getState().session`.
4. **Asynchronous Inventory Queue Worker**: Settling bills writes recipe deduction batches to `inventory_consumption_batches`. The background worker cron/trigger that processes `inventory_consumption_jobs` is managed in Supabase PostgreSQL edge workers.
