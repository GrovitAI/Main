# Grovit — Project Context

## What is Grovit
Grovit is a production-grade multi-tenant SaaS POS platform
for restaurants in India.

One platform. Multiple restaurant businesses.
Each restaurant is a tenant. Each tenant has multiple branches.

## Products
Planned product names. None of these grovit.com hosts is live: that domain
currently resolves to a parking service, not to Vercel.
- dinein.grovit.com → POS (billing, KOT, kitchen display)
- fin.grovit.com → Finance (expenses, settlements, reports)
- admin.grovit.com → Internal Grovit dashboard
- kitchen.grovit.com → Kitchen display

## Distribution
- Web URL → https://www.leleban.grovitai.com (live production on Vercel; the
  serverless API is the same origin under /api) → desktop, tablet, mobile browser
- Android → APK direct install
- iOS → TestFlight beta distribution
All three from this single Expo codebase.

## Tech Stack
- Expo SDK 54 + React Native 0.81
- TypeScript (strict mode, no any)
- NativeWind v4 (Tailwind syntax)
- Expo Router v6 (file based routing)
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
Both come ONLY from getTenantContext() in src/lib/pos/tenant-context.ts,
which reads the signed-in staff member's session (Supabase Auth -> staff row).

Database enforcement (since task 20, 2026-09-07):
- Row Level Security is enabled on every table; policies key on the
  caller's staff row (auth_tenant_id / auth_branch_id / auth_role helpers).
- owner/admin see all branches of their tenant; manager/cashier/kitchen
  see only their own branch. The anon key has no table access.
- Client-side filters remain as defence-in-depth, never as the only guard.

Never hardcode tenant or branch UUIDs anywhere.

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
    central-kitchen/         → The Central Kitchen's own app (role `kitchen`; owner/admin via Settings)
      _layout.tsx            → Role gate + stack; forms below are stack screens
      (tabs)/                → home, analytics, items (raw materials), finished-goods, attendance, branches, invoices, vendors, history
      send.tsx, received.tsx, bought.tsx, spent.tsx, item-form.tsx, party-form.tsx, item/[id].tsx, party/[id].tsx
  lib/
    pos/
      supabase.ts            → Supabase client
      tenant-context.ts      → getTenantContext() from the auth session
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
- Call getTenantContext() from src/lib/pos/tenant-context.ts (never the deprecated constants)
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

