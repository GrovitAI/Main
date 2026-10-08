# Central Kitchen Analytics — staging implementation

Task 157, 2026-10-08. The user selected the HTML **Report workspace** and
authorized implementation in staging. Branch: `codex/kitchen-analytics`.
Production application/database and its completed data reset are unchanged.

## Try it

Run `npm run staging` and open `http://localhost:8081/central-kitchen/home`.
Home → Analytics opens `/central-kitchen/analytics`. The local API runs on
8083. The staging banner must say TEST DATABASE. Kitchen staff and owner/admin
use the existing kitchen role/scope gate. No new staff permissions are granted.

Analytics has Sales, Purchases and Cash reports. Month navigation uses the
India calendar; current month excludes entries dated after today. Past and
future selected months cover their calendar month. Opening balances are not
period activity. The summary strip covers the whole period; **Filtered total**
covers the active report/filter selection.

- Sales: supplied item quantity and value by branch/item. Units remain per item.
  Select a row for its send entries.
- Purchases: category totals, with category/vendor filters and entry drilldown.
  Spending can include direct expenses, explicitly identified as Other expense.
  A shared label across purchase/expense categories forms one combined category
  row labelled with both sources; drilldown and export reconcile to that row.
- Cash: recorded collections, vendor payments, paid-on-entry purchases and
  direct expenses. Later payments never increase purchase totals.
- CSV: a fresh, filtered detailed report and total from one database snapshot.
  Ordinary reports return 50 rows per page; export is limited to 10,000 rows
  with a friendly request to narrow the filters. Native uses Share for CSV text.

## Categories

Manage categories from the Purchases report, or add one inside a vendor/buy
form. Vendors have a default; each buy can override it or choose Uncategorized.
The build follows the approved preview's one category per purchase. The
optional question about multiple categories per invoice remains unanswered;
line-level categories require a separate requirement/schema change.

Saved purchases snapshot both category ID and name. Renaming/archiving a
category or changing a vendor default does not rewrite history. Keeping the
category during an edit keeps the saved name, including an archived category.
New buys require an active category or Uncategorized. Archive/restore replaces
hard deletion. Renaming an archived category preserves its archived state.
Historical buys remain Uncategorized; there is no inferred backfill.

## Database and performance

Applied sequentially and verified on staging project `inbxezmtuytpalqvlcsm`:

1. `20261008061518_kitchen_purchase_categories.sql`: scoped category table,
   RLS/explicit grants, vendor reference, entry snapshots, atomic post/edit RPCs.
2. `20261008061650_kitchen_monthly_reports.sql`: scoped active-date index and
   security-invoker monthly report RPC under existing kitchen RLS.
3. `20261008064237_kitchen_reports_month_to_date.sql`: India current-month
   cutoff and bounded export materialization.
4. `20261008065451_kitchen_spending_category_totals.sql`: combine matching
   category labels across purchase/expense sources so row drilldowns reconcile.

These files are in `supabase/staging-pending.txt` so a staging clone restores
them. No migration was applied to production. Every service read/write/RPC
includes tenant and kitchen branch scope derived from the current session.
The category table denies anon access and authenticated DELETE; report RPC
denies anon execution. Existing authenticated kitchen authorization applies.

Reports aggregate on the server, refresh on filters/explicit Refresh, cancel
stale requests and fetch details only on drilldown/export. No new polling or
Realtime subscription. Categories are one small master-list read in the
existing shared kitchen load, including archived names for saved forms.

## Validation

- TypeScript typecheck passed.
- Full existing Jest suite passed: 256 tests, 27 suites. After adding the two
  new native route imports, focused route smoke checks passed (18 routes).
- Five report unit tests cover India date/year boundaries, Postgres numeric
  parsing, unsafe/incomplete payload rejection, exact CSV totals/units and
  spreadsheet formula neutralization.
- Lint passed with 0 errors; 166 existing warnings before the added route
  imports. The project uses require-based route tests, with existing lint
  warnings for that style.
- `supabase/tests/kitchen_monthly_reports.sql` passed as authenticated kitchen
  staff, using scoped metadata-derived IDs and rollback-only fixtures. Covers
  current-month future exclusion, invalid category denial, vendor defaults and
  overrides, same-label purchase/expense aggregation and drilldown,
  immutable snapshots after rename/archive/edit, void/replacement,
  mixed units, cash double counting, pagination, filtered export reconciliation,
  archived branch history, tenant/branch denial and calendar boundaries.
- Staging security advisors returned no ERROR findings. Existing warnings
  (security-definer RPCs, search paths and auth settings) remain outside this task.
- Browser checks: Sales/Purchases/Cash, branch search/filter, sales/purchase
  drilldown, combined spending total and category manager empty state.
  Desktop, phone-sized web and actual 979px app-panel evidence are in the
  Git-ignored `.impeccable/review/` directory. Static design detector returned `[]`.

The independent Impeccable finish review requested compact intermediate/phone
density, phone value labels and tabular/directional figures. Its verdict scored
those four fixes resolved, then a phone label-size regression resolved, ending
with **ship** for the scored fixes. This is a scoped UI verdict, not certification
of production readiness or actual download/native behavior. Root design files
remain incumbent; no new visual identity or shipping raster was introduced.
The independent documenter checked the finished components against PRODUCT.md,
DESIGN.md, brand/Tailwind tokens and the sidecar. No design-system files changed;
pre-existing sidecar descriptions remain documented drift outside this task.

The CSV button completes without a visible error or console error, and SQL/CSV
tests verify payload reconciliation. The in-app browser did not expose a
completed Blob download event/file, so real-browser file-save is not certified.
Native routes load in Jest; iOS/Android device rendering and native Share have
not been tested on hardware. No production-readiness claim follows from web QA.

## Release boundary

Client testing in staging comes next. Production promotion is a separate
release: apply the four reviewed migrations in order and verify each before
deploying this application version, because its kitchen reads require the new
columns/table. Roll back the app to the previous release if needed; retain the
additive columns/categories rather than dropping user category history. For
RPC rollback, use the previous post/edit definitions from migration
`20261004000200_kitchen_categories_and_edit.sql`; no destructive schema rollback
is needed. Keep the production reset backup private and Git-ignored.
