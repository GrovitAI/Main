# STAGING.md — a test copy of the database

> **Why**: a migration should be tried on a faithful copy before it goes near
> the live business (owner's ask of 2026-10-01).
> **What**: a second, free Supabase project ("Grovit Staging") that holds a
> copy of production, and the app running on this computer pointed at it.
> Production is only ever read to make the copy.

The live project is `pyikrlqduampooncpzri`. Supabase preview branches need a
paid plan and Docker is not installed here, so the test environment is a
second project in the same organisation. A second project is free on the
current plan. A free project pauses after a week without use; "Restore" in
the dashboard wakes it.

---

## 1. Set it up (once)

1. **Create the project.** Supabase dashboard → New project → name
   `Grovit Staging`, region Mumbai (`ap-south-1`), and choose a database
   password you will remember.
2. **Copy production into it.** In a terminal in this folder:

   ```bash
   powershell -ExecutionPolicy Bypass -File scripts\staging-clone.ps1
   ```

   It asks for two connection strings and stores neither. Get each from the
   dashboard: open the project → **Connect** → **Session pooler** → copy the
   URI and put the database password in place of `[YOUR-PASSWORD]`. A
   password with `@`, `:` or `/` in it must be URL-encoded (`@` is `%40`).

   If the production database password is not to hand, it can be reset under
   Project Settings → Database. The app does not use it (it talks to the API
   with its own keys), so a reset does not disturb the tills.

   The script reads production with `pg_dump`, refuses to write to it, and
   loads staging with `psql`. It copies the structure and rows of the `public`
   schema and the sign-ins. It leaves behind printers, POS terminals and print
   jobs, so nothing done on staging can reach a real printer.
3. **Tell Claude the staging project ref.** Claude then checks the copy
   against production, re-creates the scheduled jobs, applies the migrations
   that are waiting (to staging only), and writes `.env.development.local`.

## 2. Run the app against staging

`.env.development.local` (never committed; `.env.*` is ignored by git):

```
EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<staging publishable key>
EXPO_PUBLIC_APP_ENV=staging
```

Expo reads this file only for `expo start`, never for a build, so it cannot
leak into a release. Then:

```bash
npx expo start --web --port 8081
```

Open http://localhost:8081 and sign in with the same email and password as on
production: the sign-ins were copied. An amber strip reading **TEST
DATABASE** sits at the top of every screen while the app is on staging.

To go back to the live database on this computer, delete
`.env.development.local` and restart the dev server.

What does not work on localhost: anything served by the Vercel functions
under `/api` (approval emails, PrintNode printing, staff invitations). They
are not part of the Expo dev server. Finance, Inventory, POS billing and
Analytics talk to the database directly and work in full.

## 3. Refresh the copy

Run the script again with `-Refresh` to replace staging with production as it
is today. Migrations not yet on production then need applying to staging
again.

```bash
powershell -ExecutionPolicy Bypass -File scripts\staging-clone.ps1 -Refresh
```

## 4. From staging to production

Nothing moves on its own. When a change has been tried on staging and is
approved:

1. The migrations in `supabase/migrations/` that staging has and production
   lacks are applied to production one at a time, in order, each verified
   before the next (AGENTS.md, "Migration rules").
2. The branch is merged into `main` and pushed; Vercel deploys the web app.

Migrations waiting as of 2026-10-01, in order:

| File | What it does |
| :--- | :--- |
| `20260927000100_finance_inventory_links.sql` | Purchases and dispatches post to the ledger; offsets (task 110) |
| `20261001000100_finance_overview_from_ledger.sql` | Overview, Cash Book and Day Close read the ledger (111) |
| `20261001000200_finance_due_dates_counterparties.sql` | Due dates, dues summary, name picker (112) |
| `20261001000300_finance_cash_counts.sql` | Cash count and its posted difference (113) |
| `20261001000400_purchase_paid_by_branch_view.sql` | Paid by on purchases, the branch's side of dues, owner-only offsets (114) |
| `20261001000500_finance_entry_templates.sql` | Regulars (115) |
| `20261001000600_finance_receipts.sql` | Bill photos: a column, a private bucket, storage policies (116) |
