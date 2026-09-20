# Report query performance pass — 2026-09-21

Measured on the live Supabase project `pyikrlqduampooncpzri` (PostgreSQL 17.6)
against Le Laban's real data: 5,985 bills, 7,314 bill items, 5,847
settlements. Everything run against the database was an `EXPLAIN`, an
`EXPLAIN (ANALYZE, BUFFERS)` on a `SELECT`, or a `SELECT`; impersonation ran
inside `BEGIN … ROLLBACK`. No index was created, no function replaced, no
policy altered. Three migration files were written and **none was applied**.

## The short version

**No index is missing.** Every one of the seven RPCs already uses the right
index, or would not benefit from one at this size. The time goes somewhere the
brief did not list: **the row level security policy calls a function for every
row it reads, and that function looks up the caller's staff record three times
per call.** It costs half a millisecond per bill and a full millisecond per
bill item. Run as `postgres`, which skips RLS, the seven RPCs take **9–34 ms**
over a full year. Run as the Le Laban owner, the way the app runs them, they
take **2.5–8.4 s**.

`get_bills_ledger_kpis` was the known slow one only because it is slow for
*every* range, including today. It has a second, separate fault — a `CASE`
that hides its date filter from the planner — so it reads the restaurant's
whole history every time. The other six are fast today and slow over a month,
and nobody had looked at a month.

## 1. Results

Times are the second of two consecutive runs, as the Le Laban owner
(`ac4e5143-…`, all branches, `p_branch_id = NULL`), so RLS is included exactly
as the app experiences it. Every buffer in every plan was a `shared hit`; no
run touched disk.

| RPC | Today (14 bills) | This month (1,882) | Full year (5,829) | Year, RLS bypassed | After, year | What fixes it |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| `get_bills_ledger_kpis` | **2,318 ms** | 2,404 ms | 2,615 ms | 34 ms | ≈ 35 ms; today ≈ 5 ms | policy rewrite `…000100` **and** function rewrite `…000200` |
| `get_analytics_summary` | 22 ms | 2,597 ms | **8,377 ms** | 15 ms | ≈ 25–40 ms | policy rewrite `…000100` |
| `get_analytics_sales_trend` | 7 ms | 762 ms | 2,473 ms | 17 ms | ≈ 20 ms | policy rewrite `…000100` |
| `get_analytics_item_performance` | 22 ms | 2,614 ms | **8,297 ms** | 9 ms | **25 ms measured** (simulated policy) | policy rewrite `…000100` |
| `get_analytics_payment_split` | 12 ms | 2,608 ms | 4,884 ms | 10 ms | ≈ 15–25 ms | policy rewrite `…000100` |
| `get_finance_summary` | 13 ms | 1,889 ms | 4,982 ms | 18 ms | ≈ 25 ms | policy rewrite `…000100` |
| `get_finance_daily_series` | 12 ms | 1,594 ms | 4,908 ms | 15 ms | ≈ 20 ms | policy rewrite `…000100` |

The Analytics screen fires the four `get_analytics_*` calls in parallel, so
its wait for "this year" is the slowest of them: about 8.4 s today.

**How the "after" column was obtained, and how far to trust it.** I could not
alter a policy, so I could not time the real thing. Instead I ran the
function's query by hand as `postgres` with the owner's JWT claims set and the
*rewritten policy predicate written into the `WHERE` clause*. For
`get_analytics_item_performance` over a year that took **25 ms** against 8,297
ms, with each helper showing as an `InitPlan` executed once. The worst case —
where the planner keeps the policy's `EXISTS` as a sub-plan, as it may under
real RLS — was tested separately as the branch-scoped Kolathur manager: a full
scan of `bill_items` through the rewritten predicate took **10.7 ms** and kept
5,234 rows while refusing 2,080 (Velachery and the demo tenant), which is the
correct answer. The other "≈" figures are the RLS-bypassed floor plus that
overhead; they are estimates, bounded below by the measured floor. Confirm
them after applying `…000100` by re-running any one RPC as a signed-in owner.

## 2. Diagnosis

### The common cause — a per-row function call inside RLS

Five of the six SELECT policies on the report tables read

```sql
USING (auth_can_access_branch(tenant_id, branch_id))
```

`auth_can_access_branch` is `SECURITY DEFINER`, so PostgreSQL may not inline
it. It calls `auth_tenant_id()`, `auth_is_tenant_wide()` and
`auth_branch_id()`; each calls `auth_staff_row()`, which queries `staff`.
That is three executor start-ups and three reads of the same staff row for
every row the query touches, and the answer is identical every time.