### Kitchen (role `kitchen`)
At a restaurant branch: the KOT display. Tabs: Kitchen | Settings.
At the Central Kitchen (or a warehouse) branch: the Central Kitchen's own
screens. Default screen /central-kitchen/home; no tab of the main app.
Desktop/tablet rail: Home | Analytics | Items | Branches | Vendors | History.
Phone bar: Home | Analytics | Items | History | More (Branches and Vendors).
Sees only the kitchen's own books (tables kitchen_*; see
supabase/migrations/20261004000100_central_kitchen.sql and
20261004000200_kitchen_categories_and_edit.sql). Owner and admin may open the
same screens from Settings → "Open Central Kitchen". The split is decided by
isCentralKitchenSession() in src/lib/pos/tab-config.ts.

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
✅ Task 7: Finance module built; standalone Finance and Day Close deferred in the approved 2026-10-07 release. Code and records are retained; Central Kitchen bookkeeping remains available. See docs/FINANCE_MODULE.md.
✅ Tasks 131–134: Central Kitchen module (built on feat/central-kitchen; production release approved 2026-10-07 via GitHub PR #2. All ten database migrations applied and verified. See docs/CENTRAL_KITCHEN_RELEASE_2026-10-07.md for the release and rollback record. PRODUCT.md holds the product record, DESIGN.md the look.)
✅ Task 155: Central Kitchen monthly Analytics previews completed. The user selected Report workspace on 2026-10-08; the HTML alternatives remain in docs/previews/kitchen-analytics.html.
✅ Task 156: Production Central Kitchen data reset completed on 2026-10-08 after the user reviewed and approved the exact scope. Kitchen history, items and party lists are empty; expense categories, staff accounts, actual branches, other modules and staging are preserved. A verified local backup is Git-ignored. See docs/CENTRAL_KITCHEN_RESET_2026-10-08.md.
✅ Task 157: Report workspace and vendor purchase categories built in staging on `codex/kitchen-analytics`. Home → Analytics opens monthly Sales/Purchases/Cash with branch/item/category/vendor filters, entry drilldown and on-demand CSV. Vendor defaults and purchase overrides retain historical snapshots through rename/archive/edit. Four migrations are staging-only in supabase/staging-pending.txt; production is unchanged. See docs/KITCHEN_ANALYTICS_STAGING.md for verification and remaining browser-download/native checks. Staging runs with npm run staging on localhost:8081 (API 8083).
✅ Task 158: Kitchen Analytics responsive viewing refined in staging: centered desktop workspace, columns in smaller browser panels, expandable phone filters, paired quantity/value rows, exact large summary figures and 48px controls. Browser checks cover desktop, phone, small phone and landscape picker; typecheck, targeted lint and 18 route-load checks passed. Independent review scored its touch-target correction resolved/ship. Native hardware and soft-keyboard checks remain pending; no database or production changes. See docs/KITCHEN_ANALYTICS_STAGING.md.
✅ Task 159: Kitchen Analytics header compacted in staging: one desktop toolbar, slim monthly totals, expandable report explanations and bounded report controls. Analytics is directly accessible in the kitchen rail and phone bar; phone More retains Branches and Vendors. The public Analytics URL is unchanged. Browser checks include the user's 1370x731 view and phones down to 320px; typecheck, targeted lint and 18 route-load checks passed. Independent finish review returned ship with no material fixes. Native device checks remain pending; no database or production changes. See docs/KITCHEN_ANALYTICS_STAGING.md.
✅ Task 160: Kitchen Analytics report rows refined in staging: solid blue hover/press fill without opacity fade, and four balanced desktop Sales columns for Branch, Item, Quantity and Value. Phone rows and report behavior are preserved. Browser checks cover actual desktop width, wide/small desktop and phones down to 320px; typecheck and targeted lint passed. Independent finish review returned ship with no material fixes. Native hardware remains unverified; no database or production changes. See docs/KITCHEN_ANALYTICS_STAGING.md.
✅ Task 161: Kitchen Analytics height reduced using Home spacing: removed repeated page title/subtitle, combined desktop report controls, compact labelled filters and 52px minimum rows with wrapping. Phone controls retain 48px targets and safe-area padding. Browser checks cover actual desktop, small desktop, phones down to 320px and long-month/empty-state recovery; typecheck, targeted lint and 18 route-load checks passed. Reviewer scored the narrow month toolbar correction resolved/ship. Native hardware remains unverified; staging only. See docs/KITCHEN_ANALYTICS_STAGING.md.
✅ Task 162: Kitchen Analytics now has compact KPI cards and a phone month/range picker beside Filters. The popup calendar selects inclusive start/end dates through today in India time, with draft Apply/Cancel and a This month reset. A new scoped security-invoker range RPC was applied and verified only in staging, keeping the monthly RPC compatible with older clients. KPIs, breakdowns, entries and CSV use the same range; no polling was added. Typecheck, targeted lint, nine report tests and 18 native route-load checks passed; authenticated rollback-only SQL fixtures cover boundaries, leap day, paging/export and tenant/branch denial. Real cross-month CSV download verified. Independent review returned ship for the staging browser extension, and documentation preserved the incumbent system. Five analytics migrations remain staging-only; production is unchanged. Native hardware remains unverified. See docs/KITCHEN_ANALYTICS_STAGING.md for final browser review evidence.
✅ Task 163: Provisional Kitchen Analytics layout previews put the date/filter pane before KPI cards on desktop and phone. Period first (recommended), Report first and Summary beside report are selectable in docs/previews/kitchen-analytics-layouts.html, with real Desktop/Phone iframe sizes, local sample filters, entry detail, calendar and CSV. Playwright checked all six layout/device combinations, small widths, draft Apply/Cancel, empty state and cross-year labels. Independent review matched the layout requirements; its single calendar-year correction was scored resolved/ship. These are sample-only previews; no option is approved or implemented in the application, and no database or production change was made. Documentation preserves the incumbent visual system. See docs/previews/KITCHEN_ANALYTICS_LAYOUTS.md.
✅ Task 164: User selected Report first on 2026-10-09; implemented in staging with Sales/Purchases/Cash first, date/filter pane second, compact KPI cards third and report rows below. Filters disclose on desktop and phone, retaining all existing choices and category management. Browser review covers 1440x900 and 1024x768 desktop, 390x844 and 320x700 phones and the actual 390x668 panel, with inclusive range Apply/Cancel, tab persistence, entry drilldown and real CSV reconciliation. Typecheck, targeted lint and 27 report/route-load tests passed; layout detector returned no findings. Independent finish review returned ship with no material fixes. No service/query/schema or production changes. Native hardware remains unverified. See docs/KITCHEN_ANALYTICS_STAGING.md for the finish review and release boundary.
✅ Task 165: Read-only log usage review on 2026-10-09 confirms 0.597/1 GB ingestion and 37.831/100 GB query for the 21 Sep–21 Oct cycle. Production/staging split is 0.442/0.155 GB ingestion; both databases already have restrained logging. Short logs show staging pooler chatter without the earlier branch_activity polling spike; cron jobs have no 24-hour failures. Recommended targeted log searches, closing unused sessions and a clean daily comparison; no runtime, production, worker or diagnostic settings changed. See docs/LOG_USAGE_REVIEW_2026-10-09.md.
✅ Task 166: User requested testing stay within the Supabase allowance. Added persistent testing rules in AGENTS.md and docs/TESTING_USAGE_BUDGET.md: local/mocked checks first, one focused live staging batch/session, scoped short log investigations without polling, fresh daily usage baseline, 80% warning targets and cleanup of agent test tabs. Existing one-worker/no-retry browser setup is preserved. Essential correctness/security/migration checks still run; live behavior and diagnostics are unchanged. No cloud tests or log scans were needed for this policy-only task.
✅ Task 167: Prepared three interactive sample-only Kitchen Analytics mobile design alternatives: Compact ledger (recommended, all KPIs visible), Expandable summary and reversible Reading mode. Playwright measures 2 current-structure versus 5/5/6 complete typical sales rows at 390x668; checked 320x700 and 390x844, exact large figures, Purchases/Cash, filters, dates, drilldown, sample CSV, empty/error states and picker controls. External requests blocked; no Supabase requests or log scans. Preview only: no option selected, application source, desktop design and production unchanged. Independent finish correction and documentation are recorded in docs/previews/KITCHEN_ANALYTICS_MOBILE.md. Native hardware/text scaling remain unverified.
✅ Task 168: User selected Compact ledger from task167; implemented mobile Kitchen Analytics in staging source with shallower period KPI cards, a combined report heading/total/count, paired item/branch and value/unit rows and one labelled Info/Refresh/CSV-or-Share actions menu. All existing filters, calendar, details, paging and report queries remain intact; desktop composition is preserved. Playwright against the actual web component with synthetic local authentication and mocked Supabase responses shows 5/4/7 complete typical sales rows at 390x668/320x700/390x844, validates filters/date draft/Apply/menu/drilldown/CSV/empty/error and desktop widths, and forwards zero cloud requests. Typecheck, targeted lint and 27 report/native route-load checks passed. Independent finish review returned ship with no material fixes for the browser composition and source. No production, schema, service or polling change. Native visual/hardware checks remain unverified. See docs/KITCHEN_ANALYTICS_STAGING.md for finish review and selection documentation.
✅ Task 169: Created a frontend font comparison preview for Inter (recommended), IBM Plex Sans, Source Sans 3 and the current browser font. Playwright captured the actual task 168 Analytics component with temporary browser-only font overrides and local sample authentication/report responses, across Sales/Purchases/Cash on phone and desktop. The HTML picker includes comparison, actual-size controls and live 400/500/600/700 weight specimens. All 24 selections, small widths and keyboard controls were checked; no cloud requests were forwarded. No global font, app source or production change; a font choice and native device checks remain pending. See docs/previews/KITCHEN_FONTS.md.
✅ Task 170: User selected Source Sans 3; applied it to shared staging UI Text/TextInput while retaining current sizes, layout and weight roles. Four local static faces support real native weight selection and web CSS weight matching. Routes remain usable while fonts load, and failed fonts fall back to the platform font. Typecheck, changed-source lint, 34 local typography/report/phone/native-route tests, mocked Playwright phone/desktop/form/fallback checks and a 51-route web export passed. Independent source review's startup delay finding was fixed and confirmed. No cloud requests forwarded, database/service/polling change or production deployment; native hardware appearance remains unverified. See docs/TYPOGRAPHY.md.
✅ Task 171: Prepared all three requested background/detail direction previews: Neutral workspace (recommended), Warm off-white and Blue frame. The local picker shows 16 actual Expo Home/Analytics captures across current/candidates and desktop/phone, with current comparison, actual size, URL restoration and keyboard controls. Temporary browser overrides retain Source Sans 3, exact figures, semantic money and compact report rows; desktop proposals add Le Laban/Central Kitchen rail identity. Mocked capture testing fulfilled 40 requests locally and forwarded zero cloud requests; the existing staging startup authentication probe is outside that preview-only claim. Checks cover all selections and desktop/phone/small-phone frames without errors or page overflow. Independent scoped review returned ship for presenting the alternatives after copy/transition fixes. No direction is selected; no app source, shared token, database or production change. Incumbent product/design authority is preserved; native appearance and text scaling remain unverified. Staging remains on localhost:8081 (API 8083), picker on 127.0.0.1:8095. See docs/previews/KITCHEN_BACKGROUNDS.md.
✅ Task 172: User selected Blue frame from task 171 and explicitly requested the existing POS left-sidebar colours and design. Staging Kitchen desktop/tablet rails now share the exact POS gradient, translucent selection and quiet ring detail, with Le Laban/Central Kitchen identity and a bounded scrolling tab list. A separate Kitchen Canvas token preserves original control/module tints, phone navigation, Source Sans 3 and compact report rows. Typecheck, changed-source lint and 18 native route-load checks passed; mocked browser checks cover desktop/tablet/phone and short windows, fulfil 149 cloud-targeted requests locally and forward zero. Independent scoped finish review returned Ship after rail clipping was corrected; native hardware/text scaling remain unverified. No services, database, migrations or production deployment changed. See docs/KITCHEN_BLUE_FRAME.md.
✅ Task 173: Refined the selected Blue frame in staging: reused the existing Le Laban logo, matched Kitchen Canvas to the POS/Orders `#f5f8fc` canvas and replaced Kitchen selection with a quiet flat fill. Desktop web now defaults to a 64px icon rail, expands to a 176px overlay on hover/keyboard focus and optionally pins open; pointer tab clicks collapse on exit. Tablet/native and phone navigation retain their layouts. Typecheck, changed-source lint and 18 route-load checks passed; five mocked browser viewports checked logo, selection, all six sections, focus, pin/unpin sequence and short-window navigation, fulfilling 100 cloud-targeted requests locally with zero forwarded. Independent finish review returned Ship after the modality correction. Task 172 remains history; native hardware/text scaling/dark appearance/gestures remain unverified. No backend, migration or production changes. See docs/KITCHEN_BLUE_FRAME.md.
✅ Task 174: Extended staging Kitchen History with creator, transaction date, recorded IST time and active/edited/replaced/voided audit states. Composable type/status/staff/search/calendar filters and four transaction/entry-date sorts operate locally on the disclosed existing 500-entry/92-transaction-day window; edited details show the cached earlier version or an explicit unavailable-window message. The service SELECT/mapper now includes the existing voided_by field; scoped queries and write behavior are preserved. Typecheck, changed-file lint and 63 focused tests (19 route-load checks) passed. Four mocked Expo browser sizes cover controls, audit details and loading/empty/error recovery, fulfil 89 requests locally and forward zero cloud requests. Independent scoped finish review scored its sole refresh-target correction resolved/Ship. No migration, live-cloud test, write or production deployment; native hardware/text scaling/dark appearance/gestures remain unverified. See docs/KITCHEN_HISTORY.md.
✅ Task 175: Split staging Kitchen stock into Raw materials and Finished goods. Desktop/tablet navigation exposes both; phone Stock switches between them. Finished-goods batches record produced quantity only, without consuming ingredients; raw materials have stock counts and purchases. Explicit item kind works independently of selling price, and historical edit lines remain available after reclassification. The scoped migration 20261010055214 was approved, applied and verified in Grovit Staging only; existing stock/history are preserved. Typecheck, changed-source lint and 70 focused tests (22 route-load checks) passed. Four mocked browser sizes plus recovery checks fulfilled 368 requests locally and forwarded zero cloud requests; authenticated rollback-only SQL verifies batch/count/void and branch isolation. Independent finish review scored the load-error correction resolved/Ship. Native hardware/text scaling/dark appearance/gestures remain unverified; production is unchanged. Six migrations now remain staging-only. See docs/KITCHEN_STOCK.md.
✅ Task 176: Added staging Kitchen Attendance with an independent manual staff roster and Daily register/Staff panes. Desktop/tablet rail exposes Attendance; phones open it through More. Present/Absent/Half day/Leave remain distinct from Unmarked; India-date controls reject future days, notes allow 200 characters, and archive/restore preserve recorded days. Scoped services wait for confirmed writes, while the database enforces one person/day, roster scope, immutable identity and server editor/time. Both attendance migrations were applied one at a time and verified only in Grovit Staging; eight migrations now remain staging-only. Authenticated rollback-only SQL passed attendance, archive, duplicate/future-date and access checks. Typecheck, lint (zero errors; existing warnings), 30 attendance/route checks, the 297-test/32-suite broader regression run and 55-route web export passed. Four mocked browser sizes and 15 states fulfilled 87 requests locally with zero forwarded cloud requests; the actual staging route also loaded its empty roster without a migration error. Independent finish reviewer scored the flat staff-field correction resolved/ship. No new design tokens or production deployment; native hardware/text scaling/keyboard/dark appearance/gestures remain unverified. See docs/KITCHEN_ATTENDANCE.md. The separate task 177 security work is not certified by this attendance verification.
✅ Task 177: Completed repository/security/performance review after Attendance. Printer status and print-job endpoints now scope to the caller's selected branch; batched order-item counts join/filter the parent tenant and branch. Three printer regression checks and a count-scope check passed. Patched SheetJS to official 0.20.3 and shell-quote to 1.12.0 without changing Expo 54; Excel/CSV Unicode/decimal roundtrip passed. Removed unused imports/helpers and redundant Attendance copy. Final typecheck, 297 tests/32 suites, lint (zero errors; 166 legacy warnings) and 55-route export passed. Dependency findings decreased 79→77 with critical 1→0; 57 high/20 moderate and existing database advisor warnings remain for compatible follow-up. Configured local SMTP/PrintNode secrets were absent from the public export. No polling increase, production migration or deployment. See docs/CODEBASE_REVIEW_2026-10-10.md for evidence, limitations and remaining release work.
✅ Task 178: Reworked staging Kitchen Attendance with HR-tool roster clarity: slim title/actions, underline Daily register/Staff panes, local All/Unmarked/Present/Absent/Half day/Leave count filters and completion, aligned desktop staff/status/latest-editor/notes columns, and compact phone status/search disclosure. Existing manual marks, notes, roster maintenance and confirmed-write behavior remain intact. Final typecheck, changed-source lint and 30 attendance/native-route checks passed. Sixteen mocked browser captures cover desktop/tablet/phone/320px, local filters, calendar, staff/note/clear/archive and loading/empty/error recovery; 87 requests were fulfilled locally, zero forwarded and five mock writes recorded. Typical collapsed phone rows measured 65px; initials are omitted below 360px for long names. Independent scoped finish review returned Ship with no material fixes. A read of the existing live staging session confirmed the refreshed UI with a user-entered staff record; no user records were changed by testing. No service/query/schema/polling or production changes; native hardware/text scaling/keyboard/dark appearance/gestures remain unverified. Incumbent design files/tokens are preserved and pre-existing documentation drift is recorded in docs/KITCHEN_ATTENDANCE.md.
✅ Task 179: Added staging Month overview with per-staff Present/Absent/Half day/Leave/Unmarked totals and manual individual-day calendar editing. Active staff totals count calendar days through India today, not employment/scheduled days or payroll; archived staff count/correct recorded days only. Desktop pairs a 352px staff list with calendar; phones open calendar with Back. Save/Cancel protect local drafts and failed writes retain input; Clear confirms Unmarked, with no bulk autofill or global route guard. New scoped month reads page attendance only as needed and reject partial totals; daily fetch is skipped while monthly. History now groups desktop particulars with amount/status before audit, and separates phone audit footer without changing filters/sorts/details/loaded scope. Final typecheck, changed-source lint and 304 tests/33 suites (23 native route imports) passed. Twenty month and 19 History mocked captures cover four sizes, forward zero cloud requests and preserve incumbent design; month testing records three mock writes. Focused reads of the existing live staging session confirm both screens with no live writes. Fresh independent finish review returned Ship with no material fixes. No new polling/schema/migration or production deployment; native hardware/text scaling/keyboard/dark appearance/gestures remain unverified. Design files/tokens are preserved and pre-existing documentation drift is recorded in docs/KITCHEN_ATTENDANCE.md and docs/KITCHEN_HISTORY.md.
✅ Task 180: Refined staging Kitchen History controls: desktop Search/Filters/220px sort share one row; phones use full-width Search above matched 48px Filter/sort buttons with active counts. Compact date-basis labels and direction icons preserve four sorts and full accessible/picker wording; optional ReportSelect toolbar presentation preserves default fields. Rows, local filter/sort behavior, services, queries, store and polling are unchanged. Final typecheck, changed-file lint and 35 tests/two suites (23 native route imports) passed. Nineteen mocked captures across four sizes fulfilled 89 requests locally and forwarded zero; filters made no queries. A read-only existing staging session confirms both buttons at 48px in the user's 319×668 panel, with no Refresh or writes. The independent reviewer scored its sole narrow-label/count correction resolved, found no fix-induced regressions and returned Ship; this is not a fresh whole-surface approval. Design files/tokens are preserved and existing drift remains documented. No assets/schema/migration/production deployment; eight migrations remain staging-only. Native hardware/text scaling/keyboard/dark appearance/gestures remain unverified. See docs/KITCHEN_HISTORY.md.
✅ Task 181: Organized staging Kitchen History's expanded filters into Entry details and Dates, with labels above white outlined 48px controls. Desktop groups sit side by side; tablets retain field rows in stacked groups; phones stack full-width fields. Concise status triggers preserve full picker/accessibility wording; optional shared outlined presentations default false. Textual web placeholders now use 14px regular weight, retaining entered-text sizes and excluding numeric/decimal inputs; native hints are unchanged. Toolbar, rows, local filtering/sorting, loaded 500-entry/92-transaction-day scope and services/polling remain intact. Final typecheck, changed-file lint and 44 tests/three suites (23 native route imports) passed. Twenty-three mocked captures across four sizes fulfilled 89 requests locally with zero forwarded, no writes/errors/overflow or measured sub-44px controls, and no filter requests. Two read-only captures of the existing 319×668 staging session confirm the layout and hint size without Refresh or writes; the same-day usage baseline was reused. Fresh independent review checked all 25 images and returned Ship with no material fixes across all five contract sections. Incumbent design files/tokens and documented drift are preserved. No assets/schema/migration/production deployment; eight migrations remain staging-only. Native hardware/text scaling/keyboard/dark appearance/gestures remain unverified. See docs/KITCHEN_HISTORY.md.
✅ Task 182: Refined staging shared report picker and calendar hover boundaries after the user's History feedback. Rounded padded 48px picker rows have 4px separators; calendar highlights are inset 2px inside full 48px targets, with distinct selected/range/hover fills and stable inside focus borders. Measured date targets are disjoint and at least 44px wide; the prior touching backgrounds are now visually separated. Existing History grouping, rows, date drafts, Cancel/Apply, local filters/sorts and all shared callers' callbacks remain. Final typecheck, changed-file lint and 44 tests/three suites (23 native route imports) passed. Twenty mocked captures across five sizes fulfilled 61 requests locally with zero forwarded/errors and no History filter requests; one existing staging calendar was opened and Cancelled without Apply, Refresh or writes. Fresh independent review inspected all 21 images and five contract sections and returned Ship with no material fixes. Design files/tokens and existing documented drift are preserved. No service/query/store/polling/schema/migration or production change; eight migrations remain staging-only. Native hardware/text scaling/keyboard/dark appearance/gestures remain unverified. See docs/KITCHEN_HISTORY.md.
✅ Task 183: Compacted staging History phone filters below 640px into five inline label/value rows with 44px minimum targets, 6px gaps, 8px padding and a date divider. Long choices wrap; Any dates means no filter within the disclosed loaded window. Desktop/tablet grouped 48px controls, shared defaults and local behavior remain. Final typecheck, changed-source lint and 44 tests/three suites (23 native route imports) passed. Thirty-three mocked captures across five sizes fulfilled 100 requests locally, forwarding zero with no errors/writes/filter requests. The existing staging default panel is 46.1% shorter (546.4→294.4px); only part of the first row is visible at 668px height. Fresh review inspected all 34 images and five contract sections and returned Ship without material fixes. Design authority and documented drift are preserved. No service/query/store/polling/schema/migration or production change; eight migrations remain staging-only. Native hardware/text scaling/keyboard/dark appearance/gestures remain unverified. See docs/KITCHEN_HISTORY.md for evidence limits.
✅ Task 184 (2026-10-11, preview only): Presented three local compact History filter concepts: recommended Balanced grid (2×2 plus full-width date range), Paired rows (full-width staff) and Filter sheet (2×2 plus dates, Done/Close). Selection was pending at presentation; the subsequent Filter sheet selection is implemented in task 185. Twelve local captures checked selectors, wrapping, dates, reset/search, carousel, narrow and dark mock states with zero Supabase requests/errors/blocked requests/overflow/sub-44px controls. The reviewer scored the sole cross-month/year date-label fix resolved and returned Ship for presenting these previews only. Mock heights/row counts are not real-app measurements; dark host rendering is not product dark-theme approval. That preview task preserved incumbent design authority/drift and app/staging/source/query/schema/deployment. See docs/KITCHEN_HISTORY.md for artifact and evidence.
✅ Task 185 (2026-10-11, staging): User selected Filter sheet from task 184. History phones below 640px now open a wrapping 2×2 choice grid plus full-width dates above the list; desktop/tablet inline groups remain. Done/Close/backdrop/platform Back retain local choices; Reset clears filter/search fields while keeping sort, and dates retain separate Cancel/Apply drafts. The static form scrolls independently on short windows with 48px close/footer targets and safe-area padding; record/picker/calendar lists remain FlatList. Typecheck, changed-file lint and 44 tests/three suites (23 native route imports) passed. Forty-five final-source captures cover six viewports and recovery states. Five viewport batches passed before a local server interruption; resumed short-phone/breakpoint/state checks passed with 61 mocked requests and zero forwarded/errors/unexpected hosts, a resumed-batch count only. Fresh independent review returned Ship for staging browser composition and inspected native source, with no material fixes. Staging restarted on 8081 (API 8083); no live QA, service/store/polling/schema/migration or production change. Design authority and documented drift are preserved. Native hardware/keyboard/scaling/dark appearance/physical gestures remain unverified. See docs/KITCHEN_HISTORY.md.
✅ Task 186 (2026-10-11, staging): Polished Attendance Save note/Clear mark/Close with intrinsic widths, 14px semibold labels, 44px minimum targets and 8px gaps/corners. Existing confirmed-write dismissal and failed-save draft retention remain. Typecheck, changed-file lint and 37 tests/three suites passed; eleven mocked captures across five viewports fulfilled 47 requests locally, forwarded zero and recorded two successful mock writes with no page errors. Fresh scoped browser/source review returned Ship without material fixes. Design authority is preserved; no live database testing, migration or production change. Native appearance/scaling/keyboard/gestures remain unverified. See docs/KITCHEN_ATTENDANCE.md.
✅ Task 187 (2026-10-11, staging): Replaced transparent Attendance actions with solid 48px/14px semibold controls, limited optional note editing to Half day/Leave in daily/month views, and added daily name press/hold or Select staff checkbox selection, current-view Select all and explicit date/count/status/Mark. Changed marks use one scoped upsert preserving individual notes and wait for complete confirmation; matching marks need no write and failures retain selection. Typecheck, changed-source lint and 45 tests/three suites passed. Fresh review opened 23 images across five sizes and returned Ship without material fixes; the interrupted visual matrix and resumed behavior run (17 mocked requests, zero forwarded, two successful mock writes) are qualified in docs/KITCHEN_ATTENDANCE.md. Incumbent design files/tokens and recorded drift remain; no schema, migration, live DB verification or production change. Native hardware/scaling/keyboard/dark appearance/gestures remain unverified.
✅ Task 188 (2026-10-11, staging): Added branch invoices from Analytics Sales (desktop Invoices; phone Report actions → Branch invoices), carrying branch and inclusive dates. Select up to 100 whole finished-goods deliveries across pages; immutable numbered snapshots do not repost sales/stock. Matched non-voided receipts drive To be paid/Paid and partial remaining balances. Atomic received-payment matching rejects overpayment and uses retry keys; cancellation retains records/payments and releases deliveries, while active invoice deliveries reject edit/void. Browser Print / PDF fetches fresh status; native Share PDF requires an updated build and hardware verification. The single scoped invoice migration was applied and verified only in Grovit Staging; nine migrations now remain staging-only. Typecheck, changed-source lint and 47 tests/three suites (24 route imports) passed. Authenticated rollback-only SQL covered correctness, privileges and tenant/branch denial; five mocked browser sizes retained 22 captures with 60 intercepted/zero forwarded requests, followed by a focused error confirmation with 24 intercepted/zero forwarded. A real staging empty register and rendered sample A4 PDF were checked. Fresh finish review returned Ship for staging browser/source, with no material fixes. Source Sans 3, incumbent tokens and protected design files remain unchanged; native hardware/scaling/keyboard/sharing and production are outside verification. See docs/KITCHEN_INVOICES.md.
✅ Task 189 (2026-10-11, staging): Invoice diagnosis confirmed an empty saved register but two eligible deliveries in the selected Kolathur period. Added an explicit Select deliveries empty-state action and guidance; compact invoice actions now fit labels with 44px targets rather than stretching across phone columns, and desktop Refresh stays filter-aligned. Typecheck/lint passed; three mocked widths verified empty → branch/delivery selection → confirmed creation/detail with nine captures, 27 intercepted requests, zero cloud forwarding, three mock writes and no page errors. One desktop alignment confirmation used nine intercepted/zero forwarded requests. Real staging displayed the eligible deliveries and compact controls; no business invoice/payment was created. No service, schema/migration, production or protected design changes; native hardware remains unverified. See docs/KITCHEN_INVOICES.md.
✅ Task 190 (2026-10-11, staging source): Invoice review fixes. "Prepared"/"Issued" dates now use the India calendar day instead of the UTC prefix (wrong between midnight and 5:30 am IST); delivery and print dates are readable; the print footer time is IST. Register rows show the remaining balance on part-paid invoices; the payment form states the open amount and explains an over-limit amount; branch choices reload if the register failed to load. New migration 20261011143000_kitchen_invoice_payment_oldest_first.sql makes invoice payments cover the oldest delivery first (was uuid order); it was applied on its own to Grovit Staging and verified with an authenticated rollback-only fixture (a ₹40 part payment covered 1 Oct ₹30, 2 Oct ₹10, 3 Oct ₹0; retry, overpayment, paid and cancel checks passed; no rows left). Ten migrations now remain staging-only; production is unchanged. Typecheck, changed-file lint and 15 invoice tests passed; mocked Playwright at three sizes forwarded zero cloud requests. See docs/KITCHEN_INVOICES.md.
✅ Task 191 (2026-10-11, staging source): Invoices is a kitchen tab (rail after Branches; phone More), URL unchanged. Preview invoice shows the bill in-app with fresh status; Print / Save PDF prints from a hidden in-page frame so pop-up blockers no longer stop it (phones keep Share PDF). Refresh buttons removed: reload on focus, after writes and pull-to-refresh. Full 331-test run and mocked Playwright at three sizes passed with zero forwarded requests. See docs/KITCHEN_INVOICES.md.
✅ Task 192 (2026-10-11, production): Printing lag fixes, deployed to production through hotfix PR #3 (merge f067493, Vercel production deployment Ready). KOT and bill printing no longer hold up saving an order (ordered background queue); printer rows, receipt header and GST rate come from 5-minute caches read in parallel (Settings clears the printer cache; a refused job reloads and retries once); kitchen printers print together; retired local-agent code removed (4 s localhost:4545 wait per KOT, duplicate Save & Print bill, billingPrinter requirement on Reprint). Till test and PrintNode client restart pending with the owner. See docs/PRINTING_LAG_2026-10-11.md.
✅ Task 193 (2026-10-11, staging): Kitchen invoices are numbered 01000, 01001… per Central Kitchen, gap-free, shown as five plain digits. Migration 20261011170000_kitchen_invoice_numbers.sql (per-kitchen counter, existing invoices renumbered 01000–01004) applied and verified on staging only; a failed attempt uses no number. See docs/KITCHEN_INVOICES.md.
✅ Task 194 (2026-10-11, staging): Separate Cash and Bank balances for the Central Kitchen (owner request, replacing the single pot). UPI counts as Bank; opening cash/bank on an as-of date; Move money records deposits/withdrawals and changes nothing else; transfers are voided, never deleted. Home shows Cash in hand and Bank · UPI tiles; new Cash & bank screen at /central-kitchen/money. Migration 20261011170100_kitchen_cash_bank.sql applied and verified on staging only with a rollback-only fixture. 339 tests passed; mocked Playwright at three sizes forwarded zero requests. See docs/KITCHEN_CASH_BANK.md.
✅ Task 195 (2026-10-11, staging source): On desktop web every Central Kitchen tab (Home, Raw materials, Finished goods, Attendance incl. Month overview, Branches, Vendors, History) now centres its 1120 px content frame beside the rail, matching Analytics and Invoices; previously left-aligned. Phone and tablet unchanged. DESIGN.md updated. Mocked Playwright at 1440 and 1024 px measured every tab title at the same position as Invoices (x=208 / x=80), no overflow, zero forwarded requests; layout detector clean.
✅ Task 196 (2026-10-11, preview only): Three desktop POS analytics previews inspired by the owner's reference dashboard, in Le Laban blue, leading with sales and money and covering every current section: Daily statement, Menu insight (quantity vs revenue chart) and Branch split (Kolathur vs Velachery). Sample data; no app, database or production change. Playwright at 1440 and 1280 px: no errors, no external requests, no overflow. Selection pending. See docs/previews/POS_ANALYTICS.md.
✅ Task 197 (2026-10-11, staging source): Desktop web POS analytics rebuilt as the chosen Daily statement layout (phone and tablet unchanged): money card with 48 px hero and change vs the previous equal period, collected/pending flow, sales by day vs previous period with tooltips, payment ring, rush hours with a busiest-window sentence, orders by day, best/top-revenue/slow items, full item sales list and royalty. Premium chart palette (blue/teal/violet, light blue for the previous period, amber only for pending) validated with the dataviz skill and stored as `chart` in brand.ts. Impeccable finish review: fix (8 items) then ship after one batch. 339 tests passed; mocked Playwright at 1440/1280 forwarded zero requests. No database change. See docs/POS_ANALYTICS_DESKTOP.md.
✅ Task 198 (2026-10-12, staging source): Real-data fixes to the desktop analytics found on live staging: scope line follows the loaded data ("updating…" while loading), one column per calendar day aligned with the same day one period earlier, service month labels matched ("Sep" not "Sept"), whole-rupee totals, width-aware day labels. Verified on staging (30 days: ₹6,96,694, 1,686 orders, best day 20 Sep). 339 tests passed. See docs/POS_ANALYTICS_DESKTOP.md.
✅ Task 199 (2026-10-12, staging source): Desktop analytics header now matches the chosen preview: title left, one row of tools right (period menu "7 days · 6–12 Oct", hours, branch menu, exports). Every comparison names its dates ("vs 29 Sep – 5 Oct"; tooltip shows the matching day) instead of "previous period"; fixed three-letter months. Mocked Playwright checked menus, re-query and 1100 px fit; 339 tests passed. See docs/POS_ANALYTICS_DESKTOP.md.
✅ Task 200 (2026-10-12, staging source): This month (any range from the 1st inside one month) now compares with the same dates last month (1–12 Oct vs 1–12 Sep; missing days clamped). The staging strip is now a small "TEST DATA" tag at top centre that takes no space or taps. Shared DatePickerModal rebuilt: gap-free 44 px day cells (the whole cell is the target), continuous range band, hover on every day and a hover preview while picking the end, 44 px buttons, brand tokens, local dates, fixed month names. Custom dates… no longer switches the period until dates are applied. Mocked Playwright checked; 339 tests passed. See docs/POS_ANALYTICS_DESKTOP.md.
✅ Task 202 (2026-10-12, staging source): Central Kitchen permissions and day lock. Per-login permissions (25, with Kitchen manager / Entry clerk / Store keeper / Accounts starting roles) set by the owner on the new Team and day lock screen; branch admins count as managers; logins without settings keep full access. Automatic daily lock at a chosen hour plus owner lock-up-to date; locked days change only by the owner with a reason. Change log for edits, voids, locked-day changes, permission and lock changes. Enforced in the database (3 migrations, staging only so far); app hides actions, tabs and amounts to match. Verified with rollback-only fixtures, mocked Playwright and 346 tests. See docs/KITCHEN_PERMISSIONS.md.
⬜ Task 8: Analytics screen
✅ Task 204 (2026-10-14, staging source): Kitchen Send and Bought item lists are search-first: empty until you search, matches by kind, chosen lines stay. See docs/KITCHEN_STOCK.md.
✅ Task 205 (2026-10-14, staging source): Attendance month overview fills each day with a status colour instead of letters; gap-free 48px day targets with the colour 2px inside. See docs/KITCHEN_ATTENDANCE.md.
✅ Task 206 (2026-10-14, staging source): Invoice register status chips (All, To be paid, Paid, Cancelled), filtered in the database (migration 20261014100000). See docs/KITCHEN_INVOICES.md.
✅ Task 207 (2026-10-14, staging source): History status filter simplified to Current, Edited and Voided. See docs/KITCHEN_HISTORY.md.
✅ Task 208 (2026-10-14, staging source): Kitchen Analytics Bank tab; Cash is cash only, Bank is UPI and bank, money moves in both (migration 20261014100100). See docs/KITCHEN_CASH_BANK.md.
✅ Task 209 (2026-10-14, staging source): Cost per unit on finished goods, kept on each send line, and a Profit tab (sales - cost of goods sent - other expenses) (migrations 20261014100200, 20261014100300). See docs/KITCHEN_PROFIT.md.
✅ Task 210 (2026-10-14, staging source): Kitchen rail selection is a soft fading fill; the focus outline shows only for keyboard focus. See docs/KITCHEN_BLUE_FRAME.md.
✅ Task 211 (2026-10-14, staging source): Kitchen phone layout: a chosen send/buy line gives the item name the full width (two lines) with stock and price beside the stepper; item and stock-list titles wrap to two lines; the amount box is 56px, capped at 360px, with matching ₹ and digits (24px also on phones); Cash/UPI/Bank are three equal icon buttons with a note on which balance it counts in.
✅ Task 212 (2026-10-14, staging source): Kitchen pop-ups close on a tap outside: the report and History pickers and the attendance date picker always; the date range only while no new dates are picked; sheets (void reason, new category) only while nothing is typed, otherwise they stay open and say the text is kept. ✕ and Back still close everything.
✅ Task 213 (2026-10-14, staging source): Kitchen forms use the owner-chosen minimal sizing (preview option C): chips, the date switch and the payment-mode bar are drawn 36px inside full 44px targets (a padded Pressable, not hitSlop, so the web app keeps the target too); text and amount boxes, the main action and normal secondary buttons are 44px; field spacing 10px, label gap 4px. Shared in src/components/kitchen/ui.tsx (VISUAL, BAND).
✅ Task 214 (2026-10-14, staging source): Kitchen switches slide instead of jumping: the payment-mode bar, every Segmented bar (When, Pay later/Paid now, Expense/Pay a vendor, Raw/Finished, Cash→Bank, lock On/Off), the Analytics report tabs and the Attendance pane underline. Shared useSlidingRect in kitchen/ui.tsx measures each option and moves one highlight in 220 ms ease-out; it appears in place first, jumps on resize, and does not animate with Reduce Motion on.
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
   → every operational table has tenant_id + branch_id
   → RLS enforced in PostgreSQL (supabase/migrations/20260907000100_rls_policies.sql)

6. Money and document numbers are owned by the database
   → settle_order() runs the whole settlement in one transaction
   → POS bill / order / KOT numbers come from per-branch counters (branch_counters)
   → Kitchen branch invoice references use a separate global identity sequence, with gaps allowed
   → all totals are integer paise; the client mirrors the SQL in money-utils.ts

7. The serverless API trusts only the Supabase JWT
   → every /api handler authenticates the bearer token and derives
      tenant/branch/role from the staff row (src/lib/server/api-auth.ts)

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
