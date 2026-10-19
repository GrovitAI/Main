# Log usage plan — 19 October 2026

Task 269. User requested a plan for rising ingestion and log-query usage until
the next cycle. Read-only Usage dashboard review and local source inspection;
no application or database settings changed and no log scans were run.

## Confirmed dashboard baseline

Grovit AI Free organization. Current cycle: **21 September–21 October 2026**.
All projects was restored after reading each project's summary. The meter
can lag by up to an hour; reset time within 21 October was not shown.

| Meter | Production | Staging | Organization / allowance |
| --- | ---: | ---: | ---: |
| Log ingestion | 0.572 GB | 0.246 GB | 0.818 / 1 GB |
| Log query | 18.672 GB | 28.560 GB | 47.232 / 100 GB |

Ingestion is at 81.8%, beyond the existing internal 80% warning threshold.
Approximately 182 MB ingestion and 52.768 GB query allowance remain. Staging
accounts for about 30% of ingestion and 60% of log scans; this split does not
identify individual log sources or prove which activity caused the increase.

The 9 October dashboard showed 0.597 GB ingestion and 37.831 GB queries.
The increase over approximately ten calendar days is 221 MB ingestion
(22.1 MB/day) and 9.401 GB query scans (0.94 GB/day). Extending that average
for roughly two days suggests about **0.86 GB ingestion / 49.1 GB queries**
at cycle end. This is a rough planning estimate, not a guarantee: timestamps,
meter lag, uneven traffic and a future spike can change it.

## Until 21 October

1. Keep the local staging app/API and project preview stopped, as requested.
   Their process trees/listeners were verified stopped earlier on 19 October.
   Production and hosted Supabase jobs/services remain active and can log.
2. Use local unit checks, mocked services and static previews for discretionary
   development. Reuse a single staging session only for essential changed-flow,
   release, financial correctness or security verification, then close it.
3. Avoid routine Logs Explorer searches and repeated broad scans through agents,
   the CLI or APIs. For a real incident, use one relevant project/service and an
   explicit 5–30 minute window. Normal app SQL/report queries do not themselves
   count as Log Query scans, although app requests contribute generated logs.
4. Manually compare the Usage dashboard tomorrow, then confirm the new cycle
   after it begins. This is a recommendation, not a scheduled automation.
   Aim for roughly 25 MB/day combined ingestion growth until reset. If it jumps
   above 0.90 GB or rises fast enough to project over 1 GB before reset, perform
   one targeted incident investigation and identify the source before changing
   anything. The 0.90 GB trigger is an escalation guideline, not a new quota.
5. Preserve live POS refresh, stock processing and diagnostic/security evidence.
   No broad logging shutdown, worker slowdown or production pause is justified
   by the present remaining-cycle estimate. Closing servers reduces future
   traffic; it does not subtract usage already counted.

## Next cycle

Record the fresh dates/allowances/baseline first. If the displayed next cycle
is 21 October–21 November and the allowances stay the same, 0.8 GB over its
31 days is about 26 MB/day combined, preserving a 20% monthly buffer. Keep the
existing 5 MB/day discretionary staging growth target inside that total, with
local/mocked iteration by default. These are planning goals, not byte attribution
for individual tests or caps on necessary production activity.

If quiet staging still shows meaningful growth over a clean 24–48 hours, compare
per-project daily usage before running one narrowly scoped source investigation.
Review repeated failures, duplicate active sessions and avoidable requests first.
The 9 October logging/cron configuration audit is historical, not a fresh check;
do not assume those values are still current or change settings on that basis.
Current kitchen store source retains a concurrent-load guard and stale-on-focus
refresh rather than a data-fetch interval; no runtime edit was made here.

## Current billing distinction

The dashboard marks both log meters Upcoming. Current official docs state that
ingestion billing and query-allowance enforcement begin after the grace period
at the start of 2027. Log Query is not billed directly. This observation concerns
these log meters, not every other Free plan resource or future policy changes.
Monthly usage accounting begins afresh with the new billing cycle; deleting
records/logs or reducing retention would not undo previously counted bytes.

Sources: [organization usage](https://supabase.com/dashboard/org/qvrvmhzakjuxvfqhvakp/usage),
[Logs Ingest](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest),
[Logs Query](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query).

No app server was restarted, no business data read/written through SQL, no
production deployment/configuration was changed, and no app test suite was
needed for this documentation-only review. Existing unrelated working changes
are preserved.
