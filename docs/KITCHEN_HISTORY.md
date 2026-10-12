# Kitchen History

Task 174 · 2026-10-10 · staging source only

Latest refinement: task 185 · 2026-10-11 · staging source only

History now shows who recorded an entry, when the transaction happened, when
it was recorded, and whether it was corrected or voided. The extension keeps
the existing Kitchen Ledger design and posting behavior. It adds no migration
and has not been deployed to production.

## Audit meaning

The default All view includes every state in the loaded window:

| Status | Meaning |
| --- | --- |
| Active · unedited | An entry that has not been replaced or voided. |
| Edited · current version | A corrected entry linked to an earlier version by `replaces_id`. |
| Replaced · earlier version | The earlier entry voided with the existing `Edited` reason when its correction was posted. It no longer contributes to figures. |
| Voided · removed | An entry removed from figures by voiding, including a corrected entry that was subsequently voided. The stored record remains. |

Every row shows Entered by, Transaction date, Entry time in IST and its status.
Replaced and voided rows have muted, struck-through titles and neutral amounts;
their audit line names the stored actor and timestamp. A void also shows its
reason when recorded. Missing legacy actor data is labelled “staff not recorded”
rather than assigned to the creator.

Opening a row retains the existing entry detail and edit/void actions. For a
current correction the detail identifies the editor and time. “Before this
edit” shows the previous entry's headline, amount, subline, transaction date,
creator and recorded time when that entry is in the same cache. Otherwise it
says “The earlier version is outside the loaded history window.” This is a
before-edit summary, not an exhaustive field-by-field comparison or a separate
archive lookup. Removed entries explain that they no longer count anywhere.
Deletion in this workflow means voiding; records are not physically deleted.

## Finding an entry

Search remains visible, while Filters starts collapsed. The selected Sort by
value is always visible, with Transaction date · newest as the default.
Phones below 640px open Filters in a sheet above the list; wider layouts retain
the inline groups. Dismissing the sheet retains the selected local choices.
Type, status, Entered by, search and date range combine rather than replacing
one another. Spent includes expenses and vendor payments; Stock includes Made
and Count. Entered by matches the row's creator, while text search also finds
void actors and reasons, categories, names, notes, amounts and status text.

The inclusive calendar range can use either Transaction date (the business
date) or Entry date (when it was recorded). Recorded days and displayed times
use Asia/Kolkata, irrespective of the device timezone. Calendar changes remain
draft until Apply dates; Cancel dismisses the draft. Clear dates removes only
the range. Clear filters removes the narrowing conditions and retains the
chosen sort.

Four sorts are available: newest and oldest Transaction date, and newest and
oldest Entry date. Transaction sorting breaks ties by recorded timestamp;
entry sorting compares timestamp instants and then transaction dates. A stable
ID tie-breaker keeps equal records deterministic. There are no date groups
that silently reorder the selected sort.

## Loaded scope and states

This is recent history from the existing shared kitchen store: up to 500 entries
from the last 92 transaction days, including edits and voids. The header states
both the matching and loaded count, the window, and an additional warning when
500 entries are loaded. A chosen date range cannot retrieve records outside
that window, even when filtering on Entry date. The controls filter and sort
only the loaded array; they do not query a full archive or request another page.
Refresh uses the existing store refresh.

One virtualized FlatList owns the scrolling header and rows. The phone sheet's
fixed form scrolls independently; record, picker and calendar lists remain
FlatList. Desktop metadata
sits horizontally where space permits; phone metadata wraps without hiding
the creator, business date or recorded time. The inherited content frame,
Source Sans 3, white ledger rows, hairline separators, exact tabular amounts,
POS workspace canvas and blue rail remain in use. Compact labelled selectors
reuse the report controls; this does not establish a new global component rule.

Initial loading uses ActivityIndicator. Empty history, no matching entries and
service failure have distinct messages. No-match states offer Clear filters;
a safe service notice and Refresh history support error recovery. Refresh is
disabled while loading and has a measured 48×48 target across the four checked
browser sizes. Pull-to-refresh uses the same refresh path.

