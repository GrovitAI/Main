# FINANCE_MODULE.md — Grovit Finance

> **Status**: built, tested, and **not wired into navigation**.
> **Last Updated**: 2026-09-07

The finance module is complete as a standalone unit: data layer, business
logic, state, and UI for tablet/desktop and phone. It is deliberately not
registered as a route or a tab, so it cannot affect the POS, orders, kitchen or
inventory work happening elsewhere in the app.

---

## 1. What it does

Four tabs, all scoped by date range and branch.

| Tab | Answers |
| :--- | :--- |
| **Overview** | What did we earn, what did we spend, what is left? KPI grid, cash-basis P&L, revenue vs expenses per business day, payment split, expenses by category, cash position. |
| **Expenses** | Record and review money going out. Create, edit, void (never delete), filter by category, payment method and free text, paginate, export the page to CSV on web. |
| **Cash Book** | Every money movement in order: settlements in, expenses and refunds out, grouped under business-day headers with running totals. |
| **Day Close** | Reconcile the till. Opening float plus cash sales minus cash refunds and cash expenses gives the expected cash; the user enters the counted cash and the variance is classified as balanced, surplus or shortage. Saves a draft or closes the day. |

Money is never invented. Revenue comes from `settlements` rows attached to
paid, non-complimentary bills. Complimentary bills are reported separately as
food value given away, exactly as the analytics RPCs already treat them.

---

## 2. Files

### Logic (`src/lib/pos/`)

| File | Role |
| :--- | :--- |
| `finance-types.ts` | Every contract in the module. No logic. |
| `finance-utils.ts` | Pure functions: Indian money formatting, business-date presets, expense validation, P&L, daily series, ledger totals, day-close arithmetic, CSV. Paise conversion is re-exported from `money-utils.ts` so finance rounds identically to `settle_order()`. |
| `finance-service.ts` | All Supabase access. Every function is try/catch, returns `ServiceResult<T>`, filters on `tenant_id` (and `branch_id` unless the caller is an owner/admin viewing all branches), and never leaks a raw database error. |
| `use-finance-store.ts` | Zustand store. Owns filters, per-area loading and error state, and request sequencing so a slow response cannot overwrite a newer one. |

### UI (`src/components/finance/`)

`FinanceScreen.tsx` is the entry point. It picks the desktop layout or
`PhoneFinanceScreen.tsx` from `useResponsive()`. The tab bodies
(`FinanceOverviewTab`, `ExpensesTab`, `CashBookTab`, `DayCloseTab`) are shared
by both and take a `compact` flag. `FinanceStateViews`, `FinanceKpiCard`,
`FinanceCharts`, `FinanceFilterBar` and `FinanceTabBar` are the building blocks.
`ExpenseFormModal` is the create/edit form.

Every list uses `FlatList`, every touchable is a `Pressable` at least 44px
tall, colours come from `brand.ts`, and loading, error and empty states are
handled on all four tabs.

---

## 3. Wiring it into the app later

Three steps, none of which the module does for itself:

1. Create `src/app/(app)/finance.tsx`:
   ```tsx
   import { FinanceScreen } from '@/components/finance/FinanceScreen';

   export default function Finance() {
     return <FinanceScreen />;
   }
   ```
2. Add `'finance'` to `APP_TAB_ROUTE_NAMES` and `TAB_ROUTE_MAP` in
   `src/lib/pos/tab-config.ts` and `src/app/(app)/_layout.tsx`.
3. Add the tab entry to the role arrays that should see it. Finance is a
   management screen, so owner, admin and manager, not cashier or kitchen.

The existing `expenses.tsx` placeholder route can then be pointed at the
Expenses tab or removed.

---

## 4. Database

The module reads `bills`, `settlements`, `expenses`,
`inventory_purchase_headers` and `refunds`, all of which already exist.

`expenses` today has only `id, tenant_id, branch_id, amount, category,
description, date, created_by, created_at`, and `refunds` is an empty shell
with `id, tenant_id, branch_id, bill_id, created_at`.

`supabase/migrations/20260907010000_finance_module.sql` closes that gap.

### Applied 2026-09-07

Applied to project `pyikrlqduampooncpzri` in one transaction, after a dry run
in a rolled-back transaction confirmed every statement executes. Verified after
commit:

