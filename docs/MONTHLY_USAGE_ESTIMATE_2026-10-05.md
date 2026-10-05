# Supabase monthly usage estimate — 5 October 2026

Task 138. Read-only architecture and database audit. No application behavior,
database settings, migrations, retention or business records were changed.

## Assessment

The current business volume and two PCs leave substantial room in database
size, egress and active-user limits. Log ingestion is the constraint to watch:
the screenshot's average pace would narrowly exceed 1 GB. Recent staging
traffic makes that average unreliable, so staying below 1 GB cannot yet be
guaranteed. Log Query is comfortably below its limit at the average pace.

Use the user's likely **21 September–21 October** cycle, approximately 30 days.
At the time of this audit, nearly 15 days have elapsed. The user confirmed
that the screenshot selects **All projects**, so its accumulating meters
cover production and staging together. The actual billing dates remain the
user's tentative recollection and are not verified by the connected API.

## Screenshot baseline and cycle-end estimate

GB/MB below are decimal units. Approximately 14–15 elapsed days gives a
projection multiplier of 2.0–2.14 for accumulating monthly meters.

| Meter | Screenshot | Estimated at 21 October | Interpretation |
| --- | ---: | ---: | --- |
| Egress | 0.27 / 5 GB | 0.54–0.58 GB at the same average pace | About 11–12% of allowance; substantial headroom |
| Database size | 56 / 500 MB | Rough planning range 61–75 MB | Stored size, not a monthly counter; see growth model below |
| Monthly active users | 2 / 50,000 | Small staff population; not a bill/device counter | No meaningful capacity risk with current staffing |
| File storage | 0 / 1 GB | Near zero if receipt uploads remain unused | Stored files accumulate; new uploads change this forecast |
| Log ingestion | 0.52 / 1 GB | 1.04–1.11 GB at the same average pace | Slightly over allowance; recent staging may change the rate materially |
| Log Query | 20.1 / 100 GB | 40.2–43.1 GB at the same average pace | About 40–43%; depends on debugging activity, not bill volume |

These are conditional estimates, not a promise. The screenshot is the only
available measurement of quota-accounted bytes; log event counts and SQL
statistics do not provide the daily billing usage series.

Supabase's current public documentation matches the screenshot's 1 GB ingest
and 100 GB query allowances. It also currently says ingest billing and
log-query enforcement are in a grace period through the start of 2027. Treat
these caps as planning targets; the screenshot does not demonstrate an
imminent POS outage. The connected organization reports the Free plan.

Sources: [Logs Ingest](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest),
[Logs Query](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query).
The connector's documentation search returned older conflicting allowances;
the live public pages and supplied dashboard are used here.

## Actual workload

Production contains **7,191 Le Laban bills**, excluding the demo tenant.
From 21 September through 5 October, there are **1,373 newly created bills**:
886 in Kolathur and 487 in Velachery. Across these 15 local calendar dates,
that is about **92 bills/day** combined. The latest seven dates average about
102/day. Daily totals range from 61 to 153; busy weekends reach around 150.
Calendar-date grouping differs from the POS's overnight business-day grouping.
5 October was nearly complete when read.

Plan for roughly **2,750–3,100 bills in a 30-day cycle**, or around 1,400–1,700
additional bills by the assumed reset. This is a useful operating-volume
estimate, not a forecast of festival peaks. Staging has 6,813 copied business
bills and business data ending 2 October; those copied historical bills are
not extra live business turnover.

Current SQL database sizes are approximately **40.8 MB production** and
**35.8 MB staging**. Neither matches the screenshot's 56 MB exactly. Keep the
dashboard's quota meter as authoritative rather than substituting or adding
these differently scoped measurements.

The main sales tables, including their indexes and allocated space, occupy
about 18 MB for approximately 7,348 bills including demo data. For planning,
allow **3–6 KB of incremental storage per bill** across bills, items, orders,
tickets, payments and consumption batches. This is an allocation estimate,
not measured daily growth. The remaining bills imply approximately 4–10 MB
of sales-table growth; allowance for auxiliary records and allocation yields
the 61–75 MB planning range above. Inventory expansion, larger audit payloads
and bulk imports can invalidate it. There is no evidence requiring deletion
of sales or audit history to remain below 500 MB this cycle.