## Implementation boundary

The main route is `src/app/central-kitchen/(tabs)/history.tsx`. Row audit metadata
is in `src/components/kitchen/HistoryEntry.tsx`; the optional previous-entry
summary is in `EntryActions.tsx`. `HistoryFilterSheet.tsx` owns phone disclosure
and the bounded static form. Shared `ReportSelect.tsx` accepts compact and
required choices, and `ReportDateRange.tsx` accepts a History label and unset
range placeholder. Existing report defaults remain compatible.

`src/lib/pos/kitchen-history-utils.ts` owns status interpretation, India date
formatting, local filtering and sorting without mutating store entries.
`kitchen-service.ts` adds the existing `voided_by` column to the entry SELECT
and mapper. `KitchenEntry.voided_by` is optional and nullable for older typed
callers and missing legacy metadata. Entry queries retain both tenant and
branch filters, the existing transaction-date ordering and 500-entry limit.
The store already requests recent entries with `includeVoided: true`; no new
fetch, polling, posting, balance calculation or database schema was introduced
by the filter controls.

## Verification and limits

Local typecheck and changed-file ESLint passed. The focused history, kitchen
utility, analytics and native-route-smoke suite passed 63 tests, including 19
route-load checks. History tests cover audit states, composed filters, actor
search, backdated sorting, offset timestamps and ties, inclusive India day
boundaries, missing actors and a corrected entry later voided.

Actual Expo staging browser checks used synthetic local authentication, mocked
Supabase responses and blocked websockets. The final run fulfilled 89
cloud-targeted requests locally and forwarded zero. It checked four sorts,
all statuses, type/staff/search, combined no-match/reset behavior, both date
bases, inclusive ranges, original edit details, loading, empty history,
safe service failure and refresh recovery. Filter changes caused no requests.
There was no live-cloud test or database write.

The retained evidence is `.impeccable/review/history-results.json` and the 19
named `history-*.png` captures at 1440×900, 800×700, 390×844 and 320×700. The
measured frames have no horizontal overflow. Typical desktop rows are 85 px
and rows with a replacement/void audit line are 105 px; phone rows grow with
wrapping and content. These are observed sample dimensions, not fixed heights
to impose on future content.

The independent scoped finish review initially requested one material fix:
Refresh history was too narrow. The corrected minimum width and height were
verified at 48×48 in all four sizes; the reviewer scored that sole fix resolved
and returned Ship for this extension. This is browser/source evidence, not a
fresh review of the entire Kitchen surface. The native detector was skipped;
iOS/Android hardware, text scaling, dark appearance and gestures remain
unverified.

Incumbent comparison: the source and captures preserve the task 170 typography
and task 173 canvas/navigation. Pre-existing DESIGN prose still calls the face
“system sans” although its frontmatter and shipped type use Source Sans 3;
the early surface contract also retains its original canvas, floating-action
exception and pre-Analytics tab description. The global “chips for every
choice” wording predates the existing report selectors. These historical
inconsistencies were reported, not repaired or canonized by this ordinary
History extension. PRODUCT.md, DESIGN.md and the design sidecar remain the
incumbent authority; no new visual world, tokens or raster assets were created.

## Row spacing refinement (task 179)

The user requested a smaller gap between desktop particulars and amounts, and
less clustered phone metadata. `HistoryEntry.tsx` now groups the particular,
transaction date and amount/status within 58% of the desktop row, with a
156px amount/status column inside that group. A separate audit column follows
a hairline vertical divider. Phones pair particulars with amount/status above
a separated footer for creator, transaction date, recorded IST time and any
replacement/void audit line. All existing audit meaning is retained.

Only row composition changed. Filters, four sorts, local search, the disclosed
500-entry/92-transaction-day loaded window, refresh, details and service
behavior remain as documented above. No query, schema, migration, polling or
production deployment changed. Incumbent Source Sans 3, POS blue navigation,
Kitchen Canvas, exact tabular amounts and flat white ledger rows are preserved.

