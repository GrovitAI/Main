# RLS and tenant-isolation audit — 2026-09-21

Read-only audit of Supabase project `pyikrlqduampooncpzri` and of `main` at
`c00a4bc`. Nothing in the live database was changed: every query was a
`SELECT` or a catalog read, and the impersonation tests ran inside
`BEGIN … ROLLBACK` with no write statement in them. Four migration files were
written and **none was applied**.

## 1. Verdict

**The wall between restaurants holds where the money is, and has one hole
where it does not.** Signed in as the App Store demo reviewer, I could read
zero Le Laban bills, bill items, settlements, orders, KOTs, staff, products,
expenses, finance entries or stock rows — 30 tables counted, 30 zeros — and all
seven report functions returned zeros when handed Le Laban's ids. But nine
leftover tables from an earlier design have no row level security at all, and
every signed-in user of every tenant can read and rewrite them. Three of them
hold Le Laban rows today (four rows in total, none of them financial), and the
demo reviewer can see all four. By the standard this audit was given — *not a
single row* — that is a breach, and it is the first thing to fix. It is also
the cheapest: one migration, no app change, because no code uses those tables.
After that, close the document-number function that lets a signed-in user
with no staff record burn any branch's invoice numbers. **Apply migrations
`…000100` and `…000200` before onboarding the second restaurant.** Nothing
found here requires taking the system offline.

## 2. Findings

| # | Severity | Finding | Fix |
| :--- | :--- | :--- | :--- |
| C1 | Critical | Nine tables have RLS off and are fully granted to `authenticated`; the demo user reads Le Laban rows in three of them | migration `20260921000100` |
| H1 | High | `next_branch_sequence` guard fails open for a signed-in user with no staff row | migration `20260921000200` |
| M1 | Medium | `check_rate_limit` lets one tenant exhaust another tenant's rate-limit keys | migration `20260921000300` |
| M2 | Medium | All seven report RPCs accept `p_tenant_id` from the caller and rely on RLS alone | code change, fold into the performance pass |
| M3 | Medium | Inventory screen ships an ungated "Simulate Active Branch" switch with Le Laban's branch ids hardcoded | code change |
| L1 | Low | Ten SECURITY DEFINER functions executable with only the anon key | migration `20260921000400` |
| L2 | Low | `pos_settings.manager_cancel_code_hash` readable by every cashier of the branch | drop or column-revoke |
| L3 | Low | 19 SECURITY INVOKER functions have no pinned `search_path` | `ALTER FUNCTION … SET search_path` |
| L4 | Low | `PROJECT_CONTEXT.md` says admins see all branches; the database says owner only | doc fix |
| L5 | Low | A cashier's `last_login_at` update is silently refused by RLS | policy or RPC |
| L6 | Low | Supabase leaked-password protection is off | dashboard toggle |

### C1 — Critical — Nine tables with no row level security, open to every signed-in user

**What is wrong.** `pos_audit_logs`, `pos_domain_events`, `print_jobs`,
`refund_items`, `request_log`, `sequence_trackers`, `settings`,
`staff_branch_access` and `tax_configs` have `relrowsecurity = false`. The
anon role has no grant on them — that much of the 2026-09-13 post-flight note
is right — but `authenticated` holds `SELECT, INSERT, UPDATE, DELETE,
TRUNCATE, REFERENCES, TRIGGER` on all nine. With RLS off the grant is the only
gate, and the grant says yes to everyone who can sign in.

**Proof.** Impersonating the demo reviewer
(`4f2caf1d-620c-478e-bacd-89759f9f24a9`, tenant `dddddddd-…`):

| Table | Le Laban rows visible to the demo user | What the rows are |
| :--- | ---: | :--- |
| `tax_configs` | 1 | "GST 5%", rate 5, default |
| `sequence_trackers` | 1 | Kolathur `bill_number`, value 11 (legacy, July) |
| `staff_branch_access` | 2 | the Kolathur manager's staff id mapped to Kolathur and Central Kitchen |
| the other six | 0 | tables are empty |

