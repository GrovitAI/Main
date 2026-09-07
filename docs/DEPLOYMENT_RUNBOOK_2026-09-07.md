# Deployment Runbook — Audit Remediation (2026-09-07)

Everything in this runbook is a step that only you can do (it needs the Supabase
dashboard, the Vercel dashboard, third-party consoles, or a decision). Do them
in order. Each step says how to verify it.

> Until steps 1–3 are done, the deployed app will NOT be able to settle bills,
> print, request approvals or create staff, because the new code expects the
> new database functions and authenticated API endpoints.

## Current state of the live database, measured 2026-09-08

None of the migrations below have been applied yet, and this was confirmed by
querying the live project with the publishable anon key, the same key that ships
inside the web bundle:

- Every table is readable: 4,642 bills, 4,558 settlements, 4,732 orders, all
  staff rows and the full product catalogue.
- Writes are accepted too. A test row inserted into `inventory_categories`
  succeeded and was deleted immediately afterwards.
- The four `get_analytics_*` functions are callable, so revenue totals are
  reachable without signing in.
- `settle_order`, `assign_order_numbers`, `next_kot_number`,
  `get_bills_ledger_kpis`, `create_dispatch`, `receive_dispatch`,
  `run_consumption_worker` and `check_rate_limit` do not exist, and neither do
  `branch_counters` or `api_rate_limits`.

Two consequences follow. Anyone who reads the key out of the JavaScript bundle
has full read and write access to the tenant's data right now. And the current
`main` cannot settle a bill against this database, because the code calls
functions that are not there. Step 1 fixes both.

---

## 0. Before you start

- Pull `main`.
- Have the Supabase project open: **SQL Editor** and **Database → Extensions**.
- Have the Vercel project open: **Settings → Environment Variables**.
- Run `supabase/preflight_checks.sql` first. It is read-only and safe during
  trading. Every count it reports must be 0 before you start, otherwise a
  uniqueness constraint below will fail partway through.

---

## 1. Run the database migrations (Supabase SQL Editor)

Run each file **in this order**, one at a time, whole file per run. Every file is
re-runnable (idempotent). Read the "NOTICE" lines in the result pane.

| # | File | What to check in the output |
|---|------|-----------------------------|
| 1 | `supabase/migrations/20260907000100_rls_policies.sql` | Final SELECT lists every table with `rls_enabled = true` and `policies = 4` (branch_counters and api_rate_limits come later). This is the file that closes the anon exposure. |
| 2 | `supabase/migrations/20260907000200_sequences_and_settle_order_v2.sql` | Final SELECT lists historical duplicate invoice numbers (140+ expected). These are pre-existing; new bills cannot duplicate. Decide whether to renumber them manually. |
| 3 | `supabase/migrations/20260907000300_ledger_kpis_indexes_hardening.sql` | If you see `settlements has duplicate bill_id rows`, reconcile them (pre-flight check 1 lists them) and re-run. |
| 4 | `supabase/migrations/20260907000400_consumption_worker.sql` | If you see `pg_cron is not enabled`, enable **pg_cron** in Database → Extensions, then re-run only section 3 of the file. |
| 5 | `supabase/migrations/20260907000500_transfer_rpcs.sql` | No errors. |
| 6 | `supabase/migrations/20260907010000_finance_module.sql` | Optional, for the finance module. Adds columns to `expenses`, creates `expense_categories`, `refunds` and `finance_day_closures`, and enables RLS on them. The finance screens work read-only until it is run. |

An earlier `20260906120000_settle_order_rpc.sql` was removed from the repository.
It was never applied to any database, it was fully superseded by file 2, and it
ended with an explicit `GRANT EXECUTE … TO anon` on `settle_order`, so re-running
it after the others would have reopened settlement to the anon key. File 2 now
creates the `unique_open_order_id` constraint itself and stands alone.

**Verify:** run `supabase/postflight_checks.sql` in the SQL Editor. It is
read-only and every one of its eight rows must report `PASS`. It confirms that
row level security is on, that no table or function is reachable by `anon` or
`PUBLIC`, that all expected functions, tables and unique constraints exist, and
that the consumption worker is scheduled.

**Invoice prefix decision:** new invoice numbers use `branches.invoice_prefix`
(currently `KLT`, `VL`, `CK`), e.g. `KLT-2578`. If you want to keep the old
`INV-` style everywhere, run:
```sql
update branches set invoice_prefix = 'INV';
```
before the first settlement.

---

## 2. Rotate the leaked credentials

`.env` was committed to GitHub in three commits, so treat every value in it as
public. In this order:

1. **PrintNode** → console → API keys → create a new key, delete the old one.
2. **Google Workspace SMTP app password** → revoke the old app password, create a new one.
3. **Supabase anon key** cannot be rotated on its own; it is designed to be
   public and is now safe because RLS is enabled. Do NOT paste the
   service-role key anywhere client-side.
4. Update your local `.env` (see `.env.example`) — it is git-ignored now.

Optional but recommended: purge the secrets from git history with
`git filter-repo --path .env --invert-paths` (or BFG), then force-push and ask
collaborators to re-clone. If the repo has always been private and you rotate
everything above, this can wait.

---

## 3. Vercel environment variables

Add or update in **Vercel → Settings → Environment Variables** (Production and
Preview):

| Variable | Value |
|----------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | unchanged |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | unchanged |
| `PRINTNODE_API_KEY` | the NEW PrintNode key (remove `EXPO_PUBLIC_PRINTNODE_API_KEY` — it must not be public) |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Project Settings → API (server-only; required by `/api/staff/create`) |
| `ALLOWED_ORIGINS` | `https://dinein.grovit.com` (comma-separate extra origins, e.g. a preview domain) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | with the NEW app password |

Then **Redeploy** the project.

**Verify:** open the deployed app, sign in, open Settings → Approval policies
(loads via the authenticated API), and print a test bill.

---

## 4. Native builds (optional, when you are ready for TestFlight/APK)

`app.json` now has `ios.bundleIdentifier` / `android.package` = `com.grovit.pos`
and `eas.json` has development / preview / production profiles.

```bash
npx eas init
```
```bash
npx eas build --profile preview --platform android
```

---

## 5. After deployment — smoke test checklist

1. Log in as a **cashier**: create an order, Save & Print (invoice number appears in the new `<PREFIX>-NNNN` format), Settle. The order disappears only after the DB confirms.
2. Settle the same order again from a second tab: it must not create a second settlement (idempotent).
3. Log in as an **owner**: Analytics and Orders → History load; KPIs match.
4. Inventory → Recipes: press **Process pending deductions**; the result shows processed/failed/deferred counts. `select status, count(*) from inventory_consumption_batches group by 1;` should show batches moving to `Processed` within a minute even without pressing the button.
5. Transfers: dispatch more than the available stock — the app must refuse with "Not enough stock of …".
6. Staff → Add staff: works once `SUPABASE_SERVICE_ROLE_KEY` is set; shows a clear message otherwise.
7. Open the browser console on a cashier login and run
   `await supabase.from('bills').select('id').neq('branch_id','<own branch>')` — must return 0 rows (RLS).
8. Signed out, in a private window, run the same query with only the anon key.
   Before the migrations this returns thousands of rows; afterwards it must
   return none. `supabase/postflight_checks.sql` proves the same thing from the
   database side and is the more reliable check of the two.

---

## 6. CI

GitHub Actions now runs typecheck, lint, tests and a secrets guard on every push
and pull request (`.github/workflows/ci.yml`). Locally:

```bash
npm run check
```
