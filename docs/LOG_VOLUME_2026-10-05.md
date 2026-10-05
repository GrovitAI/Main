# Supabase request and log volume — 5 October 2026

Task 137. Both projects inspected read-only through the Supabase connection.
No database settings, migrations, retention policies, or business data changed.

## Environment

Expo's development environment loader resolves `.env.development.local` before
`.env`: development points to `inbxezmtuytpalqvlcsm` (Grovit Staging), while the
base environment points to `pyikrlqduampooncpzri` (production). No credentials
are needed in this report. Both projects reported `ACTIVE_HEALTHY`.

## Evidence

Log window: 4 October 17:51:31 UTC through 5 October 17:51:31 UTC
(23:21:31 IST on each date). Source totals were collected moments before this
fixed window was selected, so small boundary differences are possible.

| Measurement | Production | Staging |
| --- | ---: | ---: |
| API gateway log events | 5,510 | 20,367 |
| Successful GETs to `/rest/v1/branch_activity` | 101 | 19,503 |
| Postgres log events | 1,161 | 1,172 |
| Pooler log events in the returned sources | 0 | 11,592 |
| Database size (`pg_database_size`) | 40,807,571 bytes | 35,763,891 bytes |
| Cron failures in the last 24 hours | 0 | 0 |

The staging order-change check accounts for approximately 96% of API events.
Its referer was `http://localhost:8081/`, with Chrome on Windows as the agent.
For much of the window it ran approximately 1,400 times per hour; one loop
at the configured ten-second interval would make 360 requests per hour.
This is consistent with about four concurrent polling loops, but logs alone
cannot distinguish several tabs from several mounted copies in one tab.
The last such request in this window was at 08:44:10 UTC (14:14:10 IST).

The staging query's cumulative mean execution time was 1.584 ms over 31,767
calls. Frequency, rather than the cost of this indexed single-row check, is
the main issue found here. These query statistics are cumulative, not a
24-hour measurement.

All 11,592 pooler events referenced the local `postgres/pgbouncer@[::1]`
connection. They included 5,760 login attempts, 5,760 client closes and no
messages matching `error` or `failed`. This appears to be infrastructure
connection chatter, not repeated application SQL errors. Changing the app's
browser console logging would not remove these messages.

Both projects already have the task 107 five-minute consumption job and
weekly cron-history purge. The staging consumption job produced 576 normal
start/completion lines. Connection/disconnection logging is off in Postgres,
`log_statement` is `ddl`, and `pgaudit.log` is `none`. Staging has no replication
slots. Database size does not include every disk or billing usage category;
the exact dashboard warning was not supplied.

Production's cumulative statistics since 21 May rank `get_bills_ledger_kpis`
highest among the inspected API RPCs (1,851.874 ms mean, 4,623 calls). That
history may include older implementations; it does not establish current
latency. The history polling reduction below also reduces calls to this RPC.

## Changes

- Active Orders copies share a polling budget within one app runtime, so
  duplicate mounted screens cannot independently poll the same shared store.
- An asynchronous poll must finish before its next poll starts. The guard
  survives background/foreground transitions and, for shared polling, remounts.
- Existing screen-focus and foreground checks remain in place. Separate
  browser tabs still have separate runtimes; hidden tabs stop through AppState.
- Sales History refreshes every 60 seconds instead of every 10 seconds.
  This reduces scheduled history reloads from 360 to 60 per hour (83%).
  Filter changes and manual refresh still load immediately. History results
  remain local to each screen and do not share the Active Orders budget.
- Printer-health polling now returns its promise to the interval hook so
  slow checks cannot overlap.

The earlier uncommitted Central Kitchen back-navigation change is separate
from task 137 and is preserved. It avoids adding another main-app copy.

## Validation and rollout

Regression tests cover slow requests, background/focus transitions, rejected
requests, cleanup, cadence changes, four duplicate screens, pending requests
across remounts, and switching from shared Active Orders to local history.
TypeScript and the full unit test suite pass; repository lint has existing
warnings and no errors.

These are local code changes, not a production deployment. Reload the local
development app to discard old navigation stacks. Under steady foreground use,
one app runtime should issue no more than approximately 360 scheduled
order-change checks per hour, plus explicit loads. Four same-runtime loops
should therefore fall to one. This expectation is covered by tests, not yet
measured in post-deployment traffic. A visible history screen can be up to
60 seconds behind new transactions unless manually refreshed.

For a comparable later window, use Supabase's read-only `query_logs` with
explicit start/end timestamps no more than 24 hours apart:

```sql
select
  toStartOfHour(timestamp) as hour,
  log_attributes['request.path'] as path,
  count() as requests
from logs
where source = 'edge_logs'
  and log_attributes['request.method'] = 'GET'
  and log_attributes['request.path'] in (
    '/rest/v1/branch_activity', '/rest/v1/bills'
  )
group by hour, path
order by hour, path
limit 100;
```

See [Supabase log-query documentation](https://supabase.com/docs/guides/observability/advanced-log-filtering).
The unexplained dashboard limit and platform-owned pooler noise remain distinct
from the application polling fixes; no logs were deleted or disabled.