The task 179 rerun retained 19 mocked captures at 1440×900, 800×700, 390×844
and 320×700, checking filters/sorts, audit and earlier-version details,
no-match/reset and loading/empty/error recovery. It fulfilled 89 cloud-targeted
requests locally and forwarded zero, with no reported page errors or
horizontal overflow. Typical sample rows measured 85px on desktop and 122px
on phone; longer names, content or audit lines wrap taller. These are observed
dimensions rather than imposed fixed heights. Evidence is retained in
`.impeccable/review/history-results.json`, `check-kitchen-history.cjs` and
`history-*.png`. A focused read of the existing live staging browser panel
confirmed History loads; `history-live-staging.png` records that read.
No live records were changed by testing and no new log scan was needed.

Final typecheck, changed-source ESLint and the broader 304-test/33-suite run
passed, including 23 native route imports. The fresh independent finish
reviewer returned Ship with no material fixes across all five contract
sections after inspecting source and retained main/state captures. This is
browser/source evidence; native hardware, text scaling, soft keyboards, dark
appearance and gestures remain unverified. The React Native source did not
use the HTML/CSS detector, and no shipping raster assets were added.

Comparison with PRODUCT.md, DESIGN.md, `.impeccable/design.json`, tokens,
Typography, shared Kitchen controls and desktop/phone captures preserves the
incumbent visual authority. Design files and tokens remain untouched. The
pre-existing system-sans/specimen, every-choice chips, older navigation and
early surface-contract drift recorded above is reported without repair.

## Toolbar placement refinement (task 180)

Desktop now places Search, Filters and a 220px sort trigger on one row.
Phones place full-width Search above matched 48px Filters and sort buttons,
including active filter counts. Quiet borders and the selected filter fill use
existing tokens. Sort shows Transaction on phones, Transaction date on desktop
or Entry date, with an ascending/descending icon; its accessible label and
picker retain the full date basis and order across the same four choices.
Only `history.tsx` and `ReportSelect.tsx` changed: the shared selector's optional
toolbar presentation preserves its default field presentation. Rows, filters,
details, local data scope, services, queries, store and polling are unchanged.

Final typecheck, changed-file ESLint and 35 tests in two suites passed,
including 23 native route imports. The 19 mocked captures at 1440×900,
800×700, 390×844 and 320×700 checked filters/sorts, audit/details, no-match
reset and loading/empty/error recovery; 89 requests were fulfilled locally,
zero forwarded, and local filters made no queries. Evidence is
`.impeccable/review/history-toolbar-results.json` and `history-toolbar-*.png`.
The read-only existing staging session at 319×668 also confirms both buttons
at 48px in `history-toolbar-live-staging.png`; no Refresh or live write was
performed. The first review found narrow-phone sort wrapping and count layout;
shortening the phone label resolved it, and the harness now asserts matched
heights with active counts. The reviewer scored that sole fix resolved, found
no fix-induced regressions and returned **Ship**; this is not fresh approval
of the whole surface.

Source Sans 3, POS blue navigation, Kitchen Canvas, DESIGN.md, design sidecar
and tokens are preserved; the existing documentation drift above remains
reported without repair. No new assets, schema, migration or production
deployment; all eight staging-only migrations remain pending for production.
The native source did not use the HTML/CSS detector. Native hardware, text
scaling, soft keyboards, dark appearance and gestures remain unverified.

## Expanded filter groups and web hints (task 181)

Expanded Filters now separates Entry details (Type, Status, Entered by) from
Dates (date basis and range). Desktop groups sit side by side, with three
entry fields and two date fields aligned in rows. Tablets stack the groups
and retain field rows from 640px; phones stack full-width fields. Labels sit
above white outlined 48px controls. Short status triggers preserve the full
picker and accessibility wording. `ReportSelect` and `ReportDateRange` expose
optional `outlined` presentations, defaulting false for existing callers.

`global.css` sets textual web placeholders, including search and picker hints,
to 14px at weight 400. Entered search text remains 15px on desktop and 16px on
phones; numeric/decimal input modes and number inputs are excluded. This CSS
does not change native placeholders. The only changed sources are History,
the two shared report controls and the global stylesheet. Task 180's toolbar,
Task 179's rows, date drafts, reset/details, local filter/sort meaning and the
500-entry/92-transaction-day window remain intact. Services, queries, store
and polling are unchanged.

