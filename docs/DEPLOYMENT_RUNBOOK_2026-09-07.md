# Deployment Runbook — Audit Remediation (2026-09-07)

Everything in this runbook is a step that only you can do (it needs the Supabase
dashboard, the Vercel dashboard, third-party consoles, or a decision). Do them
in order. Each step says how to verify it.

> Until steps 1–3 are done, the deployed app will NOT be able to settle bills,
> print, request approvals or create staff, because the new code expects the
> new database functions and authenticated API endpoints.

---

## 0. Before you start

- Pull `main` (commits `task 18` … `task 3x`).
- Have the Supabase project open: **SQL Editor** and **Database → Extensions**.
- Have the Vercel project open: **Settings → Environment Variables**.

---

## 1. Run the database migrations (Supabase SQL Editor)

Run each file **in this order**, one at a time, whole file per run. Every file is
re-runnable (idempotent). Read the "NOTICE" lines in the result pane.

| # | File | What to check in the output |
|---|------|-----------------------------|
| 1 | `supabase/migrations/20260906120000_settle_order_rpc.sql` | (already run if you did it after task 19; safe to re-run) |
| 2 | `supabase/migrations/20260907000100_rls_policies.sql` | Final SELECT lists every table with `rls_enabled = true` and `policies = 4` (branch_counters/api_rate_limits come later). |
| 3 | `supabase/migrations/20260907000200_sequences_and_settle_order_v2.sql` | Final SELECT lists historical duplicate invoice numbers (140+ expected). These are pre-existing; new bills cannot duplicate. Decide whether to renumber them manually. |
| 4 | `supabase/migrations/20260907000300_ledger_kpis_indexes_hardening.sql` | If you see `settlements has duplicate bill_id rows`, run the duplicate-cleanup query pattern from `scratch/clean-duplicate-bills.sql` adapted to settlements, then re-run. |
| 5 | `supabase/migrations/20260907000400_consumption_worker.sql` | If you see `pg_cron is not enabled`, enable **pg_cron** in Database → Extensions, then re-run only section 3 of the file. |
| 6 | `supabase/migrations/20260907000500_transfer_rpcs.sql` | No errors. |
| 7 | `supabase/migrations/20260907010000_finance_module.sql` | Optional, for the finance module. Adds columns to `expenses`, creates `expense_categories`, `refunds` and `finance_day_closures`, and enables RLS on them. The finance screens work read-only until it is run. |

**Verify:** in the SQL editor run

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in
 ('settle_order','assign_order_numbers','next_kot_number','get_bills_ledger_kpis',
  'process_consumption_batches','run_consumption_worker','create_dispatch','receive_dispatch','check_rate_limit');
```
All nine names must be returned. Then `select * from cron.job;` must show `grovit-process-consumption-batches`.

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

---

## 6. CI

GitHub Actions now runs typecheck, lint, tests and a secrets guard on every push
and pull request (`.github/workflows/ci.yml`). Locally:

```bash
npm run check
```