The same read works for an auth user with no staff row at all (tested with
`e6bbca51-…`: `bills` 0, `tax_configs` 1).

**Attack or accident.** Today: the reviewer, or the second restaurant's
cashier, reads Le Laban's branch ids and a staff id — low-value in itself, but
it is exactly the identifier H1 and M1 need. Tomorrow: the moment any code
starts writing to `pos_audit_logs`, `print_jobs` or `refund_items` — all three
are plausible next features — every tenant's audit trail, print payloads
(which contain full receipts) and refund lines are readable and deletable by
every other tenant, with no further mistake required. **Write access is
unverified empirically** (I did not run an INSERT, even in a rolled-back
transaction, because the grant plus `relrowsecurity = false` leaves no
mechanism that could refuse it); an `INSERT … ROLLBACK` as the demo user would
settle it.

**Fix.** `20260921000100_lock_down_unprotected_tables.sql`: enable RLS with no
policies and revoke the grants from `anon` and `authenticated`. No file in
`src/`, `api/` or `scripts/` references any of the nine, and the legacy
`rpc_*` functions that do are SECURITY DEFINER owned by `postgres`, which RLS
does not bind.

### H1 — High — The document-number guard fails open

**What is wrong.** The lead was `next_invoice_number` "has no checks". It has
none of its own, but it delegates to `next_branch_sequence`, which does:

```sql
IF auth.uid() IS NOT NULL
   AND NOT public.auth_can_access_branch(p_tenant_id, p_branch_id) THEN
  RAISE EXCEPTION 'SEQ_FORBIDDEN';
```

For a caller with no active staff row, `auth_tenant_id()` is NULL, so
`auth_can_access_branch` returns NULL, `NOT NULL` is NULL, and plpgsql does
not enter an `IF NULL`. Proven read-only by evaluating the guard expression
under impersonation:

| Caller | Guard expression | Outcome |
| :--- | :--- | :--- |
| demo reviewer, against Kolathur | `true` | refused — correct |
| auth user with no staff row, against Kolathur | `NULL` | **let through** |

RLS policies do not share this flaw: a NULL `USING` or `WITH CHECK` refuses
the row. Only this plpgsql `IF` is fail-open. `run_consumption_worker`,
`finance_balances`, `finance_ledger_summary`, `finance_interaccount_positions`
and `finance_settle_entry` were checked for the same pattern and are safe —
their booleans are `coalesce`d or compared with `IS DISTINCT FROM`.

**Who can be that caller.** A staff member who has been deactivated
(`status <> 'active'` or `deleted_at` set) keeps a working login until their
token expires and can refresh it indefinitely, because deactivation in
`staff-service.ts:196` does not touch `auth.users`. One such orphan exists
today (`e6bbca51-…`, never signed in). **Unverified:** whether public sign-up
is enabled on the Supabase Auth project; the MCP tools do not expose auth
config. If it is, anyone on the internet with the publishable key can become
this caller. Check Authentication → Sign In / Providers → "Allow new users to
sign up" and turn it off; staff are created by `api/staff/create.ts` with the
service role and do not need it.

**Attack.** `POST /rest/v1/rpc/next_invoice_number` with Kolathur's ids, in a
loop. Each call (a) returns `KLT-nnnn`, disclosing Le Laban's lifetime bill
count; (b) burns a number, leaving a gap in a GST invoice series that is
supposed to be consecutive; (c) takes the `branch_counters` row lock that
`settle_order` needs, so a tight loop slows every settlement at that branch.
A legitimate cashier can also burn their own branch's numbers, which is
inherent in exposing the function and is a lesser, in-tenant matter.

