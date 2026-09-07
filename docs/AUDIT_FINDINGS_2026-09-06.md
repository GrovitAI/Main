# Grovit POS — Audit Findings & Recommended Fixes

**Date:** 2026-09-06
**Scope:** Full repository audit (security, multi-tenancy, data integrity, performance, build/config, hygiene).
**Status:** Findings only. No code has been changed.
**Baseline:** `npx tsc --noEmit` passes with 0 errors.

Severity key: **CRITICAL** = fix before any real customer data · **HIGH** = data loss / wrong money · **MEDIUM** = performance & maintainability · **LOW** = hygiene.

---

## 1. CRITICAL

| # | Finding | Where | Recommended fix |
|---|---------|-------|-----------------|
| C1 | **No Row Level Security.** No `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` anywhere. Client uses anon key, so every `tenant_id`/`branch_id` filter is client-side only. Anyone with the anon key (extractable from the web bundle) can read/modify every tenant's data. | `src/lib/pos/supabase.ts`, all SQL in `scratch/`, `docs/` | Enable RLS on every table. Policies keyed on `auth.uid()` → `staff.tenant_id` / `staff.branch_id`. Keep client filters as defence-in-depth. |
| C2 | **Secrets committed to GitHub.** `.env` is tracked (3 commits). `.gitignore` only excludes `.env*.local`. Committed: Supabase anon key, PrintNode key. Working copy also has SMTP password. Two untracked scratch files embed a service-role key inline. | `.env`, `.gitignore:34`, `scratch/deploy_rpcs*.js` | 1) Rotate PrintNode + SMTP credentials. 2) `git rm --cached .env`. 3) Add `.env` and `scratch/` to `.gitignore`. 4) Consider history purge (BFG / filter-repo). 5) Never stage `scratch/`. |
| C3 | **All Vercel API endpoints unauthenticated, CORS `*`.** Tenant/branch IDs taken from request body. Attacker can disable approval OTP for any tenant, mark approval requests COMPLETED, or relay arbitrary print jobs. | `api/approval/*.ts`, `api/printers.ts`, `api/printjobs.ts` | Require `Authorization: Bearer <Supabase JWT>`; verify with `supabase.auth.getUser()` server-side; derive tenant/branch from the `staff` row, never the body. Restrict CORS to app origin. Check `printerId` belongs to caller's branch. |
| C4 | ✅ **FIXED — task 18 (06e5e5d).** **PrintNode API key logged to Vercel logs** as char codes; Basic-auth token prefix also logged. | `api/printjobs.ts:42-48`, `api/printers.ts:67` | Delete all key/auth debug logging. |
| C5 | ✅ **FIXED in code — task 19 (472c39b). Migration must be run in Supabase SQL Editor.** **Settlement is non-atomic.** 6+ separate client round-trips (invoice update → bill upsert → delete bill_items → insert bill_items → insert settlement → update order status). Network drop mid-way leaves bills with zero items, settlements without paid status, or paid bills without settlement. Only 4 `.rpc()` calls exist in repo (analytics reads). | `src/lib/pos/open-orders-service.ts:1473-1665` | Create one `settle_order(p_order_id, p_payment_type, ...)` plpgsql RPC doing all writes in a single transaction with `SELECT … FOR UPDATE` on the order and a `status <> 'paid'` precondition. |
| C6 | **Invoice numbers from browser localStorage counter.** Each device keeps its own counter; cleared storage restarts at INV-0001. No UNIQUE constraint on `bills.invoice_number` in any SQL. Duplicate invoice numbers across terminals are guaranteed (GST compliance risk). | `src/lib/pos/open-orders-service.ts:149-153`, `use-orders-store.ts:288-319` | Assign invoice number in DB via per-(tenant, branch) sequence or trigger inside the settle RPC. Add `UNIQUE(tenant_id, branch_id, invoice_number)`. Remove client counter. |

---

## 2. HIGH