Both projects currently have zero Storage objects. Finance permits receipt
photos/PDFs up to 5 MiB each and uploads the chosen file without an image
compression step. At 1 MB/file, 10 new receipts/day would add about 300 MB
per 30 days; at 5 MB/file, about 1.5 GB. Replacement files use new paths, so
future attachment replacement/cleanup deserves review before heavy adoption.
Storage does not clear at the monthly reset. Viewing receipts also consumes
egress. MAU counts distinct authenticated users, not sales or repeated visits.

Sources: [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress),
[Monthly active users](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users),
[Database and disk size](https://supabase.com/docs/guides/platform/database-size).

## How the architecture consumes usage

| Feature | Current behavior | Usage implication |
| --- | --- | --- |
| Billing and settlement | Database writes/RPCs and reads when staff act | Scales mainly with bills/items; preserve write confirmation and error handling |
| Active Orders | Reads one branch change timestamp every 10 seconds while focused and foregrounded | Small egress, but each HTTP call generates a larger gateway log |
| Order summaries | Downloads today's orders/items/tickets when the timestamp changes, on explicit reload, or after a 10-minute safety interval | Avoids repeatedly downloading unchanged orders; keep the safety reload |
| Sales History | Paginated results, totals, items and payments; local code now refreshes every 60 seconds | Heavier than a timestamp check; filter/manual refresh remains immediate |
| Analytics | Four aggregate RPCs plus all raw bills and bill-item chunks on every load/filter change | CSV-only detail downloads add avoidable requests and bytes |
| Inventory | Loads entities required by the selected tab and refreshes on focus | No periodic polling found; mount/focus loaders can overlap before data is marked loaded |
| Central Kitchen | Shared store; five service loads on initial/focus/save refresh; recent entries cover 92 days with a 500-row cap | No periodic polling found; navigation/saves drive traffic |
| Finance | Reports/ledger reads on navigation/filter/action; receipt files uploaded/opened on demand | No periodic polling found; attachment adoption is the main storage uncertainty |
| Printer health | Five-minute check while billing is focused | Much smaller cadence; request overlap guarded in local code |
| Auth | SDK token refresh with foreground handling for native | Needed for reliable sessions; not a reason to remove authentication |
| Cron | Consumption every 5 minutes, two daily jobs, weekly history purge | Runs even when no till is open; already substantially reduced |

No application Realtime subscriptions or scripted log-search polling were
found in the inspected source. Clock/countdown timers update local UI and do
not query Supabase. Browser console messages are not automatically this
Supabase ingestion meter.

Two PCs do not imply two continuously active Orders screens. If both PCs
leave that screen visible, scheduled timestamp checks are approximately:

| Orders visible per PC per day | Combined checks/day | Checks/30 days |
| --- | ---: | ---: |
| 2 hours | 1,440 | 43,200 |
| 6 hours | 4,320 | 129,600 |
| 12 hours | 8,640 | 259,200 |
| 15 hours | 10,800 | 324,000 |

Formula: 2 PCs × visible hours × 360 checks/hour. Explicit loads are additional.
Leaving a visible Orders screen idle still polls; switching away/backgrounding
stops it. Ordinary time spent on the billing screen is not counted here.

## Measured source of excess traffic

Fixed log window: **4 October 18:20 UTC–5 October 18:20 UTC**.

| Measurement | Production | Staging |
| --- | ---: | ---: |
| API gateway events | 5,179 | 19,648 |
| Branch-activity checks | 109 | 18,917 |
| Postgres events | 1,161 | 1,168 |
| Pooler events in returned sources | 0 | 11,592 |
| Cron failures in preceding 24 hours | 0 | 0 |

**96% of staging gateway events are order-change checks.** Earlier hourly
inspection found approximately four ten-second loops running concurrently.
The previous investigation traced them to localhost Chrome testing; logs
cannot distinguish separate tabs from duplicate mounted screens on their own.
The window includes old loops and the local restart, so it is not a clean
post-fix day. Production's observed Orders traffic is much lower than the
continuous two-screen scenarios above.

For relative source size, summing returned event text and serialized attributes
gave roughly **19.5 MB production** and **65.7 MB staging** for this window.
Gateway events dominate both. These sums are **not quota-accounted ingest**:
they exclude other accounting fields/processing and cannot be used to assert
a GB forecast. They reinforce that staging is a significant source to examine.
Gateway logs averaged approximately 3.1–3.6 KB of these returned fields per
event; that log record is much bigger than the timestamp response body.

Staging was created 2 October, so it has not contributed evenly throughout
the assumed cycle. A straight-line month estimate can understate its new
ongoing contribution. Exact combined prediction requires the dashboard's
daily ingest bytes, broken down by project.

Log Query counts bytes scanned when inspecting logs in Studio, APIs or tools.
It is distinct from normal application SQL queries. This audit's log reads
also contribute to that meter. Narrow time/source filters reduce diagnostic
scanning; returning fewer rows alone does not establish fewer scanned bytes.

## Small changes and operating habits to prioritize

1. **Use the existing polling fix and close unused staging sessions.** Task
   137 is committed locally (`792241f`), not confirmed deployed in production.
   It deduplicates same-runtime Orders polling and prevents overlapping async
   polls. Separate tabs/PCs remain separate. A staging reload was tested:
   its own Active Orders checks stopped after switching to History, and
   History refreshed at about one minute. Keep the 10-second active cadence;
   no further responsiveness reduction is supported by this audit. Any
   production release needs its normal review because this branch also
   contains Central Kitchen work.
2. **Fetch transaction CSV rows when Export is requested.** Charts/KPIs use
   aggregate RPCs, not `rawTransactions`. Export visibility and its handler
   currently depend on preloaded rows, so update them together with an
   export loading/error state. Around 3,000 bills currently require about
   3–4 bill pages plus 60 item requests per dashboard load, besides the four
   aggregate RPCs. Deferral preserves CSV contents while avoiding this work
   during chart browsing. Retain tenant/branch enforcement when refactoring.
3. **Deduplicate in-flight inventory entity loads.** The initial effect and
   focus effect can request the same still-loading entities. Share the pending
   promise per entity and branch; retain immediate focus/manual refresh and
   error retry. This is a code-level opportunity, not measured major waste.
4. **Use short, targeted log investigations.** Query the relevant project,
   service and incident period. Avoid leaving unnecessary wide log searches
   refreshing. No app workflow changes are needed to reduce this meter.
5. **Review receipt sizes when uploads start.** Optional photo resizing can
   help later, provided invoices stay readable and originals/PDF handling are
   deliberate. It is not a current priority with zero uploaded objects.

Postgres already has connection/disconnection logs off, statement logging
limited to DDL, duration logging disabled, pgAudit logging off and minimum
messages at warning. Cron run history is purged weekly beyond seven days.
Retain useful failure diagnostics and the existing five-minute stock worker.
The observed local pooler login/close chatter appears platform-owned; escalate
to Supabase if daily billed ingestion remains high after staging waste ends.
Changing app console logging would not address it.

The performance advisor returned informational unindexed-FK/unused-index
findings only: 69/19 in production and 84/35 in staging. These are not evidence
that adding or removing all suggested indexes would help. Diagnose a specific
slow query and its current plan before making an index migration. Historical
query means, especially ledger KPIs, include older implementations and cannot
be treated as today's latency.
References: [Foreign-key advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[Unused-index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Remaining-cycle budget and verification

Using **16 days remaining** conservatively from the screenshot:

| Meter | Remaining allowance | Average daily budget until reset | Budget for finishing below 80% |
| --- | ---: | ---: | ---: |
| Egress | 4.73 GB | 296 MB/day | 233 MB/day |
| Log ingestion | 0.48 GB | 30 MB/day | 17.5 MB/day |
| Log Query | 79.9 GB | 5.0 GB/day | 3.74 GB/day |

Check Usage with the actual billing dates and **All projects**, then compare
daily billed ingest for production and staging separately. After old staging
sessions are closed/reloaded, compare the next 24–48 hours of daily meters.
Below approximately 30 MB/day gives room to finish this cycle within 1 GB;
around 18 MB/day provides a useful buffer. Recalculate against the meter at
that time: already-ingested/scanned bytes cannot be removed retroactively.
Normal idle platform logs still exist even with the app closed.

This is a manual verification step, not a scheduled automation. Database
size/file storage need periodic size checks rather than multiplication by
elapsed days; MAU needs a staff-account estimate. Code audit, read-only SQL
aggregates, targeted logs and performance advisors supplied the evidence.
No application tests were run for this documentation-only task.
