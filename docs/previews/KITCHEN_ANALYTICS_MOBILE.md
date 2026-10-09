# Kitchen Analytics mobile layout ideas

Task 167, 9 October 2026. Requested by the owner because too few report rows fit on a phone. These are interactive HTML design alternatives using illustrative data. No option has been selected or implemented in the staging application.

Open [kitchen-analytics-mobile.html](kitchen-analytics-mobile.html) through a local static server. The task's local preview server serves it at http://127.0.0.1:8093/kitchen-analytics-mobile.html while running. It uses no external dependencies, credentials, Supabase calls or log searches.

## Alternatives

- **Compact ledger (recommended):** all three period KPI cards remain below the date pane, with smaller spacing. Item/branch appear on the left; exact value/quantity on the right. Info, Refresh and Export move into one report menu. Report total and row count share the report heading. Typical rows are 62px tall and grow for wrapping content.
- **Expandable summary:** the selected report's period total appears in a disclosure below the dates. Opening Summary reveals all three KPI cards. It provides a quieter overview, but the other period totals take a tap to see. It does not show more complete rows than Compact ledger in the default sample viewport.
- **Reading mode:** starts with the compact summary cards, then Read list hides them and moves a blue Summary restore control to the report heading. Tabs, date, filters and report total remain accessible. Summary restores all three cards. It provides the greatest visible list area once enabled, but introduces an extra view state.

The left preview recreates the current mobile structure with the same sample data. It is a structural comparison, not a capture of the live app. The desktop application layout remains unchanged. The desktop preview page places the phone frames together for comparison; it is not a proposed desktop application redesign.

## Design documentation boundary

All three alternatives inherit the existing Kitchen Ledger world: Le Laban action blue, pale blue canvas, flat white surfaces, navy text, system type, tabular rupees and directional Cash colours. The phone preview uses 12px supporting text, 14px row names and figures, 15px KPI figures, an 8px grouping rhythm, 12px surface corners and 48px controls. These are observed preview dimensions, not new system tokens. The local alternatives change information density and summary disclosure; they do not establish a new identity or a reusable system change.

`DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md` and `.impeccable/surfaces/src-app-central-kitchen-tabs-analytics-tsx.md` are preserved. The actual Analytics surface brief continues to describe task 164's approved Report first layout. A recommendation in this preview does not select a design or authorize application implementation. Existing differences between the older system/sidecar records and later Analytics refinements are outside this task and have not been repaired or canonized.

## Playwright evidence

Installed Chrome, local sample server. Fully visible sales rows at scroll position zero, default text size:

| Phone viewport | Recreated current | Compact ledger | Summary closed | Reading mode enabled |
| --- | ---: | ---: | ---: | ---: |
| 390 × 668 | 2 | 5 | 5 | 6 |
| 320 × 700 | 2 | 5 | 5 | 6 |
| 390 × 844 | 3 | 7 | 7 | 9 |

These counts are measured browser results for typical sample names and figures, not guarantees for real records or native phones. Longer names, large amounts, enlarged text, safe areas and open controls reduce the visible count. Exact large amounts stack instead of truncating. Every checked button has at least 44px height; normal controls use 48px. No horizontal inner-page overflow appeared at the checked widths.

Checked report switching, filters, row details, Escape dismissal, invalid and valid date ranges, sample CSV download, summary expansion and the layout/size picker. Sample CSV and totals use the same selected rows. Additional captures cover Purchases, Cash, empty/error states, long names and large figures. External requests are blocked by the Playwright check; observed external requests and page errors: zero. No Supabase allowance was consumed by application testing or log scans.

Date inputs use the browser's native calendar; the preview does not replace the application's existing date-range calendar. Sample drilldown is explicitly labelled as a representative record, rather than a real list of underlying entries. Navigation is static context. Sample error/empty fixtures explain how to return to Typical entries.

Evidence is in the ignored `.impeccable/review/mobile-ideas-*.png` and `mobile-ideas-results.json`. Native safe areas, text scaling, gestures and device performance are not verified by HTML/browser previews. Application implementation will retain its service, query, tenant and financial rules.

## Finish review

The layout detector ran once and returned no findings. The independent finish review first returned **fix**, identifying Reading mode's selected Summary text contrast/overflow and Expandable summary's numerical total in the error fixture. The preview now gives the selected Summary button white text, preserves its width at 320px, restores all three cards, and replaces the unavailable error total with an em dash.

Targeted Playwright recaptures verified those affected states at 390 × 668, 320 × 700 and 390 × 844. Reading mode retained 6, 6 and 9 fully visible typical rows respectively. The independent scoring pass marked both fixes **resolved**, with final disposition **ship** and no regressions observed in the affected captures. This verdict scores the listed fixes; it is not a fresh approval of the whole surface or an application release.

No deployment, migration, production change or source UI change belongs to this task.