Final typecheck, changed-file ESLint and 44 tests in three suites passed
(kitchen-history, analytics and native-route-smoke, including 23 native route
imports). The mocked harness `check-kitchen-history-filter-groups.cjs` retained
23 captures: main, filters, dates, earlier-version detail and no-match at
1440×900, 800×700, 390×844 and 320×700, plus phone loading/empty/error recovery.
`history-filter-groups-results.json` records 89 requests fulfilled locally,
zero forwarded, no writes, page errors, overflow or measured sub-44px targets;
local filters added no requests. Computed main and picker hints were 14px/400.
Two focused reads of the existing user's 319×668 staging session are retained
in `history-filter-groups-live-staging.png` and `history-filter-groups-live-dates.png`;
entered text was 16px and its hint 14px. No live Refresh, write or log scan was
performed. The existing same-day usage baseline was reused; zero forwarded
requests describes the mocked run, not all staging session activity.

The fresh independent reviewer opened all 25 required images, checked source
and all five contract sections, and returned **Ship** with no material fixes
or recaptures. The verdict is `.impeccable/review/history-filter-groups-finish-review.md`.
Comparison with PRODUCT.md, DESIGN.md, `.impeccable/design.json`, brand tokens,
Typography and shared Kitchen controls preserves Source Sans 3, POS blue,
Kitchen Canvas and the incumbent system. Design files/tokens remain untouched;
the existing system-sans/specimen, every-choice chips, older navigation and
early-contract drift above is reported without repair. No shipping raster,
schema, migration or production deployment was added; eight migrations remain
staging-only. The HTML/CSS detector was not applied to React Native source.
Native hardware, text scaling, soft keyboards, dark appearance and gestures
remain unverified.

## Hover and calendar boundaries (task 182)

The user's post-181 feedback concerned hover emphasis and date highlights
that appeared to overlap. Only shared `ReportSelect.tsx` and
`ReportDateRange.tsx` changed. Picker choices now use padded rounded 48px rows,
4px separators, Surface Tint plus a check for selection and Accent Soft for
hover/press. Outlined and toolbar triggers use the stronger existing Accent
Soft hover. Calendar date Pressables retain the full cell and 48px height;
their non-interactive rounded highlight is inset 2px on each side, creating
4px visual gaps. Endpoints use Primary/Primary Deep, the inclusive range uses
Surface Tint, and other hovered dates use Accent Soft. Constant transparent
borders reserve inside focus space without moving the picker/date geometry.
No hitSlop was added. The old target bounds were already separate; touching
backgrounds caused the apparent overlap.

Inclusive drafts, Cancel/Apply, future-day disabling and invalid-range handling
are retained. Other report-control callers inherit this visual refinement and
keep their existing callbacks, including Analytics report fetching. History
grouping, rows, loaded scope, local filters/sorts, queries, store and polling
are unchanged; no service, schema, migration or production change was made.
Eight migrations remain staging-only.

Final typecheck, changed-file ESLint and 44 tests/three suites passed, including
23 native route imports. `check-kitchen-history-hitboxes.cjs` and
`history-hitboxes-results.json` retain 20 mocked captures: trigger hover,
picker hover, calendar hover and calendar focus at 1440×900, 800×700, 390×844,
320×700 and 370×668. The run fulfilled 61 cloud-targeted requests locally,
forwarded zero and reported no page errors/unexpected hosts or History filter
requests. It measured disjoint date targets (0.1px tolerance), widths at least
44px, 48px heights, 2px chip insets, 4px gaps and stable focus geometry; it also
checked Cancel draft reset, Apply/Clear, status and entry-date sorting.

The existing staging calendar was opened and Cancelled only, without Apply,
Refresh or writes. `history-hitboxes-live-calendar.png` is 369×668 (the live
DOM reported 370×668); the user's tab and server were preserved. The fresh
independent review in `history-hitboxes-finish-review.md` inspected all 21
images and all five contract sections and returned **Ship**, with no material
fixes or recaptures. One batched implementation visual round and the fresh
review completed this scoped refinement.