`get_bills_ledger_kpis`, body run inline as the owner, full year:

```
Aggregate (actual time=2867.378..2867.378 rows=1)
  ->  Seq Scan on bills b (actual time=1.922..2803.966 rows=5828)
        Filter: ((tenant_id = '…') AND auth_can_access_branch(tenant_id, branch_id) AND (…dates…))
        Buffers: shared hit=12163          <- a 175-page table; the other ~12,000 hits are `staff`
  SubPlan 1
    ->  Index Scan using uniq_settlements_bill_id on settlements s (actual time=0.008..0.008 loops=5775)
```

2,804 ms ÷ 5,985 rows = **0.47 ms per bill**, all of it in the filter.

`bill_items` is twice as bad. Its policy is `EXISTS (SELECT 1 FROM bills b
WHERE b.id = bill_items.bill_id AND auth_can_access_branch(…))`, and because
that sub-select reads `bills`, the `bills` policy is applied inside it too.
The helper therefore fires **twice per item**. From the month-range plan of
the item/payment queries:

```
->  Index Scan using idx_bill_items_bill_id on bill_items bi (actual time=0.997..1.217 rows=1 loops=1821)
      Filter: EXISTS(SubPlan 3)
      SubPlan 3
        ->  Index Scan using bills_pkey on bills b_1 (actual time=0.986..0.986 rows=1 loops=2225)
              Filter: (auth_can_access_branch(tenant_id, branch_id) AND auth_can_access_branch(tenant_id, branch_id))
…
->  Index Scan using uniq_settlements_bill_id on settlements s (actual time=0.497..0.497 rows=1 loops=1821)
      Filter: auth_can_access_branch(tenant_id, branch_id)
```

Note what is *not* wrong there: every access is already an index scan, on the
right index. The 0.99 ms and 0.50 ms per row are the filter, not the lookup.

This also explains why six of the seven are quick for "today": their date
predicates are plain comparisons, the planner narrows to 14 bills by index
*first*, and only 14 rows reach the policy. The cost is per row read, so it
scales with the range — and, left alone, with every month the restaurant
trades.

**The fix** is the standard one for Supabase RLS: wrap each helper in a scalar
sub-select, which the planner turns into an `InitPlan` evaluated once per
statement. `auth_can_access_branch(t, b)` is defined as `t = auth_tenant_id()
AND (auth_is_tenant_wide() OR b = auth_branch_id())`, so the policy becomes
that expression with each call wrapped in `(SELECT …)`. Same logic, same
NULL behaviour (no staff row → NULL → refused), helpers are `STABLE` so once
per statement cannot differ from once per row. Simulated plan, item
performance, full year:

```
HashAggregate (actual time=24.846..24.875 rows=43)
  InitPlan 1 -> Result (actual time=1.274..1.274 rows=1 loops=1)     <- auth_tenant_id(), once
  InitPlan 2 -> Result (actual time=0.370..0.370 rows=1 loops=1)     <- auth_is_tenant_wide(), once
  InitPlan 3 -> Result (never executed)                              <- auth_branch_id(), short-circuited for an owner
  ->  Hash Join (actual time=13.409..19.171 rows=6765)
Execution Time: 25.039 ms
```

### Per RPC

**`get_bills_ledger_kpis`** — two faults. The RLS cost above, plus a date
filter written as `CASE WHEN p_status IN (…) THEN settled_at … ELSE … END`.
The planner cannot look inside a `CASE`, so it never considers
`idx_bills_tenant_branch_settled` or `idx_bills_tenant_branch_status_created`
and scans every bill the tenant has, whatever the range — which is why
"today" costs the same 2.3 s as a year. Rewritten as an `OR` of two plain
range tests, the generic plan (forced with `plan_cache_mode =
force_generic_plan`, to match how a SQL function is planned) is:

```
Bitmap Heap Scan on bills b (actual time=0.984..1.033 rows=12)      Heap Blocks: exact=14
  ->  BitmapOr
        ->  Bitmap Index Scan on idx_bills_tenant_branch_settled        (rows=14)
        ->  Bitmap Index Scan on idx_bills_tenant_branch_status_created (rows=12)
Execution Time: 1.178 ms
```