| # | Finding | Where | Recommended fix |
|---|---------|-------|-----------------|
| H1 | ✅ **Covered by task 19 row lock + idempotent replay.** **Double settlement possible.** `isMutating` lock is UI-only; service has no status precondition; no UNIQUE on `settlements.bill_id`. Two tabs both insert → revenue double-counted. | `use-orders-store.ts:1770`, `open-orders-service.ts:1571-1588` | Covered by C5 RPC + add `UNIQUE(bill_id)` on `settlements`. |
| H2 | **Inventory silently switches to localStorage** after any 404/`42P01`. Sticky flag; all later reads/writes "succeed" against browser storage. Stock adjustments and consumption batches never reach DB. | `inventory-service.ts:423, 910-921, 5207` | Remove fallback in production (`__DEV__` gate at most). Surface a hard error. |
| H3 | **No server-side consumption-queue worker.** Docs claim a background worker; only processor is a fire-and-forget client call after settlement. Closing tab leaves batch `Pending` forever. Processing has no locking; insufficient stock clamped to 0 silently. | `open-orders-service.ts:1636-1655`, `inventory-service.ts:5405-5431` | Implement as Supabase Edge Function or `pg_cron` job; process batches with row locks; record shortfalls instead of clamping. |
| H4 | **`receiveDispatch` not idempotent.** No check for already-received status; retry doubles `received_qty` and stock. No optimistic locking on stock levels. | `inventory-service.ts:4126-4147` | Precondition on `status`; use `version_no` compare-and-set or move to RPC. |
| H5 | **Ledger KPIs under-report silently.** Metrics query fetches all bills in range with no `.range()`; PostgREST caps at 1000 rows. Also checks `status === 'complimentary'` which the writer never produces → complimentary sales always 0. | `open-orders-service.ts:523-548` | Replace with an aggregation RPC (like analytics). Detect comps via `payment_type = 'complimentary'`. |
| H6 | **Business-day window blind spot + device-timezone dependency.** Bounds are 11:30→02:30 IST, so bills 02:30–11:30 IST appear in no preset. "Today" decided by device-local hours but bounds built assuming +05:30. | `reporting-utils.ts:205, 240, 265-272, 323-324` | Make window cover full 24h (02:30 → next 02:30). Compute "now in IST" explicitly (e.g. via `Intl` with `Asia/Kolkata`) instead of `now.getHours()`. |
| H7 | **Tax computed differently on print vs settle.** Save & Print hardcodes tax=0; settle applies `pos_settings.tax_percentage`; `bill_items.tax_rate` hardcoded 5. | `use-orders-store.ts:1409, 1568`, `open-orders-service.ts:1449-1450, 1510-1526` | Single tax calculation function used by both paths; read rate from settings once. |
| H8 | **OTP brute force is easy.** Resend resets attempts with only 30s throttle; endpoints unauthenticated; no IP rate limit. | `api/approval/resend.ts:586-591`, `verify.ts:275` | Cap resends per request (e.g. 3); do not reset attempts; add per-IP/tenant rate limiting. Depends on C3. |
| H9 | **`createStaff` calls `supabase.auth.signUp` client-side.** Any authenticated user can mint accounts; may swap admin session (inferred). | `staff-service.ts:100-103` | Move to server function using service-role key with owner/manager check. |
| H10 | **Hundreds of queries filter by `id` only** (no tenant filter); child-table writes never carry `tenant_id`. Relies entirely on C1. | `inventory-service.ts`, `open-orders-service.ts`, `use-orders-store.ts` (many lines) | Add `.eq('tenant_id', …)` everywhere, or rely on RLS once C1 is done. |

---

## 3. MEDIUM — Performance & Structure

