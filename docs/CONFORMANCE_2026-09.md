# Codebase conformance sweep against AGENTS.md — 2026-09-21

Read-only pass over `src/`, `api/` and `scripts/` at `main` `c00a4bc`: 161
source files, about 55,000 lines. No source file was edited, the database was
not touched, and this report is the only file added. Detection used the
TypeScript compiler's own parser rather than grep wherever a rule is about
syntax (`any`, `!`, return types, JSX tags, imports), so those counts are exact;
where a rule needs judgement (touch targets, screen states, raw errors) the
method and its limits are stated beside the number.

**Baseline.** `npm run check` on a clean checkout: 0 TypeScript errors, 140
tests passing in 15 suites — and **161 lint warnings, not the single
`exhaustive-deps` warning the brief expected.** All 161 are pre-existing on
`main`; most are unused imports. Nothing below is breakage from someone's
uncommitted work.

## The short version

The rules that protect **types** and **platform** are kept perfectly: not one
`any`, not one non-null assertion, not one `@ts-ignore`, no `TouchableOpacity`,
no HTML element, no `next/*`, no `"use client"`. The three **money rules**
hold where it matters — settlement never clears the till before the database
answers, and every bill insert carries both ids — with one exception that is
the most important finding here: **the till's active-orders fetch has no
status filter at all.** It downloads the restaurant's entire order history on
every load and sorts out the open ones on the device.

The rules about **styling** are broken everywhere — about 5,400 violations —
and harmlessly. Those rules need rewording more than the code needs fixing.

## 1. Scoreboard

| Rule (AGENTS.md) | Violations | Worst | Note |
| :--- | ---: | :--- | :--- |
| "no any" — explicit, `as any`, generic, catch | **0** | — | verified by AST and by grep |
| "no non-null assertions" | **0** | — | incl. definite-assignment `!:` |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** | — | |
| `strict: true` | holds | — | `tsconfig.json` sets it; no strictness flag is switched off |
| Implicit `any` | **0** | — | typecheck passes under `strict` |
| Casts that sidestep the checker (`as unknown as`, unchecked `data as Row`) | 18 + ~100 | Risk | not named by the rule; see R1 |
| Exported function without explicit return type | 77 | Style | 76 are React components, 1 is a service helper |
| "Every Supabase query must include tenant_id AND branch_id" | 43 of 257 | Risk | **0** omit `tenant_id` on a business table; see R5 |
| "Never hardcode UUIDs outside tenant-context.ts" | 17 | **Bug** | 15 are B4 |
| Tenant context imported from elsewhere | **0** | — | |
| "No StyleSheet unless absolutely necessary" | 4 | Style | |
| "No hardcoded colors" — hex / rgb() / named | 1,741 | Style | 556 of them duplicate a token that already exists |
| — Tailwind default-palette classes (`text-slate-600` …) | 2,375 | Style | arguably the same rule; counted separately |
| — inline `style={…}` props (neither NativeWind nor StyleSheet) | 1,305 | Style | |
| "Pressable … not TouchableOpacity" | **0** | — | |
| "FlatList … not ScrollView + map" | 60 | Risk | 14 are short horizontal chip rows; see R6 |
| "Minimum touch target 44px" | 137 explicit, 231 unknown | Risk | heuristic; see R7 |
| "No HTML elements" | **0** | — | |
| "No next/* imports" | **0** | — | |
| `"use client"` | **0** | — | |
| "All Supabase logic in src/lib/pos/*-service.ts" | 28 calls in 4 non-service files; 5 services outside `lib/pos` | Risk | none in a screen or component; see R3 |
| "Every service function needs try/catch" | 4 async of 142 | Risk | see R4 |
| "Every service function needs TypeScript return type" | 1 of 153 | Style | `getApiBaseUrl`, `printer-service.ts:41` |
| "Never expose raw Supabase errors to UI" | 9 sites | Risk | see R2 |
| Screen handles loading / error / empty | 2 screens miss error | **Bug** | grid in section 4; B2, B3 |
| "Always filter `.eq('status', 'open')`" | 1 live, 1 dead | **Bug** | B1 |
| "Never clear a bill optimistically" | **0** | — | both settle paths wait for the database |
| "Every bill insert must include tenant_id and branch_id" | **0** | — | |
| "Use @/ alias for all imports" | 162 | Style | |
| "EXPO_PUBLIC_ prefix for all env variables" | 9 | Style | 5 are server-only SMTP settings and correct as they are |
| "lucide-react-native for all icons" | **0** | — | |

## 2. Bugs

### B1 — The till's active-orders fetch has no status filter

`src/lib/pos/open-orders-service.ts:679` `fetchOpenOrders()` — the function
`use-orders-store.ts:254` `loadOrders()` calls on every POS and Orders load:

```ts
let query = supabase.from('open_orders').select('*')
  .eq('tenant_id', tenant_id)
  .order('created_at', { ascending: false });
if (!isOwnerOrAdmin) query = query.eq('branch_id', branch_id);
…
const allOpen = filterOpenOrders(data);          // open | draft | held | unpaid | in_kitchen
```

AGENTS.md: *"Settled orders must never appear in active orders fetch. Always
filter: `.eq('status', 'open')`."* This query asks the database for **every
order the tenant has ever taken** — 5,919 rows today, settled and cancelled
included — and throws almost all of them away on the device
(`isOpenOrderRow`, line 8). `getOpenOrders()` at line 120 has the same shape;
it has no callers.

**What breaks.**

1. *An unpaid order can fall off the till.* A Supabase API returns at most
   1,000 rows per request by default (**unverified** for this project — the
   brief ruled out touching the database; it is Settings → API → Max rows).
   The query sorts newest first, so once history passes the cap the client
   receives only the newest 1,000 orders and filters *those*. At roughly 90
   orders a day across the two trading branches that window is about eleven
   days. An `unpaid` credit bill or a `held` order older than that is simply
   not in the response. It does not error; it is not there. This is the exact
   money-losing failure the rule exists to prevent, arriving from the other
   direction — not a settled order reappearing, but an open one vanishing.
2. *It is slow now.* Every load ships up to 1,000 full rows to the till, and
   each row read pays the row level security cost measured in the performance
   pass (a full read of `open_orders` took 2.6 s as the owner).
3. *An owner signed in at a till sees every branch's orders mixed together*,
   because `isOwnerOrAdmin` skips the branch filter. For an admin RLS quietly
   re-applies the branch; for an owner it does not.

**Fix.** Filter on the server: `.in('status', ['open', 'unpaid',
'in_kitchen'])` (what `fetchOpenOrders` keeps after dropping `held` and
`draft`), and always `.eq('branch_id', branch_id)` on a till. Rows with a NULL
status are treated as open today; decide whether any exist before dropping
that. Delete `getOpenOrders()`. The index `idx_open_orders_tenant_branch_status`
already fits this query.

### B2 — Settings shows "no printers" when the printer list fails to load

`src/app/(app)/settings.tsx:77`:

```ts
const res = await fetchPrinters();
if (res.data) { setPrinters(res.data); }
setLoading(false);
```

`res.error` is never read. When the network drops — restaurant wifi — the
spinner ends and the cashier sees an empty printer list, indistinguishable from
"no printers configured". The natural reaction is to add the printer again.
**Fix:** keep the error in state and render it with a retry, as `staff.tsx:130`
already does.

### B3 — The phone Menu screen shows an empty menu when loading fails

`src/app/(app)/menu.tsx:26`: `loadData()` awaits three fetches and copies
`.data` from each; none of the three `.error` values is looked at. On a failed
load `PhoneMenuScreen` renders its empty state — a menu with no products —
next to the controls for adding products. The tablet layout is unaffected
(`MenuManagement` loads its own data and handles errors). **Fix:** as B2.

### B4 — A "Simulate Active Branch" switch with Le Laban's branch ids ships to every tenant