- `expenses` gained its 11 new columns, `refunds` its 8.
- `expense_categories` created and seeded with 18 categories.
- `finance_day_closures` created, empty.
- `get_finance_summary` and `get_finance_daily_series` created, and the summary
  cross-checks exactly against a manual aggregation (2,369 bills,
  ₹10,05,212.30 collected over 30 days).

No existing business data was touched. The only writes in the file target
`expenses` and `refunds`, both of which were empty, plus inserts into the new
category table. The file contains no `INSERT`/`UPDATE`/`DELETE` against
`bills`, `bill_items`, `settlements`, `open_orders`, `products` or `kots`.

### Row level security is still pending

Section 6 was **skipped**, because it installs policies only when the `auth_*`
helpers from `20260907000100_rls_policies.sql` exist, and that migration has not
been applied. So `expense_categories`, `finance_day_closures` and `refunds`
currently have **no row level security**, consistent with every other table in
this database — the anon key can still read all bills, so audit item C1 remains
open.

**After applying `20260907000100_rls_policies.sql`, re-run this finance
migration** to install the finance policies. It is idempotent and changes no
data on a second run.

As of 2026-09-07 the other six migrations in `supabase/migrations/` are still
unapplied, including the atomic `settle_order` RPC and the RLS policies.

| Change | Why |
| :--- | :--- |
| `expenses` gains payment method, payee, reference, notes, receipt URL, void status with reason, paired `amount_paise`, `updated_at`, two indexes and a write trigger | Cash-versus-bank reporting, an audit trail instead of deletes, and float-free totals |
| `expense_categories` (new, tenant-wide, seeded with 18 restaurant defaults) | Consistent categories across branches instead of free text |
| `refunds` gains amount, method, reason, status | Refunds currently cannot reduce net revenue because there is nowhere to store the amount |
| `finance_day_closures` (new) | One reconciliation row per branch per business date |
| `get_finance_summary`, `get_finance_daily_series` | Server-side aggregation, so totals are never truncated by the PostgREST 1,000-row cap |
| RLS on the three affected tables | `refunds` was not covered by the base RLS migration |

### Running without the migration

`detectFinanceSchema()` probes what exists and the module degrades instead of
breaking:

- Totals are computed on the device by paging through the base tables. Accurate,
  just slower, and the Overview tab says so.
- Expenses save against the base columns only.
- Voiding an expense, custom categories and saving a day close are disabled with
  an explanation. Day-close **figures** are still live and correct.

A banner at the top of the module names exactly which features are waiting on
the migration.

---

## 5. Business rules this module follows

- **Business day**: 02:30 to 02:30 IST via `reporting-utils.ts`, evaluated in
  Asia/Kolkata regardless of device timezone. A settlement at 01:00 belongs to
  the previous day, on every screen here.
- **Revenue is what was collected**: settlement rows, not bill totals, so a bill
  settled across cash and UPI splits correctly.
- **Complimentary is not revenue**: excluded from sales and payment split,
  reported separately as `complimentaryValue`.
- **Expenses are soft-voided**, never deleted, and voided rows leave every total.
- **Integer paise everywhere**: sums go through `toPaise`/`fromPaise` from
  `money-utils.ts`, never float addition.
- **Branch scoping**: owners and admins may view all branches or pick one;
  every other role is pinned to their own branch by the service layer,
  regardless of what the UI requests. Day close always requires a specific
  branch because cash is counted per till.

---

## 6. Tests

```bash
npx jest src/lib/pos/__tests__/finance-utils.test.ts
npx jest src/components/finance
```

27 logic tests cover money formatting, business-day preset anchoring, expense
validation, category grouping, P&L, the daily series (including two settlements
on one bill counting as one order), ledger totals, day-close arithmetic and CSV
quoting. 9 render tests mount every screen with the service layer mocked and
assert the loading, error, empty and data states.

---

## 7. Known gaps

- **Refunds are read-only.** The module reports them; nothing creates one yet.
  Issuing a refund belongs with the bill in the orders flow.
- **Purchases are read-only.** Supplier spend is pulled from
  `inventory_purchase_headers` for the P&L; purchase entry stays in Inventory.
- **No accrual accounting.** The P&L is cash basis. There are no payables,
  receivables or a chart of accounts.
- **CSV export is web only**, matching the existing analytics export. Native
  sharing needs `expo-file-system` and `expo-sharing`.
- **Day close does not lock anything.** Closing a day records the count; it does
  not prevent later bills or expenses being dated into that day.
