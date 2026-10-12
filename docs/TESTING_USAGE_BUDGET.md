# Testing within the Supabase allowance

Approved by the user on 9 October 2026: keep testing within the monthly allowance while preserving smooth app operation. This is a testing workflow, not a change to live polling, logging, workers or database settings. No monitoring automation is created.

## Current cycle and planning targets

Last confirmed dashboard reading: 9 October 2026, cycle 21 September–21 October. All projects: ingestion 0.597/1 GB, log queries 37.831/100 GB. Production/staging ingestion: 0.442/0.155 GB. See LOG_USAGE_REVIEW_2026-10-09.md for evidence.

- Aim to finish below **0.8 GB ingestion** and **80 GB log queries**, preserving a 20% buffer. These are internal warning targets, not Supabase's quota or an automatic hard cap.
- Approximately **403 MB ingestion** remains to the actual allowance. Over twelve calendar days that is about 33 MB/day; the 0.8 GB target leaves about 203 MB, or 17 MB/day across production and staging combined.
- Keep discretionary staging testing to a planning target of **5 MB/day ingestion growth**. This is part of the organization total, not an extra allowance or a measured cost per test. Platform idle logs also contribute. A meter increase cannot be attributed entirely to testing without further evidence.
- When either organization meter reaches 80%, or the recent ingestion rate projects over quota, use local/sample iteration for discretionary work and reduce live checks to essential changed flows. Report the risk; diagnose the actual source before changing runtime behavior.
- At each new cycle, record the new allowance, dates and baseline, then recalculate remaining daily headroom. Do not carry this cycle's daily numbers forward as fixed limits.

Production traffic is outside a test budget, and the dashboard may lag by an hour. This workflow reduces testing's contribution; it cannot guarantee total organization usage stays under quota.

## Default verification sequence

1. Read the task scope and select checks that cover its failure modes. Run typecheck and relevant lint/unit tests locally first. Mock Supabase in unit tests; do not attach live credentials to local regression suites. Run the required broader checks before release, or when failures/shared changes justify them.
2. For design alternatives and repeated spacing changes, use self-contained HTML/sample data or existing mocked fixtures. Do not build a new mock harness for a trivial edit if a focused live confirmation is sufficient.
3. Verify the environment is staging before live interactions. Reuse one app session and existing sign-in rather than spawning multiple authenticated test tabs. A localhost URL alone does not establish which database it uses; check the staging banner/environment. Never run write-based regression tests against production.
4. Plan one representative desktop/phone batch for the changed surface. Check loading, errors, empty recovery and affected controls where relevant. Make material corrections together; rerun only affected checks after corrections. Do not revisit settled states merely to accumulate screenshots.
5. Keep live exports and database fixtures focused: verify the affected export once, with the necessary boundary/paging/scoping cases handled by local tests or a single targeted staging fixture suite. Run essential migration/correctness/security verification even if the budget is tight; never substitute an unchecked financial or tenant-boundary release.
6. Close agent-created live test tabs after capturing the result. Keep a user-requested test page open when needed, preferably on the relevant non-polling screen. Avoid leaving visible Orders/KOT tabs unattended. Keep user-owned sessions and servers unless asked to stop them.

Existing browser configuration already uses one worker, no automatic retries, a reused server, and trace/screenshots only on failure. Preserve these settings. Select relevant specs/tests rather than routinely running every live E2E scenario; performance/load/soak tests need an explicit purpose and request budget.

## Log investigations and usage checks

Use the Usage dashboard for quota readings; opening the dashboard does not require scanning application logs. Reuse today's recorded baseline while it is fresh; check once before the day's live batch if it is older than 24 hours. After significant activity, compare with a later refreshed reading rather than repeatedly refreshing within the dashboard's reporting delay. Record dated readings in the task verification notes; do not store credentials.

For troubleshooting logs, start with one relevant project/service, explicit 5–30 minute start/end times and a specific endpoint/error filter. Prefer a compact aggregate over downloading raw payloads. Expand only if that window does not answer the question or a wider trend is essential. A row limit alone does not limit bytes scanned. Do not script log polling, leave broad log searches refreshing, rerun an identical query without new evidence or have multiple reviewers independently repeat the same cloud investigation. Share captured evidence with reviewers instead.

No database/log scan is necessary for documentation-only work. No new request, polling cadence, cron change or security-log suppression is introduced by this policy. Preserve current production behavior and existing diagnostic evidence.

Reference: [Supabase Logs Query optimization](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query).
