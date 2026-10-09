# Central Kitchen Analytics — staging implementation

Task 157, 2026-10-08. The user selected the HTML **Report workspace** and
authorized implementation in staging. Branch: `codex/kitchen-analytics`.
Production application/database and its completed data reset are unchanged.

## Try it

Run `npm run staging` and open `http://localhost:8081/central-kitchen/analytics`.
Analytics is directly available in the kitchen navigation. The local API runs on
8083. The staging banner must say TEST DATABASE. Kitchen staff and owner/admin
use the existing kitchen role/scope gate. No new staff permissions are granted.

Analytics has Sales, Purchases and Cash reports. The date picker uses the
India calendar and inclusive start/end dates through today. This month defaults
to month to date; past-month arrows cover the calendar month. Cross-month and
single-day ranges are supported. Opening balances are not period activity.
The compact KPI cards cover the whole selected period; **Filtered total**
covers the active report/filter selection.

- Sales: supplied item quantity and value by branch/item. Units remain per item.
  Select a row for its send entries.
- Purchases: category totals, with category/vendor filters and entry drilldown.
  Spending can include direct expenses, explicitly identified as Other expense.
  A shared label across purchase/expense categories forms one combined category
  row labelled with both sources; drilldown and export reconcile to that row.
- Cash: recorded collections, vendor payments, paid-on-entry purchases and
  direct expenses. Later payments never increase purchase totals.
- CSV: a fresh, filtered detailed report and total from one database snapshot.
  Ordinary reports return 50 rows per page; export is limited to 10,000 rows
  with a friendly request to narrow the filters. Native uses Share for CSV text.

## Categories

Manage categories from the Purchases report, or add one inside a vendor/buy
form. Vendors have a default; each buy can override it or choose Uncategorized.
The build follows the approved preview's one category per purchase. The
optional question about multiple categories per invoice remains unanswered;
line-level categories require a separate requirement/schema change.

Saved purchases snapshot both category ID and name. Renaming/archiving a
category or changing a vendor default does not rewrite history. Keeping the
category during an edit keeps the saved name, including an archived category.
New buys require an active category or Uncategorized. Archive/restore replaces
hard deletion. Renaming an archived category preserves its archived state.
Historical buys remain Uncategorized; there is no inferred backfill.

## Database and performance

Applied sequentially and verified on staging project `inbxezmtuytpalqvlcsm`:

1. `20261008061518_kitchen_purchase_categories.sql`: scoped category table,
   RLS/explicit grants, vendor reference, entry snapshots, atomic post/edit RPCs.
2. `20261008061650_kitchen_monthly_reports.sql`: scoped active-date index and
   security-invoker monthly report RPC under existing kitchen RLS.
3. `20261008064237_kitchen_reports_month_to_date.sql`: India current-month
   cutoff and bounded export materialization.
4. `20261008065451_kitchen_spending_category_totals.sql`: combine matching
   category labels across purchase/expense sources so row drilldowns reconcile.
5. `20261008152218_kitchen_report_date_range.sql`: inclusive security-invoker
   date-range report RPC, preserving the old monthly RPC for earlier clients.

These files are in `supabase/staging-pending.txt` so a staging clone restores
them. No migration was applied to production. Every service read/write/RPC
includes tenant and kitchen branch scope derived from the current session.
The category table denies anon access and authenticated DELETE; report RPC
denies anon execution. Existing authenticated kitchen authorization applies.

Reports aggregate on the server, refresh on filters/explicit Refresh, cancel
stale requests and fetch details only on drilldown/export. No new polling or
Realtime subscription. Categories are one small master-list read in the
existing shared kitchen load, including archived names for saved forms.

## Validation

- TypeScript typecheck passed.
- Full existing Jest suite passed: 256 tests, 27 suites. After adding the two
  new native route imports, focused route smoke checks passed (18 routes).
- Five report unit tests cover India date/year boundaries, Postgres numeric
  parsing, unsafe/incomplete payload rejection, exact CSV totals/units and
  spreadsheet formula neutralization.
- Lint passed with 0 errors; 166 existing warnings before the added route
  imports. The project uses require-based route tests, with existing lint
  warnings for that style.
