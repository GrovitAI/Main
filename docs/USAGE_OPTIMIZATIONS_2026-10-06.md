# Usage optimizations implemented — 6 October 2026

Task 139. Follow-up to `MONTHLY_USAGE_ESTIMATE_2026-10-05.md`.

## Implemented

- Closed the idle localhost Orders tab exposed by Codex's browser controls.
  Its tab inventory was empty afterwards. The independent Chrome session
  observed in the earlier audit is not exposed to these controls; its current
  tab state and closure cannot be verified here.
- Analytics now fetches only its four aggregation RPCs when loading charts or
  changing filters. Transaction details load when Export is pressed, including
  pagination beyond 1,000 bills and beyond 1,000 items in a chunk.
- Export reads live in `src/lib/pos/analytics-export-service.ts`. Existing
  tenant scoping, owner-only all-branch reporting and non-owner branch scope
  are retained. Item queries additionally filter through the parent bill's
  tenant/branch using an inner join because bill_items lacks those columns.
- A failed page/item request rejects the entire export with a friendly retry
  message. The screen shows loading, prevents repeat clicks and handles empty
  results. The export captures the loaded filter range; changing filters or
  leaving the screen suppresses an outdated completion. CSV columns, values
  and date rules remain the existing ones.
- The `rawTransactions` dashboard field remains for type/import compatibility,
  but is deprecated and empty; its only previous consumer now uses the export
  service. Item-wise CSV still uses already-loaded aggregate results.
- Inventory shares in-flight entity requests within the hook, keyed by branch,
  load generation and entity revision. Initial/focus loads and overlapping tabs
  reuse the same pending read. Branch changes discard late old responses.
  Explicit post-save refresh increments a revision and starts a fresh read
  immediately; an old response cannot overwrite the new data or keep its
  loading indicator active. Failed entities remain retryable. Cleanup prevents
  requests applying after unmount.

## Verification

- TypeScript passes.
- Full Jest suite: 23 suites, 226 tests passed. After the final loading-state
  refinement, the six inventory regression tests passed again.
- Lint passes on the new export service, inventory hook and new tests.
  The touched Analytics screen retains ten existing lint warnings and no errors.
- Staging web Analytics loaded the initial seven-day dashboard and a thirty-day
  dashboard without error. The thirty-day export showed its loading state and
  saved `grovit_sales_report_2026-09-07_to_2026-10-06.csv` to Downloads:
  **2,251 rows, 9 columns, 222,791 bytes**, with no blank item summaries.
- A read-only database count for the identical tenant/date/status predicates
  matched exactly: 2,204 paid and 47 cancelled bills. Export row totals are
  validated against its existing query rules, not assumed equal to dashboard
  KPI definitions.
- Targeted staging gateway logs from **00:16–00:21 IST, 6 October** show two
  calls to each aggregate RPC (initial load and filter change). There were no
  bill/item reads until the export action at approximately 00:18:55 IST.
  Export then used 3 bill-page GETs and 46 item-chunk GETs, all successful.
  Each also produced an OPTIONS preflight event; those are not duplicate GETs.
  For this dataset, chart browsing avoids 49 detail GETs and their associated
  preflight events per load that would otherwise fetch this export range.
- Staging Inventory displayed its dashboard normally with loading completed.
  Regression tests exercise concurrency, refocus, post-save refresh, A→B→A
  branch changes, shared reads across tabs and failure/retry behavior.
- The temporary verification tab was closed at completion to avoid leaving a
  test session running.

## Rollout and remaining measurement

These changes are in the local development checkout and used by the local
staging app. No production deployment, database configuration, migration,
retention change or business-data mutation was performed. The existing task
137 active-order polling protections remain; the 10-second cadence and
settlement workflow were not altered.

Central Kitchen's pre-existing uncommitted changes are kept separate. A
production release still needs the appropriate reviewed change set rather
than publishing this entire feature branch incidentally.

Daily billed ingestion must still be compared over a clean 24–48 hours.
Successful request reduction is verified; exact billing-byte savings and
remaining monthly headroom cannot be asserted from event counts alone.
The previous approximately 30 MB/day remaining-cycle budget should be
recalculated from the then-current All projects usage meter and confirmed
billing dates. No ongoing monitoring automation was created.