Comparison with PRODUCT.md, DESIGN.md, `.impeccable/design.json`, brand tokens,
Typography, shared Kitchen controls and desktop/phone captures preserves
Source Sans 3, POS blue/Canvas and ledger density. Design files and tokens
remain untouched; the previously recorded system-sans/specimen, choice-chip,
navigation and early-contract drift remains disclosed without repair. Captures
are screenshot evidence, not shipping raster assets. The HTML/CSS detector was
not applied to React Native source. Native hardware, text scaling, soft
keyboards, dark appearance and gestures remain unverified.

## Compact phone filters (task 183)

At task 183, below 640px, expanded Filters used five full-width inline label/value rows
with 44px minimum heights, 6px gaps and 8px panel padding. Redundant headings
are omitted; the date divider and full picker/accessibility names remain.
Short helper text preserves transaction/recorded/India-time meaning. Any dates
means no date filter within the disclosed 500-entry/92-transaction-day window.
Long choices wrap; the nonshrinking inline selector wrapper prevents crowding.
Desktop/tablet grouped 48px controls remain. Only History and the two report
controls changed; optional inline props preserve shared defaults. Local
filters/sorts, date drafts, Cancel/Apply, rows, details and scope remain intact.

Final typecheck, changed-source ESLint and 44 tests/three suites passed,
including 23 native route imports. `check-kitchen-history-mobile-filters.cjs`
and `history-mobile-filters-results.json` retain 33 mocked captures: six states
at 1440×900, 800×700, 390×844, 320×700 and 370×668, plus phone loading/empty/error.
The run fulfilled 100 cloud-targeted requests locally, forwarded zero and
reported no errors, unexpected hosts, writes or History filter requests.
Scope, overflow, targets, wrapping and existing flows were checked, including
date application. The `-dates` images show scrolled triggers, not a calendar.

The existing staging default panel measured 294.4px versus the prior 546.4px,
46.1% shorter. `history-mobile-filters-live.png` is 369×668; its DOM reported
370×668. Only part of the first history row is visible at that short height.
Long choices and ranges can increase height. No live Refresh, Apply or write
occurred. This default capture preceded the wrapper correction, verified by
final mocked long-staff captures. Two build inspection batches included that
correction; fresh review inspected all 34 images and five contract sections
and returned **Ship** without material fixes, recapture or rebuild;
see `.impeccable/review/history-mobile-filters-finish-review.md`.

Incumbent comparison with PRODUCT, DESIGN, design.json, brand, Typography,
shared controls and representative captures preserves Source Sans 3, POS
blue/Canvas and ledger density. Design files/tokens and the previously
disclosed drift remain untouched. Harness/results/review/captures are ignored
local QA, with no shipping assets. No service/query/store/polling/schema,
migration or production change; eight migrations remain staging-only. No
HTML/CSS detector was used for React Native. Native hardware, text scaling,
soft keyboards, dark appearance and gestures remain unverified; browser
44px/6px checks do not establish Android 48dp/8dp conformance.

## Compact filter exploration (task 184 · 2026-10-11 · preview only)

The conversation preview offers Balanced grid (recommended: Type/Status/Staff/
Date basis in 2×2, full-width date range), Paired rows (full-width staff for
long names) and Filter sheet (2×2 plus dates, Done/Close). Width choices are
320/370/390px. Source Sans 3, POS blue and Kitchen Canvas retain incumbent
authority; host-following dark rendering is illustrative only. Four entries
labelled Sample and October 1–10 dates are static fixtures. Selection was
pending at presentation, with task 183 then the latest implementation. The
subsequent Filter sheet selection is implemented in task 185 below.