- `supabase/tests/kitchen_monthly_reports.sql` passed as authenticated kitchen
  staff, using scoped metadata-derived IDs and rollback-only fixtures. Covers
  current-month future exclusion, invalid category denial, vendor defaults and
  overrides, same-label purchase/expense aggregation and drilldown,
  immutable snapshots after rename/archive/edit, void/replacement,
  mixed units, cash double counting, pagination, filtered export reconciliation,
  archived branch history, tenant/branch denial and calendar boundaries.
- Staging security advisors returned no ERROR findings. Existing warnings
  (security-definer RPCs, search paths and auth settings) remain outside this task.
- Browser checks: Sales/Purchases/Cash, branch search/filter, sales/purchase
  drilldown, combined spending total and category manager empty state.
  Desktop, phone-sized web and actual 979px app-panel evidence are in the
  Git-ignored `.impeccable/review/` directory. Static design detector returned `[]`.

The independent Impeccable finish review requested compact intermediate/phone
density, phone value labels and tabular/directional figures. Its verdict scored
those four fixes resolved, then a phone label-size regression resolved, ending
with **ship** for the scored fixes. This is a scoped UI verdict, not certification
of production readiness or actual download/native behavior. Root design files
remain incumbent; no new visual identity or shipping raster was introduced.
The independent documenter checked the finished components against PRODUCT.md,
DESIGN.md, brand/Tailwind tokens and the sidecar. No design-system files changed;
pre-existing sidecar descriptions remain documented drift outside this task.

The CSV button completes without a visible error or console error, and SQL/CSV
tests verify payload reconciliation. The in-app browser did not expose a
completed Blob download event/file, so real-browser file-save is not certified.
Native routes load in Jest; iOS/Android device rendering and native Share have
not been tested on hardware. No production-readiness claim follows from web QA.

## Responsive viewing refinement (task 158)

The report workspace is centered with a maximum width of 1120px. Web report
columns begin at 700px, so smaller desktop app panels retain aligned quantities
and amounts. Filters stay inline from 640px. Narrow phones initially collapse
the filters behind a 48px control, with active count and selection summary;
expanding it exposes every filter and purchase-category management. Phone rows
pair labelled quantity and value to reduce scrolling. Helper text spans the
report width. Long summary amounts switch to labelled rows instead of shrinking
their font. Picker content can shrink and scroll in short viewports, with native
keyboard avoidance. Month arrows and refresh have 48px minimum width and height.

Browser evidence covers 1440x900 desktop, the actual 752x668 app panel,
390x844 phone and 320x568 small phone, plus an 844x390 landscape picker.
Sales, Purchases, Cash, filter search/no-match recovery, combined spending
(500 + 146 = 646 rupees), and empty-month recovery were exercised. Existing
financial data was not edited. Captures are QA evidence in the ignored
`.impeccable/review/responsive-*.png` files, not application image assets.
Typecheck, targeted ESLint and 18 native route-load smoke tests passed.
The static detector returned no findings. Native hardware, soft-keyboard
rendering, cross-browser behavior and large-value fixture rendering remain
unverified; these browser captures do not certify those behaviors.
The layout refinement adds no database queries, polling or subscriptions.
The independent responsive review requested one correction: minimum target
width for the month arrows and refresh. After the 48px fix and nine matching
recaptures, its verdict was **ship**, scoring that correction resolved.
The independent documenter confirmed the responsive refinement matches the
incumbent palette, type and component rules; DESIGN.md and its sidecar were
preserved. Existing sidecar/layout and shared-input focus descriptions remain
outside this refinement's scope.

## Compact report and navigation refinement (task 159)

The user's screenshot showed too much space devoted to controls before the
report. Analytics now uses a compact toolbar for title, month, info and refresh
from 840px of measured report width. Monthly figures occupy a slim separator
strip instead of a large card. Explanations retain their original wording behind
the labelled About these reports control. Desktop report tabs have bounded
widths; category management shares the report-heading row. On phones, Export
sits beside the report title so three report selectors fit even at 320px.
Breakpoints use the actual report layout width after sidebar/phone frame space.

Analytics is now a kitchen tab, retaining the same public
`/central-kitchen/analytics` URL. The desktop/tablet rail includes Home,
Analytics, Items, Branches, Vendors and History. Phones have five controls:
Home, Analytics, Items, History and More. More opens Branches and Vendors above
the bar; Close, Escape on web and Android Back dismiss it. The Home-page
Analytics shortcut was removed. Role gates and the main app bar are unchanged.