**Fix.** `20260921000200_sequence_guard_fail_closed.sql` — `IS NOT TRUE` in
place of `NOT`. The cron/worker path with no JWT is unaffected. Separately,
make deactivation ban the auth user (`auth.admin.updateUserById(id, {
ban_duration })`) from a service-role endpoint alongside `api/staff/create.ts`.

### M1 — Medium — One tenant can exhaust another's rate limits

`check_rate_limit(p_key, …)` is SECURITY DEFINER, callable by every signed-in
user (the API calls it with the caller's JWT), and the counter behind a key is
global. The API's keys are predictable — `printjobs:<branch id>`
(`api/printjobs.ts:56`), `approval:request:<branch id>:<ip>`,
`staff:create:<tenant id>:<ip>`. A demo-tenant user calling the RPC directly
with `printjobs:bbbbbbbb-0000-0000-0000-000000000001` 121 times a minute makes
`/api/printjobs` answer Kolathur's cashiers with "Too many print jobs" for as
long as the loop runs. No data leaks; PrintNode printing stops.
**Fix:** `20260921000300_rate_limit_tenant_namespace.sql` prefixes the stored
key with `auth_tenant_id()`. Signature unchanged; the API needs no edit.

### M2 — Medium — Report RPCs take the tenant from the caller

`get_analytics_summary`, `get_analytics_sales_trend`,
`get_analytics_item_performance`, `get_analytics_payment_split`,
`get_finance_summary`, `get_finance_daily_series` and `get_bills_ledger_kpis`
all take `p_tenant_id uuid` and filter on it. Every one does filter every
table it reads by tenant, and by branch when `p_branch_id` is not NULL —
except `bill_items`, reached only through an already-filtered bill-id set,
which is sound. But the tenant is whatever the caller sends. Called as the
demo user with Le Laban's ids, three of them returned all zeros (the other
four have the same shape), so **RLS is carrying this alone**. They are
SECURITY INVOKER, so that is safe today. It stops being safe the day someone
makes one SECURITY DEFINER for speed — an obvious temptation in a performance
pass, since definer functions skip the per-row policy cost.
**Fix:** first statement of each: `IF p_tenant_id IS DISTINCT FROM
public.auth_tenant_id() THEN RAISE EXCEPTION … '42501'`. I did not write this
migration because it means re-issuing all seven bodies, which the pending
report-performance pass is about to rewrite; do it there, and do not convert
any of them to SECURITY DEFINER without it.

### M3 — Medium — Le Laban branch ids hardcoded in a shipped screen

