# Log usage review — 9 October 2026

Task 165. Read-only follow-up using the authenticated Usage dashboard, Supabase connection, current application source and official documentation. No runtime settings, production code, cron jobs, log retention or business data changed.

## Confirmed usage

Free organization Grovit AI, billing cycle **21 September–21 October 2026**. Dashboard can lag by one hour.

| Meter | Production | Staging | All projects / allowance |
| --- | ---: | ---: | ---: |
| Log ingestion | 0.442 GB | 0.155 GB | 0.597 / 1 GB |
| Log query | 9.838 GB | 27.993 GB | 37.831 / 100 GB |

About 403 MB remains for ingestion, or approximately 33 MB/day over the next twelve calendar days. The earlier 0.52 GB screenshot was recorded in the 5 October estimate; the roughly 77 MB increase over about four days suggests a lower recent pace than the initial cycle average. This rough comparison does not prove the fixes caused the reduction or guarantee the final total. Usage already accumulated cannot be removed retroactively.

Current dashboard labels both log meters Upcoming. Live official documentation says ingestion billing and log-query allowance enforcement begin after the grace period at the start of 2027. The documentation search connector returned older quota/pricing text; this review uses the current dashboard and live documentation instead.

## Configuration and activity

Both projects report: connections/disconnections off, statement logging DDL only, duration off, slow-statement logging disabled (-1), minimum messages warning, pgAudit none, temporary-file logging disabled. Autovacuum logging threshold is ten minutes. Lock-wait diagnostics remain on. No broad query/debug logger was found to turn down.

One bounded log aggregation per project covered **08:13:30–08:43:30 UTC (13:43:30–14:13:30 IST)**. These are event counts, not billed byte volumes; the window includes diagnostic/admin traffic and is not a daily traffic baseline. Staging returned 243 pooler events, 24 Postgres events and three successful Kitchen range-report requests. No branch_activity polling group appeared. Production's largest returned request group was 18 successful printer reads; it also returned 24 Postgres events. The top-30 aggregation is not an exhaustive error audit. Earlier evidence classified staging pooler events as local platform connection chatter; today's count alone does not establish their ownership or byte share.

Cron metadata confirms four active jobs in each project, no failures in the preceding 24 hours. The consumption worker ran 288 times at its existing five-minute cadence. Successful cron statement logging and run history are enabled. Reducing successful cron statement chatter is a possible small secondary optimization, but the documented setting requires a database restart; no change was made. Keep the worker, failure evidence and run history.

Current source retains shared foreground order polling, non-overlapping requests, slower history refresh and shared inventory reads. Kitchen data refreshes on entry/focus/save, with an existing concurrent-load guard; reports fetch on selection/change/refresh/export rather than on a timer. The recent layout changes did not introduce polling. See the earlier usage optimization and release records for their tests and release scope.

## Recommended next steps

1. Keep unused app/test tabs closed, especially visible Orders/KOT sessions. This avoids redundant requests while retaining current working-till refresh speed.
2. For Log Query, use one project/service and the smallest useful incident window. Most accumulated query scanning is staging investigation, not customer bill volume; agent investigations contribute too. Do not repeatedly refresh broad log searches. This review used two short log scans without polling.
3. Compare daily dashboard ingestion over a clean 24–48 hours before considering settings changes. Stay below roughly 33 MB/day for the remaining cycle; about 20 MB/day gives a buffer. This is a suggested manual comparison, not a created automation.
4. If pooler logging remains significant by billed volume while staging is quiet, take the project/time-window evidence to Supabase support. The app's browser console settings do not control managed pooler logs. No support message was sent.
5. Optional later: review successful cron logging during a planned maintenance window. Avoid disabling diagnostic/security logs, slowing live orders, disabling the stock worker or pausing staging while it is needed for development merely to reduce the meter.

Sources: [Logs Ingest](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest), [Logs Query](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query), [Postgres configuration](https://supabase.com/docs/guides/database/custom-postgres-config), [Logs pricing announcement](https://supabase.com/changelog/logs-usage-based-pricing).

No application tests were necessary for this read-only investigation and documentation change. The existing staging server and preview server were preserved, and the Usage page was restored to All projects.