14 heap rows instead of 5,985. The per-bill `EXISTS` on `settlements` for the
complimentary flag is an index probe at 0.008 ms and was left alone. The
client already builds the *page of rows* with the sargable `OR` form
(`open-orders-service.ts:346`, "Mirrors the predicate inside
get_bills_ledger_kpis"), so after this change the function and its mirror
have the same shape.

**`get_analytics_summary`** (8.4 s/year, the slowest) — reads `bills` once
(0.47 ms/row), then sums `bill_items` for the sales bills (0.99 ms/row, the
double evaluation). No structural fault in the function; both tables are read
once each. Fixed by the policy rewrite alone.

**`get_analytics_item_performance`** (8.3 s) — same two reads, same cause.

**`get_analytics_payment_split`** (4.9 s) — `bills` then `settlements` through
`uniq_settlements_bill_id`; 0.50 ms/row on each side. Policy rewrite.

**`get_analytics_sales_trend`** (2.5 s) — reads only `bills`, once. It
converts `settled_at` to IST *in the select list*, after filtering on the raw
`timestamptz`, so the conversion does not defeat the index. No expression
index is needed. Policy rewrite.

**`get_finance_summary`** (5.0 s) — reads `bills`, `settlements`, `expenses`,
`refunds`, `inventory_purchase_headers`, each exactly once via CTEs. The last
three are near-empty. Policy rewrite.

**`get_finance_daily_series`** (4.9 s) — `bills` joined to `settlements`, plus
`expenses`. Its business-date expression (`settled_at AT TIME ZONE … −
2h30m`) is likewise computed after a raw-timestamp range filter. Policy
rewrite.

### Time zones — checked, no problem found

None of the seven wraps a filtered column in a time-zone conversion. All
filter on raw `timestamptz` bounds that the client computes, or on
`expenses.date` as a plain `date`, and convert to IST only when grouping. So no expression index is called for, and nothing in these
migrations changes which rows any report returns. One boundary is drawn in
the wrong zone, though — see 5.9.

### Indexes

Existing indexes on the report tables are adequate; see the table in the
appendix. Two are exact duplicates of a unique index and only cost write time
(`…000300`). Statistics have accumulated since 2026-05-07, so the scan counts
are a fair sample.

## 3. Equality proof for the rewritten function

Only `get_bills_ledger_kpis` was rewritten. Because creating a function on the
live database was off limits, the proof calls the **live old function** and
evaluates the **new body as a correlated sub-query** over the same argument
row, in one read-only statement, and compares the JSON text byte for byte.

Argument grid: 4 branch values (NULL, Kolathur, Velachery, Central Kitchen) ×
6 ranges (today, yesterday, this month, full year, an empty day in 2020, and
an *inverted* range with start after end) × 9 statuses (`all`, NULL, `paid`,
`unpaid`, `cancelled`, `completed`, `draft`, an unknown value, empty string) ×
5 searches (NULL, empty, `KLT-1`, a padded `'  12 '`, a bare `%`).

| Range | Combinations | Non-empty results | md5 of all old outputs | md5 of all new outputs |
| :--- | ---: | ---: | :--- | :--- |
| today | 180 | 33 | `133c25970f8587a29196d9e7ccb44839` | `133c25970f8587a29196d9e7ccb44839` |
| yesterday | 180 | 42 | `d6ab60515cd5b6cc659563afa652bc32` | `d6ab60515cd5b6cc659563afa652bc32` |
| this month | 180 | 53 | `5e7d8d8ba157d1425cce4aaf5dce756b` | `5e7d8d8ba157d1425cce4aaf5dce756b` |
| full year | 180 | 54 | `7f009c6429c9f225c3abb05c646a99dc` | `7f009c6429c9f225c3abb05c646a99dc` |
| empty (2020) | 180 | 0 | `6a3543c292ee91d77c82e752499f3c92` | `6a3543c292ee91d77c82e752499f3c92` |
| inverted | 180 | 0 | `6a3543c292ee91d77c82e752499f3c92` | `6a3543c292ee91d77c82e752499f3c92` |
| **Total** | **1,080** | **182** | **1,080 identical, 0 different** | |

Spot values, owner, all branches, `p_search` NULL — old and new agree on each:

| Range | Status | grossSales | discountsGiven | complimentarySales | netCollected | billCount |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| today | all | 4,963.00 | 0.00 | 0 | 4,963.00 | 14 |
| month | all | 778,767.00 | 9,013.60 | 8,719.00 | 769,404.40 | 1,882 |
| month | cancelled | 0.00 | 0.00 | 0 | 0 | 48 |
| year | all | 2,375,677.00 | 38,392.60 | 38,692.00 | 2,334,759.40 | 5,829 |
| year | paid | 2,374,240.00 | 38,392.60 | 38,692.00 | 2,334,759.40 | 5,709 |

An earlier four-arm form of the rewrite was proven the same way over 384
combinations before being simplified to the two-arm form that is in the file;
the 1,080-combination run is against the final text.

The policy rewrite changes no function and no output. As a cross-check, six of
the seven RPCs returned an identical md5 when run as the owner under today's
policies and as `postgres` with no policy at all, which shows the owner's
reports contain exactly the tenant's rows and nothing the policy was adding or
removing. The seventh, `get_analytics_item_performance`, differed — see 5.1.

## 4. Migration files, in the order to apply them

| # | File | Expected effect | Duration | How to verify |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `20260922000100_report_rls_initplan.sql` | Six `ALTER POLICY` statements on the SELECT policies of `bills`, `bill_items`, `settlements`, `expenses`, `refunds`, `inventory_purchase_headers`. All seven RPCs drop from seconds to tens of milliseconds for month and year ranges; the Bills list and any other read of these tables speeds up equally. | Under a second. Each `ALTER POLICY` takes a brief exclusive lock on its table; with sub-second billing transactions it will not be noticed, but prefer a lull over the dinner rush. Can run in a transaction. | As an owner, open Analytics → This year: should load in well under a second. **Then, as the demo reviewer, `SELECT count(*) FROM bills WHERE tenant_id = 'aaaaaaaa-…001'` must still be 0** — this migration edits security policies, so re-run the isolation check, not just the stopwatch. |
| 2 | `20260922000200_bills_ledger_kpis_sargable.sql` | `CREATE OR REPLACE` of `get_bills_ledger_kpis` with an index-friendly date filter. After #1 it takes the function from ~35 ms to ~5 ms for short ranges today; its real value is that the cost stops growing with total history. | Instant. | Bills screen, any preset: the KPI strip must show the same five numbers as before. Compare one range before and after. |
| 3 | `20260922000300_drop_duplicate_indexes.sql` | Drops `idx_settlements_bill_id` and `idx_bills_order_id`, exact duplicates of unique indexes. Two fewer index writes per settled bill. No read changes. | Under a second each. **`DROP INDEX CONCURRENTLY` cannot run inside a transaction block** — run the two statements one at a time in the SQL editor, not through the migration runner. | Settle a bill; `\d bills` shows `unique_open_order_id` still present. |

Order matters only in that #1 carries almost all of the benefit and should go
first so its effect can be seen on its own. #2 and #3 are independent of it
and of each other.

**Dependency on the RLS audit (`audit/rls-review`, not yet merged).** Nothing
here conflicts with its four migrations; the timestamps were chosen to sort
after them. Its finding M2 — the report RPCs accept `p_tenant_id` from the
caller and rely on RLS alone — is **still open**: this pass rewrote one
function of the seven, and a security guard belongs in all seven at once, in
its own migration with its own test, not mixed into a change whose proof is
"the output is byte-identical". This pass does not make M2 worse: no function
was converted to `SECURITY DEFINER`, which was the tempting shortcut M2 warned
against, and the measurements above show it is unnecessary.

## 5. Found, and deliberately not fixed

**5.1 `get_analytics_item_performance` returns items in an unstable order.**
It sorts a CTE by `qty DESC` and then `json_agg`s it with no `ORDER BY` inside
the aggregate. Items with equal quantities come back in whatever order the
plan produces; two runs a minute apart gave different md5s for identical data.
The fix is `json_agg(… ORDER BY ia.qty DESC, ia.item_name)`. Not done here
because it *changes the output*, and this pass promised not to. Any test that
compares this RPC's output must sort first.

**5.2 The same per-row RLS cost applies to every other table.** About 200
policies use the same helpers. Measured as the owner: `SELECT count(*) FROM
open_orders` 2,630 ms, `FROM kot_items` 5,473 ms. The cashier's hot path is
*not* affected — the active-orders fetch, `WHERE status = 'open'`, narrows by
index to one row and took 6 ms — which is why billing feels fine while
history screens crawl. The remedy is identical to `…000100`, applied to the
remaining SELECT policies (`open_orders`, `open_order_items`, `kots`,
`kot_items`, the inventory tables). Left out because those are outside the
seven RPCs, because they sit on the money path, and because each needs its own
isolation re-test. Recommended as the next migration after `…000100` has run
for a few days.

**5.3 Four of the seven RPCs are not in version control.**
`get_analytics_summary`, `_sales_trend`, `_payment_split` and
`_item_performance` exist only in the live database; no file under `supabase/`
creates them (`20260907000100_rls_policies.sql` only adjusts their grants). A
rebuilt or branched database would not have an Analytics screen. Capture them
with `pg_get_functiondef` into a baseline migration.

**5.4 `idx_bills_invoice_number_trgm_fallback` is not a trigram index.** It is
a plain btree on `(tenant_id, branch_id, invoice_number)` and cannot serve the
`ILIKE '%…%'` search in the Bills ledger. At 6,000 rows the scan it falls back
to costs a few milliseconds. `pg_trgm` is already installed; a GIN index on
`invoice_number gin_trgm_ops` becomes worthwhile somewhere past 100,000 bills.
(The btree is still earning its keep: the planner uses it as the cheapest
"all bills of a tenant" path.)

**5.5 No new composite index, on purpose.** For an owner viewing all branches,
the date indexes lead with `(tenant_id, branch_id, …)`, so a date range walks
the tenant's whole section of the index (48–58 buffers today, 0.4 ms).
`bills (tenant_id, settled_at)` and `(tenant_id, created_at)` would cut that to
three buffers. Not proposed: the saving is under a millisecond now and perhaps
5–10 ms at 100,000 bills, against two more index writes on every bill. Revisit
past ~200,000 bills.

**5.6 Other never-scanned indexes.** `idx_open_orders_version` (0 scans since
May, on the hottest write table) and `idx_purchase_date` (0 scans) are
candidates. Not dropped: neither is a provable duplicate, and "unused so far"
is weaker evidence than "identical to another index". The finance trigram
indexes show 0 scans only because the ledger is days old.

**5.7 Dead tuples.** `bill_items` 1,148 dead of 7,147, `settlements` 785 of
5,847, `staff` 9 dead of 8 live. Autovacuum is keeping up (last analyse
2026-09-20) and all tables fit in memory; nothing to do, but the `staff`
figure is the footprint of the `last_login_at` update on every sign-in.

**5.8 `get_finance_summary` is called once at start-up as a schema probe**
(`finance-service.ts:169`, epoch-to-epoch range). An empty range narrows by
index to zero rows, so it is cheap; noted only so nobody mistakes it for load.

**5.9 `get_finance_summary` draws the purchases boundary in UTC, not IST.**
It filters `purchase_date >= p_start_date::timestamptz`. Casting a `date` to
`timestamptz` uses the session time zone, which on Supabase is UTC, so the day
starts at 05:30 IST: a purchase entered between midnight and 05:30 IST is
counted in the previous day. Bills, settlements and refunds are unaffected —
they use the client-computed `p_start_ts`. Only `purchasesTotal` and
`purchasesCount` are touched, and the table is nearly empty today. The fix is
`(p_start_date::timestamp AT TIME ZONE 'Asia/Kolkata')`. Not done because it
changes which rows the report returns, which needs the owner's say-so.

## Appendix — indexes on the report tables

Scan counts since 2026-05-07.

| Table | Index | Definition | Scans | Verdict |
| :--- | :--- | :--- | ---: | :--- |
| bills | `bills_pkey` | UNIQUE (id) | 1,022,446 | keep |
| bills | `unique_open_order_id` | UNIQUE (open_order_id) | 769,849 | keep |
| bills | `idx_bills_order_id` | (open_order_id) | 58,369 | **drop — duplicate** |
| bills | `idx_bills_tenant_branch_settled` | (tenant_id, branch_id, settled_at DESC) | 17,041 | keep — used by every report |
| bills | `idx_bills_tenant_branch_status_created` | (tenant_id, branch_id, status, created_at DESC) | 18,344 | keep |
| bills | `idx_bills_invoice_number_trgm_fallback` | (tenant_id, branch_id, invoice_number) | 181 | keep; see 5.4 |
| bills | `uniq_bills_invoice_number_per_branch_v2` | UNIQUE partial | 0 | keep — a constraint, not a lookup path |
| bill_items | `idx_bill_items_bill_id` | (bill_id) | 2,199,379 | keep |
| bill_items | `idx_bill_items_product_id` | (product_id) | 2,895 | keep |
| settlements | `uniq_settlements_bill_id` | UNIQUE (bill_id) | 547,607 | keep |
| settlements | `idx_settlements_bill_id` | (bill_id) | 1 | **drop — duplicate** |
| settlements | `idx_settlements_tenant_branch_created` | (tenant_id, branch_id, created_at DESC) | 85 | keep |
| expenses | `idx_expenses_tenant_branch_date` | (tenant_id, branch_id, date DESC) | 38 | keep |
| refunds | `idx_refunds_tenant_branch_created` | (tenant_id, branch_id, created_at DESC) | 197 | keep |
| inventory_purchase_headers | `idx_purchase_date` | (purchase_date) | 0 | candidate; see 5.6 |