`src/app/(app)/inventory.tsx:4360–4407` and `:4797–4818` render a "Simulate
Active Branch" switch, with no `__DEV__` or role gate, whose two buttons set
`bbbbbbbb-0000-0000-0000-000000000001` and `cccccccc-0000-0000-0000-000000000001`.
The demo reviewer and every future tenant see it. RLS returns them nothing
for those ids, so it is not a leak of data — it is a leak of identifiers, a
broken control for anyone who is not Le Laban, and a direct breach of "Never
hardcode UUIDs outside tenant-context.ts". **Fix:** build the switch from
`session.accessibleBranches`, show it to owners only, or delete it.
(`tenant-context.ts:9–10` also still exports the deprecated `TENANT_ID` /
`BRANCH_ID` constants with Le Laban's ids; nothing should import them.)

### L1 — Low — SECURITY DEFINER functions reachable with the anon key

`auth_can_write_shared`, `demo_tenant_roll_forward`, `finance_account_in_scope`,
`finance_is_business_owner` and six trigger functions are executable by `anon`.
None is exploitable: the three helpers return false without a staff row, the
triggers cannot be called directly, and `demo_tenant_roll_forward` is confined
as intended — it hardcodes the demo tenant id, re-checks the tenant name,
filters all three `UPDATE`s by that id, refuses shifts over 400 days, and is a
no-op once the data ends today. The worst an anonymous caller can do is run
tonight's roll-forward early. Its `REVOKE … FROM PUBLIC` in
`20260918000300` did not remove Supabase's explicit default grants to `anon`
and `authenticated`. **Fix:** `20260921000400_revoke_needless_definer_execute.sql`.

### L2 — Low — Manager cancel-code hash readable by cashiers

`pos_settings_select` is `auth_can_access_branch(…)`, so every staff member of
a branch can read `manager_cancel_code_hash`. Kolathur's and Central Kitchen's
are bcrypt cost 8; the demo branch's is a bare 64-hex digest. A short numeric
code falls to offline guessing in seconds either way. It is Low only because
nothing uses the column any more — the sole reader is the legacy
`rpc_cancel_order`, closed since 2026-09-13. **Fix:** drop the column, or
`REVOKE SELECT (manager_cancel_code_hash) … FROM authenticated`. If a cancel
code is ever revived, verify it inside a definer function and never return it.

### L3 — Low — Mutable `search_path` on 19 invoker functions

Supabase lint 0011 lists them, including `settle_order`,
`assign_order_numbers`, `create_dispatch`, `receive_dispatch` and all seven
report RPCs; several reference `bills` unqualified. Every SECURITY DEFINER
function does pin `search_path = public`, which is the part that matters.
For invoker functions the exposure is theoretical (API roles cannot create
objects), but `ALTER FUNCTION … SET search_path = public` is free.

### L4 — Low — Documentation contradicts the database on admin scope

`PROJECT_CONTEXT.md` says "owner/admin see all branches of their tenant".
Since `20260918000100_admin_is_branch_scoped.sql`, `auth_is_tenant_wide()` is
`role = 'owner'` only, and `api-auth.ts:188` and `tenant-context.ts` agree
with the database. The document is wrong, and an assistant that trusts it will
write an "admin sees everything" feature that silently returns one branch.

### L5 — Low — Cashier `last_login_at` never updates

`use-session-store.ts:152` updates `staff` by id as the signing-in user.
`staff_update` requires `auth_is_manager()`, so for cashiers and kitchen staff
RLS matches zero rows and the fire-and-forget call reports nothing. The
policy is right to refuse; the feature is quietly broken. **Fix:** a small
definer RPC `touch_last_login()` that updates only the caller's own row.

### L6 — Low — Leaked-password protection disabled

Supabase advisor:
[password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
A dashboard toggle. Other advisor items, for completeness:
[RLS disabled in public](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public) (= C1),
[anon-executable definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) (= L1),
[mutable search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) (= L3),
[RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
on `api_rate_limits` and `finance_balance_snapshots` (intended: both are
reached only through definer functions and have no API grant), and
[`pg_trgm` in public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) (cosmetic).

### The three role-boundary questions

| Oddity | Verdict | Reasoning |
| :--- | :--- | :--- |
| Shared menu editable by either branch's admin | **Intended**, with a correctness risk | `auth_can_write_shared` deliberately lets `admin` write any row in the tenant for `products`, `categories` and the inventory masters (`20260918000050_shared_catalogue.sql`); the app reads the menu tenant-wide. It cannot cross tenants. The risk is operational: a Velachery admin's price change lands on Kolathur's next bill, and there is no audit row saying who did it. Managers cannot — they go through `auth_can_access_branch` — so the blast radius is two people. |
| Central Kitchen stock hidden from branch admins | **Intended**; not a security problem | `inventory_material_stock_levels_select` is `auth_can_access_branch`, and only `owner` is tenant-wide. Branch staff still see the transfer requests they are party to. If admins are meant to see kitchen stock before requesting, that is a product decision needing a read-only policy, not a bug. See L4 — the docs say otherwise. |
| Velachery has no `pos_settings` row | **Correctness problem**, not security | Confirmed: Kolathur 1 row, Central Kitchen 1, Velachery 0, with 1,559 bills (391 in the last fortnight). The code treats a missing row as GST 0%, and Kolathur's row also says 0, so bills are identical **today**. The trap: the Velachery admin's first save in Settings takes the INSERT path, not UPDATE, and any GST change "for Le Laban" made by updating rows will skip Velachery without an error. Insert the row. Aside: both existing Le Laban rows say `timezone: 'UTC'`; the demo branch says `Asia/Kolkata`. |

## 3. Checked and found clean

Skip these next time unless the named object has changed.

- **RLS coverage.** 66 tables in `public`. 57 have RLS on; 55 of those have
  policies for every operation the app performs, and the 2 with none
  (`api_rate_limits`, `finance_balance_snapshots`) have no API grant either.
  No table is `FORCE`d; irrelevant, since only `postgres` and `service_role`
  own or bypass, and neither is reachable from the client.
- **All 206 policies, read in full** (71 distinct predicates). None is `true`.
  None checks `branch_id` without `tenant_id`. None trusts a client-supplied
  value: every predicate resolves through `auth_staff_row()`, which keys on
  `auth.uid()` and requires `status = 'active' AND deleted_at IS NULL`. Every
  INSERT policy has a `WITH CHECK`; every UPDATE policy has both `USING` and
  `WITH CHECK`. Child tables without tenant columns (`bill_items`,
  `kot_items`, `open_order_items`, `inventory_recipe_items`,
  `inventory_dispatch*`, `inventory_transfer_request_items`) are scoped by
  `EXISTS` against a parent that is. The five finance tables use `TO public`
  rather than `TO authenticated`; harmless, as `anon` has no grant on them.
- **One nuance, not a finding:** `finance_entries_update` has `WITH CHECK
  (tenant_id = auth_tenant_id())` only. The account-scope rules on the new row
  are enforced by the `finance_entries_before_write` trigger instead.
- **All 38 SECURITY DEFINER functions.** Every one pins `search_path = public`.
  The eight `auth_*` helpers and eight `finance_*` predicates take identity
  from `auth.uid()` only and `coalesce` to false. `finance_balances`,
  `finance_ledger_summary`, `finance_interaccount_positions` and
  `finance_settle_entry` each re-derive the tenant from the JWT and refuse
  otherwise. `finance_movement`, `finance_refresh_balance_snapshots`,
  `process_consumption_batches` and the five legacy `rpc_*` are executable by
  neither `anon` nor `authenticated`. `run_consumption_worker` requires a
  manager. `demo_tenant_roll_forward` is confined to the demo tenant (L1).
- **Invoker write RPCs.** `settle_order` and `assign_order_numbers` select the
  order with `tenant_id`, `branch_id` and `FOR UPDATE` under RLS, so a foreign
  id yields `ORDER_NOT_FOUND`; every insert in `settle_order` carries both
  ids. `create_dispatch` / `receive_dispatch` fetch the request under RLS
  before their role check.
- **Empirical isolation, demo reviewer → Le Laban.** Zero rows in each of:
  `bills` (157 visible, all demo), `bill_items`, `settlements`, `open_orders`,
  `open_order_items`, `kots`, `kot_items`, `staff`, `tenants`, `branches`,
  `products`, `categories`, `expenses`, `refunds`, `pos_settings`, `printers`,
  `branch_counters`, `branch_activity`, `finance_entries`, `finance_accounts`,
  `finance_catalog`, `finance_rules`, `finance_entry_revisions`,
  `inventory_materials`, `inventory_material_stock_levels`,
  `inventory_stock_ledger`, `inventory_consumption_batches`,
  `inventory_recipes`, `inventory_audit_logs`, `approval_requests`.
  `finance_balance_snapshots`: permission denied. `get_bills_ledger_kpis`,
  `get_analytics_summary`, `get_finance_summary` with Le Laban's ids over 400
  days: all zeros. Not individually counted, same policy shapes as tables that
  were: the remaining `inventory_*`, `approval_email_verifications`,
  `branch_approval_settings*`, `finance_day_closures`, `pos_terminals`,
  `subscriptions`, `tenant_features`, `expense_categories`.
- **The serverless API.** `src/lib/server/api-auth.ts` builds its client from
  the anon key plus the caller's bearer token, so every `caller.db` query is
  under RLS, and tenant, branch and role come from the staff row, never the
  request body. The only service-role use is `api/staff/create.ts`, which
  takes `tenant_id` from the caller, refuses a branch the caller cannot reach,
  and refuses a role at or above the caller's own.
- **Application layer.** 257 `.from(` calls in 26 files across `src/`, `api/`
  and `scripts/`. **None omits `tenant_id` on a business table.** The twelve
  that omit it are the sign-in bootstrap in `use-session-store.ts` (which runs
  before a tenant is known and looks up `staff` by `auth_user_id`),
  `printer-service.ts:708` (`branches` by primary key) and
  `api/approval/verify-email/confirm.ts:92,121` (update by primary key of a
  row just fetched with both filters). `dev-seed.ts` returns early unless
  `__DEV__`. Full breakdown in Appendix A.

**On the AGENTS.md rule itself.** "Every Supabase query must include
tenant_id AND branch_id" is unmeetable as written: 62 call sites target tables
that have no such column, and the shared menu, the inventory masters and the
finance ledger are tenant-wide on purpose. A rule that is broken 100-odd times
for good reasons trains people to ignore it. Suggested wording: *every query
filters by `tenant_id` where the table has one; it also filters by `branch_id`
unless the table is a tenant-wide catalogue or the caller is an owner asking
for all branches, and says so in a comment; child tables are reached through a
parent id that was itself fetched with both.* Against that rule the codebase
has 12 exceptions, all listed above, all defensible.

## 4. Migrations written, not applied

Apply in this order, one at a time, verifying each.

| File | What it does | What changes for users |
| :--- | :--- | :--- |
| `20260921000100_lock_down_unprotected_tables.sql` | Enables RLS (no policies) on the nine C1 tables and revokes their grants from `anon` and `authenticated`. | Nothing — no code touches them. Verify: as any staff user, `SELECT count(*) FROM tax_configs` → permission denied. |
| `20260921000200_sequence_guard_fail_closed.sql` | Re-issues `next_branch_sequence` with `IS NOT TRUE` in the guard; body otherwise byte-for-byte the live definition of 2026-09-21. | Nothing for staff or for cron. Users with no staff row get `SEQ_FORBIDDEN`. Verify by settling one bill at each branch and checking the invoice number follows on. **If `next_branch_sequence` has changed in the database since 2026-09-21, re-derive the file first — it would overwrite that change.** |
| `20260921000300_rate_limit_tenant_namespace.sql` | Re-issues `check_rate_limit` so the stored key is prefixed with the caller's tenant id. | Every rate-limit window restarts once. Verify: print a receipt; a new `api_rate_limits` row appears with key `aaaaaaaa-…\|printjobs:…`. |
| `20260921000400_revoke_needless_definer_execute.sql` | Revokes EXECUTE on `demo_tenant_roll_forward` and six trigger functions from all API roles, and on three policy helpers from `anon` only. | Nothing. Verify the next morning that the demo tenant's newest bill is dated today (cron still runs it), and that a finance entry can still be saved (triggers still fire). |

Not written, and why: **M2** belongs in the report-performance pass, which
will re-issue the same seven function bodies. **M3**, **L4**, **L5** are code
and doc changes, and this audit was read-only on source. **L2** needs the
owner's call between dropping the column and revoking it.

## Appendix A — application-layer call sites (machine-readable)

Generated by scanning every `.from('<table>')` call and its chained statement
for `tenant_id` and `branch_id`, then checking each miss against the live
schema and the surrounding code. 257 calls; 110 carry both filters inline; the
other 147 break down as A1–A4 below (43 + 23 + 19 + 62).

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