Artifact: `C:/Users/Might/.codex/visualizations/2026/10/05/01a10c91-a0ad-7b12-9c39-3f9dc9598875/history-filter-designs.html`.
Ignored local QA in `.impeccable/review/history-filter-design-results.json`
retains 12 captures and checks selectors, wrapping, date validation/application,
same/cross-month/year labels, reset/search, carousel, narrow and dark mock
states. It reports zero Supabase requests, errors, blocked requests, overflow
or sub-44px controls; fonts were fulfilled locally and three static Unpkg
requests were allowed. The initial HTML/CSS detector returned `[]`/exit 0.
`history-filter-design-previews-finish-review.md` records **Ship for presenting
the previews**: the sole date-label fix is resolved with no fix-induced visual
regression. This is a fix-list verdict, not fresh whole-surface approval.

Mock panel heights and sample rows establish no real-app height reduction or
phone capacity. No staging session, application/source/query/schema/deployment
changed; no app typecheck/full suite was needed. PRODUCT.md, DESIGN.md,
design.json, brand tokens and documented drift remain untouched. QA screenshots
are not shipping raster assets; native application behavior remains unverified.

## Selected phone Filter sheet (task 185 · 2026-10-11 · staging)

The user selected “the filter sheet makes more sense i believe” after task 184.
Below 640px, Filters now opens above History without moving its list position.
Type, Status, Entered by and Date basis form a 2×2 grid with naturally wrapping
values; the date range spans the width. Done, Close, backdrop and platform Back
only dismiss, retaining immediate local choices. Reset clears the existing
filter/search fields and restores defaults while keeping the chosen sort.
Dates retain separate Cancel/Apply drafts and Clear dates. Any dates still
means no date filter inside the disclosed loaded window.

`HistoryFilterSheet.tsx` uses a bounded ScrollView for four fixed controls and
dates, with no mapped list. This avoids nested virtualized-list context that
prevented web picker/calendar scrolling; the real record, picker and calendar
lists remain FlatList. Close and footer actions are 48px with 8px gaps and
safe-area padding. At 390×420, the form scrolls and Done stays visible at
y=360 with height 48px in open/long-staff/dates states. Desktop/tablet inline
groups, toolbar, audit rows, shared control meanings and local bounded
filter/sort behavior remain. The checked 640px transition preserves disclosure;
the existing tablet navigation-shell remount resets local screen state and is
outside this task's persistence guarantee.

Typecheck, changed-file ESLint and 44 tests/three suites passed, including 23
native route imports. Forty-five named final-source captures cover seven states
at 1440×900, 800×700, 390×844, 320×700, the user's 370×668 and short 390×420,
plus phone loading/empty/error. Five viewport batches completed before staging
stopped at the sixth navigation. The resumed short-phone/breakpoint/state batch
passed: 61 cloud-targeted requests mocked locally, zero forwarded, no page
errors or unexpected hosts. That count applies only to the resumed batch;
the earlier aggregate was not persisted. This was a split run over identical
final source, not an uninterrupted matrix run. Local filters/sorts/reset/search,
audit details, date drafts/application, dismissal, targets and overflow were
checked without filter fetches. Retained evidence is
`.impeccable/review/history-filter-sheet-{results.json,browser.log,interruption.log,typecheck.log,lint.log,tests.log}`
and the named captures.

Fresh independent `history-filter-sheet-finish-review.md` inspected all 45
originals and final source and returned **Ship**, scoped to staging browser
composition and inspected React Native source, with no material fixes.
Comparison with PRODUCT, DESIGN, design.json, brand and the source preserves
Source Sans 3, POS blue/Canvas, quiet outlines and existing reported drift.
DESIGN.md, `.impeccable/design.json` and brand.ts SHA-256 values match the
handoff baselines; no new design world, token or shipping raster was introduced.

Staging restarted on localhost:8081 (API 8083). No live browser QA was undertaken
because the usage baseline was old; the mocked zero-forwarded claim excludes
the existing staging/HMR session. No service/store/polling/schema, migration or
production change; eight migrations remain staging-only. No HTML/CSS detector
ran on native source. Native hardware/simulator/emulator appearance, soft
keyboard, text scaling, dark appearance, Reduce Motion and physical/predictive
Back gestures remain unverified. Safe-area and Back source handling are not
device certification; the unchanged date trigger's 44px minimum does not
establish Android-wide 48dp conformance.
