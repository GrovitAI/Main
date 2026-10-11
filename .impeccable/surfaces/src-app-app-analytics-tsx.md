---
version: 1
slug: "src-app-app-analytics-tsx"
primary_target: "src/app/(app)/analytics.tsx"
related_targets: ["src/components/analytics/AnalyticsStatement.tsx", "src/components/analytics/StatementCharts.tsx", "docs/previews/pos-analytics.html", "src/lib/pos/brand.ts"]
---

# POS analytics: desktop web

Task 197 · 2026-10-11 · Mode: Operate. Desktop web only (1024 px and up); phone
and tablet keep their existing layouts.

Audience: the owner reviewing sales and money for a period and a branch at a
laptop, at the counter or at home in the evening; occasionally managers.
Job: know what came in, what is still owed, when customers come, and what
sells, then export.

## Direction contract

THESIS: The page reads like the owner's daily statement. Money comes first as
one hero figure and its flow, then evidence in a fixed reading order. It
refuses the category default of a wall of equal KPI tiles and a chart grid.

OWN-WORLD: Le Laban Kitchen Ledger: the f5f8fc canvas, white 16 px cards with
hairline blue-tint edges and soft shadow, Source Sans 3, ink and slate text.
Charts use the validated mix in brand.ts `chart`: Le Laban blue, teal and
violet; a lighter blue for the earlier period; amber only for pending money.

STORY: The owner sees the period's sales and its change against the previous
equal period, what is collected and what is pending, then the day pattern,
payment mix, rush hours, menu winners and laggards, and every item's revenue.
They can then export transactions or item sales.

FIRST VIEWPORT: Header with title, scope line, period presets, date button
and exports. Owners get a branch row. A full-width money card follows: a hero
figure of at least 48 px with a change chip, orders, average bill and items
sold at right, then a collected/pending flow bar and five money figures. Below
it, "Sales by day" (this period against the previous one, 2:1) beside
"Payment mix".

FORM: Daily statement. It was layout 1 of three previews; the owner chose it
from concept seed d0718abc.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Finish

Finish review: the first pass returned fix with eight material items (eyebrow
labels, stale scope and comparison states, ring cap overlap, glyph arrows, side
stripes, 44 px targets, 11 px text, hardcoded hover wash). After one batch, the
verdict pass scored all eight resolved and returned ship for those fixes. Its
minor Menu-height note was fixed by top-aligning the cards. The verdict does
not cover the whole surface. Evidence: .impeccable/review/analytics-*.png (1440
and 1280, hover, empty, error) from mocked Playwright with zero forwarded
requests. Documentation: DESIGN.md and .impeccable/design.json updated by the
documenter (chart palette, analytics type roles and mark rules). No shipping
rasters. Details: docs/POS_ANALYTICS_DESKTOP.md.
