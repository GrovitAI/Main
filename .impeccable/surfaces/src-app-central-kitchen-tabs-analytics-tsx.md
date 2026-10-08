---
version: 1
slug: "src-app-central-kitchen-tabs-analytics-tsx"
primary_target: "src/app/central-kitchen/(tabs)/analytics.tsx"
related_targets: ["src/components/kitchen/AnalyticsWorkspace.tsx", "src/components/kitchen/ReportDateRange.tsx", "src/app/central-kitchen/(tabs)/_layout.tsx"]
---

# Kitchen Analytics

Scope: Central Kitchen monthly and date-range reports. Mode: Operate. Owner and kitchen staff trace goods, purchases and cash for the selected period to recorded entries. The approved HTML Report workspace is the code-led composition reference; no new visual world or concept round is needed.
Date-range extension (2026-10-08): Reports also accept any inclusive start/end dates through today in India time. Phones place the month/range picker beside Filters rather than above the KPIs. Compact flat KPI cards with small existing-library icons replace the slim strip, explicitly requested by the user. A bounded popup calendar provides start/end selection, previous/next calendar months, a This month reset, Cancel and Apply. Editing a draft never fetches; Apply updates the KPIs, rows, filter options and CSV together. Invalid/reversed ranges cannot apply, future days cannot be selected, and current-month default remains month to date. Existing columns, row density, navigation and detail behavior stay unchanged. This is a local surface extension of the incumbent Kitchen Ledger system.

THESIS: One working report at a time, separating goods supplied, purchases and cash, with filters, entry detail and reconciled export.

OWN-WORLD: Inherit DESIGN.md and the existing kitchen controls: one Le Laban action blue, pale canvas, flat white surfaces, system type, tabular money and restrained separators. The user's 2026-10-08 refinement promotes Analytics into kitchen navigation; preserve the main app navigation.

STORY: Open Analytics directly from the kitchen rail or phone tab, choose a month or inclusive date range and report, narrow a branch/item or category/vendor, inspect recorded entries, then export the same filtered report.

FIRST VIEWPORT: The selected navigation tab identifies Analytics, so the report does not repeat its title or kitchen subtitle. Where filters are inline, month arrows and refresh begin the page; from 840px of available report width, the reporting period and Info share that row. Three compact white KPI cards show small blue icons, muted labels and exact tabular amounts; they stack when phone amounts need more room. Explanations and kitchen context remain available through the labelled Info control. Desktop report tabs, report-specific heading and Export share one row; inline filters carry their labels within the controls, with category management beside purchase filters. Web report columns begin at 700px, inline filters at 640px, measured after navigation consumes its width. Phones keep a full-width report selector, Info, Refresh and Export beside the report heading, then the month/range picker beside expandable Filters and labelled quantity/value pairs. Cash omits Filters. Rows use Home-like 52px minimum height and 8px vertical padding, growing for wrapped content. Six direct rail sections include Analytics; five phone controls are Home, Analytics, Items, History and More, with Branches and Vendors in More. Large amounts retain their exact values without shrinking. Category selection reveals purchase entries inline.

SURFACE DIMENSIONS: The centred report frame caps at 1120px with desktop columns and 720px otherwise, with 16px gutters. KPI cards use 12px corners, 12px horizontal/8px vertical padding and 8px gaps, 15px icons, 12px labels and 16px amounts. Report controls have 48px minimum heights; icon actions also have 48px minimum widths. The calendar is a centred, flat white modal with 16px corners, a maximum width of 372px and maximum height of 92%; its available width and top/bottom padding respect the window and safe areas. Its seven-column calendar uses 44px minimum day heights on web and 48px on native; start/end, navigation, reset, close, Cancel and Apply actions retain 48px minimum heights. Selected endpoints use action blue, the intervening days Accent Soft, and disabled future dates reduced opacity. The popup uses the platform Modal fade; no custom motion, new type family, palette or shipping raster is introduced. These are this surface's implemented dimensions, not a replacement for the incumbent system.

FORM: User-selected Report workspace from the existing code-led HTML preview, October 8. No seed applies to this precisely specified extension. Signature interaction is a category row becoming a filtered purchase-entry view without losing month context; standard push navigation and short state feedback only.

ROW REFINEMENT: Desktop Sales overview separates Branch, Item, Quantity and Value into four equal flexible columns with matching headings. Phones retain the combined branch/item label and paired quantity/value row. Interactive Sales and Purchases rows use the solid Accent Soft token for hover and press, without fading their content. Entry-detail and Cash semantics remain unchanged.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Vendor default category with an individual purchase override follows the preview; old purchase snapshots remain unchanged. Existing purchases stay Uncategorized. Staging only. Native hardware evidence is unavailable on this Windows host; browser checks must be labelled web evidence.