Browser checks cover 1440x900, the supplied screenshot's 1370x731 size,
1024x768, 390x844 and 320x568. Verified Home-to-Analytics navigation, stable
direct URL/reload, phone More-to-Branches-to-Analytics, Escape dismissal,
report explanation disclosure and unchanged staging totals. Final captures are
`.impeccable/review/compact-*.png`; these are QA evidence, not shipping assets.
Typecheck, targeted lint and 18 native route-load checks passed. Detector
returned no findings. Native hardware and Android Back behavior have not been
verified on a device. No service/query, database, polling or production change.
Independent finish review returned **ship**, with no material fixes. At the
user's 1370x731 viewport, report content begins around 393px and the first
category appears around 450px. The independent documenter updated only the
authorized navigation descriptions in DESIGN.md and its sidecar, preserving
the existing design tokens and unrelated documentation drift.

## Report row refinement (task 160)

Interactive Sales and Purchases rows now use opaque Accent Soft for hover and
press, replacing the canvas-like hover tint and pressed opacity fade. Desktop
Sales overview separates Branch, Item, Quantity and Value into four equal
flexible columns, matching the headings. Phone rows retain the combined label
and paired figures; detail and Cash keep their existing data presentation.

Browser checks cover the actual 1159x668 view, 1370x731 and 1024x768 desktop,
390x844 phone and 320x568 small phone (top and scrolled row). Real pointer hover
on both reports computed an opaque blue background with opacity 1; Sales had
four equal 217.4px columns at 1159px and no document horizontal overflow.
Sales and Purchases entry drilldown and return worked with unchanged totals.
Captures are ignored QA files under `.impeccable/review/balanced-*.png`.
Typecheck and targeted ESLint passed; the detector returned no findings.
Independent finish review returned **ship**, with no material fixes.
The independent documenter confirmed the existing tokens and design rules;
DESIGN.md and its sidecar are preserved for this local refinement.
Native hardware remains unverified. No service, database or production changes.

## Home-like report density (task 161)

The user requested less vertical space, using Home as the spacing reference.
The repeated Analytics title and kitchen subtitle are removed; the selected
kitchen navigation tab supplies the page identity. Month controls and Refresh
start the page, with Info and the reporting period sharing the wide desktop
row. Kitchen context remains available in Info. Safe-area top padding remains.
Desktop report tabs, report heading and Export share a row. Inline filter
labels sit inside their controls; purchase-category management is a labelled
icon beside those filters. Phones retain accessible filter disclosure and put
Info beside the report heading and Export. Report tabs expose selected state.

Report rows follow Home's 52px minimum height with 8px vertical padding rather
than 16px. Wrapped content grows naturally. Measured desktop Sales rows are
52.8px and purchase categories 60.8px. At the actual 1480x668 viewport, the
first Sales row begins at 308.8px, roughly 92px earlier than the previous view.
Four desktop Sales columns, exact figures and opaque hover are preserved.

Browser evidence covers 1480x668, 1024x768, 390x844 and 320x568, plus September
at 320px. The reviewer requested one toolbar fit correction for long month
names: the month group/label now shrink within the row while all targets remain
48px. September's Refresh right edge is 288px, retaining the phone gutter.
The reviewer scored that correction resolved and returned **ship**.
Final ignored captures are `.impeccable/review/dense-*.png`.
Typecheck, targeted lint and 18 route-load checks passed; detector had no
findings. Browser filter access and empty-month recovery were verified.
The documenter confirmed the local refinement against Home/shared UI and the
existing tokens, preserving DESIGN.md and its sidecar.
Native hardware remains unverified; no service, database or production change.

## Task 162 — KPI cards and date ranges

Phones place the month/range picker beside Filters, using the space under the
report controls. Compact KPI cards have small package, basket and receipt
icons, aligned values and exact rupee amounts. Desktop keeps the date controls
in its top toolbar and the same dense report columns/rows.

The bounded calendar edits a draft start/end date, with an explicit Apply,
Cancel and This month reset. Both boundaries are inclusive; calendar arrows
permit cross-month ranges. Future dates and reversed ranges cannot apply.
Only Apply fetches a new report, clearing report-specific filters and paging;
switching Sales/Purchases/Cash retains the selected range. Filters, drilldown
and CSV share the new `kitchen_range_report` RPC. The older monthly RPC is kept
for older clients. Range predicates reuse the existing scoped active-date
index; no additional polling, subscription or separate KPI fetch is added.

