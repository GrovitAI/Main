# STAGING.md — a test copy of the database

> **Why**: a migration should be tried on a faithful copy before it goes near
> the live business (owner's ask of 2026-10-01).
> **What**: a second, free Supabase project ("Grovit Staging") that holds a
> copy of production, and the app running on this computer pointed at it.
> Production is only ever read to make the copy.

The live project is `pyikrlqduampooncpzri`. The staging project is
`inbxezmtuytpalqvlcsm` ("Grovit Staging", Mumbai), created on 2026-10-02.
Supabase preview branches need a paid plan and Docker is not installed here,
so the test environment is a second project in the same organisation. A
second project is free on the current plan. A free project pauses after a
week without use; "Restore" in the dashboard wakes it.

---

## 1. Set it up (once)

1. **Give staging a database password.** The project was created through the
   API, so nobody has seen its password. Supabase dashboard → Grovit Staging →
   Project Settings → Database → Reset database password, and choose one you
   will remember.
2. **Copy production into it.** In a terminal in this folder:

   ```bash
   powershell -ExecutionPolicy Bypass -File scripts\staging-clone.ps1
   ```

   It asks for two connection strings and stores neither. Get each from the
   dashboard: open the project → **Connect** → **Session pooler** → copy the
   URI and put the database password in place of `[YOUR-PASSWORD]`. A
   password with `@`, `:` or `/` in it must be URL-encoded (`@` is `%40`).

   If the production database password is not to hand, it can be reset under
   Project Settings → Database. Neither the app nor its server functions use
   it (they talk to the API with their own keys), so a reset does not disturb
   the tills.

   Staging already has the extensions production has, each in the same
   schema (`pg_trgm` in `public`, `pg_cron`); the script creates them again
   after a `-Refresh`.

   The script reads production with `pg_dump`, refuses to write to it, and
   loads staging with `psql`. It copies the structure and rows of the `public`
   schema and the sign-ins. It leaves behind printers, POS terminals and print
   jobs, so nothing done on staging can reach a real printer.
3. **Tell Claude the copy is done.** Claude then checks the copy against
   production, re-creates the scheduled jobs and applies the migrations that
   are waiting (to staging only).

## 2. Run the app against staging

`.env.development.local` (never committed; `.env.*` is ignored by git) is
already in this folder:

```
EXPO_PUBLIC_SUPABASE_URL=https://inbxezmtuytpalqvlcsm.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
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

### Browser tests against staging

Playwright drives the web app on this computer, signed in, against the
staging copy (`playwright.config.ts`, tests in `e2e/`). Once, sign in for it:

```bash
npm run e2e:login
```

A browser opens on the sign-in page; sign in as usual and close the window.
The session is saved in `playwright/.auth/owner.json` (never committed). Then:

```bash
npm run e2e
```

The tests create records named `E2E <stamp> …` on staging and remove what the
screens can remove. Without the saved session they are skipped, not failed.

## 3. Refresh the copy

Run the script again with `-Refresh` to replace staging with production as it
is today.

```bash
powershell -ExecutionPolicy Bypass -File scripts\staging-clone.ps1 -Refresh
```

After the copy the script applies, in order, every migration named in
`supabase/staging-pending.txt`: the ones staging has and production does not
have yet. A line is removed from that file once its migration is on
production.

Two things the first copy (2026-10-02) taught, both now in the script:

- **Permissions.** A new Supabase project hands every new table and function
  to the API roles by default, and a dump says only what to grant, so the
  first copy left staging more open than production (`anon` could reach every
  table). The script now switches those defaults off for the load. Rehearsed
  on a local database: the permissions then match production by checksum.
- **Extensions.** Production keeps `pg_trgm` in the `public` schema; the
  ledger's search indexes depend on that.

The scheduled jobs (consumption worker, balance snapshots, demo roll-forward,
log purge) were created on staging once, by hand, and survive a refresh.

## 4. From staging to production

Nothing moves on its own. When a change has been tried on staging and is
approved:

1. The migrations in `supabase/migrations/` that staging has and production
   lacks are applied to production one at a time, in order, each verified
   before the next (AGENTS.md, "Migration rules").
2. The branch is merged into `main` and pushed; Vercel deploys the web app.

## 5. A throwaway local database, for trying a migration first

A migration can be run against a copy on this computer before it goes even to
staging. PostgreSQL's own tools are installed (`C:\Program Files\PostgreSQL\18\bin`);
the files the clone script leaves in `%TEMP%\grovit-staging-<ref>` are the copy.

```bash
initdb -D <folder> -U postgres -A trust -E UTF8 --locale=C
pg_ctl -D <folder> -o "-p 54329 -c listen_addresses=localhost" -l <folder>.log start
psql -p 54329 -U postgres -v ON_ERROR_STOP=1 -f scripts/local-db/bootstrap.sql
psql -p 54329 -U postgres -d grovit -f %TEMP%\grovit-staging-<ref>\schema.sql
psql -p 54329 -U postgres -d grovit -c "SET session_replication_role = replica" -f %TEMP%\grovit-staging-<ref>\data.sql
psql -p 54329 -U postgres -d grovit -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/<file>.sql
psql -p 54329 -U postgres -d grovit -f scripts/local-db/finance-flows.sql
```

- `scripts/local-db/bootstrap.sql` stands in for the parts of Supabase the
  schema leans on: the API roles, `auth.uid()`, a storage bucket table.
- `scripts/local-db/finance-flows.sql` plays the finance flows as the owner, a
  branch admin, a branch manager and a visitor who is not signed in, and rolls
  everything back. Each step prints what it expects.
- `scripts/local-db/state-hash.sql` prints checksums of every function,
  policy, column and permission. Run on the local database and on staging,
  equal checksums mean the two hold the same definitions.

This is how the seven migrations below were first run (2026-10-02). It caught
one fault before staging saw it: a purchase on credit, and every dispatch,
would have failed, because a payable or receivable was posted without the
payment mode the ledger requires (fixed in task 121). Stop the server with
`pg_ctl -D <folder> stop` and delete the folder afterwards: it holds real data.

## 6. What is waiting

Migrations on staging and not yet on production, as of 2026-10-02, in order:

| File | What it does |
| :--- | :--- |
| `20260927000100_finance_inventory_links.sql` | Purchases and dispatches post to the ledger; offsets (task 110) |
| `20261001000100_finance_overview_from_ledger.sql` | Overview, Cash Book and Day Close read the ledger (111) |
| `20261001000200_finance_due_dates_counterparties.sql` | Due dates, dues summary, name picker (112) |
| `20261001000300_finance_cash_counts.sql` | Cash count and its posted difference (113) |
| `20261001000400_purchase_paid_by_branch_view.sql` | Paid by on purchases, the branch's side of dues, owner-only offsets (114) |
| `20261001000500_finance_entry_templates.sql` | Regulars (115) |
| `20261001000600_finance_receipts.sql` | Bill photos: a column, a private bucket, storage policies (116) |
| `20261004000100_central_kitchen.sql` | The Central Kitchen's own books: items, branches and vendors, entries, matches, posting and voiding functions (131) |
