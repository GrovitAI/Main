# Kitchen Analytics layout proposals

Exploration completed 9 October 2026. The standalone [interactive preview](kitchen-analytics-layouts.html) explores placing KPI cards below the date/filter pane on desktop and phone. All three options preserve that order. **The user selected Report first (layout B) on 9 October 2026; task 164 implemented it in staging.** Period first remains the preview's original recommendation. See [the staging record](../KITCHEN_ANALYTICS_STAGING.md#task-164--report-first-layout) for application verification and the release boundary.

## Open and compare

While the local preview server is running, open [Kitchen Analytics layouts](http://127.0.0.1:8092/kitchen-analytics-layouts.html). To reopen later, serve `docs/previews/` with a local static server and open `kitchen-analytics-layouts.html` at that server's URL. The HTML is self-contained and needs no external assets or database connection.

Choose a layout, then Desktop or Phone. These controls change the actual iframe width to 1120 or 390 px; they do not shrink a desktop screenshot. Use **Open layout in a full tab** to inspect the selected layout at the available browser width. The fixed desktop iframe can scroll sideways inside a narrow preview window; the responsive report itself was checked for overflow.

| Proposal | Desktop reading order | Practical tradeoff |
| --- | --- | --- |
| Period first — recommended | Date/filter pane → three KPI cards → report selector and rows | Closest to the existing Report workspace; establishes the period before its totals and keeps the report full width. |
| Report first | Report selector → date/filter pane → three KPI cards → rows | Puts frequent Sales/Purchases/Cash switching first, but adds a band above the date pane. |
| Summary beside report | Date/filter pane → KPI column beside the report | Shows report rows higher on desktop, with less width available to the table. On phones the cards return to a row above the report. |

Phones use labelled Quantity/Entries and Value pairs instead of squeezing four table columns into a narrow screen. The app preview does not repeat an Analytics page title.

## Try the interactions

- Select Sales, Purchases or Cash. Expand Filters for branch/item or category/vendor choices; clear them to recover the full report.
- Open the date pane, choose a start and end, then Apply dates. Cancel keeps the previous range; reversed ranges block Apply. Month navigation and cross-year labels work. The preview's latest permitted day is fixed at 9 October 2026.
- Select a report row for an illustrative entry popup. Export CSV downloads explicitly labelled sample data.
- Choose dates without sample entries to see the empty state and disabled export. Reset preview restores 1–8 October 2026 on desktop; applying that range also restores the sample period on phones.

All figures are illustrative and local. The samples fall within 1–8 October 2026. KPI cards summarize the entire selected period; filters narrow the report below. Purchases include credit buys and are distinct from later cash payments. No profit figure is derived. The rail and phone navigation are static context, not working application navigation.

## Scope and evidence

Task 163 created an HTML exploration and its documentation only; application screens, services, database, staging data and production were unchanged by that task. Task 164 subsequently implemented the selected Report first composition in the staging application and updated its local surface brief. The approved Report workspace and incumbent visual system remain in place. The preview checks below cover the historical HTML exploration, not that later application implementation.

Playwright with installed Chrome passed all six layout/device combinations (three layouts at 1120×820 and 390×820), plus Period first at 320 and 427 px. Checks covered date-before-KPI order, report overflow, real iframe viewport switching, filters, report switching, range Apply/Cancel, reversed-range blocking, sample CSV contents, empty states and browser script errors. The corrected calendar labels were rechecked across December 2025–January 2026, including cancellation and application. Fourteen final browser captures were inspected.

The independent finish review found a hardcoded calendar year; that fix was scored resolved and the final verdict was **ship** for the preview. The verdict pass confirmed the correction; it was not a new full review of every surface. The original layout matches stood.

Local screenshots, the QA/server helpers and detector output live under Git-ignored `.impeccable/review/`; they are session evidence, not a committed test suite. This evidence covers the standalone browser preview only. Native rendering, hardware, gestures, font scaling and live database behavior are unverified by this exploration.

## Relationship to the incumbent system

The finished HTML was compared with `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, the current `AnalyticsWorkspace.tsx` and the layout direction contract. It retains the Kitchen Ledger palette, system sans, tabular money, flat white surfaces on Canvas Tint, blue selected controls, solid Blue Wash hover and compact report separators. Its 12 px cards and 52 px desktop rows follow the existing compact workspace direction.

The preview detector ran once and returned only font-size advisories (14, 19, 11, 16 and 10 px). Smaller phone notes/navigation and other off-ramp type values are preview drift, not new tokens or approved exceptions to the documented 12 px floor. Static navigation geometry and other provisional composition details are not shared component specifications. Existing system/sidecar drift also remains outside this task. `DESIGN.md` and `.impeccable/design.json` were preserved; none of these deviations or unselected layouts was canonized or repaired as a system change. Task 164's Report first order is a local Analytics composition decision, not a system-wide layout rule.