`src/app/(app)/inventory.tsx:4360–4407` and `:4797–4818`. Two buttons set
`bbbbbbbb-0000-0000-0000-000000000001` and `cccccccc-0000-0000-0000-000000000001`
— Kolathur and the Central Kitchen — with no `__DEV__` guard and no role check;
line 4407 prints `[Diagnostics] Simulated Branch: …` on screen. 15 of the 17
hardcoded UUIDs in the codebase are here. For Le Laban it happens to work. For
anyone else — starting with Apple's reviewer on the demo tenant — it is a
visible diagnostics control that, when pressed, empties the Transfers tab,
because row level security returns nothing for another tenant's branch.
**Fix:** build the switch from `session.accessibleBranches` and show it to
owners only, or remove it.

## 3. Risks

**R1 — The type checker is being told, not asked, about database rows.** The
"no `any`" rule is kept to the letter, but ~100 query results are cast
straight to a hand-written interface (`data as ApprovalRequestRecord`,
`(data ?? []) as InventoryCategory[]`), plus 18 `as unknown as` double casts
outside tests (`web-style.ts` 4, `open-orders-service.ts` 3,
`InventorySidebar.tsx` 3, `SettlementModal.tsx` 2, six files with 1). A cast
is unchecked: if a column is renamed or made nullable the compiler stays
green and the screen shows `undefined`. `finance-service.ts` shows the better
pattern already — `asRecords()` plus `toText` / `toNumber` readers.
*One fix clears most of it:* generate types from the schema and type the
client, so `.from('bills').select()` returns a checked row.