| # | Finding | Where | Recommended fix |
|---|---------|-------|-----------------|
| M1 | **`inventory.tsx` god component:** 7,784 lines, 143 `useState`, 7 tabs via 15 render closures. Every keystroke re-runs whole render. | `src/app/(app)/inventory.tsx` | Split per tab into `src/components/inventory/{Dashboard,Materials,Purchases,Suppliers,Wastage,Transfers,Reports}Screen.tsx`; extract `useInventoryData()` hook. `RecipeManagement.tsx` is the pattern. |
| M2 | **Duplicate fetch on tab change.** Two `useEffect`s with identical deps both call `loadAllData`. | `inventory.tsx:774-776` and `786-793` | Delete the effect at line 774. |
| M3 | **Every cart tap writes discount to DB** even when no discount set. | `use-orders-store.ts:139-157` (called from 645, 709, 789, 860, 924) | Early-return when `discountType === null`; debounce sync. |
| M4 | **OrderPanel subscribes to whole store** (no selector) → re-renders on all 73 `set()` calls. | `components/pos/OrderPanel.tsx:116` | Use individual selectors or `useShallow`. |
| M5 | **Unmemoized catalog filter/sort** on every render; O(categories × products) filter inside `renderItem`. | `components/settings/MenuManagement.tsx:432-467, 771` | Wrap in `useMemo`; precompute `countByCategory` map. |
| M6 | **ScrollView + `.map()` over unbounded arrays** (31 ScrollViews in inventory; material dropdowns render all materials as Pressables). | `inventory.tsx:3844, 7455, 7557, 3511, 4501`; `RecipeManagement.tsx:292`; `OrderPanel.tsx:393` | Use existing `components/ui/SearchableDropdown.tsx` (FlatList-based); FlatList for bill items. |
| M7 | **Monolithic store actions** (`saveKot` 275 lines, `saveAndPrint` 425 lines) with 30 `console.time/log` calls in production path. | `use-orders-store.ts:1074-1774` | Extract to `kot-service.ts` / `bill-service.ts`; gate logging behind `__DEV__`. |
| M8 | **Money math is float-first.** Paise derived via `Math.round` after float ops; per-line `discount_amount_paise` always 0 so lines ≠ grand total. Example: ₹0.58 × 25% → 14 paise (exact = 15). | `open-orders-service.ts:1352-1355, 1443, 1453`; `use-orders-store.ts:107, 237` | Integer paise end-to-end; allocate discount per line (largest-remainder). |
| M9 | **Analytics RPC indexes.** Only `bills(tenant, branch, created_at)` indexed; RPCs filter on `settled_at` with OR → seq scans. No index on `settlements(bill_id)`. `GRANT … TO anon` without RLS. | `scratch/migration_analytics_rpcs.sql`, `docs/DATABASE_ARCHITECTURE.md:104` | Add `bills(tenant_id, branch_id, settled_at)` and `settlements(bill_id)` indexes. Revoke anon grant after C1. |
| M10 | **`dev-seed.ts` ships in production bundle** (unconditional import; only the call is `__DEV__`-gated). | `src/app/(app)/index.tsx:46, 523` | `require()` inside `__DEV__` branch. |
| M11 | **Raw Supabase error messages returned to UI** (102 sites in inventory-service alone). | `inventory-service.ts`, `approval-service.ts`, `staff-service.ts`, `branch-service.ts` | Map to fixed user strings; log details only. |
| M12 | **347 `any` usages**; 103 in `inventory-service.ts`; all API handlers `req: any, res: any`. | Service layer, `api/` | Run `supabase gen types typescript`; type clients and Vercel handlers. |
| M13 | **~1,665 hardcoded hex colors** outside `brand.ts`; 4 files use `StyleSheet.create`. | `inventory.tsx` (265), `orders.tsx` (247), `OrderPanel.tsx` (185), `_layout.tsx:566` | Add color tokens for icon greys; ESLint rule to block hex literals. |
| M14 | **Docs say Expo SDK 56; project is SDK 54** (`expo ~54.0.36`). AGENTS.md points at v56 docs. Tailwind pinned "3.4.17" in docs, `^3.4.19` in package. | `AGENTS.md:75`, `PROJECT_CONTEXT.md:23`, `docs/PROJECT_MEMORY.md` | Update docs to SDK 54 and correct versions. |
| M15 | **Not native-release-ready.** No `bundleIdentifier`, `android.package`, EAS project ID, `updates`/`runtimeVersion`, or `eas.json`. | `app.json` | Add identifiers + `eas.json` before any store/TestFlight build. |
| M16 | **`xlsx` statically imported into mobile bundle** for a web-only download feature; `pg` is a runtime dep with zero importers. | `inventory.tsx:135`, `MenuManagement.tsx:9`, `package.json` | Dynamic import gated on `Platform.OS === 'web'`; move `pg` to devDependencies or remove. |
| M17 | **No tests, no lint, no CI.** AGENTS.md rules unenforced. | `package.json`, no `.github/` | Add ESLint (TS strict, no-explicit-any, custom no-hex rule), a `typecheck` + `lint` GitHub Action, and smoke tests for settlement math. |

---

## 4. LOW — Hygiene

- **Dead code:** `src/lib/pos/printer-service.ts` (shim, 0 importers), `src/lib/approval/approval.provider.ts`, `src/lib/pos/constants.ts`, `navigation.ts`, `components/pos/OpenOrdersStrip.tsx`, `components/pos/sidebar/POSSidebar.tsx`, `settlement-service.ts:48-77 createSettlement` (divergent column names, unused).
- **Fake dashboard data:** hardcoded sparklines, procurement chart, `pendingPurchasesCount = 8` in `inventory.tsx:1862-2214`.
- **Hardcoded branch UUIDs** in UI for "simulated branch" diagnostics (`inventory.tsx:4457-4886`); remove from production.
- **Accessibility:** 0 `accessibilityRole` on 168 Pressables in inventory; similar in MenuManagement and phone screens.
- **`cancelOrder`** persists in detached async after optimistic UI clear (`use-orders-store.ts:1900-1925`) — violates "never optimistic" rule.
- **Confusing naming:** `approval-service.ts` (DB layer) vs `approval.service.ts` (HTTP client) already caused a client component to import the DB layer (`ApprovalPoliciesScreen.tsx:13`).
- **Stale doc claims:** "HMAC PIN hashing" (no PINs exist; auth is Supabase email/password); "background workers" for consumption queue (none exist).

---

## 5. Recommended Order of Work

1. **Today:** untrack `.env`, ignore `.env` + `scratch/`, rotate PrintNode and SMTP credentials, delete API key logging (C2, C4).
2. **RLS policies** on every table (C1). Revoke anon grants on RPCs (M9).
3. **API authentication** via Supabase JWT + origin-restricted CORS (C3, H8, H9).
4. **`settle_order` transactional RPC** with DB-assigned invoice numbers and `UNIQUE` constraints (C5, C6, H1, H7).
5. **Kill the localStorage fallback** in inventory (H2); make dispatch receive idempotent (H4).
6. **Fix reporting window + ledger KPI RPC** (H5, H6).
7. **Quick performance wins:** delete duplicate effect, null-guard discount sync, selectors in OrderPanel, memoize menu filter (M2–M5).
8. **Split `inventory.tsx`** by tab (M1); integer-paise money math (M8).
9. **Tooling:** ESLint + CI + generated DB types; update docs to SDK 54 (M12, M14, M17).
10. **Native release prep:** `app.json` identifiers + `eas.json`; real queue worker (M15, H3).