Validation: typecheck and targeted lint passed; nine report/date/export unit
tests and 18 native route-load checks passed. Staging authenticated rollback
fixtures in `supabase/tests/kitchen_range_reports.sql` passed cross-month
inclusive bounds, single day, leap day, KPI reconciliation, paging/export,
default monthly compatibility and wrong tenant/branch denial. The range RPC
is stable, security-invoker, with fixed search path and no anon execution.
Security advisors returned no ERROR or findings naming the range RPC; existing
unrelated warnings remain outside this change.

Browser checks cover 1440x900 desktop, 390x844 and 320x700 phones, and the user's
actual 427x668 panel. Final captures are ignored `.impeccable/review/range-*.png`.
Cross-month selection, cancellation, Escape, invalid-range blocking, exact
range labels and a real CSV download were verified. The download's header,
two entries and total match Sep 21–Oct 8 (₹2,250). Date buttons measured at least
44px tall on web. Native appearance, gestures and device testing remain pending.
The static detector returned no findings on the changed UI.
The fresh independent finish reviewer returned **ship**, with no material fixes,
for this staging browser extension. It verified all eight final captures against
the contract, preserving the existing design system. Its verdict does not cover
native appearance, gestures, font scaling or hardware behavior.
The independent documenter checked the finished surface against the incumbent
tokens, Home/shared kitchen controls and PRODUCT.md, updating only the local
surface contract. DESIGN.md and its sidecar remain unchanged; unrelated
pre-existing design drift was left untouched.

## Task 164 — Report first layout

The user selected **Report first (layout B)** from the task 163 alternatives on
9 October 2026 and requested desktop and mobile layout review. Staging now
reads Sales/Purchases/Cash selector → date/filter pane → compact period-wide
KPI cards → report heading, filtered total and rows. Filters initially collapse
on both desktop and phone; expanded fields stay above every KPI, inline at
640px of available report width and stacked below that. All branch/item and
spending/category/vendor choices and purchase-category management remain
available. Desktop Info and Refresh sit in the selector bar; phone Info,
Refresh and CSV/Share sit beside the report heading. Export remains beside
the report heading on desktop. Quick desktop month arrows, draft Apply/Cancel
and This month behavior, exact amounts, opaque row feedback and existing
columns/drilldown are retained. Controls keep 48px minimum source heights;
rows keep 52px minimum heights and grow for wrapping.

Eleven ignored `report-first-*.png` captures cover 1440x900 and 1024x768
desktop, 390x844 and 320x700 phones, and the user's actual 390x668 panel.
Sales, Purchases with expanded filters, Cash, the narrow calendar and a custom
range were reviewed. The collapsed 390x668 view shows the selector, date pane,
all three KPIs, heading and first result. No horizontal document overflow was
found at 320px or 390px; actual-panel buttons/tabs measured at least 44px high.
Expanded phone purchase filters remain scrollable above the KPIs.

Read-only staging checks confirmed ₹2,250 Sales, ₹500 Purchases and ₹146 Other
expenses; Cash shows ₹2,250 received and ₹646 paid across five rows. Applying
the inclusive Sep 21–Oct 8 range, switching report tabs and returning from
entry drilldown retained the range. Choosing This month in the calendar draft
then Cancel preserved it. A real downloaded CSV included the matching range
metadata and two entries (₹1,800 + ₹450 = ₹2,250). The session was restored to
current-month Sales with collapsed filters.

Typecheck, targeted lint and 27 existing report/native route-load tests passed.
The layout detector ran once on the changed UI and returned no findings.
The fresh independent finish review returned **ship**, with no material fixes,
for the staging browser composition. The documenter reconciled the local
Analytics surface brief, preview selection notes and this staging record
against the implemented components and incumbent tokens. `DESIGN.md`, its
sidecar and shared tokens remain unchanged; pre-existing drift was preserved.
No service/query, database, polling or production change was made. Native
hardware appearance, gestures, soft keyboards and OS font scaling remain
unverified; the route-load tests are compatibility evidence only.

## Release boundary

Client testing in staging comes next. Production promotion is a separate
release: apply the five reviewed migrations in order and verify each before
deploying this application version, because its kitchen reads require the new
columns/table and range RPC. Roll back the app to the previous release if needed; retain the
additive columns/categories rather than dropping user category history. For
RPC rollback, use the previous post/edit definitions from migration
`20261004000200_kitchen_categories_and_edit.sql`; no destructive schema rollback
is needed. Keep the production reset backup private and Git-ignored.