**R2 — Nine places hand a raw error message to the person at the till.**
`err.message` from a caught exception is developer English ("TypeError:
Failed to fetch", "JSON Parse error"):

| Site | Reaches |
| :--- | :--- |
| `src/lib/pos/open-orders-service.ts:675` | Orders list error panel |
| `src/lib/pos/hooks/useInventoryData.ts:155` | Inventory banner |
| `src/lib/pos/hooks/useInventoryTracking.ts:105`, `:127`, `:145` | Inventory tracking card |
| `src/app/(app)/settings.tsx:69` | `Alert.alert` on printer sync |
| `src/components/settings/MenuManagement.tsx:66`, `src/components/inventory/inventory-types.ts:107`, `src/lib/pos/error-utils.ts:13` | shared "message from unknown" helpers |
| `src/lib/pos/finance-ledger-service.ts:81`, `:84` | Ledger forms — **deliberate**: database trigger messages there are written for people. But `:84` also forwards any `23514`, and a plain CHECK-constraint failure reads *new row for relation "finance_entries" violates check constraint …* |

Also `src/app/(app)/orders.tsx:1916` reports *every* settlement failure as
"Connection issue. Please check internet and try again." — including refusals
that retrying will never fix.

**R3 — Supabase logic outside the service layer.** No screen or component
queries Supabase (`orders.tsx:37` imports the client and never uses it;
`login.tsx:9` imports only a config flag). The 28 stray calls are in
`use-session-store.ts` (13 — the sign-in bootstrap), `dev-seed.ts` (12),
`use-orders-store.ts:329` (1) and `server/api-auth.ts` (2, legitimate).
`dev-seed.ts` returns early unless `__DEV__`, but `src/app/(app)/index.tsx:52`
imports it, so bill-inserting seed code ships in the production bundle. Five
services live outside `src/lib/pos/`: `analytics/analytics-service.ts`,
`approval/approval-service.ts`, `printer/printer-service.ts`,
`printer/print-agent-service.ts` — and `approval/approval.service.ts`, a
second file one punctuation mark away from `approval-service.ts`.

**R4 — Four async service functions throw instead of returning a result.**
`printer/print-agent-service.ts:19` `sendPrintJob` and
`printer/printer-service.ts:48` `fetchPrintNodePrinters` both `fetch` without a
`try`; a dropped connection becomes a rejected promise the caller must
remember to catch. `material-import-service.ts:64` and
`menu-import-service.ts:55` are validators that do no I/O — harmless. Eleven
synchronous exports also have no try/catch; they are pure helpers and need none.

**R5 — Tenant scoping.** 257 `.from(` calls. None omits `tenant_id` on a table
that has one, except twelve lookups by primary key or by `auth_user_id`
(sign-in bootstrap, `printer-service.ts:708`,
`api/approval/verify-email/confirm.ts:92,121`). 31 more omit only `branch_id`,
most on purpose (shared menu, inventory masters, tenant-wide finance ledger),
and 62 target tables that have no such column. Correct today because row level
security backs every one; the list is Appendix A. `tenant-context.ts:9–10`
still exports the deprecated `TENANT_ID` / `BRANCH_ID` constants holding Le
Laban's ids. Nothing imports them — delete them before something does.

**R6 — `ScrollView` + `.map()`: 60.** 14 are horizontal chip strips of a
handful of items, where `FlatList` buys nothing. The ones that matter render
database lists of unbounded length with no virtualisation:
`inventory.tsx` (25 sites — materials, ledger, purchases), `RecipeManagement.tsx`
(5), `PhoneOrdersScreen.tsx` (3). They work at 69 materials; they will stutter
on an older Android tablet at 500.

**R7 — Touch targets.** 137 `Pressable`s declare a height under 44 px with no
`hitSlop`: 34 at 40–43 px, 63 at 31–39 px, and 40 at 30 px or less. Worst files: `inventory.tsx` 40, `MenuManagement.tsx` 22, `orders.tsx`
18, `OrderPanel.tsx` 16 — the last two are the cashier's working surface. A
further 231 set no height, so their size comes from padding and content and
cannot be judged from source; 102 of those have no vertical padding class
either. *Heuristic:* it reads `h-*`, `min-h-*` and `style` heights on the
`Pressable` itself, so a small button inside a tall row is over-reported and a
padding-sized one is missed.

**R8 — The reference architecture is dead code.** AGENTS.md says to "follow
settlement-service.ts as reference architecture". Seven services import its
`ServiceResult` type, but its one write, `createSettlement()`, has no callers —
settlement goes through `settleOrderById` → `settle_order()` in
`open-orders-service.ts`. An assistant told to copy the reference copies a
client-side insert into `settlements`, which is precisely what the database
function replaced. Also `session-context.ts:103–104` exports all-zero
`CURRENT_SESSION_ID` / `CURRENT_TERMINAL_ID` from the pre-auth days; ten files
still import that module.

**R9 — 161 lint warnings.** Mostly unused imports, with a few
`react-hooks/exhaustive-deps` among them — the one class of warning that hides
real stale-closure bugs. At 161 nobody will see the 162nd.

## 4. Screen states

`✓` handled · `✗` missing · `—` not applicable (no data loaded)

| Screen | Loading | Error | Empty | Notes |
| :--- | :---: | :---: | :---: | :--- |
| `index.tsx` (POS) | ✓ | ✓ | ✓ | catalogue error panel + toasts |
| `orders.tsx` | ✓ | ✓ | ✓ | full-screen error with retry, plus inline banner |
| `analytics.tsx` | ✓ | ✓ | ✓ | |
| `inventory.tsx` | ✓ | ✓ | ✓ | one `errorMsg` banner serves 7,388 lines of tabs |
| `finance.tsx` → `FinanceScreen` | ✓ | ✓ | ✓ | handled inside each tab |
| `staff.tsx` | ✓ | ✓ | ✓ | |
| `branches.tsx` | ✓ | ✓ | ✓ | |
| `settings.tsx` | ✓ | **✗** | ✓ | B2 — printer load error dropped |
| `menu.tsx` (phone layout) | ✓ | **✗** | ✓ | B3 — three load errors dropped |
| `menu.tsx` (tablet → `MenuManagement`) | ✓ | ✓ | ✓ | |
| `kitchen.tsx` | — | — | — | static "coming soon" card |
| `billing.tsx`, `dashboard.tsx` | — | — | — | `PlaceholderScreen` |
| `(auth)/login.tsx` | ✓ | ✓ | — | |

Assessed by reading each screen's load path, not by grep alone. "Handled" means
a failed load produces something a cashier can read; it does not mean the
message is good (see R2).

## 5. Style

| Rule | Count | Where it concentrates |
| :--- | ---: | :--- |
| Colour literals outside `brand.ts` | 1,741 in 38 files | `inventory.tsx` 276, `orders.tsx` 254, `OrderPanel.tsx` 187, `PhoneAnalyticsScreen.tsx` 107 |
| — hex in a `className` (`bg-[#0066b2]`) | 307 | |
| — hex elsewhere (`style`, icon `color=`) | 1,322 | |
| — `rgb()` / `rgba()` | 83 | mostly shadows and overlays |
| — named (`"white"`) | 29 | |
| — marked by a nearby comment as deliberate | 9 | flagged `*` in Appendix B1 |
| Tailwind default-palette classes | 2,375 | `inventory.tsx` alone 1,395 |
| Inline `style` props | 1,305 | `inventory.tsx` 232, `orders.tsx` 196, `OrderPanel.tsx` 150 |
| `StyleSheet.create` | 4 | `_layout.tsx:580`, `branches.tsx:603`, `staff.tsx:606`, `menu.tsx:120` |
| Relative imports instead of `@/` | 162 | `use-orders-store.ts` 12, `FinanceScreen.tsx` 9 |
| Exported component without return type | 76 | everywhere |
| Env vars without `EXPO_PUBLIC_` | 9 | `approval.email.ts` SMTP ×5 (server-only, correct); `supabase.ts:13–21` falls back to `SUPABASE_URL` and **`NEXT_PUBLIC_*`** names left over from a Next.js past |
| `eslint-disable` | 1 | `CatalogTab.tsx:198` |

556 of the 1,741 literals are a value that **already has a token**: `#0066b2`
179 times, `#ffffff`/`#fff` 164, `#0f2744` 92, `#5b6b7c` 44, `#c5d9eb` 40,
`#e8f2fa` 37. Most of the rest is one grey ramp typed out by hand — `#64748b`
141, `#94a3b8` 94, `#e2e8f0` 72, `#475569` 51, `#f8fafc` 50 — which is
Tailwind's `slate`. **One fix clears about 70%:** add the slate ramp and
success/warning/danger pairs to `brand.ts` and `tailwind.config.js`, then
replace by value; `#0066b2` → `colors.primary` is mechanical and safe.

## 6. Recommended order of work

1. **B1** — add the status and branch filters to `fetchOpenOrders`. Small,
   testable, and the only finding here that can lose money. First check the
   project's "Max rows" setting and whether any `unpaid` order is already older
   than the newest 1,000.
2. **B4** — remove or gate the branch simulator before the next App Store
   submission; the reviewer can see it.
3. **B2, B3** — two load paths that drop their errors. Ten lines each.
4. **R2** — route the nine sites through one `toUserMessage(err, fallback)` that
   never returns `err.message`; fix the "Connection issue" catch-all in
   `orders.tsx:1916`.
5. **R1** — generated database types. The largest structural win, and it
   converts a class of silent runtime bugs into compile errors.
6. **R9** — `expo lint --fix`, delete unused imports, then make CI fail on
   warnings so the count stays at zero.
7. **R7** on `OrderPanel.tsx` and `orders.tsx` only; **R6** on `inventory.tsx`
   when that file is next opened — it is 7,388 lines and wants splitting first.
8. Style last, by value, a token at a time.

## 7. Rules that should change rather than be enforced

- **"Every Supabase query must include tenant_id AND branch_id."** Unmeetable:
  62 call sites target tables with no such column, and the shared menu, the
  inventory masters and the finance ledger are tenant-wide by design. A rule
  broken a hundred times for good reasons teaches people to ignore it.
  *Suggest:* every query filters by `tenant_id` where the table has one; by
  `branch_id` too unless the table is a tenant-wide catalogue or an owner asked
  for all branches, with a comment saying so; child tables are reached through
  a parent id fetched with both.
- **"Always filter `.eq('status', 'open')`."** The app has five active statuses
  (`open`, `draft`, `held`, `unpaid`, `in_kitchen`), so the literal rule is
  wrong and B1 shows what happens when a rule cannot be followed literally — it
  was not followed at all. *Suggest:* active-order fetches filter status **in
  the query**, never on the client, using one exported `ACTIVE_ORDER_STATUSES`.
- **"No hardcoded colors" / "NativeWind for all styling."** 5,400 violations,
  no behavioural consequence, and no lint rule behind either. Decide whether
  Tailwind's default palette counts as a token (if yes, 2,375 vanish), allow
  `style` for values NativeWind cannot express, and enforce the remainder with
  a lint rule or not at all.
- **"Production grade TypeScript" / return types.** Requiring `: JSX.Element` on
  76 components adds nothing the compiler does not infer. Keep the rule for
  service functions, where it is followed 152 times out of 153.
- **"Follow settlement-service.ts as reference architecture."** Point it at a
  file that is alive: `finance-service.ts` is the best-behaved service in the
  repository (typed readers instead of casts, consistent `ServiceResult`,
  no raw errors).
- **`PROJECT_CONTEXT.md`** still lists Tasks 3–13 as not started, names
  `session-context.ts` as the role source, and says admins see all branches.
  AGENTS.md tells every assistant to read it before every session.

## Appendix A — tenant-scoping call sites

Same scan as the RLS audit (branch `audit/rls-review`, not yet merged), same
commit. `**tenant**` marks the twelve that omit `tenant_id`.

### A1. Call sites with a filter genuinely absent (43)

| Location | Table | Op | Missing |
| :--- | :--- | :--- | :--- |
| `api/approval/verify-email/confirm.ts:92` | approval_email_verifications | update | **tenant**, branch |
| `api/approval/verify-email/confirm.ts:121` | approval_email_verifications | update | **tenant**, branch |
| `api/printers.ts:49` | printers | select | branch |
| `api/printjobs.ts:58` | printers | select | branch |
| `src/lib/approval/approval-service.ts:189` | approval_requests | select | branch |
| `src/lib/approval/approval-service.ts:218` | approval_requests | update | branch |
| `src/lib/pos/branch-service.ts:64` | branch_approval_settings | select | branch |
| `src/lib/pos/finance-ledger-service.ts:196` | finance_accounts | select | branch |
| `src/lib/pos/finance-service.ts:598` | expenses | select | branch |
| `src/lib/pos/finance-service.ts:693` | expenses | update | branch |
| `src/lib/pos/finance-service.ts:868` | bills | select | branch |
| `src/lib/pos/inventory-service.ts:661` | inventory_categories | select | branch |
| `src/lib/pos/inventory-service.ts:734` | inventory_units | select | branch |
| `src/lib/pos/inventory-service.ts:753` | inventory_units | select | branch |
| `src/lib/pos/inventory-service.ts:831` | inventory_suppliers | select | branch |
| `src/lib/pos/inventory-service.ts:851` | inventory_suppliers | select | branch |
| `src/lib/pos/inventory-service.ts:954` | inventory_materials | select | branch |
| `src/lib/pos/inventory-service.ts:1012` | inventory_materials | select | branch |
| `src/lib/pos/inventory-service.ts:1260` | inventory_materials | select | branch |
| `src/lib/pos/inventory-service.ts:1284` | inventory_materials | update | branch |
| `src/lib/pos/inventory-service.ts:1491` | inventory_materials | select | branch |
| `src/lib/pos/inventory-service.ts:1510` | inventory_materials | update | branch |
| `src/lib/pos/inventory-service.ts:1615` | inventory_materials | select | branch |
| `src/lib/pos/inventory-service.ts:1647` | inventory_materials | update | branch |
| `src/lib/pos/inventory-service.ts:1832` | inventory_suppliers | select | branch |
| `src/lib/pos/inventory-service.ts:1872` | inventory_wastage | select | branch |
| `src/lib/pos/inventory-service.ts:2574` | inventory_transfer_events | select | branch |
| `src/lib/pos/inventory-service.ts:3192` | inventory_materials | select | branch |
| `src/lib/pos/open-orders-service.ts:65` | products | select | branch |
| `src/lib/pos/products-service.ts:31` | categories | select | branch |
| `src/lib/pos/products-service.ts:66` | products | select | branch |
| `src/lib/pos/staff-service.ts:165` | staff | update | branch |
| `src/lib/pos/staff-service.ts:196` | staff | update | branch |
| `src/lib/pos/use-session-store.ts:71` | staff | select | **tenant**, branch |
| `src/lib/pos/use-session-store.ts:102` | branches | select | **tenant** |
| `src/lib/pos/use-session-store.ts:120` | branches | select | **tenant** |
| `src/lib/pos/use-session-store.ts:137` | pos_terminals | select | **tenant** |
| `src/lib/pos/use-session-store.ts:152` | staff | update | **tenant**, branch |
| `src/lib/pos/use-session-store.ts:222` | staff | select | **tenant**, branch |
| `src/lib/pos/use-session-store.ts:249` | branches | select | **tenant** |
| `src/lib/pos/use-session-store.ts:266` | branches | select | **tenant** |
| `src/lib/pos/use-session-store.ts:283` | pos_terminals | select | **tenant** |
| `src/lib/printer/printer-service.ts:708` | branches | select | **tenant** |

### A2. Branch filter applied conditionally on the following lines (23)

Owner "all branches" reporting: `if (scope.branch_id) q = q.eq('branch_id', …)`. Conforms in spirit; listed so the next scan can skip them.

`src/lib/analytics/analytics-service.ts:319` bills · `src/lib/pos/finance-service.ts:331` bills · `src/lib/pos/finance-service.ts:367` settlements · `src/lib/pos/finance-service.ts:390` expenses · `src/lib/pos/finance-service.ts:410` refunds · `src/lib/pos/finance-service.ts:438` inventory_purchase_headers · `src/lib/pos/finance-service.ts:727` expenses · `src/lib/pos/finance-service.ts:844` settlements · `src/lib/pos/finance-service.ts:1077` finance_day_closures · `src/lib/pos/inventory-service.ts:1115` inventory_material_stock_levels · `src/lib/pos/inventory-service.ts:1134` inventory_material_vendor_prices · `src/lib/pos/inventory-service.ts:1154` inventory_purchase_headers · `src/lib/pos/inventory-service.ts:1184` inventory_purchase_items · `src/lib/pos/inventory-service.ts:1414` inventory_stock_ledger · `src/lib/pos/inventory-service.ts:1446` inventory_adjustments · `src/lib/pos/inventory-service.ts:1582` inventory_wastage · `src/lib/pos/inventory-service.ts:1717` inventory_audit_logs · `src/lib/pos/inventory-service.ts:1774` inventory_alerts · `src/lib/pos/inventory-service.ts:1802` inventory_alerts · `src/lib/pos/inventory-service.ts:1847` inventory_purchase_headers · `src/lib/pos/inventory-service.ts:1860` inventory_purchase_items · `src/lib/pos/open-orders-service.ts:684` open_orders · `src/lib/pos/settlement-service.ts:26` settlements

### A3. Inserts whose payload is built above the call and carries both ids (19)

`src/lib/approval/approval-service.ts:119` approval_requests · `src/lib/pos/bill-service.ts:150` bills · `src/lib/pos/dev-seed.ts:128` categories · `src/lib/pos/dev-seed.ts:194` products · `src/lib/pos/dev-seed.ts:231` open_orders · `src/lib/pos/dev-seed.ts:380` bills · `src/lib/pos/finance-service.ts:669` expenses · `src/lib/pos/inventory-service.ts:693` inventory_categories · `src/lib/pos/inventory-service.ts:790` inventory_units · `src/lib/pos/inventory-service.ts:893` inventory_suppliers · `src/lib/pos/inventory-service.ts:1077` inventory_materials · `src/lib/pos/inventory-service.ts:1234` inventory_purchase_headers · `src/lib/pos/inventory-service.ts:1253` inventory_purchase_items · `src/lib/pos/inventory-service.ts:2821` inventory_recipes · `src/lib/pos/inventory-service.ts:3141` inventory_consumption_jobs · `src/lib/pos/menu-import-service.ts:257` products · `src/lib/pos/menu-service.ts:102` products · `src/lib/pos/open-orders-service.ts:846` open_orders · `src/lib/pos/printer-db-service.ts:105` printers

### A4. Tables that do not have the column, so the rule cannot be met (62)

`src/lib/analytics/analytics-service.ts:366` bill_items · `src/lib/pos/bill-service.ts:187` bill_items · `src/lib/pos/bill-service.ts:212` bill_items · `src/lib/pos/branch-service.ts:53` branches · `src/lib/pos/branch-service.ts:101` branches · `src/lib/pos/dev-seed.ts:289` open_order_items · `src/lib/pos/dev-seed.ts:394` bill_items · `src/lib/pos/finance-ledger-service.ts:212` finance_catalog · `src/lib/pos/finance-ledger-service.ts:228` finance_catalog · `src/lib/pos/finance-ledger-service.ts:255` finance_catalog · `src/lib/pos/finance-ledger-service.ts:276` finance_catalog · `src/lib/pos/finance-ledger-service.ts:295` finance_entries · `src/lib/pos/finance-ledger-service.ts:326` finance_rules · `src/lib/pos/finance-ledger-service.ts:353` finance_rules · `src/lib/pos/finance-ledger-service.ts:386` finance_entries · `src/lib/pos/finance-ledger-service.ts:431` finance_entries · `src/lib/pos/finance-ledger-service.ts:466` finance_entries · `src/lib/pos/finance-ledger-service.ts:481` finance_entries · `src/lib/pos/finance-ledger-service.ts:502` finance_entries · `src/lib/pos/finance-ledger-service.ts:520` finance_entry_revisions · `src/lib/pos/finance-service.ts:766` expense_categories · `src/lib/pos/finance-service.ts:804` expense_categories · `src/lib/pos/inventory-service.ts:1976` branches · `src/lib/pos/inventory-service.ts:1991` branches · `src/lib/pos/inventory-service.ts:2077` inventory_transfer_request_items · `src/lib/pos/inventory-service.ts:2136` inventory_transfer_request_items · `src/lib/pos/inventory-service.ts:2189` inventory_transfer_requests · `src/lib/pos/inventory-service.ts:2210` inventory_transfer_request_items · `src/lib/pos/inventory-service.ts:2303` inventory_transfer_requests · `src/lib/pos/inventory-service.ts:2512` inventory_dispatch_items · `src/lib/pos/inventory-service.ts:2524` inventory_dispatches · `src/lib/pos/inventory-service.ts:2536` inventory_transfer_request_items · `src/lib/pos/inventory-service.ts:2599` inventory_transfer_requests · `src/lib/pos/inventory-service.ts:2614` inventory_transfer_request_items · `src/lib/pos/inventory-service.ts:2625` inventory_transfer_requests · `src/lib/pos/inventory-service.ts:2636` inventory_dispatches · `src/lib/pos/inventory-service.ts:2647` inventory_dispatch_items · `src/lib/pos/inventory-service.ts:2744` inventory_recipes · `src/lib/pos/inventory-service.ts:2777` inventory_recipe_items · `src/lib/pos/inventory-service.ts:2832` inventory_recipe_items · `src/lib/pos/inventory-service.ts:2844` inventory_recipe_items · `src/lib/pos/inventory-service.ts:2860` inventory_recipes · `src/lib/pos/inventory-service.ts:3014` bill_items · `src/lib/pos/inventory-service.ts:3054` inventory_recipes · `src/lib/pos/inventory-service.ts:3071` inventory_recipes · `src/lib/pos/inventory-service.ts:3097` inventory_recipe_items · `src/lib/pos/kot-service.ts:148` kot_items · `src/lib/pos/kot-service.ts:184` open_order_items · `src/lib/pos/open-orders-service.ts:149` open_order_items · `src/lib/pos/open-orders-service.ts:585` open_order_items · `src/lib/pos/open-orders-service.ts:741` open_order_items · `src/lib/pos/open-orders-service.ts:887` open_order_items · `src/lib/pos/open-orders-service.ts:912` open_order_items · `src/lib/pos/open-orders-service.ts:933` open_order_items · `src/lib/pos/open-orders-service.ts:958` open_order_items · `src/lib/pos/open-orders-service.ts:985` open_order_items · `src/lib/pos/open-orders-service.ts:1131` open_order_items · `src/lib/pos/use-session-store.ts:94` tenants · `src/lib/pos/use-session-store.ts:112` branches · `src/lib/pos/use-session-store.ts:241` tenants · `src/lib/pos/use-session-store.ts:259` branches · `src/lib/server/api-auth.ts:219` branches

## Appendix B — style and component findings (machine-readable)

Generated from the TypeScript AST. One line per file; numbers are 1-indexed
source lines at commit `c00a4bc`. A later session can work through these
without re-scanning, but line numbers drift as soon as a file is edited —
fix a file top to bottom, or re-run the scan.

### B1. Hardcoded colour literals outside brand.ts — `file: line…`; `*` marks a line with a comment on or above it (likely deliberate) (1741)

```
src/app/(app)/_layout.tsx: 184 187 192 204 206 212 280 284 284 290 290 332 339 339 344 344 459 512 518 565 572 583 585 593 608 611 613 621 632 634 644 649 651 661
src/app/(app)/analytics.tsx: 450 459 515 756 777 799 849* 850 852* 853 855* 856 881 883 958 965 1069 1081 1082 1082 1126 1127 1134 1135 1326 1336 1350 1362 1362 1363 1363 1366 1366 1367 1367 1381 1381 1382 1382 1385 1385
src/app/(app)/branches.tsx: 265 297 306 311 340 347 356 365 373 381 390 402 404 413 423 425 436 455 459 469 472 472 473 473 491 502 503 517 518 518 519 520 530 530 530 536 538 543 543 545 590 604 616 618 623 629 634 639 646 647 648 652 657 658 664 666 670 672 675 679 682 689 702 703 705 714 717 721 724 732 739 740 742 743 750 755 757 758 759 766 768 774 775
src/app/(app)/index.tsx: 144 145 145 146 147 149 159 160 161 165 166 169 170 173 174 184 185 195 196 207 208 209 1312 1313 1320 1328 1331 1348 1350 1356 1361 1369 1374 1378 1384 1384 1385 1505 1532 1532 1533 1533 1533 1534 1534 1534 1547 1552 1561 1562 1564 1582 1584 1589 1598 1604 1604 1605 1620 1622 1623 1625 1626 1635 1638 1649 1649 1651 1651 1662 1666 1667 1670 1674 1675 1678 1679 1793 1793 1794
src/app/(app)/inventory.tsx: 239 240 247 251 252 253 254 259 264 267 267 297 308 319 1764 1773 1780 1794 1803 1803 1810 1819 1819 1830 1831 1838 1846 1854 1862 1884 1919 1987 1995 2003 2022 2033 2044 2091 2191 2204 2223 2266 2302 2343 2351 2359 2372 2453 2552 2558 2564 2596 2664 2678 2735 2738 2748 2759 2772 2783 2796 2802 2807 2823 2823 2836 2874 2901 2947 2973 2998 2998 3035 3038 3039 3062 3116 3140 3140 3143 3143 3151 3158 3174 3182 3184 3195 3198 3199 3206 3208 3215 3216 3221 3222 3227 3228 3235 3241 3242 3246 3253 3254 3255 3256 3257 3269 3272 3275 3278 3281 3293 3301 3302 3302 3307 3308 3309 3317 3318 3319 3326 3328 3354 3355 3368 3369 3377 3400 3407 3450 3479 3482 3563 3566 3593 3618 3621 3659 3661 3704 3749 3799 3876 3921 3936 3949 4001 4008 4026 4048 4060 4114 4124 4129 4130 4135 4179 4205 4213 4230 4247 4248 4252 4274 4281 4310 4311 4327 4433 4443 4495 4514 4533 4584 4733 4743 4885 4906 4932 4943 4968 4980 5043 5049 5061 5174 5203 5237 5255 5262 5273 5282 5346 5361 5441 5469 5469 5604 5610 5638 5644 5799 5799 5799 5805 5820 5824 5825 5855 5862 5869 5869 5873 5873 5875 5875 5897 5901 5903 5907 5909 5922 5931 5968 5975 5975 5982 5982 5986 5986 5988 5988 6031 6037 6043 6043 6047 6047 6049 6049 6063 6064 6073 6078 6080 6100 6115 6139 6150 6160 6205 6320 6391 6396 6450 6461 6491 6615 6618 6645 6651 6692 6751 6781 6881 6921 6927 7044 7050 7146 7152 7271 7277 7336 7342
src/app/(app)/kitchen.tsx: 53
src/app/(app)/menu.tsx: 123
src/app/(app)/orders.tsx: 165 694 708 709 709 710 713 719 719 720 838 841 841 852 855 870 872 878 879 886 886 890 898 899 906 906 917 918 925 925 940 949 957 957 958 959 961 961 962 963 965 965 966 967 969 969 970 971 978 978 979 984 988 993 1002 1012 1019 1037 1037 1038 1038 1041 1041 1053 1062 1063 1065 1074 1083 1084 1086 1102 1104 1112 1113 1135 1153 1153 1154 1154 1157 1157 1172 1172 1173 1173 1174 1174 1175 1175 1176 1176 1177 1177 1199 1199 1200 1207 1207 1208 1211 1223 1223 1226 1226 1227 1228 1229 1230 1231 1232 1233 1252 1252 1252 1255 1256 1263 1265 1266 1266 1271 1272 1279 1285 1287 1301 1301 1303 1307 1308 1310 1317 1317 1318 1318 1323 1326 1333 1335 1344 1344 1345 1361 1361 1362 1362 1366 1366 1371 1384 1384 1385 1385 1389 1389 1438 1447 1450 1454 1465 1483 1500 1501 1503 1507 1520 1526 1530 1531 1533 1535 1537 1544 1546 1547 1549 1551 1552 1577 1584 1592 1598 1631 1632 1634 1634 1637 1638 1639 1648 1648 1662 1663 1670 1670 1673 1695 1696 1703 1703 1706 1728 1729 1736 1736 1739 1754 1755 1762 1762 1765 1791 1792 1794 1794 1797 1798 1799 1808 1808 1826 1827 1837 1837 1840 1865 1866 1868 1868 1872 1888 1888 1891 1940 1940 1941 1961 1961 1972 1975 1989 1991 1997 1998 2032 2032 2037 2038 2039 2060 2062 2062 2068
src/app/(app)/settings.tsx: 199 212 217 260 260 261 261 289 289 290 290 308 311 330 340 341 348 356 364 369 396 396 400 429 435 441 502 517 520 520 531 544 570
src/app/(app)/staff.tsx: 73 74 75 76 77 78 242 277 286 294 320 326 332 338 347 353 359 360 380 398 417 417 433 443 445 456 512 530 547 560 572 607 619 621 626 628 633 639 644 649 656 657 658 663 671 676 677 683 685 689 691 694 698 701 707 717 719 720 731 732 735 736 738 739 740 752 753 755 764 767 773 776 789 790 801 803 810 812 816 816 817 817 820 821
src/app/(auth)/login.tsx: 96 114 147
src/app/_layout.tsx: 82 88
src/components/approval/ApprovalCodeDialog.tsx: 96 108 149 151 151 184
src/components/approval/ReasonDialog.tsx: 57 59 80 102 133
src/components/inventory/InventoryCharts.tsx: 9* 10 11 12 13
src/components/inventory/InventoryMobileMenu.tsx: 10 11 12 36 37 63 108 121
src/components/inventory/InventoryNotificationsModal.tsx: 9* 10 11 12 13 14 15 16 17 18 19 20 21 66 77
src/components/inventory/InventorySidebar.tsx: 30* 30* 30* 31 31 32 33 34 35 36 37 209 215 258 335 357 390 397 397 456 467 471 471
src/components/inventory/RecipeManagement.tsx: 104 105 106 107 113 114 115 116 122 123 124 125 130 131 132 133 218 221 244 247 248 262 267 272 279 287 300 313 314 314 317 321 915 951 988 1043 1057 1085 1100 1122 1123 1128 1147 1207 1213 1253 1264 1278 1289 1310 1320 1325 1380 1395 1432 1481 1483 1517 1534 1543 1544 1545 1553 1554 1560 1580 1591 1591 1591 1592 1592 1592 1597 1701 1711 1716 1722 1738 1739 1744 1760 1766 1772 1794 1796 1798 1799 1828 1900
src/components/orders/OrderCard.tsx: 22 22 25 25 27 27 30 30 32 32 36 36 101 130 130 135 141 167 178 180 186 191 208 222 226 248 251 252 256 260 261 266 267
src/components/phone/PhoneAnalyticsScreen.tsx: 220 229 234 255 256 265 266 291 292 300 302 314 323 357 359 361 362 368 370 372 373 379 381 383 384 390 392 394 395 403 406 407 411 429 439 440 445 458 461 464 467 475 486 492 492 502 510 516 517 520 533 533 533 533 538 542 545 563 566 569 571 581 581 588 591 596 605 611 612 615 620 620 621 623 625 635 647 650 654 660 677 678 679 687 693 709 709 710 710 717 722 722 734 746 746 747 747 753 754 756 771 771 772 772 778 779 781
src/components/phone/PhoneInventoryScreen.tsx: 70 73 75 80 83 85 92 95 97 102 105 107 130 131 138 150 156 158 161 185 190 192 195 215 215 217 223 234 234 239
src/components/phone/PhoneMenuScreen.tsx: 202 206 215 224 236 236 237 237 253 254 262 270 270 272 279 281 281 282 284 286 296 307 308 308 313 328 328 328 333 347 359 378 380 383 385 395 411 413 413 413 415 423 424 424 425 427 429 439 449 449 450 450 453 456 471 472 479 479 480 480 506 530 540 540 541 541 551 557 557 560
src/components/phone/PhoneOrdersScreen.tsx: 114 117 119 119 123 125 125 139 139 141 143 161 161 163 173 174 179 180 188 189 190 192 193 194 196 200 200 201 202 210 213 214 215 220 221 223 229 235 236 238 244 245 264 265 287 288 297 302 314 315 316 319 320 322 323 329 330 331 336 340 341 343 348 351 352 356 357 362 365 367 368 373 375 376 381 383 384 389 391
src/components/phone/PhonePOSScreen.tsx: 83 86 96 99 101 102 106 109 109 114 116 121 128 140 142 160 162 181 183 187 189 214 216 256 260 261 267 269 270 272 273 274 277 298 299 299 300 302 304 312 318 318 319 322 332 332 333 336 351 354 366 381 395
src/components/phone/PhoneScreenHeader.tsx: 29
src/components/pos/CategoryTabs.tsx: 61 61 61 82 108 108 112 125 163 178
src/components/pos/OrderPanel.tsx: 339 339 341 342 345 346 350 354 359 359 360 367 377 383 384 393 395 398 405 407 422 424 425 427 438 438 446 446 446 448 448 450 450 456 456 456 458 458 467 467 484 490 491 503 505 508 515 517 531 533 534 536 547 547 555 555 555 557 557 559 559 565 565 565 567 567 576 576 585 587 596 600 603 604 611 621 623 641 641 643 643 646 646 661 663 663 680 685 690 699 701 701 707 719 724 743 749 758 759 765 768 775 776 783 784 790 791 813 814 814 816 817 817 820 833 834 840 847 851 872 873 873 875 876 876 879 892 893 899 906 910 931 932 932 934 935 935 938 951 952 958 965 969 982 989 989 990 990 997 998 1004 1011 1015 1032 1032 1033 1036 1048 1053 1053 1056 1065 1070 1070 1073 1087 1087 1092 1092 1096 1096 1110 1110 1115 1115 1119 1119 1131 1131 1136 1136 1140 1140 1154 1154 1158 1158
src/components/pos/ProductCard.tsx: 40 58 58 65 71
src/components/pos/SettlementModal.tsx: 252 273 273 274 274 277 279 290 290 308 309 315 333 334 344 344 348 355
src/components/pos/Sidebar.tsx: 196 235 235 235 248 270 271 311 317 323 323 345 373 374 385 394 396
src/components/pos/sidebar/SidebarBackground.tsx: 8 8 8
src/components/pos/sidebar/SidebarItem.tsx: 21 21 82* 84 84
src/components/pos/sidebar/SidebarLogoSection.tsx: 26 26
src/components/settings/ApprovalPoliciesScreen.tsx: 117 131 149 165 172 172 177 180 202 206 219 226 235 256 256 257 257 304 304 305 305
src/components/settings/MenuManagement.tsx: 182 183 227 235 807 816 825 848 860 872 897 1054 1055 1105 1117 1167 1168 1228 1234 1299 1329 1445 1448 1474 1489 1501 1514 1515 1562 1598 1617 1625 1625 1662 1662 1678 1679
src/components/ui/DatePickerModal.tsx: 199 203 237 240 281
src/components/ui/SearchableDropdown.tsx: 87 93 94 94 95 100 101 107 121 143 143 145 148 148 151
```

### B2. `ScrollView` wrapping `.map()` — `h` marks a horizontal strip (60)

```
src/app/(app)/branches.tsx: 319
src/app/(app)/index.tsx: 1415
src/app/(app)/inventory.tsx: 2385h 2408h 2870 3251h 3259 3421 3698 3754 3804 4142h 5833 6209 6324 6398 6504h 6519 6932 6998 7055 7058 7086 7103 7157 7160 7216
src/app/(app)/settings.tsx: 270h 302
src/app/(app)/staff.tsx: 302
src/components/finance/CatalogTab.tsx: 415
src/components/finance/EntryFormModal.tsx: 236
src/components/finance/ExpenseFormModal.tsx: 148
src/components/finance/ExpensesTab.tsx: 192h 202h
src/components/finance/FinanceFilterBar.tsx: 67h 91h
src/components/finance/FinanceOverviewTab.tsx: 126
src/components/finance/LedgerTab.tsx: 864
src/components/finance/SettleEntryModal.tsx: 117
src/components/inventory/InventoryMobileMenu.tsx: 76
src/components/inventory/InventorySidebar.tsx: 290
src/components/inventory/RecipeManagement.tsx: 293 880 1052 1141 1218
src/components/phone/PhoneAnalyticsScreen.tsx: 239 691
src/components/phone/PhoneMenuScreen.tsx: 302h 399
src/components/phone/PhoneOrdersScreen.tsx: 132h 154h 327
src/components/phone/PhonePOSScreen.tsx: 313h
src/components/pos/OrderPanel.tsx: 370
src/components/pos/Sidebar.tsx: 279
src/components/settings/ApprovalPoliciesScreen.tsx: 140
src/components/settings/MenuManagement.tsx: 1480
src/components/ui/DatePickerModal.tsx: 207
```

### B3. `Pressable` with an explicit height under 44px and no `hitSlop` — `line(px)` (137)

```
src/app/(app)/analytics.tsx: 1094(32) 1101(32) 1304(40)
src/app/(app)/index.tsx: 1539(34) 1571(34) 1642(26)
src/app/(app)/inventory.tsx: 2548(24) 2554(24) 2560(24) 2603(26) 2617(26) 2633(26) 2940(28) 2980(28) 2994(28) 3008(28) 3177(8) 3489(20) 3498(20) 3917(32) 4104(40) 4143(36) 4157(36) 4367(40) 4384(40) 4451(40) 4462(40) 4473(40) 4796(40) 4809(40) 5039(32) 5045(32) 5600(32) 5606(32) 5634(32) 5640(32) 5835(40) 5882(40) 5947(32) 6010(40) 6096(40) 6111(40) 6681(38) 6740(38) 6770(38) 6870(38)
src/app/(app)/orders.tsx: 859(36) 891(1) 910(1) 997(36) 1443(12) 1488(30) 1615(40) 1653(40) 1686(40) 1712(40) 1745(40) 1777(40) 1813(40) 1853(40) 1878(40) 1979(36) 2023(30) 2047(30)
src/app/(app)/settings.tsx: 452(36) 511(36) 526(36)
src/components/approval/ApprovalCodeDialog.tsx: 103(32)
src/components/approval/ReasonDialog.tsx: 75(32)
src/components/finance/CatalogTab.tsx: 214(40)
src/components/inventory/InventoryMobileMenu.tsx: 93(40) 113(32)
src/components/inventory/InventoryNotificationsModal.tsx: 67(8)
src/components/inventory/InventorySidebar.tsx: 318(40) 369(32)
src/components/inventory/RecipeManagement.tsx: 200(40) 237(8) 1203(32) 1387(36) 1428(32) 1512(32) 1529(32) 1696(34)
src/components/phone/PhoneAnalyticsScreen.tsx: 226(40) 680(36)
src/components/phone/PhoneMenuScreen.tsx: 303(34) 324(34) 389(32) 444(38)
src/components/phone/PhonePOSScreen.tsx: 110(40) 117(40) 314(36) 327(36)
src/components/pos/CategoryTabs.tsx: 172(36)
src/components/pos/OrderPanel.tsx: 402(28) 443(24) 453(24) 512(28) 552(24) 562(24) 589(36) 732(36) 977(4) 1027(40) 1044(6) 1061(6) 1082(38) 1105(38) 1126(38) 1149(38)
src/components/settings/ApprovalPoliciesScreen.tsx: 161(42) 169(42) 197(38)
src/components/settings/MenuManagement.tsx: 84(30) 239(26) 255(30) 266(30) 787(32) 802(34) 811(34) 820(34) 912(34) 960(34) 1001(34) 1080(30) 1238(26) 1255(30) 1264(30) 1423(36) 1434(36) 1528(34) 1551(36) 1582(36) 1591(36) 1620(10)
src/components/ui/DatePickerModal.tsx: 165(36)
src/components/ui/SearchableDropdown.tsx: 130(40)
```

### B4. `StyleSheet.create` (4)

```
src/app/(app)/_layout.tsx: 580
src/app/(app)/branches.tsx: 603
src/app/(app)/menu.tsx: 120
src/app/(app)/staff.tsx: 606
```

### B5. Relative imports instead of `@/` (non-test) (162)

```
src/app/(app)/branches.tsx: 40
src/app/(app)/inventory.tsx: 143
src/app/(app)/settings.tsx: 15
src/app/_layout.tsx: 1
src/components/approval/ApprovalCodeDialog.tsx: 5
src/components/approval/ApprovalDialogContainer.tsx: 2 3
src/components/finance/CashBookTab.tsx: 10 11
src/components/finance/CatalogTab.tsx: 22
src/components/finance/DayCloseTab.tsx: 23
src/components/finance/ExpensesTab.tsx: 19 20
src/components/finance/FinanceOverviewTab.tsx: 26 27 28
src/components/finance/FinanceRulesCard.tsx: 8
src/components/finance/FinanceScreen.tsx: 18 19 20 21 22 23 24 25 26
src/components/finance/LedgerTab.tsx: 49 50 51
src/components/finance/PhoneFinanceScreen.tsx: 13 14 15 16 17 18 19 20
src/components/inventory/InventoryMobileMenu.tsx: 7 8
src/components/inventory/InventorySidebar.tsx: 24
src/components/pos/sidebar/SidebarNavigation.tsx: 3
src/components/settings/ApprovalPoliciesScreen.tsx: 15
src/components/settings/MenuManagement.tsx: 9
src/lib/approval/ApprovalContext.tsx: 4 5
src/lib/approval/approval-policy-defaults.ts: 1
src/lib/approval/approval-service.ts: 9
src/lib/approval/approval.email.ts: 2
src/lib/approval/approval.service.ts: 10
src/lib/approval/use-approval-flow.ts: 2
src/lib/pos/api-client.ts: 9
src/lib/pos/bill-service.ts: 1 2 3 4 5 6
src/lib/pos/branch-access.ts: 1
src/lib/pos/branch-service.ts: 1 2
src/lib/pos/dev-seed.ts: 1 2 3
src/lib/pos/finance-ledger-service.ts: 10 11 12 13 32
src/lib/pos/finance-ledger-utils.ts: 8 9 27 28
src/lib/pos/finance-service.ts: 14 15 16 17 18 36
src/lib/pos/finance-utils.ts: 5 6 7 22
src/lib/pos/inventory-service.ts: 1 2
src/lib/pos/kot-service.ts: 1 2 3 4 5
src/lib/pos/material-import-service.ts: 1 14
src/lib/pos/menu-import-service.ts: 1 2 3 4 5 6
src/lib/pos/menu-service.ts: 1 2 3 4
src/lib/pos/open-orders-service.ts: 1 2 3 4 5 6
src/lib/pos/order-utils.ts: 1
src/lib/pos/pos-settings-service.ts: 1 2 3
src/lib/pos/printer-db-service.ts: 1 2 3
src/lib/pos/printer-service.ts: 1 2
src/lib/pos/products-service.ts: 1 2 3 4
src/lib/pos/settlement-service.ts: 1 2
src/lib/pos/staff-service.ts: 1 2 3 4
src/lib/pos/startup-error-guard.ts: 4
src/lib/pos/supabase.ts: 5 6
src/lib/pos/tab-config.ts: 19
src/lib/pos/tenant-context.ts: 1 2 3
src/lib/pos/use-finance-store.ts: 11 27 43
src/lib/pos/use-ledger-store.ts: 11 31 47
src/lib/pos/use-orders-store.ts: 3 4 5 25 35 36 37 38 39 40 41 42
src/lib/pos/use-session-store.ts: 2 3 4
src/lib/pos/use-supabase-auto-refresh.ts: 4
src/lib/printer/printer-service.ts: 2 3 4 5 6 7
src/services/printService.ts: 5
```

### B6. Exported React components without an explicit return type — `line:Name` (76)

```
src/app/(app)/_layout.tsx: 360:AppTabLayout
src/app/(app)/analytics.tsx: 59:AnalyticsScreen
src/app/(app)/billing.tsx: 3:BillingScreen
src/app/(app)/branches.tsx: 68:BranchesScreen
src/app/(app)/dashboard.tsx: 3:DashboardScreen
src/app/(app)/finance.tsx: 8:Finance
src/app/(app)/index.tsx: 241:PosBillingScreen
src/app/(app)/inventory.tsx: 358:InventoryScreen
src/app/(app)/kitchen.tsx: 8:KitchenScreen
src/app/(app)/menu.tsx: 17:MenuScreen
src/app/(app)/orders.tsx: 175:OrdersScreen
src/app/(app)/settings.tsx: 20:SettingsScreen
src/app/(app)/staff.tsx: 83:StaffScreen
src/app/(auth)/_layout.tsx: 5:AuthLayout
src/app/(auth)/login.tsx: 19:LoginScreen
src/app/_layout.tsx: 20:RootLayout
src/components/approval/ApprovalCodeDialog.tsx: 15:ApprovalCodeDialog
src/components/approval/ApprovalDialogContainer.tsx: 27:ApprovalDialogContainer
src/components/approval/ReasonDialog.tsx: 15:ReasonDialog
src/components/finance/CashBookTab.tsx: 19:CashBookTab
src/components/finance/CatalogTab.tsx: 45:CatalogTab
src/components/finance/DayCloseTab.tsx: 29:DayCloseTab
src/components/finance/EntryFormModal.tsx: 51:EntryFormModal
src/components/finance/ExpenseFormModal.tsx: 35:ExpenseFormModal
src/components/finance/ExpensesTab.tsx: 26:ExpensesTab
src/components/finance/FinanceCharts.tsx: 20:RevenueExpenseBars 129:DonutChart 183:HorizontalBars
src/components/finance/FinanceFilterBar.tsx: 51:FinanceFilterBar
src/components/finance/FinanceKpiCard.tsx: 26:FinanceKpiCard
src/components/finance/FinanceOverviewTab.tsx: 41:FinanceOverviewTab
src/components/finance/FinanceRulesCard.tsx: 25:FinanceRulesCard
src/components/finance/FinanceScreen.tsx: 33:FinanceScreen
src/components/finance/FinanceStateViews.tsx: 10:FinanceLoadingView 21:FinanceErrorView 53:FinanceEmptyView 81:FinanceSchemaNotice 131:FinanceSectionCard
src/components/finance/FinanceTabBar.tsx: 39:FinanceTabBar
src/components/finance/LedgerTab.tsx: 72:LedgerTab
src/components/finance/PhoneFinanceScreen.tsx: 39:PhoneFinanceScreen
src/components/finance/SettleEntryModal.tsx: 35:SettleEntryModal
src/components/inventory/InventoryCharts.tsx: 15:Sparkline 59:CircularProgress 109:ProcurementLineChart 198:WastageDonutChart
src/components/inventory/InventoryMobileMenu.tsx: 47:InventoryMobileMenu
src/components/inventory/InventoryNotificationsModal.tsx: 58:InventoryNotificationsModal
src/components/inventory/InventorySidebar.tsx: 99:SidebarDecoration 109:SidebarLabel 164:InventorySidebar
src/components/inventory/RecipeManagement.tsx: 417:RecipeManagement
src/components/layout/PlaceholderScreen.tsx: 8:PlaceholderScreen
src/components/phone/PhoneAnalyticsScreen.tsx: 125:PhoneAnalyticsScreen
src/components/phone/PhoneInventoryScreen.tsx: 56:PhoneInventoryScreen
src/components/phone/PhoneMenuScreen.tsx: 64:PhoneMenuScreen
src/components/phone/PhoneOrdersScreen.tsx: 81:PhoneOrdersScreen
src/components/phone/PhonePOSScreen.tsx: 76:PhonePOSScreen
src/components/phone/PhoneScreenHeader.tsx: 16:PhoneScreenHeader
src/components/phone/PhoneWebFrame.tsx: 29:PhoneWebFrame
src/components/pos/BrandedGradient.tsx: 15:BrandedGradient
src/components/pos/CategoryTabs.tsx: 45:CategoryTabs
src/components/pos/OrderPanel.tsx: 62:OrderPanel
src/components/pos/SettlementModal.tsx: 25:SettlementModal
src/components/pos/Sidebar.tsx: 149:Sidebar
src/components/pos/sidebar/SidebarBackground.tsx: 5:SidebarBackground 16:SidebarDecoration
src/components/pos/sidebar/SidebarItem.tsx: 73:SidebarItem
src/components/pos/sidebar/SidebarLogoSection.tsx: 6:SidebarLogoSection
src/components/pos/sidebar/SidebarNavigation.tsx: 17:SidebarNavigation
src/components/settings/ApprovalPoliciesScreen.tsx: 17:ApprovalPoliciesScreen
src/components/settings/MenuManagement.tsx: 281:MenuManagement
src/components/ui/DatePickerModal.tsx: 28:DatePickerModal
src/components/ui/SearchSelect.tsx: 29:SearchSelect
src/components/ui/SearchableDropdown.tsx: 19:SearchableDropdown
src/lib/approval/ApprovalContext.tsx: 27:ApprovalProvider
```

### B7. Supabase calls outside a `*-service.ts` file (28)

```
src/lib/pos/dev-seed.ts: 92 127 193 206 230 242 289 295 304 379 394 398
src/lib/pos/use-orders-store.ts: 329
src/lib/pos/use-session-store.ts: 70 93 101 111 119 136 151 221 240 248 258 265 282
src/lib/server/api-auth.ts: 173 237
```

### B8. Hardcoded UUIDs outside tenant-context.ts (17)

```
src/app/(app)/inventory.tsx: 730 4368 4370 4378 4385 4387 4395 4407 4427 4797 4799 4805 4810 4812 4818
src/lib/pos/session-context.ts: 103 104
```

### B9. Counts only — Tailwind default-palette classes and inline `style` props, per file

```
src/app/(app)/_layout.tsx: palette=0 inlineStyle=23
src/app/(app)/analytics.tsx: palette=47 inlineStyle=21
src/app/(app)/branches.tsx: palette=0 inlineStyle=66
src/app/(app)/index.tsx: palette=0 inlineStyle=65
src/app/(app)/inventory.tsx: palette=1395 inlineStyle=232
src/app/(app)/kitchen.tsx: palette=0 inlineStyle=2
src/app/(app)/menu.tsx: palette=0 inlineStyle=2
src/app/(app)/orders.tsx: palette=0 inlineStyle=196
src/app/(app)/settings.tsx: palette=136 inlineStyle=13
src/app/(app)/staff.tsx: palette=0 inlineStyle=64
src/app/(auth)/login.tsx: palette=5 inlineStyle=3
src/app/_layout.tsx: palette=0 inlineStyle=3
src/components/approval/ApprovalCodeDialog.tsx: palette=20 inlineStyle=0
src/components/approval/ReasonDialog.tsx: palette=20 inlineStyle=1
src/components/finance/CashBookTab.tsx: palette=0 inlineStyle=4
src/components/finance/CatalogTab.tsx: palette=6 inlineStyle=14
src/components/finance/DayCloseTab.tsx: palette=6 inlineStyle=11
src/components/finance/EntryFormModal.tsx: palette=7 inlineStyle=12
src/components/finance/ExpenseFormModal.tsx: palette=6 inlineStyle=14
src/components/finance/ExpensesTab.tsx: palette=9 inlineStyle=17
src/components/finance/FinanceCharts.tsx: palette=0 inlineStyle=3
src/components/finance/FinanceFilterBar.tsx: palette=2 inlineStyle=2
src/components/finance/FinanceKpiCard.tsx: palette=1 inlineStyle=2
src/components/finance/FinanceOverviewTab.tsx: palette=0 inlineStyle=4
src/components/finance/FinanceRulesCard.tsx: palette=1 inlineStyle=2
src/components/finance/FinanceScreen.tsx: palette=0 inlineStyle=3
src/components/finance/FinanceStateViews.tsx: palette=2 inlineStyle=6
src/components/finance/FinanceTabBar.tsx: palette=1 inlineStyle=1
src/components/finance/LedgerTab.tsx: palette=15 inlineStyle=31
src/components/finance/PhoneFinanceScreen.tsx: palette=3 inlineStyle=7
src/components/finance/SettleEntryModal.tsx: palette=5 inlineStyle=10
src/components/inventory/InventoryCharts.tsx: palette=5 inlineStyle=2
src/components/inventory/InventoryMobileMenu.tsx: palette=1 inlineStyle=17
src/components/inventory/InventoryNotificationsModal.tsx: palette=0 inlineStyle=22
src/components/inventory/InventorySidebar.tsx: palette=0 inlineStyle=36
src/components/inventory/RecipeManagement.tsx: palette=137 inlineStyle=66
src/components/orders/OrderCard.tsx: palette=0 inlineStyle=24
src/components/phone/PhoneAnalyticsScreen.tsx: palette=44 inlineStyle=15
src/components/phone/PhoneInventoryScreen.tsx: palette=22 inlineStyle=0
src/components/phone/PhoneMenuScreen.tsx: palette=47 inlineStyle=0
src/components/phone/PhoneOrdersScreen.tsx: palette=14 inlineStyle=0
src/components/phone/PhonePOSScreen.tsx: palette=28 inlineStyle=12
src/components/phone/PhoneScreenHeader.tsx: palette=1 inlineStyle=5
src/components/phone/PhoneWebFrame.tsx: palette=0 inlineStyle=2
src/components/pos/CategoryTabs.tsx: palette=5 inlineStyle=0
src/components/pos/OrderPanel.tsx: palette=1 inlineStyle=150
src/components/pos/ProductCard.tsx: palette=0 inlineStyle=6
src/components/pos/SettlementModal.tsx: palette=0 inlineStyle=9
src/components/pos/Sidebar.tsx: palette=0 inlineStyle=36
src/components/pos/sidebar/SidebarBackground.tsx: palette=5 inlineStyle=0
src/components/pos/sidebar/SidebarItem.tsx: palette=3 inlineStyle=0
src/components/pos/sidebar/SidebarLogoSection.tsx: palette=2 inlineStyle=2
src/components/settings/ApprovalPoliciesScreen.tsx: palette=59 inlineStyle=0
src/components/settings/MenuManagement.tsx: palette=256 inlineStyle=59
src/components/ui/DatePickerModal.tsx: palette=52 inlineStyle=0
src/components/ui/KeyboardAvoider.tsx: palette=0 inlineStyle=1
src/components/ui/SearchSelect.tsx: palette=4 inlineStyle=4
src/components/ui/SearchableDropdown.tsx: palette=2 inlineStyle=3
```
